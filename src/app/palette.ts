/**
 * Node and pin colours.
 *
 * Category drives the header colour, with one override that matters: anything
 * that starts or ends a flow of logic is red, whatever category it is in. That
 * is the fastest way to read a graph — you find the entry points first.
 *
 * A function declaration is red wherever it sits. Declare Function is a step in
 * the flow rather than an entry point, but its Body is where a function starts,
 * and a graph read for its functions should find both kinds by colour.
 */

import { FUNCTION_NODES } from "../core/nodes/flow.js";
import type { NodeDef } from "../core/schema.js";

const FLOW_RED = "#a93b2c";

const CATEGORY_COLORS: Record<string, string> = {
	Flow: "#5a6474",
	Events: "#a1622c",
	Variables: "#2f6f8f",
	Values: "#3a7a5c",
	Math: "#43689b",
	/**
	 * The fallback for a datatype with no colour of its own below. Close to
	 * Math, because constructing a value is arithmetic's neighbour.
	 */
	"Engine Types": "#3c7f8f",
	Logic: "#575a9e",
	Strings: "#84509b",
	Tables: "#9a6c36",
	Roblox: "#2c7676",
	// Near Roblox, because reaching an instance and asking it a question are the
	// same job — but far enough apart that a graph full of one does not read as
	// the other.
	Instances: "#2f6f6a",
	Players: "#3d7a86",
	// Networking sits apart from the rest of Roblox on purpose: a graph that
	// crosses the client/server boundary is a graph to read carefully.
	Networking: "#8a4a5e",
	Modules: "#6f4f9b",
	// Near Modules, because every one of these is a call on a required module
	// and the two are used in the same breath -- and far enough from Roblox's
	// teals that a Lune graph does not read as an engine one.
	Lune: "#5b5fa6",
	Time: "#65852c",
	Threads: "#4a6f8a",
	Debug: "#6d7480",
	// Olive, away from the teals of the datatypes it produces: these are a
	// crossing point, not another kind of value.
	"Z-Up Conversions": "#6b7a3a",
	Custom: "#4f6480",
};

/**
 * Datatype colours, which beat the category colour when a node has one.
 *
 * Engine Types gathers every Roblox datatype under one heading, and grouping
 * them must not make them *look* like one thing — a graph doing CFrame work and
 * a graph doing colour work should still read differently at a glance. Vector3
 * and CFrame keep exactly the colours they had when Vectors and CFrames were
 * separate categories, so nobody's existing graph changed appearance when they
 * were folded in.
 *
 * Each is near its type's pin colour without matching it, so a node reads as
 * "about vectors" while the pin still reads as "is a vector".
 */
const SUBCATEGORY_COLORS: Record<string, string> = {
	Vector3: "#3c7f8f",
	Vector2: "#35707e",
	CFrame: "#8a5a2c",
	Color3: "#2f7f7a",
	// Warmer than Color3: a BrickColor is a name from a fixed palette, and the
	// two are constantly confused for each other in Roblox code.
	BrickColor: "#8a4f6b",
	UDim: "#5e7a3f",
	UDim2: "#6b8a45",
	// Tweening is the one group here that *does* something rather than
	// describing a value, so it sits apart from the rest.
	TweenInfo: "#7a5a9b",
	Tween: "#6a4f9b",
};

/**
 * Takes the fields it actually reads rather than a whole `NodeDef`, so the
 * documentation's node previews — which hold a description of a node, not the
 * definition itself — can be coloured by this function instead of by a copy of
 * these tables. A `NodeDef` satisfies the shape, so every existing call still
 * passes one.
 */
export function nodeColor(
	def: { id?: string; category: string; subcategory?: string; role?: string },
): string {
	if (def.role === "entry" || def.role === "terminal") return FLOW_RED;
	if (def.id !== undefined && FUNCTION_NODES.has(def.id)) return FLOW_RED;
	if (def.subcategory && SUBCATEGORY_COLORS[def.subcategory]) {
		return SUBCATEGORY_COLORS[def.subcategory];
	}
	return CATEGORY_COLORS[def.category] ?? CATEGORY_COLORS.Custom;
}

/** True for nodes that begin or end a flow, which the brief wants in red. */
export function isFlowBoundary(def: NodeDef): boolean {
	return def.role === "entry" || def.role === "terminal";
}

