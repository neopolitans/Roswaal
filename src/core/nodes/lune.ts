/**
 * Lune's standard library, as two nodes.
 *
 * The reasoning is `src/core/luneCalls.ts`'s: one definition per function would
 * be sixty-odd palette entries and sixty-odd reference pages, and a release of
 * Roswaal between a developer and whatever Lune shipped last month. These two
 * read the catalogue instead, and the palette still knows every name.
 *
 * Both are `targets: ["lune"]` by their category, so neither appears in a
 * Roblox graph — `@lune/fs` is not something the engine has.
 */

import {
	callLabel, luneFunction, lunePins, moduleOf, callOf, LUNE_CALL, LUNE_VALUE,
} from "../luneCalls.js";
import type { NodeConfig, NodeDef } from "../schema.js";

/** The subtitle under the header: the call, as it will read in the file. */
const subtitle = (config: NodeConfig) => callLabel(config);

/**
 * What the node says it is before a call is picked.
 *
 * Named for the module rather than left blank, because a node dropped from the
 * menu already has one and a node dropped from the palette's generic entry
 * should say what it is waiting for.
 */
const label = (config: NodeConfig): string | undefined => {
	const call = callOf(config);
	return call === undefined ? undefined : `${moduleOf(config)}.${call}`;
};

export const LUNE_NODES: NodeDef[] = [
	{
		id: LUNE_CALL,
		title: "Lune Function",
		category: "Lune",
		summary:
			"Calls a function from Lune's standard library — `fs.writeFile`, `process.exec`. " +
			"Pick the call in the Inspector and the arguments arrive named and typed from " +
			"Lune's own signature. The module has to be declared: this node never writes a " +
			"`require` of its own.",
		inputs: [{ id: "in", name: "", kind: "exec" }],
		outputs: [{ id: "then", name: "", kind: "exec" }],
		compilesTo: { kind: "builtin", handler: "lune.call" },
		derivePins: (config: NodeConfig) => lunePins(config, false),
		defaultLabel: label,
		subtitle,
	},
	{
		/**
		 * The same call, where the point is the answer.
		 *
		 * Which functions land here is Lune's decision rather than one made
		 * here: it tags a function `must_use` when the value is the point, and
		 * that is the same line Roswaal draws between a pure node and a step.
		 */
		id: LUNE_VALUE,
		title: "Lune Function (Value)",
		category: "Lune",
		summary:
			"Asks Lune's standard library for a value — `fs.readFile`, `serde.decode`. No " +
			"execution pins, so it wires straight into whatever wanted the answer. The module " +
			"has to be declared, the same as the other one.",
		pure: true,
		inputs: [],
		outputs: [{ id: "result", name: "", kind: "data", type: "any" }],
		compilesTo: { kind: "builtin", handler: "lune.value" },
		derivePins: (config: NodeConfig) => lunePins(config, true),
		defaultLabel: label,
		subtitle,
	},
];

/** Whether a node id is one of these two, for the emitter and the menu. */
export const isLuneCall = (def: string): boolean => def === LUNE_CALL || def === LUNE_VALUE;

export { luneFunction };
