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

const TYPE_COLORS: Record<string, string> = {
	exec: "#d8dce4",
	any: "#9aa2af",
	wildcard: "#9aa2af",
	boolean: "#a4433a",
	number: "#4ba58a",
	string: "#a4569b",
	table: "#b08137",
	function: "#7159a8",
	Instance: "#4a80c0",
	Vector3: "#c0a13a",
	Vector2: "#c0a13a",
	CFrame: "#c07a3a",
	Color3: "#5aa8c0",
	UDim2: "#7a9a4a",
};

export function pinColor(type: string | undefined, kind: "exec" | "data"): string {
	if (kind === "exec") return TYPE_COLORS.exec;
	return TYPE_COLORS[type ?? "any"] ?? TYPE_COLORS.any;
}
