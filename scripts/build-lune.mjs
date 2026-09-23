/**
 * Lune's standard library, generated into `src/core/luneApi.ts`.
 *
 * ## Why the source is Lune's own type definitions
 *
 * `lune-org/lune` ships a `types.d.luau` per standard library crate: the exact
 * signature of every function, with the description, `@param` and `@return`
 * that Lune's own documentation site is rendered from. It is the API surface as
 * the runtime defines it rather than as a page describes it, and it moves with
 * the runtime because it is what the runtime is built against.
 *
 * The plan for this milestone put it plainly: *an API surface remembered is an
 * API surface that is wrong*. So nothing here is typed out from reading docs.
 *
 * ## Pinned, fetched, and committed
 *
 * Pinned to a **tag**, not to `main`, so the catalogue describes one release of
 * Lune and says which — a node claiming `fs.readFile` takes a `path` is a claim
 * about a version, and "latest at the time somebody ran this" is not a version.
 *
 * Fetched rather than vendored, and the **result is committed**: a build of
 * Roswaal never touches the network, and moving to a new Lune is a deliberate
 * `npm run build:lune` whose diff is there to be read. That is the arrangement
 * `build-members.mjs` already uses for the Roblox catalogue, for the same
 * reasons.
 *
 * ## What `must_use` decides
 *
 * Lune tags a function `@tag must_use` when its point is the value it returns.
 * That is the same line Roswaal draws between a **pure** node and one in the
 * execution chain, so the tag is carried through rather than re-derived: a
 * question is a value node and a command sits on the wire, and Lune has already
 * said which is which for every function it ships.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The Lune release this catalogue describes.
 *
 * Bump it, run the script, read the diff. Nothing else in Roswaal decides which
 * Lune it is built for, and this constant is quoted in the generated file so the
 * answer travels with the data.
 */
const LUNE_VERSION = "0.10.5";
const TAG = `v${LUNE_VERSION}`;

/** The standard library, by the alias each is required under. */
const MODULES = [
	{ alias: "datetime", crate: "lune-std-datetime", what: "Dates, times and their formats" },
	{ alias: "fs", crate: "lune-std-fs", what: "The filesystem" },
	{ alias: "luau", crate: "lune-std-luau", what: "Compiling and loading Luau at runtime" },
	{ alias: "net", crate: "lune-std-net", what: "HTTP, sockets and serving" },
	{ alias: "process", crate: "lune-std-process", what: "This process, and child processes" },
	{ alias: "regex", crate: "lune-std-regex", what: "Regular expressions" },
	{ alias: "roblox", crate: "lune-std-roblox", what: "Roblox files, instances and datatypes" },
	{ alias: "serde", crate: "lune-std-serde", what: "JSON, TOML, YAML and compression" },
	{ alias: "stdio", crate: "lune-std-stdio", what: "The terminal: input, output and colour" },
	{ alias: "task", crate: "lune-std-task", what: "The scheduler, and waiting" },
];

