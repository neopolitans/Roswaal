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
 * | an instance, `ReplicatedStorage.Shared.Greeter` | yes | no |
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

import { quoteString } from "./compiler/quote.js";
import { RESERVED_WORDS } from "./luau/lexer.js";
import { aliasesOf, type LuaurcChain } from "./luaurc.js";
import { isService } from "./roblox.js";
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
const LUNE_ALIAS = "lune";

/** A specifier's alias, or `null` when it is a relative path or unprefixed. */
export function aliasOf(specifier: string): string | null {
	const trimmed = specifier.trim();
	if (!trimmed.startsWith("@")) return null;
	// `@Roact` and `@Roact/createElement` are one alias; the separator ends it.
	return trimmed.slice(1).split("/")[0] ?? "";
}

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

/**
 * What is wrong with this specifier for this target, or `null` if nothing is.
 *
 * An empty specifier is *not* a problem here. A declaration somebody has
 * started and not finished is a normal state to be in while typing, and the
 * emitter skips it rather than compiling half of one — saying "this is wrong"
 * about a field you have not filled in yet is nagging, not checking.
 */
export function checkSpecifier(
	specifier: string,
	target: Target,
	context: SpecifierContext = {},
): SpecifierProblem | null {
	const text = specifier.trim();
	if (text === "") return null;

	if (text.startsWith("./") || text.startsWith("../")) return null;

	// Where the module sits, rather than a string: Roblox's older and still
	// commoner way, and one Lune cannot follow, having no DataModel.
	const place = parseInstancePath(text);
	if (place !== null) {
		if ("problem" in place) return { severity: "error", message: place.problem };
		if (target === "lune") {
			return {
				severity: "error",
				message:
					`"${text}" is a place in Roblox's DataModel, and Lune has none to require from. ` +
					"Use a path, or an alias from your `.luaurc`.",
			};
		}
		return null;
	}

	if (!text.startsWith("@")) {
		return {
			severity: "error",
			message:
				`"${text}" needs a prefix. A require starts with \`./\` or \`../\` for a path, or ` +
				"`@` for an alias — an unprefixed one is an error in Luau itself now, not a " +
				"fallback to something else." +
				(target === "roblox"
					? " Or name where it sits, from a service: `ReplicatedStorage.Shared.Greeter`."
					: ""),
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

/**
 * A require by where the module sits in the DataModel, rather than by string:
 * `ReplicatedStorage.Shared.Greeter`, `game.ReplicatedStorage.Shared.Greeter`,
 * `script.Parent.Util`. The way Roblox code required modules before
 * require-by-string, and still the way most of it does.
 *
 * Read as written, but only as far as a path goes: names after dots, names in
 * brackets, and `:WaitForChild("Name")`. A field in the Variables panel is not
 * somewhere to hide a call, so anything else is refused rather than written.
 */
export interface InstancePath {
	/** A service, or `script` or `workspace`; `game` when what follows is not a service. */
	root: string;
	/** Each step down from the root, and whether it waits for the child. */
	steps: { name: string; wait: boolean }[];
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const PATH_HEADS = new Set(["game", "script", "workspace"]);

/**
 * The instance path a specifier names, a problem with one that starts like a
 * path and goes wrong, or `null` for one that does not start like a path at all
 * -- `@lune/fs`, `./util` -- which is a string and checked as one.
 */
export function parseInstancePath(
	specifier: string,
): { path: InstancePath } | { problem: string } | null {
	const text = specifier.trim();
	const head = NAME.exec(text)?.[0];
	if (!head || (!PATH_HEADS.has(head) && !isService(head))) return null;

	const steps: InstancePath["steps"] = [];
	let rest = text.slice(head.length);
	let root = head;
	const wrong = (what: string) => ({
		problem:
			`"${text}" reads as a place in the DataModel, but ${what}. A path is names after ` +
			'dots, names in brackets (`["Main Menu"]`) and `:WaitForChild("Name")`.',
	});

	while (rest !== "") {
		let match: RegExpExecArray | null;
		if ((match = /^\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(rest))) {
			steps.push({ name: match[1]!, wait: false });
		} else if ((match = /^\s*\[\s*(["'])([^"'\\\n]*)\1\s*\]/.exec(rest))) {
			steps.push({ name: match[2]!, wait: false });
		} else if ((match = /^\s*:\s*WaitForChild\s*\(\s*(["'])([^"'\\\n]*)\1\s*\)/.exec(rest))) {
			steps.push({ name: match[2]!, wait: true });
		} else if (
			root === "game" &&
			steps.length === 0 &&
			(match = /^\s*:\s*GetService\s*\(\s*(["'])([^"'\\\n]*)\1\s*\)/.exec(rest))
		) {
			root = match[2]!;
		} else {
			return wrong(`\`${rest.trim().slice(0, 24)}\` is not part of one`);
		}
		rest = rest.slice(match[0].length);
	}

	// `game.ReplicatedStorage` is the service, and is hoisted as one.
	if (root === "game" && steps[0] && !steps[0].wait && isService(steps[0].name)) {
		root = steps.shift()!.name;
	}
	if (steps.length === 0) return wrong("it stops before reaching a ModuleScript");
	return { path: { root, steps } };
}

/** An instance path's steps written after `base`, the way Luau needs each name. */
export function renderInstancePath(base: string, steps: InstancePath["steps"]): string {
	return steps.reduce((acc, step) => {
		if (step.wait) return `${acc}:WaitForChild(${quoteString(step.name)})`;
		return NAME.exec(step.name)?.[0] === step.name && !RESERVED_WORDS.has(step.name)
			? `${acc}.${step.name}`
			: `${acc}[${quoteString(step.name)}]`;
	}, base);
}

/** How a DataModel path is written in the Modules list: `ReplicatedStorage.Shared.Greeter`. */
export function instanceSpecifier(path: readonly string[]): string {
	const [root = "", ...rest] = path;
	return renderInstancePath(
		root,
		rest.map((name) => ({ name, wait: false })),
	);
}
