/**
 * `.luaurc` alias maps: reading them, and resolving a name through one.
 *
 * An alias is a **project** fact rather than a graph fact — `@roact` means
 * whatever the repository's `.luaurc` says it means, and two graphs in one
 * project cannot disagree about it. That is why this is here rather than on a
 * node: a specifier the editor accepts has to be one the runtime resolves, and
 * the only thing that knows is a file on disk.
 *
 * No filesystem in this module. The daemon reads the files and the browser
 * build reads them out of its volume; both hand over the same list, nearest
 * first. See `one API, two hosts` — the same reason `project.ts` is the only
 * place that knows what a path is.
 *
 * ## Everything here was checked, not remembered
 *
 * Against [Require by String — Aliases][rfc], 16 September 2026. Quoted where
 * the wording decides a behaviour:
 *
 * - **Inheritance, not replacement.** *"Missing aliases in `.luaurc` are
 *   inherited from the alias maps of any parent directories, and fields can be
 *   overridden."* So a nearer file does not shadow a parent's whole map: it
 *   contributes its own names and the rest still arrive from above.
 * - **Relative paths belong to their definition.** *"If an alias is bound to a
 *   relative path, the path will be evaluated relative to the `.luaurc` file in
 *   which the alias was defined."* Not the requiring file — which is the one
 *   that is easy to get wrong and impossible to notice, because the two agree
 *   whenever the file happens to sit beside the `.luaurc`.
 * - **Names are case-insensitive**, and restricted to `[A-Za-z0-9.\-_]`; they
 *   *"cannot contain the directory separators `/` and `\`"*.
 * - **Chains are followed and cycles are an error.** *"This search continues
 *   iteratively if a chain of aliases must be resolved; if a cycle is detected,
 *   alias resolution will fail with an error."*
 * - **`@` on its own is reserved** and cannot be overridden.
 *
 * One thing the RFC does not settle is whether `.luaurc` may carry comments.
 * It says only that the file *"follows a JSON-like syntax"*. This reader
 * tolerates `//` and block comments and a trailing comma, because the files
 * people actually write have them — that is a tolerance on our side and not a
 * claim about the format, and nothing here ever writes a comment away.
 *
 * [rfc]: https://rfcs.luau.org/require-by-string-aliases.html
 */

/** What may be in an alias name, per the RFC. */
const ALIAS_NAME = /^[A-Za-z0-9.\-_]+$/;

/** Something wrong with a `.luaurc`, said about the file it is wrong in. */
export interface LuaurcProblem {
	severity: "error" | "warning";
	/** The alias this is about, when it is about one. */
	alias?: string;
	message: string;
}

/** One `.luaurc`, parsed. */
export interface Luaurc {
	/**
	 * The directory it sits in, project-relative, with forward slashes and no
	 * trailing slash. `""` is the project root.
	 */
	dir: string;
	/** Its aliases, keyed by the lowercased name — the name a lookup uses. */
	aliases: Map<string, AliasEntry>;
	problems: LuaurcProblem[];
}

export interface AliasEntry {
	/** The name as it was written, which is what a panel should show. */
	name: string;
	/** The value as it was written, which is what gets written back. */
	value: string;
}

/**
 * A `.luaurc` chain for one file: its own directory's first, then upwards.
 *
 * Ordered rather than merged so a panel can say *where* an alias came from,
 * which is the question somebody asks when it is not what they expected.
 */
export type LuaurcChain = readonly Luaurc[];

// ---------------------------------------------------------------------------
// Reading one
// ---------------------------------------------------------------------------

/**
 * JSON with the two things people put in these files anyway.
 *
 * Comments are stripped rather than parsed, which means a `//` inside a string
 * would be eaten — so the scan tracks strings and escapes. Hand-rolled because
 * the alternative is a dependency for forty lines, and because a `.luaurc` that
 * fails to parse has to fail with something a developer can act on.
 */
