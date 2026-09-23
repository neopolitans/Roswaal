/**
 * Pure graph transformations.
 *
 * Every one of these takes a script and returns a new script, which is what
 * lets undo be a stack of snapshots and keeps the interaction code in the
 * components free of graph bookkeeping.
 */

import type {
	Comment, GraphNode, Link, Literal, NodeDef, NodeScript, PinDef, PinRef, ScriptModule,
	ScriptVariable,
} from "../core/schema.js";
import { ANY, PAIR, WILDCARD } from "../core/schema.js";
import type { Registry } from "../core/nodes/index.js";
import { literalOnlyPins, resolveNodePins } from "../core/nodes/index.js";
import {
	decompose, modeOf, partPinId, splitKey, splitsOf, STRUCTS, type StructMode,
} from "../core/structs.js";
import { literalToLuau } from "../core/compiler/luau.js";
import { retypeReroutes } from "../core/reroutes.js";
import { pinsCompatible } from "../core/compiler/validate.js";
import { isInstanceClass, isSubclassOf } from "../core/roblox.js";
import { FUNCTION_NODES } from "../core/nodes/flow.js";
import {
	graphOf, placeIn, positionIn, viewOf, withFunctionGraphs, type GraphId,
} from "../core/functionGraph.js";
import { localNameOf, pinDefaultFor, pinTypeOf, type LocalRef } from "../core/nodes/variables.js";
import { currentArity, growthRule, type GrowthRule } from "../core/nodes/growth.js";
import {
	compactWidth, isReroute, nodeBounds, pinPosition, rectContains, type Rect, type Vec,
} from "./geometry.js";
import { NODE } from "./layers.js";
import { newId } from "./store.js";

export function addNode(
	script: NodeScript, def: NodeDef, x: number, y: number,
): { script: NodeScript; id: string } {
	const id = newId();
	const node: GraphNode = { id, def: def.id, x: Math.round(x), y: Math.round(y) };
	// Function and Connect nodes are useless with no signature, so seed one.
	if (FUNCTION_NODES.has(def.id)) node.config = { name: "newFunction", params: [], returns: [] };
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
		const first = script.nodes.find((n) => FUNCTION_NODES.has(n.def));
		node.config = first
			? { function: first.id, name: (first.config as { name?: string } | undefined)?.name ?? "function" }
			: {};
	}
	if (def.id === "local.get") {
		const first = script.nodes.find((n) => n.def === "local.declare");
		node.config = first ? { ...localRefFor(first) } : {};
	}

	// A dictionary's row is a Key Value Pair pin, and a pair pin has no literal
	// — so an unsplit row is one you cannot type into until you have found the
	// pin menu. Placed split, it reads as the Key and Value it always did.
	if (def.id === "table.dictionary") {
		node.config = { split: { [splitKey("in", "p0")]: "keyValue" } };
	}

	return { script: { ...script, nodes: [...script.nodes, node] }, id };
}

/** What a Get Local caches about the Declare Local it reads. */
export function localRefFor(node: Pick<GraphNode, "id" | "literals" | "label" | "config">): LocalRef {
	const declared = (node.config as { type?: string } | undefined)?.type;
	return { local: node.id, name: localNameOf(node), type: pinTypeOf(declared) };
}

/** Points a Get Local at a Declare Local. */
export function bindNodeToLocal(script: NodeScript, nodeId: string, localId: string): NodeScript {
	const target = script.nodes.find((n) => n.id === localId && n.def === "local.declare");
	if (!target) return script;
	return setConfig(script, nodeId, { ...localRefFor(target) });
}

/**
 * Refreshes the name and type cached on every Get Local.
 *
 * A capsule's label comes from its own config, the way a variable getter's
 * does, so renaming or retyping the Declare Local has to reach it or the graph
 * goes on showing what the local used to be called.
 */
export function syncLocalRefs(script: NodeScript): NodeScript {
	const locals = new Map(
		script.nodes.filter((n) => n.def === "local.declare").map((n) => [n.id, n]),
	);
	let changed = false;
	const nodes = script.nodes.map((node) => {
		if (node.def !== "local.get") return node;
		const ref = (node.config ?? {}) as LocalRef;
		const target = ref.local ? locals.get(ref.local) : undefined;
		if (!target) return node;
		const next = localRefFor(target);
		if (next.name === ref.name && next.type === ref.type) return node;
		changed = true;
		return { ...node, config: { ...node.config, ...next } };
	});
	return changed ? { ...script, nodes } : script;
}

/** Whether an edit to this node could change what a Get Local shows. */
function touchesLocal(script: NodeScript, nodeId: string): boolean {
	return script.nodes.some((n) => n.id === nodeId && n.def === "local.declare");
}

