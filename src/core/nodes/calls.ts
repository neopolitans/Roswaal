/**
 * Calling a function the graph knows, as two nodes.
 *
 * The reasoning is `src/core/scriptCalls.ts`'s: the function is held by the
 * node and its signature becomes the pins, so a call to `need` reads Parent,
 * Name and Class rather than three rows of Arg. A step and a value, as the
 * Service and Lune Function nodes are.
 */

import type { NodeConfig, NodeDef } from "../schema.js";
import {
	SCRIPT_CALL,
	SCRIPT_VALUE,
	scriptCallLabel,
	scriptCallPins,
	scriptCallSubtitle,
} from "../scriptCalls.js";

export const CALL_NODES: NodeDef[] = [
	{
		id: SCRIPT_CALL,
		title: "Script Function",
		category: "Modules",
		summary:
			"Calls a function this script declares, or one a module it requires exports. Its " +
			"pins are the function's own parameters and return values, and follow the " +
			"signature when it changes. Search for the function's name to place one.",
		inputs: scriptCallPins(undefined, false).inputs,
		outputs: scriptCallPins(undefined, false).outputs,
		compilesTo: { kind: "builtin", handler: "function.call" },
		derivePins: (config: NodeConfig) => scriptCallPins(config, false),
		defaultLabel: (config) => scriptCallLabel(config),
		subtitle: (config) => scriptCallSubtitle(config),
	},
	{
		id: SCRIPT_VALUE,
		title: "Script Function (Value)",
		category: "Modules",
		summary:
			"The same call where a value is wanted — inside a table, an argument, an " +
			"expression. No execution wire, and it gives the first return value.",
		pure: true,
		inputs: scriptCallPins(undefined, true).inputs,
		outputs: scriptCallPins(undefined, true).outputs,
		compilesTo: { kind: "builtin", handler: "function.call" },
		derivePins: (config: NodeConfig) => scriptCallPins(config, true),
		defaultLabel: (config) => scriptCallLabel(config),
		subtitle: (config) => scriptCallSubtitle(config),
	},
];
