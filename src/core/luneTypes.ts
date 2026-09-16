/**
 * The type names Lune's standard library deals in.
 *
 * Derived from {@link LUNE_MODULES} rather than listed, so a Lune release that
 * adds a type adds it here too — the catalogue is regenerated and this follows.
 * A hand-written list is the thing that is right on the day it is written.
 *
 * ## Why the type picker needed this
 *
 * The picker was built when there was one target. It offers Luau's primitives,
 * then Roblox's datatypes, then Instance classes — which is the whole world if
 * the whole world is Roblox. In a Lune graph it offered `CFrame` and `Humanoid`
 * and had never heard of `DateTime`, `Regex` or `WebSocket`, so the one runtime
 * whose types you would have to type out by hand was the one Roswaal is adding
 * support for.
 */

import { LUNE_MODULES } from "./luneApi.js";
import type { NodeScript } from "./schema.js";

/**
 * Luau's own, which both runtimes have.
 *
 * `buffer` is here because it is Luau's and the picker did not have it —
 * `fs.readFile` can return one and `serde` takes one, so a Lune graph needed to
 * name a type the list could not offer. `thread` and `nil` are the same
 * oversight from the other direction: base Luau, offered by neither.
 */
export const LUAU_PRIMITIVES = [
	"any", "boolean", "number", "string", "table", "function", "thread", "buffer", "nil",
];

const PRIMITIVE = new Set([...LUAU_PRIMITIVES, "true", "false", "never", "unknown"]);

/**
 * Splits a type expression into the names it mentions.
 *
 * The catalogue holds Luau types verbatim — `buffer | string`, `{ string }`,
 * `(...)-> ...` — because that is what Lune wrote and rewriting it would be
 * inventing a second dialect. A name is what is left after the punctuation.
 */
function namesIn(type: string): string[] {
	return type
		.split(/[|&,]/)
		.map((part) => part.replace(/[{}()[\]?<>]/g, "").trim())
		.filter((part) => /^[A-Za-z][\w.]*$/.test(part));
}

/**
 * Every named type the standard library mentions, sorted, primitives excluded.
 *
 * Includes the types `@lune/roblox` deals in — `Instance` and `DataModel` —
 * because a Lune program that requires it genuinely has them. Which ones a
 * given graph should be *offered* is a question about that graph's requires,
 * and belongs where the picker can see them rather than here.
 */
export const LUNE_TYPES: string[] = [...new Set(
	LUNE_MODULES.flatMap((module) =>
		[...module.functions, ...module.classes.flatMap((one) => one.methods)]
			.flatMap((fn) => [...fn.params.map((p) => p.type), fn.returns])
			.filter((type) => type !== "")
			.flatMap(namesIn),
	),
)].filter((name) => !PRIMITIVE.has(name)).sort();

/** Which module each type comes from, for saying so beside it. */
export const LUNE_TYPE_MODULE: Record<string, string> = Object.fromEntries(
	LUNE_MODULES.flatMap((module) =>
		[...module.functions, ...module.classes.flatMap((one) => one.methods)]
			.flatMap((fn) => [...fn.params.map((p) => p.type), fn.returns])
			.filter((type) => type !== "")
			.flatMap(namesIn)
			.filter((name) => !PRIMITIVE.has(name))
			.map((name) => [name, module.alias]),
	),
);

/**
 * The types `@lune/roblox` brings, which a Lune graph only has if it requires
 * that module.
 *
 * Separate because offering `Instance` to a Lune graph that has not required
 * `@lune/roblox` is offering a type that does not exist there — and the rule
 * this project is built on is that a require happens because somebody asked
 * for it, not because a type picker assumed it.
 */
export const LUNE_ROBLOX_TYPES: string[] = LUNE_TYPES
	.filter((name) => LUNE_TYPE_MODULE[name] === "roblox");

/**
 * Whether this graph has asked for `@lune/roblox`.
 *
 * Both ways of asking count: a declaration in the Variables panel, and a
 * Require at Top on the canvas. Neither is inferred — the point of checking is
 * that the developer said so somewhere visible, which is the rule the module
 * work is built on.
 */
export function requiresLuneRoblox(script: NodeScript | undefined): boolean {
	if (!script) return false;
	const wanted = (specifier: string) => specifier.trim().toLowerCase() === "@lune/roblox";
	if ((script.modules ?? []).some((module) => wanted(module.specifier))) return true;
	return script.nodes.some((node) => {
		if (node.def !== "module.requireTop") return false;
		const literal = (node.literals ?? {}).specifier;
		return literal?.t === "raw" || literal?.t === "string"
			? wanted(String((literal as { v?: unknown }).v ?? ""))
			: false;
	});
}
