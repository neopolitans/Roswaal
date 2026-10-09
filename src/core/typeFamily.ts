/**
 * The five families every pin type falls into, and the shape each is drawn as.
 *
 * Colour alone says what a pin carries only to someone who can tell the
 * colours apart and has learned them. The shape says the coarse half of it to
 * anyone: a plain value is a circle, a thing in the game is a rounded square,
 * a table is a diamond, a function is a dot in a ring, and something to listen
 * to is a hexagon. Five, because five can be told apart at a glance at 10px
 * and more cannot — the type itself is still there in the colour, the chip and
 * the hover card.
 *
 * In core because the canvas and the documentation's node pictures both draw
 * them, and because the specification's table of families is generated from
 * here.
 */

import { isInstanceClass } from "./roblox.js";

export type TypeFamily = "value" | "object" | "table" | "function" | "signal";

export const TYPE_FAMILIES: { family: TypeFamily; shape: string; what: string }[] = [
	{ family: "value", shape: "circle", what: "A plain value: a number, a string, a Vector3" },
	{
		family: "object",
		shape: "rounded square",
		what: "A thing in the game: an Instance or any class",
	},
	{ family: "table", shape: "diamond", what: "A table, an array or a dictionary" },
	{ family: "function", shape: "dot in a ring", what: "A function, to call or to pass along" },
	{ family: "signal", shape: "hexagon", what: "Something to listen to: an event" },
];

/** Signals by name: Roblox's, and the one Lune's standard library hands back. */
const SIGNALS = new Set(["RBXScriptSignal", "Signal"]);

/**
 * Which family a pin's type belongs to. Anything unknown, untyped or generic is
 * a value: the circle is the shape that claims nothing.
 */
export function typeFamily(type: string | undefined): TypeFamily {
	if (type === undefined) return "value";
	// `Model?` is a Model: whether there is one is not what it is.
	const name = type.trim().replace(/\?$/, "");
	if (SIGNALS.has(name)) return "signal";
	if (name === "function" || /->/.test(name)) return "function";
	if (name === "table" || name.startsWith("{")) return "table";
	if (isInstanceClass(name)) return "object";
	return "value";
}

/**
 * A type as its chip names it: Roblox's long names shortened where the prefix
 * says nothing (`RBXScriptConnection` → `Connection`), and a written-out table
 * or function type as the family it is. The card a chip opens always has the
 * full name.
 */
export function shortTypeName(type: string): string {
	const optional = type.endsWith("?") ? "?" : "";
	const name = type.trim().replace(/\?$/, "");
	if (name.startsWith("{")) return `table${optional}`;
	if (/->/.test(name)) return `function${optional}`;
	return name.replace(/^RBXScript(?=[A-Z])/, "") + optional;
}

/**
 * The words a type chip shows beside an output, or nothing when the type would
 * add nothing to what is already there.
 *
 * Left out when the pin is untyped or generic, which a chip reading "any"
 * would only announce, and when the pin's name already says it: a pin called
 * Connection that holds an RBXScriptConnection, or one called player holding a
 * Player. A type that repeats the name is the commonest case and the one that
 * made every type in full read as a stutter.
 */
export function typeChip(name: string | undefined, type: string | undefined): string | null {
	if (!type) return null;
	const bare = type.trim().replace(/\?$/, "");
	if (bare === "" || bare === "any" || bare === "wildcard") return null;
	const short = shortTypeName(type);
	const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
	const said = words(name ?? "");
	if (said !== "" && (said.includes(words(short)) || said.includes(words(bare)))) return null;
	return short;
}
