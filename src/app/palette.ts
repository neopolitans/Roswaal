/**
 * Node and pin colours.
 *
 * Category drives the header colour, with one override that matters: anything
 * that starts or ends a flow of logic is red, whatever category it is in. That
 * is the fastest way to read a graph — you find the entry points first.
 */

import type { NodeDef } from "../core/schema.js";

const FLOW_RED = "#a93b2c";

const CATEGORY_COLORS: Record<string, string> = {
	Flow: "#5a6474",
	Events: "#a1622c",
	Variables: "#2f6f8f",
	Values: "#3a7a5c",
	Math: "#43689b",
	Logic: "#575a9e",
	Strings: "#84509b",
	Tables: "#9a6c36",
	Roblox: "#2c7676",
	Modules: "#6f4f9b",
	Time: "#65852c",
	Debug: "#6d7480",
	Custom: "#4f6480",
};

export function nodeColor(def: NodeDef): string {
	if (def.role === "entry" || def.role === "terminal") return FLOW_RED;
	return CATEGORY_COLORS[def.category] ?? CATEGORY_COLORS.Custom;
}

/** True for nodes that begin or end a flow, which the brief wants in red. */
export function isFlowBoundary(def: NodeDef): boolean {
	return def.role === "entry" || def.role === "terminal";
}

/**
 * Pin colours, kept close to Unreal's where the types line up. A developer
 * coming from Blueprints should be able to read a Roswaal graph by colour
 * without being told the mapping: red is a boolean, green is a number, magenta
 * is a string, blue is an object, gold is a vector.
 */
const TYPE_COLORS: Record<string, string> = {
	exec: "#e2e6ec",
	any: "#9aa2af",
	wildcard: "#9aa2af",
	boolean: "#8f2f2a",
	number: "#8fbf3f",
	string: "#c14bb0",
	// Luau tables are not Unreal arrays, so this one deliberately does not
	// borrow a colour that would imply they behave alike.
	table: "#c08a3a",
	function: "#5a4b9c",
	Instance: "#3fa0d8",
	Vector3: "#d6ae3c",
	Vector2: "#d6ae3c",
	CFrame: "#d4772e",
	Color3: "#48b8c4",
	UDim2: "#7a9a4a",
	RBXScriptSignal: "#c4453f",
	RBXScriptConnection: "#9c5a55",
};

export function pinColor(type: string | undefined, kind: "exec" | "data"): string {
	if (kind === "exec") return TYPE_COLORS.exec;
	return TYPE_COLORS[type ?? "any"] ?? TYPE_COLORS.any;
}
