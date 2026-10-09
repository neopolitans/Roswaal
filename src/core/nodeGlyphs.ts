/**
 * The glyph in a node's corner tab: what kind of thing the node does, drawn
 * large enough to read with the whole graph in view.
 *
 * Drawn for this, on a 24 grid as centre lines, rather than shrunk from the
 * toolbar's Material set. A toolbar glyph is detailed for 16–20px on a plain
 * button; these sit at 18px on a coloured tab and are often seen at half that
 * when a graph is zoomed out, so each is a few strokes and nothing finer.
 *
 * In core because two things draw them: the canvas, and the documentation's
 * node pictures, which cannot import from `src/app`. The choice follows
 * `nodeColor` in `palette.ts` — a node that starts or ends a flow, or declares
 * a function, gets that glyph whatever its category, as it gets that red.
 */

import { FUNCTION_NODES } from "./nodes/flow.js";

/** The grid every glyph is drawn on, and the stroke it is drawn with there. */
export const GLYPH_VIEW_BOX = "0 0 24 24";
export const GLYPH_STROKE = 2.2;

export const GLYPHS = {
	/** Where a flow starts: Script Start, a function's Body. */
	entry: "M8 5.5v13l10.5-6.5z",
	/** Where it stops: Script End, Break, Module Exports. */
	terminal: "M6.5 6.5h11v11h-11z",
	/** A function handing its results back: Return. */
	return: "M19 5.5v5.25a4 4 0 0 1-4 4H5.5M9.5 10.75l-4 4 4 4",
	/** A function: Function, which is hoisted, and Declare Function. */
	function: "M16.5 4.5c-3-1.2-5.2 0-5.7 3L9.2 16.5c-.5 3-2.7 4.2-5.7 3M7.5 10.5h8",
	/** Flow: one way in, two ways on. */
	flow: "M3.5 12h5.5l4-5.5h7.5M9 12l4 5.5h7.5M17.5 3.5l3 3-3 3M17.5 14.5l3 3-3 3",
	events: "M14 3 6 13.5h6l-2 7.5 8-10.5h-6z",
	/** A named box holding something. */
	variables: "M4.5 5h15v14h-15zM9 9.5l6 5M15 9.5l-6 5",
	/** A literal value: the hash every language writes a number next to. */
	values: "M10 4 8 20M16 4l-2 16M5 9.5h14.5M4.5 14.5H19",
	math: "M17.5 5.5h-11l6 6.5-6 6.5h11",
	/** A switch, on: true or false. */
	logic:
		"M3.5 12a5 5 0 0 1 5-5h7a5 5 0 0 1 0 10h-7a5 5 0 0 1-5-5zM15.5 9.75a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5z",
	strings: "M5.5 7.5v-2h13v2M12 5.5v13M9 18.5h6",
	tables: "M4 5h16v14H4zM4 10h16M4 14.5h16M10 5v14",
	/** The engine itself: a nut, for the machinery a game runs on. */
	engine:
		"M12 3.5l7.5 4.25v8.5L12 20.5l-7.5-4.25v-8.5zM12 9.25a2.75 2.75 0 1 1 0 5.5 2.75 2.75 0 0 1 0-5.5z",
	/** A tree of things, each under its parent. */
	instances: "M6 4v13.5h6M6 9h6M12 6.5h7.5v5H12zM12 15h7.5v5H12z",
	players:
		"M12 11a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5zM4.5 20.5c0-4 3.5-6.25 7.5-6.25s7.5 2.25 7.5 6.25",
	/** Across the boundary and back. */
	networking: "M4 8.5h15M16 5.5l3 3-3 3M20 15.5H5M8 12.5l-3 3 3 3",
	modules: "M4.5 7.5 12 3.75l7.5 3.75L12 11.25zM4.5 7.5v9L12 20.25l7.5-3.75v-9M12 11.25v9",
	lune: "M19.5 14.5A8 8 0 1 1 9.5 4.5a6.25 6.25 0 0 0 10 10z",
	time: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 7.5V12l3 2",
	/** Three strands running side by side. */
	threads: "M7 4c3 4-3 12 0 16M12 4c3 4-3 12 0 16M17 4c3 4-3 12 0 16",
	debug:
		"M8.5 9.5h7v5a3.5 3.5 0 0 1-7 0zM12 9.5v8.5M9.5 6.5l1 3M14.5 6.5l-1 3M4.5 12.5h4M15.5 12.5h4M5.5 18.5l3-2M18.5 18.5l-3-2",
	/** Turning one up-axis into the other. */
	conversions: "M19.5 12a7.5 7.5 0 1 1-2.6-5.7M19.5 4v4.5H15",
	tags: "M4 12.25V4.5h7.75l8.5 8.5-7.25 7.25zM8 8.25v.01",
	attributes: "M5 7h14M5 12h14M5 17h14M9 5v4M15 10v4M11 15v4",
	vector3: "M12 13V4M12 13l-7.5 5M12 13l7.5 4.5M12 4l-2 2.5M12 4l2 2.5",
	vector2: "M5 19.5 18 6.5M18 6.5h-6M18 6.5v6M5 4.5v15h15",
	/** A position and which way it faces. */
	cframe: "M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM12 3v4M12 17v4M3 12h4M17 12h4",
	color3: "M12 3.5c3 4 6 7.25 6 10.5a6 6 0 0 1-12 0c0-3.25 3-6.5 6-10.5z",
	brickcolor: "M3.5 7h17v10h-17zM3.5 12h17M9.5 7v5M14.5 12v5",
	udim: "M3.5 9h17v6h-17zM7.5 9v3M11.5 9v3M15.5 9v3",
	tween: "M4 19.5c8 0 8-15 16-15M4 19.5h.01M20 4.5h.01",
	/** Anything a pack brings that has no glyph of its own. */
	other: "M12 3.5l2.4 6.1 6.1 2.4-6.1 2.4L12 20.5l-2.4-6.1L3.5 12l6.1-2.4z",
} as const;

