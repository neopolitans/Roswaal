/** Indexed, query-friendly view over a NodeScript. Built once per compile. */

import { resolveNodePins } from "../nodes/index.js";
import type { GraphNode, Link, NodeDef, NodeScript, PinDef } from "../schema.js";
import { splitPinId } from "../structs.js";

export interface ResolvedNode {
	node: GraphNode;
	def: NodeDef;
	/** The pins wires attach to: split struct pins appear as their components. */
	inputs: PinDef[];
	outputs: PinDef[];
	/**
	 * The pins the node's own templates talk about, before any splitting.
	 *
	 * `$in.position` names a pin that may no longer be wireable, because the
	 * instance split it into `position.x`, `position.y`, `position.z`. The
	 * emitter resolves values against these and wires against the pair above.
	 */
	baseInputs: PinDef[];
	baseOutputs: PinDef[];
}

export class GraphIndex {
	readonly script: NodeScript;
	private byId = new Map<string, ResolvedNode>();
	/** Input pin "node/pin" -> the single link feeding it. */
	private inLink = new Map<string, Link>();
	/** Output pin "node/pin" -> every link leaving it. */
	private outLinks = new Map<string, Link[]>();
	/** Split output "node/pin" -> every link leaving one of its parts. */
	private partLinks = new Map<string, Link[]>();
	/** Output pin "node/pin" -> its readers through knots, worked out once. */
	private readers = new Map<string, Link[]>();

	constructor(script: NodeScript, defs: Map<string, NodeDef>) {
		this.script = script;
		for (const node of script.nodes) {
			const def = defs.get(node.def);
			if (!def) continue; // reported by validate()
			this.byId.set(node.id, { node, def, ...resolveNodePins(def, node.config, node.literals) });
		}
		for (const link of script.links) {
			this.inLink.set(key(link.to.node, link.to.pin), link);
			append(this.outLinks, key(link.from.node, link.from.pin), link);
			const part = splitPinId(link.from.pin);
			if (part) append(this.partLinks, key(link.from.node, part.parent), link);
		}
	}

	get(id: string): ResolvedNode | undefined {
		return this.byId.get(id);
	}

	all(): ResolvedNode[] {
		return [...this.byId.values()];
	}

	pin(nodeId: string, pinId: string, dir: "in" | "out"): PinDef | undefined {
		const r = this.byId.get(nodeId);
		if (!r) return undefined;
		return (dir === "in" ? r.inputs : r.outputs).find((p) => p.id === pinId);
	}

	/** The link feeding an input pin, if any. Inputs accept at most one. */
	sourceOf(nodeId: string, pinId: string): Link | undefined {
		return this.inLink.get(key(nodeId, pinId));
	}

	/** Every link leaving an output pin. */
	targetsOf(nodeId: string, pinId: string): Link[] {
		return this.outLinks.get(key(nodeId, pinId)) ?? [];
	}

	/**
	 * The wires into the inputs that read this output, one per reader.
	 *
	 * Reroute knots are seen through: a wire into a knot stands for whatever the
	 * knot feeds. A knot is meant to be invisible, and it would not be if
	 * inserting one turned a value bound once into one evaluated twice, or
	 * stopped a result folding into the statement that names it.
	 *
	 * With `parts`, a split output's components count as reads of it too. When
	 * an output is split nothing wires to the pin itself — the wires are on
	 * `position.x` and friends — and an output whose parts are read is
	 * emphatically consumed.
	 *
	 * One answer for every question the emitter asks about readers: whether a
	 * step's result is read at all, whether a value is read more than once, and
	 * which statement its one reader is.
	 */
	readersOf(nodeId: string, pinId: string, options: { parts?: boolean } = {}): Link[] {
		const whole = this.wholeReaders(nodeId, pinId, 0);
		if (!options.parts) return whole;
		const parts = (this.partLinks.get(key(nodeId, pinId)) ?? []).flatMap((link) =>
			this.throughKnots(link, 0),
		);
		return [...whole, ...parts];
	}

	/** How many inputs read this output. See `readersOf`. */
	readerCount(nodeId: string, pinId: string, options: { parts?: boolean } = {}): number {
		return this.readersOf(nodeId, pinId, options).length;
	}

	private wholeReaders(nodeId: string, pinId: string, depth: number): Link[] {
		const k = key(nodeId, pinId);
		const known = this.readers.get(k);
		if (known) return known;
		const found = this.targetsOf(nodeId, pinId).flatMap((link) => this.throughKnots(link, depth));
		this.readers.set(k, found);
		return found;
	}

	/**
	 * The link itself, or what the knot it lands on feeds. A knot wired into
	 * itself is a graph error, not a reason to recurse forever; past the cap the
	 * knot is taken as the reader, which no real chain reaches.
	 */
	private throughKnots(link: Link, depth: number): Link[] {
		if (this.byId.get(link.to.node)?.def.id !== "flow.reroute" || depth > 64) return [link];
		return this.wholeReaders(link.to.node, "out", depth + 1);
	}

	/** The node fed by an exec output, if the pin is wired. */
	execTarget(nodeId: string, pinId: string): string | undefined {
		return this.targetsOf(nodeId, pinId)[0]?.to.node;
	}

	/** Nodes that begin a flow of execution and therefore anchor emission. */
	entryNodes(): ResolvedNode[] {
		return this.all()
			.filter((r) => r.def.role === "entry")
			.sort(
				(a, b) => a.node.y - b.node.y || a.node.x - b.node.x || a.node.id.localeCompare(b.node.id),
			);
	}
}

function key(nodeId: string, pinId: string): string {
	return `${nodeId}/${pinId}`;
}

function append(map: Map<string, Link[]>, k: string, link: Link): void {
	const list = map.get(k);
	if (list) list.push(link);
	else map.set(k, [link]);
}
