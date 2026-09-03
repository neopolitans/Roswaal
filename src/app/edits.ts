/**
 * Pure graph transformations.
 *
 * Every one of these takes a script and returns a new script, which is what
 * lets undo be a stack of snapshots and keeps the interaction code in the
 * components free of graph bookkeeping.
 */

import type {
	Comment, GraphNode, Link, Literal, NodeDef, NodeScript, PinRef,
} from "../core/schema.js";
import type { Registry } from "../core/nodes/index.js";
import { nodeBounds, rectContains, type Rect } from "./geometry.js";
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

/** Removes wires whose pins no longer exist, e.g. after a signature change. */
export function dropDanglingLinks(script: NodeScript): NodeScript {
	const nodes = new Set(script.nodes.map((n) => n.id));
	const links = script.links.filter((l) => nodes.has(l.from.node) && nodes.has(l.to.node));
	return links.length === script.links.length ? script : { ...script, links };
}

function pinsOf(def: NodeDef, node: GraphNode) {
	return def.derivePins?.(node.config ?? {}) ?? { inputs: def.inputs, outputs: def.outputs };
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
