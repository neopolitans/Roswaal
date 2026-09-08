/**
 * Pure graph transformations.
 *
 * Every one of these takes a script and returns a new script, which is what
 * lets undo be a stack of snapshots and keeps the interaction code in the
 * components free of graph bookkeeping.
 */

import type {
	Comment, GraphNode, Link, Literal, NodeDef, NodeScript, PinDef, PinRef, ScriptVariable,
} from "../core/schema.js";
import { ANY, WILDCARD } from "../core/schema.js";
import type { Registry } from "../core/nodes/index.js";
import { literalOnlyPins, resolveNodePins } from "../core/nodes/index.js";
import {
	decompose, modeOf, partPinId, splitKey, splitsOf, STRUCTS, type StructMode,
} from "../core/structs.js";
import { literalToLuau } from "../core/compiler/luau.js";
import { compactWidth, nodeBounds, pinPosition, rectContains, type Rect } from "./geometry.js";
import { NODE } from "./layers.js";
import { newId } from "./store.js";

export function addNode(
	script: NodeScript, def: NodeDef, x: number, y: number,
): { script: NodeScript; id: string } {
	const id = newId();
	const node: GraphNode = { id, def: def.id, x: Math.round(x), y: Math.round(y) };
	// Function and Connect nodes are useless with no signature, so seed one.
	if (def.id === "function.entry") node.config = { name: "newFunction", params: [], returns: [] };
	if (def.id === "function.return") node.config = { returns: [] };
	if (def.id === "event.connect") node.config = { params: [] };

	// Reference nodes are useless until they point at something, so default them
	// to the first candidate rather than spawning an error.
	if (def.id === "variable.get" || def.id === "variable.set") {
		const first = script.variables[0];
		node.config = first
			? { variable: first.id, name: first.name, type: first.type }
			: {};
	}
	if (def.id === "function.get") {
		const first = script.nodes.find((n) => n.def === "function.entry");
		node.config = first
			? { function: first.id, name: (first.config as { name?: string } | undefined)?.name ?? "function" }
			: {};
	}

	return { script: { ...script, nodes: [...script.nodes, node] }, id };
}

