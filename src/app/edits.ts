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
import { modeOf, partPinId, splitKey, splitsOf, STRUCTS } from "../core/structs.js";
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

export function setLiteral(
	script: NodeScript, nodeId: string, pinId: string, value: Literal,
): NodeScript {
	return {
		...script,
		nodes: script.nodes.map((n) =>
			n.id === nodeId ? { ...n, literals: { ...(n.literals ?? {}), [pinId]: value } } : n,
		),
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

	if (outPin.kind !== inPin.kind) {
		return { ok: false, reason: "Execution and data wires cannot be joined." };
	}
	if (outPin.kind === "data" && !typesCompatible(outPin.type, inPin.type)) {
		return { ok: false, reason: `${outPin.type} does not fit a ${inPin.type} pin.` };
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
			if (node.def !== "variable.get" && node.def !== "variable.set") return node;
			if ((node.config as { variable?: string } | undefined)?.variable !== id) return node;
			return { ...node, config: { ...node.config, name: updated.name, type: updated.type } };
		}),
	});
}

/** How many nodes read or write this variable. Shown before deleting one. */
export function variableUsageCount(script: NodeScript, id: string): number {
	return script.nodes.filter(
		(n) =>
			(n.def === "variable.get" || n.def === "variable.set") &&
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
	script: NodeScript, nodeId: string, side: "in" | "out", pinId: string, mode: string,
): NodeScript {
	const node = script.nodes.find((n) => n.id === nodeId);
	if (!node) return script;

	const splits = { ...splitsOf(node.config), [splitKey(side, pinId)]: mode };
	return dropLinksOn(
		{
			...script,
			nodes: script.nodes.map((n) =>
				n.id === nodeId ? { ...n, config: { ...n.config, split: splits } } : n,
			),
		},
		nodeId, side, [pinId],
	);
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

	const parts = modeOf(STRUCTS, basePinOf(registry, node, side, pinId)?.type, mode)?.parts ?? [];

	return dropLinksOn(
		{
			...script,
			nodes: script.nodes.map((n) =>
				n.id === nodeId
					? { ...n, config: { ...n.config, split: Object.keys(splits).length ? splits : undefined } }
					: n,
			),
		},
		nodeId, side, parts.map((p) => partPinId(pinId, p.id)),
	);
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
	const type = rawType === WILDCARD ? ANY : rawType;
	const initial = target.literals?.[pin.id] ?? pin.default;

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