function stripJsonc(text: string): string {
	let out = "";
	let i = 0;
	let inString = false;

	while (i < text.length) {
		const ch = text[i];
		if (inString) {
			out += ch;
			if (ch === "\\") {
				out += text[i + 1] ?? "";
				i += 2;
				continue;
			}
			if (ch === '"') inString = false;
			i += 1;
			continue;
		}
		if (ch === '"') {
			inString = true;
			out += ch;
			i += 1;
			continue;
		}
		if (ch === "/" && text[i + 1] === "/") {
			while (i < text.length && text[i] !== "\n") i += 1;
			continue;
		}
		if (ch === "/" && text[i + 1] === "*") {
			i += 2;
			while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
			i += 2;
			continue;
		}
		out += ch;
		i += 1;
	}

	// A trailing comma before a closing brace or bracket, which JSON refuses and
	// every editor inserts.
	return out.replace(/,(\s*[}\]])/g, "$1");
}

/**
 * One `.luaurc`'s text, as a map.
 *
 * Never throws: a file somebody is halfway through editing is a normal state,
 * and the answer to it is a problem on the file rather than an editor that
 * stops working. A file that does not parse contributes no aliases, which means
 * the parent's are what apply — the same as if it had none.
 */
export function parseLuaurc(dir: string, text: string): Luaurc {
	const file: Luaurc = { dir, aliases: new Map(), problems: [] };

	let parsed: unknown;
	try {
		parsed = JSON.parse(stripJsonc(text));
	} catch (error) {
		file.problems.push({
			severity: "error",
			message: `This file is not valid JSON, so none of its aliases apply: ${
				error instanceof Error ? error.message : String(error)
			}`,
		});
		return file;
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		file.problems.push({ severity: "error", message: "A `.luaurc` is a JSON object." });
		return file;
	}

	const aliases = (parsed as { aliases?: unknown }).aliases;
	if (aliases === undefined) return file;
	if (typeof aliases !== "object" || aliases === null || Array.isArray(aliases)) {
		file.problems.push({
			severity: "error",
			alias: undefined,
			message: "`aliases` is an object of name to path.",
		});
		return file;
	}

	for (const [name, value] of Object.entries(aliases as Record<string, unknown>)) {
		const key = name.toLowerCase();

		if (typeof value !== "string") {
			file.problems.push({
				severity: "error",
				alias: name,
				message: `\`${name}\` is bound to ${typeof value}. An alias is bound to a path.`,
			});
			continue;
		}
		if (!ALIAS_NAME.test(name)) {
			file.problems.push({
				severity: "error",
				alias: name,
				message:
					`\`${name}\` is not a legal alias name. Letters, digits, \`.\`, \`-\` and \`_\` ` +
					"only — a name cannot contain `/` or `\\`.",
			});
			continue;
		}
		// Case-insensitive, so two spellings of one name in one file is one name
		// written twice and only the developer knows which was meant.
		const seen = file.aliases.get(key);
		if (seen !== undefined) {
			file.problems.push({
				severity: "error",
				alias: name,
				message:
					`\`${seen.name}\` and \`${name}\` are the same alias — names are ` +
					"case-insensitive — and they are bound to different paths here.",
			});
			continue;
		}
		file.aliases.set(key, { name, value });
	}

	return file;
}

// ---------------------------------------------------------------------------
// Resolving through one
// ---------------------------------------------------------------------------

/** Where an alias came from, and what it means. */
export interface Alias {
	/** The name as its definition spells it. */
	name: string;
	/** What the definition binds it to, verbatim. */
	value: string;
	/** The directory of the `.luaurc` that defined it. */
	from: string;
	/**
	 * The path it ends up at, project-relative, with chains followed and
	 * relative values resolved against the file that defined each link.
	 */
	path: string;
}

export type AliasLookup =
	| { t: "found"; alias: Alias }
	| { t: "missing"; name: string }
	| { t: "cycle"; names: string[] };

/**
 * Every alias this chain offers, nearest definition winning.
 *
 * Built by walking from the far end inwards so a nearer file overwrites, which
 * is *"missing aliases ... are inherited ... and fields can be overridden"*
 * said as a loop.
 */