/**
 * Pin colours, kept close to the conventional node-graph ones where the types
 * line up. A developer arriving from another visual-scripting tool should be
 * able to read a Roswaal graph by colour without being told the mapping: red
 * is a boolean, green is a number, magenta is a string, blue is an object,
 * gold is a vector.
 */
const TYPE_COLORS: Record<string, string> = {
	exec: "#e2e6ec",
	any: "#9aa2af",
	wildcard: "#9aa2af",
	boolean: "#8f2f2a",
	number: "#8fbf3f",
	string: "#c14bb0",
	// Luau tables are not the arrays of other visual-scripting tools, so this
	// one deliberately does not borrow a colour that would imply they behave
	// alike.
	table: "#c08a3a",
	// One entry of a table: the table's colour, lighter, because it is part of one.
	pair: "#dcb27a",
	function: "#5a4b9c",
	// A thread is a function that remembers where it was.
	thread: "#7a5fae",
	// Hand-written Luau. Deliberately unlike `string`: the point of the type is
	// that this pin is not one.
	luau: "#b0763a",
	Instance: "#3fa0d8",
	Vector3: "#d6ae3c",
	Vector2: "#d6ae3c",
	CFrame: "#d4772e",
	Color3: "#48b8c4",
	// A BrickColor is not a Color3 and mixing them up is a common Roblox
	// mistake, so the two are deliberately not the same colour.
	BrickColor: "#c46a9c",
	UDim: "#7a9a4a",
	UDim2: "#7a9a4a",
	// A TweenInfo is a description; a Tween is a running thing. Near each other,
	// because they are always used together, and not identical.
	TweenInfo: "#a07fd0",
	Tween: "#8a63c4",
	RBXScriptSignal: "#c4453f",
	RBXScriptConnection: "#9c5a55",
};

export function pinColor(type: string | undefined, kind: "exec" | "data"): string {
	if (kind === "exec") return TYPE_COLORS.exec;
	return TYPE_COLORS[type ?? "any"] ?? TYPE_COLORS.any;
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/**
 * A comment's colour when it has not been given one.
 *
 * Here rather than in the canvas because three things need to agree about it
 * now: the canvas draws it, the Inspector shows which swatch is current, and
 * the documentation's pictures draw comments too.
 */
export const COMMENT_DEFAULT_COLOR = "6a8fbf";

/**
 * The colours a comment can be given, as hex without the hash.
 *
 * A short list rather than a colour picker, and that is the feature rather than
 * a shortcut. A comment's colour is a *grouping*: two comments the same colour
 * are saying they are about the same thing, and that only works while the
 * colours are few enough to tell apart and repeat exactly. A free picker gives
 * you nine blues nobody can match a fortnight later.
 *
 * Each is muted to roughly the same weight, because the canvas already has
 * saturated node headers on it and a comment is a background the graph sits on.
 * They are also deliberately not the node category colours: a comment is not a
 * kind of node, and a red one should not read as "flow".
 */
export const COMMENT_COLORS: { hex: string; name: string }[] = [
	{ hex: COMMENT_DEFAULT_COLOR, name: "Blue" },
	{ hex: "5f9e8a", name: "Green" },
	{ hex: "b08a4a", name: "Amber" },
	{ hex: "b06a6a", name: "Red" },
	{ hex: "9a76b8", name: "Violet" },
	{ hex: "4f9ab0", name: "Teal" },
	{ hex: "b0789c", name: "Pink" },
	{ hex: "7c848f", name: "Grey" },
];

/** A comment's colour as a CSS value, defaulting when it has none. */
export function commentColor(hex: string | undefined): string {
	return `#${hex ?? COMMENT_DEFAULT_COLOR}`;
}

/**
 * A hex colour typed in by hand, or nothing.
 *
 * Accepts the shorthand and the leading hash, because those are what somebody
 * pastes; stores the long form without one, which is what the schema says a
 * comment's colour is.
 */
export function readHexColor(text: string): string | undefined {
	const hex = text.trim().replace(/^#/, "").toLowerCase();
	if (/^[0-9a-f]{6}$/.test(hex)) return hex;
	if (/^[0-9a-f]{3}$/.test(hex)) return hex.split("").map((c) => c + c).join("");
	return undefined;
}