/**
 * The nodes whose statements an inlined value actually surfaces in.
 *
 * The walk goes forward along data wires and **stops at the first node that is
 * not pure**, because that node is the one with a line — its statement is where
 * the expression was spliced. A chain of pure nodes is walked through, since
 * none of them emitted anything either.
 *
 * Following every link instead would run off down the execution chain and mark
 * every statement after the one that used the value, which is a much larger and
 * quite untrue answer: the value does not appear in any of them.
 *
 * Visited-set guarded because this runs on the graph as it is — mid-edit, and
 * possibly containing the data-wire loop the compiler would refuse.
 *
 * Used by the selection preview, to find a pure node's line, and by completion,
 * to find where a Luau Expression runs.
 */
export function surfacesIn(script: NodeScript, registry: Registry, start: string): Set<string> {
	const found = new Set<string>();
	const walked = new Set<string>([start]);
	const queue = [start];

	while (queue.length > 0) {
		const id = queue.pop()!;
		for (const link of script.links) {
			if (link.from.node !== id) continue;

			const consumer = script.nodes.find((n) => n.id === link.to.node);
			if (!consumer) continue;
			const def = registry.get(consumer.def);

			if (def?.pure) {
				// Also inlined, so keep going: its own consumer holds the line.
				if (walked.has(consumer.id)) continue;
				walked.add(consumer.id);
				queue.push(consumer.id);
			} else {
				found.add(consumer.id);
			}
		}
	}
	return found;
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
	graph: GraphId = null,
): NodeScript {
	if (start.size === 0) return script;
	const at = (id: string, current: { x: number; y: number }) => {
		const from = start.get(id);
		return from ? { x: Math.round(from.x + dx), y: Math.round(from.y + dy) } : current;
	};

	return {
		...script,
		// A declaration is placed in the graph being dragged in, which for the
		// graph it opens is its second position.
		nodes: script.nodes.map((n) => (start.has(n.id) ? placeIn(n, graph, at(n.id, positionIn(n, graph))) : n)),
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
 * Lines a selection up by following its wires out from the anchor.
 *
 * The anchor — the first node picked — never moves. From there this walks the
 * wires between selected nodes, nearest first, and each node it reaches lines
 * up on the neighbour it was reached *from*. So a chain straightens hop by hop:
 * select a source, a knot and the node the knot feeds, and all of it comes out
 * flat even though the far end was never wired to the anchor.
 *
 * **It follows wires rather than the order you clicked**, which was the first
 * attempt and was wrong. Aligning each node to the most recent one already
 * placed means a chain only straightens if you happen to click it in order: with
 * source → knot → consumer picked as consumer, knot, source, the knot is placed
 * before the source is, so the source finds a wired neighbour and the consumer
 * never does. A marquee makes it worse, because then the order is whatever the
 * file happens to list. Which node is the anchor is the only thing the order
 * decides now.
 *
 * Where two nodes are wired, the **pins** are what line up, not the boxes — so
 * the wire between them comes out flat, which is what "level" meant when you
 * asked for it. A reroute knot is the case that needs it: it is a dot with both
 * pins at its centre, and its neighbour's input sits some way down a header, so
 * matching the boxes would leave every wire through it bent.
 *
 * A selected node with no wired path to the anchor has no pin to agree with, so
 * it takes the anchor's top edge.
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

	// Breadth-first, so a node reached two ways lines up on whichever neighbour
	// is closer to the anchor — the shorter the path, the less it has drifted.
	const placed = new Map<string, GraphNode>([[anchorId, anchor]]);
	const queue: string[] = [anchorId];

	while (queue.length > 0) {
		const id = queue.shift()!;
		const onto = placed.get(id)!;

		// Link order decides which neighbour is taken when two nodes are joined
		// more than once. Rare, and one of them has to win.
		for (const link of script.links) {
			const other =
				link.from.node === id ? link.to.node
				: link.to.node === id ? link.from.node
				: null;
			if (other === null || other === id || placed.has(other) || !ids.has(other)) continue;

			const node = byId.get(other);
			if (!node) continue;

			const dy = wiredOffset(onto, node, link, registry);
			placed.set(other, dy === null ? node : { ...node, y: Math.round(node.y + dy) });
			queue.push(other);
		}
	}

	for (const id of ids) {
		if (placed.has(id)) continue;
		const node = byId.get(id); // a comment, or something already gone
		if (node) placed.set(id, { ...node, y: anchor.y });
	}

	const moved = new Map(
		[...placed].filter(([id, node]) => node.y !== byId.get(id)!.y),
	);
	if (moved.size === 0) return script;
	return { ...script, nodes: script.nodes.map((n) => moved.get(n.id) ?? n) };
}

/**
 * How far `node` moves for one wire to `onto` to come out flat.
 *
 * Null when either end has no pin to measure — a link naming a pin the node no
 * longer has, which is a graph mid-repair rather than something to guess at.
 */
function wiredOffset(
	onto: GraphNode, node: GraphNode, link: Link, registry: Registry,
): number | null {
	const out = link.from.node === onto.id;
	const here = pinPosition(onto, registry, out ? link.from.pin : link.to.pin, out ? "out" : "in");
	const there = pinPosition(node, registry, out ? link.to.pin : link.from.pin, out ? "in" : "out");
	return here && there ? here.y - there.y : null;
}

/**
 * Deletes a selection, and the graph of every function in it.
 *
 * A function's graph is part of the function, so the two go together — a
 * graph left behind with no declaration would be nodes nothing can reach or
 * open. The editor asks first when that is more than the selection itself.
 */
export function deleteSelection(
	script: NodeScript, picked: ReadonlySet<string>, registry: Registry,
): NodeScript {
	if (picked.size === 0) return script;
	const ids = withFunctionGraphs(script, picked);
	const nodes = script.nodes.filter((n) => !ids.has(n.id));
	const live = new Set(nodes.map((n) => n.id));
	return retypeReroutes({
		...script,
		nodes,
		links: script.links.filter((l) => live.has(l.from.node) && live.has(l.to.node)),
		comments: script.comments.filter((c) => !ids.has(c.id)),
	}, registry);
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
	const next = {
		...script,
		nodes: script.nodes.map((n) => {
			if (n.id !== nodeId) return n;
			const literals = { ...(n.literals ?? {}) };
			if (value === undefined) delete literals[pinId];
			else literals[pinId] = value;
			return { ...n, literals };
		}),
	};
	return touchesLocal(script, nodeId) ? syncLocalRefs(next) : next;
}

export function setConfig(
	script: NodeScript, nodeId: string, config: Record<string, unknown>,
): NodeScript {
	const node = script.nodes.find((n) => n.id === nodeId);
	if (!node) return script;
	const next = { ...(node.config ?? {}), ...config };
	// Pins can disappear when a signature shrinks; their wires have to go too.
	const updated = dropDanglingLinks({
		...script,
		nodes: script.nodes.map((n) => (n.id === nodeId ? { ...n, config: next } : n)),
	});
	return node.def === "local.declare" ? syncLocalRefs(updated) : updated;
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

	/**
	 * Every Return **in the function's graph**, wired or not.
	 *
	 * This walked the execution wires out of the entry node, which reaches a
	 * Return only once something runs into it — so a Return placed first and
	 * wired second kept whatever signature it was born with, and editing the
	 * returns to fix it did nothing, because the walk could not see it either.
	 * A graph *is* the function's body, so membership is the honest test and it
	 * needs no wires to be true.
	 *
	 * A nested function's Returns belong to the nested function's graph, so
	 * they are not in this set — the same boundary the walk stopped at.
	 */
	const targets = new Set(
		script.nodes
			.filter((n) => n.def === "function.return" && graphOf(n) === entryId)
			.map((n) => n.id),
	);
	if (targets.size === 0) return script;

	return dropDanglingLinks({
		...script,
		nodes: script.nodes.map((n) =>
			targets.has(n.id) ? { ...n, config: { ...(n.config ?? {}), returns } } : n,
		),
	});
}

export function renameNode(script: NodeScript, nodeId: string, label: string): NodeScript {
	const next = {
		...script,
		nodes: script.nodes.map((n) => (n.id === nodeId ? { ...n, label: label || undefined } : n)),
	};
	// An unnamed Declare Local takes its label as its name.
	return touchesLocal(script, nodeId) ? syncLocalRefs(next) : next;
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export interface ConnectionCheck {
	ok: boolean;
	reason?: string;
}

/**
 * Could a wire from an output land on an input, judged from the pins alone?
 *
 * The half of `canConnect` that needs no graph, so it can be asked about a node
 * that does not exist yet — which is what narrowing the palette to nodes a
 * dragged wire could actually reach requires. `canConnect` calls it too, so the
 * menu cannot offer a node the canvas would then refuse.
 *
 * `from` is the output and `to` the input. It used to be whichever end was
 * dragged, which was fine while the rule was symmetric; a `Model` fitting an
 * `Instance` pin, and a pair fitting only a dictionary, are not.
 */
export function acceptsWire(from: PinDef, to: PinDef): boolean {
	if (from.kind !== to.kind) return false;
	if (from.kind === "exec") return true;
	return pinsCompatible(from, to);
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

/**
 * Whether a data wire the pin refuses can go in through a **Cast**, and to what.
 *
 * An `Instance` into a `Model` pin is refused because it is a claim about what
 * the value is, and Cast is the node that makes that claim out loud. Dropping
 * the wire there anyway is asking for exactly that claim, so the editor builds
 * the Cast rather than doing nothing — and the claim is on the canvas, where it
 * can be read, rather than written into the file unseen.
 *
 * A cast only goes down the hierarchy: the pin's class must derive from the
 * wire's. `Part` to `Model` is two classes that are never each other, and Luau
 * refuses that `::`, so it is refused here with the reason.
 *
 * `null` when there is nothing to cast: the wire fits already, or the refusal
 * is not about data types (an execution wire, a pin that must be typed in).
 */
export function castFor(
	script: NodeScript, registry: Registry, from: PinRef, to: PinRef,
): { type: string } | { reason: string } | null {
	if (canConnect(script, registry, from, to).ok) return null;
	const fromNode = script.nodes.find((n) => n.id === from.node);
	const toNode = script.nodes.find((n) => n.id === to.node);
	const fromDef = fromNode && registry.get(fromNode.def);
	const toDef = toNode && registry.get(toNode.def);
	if (!fromNode || !toNode || !fromDef || !toDef || from.node === to.node) return null;
	const outPin = pinsOf(fromDef, fromNode).outputs.find((p) => p.id === from.pin);
	const inPin = pinsOf(toDef, toNode).inputs.find((p) => p.id === to.pin);
	if (!outPin || !inPin || outPin.kind !== "data" || inPin.kind !== "data") return null;
	if (literalOnlyPins(toDef).has(inPin.id)) return null;

	const wire = outPin.type ?? ANY;
	const want = inPin.type ?? ANY;
	if (isInstanceClass(wire) && isInstanceClass(want)) {
		if (isSubclassOf(want, wire)) return { type: want };
		return { reason: `${wire} cannot be cast to ${want} due to incompatible classes.` };
	}
	return { reason: `${wire} does not fit a ${want} pin, and a Cast cannot make it one.` };
}

/**
 * Wires `from` into `to` through a new Cast to `type`, placed between them.
 * See `castFor`, which says whether it can and to what.
 */
export function connectThroughCast(
	script: NodeScript, registry: Registry, from: PinRef, to: PinRef, type: string,
): { script: NodeScript; id: string } | null {
	const fromNode = script.nodes.find((n) => n.id === from.node);
	const toNode = script.nodes.find((n) => n.id === to.node);
	if (!fromNode || !toNode || !registry.get("cast.as")) return null;

	const id = newId();
	const cast: GraphNode = {
		id,
		def: "cast.as",
		x: Math.round((fromNode.x + toNode.x) / 2),
		y: Math.round((fromNode.y + toNode.y) / 2),
		literals: { type: { t: "string", v: type } },
		...(toNode.graph ? { graph: toNode.graph } : {}),
	};
	const placed = { ...script, nodes: [...script.nodes, cast] };
	const into = connect(placed, registry, from, { node: id, pin: "value" });
	const out = connect(into, registry, { node: id, pin: "result" }, to);
	// Both halves or neither: a Cast left hanging off one end is litter.
	const joined = (a: PinRef, b: PinRef) => out.links.some((l) =>
		l.from.node === a.node && l.from.pin === a.pin && l.to.node === b.node && l.to.pin === b.pin);
	if (!joined(from, { node: id, pin: "value" }) || !joined({ node: id, pin: "result" }, to)) return null;
	return { script: out, id };
}

/**
 * The pin a wire dropped on this one really means.
 *
 * Usually itself. The exception is a **knot**, whose two pins are stacked at its
 * centre so that the wire enters and leaves at the same point. The drop lands on
 * whichever is painted last — which is the output, since that is the one drawn
 * second — whatever you were aiming at.
 *
 * So dragging an *output* onto a knot arrived at the knot's output, the sides
 * matched, and the drop was refused with nothing said. Dragging an input onto
 * the same knot worked, because it happened to land on the pin it needed. The
 * bug was therefore invisible half the time and looked like "knots sometimes do
 * not take wires" the rest.
 *
 * A knot has exactly one pin on each side and no choice to make, so the pin that
 * can take the wire is the pin that was meant. **Anything else keeps the pin you
 * dropped on**: a node with rows has pins you can aim at, and quietly landing a
 * wire on a different one is worse than refusing it.
 *
 * `null` means the drop is not this node's to take.
 */
export function wireLanding(
	node: GraphNode | undefined,
	registry: Registry,
	pin: PinDef,
	side: "in" | "out",
	from: "in" | "out",
): { pin: PinDef; side: "in" | "out" } | null {
	if (side !== from) return { pin, side };
	const def = node && registry.get(node.def);
	if (!node || !def || !isReroute(def)) return null;
	const wanted = from === "out" ? "in" : "out";
	const pins = resolveNodePins(def, node.config, node.literals);
	const other = (wanted === "in" ? pins.inputs : pins.outputs)[0];
	return other ? { pin: other, side: wanted } : null;
}

/**
 * Every input on a node a dragged wire could land on, in declaration order.
 *
 * `acceptsWire` judges two pins and knows nothing about the node, so on its own
 * it offered pins whose text is pasted into the source — a property name, a
 * method name — which `canConnect` then refused. The palette and the landing
 * rule both ask here, so neither offers a pin the canvas would turn down.
 */
export function landingPins(def: NodeDef, pins: PinDef[], from: PinDef, side: "in" | "out"): PinDef[] {
	const literal = side === "in" ? literalOnlyPins(def) : new Set<string>();
	return pins.filter(
		(pin) => !literal.has(pin.id) && (side === "in" ? acceptsWire(from, pin) : acceptsWire(pin, from)),
	);
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

	return retypeReroutes({ ...script, links: [...links, { id: newId(), from, to }] }, registry);
}

export function disconnectInput(script: NodeScript, to: PinRef): NodeScript {
	return {
		...script,
		links: script.links.filter((l) => !(l.to.node === to.node && l.to.pin === to.pin)),
	};
}

export function removeLink(
	script: NodeScript, linkId: string, registry: Registry,
): NodeScript {
	return retypeReroutes(
		{ ...script, links: script.links.filter((l) => l.id !== linkId) },
		registry,
	);
}

/**
 * Cuts every wire attached to one pin.
 *
 * An input has at most one, an execution output leads to one node, but a data
 * output can feed many — and clearing all of them is what "disconnect this
 * pin" means either way.
 */
export function disconnectPin(
	script: NodeScript, nodeId: string, pinId: string, side: "in" | "out", registry: Registry,
): NodeScript {
	const links = script.links.filter((l) => {
		const end = side === "in" ? l.to : l.from;
		return !(end.node === nodeId && end.pin === pinId);
	});
	return links.length === script.links.length
		? script
		: retypeReroutes({ ...script, links }, registry);
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

/**
 * A knot's type follows what it is carrying. The rule itself lives in core, so
 * the documentation's drawn graphs colour a knot the same way the canvas does.
 */
export { retypeReroutes } from "../core/reroutes.js";

/** A node's pins as its config derives them. */
function pinsOf(def: NodeDef, node: GraphNode) {
	return resolveNodePins(def, node.config, node.literals);
}

// ---------------------------------------------------------------------------
// Growing a node
// ---------------------------------------------------------------------------

// The rule itself lives in core, so the documentation can draw the same
// buttons the canvas does.
export { currentArity, growthRule, type GrowthRule } from "../core/nodes/growth.js";

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
	// A dictionary's new row arrives split, for the reason a placed one does.
	// The exception is a Key Value Pair being dropped on the node: that wire
	// wants the whole row, so the row stays whole and takes it — which is how
	// the drop gesture keeps working without the canvas knowing about pairs.
	const wholePair = def.id === "table.dictionary" && hint?.type === PAIR;
	const splitRow = def.id === "table.dictionary" && delta > 0 && !wholePair;

	if (rule.kind === "count") {
		const patch: Record<string, unknown> = { [rule.field]: next };
		if (splitRow) {
			const splits = { ...splitsOf(node.config) };
			for (let i = count; i < next; i++) splits[splitKey("in", `p${i}`)] = "keyValue";
			patch.split = splits;
		}
		updated = setConfig(script, nodeId, patch);
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
		if (FUNCTION_NODES.has(def.id)) updated = syncFunctionReturns(updated, nodeId);
		// The other way a signature's parameters change: the − on the node's own
		// header drops the last one, which the Inspector never sees. Taking a
		// parameter away leaves the nodes reading it pointing at nothing, which
		// `syncParamRefs` deliberately does not repair — `validate` names it
		// against the node instead of silently attaching it to a neighbour.
		if (rule.field === "params") updated = syncParamRefs(updated, nodeId, list, grown);
	}

	if (delta <= 0) return { script: updated };

	// A split row has no pin under its own id — only its parts — so a wire
	// dropped on the node lands on the new row's Value.
	const added = `${rule.prefix}${next - 1}`;
	return { script: updated, pin: splitRow ? partPinId(added, "value") : added };
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
		if (node && FUNCTION_NODES.has(node.def)) return id;
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
 * Membership is recomputed whenever a drag starts rather than stored, which
 * means a node dragged out of a comment is simply out: there is no stale list
 * to reconcile.
 */
export function commentContents(
	script: NodeScript, registry: Registry, commentId: string,
): Set<string> {
	const comment = script.comments.find((c) => c.id === commentId);
	if (!comment) return new Set<string>();
	return containedBy(viewOf(script, graphOf(comment)), registry, comment);
}

/**
 * What a comment is drawn around, **within the one graph it is drawn in**.
 *
 * The graph is the whole point of taking a view rather than the script. Every
 * graph of a file has its own coordinate space and they all start at the same
 * origin, so a comment in the nodescript's graph and a function's nodes can sit
 * at exactly the same numbers -- and asking `script.nodes` which of them a box
 * contains answers about all of them at once. That is how copying a comment in
 * Occupancy's own graph came back with three nodes from `value`.
 *
 * It was never only a copying bug: `commentContents` is what a comment **drag**
 * asks as well, and `placeNodes` moves whatever it is handed. So dragging a
 * comment could quietly rearrange a function's graph you were not looking at.
 *
 * `viewOf` is what knows how a node appears in a given graph -- which graphs it
 * is drawn in at all, and at which of its two positions -- so the answer comes
 * from the same place the canvas draws from rather than from a second guess.
 */
function containedBy(view: NodeScript, registry: Registry, comment: Comment): Set<string> {
	const out = new Set<string>();
	const box: Rect = { x: comment.x, y: comment.y, w: comment.w, h: comment.h };
	for (const node of view.nodes) {
		if (rectContains(box, nodeBounds(node, registry))) out.add(node.id);
	}
	for (const other of view.comments) {
		if (other.id === comment.id) continue;
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

/**
 * A variable's starting value.
 *
 * Every variable has one, so a type with no literal of its own falls back to
 * `nil` here. The rule underneath — `pinDefaultFor` — answers "nothing" for
 * those instead, because a *pin* with no default is a value the compiler asks
 * for rather than one it invents. Shared so a Return pin and a variable of the
 * same type start from the same literal.
 */
export function defaultLiteralFor(type: string): Literal {
	return pinDefaultFor(type) ?? { t: "nil" };
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
// Modules
// ---------------------------------------------------------------------------

/**
 * The same four operations a variable has, for the modules a script requires.
 *
 * Deliberately parallel rather than shared: a module and a variable are the
 * same *shape* — declared on the script, named by the author, referenced by
 * any number of nodes — and a reader who has understood one should find the
 * other where they expect it.
 */
export function addModule(
	script: NodeScript, name = "module", specifier = "",
): { script: NodeScript; id: string } {
	const id = newId();
	const taken = new Set((script.modules ?? []).map((m) => m.name));
	let unique = name;
	for (let i = 2; taken.has(unique); i++) unique = `${name}${i}`;

	return {
		script: { ...script, modules: [...(script.modules ?? []), { id, name: unique, specifier }] },
		id,
	};
}

/**
 * Updates a module, and refreshes the name cached on every Get Module pointing
 * at it.
 *
 * The same reason variables do it: pin derivation and the node's label only see
 * the node's own config, so without this a rename leaves the canvas showing a
 * name the panel no longer has.
 */
export function updateModule(
	script: NodeScript, id: string, patch: Partial<ScriptModule>,
): NodeScript {
	const existing = (script.modules ?? []).find((m) => m.id === id);
	if (!existing) return script;
	const updated: ScriptModule = { ...existing, ...patch };

	return {
		...script,
		modules: (script.modules ?? []).map((m) => (m.id === id ? updated : m)),
		nodes: script.nodes.map((node) => {
			if (node.def !== "module.get") return node;
			if ((node.config as { module?: string } | undefined)?.module !== id) return node;
			return { ...node, config: { ...node.config, module: id, name: updated.name } };
		}),
	};
}

/** How many Get Module nodes read this one. Shown before deleting it. */
export function moduleUsageCount(script: NodeScript, id: string): number {
	return script.nodes.filter(
		(n) => n.def === "module.get" && (n.config as { module?: string } | undefined)?.module === id,
	).length;
}

/**
 * Removes a module and leaves the pills that referenced it in place, which is
 * the same bargain `deleteVariable` makes: an error you can see and undo beats
 * nodes vanishing because a declaration went away.
 */
export function deleteModule(script: NodeScript, id: string): NodeScript {
	return { ...script, modules: (script.modules ?? []).filter((m) => m.id !== id) };
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
 * is no sensible way to fold three sources into it. The literals typed into
 * the components are kept, though — they cost nothing to carry and splitting
 * again brings them straight back.
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

	const basePin = basePinOf(registry, node, side, pinId);
	const struct = modeOf(STRUCTS, basePin?.type, mode);
	const parts = struct?.parts ?? [];
	// A pair has no literal of its own to fold back into: its `make` is
	// deliberately unreachable, so folding would write an error expression onto
	// the pin. The key and value typed into the parts are kept either way, and
	// splitting the row again brings them straight back.
	const foldable = struct !== undefined && basePin?.type !== PAIR;

	// Fold what was typed into the components back onto the whole pin. Without
	// this, splitting a Vector3, setting it to (0, 12, -4) and recombining
	// leaves you looking at Vector3.zero — which reads as the editor having
	// thrown the work away, because it had.
	const folded = side === "in" && foldable ? foldComponents(node, pinId, struct!) : undefined;

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
	const pins = resolveNodePins(def, node.config, node.literals);
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
 * Unconnected data inputs only. Promoting an output would mean splicing a Set
 * node into the execution chain and guessing where it goes — a guess that
 * changes what the script does. And promoting a pin that is already wired
 * would silently discard the wire. An unconnected input cannot surprise
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
 * The most-used entry in a node-graph pin menu, and the detail that makes it
 * worth having is that **the variable takes the value already typed into the
 * pin**. Promoting a literal you have spent ten minutes tuning must not reset
 * it to zero.
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
	// Either node that declares a function. Refusing a Declare Function here
	// meant the inspector offered it, took the click, and did nothing -- the
	// dropdown snapped back and there was no way to find out why.
	if (!entry || !FUNCTION_NODES.has(entry.def)) return script;
	const name = (entry.config as { name?: string } | undefined)?.name ?? "function";
	return setConfig(script, nodeId, { function: functionNodeId, name });
}

/** Refreshes the cached names on Get Function nodes after a rename. */
export function syncFunctionRefs(script: NodeScript): NodeScript {
	const names = new Map<string, string>();
	for (const node of script.nodes) {
		if (!FUNCTION_NODES.has(node.def)) continue;
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

/**
 * Keeps Get Parameter nodes pointing at the right parameter when a signature
 * is edited, and their cached types current.
 *
 * `ListEditor` rewrites the whole `params` array on every keystroke, so there
 * is no rename *event* to react to — only a before and an after. Rename,
 * reorder and deletion therefore have to be told apart by inference, and
 * getting that wrong is the worst shape of bug available here: the graph goes
 * on compiling and means something else.
 *
 * Comparing by position alone is not enough. Swapping two parameters looks
 * exactly like two renames, and acting on it would cross-repoint every
 * reference. So the discriminator is what became of the *names*:
 *
 * - **Renamed** — the old name is gone from the new list, and the name now at
 *   that position is one the old list did not have. Repoint.
 * - **Reordered** — every old name is still somewhere in the new list. Nothing
 *   to do: references are by name and are already right.
 * - **Deleted** — the old name is gone, but the position now holds a name that
 *   existed before. Left dangling on purpose, so `validate` reports it against
 *   the node instead of it silently attaching to a neighbour.
 */
export function syncParamRefs(
	script: NodeScript,
	ownerId: string,
	before: { name: string; type?: string }[],
	after: { name: string; type?: string }[],
): NodeScript {
	const wasNamed = new Set(before.map((p) => p.name));
	const isNamed = new Set(after.map((p) => p.name));

	const renames = new Map<string, string>();
	for (let i = 0; i < before.length; i++) {
		const was = before[i]?.name;
		const now = after[i]?.name;
		if (was === undefined || now === undefined || was === now) continue;
		// Still in the list somewhere: a reorder, and by-name references hold.
		if (isNamed.has(was)) continue;
		// This position now holds a name that already existed: a deletion shifted
		// the list up, and the two are not the same parameter.
		if (wasNamed.has(now)) continue;
		renames.set(was, now);
	}

	const typeOf = new Map(after.map((p) => [p.name, p.type]));

	let changed = false;
	const nodes = script.nodes.map((node) => {
		if (node.def !== "function.getParam") return node;
		const ref = (node.config ?? {}) as { function?: string; param?: string; type?: string };
		if (ref.function !== ownerId || ref.param === undefined) return node;

		const param = renames.get(ref.param) ?? ref.param;
		// Refreshed even when the name did not move: a parameter's *type* can
		// change on its own, and the capsule takes its pin colour from this.
		const type = typeOf.has(param) ? pinTypeOf(typeOf.get(param)) : ref.type;
		if (param === ref.param && type === ref.type) return node;

		changed = true;
		return { ...node, config: { ...node.config, param, type } };
	});

	return changed ? { ...script, nodes } : script;
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
 * A selection, plus everything a picked comment is drawn around.
 *
 * **A comment carries its contents, because that is what a comment does.**
 * Dragging one takes the nodes it encloses; the Inspector says so; and every
 * other thing you can do to a comment has meant the group rather than the box.
 * Copying was the exception, and copying a commented group gave you an empty
 * rectangle -- which then landed on top of whatever was already there and
 * enclosed *that*, so the one thing the box was sure to contain was the nodes
 * it was copied from.
 *
 * One pass is enough, and provably so: containment is transitive for
 * rectangles, so a comment inside a picked comment has its own contents inside
 * the picked one as well, and they are found by the same look.
 *
 * Only in this direction. A node that happens to sit inside a comment does not
 * bring the comment, exactly as dragging the node alone does not.
 */
export function withCommentContents(
	script: NodeScript, picked: ReadonlySet<string>, registry: Registry,
): Set<string> {
	const out = new Set(picked);
	// One view per graph rather than one per comment: two comments in the same
	// graph ask the same question of the same picture.
	const views = new Map<GraphId, NodeScript>();
	for (const id of picked) {
		const comment = script.comments.find((c) => c.id === id);
		if (!comment) continue;
		const graph = graphOf(comment);
		let view = views.get(graph);
		if (!view) {
			view = viewOf(script, graph);
			views.set(graph, view);
		}
		for (const member of containedBy(view, registry, comment)) out.add(member);
	}
	return out;
}

/**
 * Copies a selection, keeping only the wires with both ends inside it. A wire
 * to something that was not copied has nothing to reconnect to on paste.
 *
 * A function carries its graph, or pasting it would give a declaration with
 * nothing inside. A comment carries what it encloses -- see
 * `withCommentContents`.
 */
export function copySelection(
	script: NodeScript, picked: ReadonlySet<string>, registry: Registry,
): Clipping {
	const ids = withFunctionGraphs(script, withCommentContents(script, picked, registry));
	const nodes = script.nodes.filter((n) => ids.has(n.id));
	const inside = new Set(nodes.map((n) => n.id));
	return {
		nodes: nodes.map((n) => ({ ...n })),
		links: script.links.filter((l) => inside.has(l.from.node) && inside.has(l.to.node)),
		comments: script.comments.filter((c) => ids.has(c.id)).map((c) => ({ ...c })),
	};
}

/**
 * Where a paste lands.
 *
 * `at` is a world position for the clipping's **top-left corner** — the
 * smallest x and the smallest y across everything in it, comments included,
 * since a comment usually reaches further up and left than the nodes it
 * encloses and is part of what you are placing.
 *
 * Without one, the clipping keeps its old positions plus `offset`. That is the
 * fallback rather than the rule now, because landing beside the original is
 * what made a pasted **comment** enclose the originals as well as the copies:
 * membership is worked out from the geometry when a drag starts, so a copy
 * dropped on top of what it was copied from really does contain both.
 */
export interface PasteInto {
	at?: Vec;
	offset?: number;
}

/**
 * Pastes a clipping with fresh ids, at the pointer or offset from where it was
 * copied. See `PasteInto`.
 */
export function pasteClipping(
	script: NodeScript, clip: Clipping, into: PasteInto = {},
): { script: NodeScript; ids: string[] } {
	const offset = into.offset ?? 32;
	const remap = new Map<string, string>();
	for (const node of clip.nodes) remap.set(node.id, newId());
	for (const comment of clip.comments) remap.set(comment.id, newId());

	// Inside a pasted function stays inside the copy. Anything else was copied
	// from the graph on screen and lands in the one on screen, which the store
	// fills in for a node with no graph.
	const graphFor = (graph: string | undefined) => (graph !== undefined ? remap.get(graph) : undefined);

	/**
	 * Does this item land in the graph being pasted into?
	 *
	 * Everything does **except** what belongs to a function whose declaration is
	 * in this same clipping: that keeps its position in the copy's own graph,
	 * which is not the graph anybody is pointing at.
	 *
	 * Not `graph === undefined`, which is what this asked at first and is a
	 * different question — it is "was this copied from the nodescript's own
	 * graph". Copy anything while a **function's** graph is open and every item
	 * carries that function's id, so the answer was no for all of them, the set
	 * below came out empty, and the paste fell back to the offset. Which is to
	 * say: pasting at the pointer worked everywhere except the graphs most of
	 * the work happens in.
	 */
	const landsHere = (item: { graph?: string }) => graphFor(item.graph) === undefined;

	/**
	 * How far everything landing in this graph moves.
	 *
	 * A clipping with nothing landing here has no corner to place, so it falls
	 * back to the offset rather than to `at`, which would otherwise read as
	 * `-Infinity`.
	 */
	const landing = [...clip.nodes.filter(landsHere), ...clip.comments.filter(landsHere)];
	let dx = offset;
	let dy = offset;
	if (into.at && landing.length > 0) {
		dx = into.at.x - Math.min(...landing.map((i) => i.x));
		dy = into.at.y - Math.min(...landing.map((i) => i.y));
	}
	const nodes = clip.nodes.map((n) => {
		const { graph: _graph, ...rest } = n;
		const graph = graphFor(n.graph);
		const here = landsHere(n);
		return {
			...rest,
			...(graph !== undefined ? { graph } : {}),
			id: remap.get(n.id)!,
			x: n.x + (here ? dx : 0),
			y: n.y + (here ? dy : 0),
		};
	});
	const links = clip.links.map((l) => ({
		id: newId(),
		from: { node: remap.get(l.from.node)!, pin: l.from.pin },
		to: { node: remap.get(l.to.node)!, pin: l.to.pin },
	}));
	const comments = clip.comments.map((c) => {
		const { graph: _graph, ...rest } = c;
		const graph = graphFor(c.graph);
		const here = landsHere(c);
		return {
			...rest,
			...(graph !== undefined ? { graph } : {}),
			id: remap.get(c.id)!,
			x: c.x + (here ? dx : 0),
			y: c.y + (here ? dy : 0),
		};
	});

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