export function aliasesOf(chain: LuaurcChain): Map<string, AliasEntry & { from: string }> {
	const out = new Map<string, AliasEntry & { from: string }>();
	for (let i = chain.length - 1; i >= 0; i -= 1) {
		const file = chain[i];
		for (const [key, entry] of file.aliases) out.set(key, { ...entry, from: file.dir });
	}
	return out;
}

/** `a/b` and `../c` into `a/c`, on project-relative paths with forward slashes. */
function joinPath(dir: string, rest: string): string {
	const parts = dir === "" ? [] : dir.split("/");
	for (const part of rest.split("/")) {
		if (part === "" || part === ".") continue;
		if (part === "..") parts.pop();
		else parts.push(part);
	}
	return parts.join("/");
}

/** The alias part of `@name/rest`, or `null` when it is not an alias at all. */
export function aliasNameOf(specifier: string): string | null {
	const text = specifier.trim();
	if (!text.startsWith("@")) return null;
	return text.slice(1).split("/")[0] ?? "";
}

/** An alias value that is not ours to resolve: it already names a place. */
function isAbsolute(value: string): boolean {
	return value.startsWith("/") || /^[A-Za-z]:[\/]/.test(value);
}

type Landed =
	| { t: "found"; path: string }
	| { t: "missing"; name: string }
	| { t: "cycle"; names: string[] };

/**
 * One link of the chain, and then the rest of it.
 *
 * `walked` carries the names in the order they were followed rather than a
 * bare set, so a cycle can be reported as the ring it is — "roact → ui →
 * roact" is a sentence somebody can act on and "cycle detected" is not.
 */
function land(
	table: Map<string, AliasEntry & { from: string }>,
	key: string,
	walked: string[],
): Landed {
	const entry = table.get(key);
	if (entry === undefined) return { t: "missing", name: key };
	if (walked.includes(entry.name)) return { t: "cycle", names: [...walked, entry.name] };

	const next = aliasNameOf(entry.value);
	if (next === null) {
		// A plain path, resolved against the file that defined *this* link —
		// not against the requiring file, and not against the nearest one.
		return {
			t: "found",
			path: isAbsolute(entry.value) ? entry.value : joinPath(entry.from, entry.value),
		};
	}
	if (next === "") return { t: "missing", name: "@" };

	const tail = entry.value.trim().slice(1).split("/").slice(1).join("/");
	const inner = land(table, next.toLowerCase(), [...walked, entry.name]);
	if (inner.t !== "found") return inner;
	return { t: "found", path: tail === "" ? inner.path : joinPath(inner.path, tail) };
}

/**
 * What `@name` points at in this chain, with a chain of aliases followed.
 *
 * The `Alias` handed back describes the *definition* — its name, what it is
 * bound to and which `.luaurc` said so — with `path` being where the whole
 * chain ends up. A panel wants both: "`@ui` → `@roact/Component`" is what the
 * file says, and the directory is what it means.
 */
export function lookupAlias(chain: LuaurcChain, name: string): AliasLookup {
	const table = aliasesOf(chain);
	const entry = table.get(name.toLowerCase());
	if (entry === undefined) return { t: "missing", name };

	const landed = land(table, name.toLowerCase(), []);
	if (landed.t === "cycle") return landed;
	if (landed.t === "missing") return landed;
	return {
		t: "found",
		alias: { name: entry.name, value: entry.value, from: entry.from, path: landed.path },
	};
}

/**
 * Where a whole specifier lands, or why it does not.
 *
 * `@roact/Component` is the alias's path with `Component` on the end, which is
 * the only part of this a caller usually wants.
 */
export function resolveSpecifier(chain: LuaurcChain, specifier: string): AliasLookup {
	const name = aliasNameOf(specifier);
	if (name === null || name === "") return { t: "missing", name: specifier.trim() };
	const found = lookupAlias(chain, name);
	if (found.t !== "found") return found;
	const tail = specifier.trim().slice(1).split("/").slice(1).join("/");
	if (tail === "") return found;
	return { t: "found", alias: { ...found.alias, path: joinPath(found.alias.path, tail) } };
}
