/**
 * The two ends of a custom node's logic, when that logic is built from nodes.
 *
 * **Node Inputs** is where the logic starts: its outputs are the node's input
 * pins, and for an impure node an execution pin. **Node Outputs** is where it
 * ends: its inputs are the node's output pins. Both take their pins from the
 * node being designed, carried in their config, so adding a pin to the node
 * adds it here.
 *
 * Not part of the built-in library. They mean nothing in a script, so no graph's
 * palette offers them; only a logic graph's registry has them.
 */

import type { NodeConfig, NodeDef, PinDef } from "../schema.js";

export const LOGIC_INPUTS = "logic.inputs";
export const LOGIC_OUTPUTS = "logic.outputs";

/** The pins of the node whose logic this is. */
export interface LogicShape {
	/** A pure node's logic is values only, and has no execution pins at either end. */
	pure: boolean;
	inputs: { id: string; name: string; type?: string }[];
	outputs: { id: string; name: string; type?: string }[];
}

/** The shape as the two ends carry it in their config. */
export function shapeConfig(shape: LogicShape): NodeConfig {
	return { pure: shape.pure, inputs: shape.inputs, outputs: shape.outputs };
}

function shapeOf(config: NodeConfig): LogicShape {
	const list = (value: unknown) => (Array.isArray(value) ? (value as LogicShape["inputs"]) : []);
	return { pure: config.pure === true, inputs: list(config.inputs), outputs: list(config.outputs) };
}

const exec = (id: string): PinDef => ({ id, name: "", kind: "exec" });

export const LOGIC_NODES: NodeDef[] = [
	{
		id: LOGIC_INPUTS,
		title: "Node Inputs",
		category: "Node",
		summary: "Where the node's logic starts. Its outputs are the node's inputs.",
		role: "entry",
		inputs: [],
		outputs: [],
		compilesTo: { kind: "builtin", handler: LOGIC_INPUTS },
		derivePins(config: NodeConfig) {
			const shape = shapeOf(config);
			return {
				inputs: [],
				outputs: [
					...(shape.pure ? [] : [exec("then")]),
					...shape.inputs.map((p): PinDef => ({ id: p.id, name: p.name || p.id, kind: "data", type: p.type ?? "any" })),
				],
			};
		},
	},
	{
		id: LOGIC_OUTPUTS,
		title: "Node Outputs",
		category: "Node",
		summary: "Where the node's logic ends. Its inputs are the node's outputs.",
		role: "terminal",
		inputs: [],
		outputs: [],
		compilesTo: { kind: "builtin", handler: LOGIC_OUTPUTS },
		derivePins(config: NodeConfig) {
			const shape = shapeOf(config);
			return {
				inputs: [
					...(shape.pure ? [] : [exec("in")]),
					// Not required: an output nobody sets is nil, and `compileLogic`
					// says so as a warning rather than refusing the whole node.
					...shape.outputs.map((p): PinDef => ({
						id: p.id, name: p.name || p.id, kind: "data", type: p.type ?? "any", required: false,
					})),
				],
				outputs: [],
			};
		},
	},
];

/**
 * Nodes a logic graph may not hold, and why.
 *
 * A node's logic is spliced into somebody else's script, so anything that
 * belongs to a whole script — its start, its functions, its variables, its
 * exports, the top of its file — has nowhere to be.
 */
export const LOGIC_DENIED: ReadonlyMap<string, string> = new Map([
	["script.begin", "a node's logic starts at Node Inputs, not Script Start."],
	["script.end", "a node's logic ends at Node Outputs, not Script End."],
	["module.exports", "a node's logic is part of somebody else's script, so it has nothing to export."],
	["function.entry", "a function belongs to a whole script, not a node's logic."],
	["function.declareHere", "a function belongs to a whole script, not a node's logic."],
	["function.return", "it would return from the script the node is placed in."],
	["function.get", "a node's logic has no functions to read."],
	["function.getParam", "a node's logic reads its own inputs from Node Inputs."],
	["variable.get", "a node's logic has no script variables. Use a Declare Local."],
	["variable.set", "a node's logic has no script variables. Use a Declare Local."],
	["variable.init", "a node's logic has no script variables. Use a Declare Local."],
	["type.declareTop", "a hoisted type needs the top of a file, and a node's logic has none. Use Declare Type."],
]);