async function typedef(crate) {
	const url =
		`https://raw.githubusercontent.com/lune-org/lune/${TAG}/crates/${crate}/types.d.luau`;
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${crate}: ${response.status} ${response.statusText}`);
	return response.text();
}

/**
 * Splits `a: string, b: buffer | string` without splitting a generic or a table.
 *
 * A comma inside `{ [string]: number }` or `(a, b) -> c` is not a parameter
 * boundary, and Lune's signatures have both.
 */
function splitParams(text) {
	const out = [];
	let depth = 0;
	let at = 0;
	for (let i = 0; i < text.length; i += 1) {
		const ch = text[i];
		if ("({[<".includes(ch)) depth += 1;
		// The `>` of a function type's `->` closes nothing; counted, it took the
		// depth below zero and the next comma stopped splitting.
		else if (ch === ">" && text[i - 1] === "-") continue;
		else if (")}]>".includes(ch)) depth -= 1;
		else if (ch === "," && depth === 0) {
			out.push(text.slice(at, i));
			at = i + 1;
		}
	}
	out.push(text.slice(at));
	return out.map((one) => one.trim()).filter((one) => one !== "");
}

/** `path: string` into its two halves; a bare `...` keeps its name. */
function parseParam(text) {
	const at = text.indexOf(":");
	if (at < 0) return { name: text.trim(), type: "any", optional: text.trim() === "..." };
	const name = text.slice(0, at).trim();
	const type = text.slice(at + 1).trim();
	return { name, type: type.replace(/\?$/, ""), optional: type.endsWith("?") };
}

/** The doc block above a function: its prose, its tags and its `@param` lines. */
function parseDoc(block) {
	const lines = block.split("\n").map((line) => line.replace(/^\t/, ""));
	const tags = new Set();
	const params = new Map();
	let returns = "";
	const prose = [];

	for (const line of lines) {
		const trimmed = line.trim();
		const tag = /^@(\w+)\s*(.*)$/.exec(trimmed);
		if (tag) {
			const [, name, rest] = tag;
			if (name === "param") {
				const at = rest.indexOf(" ");
				if (at > 0) params.set(rest.slice(0, at), rest.slice(at + 1).trim());
			} else if (name === "return") {
				returns = rest.trim();
			} else {
				tags.add(name === "tag" ? rest.trim() : name);
			}
			continue;
		}
		prose.push(trimmed);
	}

	// The first paragraph is the summary; the rest is the "an error will be
	// thrown when..." detail, which belongs on the node's page rather than in a
	// menu row.
	const text = prose.join("\n").trim();
	const [summary, ...restOf] = text.split(/\n\s*\n/);
	return {
		summary: (summary ?? "").replace(/\s+/g, " ").trim(),
		detail: restOf.join("\n\n").trim(),
		tags: [...tags],
		params,
		returns,
	};
}

const modules = [];
for (const module of MODULES) {
	const source = await typedef(module.crate);
	const functions = [];

	/**
	 * Which table is the module itself.
	 *
	 * A typedef declares the module as a local and returns it at the end, and
	 * also declares the *classes* it hands back — `regex.new` returns a `Regex`
	 * with six methods of its own, and `DateTime` has more. Those are methods on
	 * a value, which is Call Method rather than a module function, so they are
	 * kept apart rather than flattened in. Matching any receiver put six of
	 * `Regex`'s methods into `@lune/regex` as though the module had them.
	 */
	// The *last* one: a typedef declares helper tables before the module — `net`
	// has `tcp` above it — and each is returned at the end of its own section.
	// Taking the first `return` made `@lune/net` a module with no functions.
	const returned = [...source.matchAll(/^return\s+(\w+)\s*$/gm)];
	const table = returned.at(-1)?.[1] ?? module.alias;

	// A doc block, then the function it documents. The `<T...>` is not optional
	// decoration: four of `task`'s five functions are generic, and a pattern
	// that stopped at the name found one of them.
	const pattern =
		/--\[=\[\n([\s\S]*?)\]=\]\s*\nfunction\s+(\w+)[.:](\w+)\s*(?:<[^>]*>)?\s*\(([\s\S]*?)\)\s*(?::\s*([^\n]+?))?\s*(?:\n|end)/g;

	let undocumented = 0;
	const classes = new Map();

	for (const [, block, receiver, name, args, ret] of source.matchAll(pattern)) {
		const doc = parseDoc(block);
		if (doc.summary === "") undocumented += 1;
		const entry = {
			name,
			params: splitParams(args).map((one) => {
				const parsed = parseParam(one);
				return { ...parsed, what: doc.params.get(parsed.name) ?? "" };
			}),
			returns: (ret ?? "").trim(),
			returnsWhat: doc.returns,
			mustUse: doc.tags.includes("must_use"),
			summary: doc.summary,
			detail: doc.detail,
		};
		if (receiver === table) functions.push(entry);
		else classes.set(receiver, [...(classes.get(receiver) ?? []), entry]);
	}

	/**
	 * Then anything declared without a doc block.
	 *
	 * `RegexCaptures.get` and its two siblings are written bare, and a pattern
	 * that required a doc block dropped all three without a word — while the
	 * "undocumented" counter read zero, because it only counted the ones it had
	 * already captured. A silent drop is the one outcome this whole file exists
	 * to prevent, so undocumented functions are taken too and the count is real.
	 */
	const bare =
		/^function\s+(\w+)[.:](\w+)\s*(?:<[^>]*>)?\s*\(([\s\S]*?)\)\s*(?::\s*([^\n]+?))?\s*(?:\n|end)/gm;
	const taken = new Set([
		...functions.map((one) => `${table}.${one.name}`),
		...[...classes].flatMap(([owner, list]) => list.map((one) => `${owner}.${one.name}`)),
	]);

	for (const [, receiver, name, args, ret] of source.matchAll(bare)) {
		if (taken.has(`${receiver}.${name}`)) continue;
		undocumented += 1;
		const entry = {
			name,
			// `self` is the receiver, not an argument somebody passes.
			params: splitParams(args).map(parseParam)
				.filter((one) => one.name !== "self")
				.map((one) => ({ ...one, what: "" })),
			returns: (ret ?? "").trim(),
			returnsWhat: "",
			mustUse: false,
			summary: "",
			detail: "",
		};
		if (receiver === table) functions.push(entry);
		else classes.set(receiver, [...(classes.get(receiver) ?? []), entry]);
	}

	/**
	 * Every declaration in the file is in the catalogue, or the build stops.
	 *
	 * The next Lune release is the one that adds a function in a shape neither
	 * pattern above matches, and finding that out from a node that is quietly
	 * missing is finding out too late.
	 */
	const declared = (source.match(/^function\s+\w+[.:]\w+/gm) ?? []).length;
	const captured = functions.length +
		[...classes.values()].reduce((sum, list) => sum + list.length, 0);
	if (declared !== captured) {
		throw new Error(
			`${module.crate}: ${declared} functions declared, ${captured} captured. ` +
			"A declaration is written in a shape the parser does not read.",
		);
	}

	modules.push({
		...module,
		functions,
		classes: [...classes].map(([name, methods]) => ({ name, methods })),
	});
	const methods = [...classes.values()].reduce((sum, list) => sum + list.length, 0);
	console.log(
		`  @lune/${module.alias.padEnd(9)} ${String(functions.length).padStart(3)} functions` +
		(methods > 0 ? `, ${methods} methods on ${classes.size} class(es)` : "") +
		(undocumented > 0 ? `  (${undocumented} undocumented)` : ""),
	);
}

/**
 * The Roblox datatypes `@lune/roblox` actually implements.
 *
 * Read from the crate's own module listing rather than assumed from the Roblox
 * side, because the two differ and the difference is the whole point of asking.
 * `TweenInfo` is a Roblox datatype and is **not** in this list; offering it to a
 * Lune graph would be offering a constructor the runtime does not have.
 *
 * The `pub use` lines are the answer rather than the `mod` lines: a module is
 * `color3` and the type it exports is `Color3`, and the exported name is the one
 * a developer writes.
 */
const datatypesSource = await (
	await fetch(
		`https://raw.githubusercontent.com/lune-org/lune/${TAG}` +
		"/crates/lune-roblox/src/datatypes/types/mod.rs",
	)
).text();

