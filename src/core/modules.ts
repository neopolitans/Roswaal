/**
 * What a `require` string is allowed to be, and which runtime resolves it.
 *
 * Checked in one place because it is asked in three: the emitter checks a
 * declaration, the emitter checks a Require at Top node, and the panel will
 * want to say so while you are typing. Three copies of a rule this fiddly would
 * be three chances to disagree about `@self/`.
 *
 * ## Everything here was checked, not remembered
 *
 * Against the Luau RFCs and each runtime's own documentation, 16 September
 * 2026. It is moving ground and the dates matter.
 *
 * **[Amended Require Syntax and Resolution Semantics][amended] is
 * Implemented.** Every require must be prefixed — *"any unprefixed path will
 * always result in an error"*. That is a change in the language, not a
 * convention: `require("Foo")` used to resolve and now does not, so an
 * unprefixed specifier is an error here rather than a style note.
 *
 * **The two runtimes resolve different prefixes.**
 *
 * | | Roblox | Lune |
 * | --- | --- | --- |
 * | `./` and `../` | yes | yes |
 * | `@self/` — the script's own children | yes | no |
 * | `@game/` — top-level services | yes | no |
 * | `@lune/*` — the standard library | no | yes, built in |
 * | any other `@alias/` from `.luaurc` | **not yet** | yes |
 *
 * That last row is the one that is a warning rather than an error. Roblox's own
 * announcement answers "custom aliased paths?" with *"Not yet, but we're
 * working on it!"* — so a `.luaurc` alias in a Roblox graph is code that does
 * not resolve *today*, written against something that is coming. Refusing it
 * would be claiming to know a date nobody has given.
 *
 * [amended]: https://rfcs.luau.org/amended-require-resolution.html
 */

import type { Target } from "./schema.js";

export interface SpecifierProblem {
	severity: "error" | "warning";
	message: string;
}

/** Aliases Roblox resolves itself, with no `.luaurc` involved. */
export const ROBLOX_ALIASES = ["self", "game"] as const;

/** The alias Lune reserves for its standard library. */
export const LUNE_ALIAS = "lune";

/** A specifier's alias, or `null` when it is a relative path or unprefixed. */
export function aliasOf(specifier: string): string | null {
	const trimmed = specifier.trim();
	if (!trimmed.startsWith("@")) return null;
	// `@Roact` and `@Roact/createElement` are one alias; the separator ends it.
	return trimmed.slice(1).split("/")[0] ?? "";
}

/**
 * What is wrong with this specifier for this target, or `null` if nothing is.
 *
 * An empty specifier is *not* a problem here. A declaration somebody has
 * started and not finished is a normal state to be in while typing, and the
 * emitter skips it rather than compiling half of one — saying "this is wrong"
 * about a field you have not filled in yet is nagging, not checking.
 */
export function checkSpecifier(specifier: string, target: Target): SpecifierProblem | null {
	const text = specifier.trim();
	if (text === "") return null;

	if (text.startsWith("./") || text.startsWith("../")) return null;

	if (!text.startsWith("@")) {
		return {
			severity: "error",
			message:
				`"${text}" needs a prefix. A require starts with \`./\` or \`../\` for a path, or ` +
				"`@` for an alias — an unprefixed one is an error in Luau itself now, not a " +
				"fallback to something else.",
		};
	}

	const alias = aliasOf(text);
	if (alias === null || alias === "") {
		return {
			severity: "error",
			message: "`@` on its own is reserved. Name the alias after it, as in `@lune/fs`.",
		};
	}

	const isRobloxAlias = (ROBLOX_ALIASES as readonly string[]).includes(alias);

	if (target === "lune") {
		if (isRobloxAlias) {
			return {
				severity: "error",
				message:
					`\`@${alias}/\` is Roblox's — it reaches ` +
					(alias === "self" ? "a script's own children" : "the DataModel's services") +
					", and Lune has neither. Use a path, or an alias from your `.luaurc`.",
			};
		}
		return null;
	}

	// Roblox from here.
	if (alias === LUNE_ALIAS) {
		return {
			severity: "error",
			message:
				`\`@lune/\` is Lune's standard library and the Roblox engine does not provide it. ` +
				"This graph compiles for Roblox.",
		};
	}
	if (isRobloxAlias) return null;

	return {
		severity: "warning",
		message:
			`\`@${alias}/\` reads as an alias from a \`.luaurc\`, which **Roblox does not resolve ` +
			"yet** — its own announcement says alias maps are being worked on. `@self/` and " +
			"`@game/` do work, and so do `./` and `../`.",
	};
}
