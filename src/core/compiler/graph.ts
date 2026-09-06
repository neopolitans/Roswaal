/** Indexed, query-friendly view over a NodeScript. Built once per compile. */

import type { GraphNode, Link, NodeDef, NodeScript, PinDef } from "../schema.js";
import { resolveNodePins } from "../nodes/index.js";
import { partPinId } from "../structs.js";

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

	constructor(script: NodeScript, defs: Map<string, NodeDef>) {
		this.script = script;
		for (const node of script.nodes) {
			const def = defs.get(node.def);
			if (!def) continue; // reported by validate()
			this.byId.set(node.id, { node, def, ...resolveNodePins(def, node.config) });
		}
		for (const link of script.links) {
			this.inLink.set(key(link.to.node, link.to.pin), link);
			const k = key(link.from.node, link.from.pin);
			const list = this.outLinks.get(k);
			if (list) list.push(link);
			else this.outLinks.set(k, [link]);
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
	 * How many inputs read this output. Drives the inline-vs-hoist decision:
	 * a pure value with one consumer is spliced in place, two or more is bound
	 * to a local so the expression is evaluated exactly once.
	 *
	 * Counts the components too. When an output is split, nothing wires to the
	 * pin itself — the wires are on `position.x` and friends — and an output
	 * whose parts are all being read is emphatically consumed.
	 */
	consumerCount(nodeId: string, pinId: string): number {
		let total = this.targetsOf(nodeId, pinId).length;
		const prefix = partPinId(pinId, "");
		for (const [k, links] of this.outLinks) {
			if (k.startsWith(`${nodeId}/${prefix}`)) total += links.length;
		}
		return total;
	}

	/** The node fed by an exec output, if the pin is wired. */
	execTarget(nodeId: string, pinId: string): string | undefined {
		return this.targetsOf(nodeId, pinId)[0]?.to.node;
	}

	/** Nodes that begin a flow of execution and therefore anchor emission. */
	entryNodes(): ResolvedNode[] {
		return this.all()
			.filter((r) => r.def.role === "entry")
			.sort((a, b) => a.node.y - b.node.y || a.node.x - b.node.x || a.node.id.localeCompare(b.node.id));
	}
}

export function key(nodeId: string, pinId: string): string {
	return `${nodeId}/${pinId}`;
}