const robloxDatatypes = [...new Set(
	[...datatypesSource.matchAll(/^pub use (?:r#)?\w+::(\w+);/gm)].map((one) => one[1]),
)].sort();

if (robloxDatatypes.length === 0) {
	throw new Error("lune-roblox: no datatypes found. The module listing has changed shape.");
}
console.log(`  @lune/roblox   ${robloxDatatypes.length} Roblox datatypes`);

const total = modules.reduce((sum, module) => sum + module.functions.length, 0);

const lines = [
	"/**",
	` * Lune's standard library, as Lune ${LUNE_VERSION} defines it.`,
	" *",
	" * Generated by `scripts/build-lune.mjs` from the `types.d.luau` files that",
	` * ship with \`lune-org/lune\` at \`${TAG}\`, which is the API surface the runtime`,
	" * is built against rather than a description of it. Do not edit by hand: run",
	" * `npm run build:lune` and read the diff.",
	" *",
	" * The parameter descriptions are Lune's own, verbatim from files covered by",
	" * the Mozilla Public License 2.0 (https://mozilla.org/MPL/2.0/); their source",
	" * is https://github.com/lune-org/lune. They are not covered by Roswaal's 0BSD",
	" * licence; see ATTRIBUTIONS.md.",
	" *",
	` * ${total} functions across ${modules.length} modules.`,
	" */",
	"",
	"export interface LuneParam {",
	"\tname: string;",
	"\t/** The Luau type as the typedef writes it, verbatim. */",
	"\ttype: string;",
	"\toptional: boolean;",
	"\t/** Lune's own `@param` line, where it has one. */",
	"\twhat: string;",
	"}",
	"",
	"export interface LuneFunction {",
	"\tname: string;",
	"\tparams: LuneParam[];",
	"\t/** The return type verbatim, or `\"\"` when it returns nothing. */",
	"\treturns: string;",
	"\t/** Lune's own `@return` line. */",
	"\treturnsWhat: string;",
	"\t/**",
	"\t * Lune tags it `must_use`: the point of the call is the value.",
	"\t *",
	"\t * Which is the line Roswaal draws between a pure node and one on the",
	"\t * execution chain, so this decides that rather than being re-derived.",
	"\t */",
	"\tmustUse: boolean;",
	"\tsummary: string;",
	"\t/** The rest of the doc block — when it throws, and what it does not do. */",
	"\tdetail: string;",
	"}",
	"",
	"export interface LuneClass {",
	"\t/** The type as the typedef names it: `Regex`, `DateTime`. */",
	"\tname: string;",
	"\tmethods: LuneFunction[];",
	"}",
	"",
	"export interface LuneModule {",
	"\t/** The alias it is required under, without the `@lune/`. */",
	"\talias: string;",
	"\twhat: string;",
	"\tfunctions: LuneFunction[];",
	"\t/**",
	"\t * The types this module hands back, and what they can be asked.",
	"\t *",
	"\t * Apart from `functions` because they are not called on the module:",
	"\t * `regex.new` gives you a `Regex`, and its `find` is a method on that",
	"\t * value. One flat list would offer a call nobody can make.",
	"\t */",
	"\tclasses: LuneClass[];",
	"}",
	"",
	"/**",
	" * The Roblox datatypes `@lune/roblox` implements.",
	" *",
	" * Not every Roblox datatype: `TweenInfo` and `Tween` are Roblox's and are",
	" * not here, so a Lune graph that requires the module still cannot make one.",
	" * Read from the crate's own module listing rather than assumed from the",
	" * Roblox side, because the difference is the reason for asking.",
	" */",
	`export const LUNE_ROBLOX_DATATYPES: string[] = ${JSON.stringify(robloxDatatypes)};`,
	"",
	"/** The Lune release this catalogue describes. */",
	`export const LUNE_VERSION = ${JSON.stringify(LUNE_VERSION)};`,
	"",
	`export const LUNE_MODULES: LuneModule[] = ${JSON.stringify(
		modules.map(({ alias, what, functions, classes }) => ({ alias, what, functions, classes })),
		null,
		"\t",
	)};`,
	"",
];

await writeFile(join(ROOT, "src/core/luneApi.ts"), lines.join("\n"), "utf8");
console.log(`lune ${LUNE_VERSION}: ${total} functions -> src/core/luneApi.ts`);