export type GlyphName = keyof typeof GLYPHS;

/** By category key — the key, not the label `categoryLabel` shows. */
export const CATEGORY_GLYPHS: Record<string, GlyphName> = {
	Flow: "flow",
	Events: "events",
	Variables: "variables",
	Values: "values",
	Math: "math",
	Logic: "logic",
	Strings: "strings",
	Tables: "tables",
	Engine: "engine",
	Roblox: "engine",
	"Engine Types": "vector3",
	Instances: "instances",
	Players: "players",
	Networking: "networking",
	Modules: "modules",
	Lune: "lune",
	Time: "time",
	Threads: "threads",
	Debug: "debug",
	"Z-Up Conversions": "conversions",
	Tags: "tags",
	Attributes: "attributes",
};

/** A datatype's own glyph beats its category's, as its colour does. */
const BY_SUBCATEGORY: Record<string, GlyphName> = {
	Vector3: "vector3",
	Vector2: "vector2",
	CFrame: "cframe",
	Color3: "color3",
	BrickColor: "brickcolor",
	UDim: "udim",
	UDim2: "udim",
	TweenInfo: "tween",
	Tween: "tween",
};

/**
 * Which glyph a node's tab carries. Takes the fields it reads, as `nodeColor`
 * does, so a documentation preview can be passed in place of a definition.
 */
export function nodeGlyph(def: {
	id?: string;
	category: string;
	subcategory?: string;
	role?: string;
}): GlyphName {
	// A function definition is a function before it is an entry: the red
	// already says a flow starts there, and ƒ says what kind of thing it is.
	if (def.id !== undefined && FUNCTION_NODES.has(def.id)) return "function";
	if (def.id === "function.return") return "return";
	if (def.role === "entry") return "entry";
	if (def.role === "terminal") return "terminal";
	if (def.subcategory && BY_SUBCATEGORY[def.subcategory]) return BY_SUBCATEGORY[def.subcategory];
	return CATEGORY_GLYPHS[def.category] ?? "other";
}

/**
 * The nodes that hold code, and the mark each takes in place of a glyph: the
 * Code panel's own, so a Code Block on the graph and its tab in the editor
 * read as one thing. `{ }` for statements, `ƒx` for a value worked out, as a
 * formula bar has it, and `<T>` for a type, as Luau writes a type parameter.
 *
 * Drawn as text in the code face and the code colours on the editor's own
 * surface, rather than white on the category's colour: a theme is checked for
 * its code colours against that surface (`validateTheme`), so the mark is
 * readable in every theme without another check.
 */
export const CODE_MARKS: Readonly<
	Record<string, { kind: "block" | "expression" | "type"; mark: string }>
> = {
	"code.custom": { kind: "block", mark: "{ }" },
	"value.expression": { kind: "expression", mark: "ƒx" },
	"type.declareTop": { kind: "type", mark: "<T>" },
	"type.declareHere": { kind: "type", mark: "<T>" },
};

/** The code role each mark is coloured with: `--code-keyword` and so on. */
export const CODE_MARK_ROLE = {
	block: "keyword",
	expression: "function",
	type: "type",
} as const;
