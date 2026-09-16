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
 * announcement, [Introducing Require-by-String][announce], answers "custom
 * aliased paths?" with *"Not yet, but we're working on it!"*, and its update of
 * 8 January 2026 says *"we're also currently working on making it possible to
 * define your own custom require aliases, so stay tuned for that."* Both are
 * SubatomicTurtle's, for Roblox. So a `.luaurc` alias in a Roblox graph is code
 * that does not resolve *today*, written against something that is coming —
 * refusing it would be claiming to know a date nobody has given.
 *
 * The link is exported rather than only quoted, because a reader should be able
 * to check a claim about somebody else's roadmap instead of taking ours for it.
 *
 * [announce]: https://devforum.roblox.com/t/introducing-require-by-string/3405078
 *
 * [amended]: https://rfcs.luau.org/amended-require-resolution.html
 */

import { aliasesOf, type LuaurcChain } from "./luaurc.js";
import type { Target } from "./schema.js";

export interface SpecifierProblem {
	severity: "error" | "warning";
	message: string;
}

/**
 * Roblox's announcement of require-by-string, where the alias question is
 * answered. Checked 16 September 2026.
 */
export const ROBLOX_REQUIRE_ANNOUNCEMENT =
	"https://devforum.roblox.com/t/introducing-require-by-string/3405078";

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
/**
 * What the project's `.luaurc` files say, when we have been told.
 *
 * Optional because two of the three callers do not have it: the emitter is
 * handed a graph and no project, and a test asks about a specifier in the
 * abstract. Absent, this checks what a specifier *is*; present, it can also
 * check whether the alias exists — which is the difference between "that is
 * not a legal require" and "nothing in this project defines `@roact`".
 */
export interface SpecifierContext {
	/** The `.luaurc` chain for the file being compiled, nearest first. */
	luaurc?: LuaurcChain;
	/**
	 * Whether the project has any `.luaurc` at all.
	 *
	 * Separate from the chain being empty, and it changes the verdict. With a
	 * file present, a name it does not define is a **typo** and an error. With
	 * no file anywhere, an alias is code written against a map we have not been
	 * shown — generated at build time, or outside the project root — and calling
	 * that an error would be refusing to compile a project that builds.
	 */
	hasLuaurc?: boolean;
}

export function checkSpecifier(
	specifier: string, target: Target, context: SpecifierContext = {},
): SpecifierProblem | null {
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
		if (alias === LUNE_ALIAS) return null;
		return undefinedAlias(alias, context);
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

	// A name nothing defines is wrong for a reason that has nothing to do with
	// Roblox, and saying the Roblox thing about it would send somebody off to
	// read about engine support for an alias they have misspelled.
	const undefined_ = undefinedAlias(alias, context);
	if (undefined_ !== null) return undefined_;

	return {
		severity: "warning",
		message:
			`\`@${alias}/\` reads as an alias from a \`.luaurc\`, which **Roblox does not resolve ` +
			"yet** — its own announcement says alias maps are being worked on. `@self/` and " +
			"`@game/` do work, and so do `./` and `../`.",
	};
}

/**
 * Nothing defines this alias — or nothing we were shown.
 *
 * `null` when we have no business having an opinion: without a chain this
 * module does not know what the project defines, and inventing an error from
 * that would be worse than saying nothing.
 */
function undefinedAlias(alias: string, context: SpecifierContext): SpecifierProblem | null {
	const chain = context.luaurc;
	if (chain === undefined) return null;
	if (aliasesOf(chain).has(alias.toLowerCase())) return null;

	if (context.hasLuaurc === false) {
		return {
			severity: "warning",
			message:
				`Nothing in this project defines \`@${alias}\` — there is no \`.luaurc\` here at ` +
				"all. If the file is generated at build time this is fine; otherwise the require " +
				"will not resolve.",
		};
	}
	return {
		severity: "error",
		message:
			`No \`.luaurc\` above this script defines \`@${alias}\`. Check the spelling, or add ` +
			"the alias in Settings.",
	};
}