export function moveNodes(
	script: NodeScript, ids: ReadonlySet<string>, dx: number, dy: number,
): NodeScript {
	if (ids.size === 0) return script;
	return {
		...script,
		nodes: script.nodes.map((n) => (ids.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
		comments: script.comments.map((c) =>
			ids.has(c.id) ? { ...c, x: c.x + dx, y: c.y + dy } : c,
		),
	};
}

/** Where a node or comment sat when a drag began. */
export interface Placement {
	x: number;
	y: number;
}

export function capturePlacements(
	script: NodeScript, ids: ReadonlySet<string>,
): Map<string, Placement> {
	const out = new Map<string, Placement>();
	for (const node of script.nodes) if (ids.has(node.id)) out.set(node.id, { x: node.x, y: node.y });
	for (const c of script.comments) if (ids.has(c.id)) out.set(c.id, { x: c.x, y: c.y });
	return out;
}

/**
 * Moves everything to its captured position plus one offset.
 *
 * Absolute rather than incremental: accumulating per-frame deltas drifts, and
 * snapping needs a fixed origin to snap against anyway.
 */
export function placeNodes(
	script: NodeScript, start: ReadonlyMap<string, Placement>, dx: number, dy: number,
): NodeScript {
	if (start.size === 0) return script;
	const at = (id: string, current: { x: number; y: number }) => {
		const from = start.get(id);
		return from ? { x: Math.round(from.x + dx), y: Math.round(from.y + dy) } : current;
	};

	return {
		...script,
		nodes: script.nodes.map((n) => (start.has(n.id) ? { ...n, ...at(n.id, n) } : n)),
		comments: script.comments.map((c) => (start.has(c.id) ? { ...c, ...at(c.id, c) } : c)),
	};
}

/**
 * The node a selection is anchored on: the first one that went into it.
 *
 * A selection is a `Set`, and a `Set` remembers the order things were added —
 * so this is the node you clicked before shift-clicking the rest, with no
 * separate bookkeeping to fall out of step with it. Comments are skipped: they
 * are in the same selection but have no pins to line anything up on.
 */
export function selectionAnchor(script: NodeScript, ids: ReadonlySet<string>): string | null {
	for (const id of ids) if (script.nodes.some((n) => n.id === id)) return id;
	return null;
}

/**
 * Lines a selection up, walking it in the order it was picked.
 *
 * The first node — the anchor — never moves. Each one after it lines up on the
 * **most recently picked node before it that it is wired to**; failing that, on
 * the one immediately before it. So a chain straightens link by link: select
 * the source, the knot and the node the knot feeds, and each hop lands flat
 * even though the far end was never wired to the anchor. A fan-out works too,
 * because the knot is still the most recent thing each of its consumers is
 * wired to.
 *
 * Where two nodes are wired, the **pins** are what line up, not the boxes — so
 * the wire between them comes out flat, which is what "level" meant when you
 * asked for it. A reroute knot is the case that needs it: it is a dot with both
 * pins at its centre, and its neighbour's input sits some way down a header, so
 * matching the boxes would leave every wire through it bent.
 *
 * Each node moves before the next one is considered, so a node aligning to its
 * predecessor aligns to where that predecessor has just been *put*, not where
 * it started. That is what makes the chain a chain rather than three
 * independent moves.
 *
 * **Only Y moves.** Wires run left to right, so a node's column is information
 * — shifting one sideways to tidy it up would say it happens somewhere it does
 * not. Comments do not move at all: one is a box drawn around nodes, and
 * sliding it off them to line it up with a node is not a tidy-up.
 */
export function alignToAnchor(
	script: NodeScript, registry: Registry, ids: ReadonlySet<string>, anchorId: string,
): NodeScript {
	const byId = new Map(script.nodes.map((n) => [n.id, n]));
	const anchor = byId.get(anchorId);
	if (!anchor) return script;

	// Where each node has been put so far, most recent last. A later node reads
	// these rather than the original script, so the chain compounds.
	const settled: GraphNode[] = [anchor];
	const moved = new Map<string, GraphNode>();

	for (const id of ids) {
		if (id === anchorId) continue;
		const node = byId.get(id);
		if (!node) continue; // a comment, or something already gone

		let placed: GraphNode | null = null;
		for (let i = settled.length - 1; i >= 0 && !placed; i--) {
			const dy = wiredOffset(script, registry, settled[i], node);
			if (dy !== null) placed = { ...node, y: Math.round(node.y + dy) };
		}
		// Wired to none of them: take the top edge of the one just before it,
		// which is the only reading of "line these up" left.
		placed ??= { ...node, y: settled[settled.length - 1].y };

		settled.push(placed);
		if (placed.y !== node.y) moved.set(id, placed);
	}

	if (moved.size === 0) return script;
	return { ...script, nodes: script.nodes.map((n) => moved.get(n.id) ?? n) };
}

/**
 * How far `node` moves to sit level with `onto`, or null if they are not wired.
 *
 * The first wire between the two decides it. Two nodes are rarely joined more
 * than once, and when they are, one of the wires has to win — taking the first
 * makes which one repeatable rather than picking by a rule nobody would guess.
 */
function wiredOffset(
	script: NodeScript, registry: Registry, onto: GraphNode, node: GraphNode,
): number | null {
	const link = script.links.find(
		(l) =>
			(l.from.node === onto.id && l.to.node === node.id) ||
			(l.from.node === node.id && l.to.node === onto.id),
	);
	if (!link) return null;

	const out = link.from.node === onto.id;
	const here = pinPosition(onto, registry, out ? link.from.pin : link.to.pin, out ? "out" : "in");
	const there = pinPosition(node, registry, out ? link.to.pin : link.from.pin, out ? "in" : "out");
	return here && there ? here.y - there.y : null;
}

export function deleteSelection(script: NodeScript, ids: ReadonlySet<string>): NodeScript {
	if (ids.size === 0) return script;
	const nodes = script.nodes.filter((n) => !ids.has(n.id));
	const live = new Set(nodes.map((n) => n.id));
	return {
		...script,
		nodes,
		links: script.links.filter((l) => live.has(l.from.node) && live.has(l.to.node)),
		comments: script.comments.filter((c) => !ids.has(c.id)),
	};
}

/**
 * Types a value into a pin, or — with `undefined` — takes it back out.
 *
 * Clearing matters for an **optional** pin, where "no literal" is a value in
 * its own right: the argument is dropped from the generated call rather than
 * passed as anything. Storing the default instead would emit it, which is the
 * one thing an optional pin exists to avoid. So the key is deleted rather than
 * set to the default, and a graph that never touched the pin and a graph that
 * touched it and changed its mind end up identical on disk.
 */
export function setLiteral(
	script: NodeScript, nodeId: string, pinId: string, value: Literal | undefined,
): NodeScript {
	return {
		...script,
		nodes: script.nodes.map((n) => {
			if (n.id !== nodeId) return n;
			const literals = { ...(n.literals ?? {}) };
			if (value === undefined) delete literals[pinId];
			else literals[pinId] = value;
			return { ...n, literals };
		}),
	};
}

export function setConfig(
	script: NodeScript, nodeId: string, config: Record<string, unknown>,
): NodeScript {
	const node = script.nodes.find((n) => n.id === nodeId);
	if (!node) return script;
	const next = { ...(node.config ?? {}), ...config };
	// Pins can disappear when a signature shrinks; their wires have to go too.
	return dropDanglingLinks({
		...script,
		nodes: script.nodes.map((n) => (n.id === nodeId ? { ...n, config: next } : n)),
	});
}

/**
 * Copies a function's return signature onto every Return node inside it.
 *
 * A Return node's pins have to match the function it belongs to, but it has no
 * way to ask — pin derivation only sees its own config. Rather than leave the
 * two to drift apart, editing the signature walks the function's execution
 * subtree and updates whatever it finds.
 */
export function syncFunctionReturns(script: NodeScript, entryId: string): NodeScript {
	const entry = script.nodes.find((n) => n.id === entryId);
	if (!entry) return script;
	const returns = (entry.config as { returns?: unknown } | undefined)?.returns ?? [];

	const execLinks = new Map<string, string[]>();
	for (const link of script.links) {
		const list = execLinks.get(link.from.node);
		if (list) list.push(link.to.node);
		else execLinks.set(link.from.node, [link.to.node]);
	}

	const seen = new Set<string>();
	const queue = [entryId];
	const targets = new Set<string>();
	while (queue.length) {
		const id = queue.pop()!;
		if (seen.has(id)) continue;
		seen.add(id);
		const node = script.nodes.find((n) => n.id === id);
		// A nested Function node starts its own scope; stop before crossing in.
		if (node?.def === "function.entry" && id !== entryId) continue;
		if (node?.def === "function.return") targets.add(id);
		queue.push(...(execLinks.get(id) ?? []));
	}
	if (targets.size === 0) return script;

	return dropDanglingLinks({
		...script,
		nodes: script.nodes.map((n) =>
			targets.has(n.id) ? { ...n, config: { ...(n.config ?? {}), returns } } : n,
		),
	});
}

export function renameNode(script: NodeScript, nodeId: string, label: string): NodeScript {
	return {
		...script,
		nodes: script.nodes.map((n) => (n.id === nodeId ? { ...n, label: label || undefined } : n)),
	};
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export interface ConnectionCheck {
	ok: boolean;
	reason?: string;
}

/** Whether a wire may be created, with a reason the UI can show if not. */
/**
 * Could a wire from one pin land on another, judged from the pins alone?
 *
 * The half of `canConnect` that needs no graph, so it can be asked about a node
 * that does not exist yet — which is what narrowing the palette to nodes a
 * dragged wire could actually reach requires. `canConnect` calls it too, so the
 * menu cannot offer a node the canvas would then refuse.
 *
 * Side is implied by the caller: `from` is whichever end is being dragged and
 * `to` is the candidate. Kind and type are symmetric, so this does not need to
 * know which is which.
 */
export function acceptsWire(from: PinDef, to: PinDef): boolean {
	if (from.kind !== to.kind) return false;
	if (from.kind === "exec") return true;
	return typesCompatible(from.type, to.type);
}

export function canConnect(
	script: NodeScript, registry: Registry, from: PinRef, to: PinRef,
): ConnectionCheck {
	if (from.node === to.node) return { ok: false, reason: "A node cannot wire into itself." };

	const fromNode = script.nodes.find((n) => n.id === from.node);
	const toNode = script.nodes.find((n) => n.id === to.node);
	if (!fromNode || !toNode) return { ok: false, reason: "Missing node." };

	const fromDef = registry.get(fromNode.def);
	const toDef = registry.get(toNode.def);
	if (!fromDef || !toDef) return { ok: false, reason: "Unknown node type." };

	const outPin = pinsOf(fromDef, fromNode).outputs.find((p) => p.id === from.pin);
	const inPin = pinsOf(toDef, toNode).inputs.find((p) => p.id === to.pin);
	if (!outPin || !inPin) return { ok: false, reason: "Missing pin." };

	if (!acceptsWire(outPin, inPin)) {
		return outPin.kind !== inPin.kind
			? { ok: false, reason: "Execution and data wires cannot be joined." }
			: { ok: false, reason: `${outPin.type} does not fit a ${inPin.type} pin.` };
	}
	// Some inputs are pasted into the generated source rather than evaluated —
	// a property name, a field. The emitter refuses a wired one, so refusing it
	// here means the wire is never made instead of made and then reported.
	if (literalOnlyPins(toDef).has(inPin.id)) {
		return {
			ok: false,
			reason:
				`"${inPin.name || inPin.id}" must be typed in directly; ` +
				"it becomes part of the generated code, not a runtime value.",
		};
	}
	return { ok: true };
}

function typesCompatible(a: string | undefined, b: string | undefined): boolean {
	const from = a ?? "any";
	const to = b ?? "any";
	if (from === to) return true;
	if (from === "any" || to === "any" || from === "wildcard" || to === "wildcard") return true;
	if ((from === "number" && to === "string") || (from === "string" && to === "number")) return true;
	return false;
}

/**
 * Adds a wire, displacing whatever occupied the target. An input takes one
 * wire and an execution output leads to one node, so connecting always
 * replaces rather than piling up — which is what makes rewiring feel direct.
 */
export function connect(
	script: NodeScript, registry: Registry, from: PinRef, to: PinRef,
): NodeScript {
	if (!canConnect(script, registry, from, to).ok) return script;

	const fromNode = script.nodes.find((n) => n.id === from.node)!;
	const fromDef = registry.get(fromNode.def)!;
	const isExec = pinsOf(fromDef, fromNode).outputs.find((p) => p.id === from.pin)?.kind === "exec";

	const links = script.links.filter((l) => {
		if (l.to.node === to.node && l.to.pin === to.pin) return false;
		if (isExec && l.from.node === from.node && l.from.pin === from.pin) return false;
		return true;
	});

	return { ...script, links: [...links, { id: newId(), from, to }] };
}

export function disconnectInput(script: NodeScript, to: PinRef): NodeScript {
	return {
		...script,
		links: script.links.filter((l) => !(l.to.node === to.node && l.to.pin === to.pin)),
	};
}

export function removeLink(script: NodeScript, linkId: string): NodeScript {
	return { ...script, links: script.links.filter((l) => l.id !== linkId) };
}

/**
 * Cuts every wire attached to one pin.
 *
 * An input has at most one, an execution output leads to one node, but a data
 * output can feed many — and clearing all of them is what "disconnect this
 * pin" means either way.
 */
export function disconnectPin(
	script: NodeScript, nodeId: string, pinId: string, side: "in" | "out",
): NodeScript {
	const links = script.links.filter((l) => {
		const end = side === "in" ? l.to : l.from;
		return !(end.node === nodeId && end.pin === pinId);
	});
	return links.length === script.links.length ? script : { ...script, links };
}

/** How many wires a pin currently carries. */
export function pinLinkCount(
	script: NodeScript, nodeId: string, pinId: string, side: "in" | "out",
): number {
	return script.links.filter((l) => {
		const end = side === "in" ? l.to : l.from;
		return end.node === nodeId && end.pin === pinId;
	}).length;
}

/**
 * Splits a wire around a new reroute knot at `at`.
 *
 * The knot takes the type of the wire it replaces, so the two halves stay the
 * same colour and the same rules apply either side of it. Nothing about the
 * generated code changes; this is purely a place for the wire to bend.
 */
export function insertReroute(
	script: NodeScript, registry: Registry, linkId: string, at: { x: number; y: number },
): { script: NodeScript; id: string } | null {
	const link = script.links.find((l) => l.id === linkId);
	if (!link) return null;

	const fromNode = script.nodes.find((n) => n.id === link.from.node);
	const fromDef = fromNode && registry.get(fromNode.def);
	if (!fromNode || !fromDef) return null;

	const pin = pinsOf(fromDef, fromNode).outputs.find((p) => p.id === link.from.pin);
	if (!pin) return null;

	const isExec = pin.kind === "exec";
	const def = registry.get(isExec ? "flow.rerouteExec" : "flow.reroute");
	if (!def) return null;

	const id = newId();
	const half = 11;
	const knot: GraphNode = {
		id,
		def: def.id,
		x: Math.round(at.x - half),
		y: Math.round(at.y - half),
		...(isExec ? {} : { config: { type: pin.type ?? "any" } }),
	};

	const inPin = isExec ? "in" : "in";
	const outPin = isExec ? "then" : "out";

	return {
		script: {
			...script,
			nodes: [...script.nodes, knot],
			links: [
				...script.links.filter((l) => l.id !== linkId),
				{ id: newId(), from: link.from, to: { node: id, pin: inPin } },
				{ id: newId(), from: { node: id, pin: outPin }, to: link.to },
			],
		},
		id,
	};
}

/** Removes wires whose pins no longer exist, e.g. after a signature change. */
export function dropDanglingLinks(script: NodeScript): NodeScript {
	const nodes = new Set(script.nodes.map((n) => n.id));
	const links = script.links.filter((l) => nodes.has(l.from.node) && nodes.has(l.to.node));
	return links.length === script.links.length ? script : { ...script, links };
}

function pinsOf(def: NodeDef, node: GraphNode) {
	return resolveNodePins(def, node.config);
}

// ---------------------------------------------------------------------------
// Growing a node
// ---------------------------------------------------------------------------

/**
 * How a node gains and loses input pins.
 *
 * Three shapes end up in the same place — an operator's arity, a call's
 * argument count, and a signature's list of entries — so they share one
 * description rather than three special cases scattered through the UI.
 */
export interface GrowthRule {
	/** Config key holding the count, or the list. */
	field: string;
	kind: "count" | "list";
	min: number;
	max: number;
	/** Pin id prefix, used to find the newest pin after growing. */
	prefix: string;
	label: string;
}

export function growthRule(def: NodeDef | undefined): GrowthRule | null {
	if (!def) return null;
	if (def.variadic) {
		return {
			field: "args", kind: "count", prefix: "a", label: "operands",
			min: def.variadic.min, max: def.variadic.max,
		};
	}
	switch (def.id) {
		case "call.function":
		case "call.method":
			return { field: "args", kind: "count", min: 0, max: 8, prefix: "a", label: "arguments" };
		case "flow.sequence":
			return { field: "count", kind: "count", min: 2, max: 12, prefix: "s", label: "outputs" };
		case "function.return":
			return { field: "returns", kind: "list", min: 0, max: 8, prefix: "r", label: "returns" };
		case "module.exports":
			return { field: "exports", kind: "list", min: 1, max: 16, prefix: "e", label: "exports" };
		case "function.entry":
			return { field: "params", kind: "list", min: 0, max: 8, prefix: "p", label: "parameters" };
		default:
			return null;
	}
}

export function currentArity(node: GraphNode, def: NodeDef | undefined, rule: GrowthRule): number {
	const config = (node.config ?? {}) as Record<string, unknown>;
	if (rule.kind === "list") return (config[rule.field] as unknown[] | undefined)?.length ?? 0;
	const fallback = def?.variadic?.min ?? rule.min;
	return Math.max(rule.min, Math.min(rule.max, Number(config[rule.field] ?? fallback)));
}

/**
 * Adds or removes one input. Returns the new script and, when one was added,
 * the id of the pin that appeared — so a wire dropped on the node can land on
 * it immediately.
 */
export function growNode(
	script: NodeScript, registry: Registry, nodeId: string, delta: number,
	hint?: { name?: string; type?: string },
): { script: NodeScript; pin?: string } {
	const node = script.nodes.find((n) => n.id === nodeId);
	const def = node && registry.get(node.def);
	const rule = growthRule(def);
	if (!node || !def || !rule) return { script };

	const count = currentArity(node, def, rule);
	const next = Math.max(rule.min, Math.min(rule.max, count + delta));
	if (next === count) return { script };

	let updated: NodeScript;
	if (rule.kind === "count") {
		updated = setConfig(script, nodeId, { [rule.field]: next });
	} else {
		const list = ((node.config ?? {})[rule.field] as { name: string; type?: string }[]) ?? [];
		const grown =
			delta > 0
				? [...list, { name: hint?.name ?? `${defaultEntryName(rule)}${list.length + 1}`, type: hint?.type ?? "any" }]
				: list.slice(0, -1);
		updated = setConfig(script, nodeId, { [rule.field]: grown });

		// A Return node's pins mirror its function's signature, so growing one
		// has to reach the entry rather than drifting from it.
		if (def.id === "function.return") {
			const owner = findOwningFunction(updated, nodeId);
			if (owner) updated = setConfig(updated, owner, { returns: grown });
		}
		if (def.id === "function.entry") updated = syncFunctionReturns(updated, nodeId);
	}

	return { script: updated, pin: delta > 0 ? `${rule.prefix}${next - 1}` : undefined };
}

function defaultEntryName(rule: GrowthRule): string {
	if (rule.field === "returns") return "value";
	if (rule.field === "exports") return "export";
	return "arg";
}

/**
 * The function entry whose execution subtree contains this node. Walks the
 * exec wires backwards, which is the only link a Return has to its function.
 */
export function findOwningFunction(script: NodeScript, nodeId: string): string | null {
	const incoming = new Map<string, string[]>();
	for (const link of script.links) {
		const list = incoming.get(link.to.node);
		if (list) list.push(link.from.node);
		else incoming.set(link.to.node, [link.from.node]);
	}

	const seen = new Set<string>();
	const queue = [nodeId];
	while (queue.length) {
		const id = queue.pop()!;
		if (seen.has(id)) continue;
		seen.add(id);
		const node = script.nodes.find((n) => n.id === id);
		if (node?.def === "function.entry") return id;
		queue.push(...(incoming.get(id) ?? []));
	}
	return null;
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export function addComment(script: NodeScript, rect: Rect, text = "Comment"): { script: NodeScript; id: string } {
	const id = newId();
	const comment: Comment = {
		id,
		x: Math.round(rect.x),
		y: Math.round(rect.y),
		w: Math.max(160, Math.round(rect.w)),
		h: Math.max(96, Math.round(rect.h)),
		text,
	};
	return { script: { ...script, comments: [...script.comments, comment] }, id };
}

export function updateComment(
	script: NodeScript, id: string, patch: Partial<Comment>,
): NodeScript {
	return {
		...script,
		comments: script.comments.map((c) => (c.id === id ? { ...c, ...patch } : c)),
	};
}

/**
 * The nodes and comments a comment currently encloses.
 *
 * Membership is recomputed whenever a drag starts rather than stored, which is
 * how Unreal behaves and means a node dragged out of a comment is simply out:
 * there is no stale list to reconcile.
 */
export function commentContents(
	script: NodeScript, registry: Registry, commentId: string,
): Set<string> {
	const comment = script.comments.find((c) => c.id === commentId);
	const out = new Set<string>();
	if (!comment) return out;

	const box: Rect = { x: comment.x, y: comment.y, w: comment.w, h: comment.h };
	for (const node of script.nodes) {
		if (rectContains(box, nodeBounds(node, registry))) out.add(node.id);
	}
	for (const other of script.comments) {
		if (other.id === commentId) continue;
		if (rectContains(box, { x: other.x, y: other.y, w: other.w, h: other.h })) out.add(other.id);
	}
	return out;
}

/**
 * Comments are drawn largest first so a small comment nested inside a big one
 * stays clickable, rather than being buried by the parent it sits in.
 */
export function commentsByArea(comments: Comment[]): Comment[] {
	return [...comments].sort((a, b) => b.w * b.h - a.w * a.h);
}

// ---------------------------------------------------------------------------
// Script variables
// ---------------------------------------------------------------------------

const DEFAULTS_BY_TYPE: Record<string, Literal> = {
	boolean: { t: "boolean", v: false },
	number: { t: "number", v: 0 },
	string: { t: "string", v: "" },
	table: { t: "raw", v: "{}" },
};

export function defaultLiteralFor(type: string): Literal {
	return DEFAULTS_BY_TYPE[type] ?? { t: "nil" };
}

/**
 * Every node that points at a script variable by id.
 *
 * One set rather than a condition repeated at each site, because it was three
 * of them and `variable.init` arriving made every one of them wrong at once: a
 * rename left the node showing the old name, the usage count said a variable
 * nothing used was safe to delete, and deleting it left a node pointing at
 * nothing.
 */
const VARIABLE_NODES = new Set(["variable.get", "variable.set", "variable.init"]);

export function addVariable(
	script: NodeScript, name = "newVariable", type = "number", initial?: Literal,
): { script: NodeScript; id: string } {
	const id = newId();
	const taken = new Set(script.variables.map((v) => v.name));
	let unique = name;
	for (let i = 2; taken.has(unique); i++) unique = `${name}${i}`;

	return {
		script: {
			...script,
			variables: [
				...script.variables,
				{ id, name: unique, type, default: initial ?? defaultLiteralFor(type) },
			],
		},
		id,
	};
}

/**
 * Updates a variable and refreshes the copy of its name and type cached on
 * every Get and Set node pointing at it. Pin derivation only sees a node's own
 * config, so without this a rename would leave the graph showing stale labels.
 */
export function updateVariable(
	script: NodeScript, id: string, patch: Partial<ScriptVariable>,
): NodeScript {
	const existing = script.variables.find((v) => v.id === id);
	if (!existing) return script;

	const updated: ScriptVariable = { ...existing, ...patch };
	// Retyping invalidates the old default, so replace it unless one was given.
	if (patch.type && patch.type !== existing.type && !patch.default) {
		updated.default = defaultLiteralFor(patch.type);
	}

	return dropDanglingLinks({
		...script,
		variables: script.variables.map((v) => (v.id === id ? updated : v)),
		nodes: script.nodes.map((node) => {
			if (!VARIABLE_NODES.has(node.def)) return node;
			if ((node.config as { variable?: string } | undefined)?.variable !== id) return node;
			return { ...node, config: { ...node.config, name: updated.name, type: updated.type } };
		}),
	});
}

/** How many nodes read or write this variable. Shown before deleting one. */
export function variableUsageCount(script: NodeScript, id: string): number {
	return script.nodes.filter(
		(n) =>
			VARIABLE_NODES.has(n.def) &&
			(n.config as { variable?: string } | undefined)?.variable === id,
	).length;
}

/**
 * Removes a variable but leaves the nodes that referenced it in place. They
 * report as errors, which is recoverable — silently deleting a user's nodes
 * because a name went away is not.
 */
export function deleteVariable(script: NodeScript, id: string): NodeScript {
	return { ...script, variables: script.variables.filter((v) => v.id !== id) };
}

// ---------------------------------------------------------------------------
// Splitting struct pins
// ---------------------------------------------------------------------------

/** The modes a pin can be split into, or empty if it is not a struct. */
export function splitModesFor(pin: PinDef): { id: string; name: string }[] {
	if (pin.kind !== "data" || pin.part) return [];
	const struct = STRUCTS.get(pin.type ?? "");
	if (!struct) return [];
	return Object.entries(struct.modes).map(([id, mode]) => ({ id, name: mode.name }));
}

/** The split currently applied to a pin, if any. */
export function splitModeOf(node: GraphNode, side: "in" | "out", pinId: string): string | undefined {
	return splitsOf(node.config)[splitKey(side, pinId)];
}

/**
 * Breaks a struct pin into one pin per component.
 *
 * The wire on the pin itself is dropped, because there is no longer a pin for
 * it to land on. That is worth doing loudly rather than quietly, so the caller
 * confirms first — see `splitCost`.
 */
export function splitPin(
	script: NodeScript, registry: Registry, nodeId: string, side: "in" | "out",
	pinId: string, mode: string,
): NodeScript {
	const node = script.nodes.find((n) => n.id === nodeId);
	if (!node) return script;

	const splits = { ...splitsOf(node.config), [splitKey(side, pinId)]: mode };
	// Carry the value across where it can be read back, so splitting a pin set
	// to (0, 12, -4) does not quietly start emitting (0, 0, 0).
	const spread = side === "in" ? spreadToComponents(registry, node, side, pinId, mode) : undefined;

	return dropLinksOn(
		{
			...script,
			nodes: script.nodes.map((n) =>
				n.id === nodeId
					? {
							...n,
							config: { ...n.config, split: splits },
							...(spread ? { literals: { ...n.literals, ...spread } } : {}),
						}
					: n,
			),
		},
		nodeId, side, [pinId],
	);
}

/** The component literals a pin's current value decomposes into, if it can. */
function spreadToComponents(
	registry: Registry, node: GraphNode, side: "in" | "out", pinId: string, mode: string,
): Record<string, Literal> | undefined {
	const pin = basePinOf(registry, node, side, pinId);
	const struct = modeOf(STRUCTS, pin?.type, mode);
	if (!pin || !struct) return undefined;

	const current = node.literals?.[pinId] ?? pin.default;
	if (!current || current.t !== "raw") return undefined;

	const parts = decompose(struct, current.v);
	if (!parts) return undefined;

	const out: Record<string, Literal> = {};
	for (const [id, v] of Object.entries(parts)) {
		out[partPinId(pinId, id)] = { t: "number", v };
	}
	return out;
}

/**
 * Why splitting this pin would change what the graph does, or null if it would
 * not.
 *
 * Three cases. A pin still holding the value its node declared splits into
 * components chosen to mean the same thing, so nothing changes. A value that
 * decomposes is carried across exactly. Anything else — an expression someone
 * wired in from a Luau Expression node, a constant nobody here wrote — cannot
 * be taken apart, and the honest thing is to say so before doing it rather than
 * after.
 */
export function splitValueWarning(
	script: NodeScript, registry: Registry, nodeId: string, side: "in" | "out",
	pinId: string, mode: string,
): string | null {
	if (side !== "in") return null;

	const node = script.nodes.find((n) => n.id === nodeId);
	if (!node) return null;

	const pin = basePinOf(registry, node, side, pinId);
	const struct = modeOf(STRUCTS, pin?.type, mode);
	if (!pin || !struct) return null;

	const typed = node.literals?.[pinId];
	// Untouched: the components' defaults were chosen to mean the same thing.
	if (!typed || typed.t !== "raw") return null;
	if (pin.default?.t === "raw" && pin.default.v === typed.v) return null;
	if (decompose(struct, typed.v)) return null;

	return typed.v;
}

/**
 * Puts a split pin back together.
 *
 * Wires on the components are dropped: the whole pin takes one wire and there
 * is no sensible way to fold three sources into it. Unreal does the same. The
 * literals typed into the components are kept, though — they cost nothing to
 * carry and splitting again brings them straight back.
 */
export function recombinePin(
	script: NodeScript, registry: Registry, nodeId: string, side: "in" | "out", pinId: string,
): NodeScript {
	const node = script.nodes.find((n) => n.id === nodeId);
	if (!node) return script;

	const splits = { ...splitsOf(node.config) };
	const mode = splits[splitKey(side, pinId)];
	if (mode === undefined) return script;
	delete splits[splitKey(side, pinId)];

	const struct = modeOf(STRUCTS, basePinOf(registry, node, side, pinId)?.type, mode);
	const parts = struct?.parts ?? [];

	// Fold what was typed into the components back onto the whole pin. Without
	// this, splitting a Vector3, setting it to (0, 12, -4) and recombining
	// leaves you looking at Vector3.zero — which reads as the editor having
	// thrown the work away, because it had.
	const folded = side === "in" && struct ? foldComponents(node, pinId, struct) : undefined;

	return dropLinksOn(
		{
			...script,
			nodes: script.nodes.map((n) =>
				n.id === nodeId
					? {
							...n,
							config: { ...n.config, split: Object.keys(splits).length ? splits : undefined },
							...(folded ? { literals: { ...n.literals, [pinId]: folded } } : {}),
						}
					: n,
			),
		},
		nodeId, side, parts.map((p) => partPinId(pinId, p.id)),
	);
}

/**
 * One literal for the whole pin, built from the components' literals.
 *
 * Rendered through `literalToLuau`, the emitter's own function, so the text
 * written onto the pin is exactly the text the emitter would have produced from
 * the split — recombining changes how the value is presented, never what it
 * compiles to.
 *
 * Two deliberate limits. A component that was **wired** contributes its default,
 * because a wire is not a value the editor can read; that wire is being dropped
 * either way, so folding what can be folded still beats losing everything. And
 * if no component was touched at all, nothing is written — a pin left alone
 * should come back reading `Vector3.zero`, not `Vector3.new(0, 0, 0)`.
 */
function foldComponents(
	node: GraphNode, pinId: string, mode: StructMode,
): Literal | undefined {
	const values = new Map<string, string>();
	let touched = false;

	for (const part of mode.parts) {
		const typed = node.literals?.[partPinId(pinId, part.id)];
		if (typed !== undefined) touched = true;
		values.set(part.id, literalToLuau(typed ?? part.default));
	}
	if (!touched) return undefined;

	return {
		t: "raw",
		v: mode.make.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, id: string) =>
			values.get(id) ?? match,
		),
	};
}

/** How many wires splitting or recombining this pin would drop. */
export function splitCost(
	script: NodeScript, registry: Registry, nodeId: string, side: "in" | "out", pinId: string,
): number {
	const node = script.nodes.find((n) => n.id === nodeId);
	if (!node) return 0;

	const mode = splitModeOf(node, side, pinId);
	if (mode === undefined) return pinLinkCount(script, nodeId, pinId, side);

	const parts = modeOf(STRUCTS, basePinOf(registry, node, side, pinId)?.type, mode)?.parts ?? [];
	return parts.reduce(
		(total, p) => total + pinLinkCount(script, nodeId, partPinId(pinId, p.id), side),
		0,
	);
}

/**
 * A pin as the node declares it, before splitting — which is where a struct
 * pin's type still lives once its components have replaced it.
 */
function basePinOf(
	registry: Registry, node: GraphNode, side: "in" | "out", pinId: string,
): PinDef | undefined {
	const def = registry.get(node.def);
	if (!def) return undefined;
	const pins = resolveNodePins(def, node.config);
	return (side === "in" ? pins.baseInputs : pins.baseOutputs).find((p) => p.id === pinId);
}

function dropLinksOn(
	script: NodeScript, nodeId: string, side: "in" | "out", pinIds: string[],
): NodeScript {
	const drop = new Set(pinIds);
	const links = script.links.filter((l) => {
		const end = side === "in" ? l.to : l.from;
		return !(end.node === nodeId && drop.has(end.pin));
	});
	return links.length === script.links.length ? script : { ...script, links };
}

/** Gap left between a promoted getter and the pin it feeds. */
const PROMOTE_GAP = 40;

/**
 * Whether a pin can be promoted to a script variable.
 *
 * Unconnected data inputs only. Unreal promotes outputs too, but that means
 * splicing a Set node into the execution chain and guessing where it goes — a
 * guess that changes what the script does. And promoting a pin that is already
 * wired would silently discard the wire. An unconnected input cannot surprise
 * anyone: the value it had is the value the variable starts with.
 *
 * A literal-only pin is excluded for the same reason it cannot be wired at all:
 * its text is pasted into the generated source, so there is nothing for a
 * variable to be read into.
 */
export function canPromoteToVariable(
	script: NodeScript, registry: Registry, nodeId: string, pin: PinDef, side: "in" | "out",
): boolean {
	if (side !== "in" || pin.kind !== "data") return false;
	if (!registry.has("variable.get")) return false;

	const node = script.nodes.find((n) => n.id === nodeId);
	const def = node && registry.get(node.def);
	if (!def || literalOnlyPins(def).has(pin.id)) return false;

	return pinLinkCount(script, nodeId, pin.id, "in") === 0;
}

/**
 * Promotes an unconnected data input to a script variable.
 *
 * The most-used entry in Unreal's pin menu, and the detail that makes it worth
 * having is that **the variable takes the value already typed into the pin**.
 * Promoting a literal you have spent ten minutes tuning must not reset it to
 * zero.
 *
 * The getter is placed so its output lands level with the pin it feeds rather
 * than at the pointer, so the wire comes out flat and the graph needs no
 * tidying afterwards.
 */
export function promoteToVariable(
	script: NodeScript, registry: Registry, nodeId: string, pin: PinDef,
): { script: NodeScript; variable: string; node: string } | null {
	if (!canPromoteToVariable(script, registry, nodeId, pin, "in")) return null;

	const target = script.nodes.find((n) => n.id === nodeId);
	const getterDef = registry.get("variable.get");
	if (!target || !getterDef) return null;

	const anchor = pinPosition(target, registry, pin.id, "in");
	if (!anchor) return null;

	// `wildcard` means "adopts what it is wired to", which a variable cannot be.
	const rawType = pin.type ?? ANY;
	const declared = rawType === WILDCARD ? ANY : rawType;
	const initial = target.literals?.[pin.id] ?? pin.default;

	/**
	 * What the value in the pin says, when the pin itself will not say.
	 *
	 * Some pins are `any` because Luau lets them be, not because nothing is
	 * known: a Branch condition takes any value because `nil` and `false` are
	 * the only false ones, and it still defaults to a boolean. Promoting one
	 * used to make a `boolean` variable and would now make an `any`, which is a
	 * worse variable for no reason — the literal sitting in the pin is better
	 * evidence than the pin's own type in exactly this case.
	 */
	const fromLiteral =
		initial?.t === "boolean" || initial?.t === "number" || initial?.t === "string"
			? initial.t
			: null;
	const type = declared === ANY && fromLiteral ? fromLiteral : declared;

	const withVariable = addVariable(script, variableNameFor(pin), type, initial);
	const variable = withVariable.script.variables.find((v) => v.id === withVariable.id)!;

	const config = { variable: variable.id, name: variable.name, type: variable.type };
	const getterId = newId();
	// Built at the origin first because the capsule's width is a function of the
	// label it ends up carrying, and the label comes from this config.
	const probe: GraphNode = { id: getterId, def: "variable.get", x: 0, y: 0, config };
	const width = compactWidth(getterDef, probe);

	const getter: GraphNode = {
		...probe,
		x: Math.round(anchor.x - PROMOTE_GAP - width),
		y: Math.round(anchor.y - NODE.compactHeight / 2),
	};

	const placed: NodeScript = {
		...withVariable.script,
		nodes: [...withVariable.script.nodes, getter],
	};

	const linked = connect(
		placed, registry,
		{ node: getterId, pin: "value" },
		{ node: nodeId, pin: pin.id },
	);

	return { script: linked, variable: variable.id, node: getterId };
}

/**
 * A variable name from a pin. The pin's display name reads better than its id
 * ("Instance" over "instance"), but it is prose — it can carry spaces and
 * punctuation that a Luau identifier cannot — so it is trimmed back to word
 * characters and lowercased at the front to match how the rest of the graph
 * names things.
 */
function variableNameFor(pin: PinDef): string {
	const source = (pin.name || pin.id).replace(/[^A-Za-z0-9]+/g, "");
	if (source === "") return "newVariable";
	const named = /^[0-9]/.test(source) ? `v${source}` : source;
	return named.charAt(0).toLowerCase() + named.slice(1);
}

/** Points a Get or Set node at a variable, caching what pin derivation needs. */
export function bindNodeToVariable(
	script: NodeScript, nodeId: string, variableId: string,
): NodeScript {
	const variable = script.variables.find((v) => v.id === variableId);
	if (!variable) return script;
	return setConfig(script, nodeId, {
		variable: variable.id,
		name: variable.name,
		type: variable.type,
	});
}

/** Points a Get Function node at a function entry node. */
export function bindNodeToFunction(
	script: NodeScript, nodeId: string, functionNodeId: string,
): NodeScript {
	const entry = script.nodes.find((n) => n.id === functionNodeId);
	if (!entry || entry.def !== "function.entry") return script;
	const name = (entry.config as { name?: string } | undefined)?.name ?? "function";
	return setConfig(script, nodeId, { function: functionNodeId, name });
}

/** Refreshes the cached names on Get Function nodes after a rename. */
export function syncFunctionRefs(script: NodeScript): NodeScript {
	const names = new Map<string, string>();
	for (const node of script.nodes) {
		if (node.def !== "function.entry") continue;
		names.set(node.id, (node.config as { name?: string } | undefined)?.name ?? "function");
	}
	return {
		...script,
		nodes: script.nodes.map((node) => {
			if (node.def !== "function.get") return node;
			const ref = node.config as { function?: string; name?: string } | undefined;
			const name = ref?.function ? names.get(ref.function) : undefined;
			if (!name || name === ref?.name) return node;
			return { ...node, config: { ...node.config, name } };
		}),
	};
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

export interface Clipping {
	nodes: GraphNode[];
	links: Link[];
	comments: Comment[];
}

/**
 * Copies a selection, keeping only the wires with both ends inside it. A wire
 * to something that was not copied has nothing to reconnect to on paste.
 */
export function copySelection(script: NodeScript, ids: ReadonlySet<string>): Clipping {
	const nodes = script.nodes.filter((n) => ids.has(n.id));
	const inside = new Set(nodes.map((n) => n.id));
	return {
		nodes: nodes.map((n) => ({ ...n })),
		links: script.links.filter((l) => inside.has(l.from.node) && inside.has(l.to.node)),
		comments: script.comments.filter((c) => ids.has(c.id)).map((c) => ({ ...c })),
	};
}

/**
 * Pastes a clipping with fresh ids, offset so it does not land exactly on top
 * of whatever it was copied from.
 */
export function pasteClipping(
	script: NodeScript, clip: Clipping, offset = 32,
): { script: NodeScript; ids: string[] } {
	const remap = new Map<string, string>();
	for (const node of clip.nodes) remap.set(node.id, newId());
	for (const comment of clip.comments) remap.set(comment.id, newId());

	const nodes = clip.nodes.map((n) => ({
		...n,
		id: remap.get(n.id)!,
		x: n.x + offset,
		y: n.y + offset,
	}));
	const links = clip.links.map((l) => ({
		id: newId(),
		from: { node: remap.get(l.from.node)!, pin: l.from.pin },
		to: { node: remap.get(l.to.node)!, pin: l.to.pin },
	}));
	const comments = clip.comments.map((c) => ({
		...c,
		id: remap.get(c.id)!,
		x: c.x + offset,
		y: c.y + offset,
	}));

	return {
		script: {
			...script,
			nodes: [...script.nodes, ...nodes],
			links: [...script.links, ...links],
			comments: [...script.comments, ...comments],
		},
		ids: [...remap.values()],
	};
}
