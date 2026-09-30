/**
 * The documentation comment written above a declaration: a `--[=[ … ]=]`
 * block or a run of `---` lines, as Moonwave and luau-lsp read one, or the
 * plain `--[[ … ]]` block or `--` lines most code is commented with -- with
 * `@param` and `@return` tags pulled out of any of them. A blank line between
 * the comment and the statement ends it: the comment then belongs to the file,
 * or to whatever it sat above.
 *
 * A plain comment is as often code switched off as it is a sentence about the
 * function, so one whose text reads as Luau is not taken as documentation.
 * Prose does not: "Fires when a player's region changes." is not a statement.
 */

import { tokenize, type Token } from "./lexer.js";
import { parseChunk } from "./parser.js";

export interface DocComment {
	/** The prose, Markdown as written: paragraphs, `code`, and fenced blocks. */
	text: string;
	params: { name: string; type?: string; description?: string }[];
	returns: { type: string; description?: string }[];
	/** Set, possibly empty, when `@deprecated` says so; the text is why. */
	deprecated?: string;
	yields?: boolean;
	errors: { type: string; description?: string }[];
	/**
	 * What Moonwave says the comment is about, when it says: `@class`,
	 * `@prop`, `@type` and `@interface` describe something else, and
	 * `@function name` or `@method name` a function by name. A comment like
	 * that above a declaration is not that declaration's -- unless it names
	 * it: `@class Sift` above `local Sift = {}` is Sift's. `type` is what
	 * `@prop name type` and `@type name type` say it is.
	 */
	subject?: { tag: string; name?: string; type?: string };
	/** `@within Sift`: the class a Moonwave comment belongs to. */
	within?: string;
	/** An `@interface`'s fields, from its `.name type -- text` lines. */
	fields?: { name: string; type?: string; description?: string }[];
	/**
	 * `@interface`s and `@type`s of the same file that the parameters or
	 * returns name, looked up so the tooltip can say what they are.
	 */
	related?: { name: string; type?: string; text: string; fields?: { name: string; type?: string; description?: string }[] }[];
	/**
	 * How it was written: a `--[[ ]]` or `--[=[ ]=]` block, or a run of
	 * `--` or `---` lines. A run of lines at the top of a file is as often a
	 * section heading as a description of the module.
	 */
	style?: "block" | "lines";
}

/** Tags that make a comment about something other than what follows it. */
const ELSEWHERE = new Set(["class", "prop", "type", "interface"]);

/** The doc comment, if it is about a declaration called `name`. */
export function docFor(doc: DocComment | undefined, name: string): DocComment | undefined {
	if (!doc?.subject) return doc;
	// About this very name: `@class Sift` above `local Sift = {}`.
	if (doc.subject.name === name) return doc;
	if (ELSEWHERE.has(doc.subject.tag)) return undefined;
	return doc.subject.name === undefined ? doc : undefined;
}

/** A Moonwave comment that names what it is about, wherever in the file it is. */
export interface DocEntry {
	tag: string;
	name: string;
	within?: string;
	doc: DocComment;
}

/**
 * Every comment in the file that says what it is about -- `@class`, `@prop`,
 * `@type`, `@interface`, `@function`, `@method` -- by name. Moonwave lets
 * these stand anywhere, not above what they describe: Sift lists its
 * submodules as `--- @prop Array Array` lines after the table is built.
 */
export function docRegistry(src: string, tokens: Token[] = tokenize(src)): DocEntry[] {
	const out: DocEntry[] = [];
	for (let i = 0; i < tokens.length; i++) {
		if (tokens[i].kind !== "comment") continue;
		// The last comment of a run: what follows is code, a blank line, or the end.
		let j = i + 1;
		if (tokens[j]?.kind === "whitespace" && (tokens[j].text.match(/\n/g) ?? []).length <= 1) j++;
		if (tokens[j]?.kind === "comment") continue;
		const doc = docCommentBefore(src, tokens[i].end, tokens);
		if (doc?.subject?.name) {
			out.push({ tag: doc.subject.tag, name: doc.subject.name, ...(doc.within ? { within: doc.within } : {}), doc });
		}
	}
	return out;
}

/**
 * A comment for `name` within `owner` from the registry: an `@prop`,
 * `@function` or `@method` of that name, `@within` the owner or said of no
 * class at all.
 */
export function registeredDoc(entries: readonly DocEntry[], name: string, owner?: string): DocComment | undefined {
	const matches = entries.filter((e) =>
		e.name === name && ["prop", "function", "method", "class"].includes(e.tag) && (!e.within || !owner || e.within === owner));
	return (matches.find((e) => e.within === owner) ?? matches[0])?.doc;
}

/** The doc with what its parameter and return types name from the registry. */
export function withRelated(doc: DocComment, entries: readonly DocEntry[]): DocComment {
	const named = new Map(entries.filter((e) => e.tag === "interface" || e.tag === "type").map((e) => [e.name, e]));
	if (named.size === 0) return doc;
	const types = [...doc.params.map((p) => p.type ?? ""), ...doc.returns.map((r) => r.type)].join(" ");
	const related = [...named.values()].filter((e) => new RegExp(`\\b${e.name}\\b`).test(types)).map((e) => ({
		name: e.name,
		...(e.doc.subject?.type ? { type: e.doc.subject.type } : {}),
		text: e.doc.text,
		...(e.doc.fields?.length ? { fields: e.doc.fields } : {}),
	}));
	return related.length ? { ...doc, related } : doc;
}

/** The doc comment ending directly above `offset`, the start of a statement. */
export function docCommentBefore(src: string, offset: number, tokens: Token[] = tokenize(src)): DocComment | undefined {
	// The last token that ends at or before the statement.
	let i = -1;
	for (let lo = 0, hi = tokens.length - 1; lo <= hi; ) {
		const mid = (lo + hi) >> 1;
		if (tokens[mid].end <= offset) {
			i = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	const lines: string[] = [];
	/** Which kind of line comment the run is: `---`, or plain `--`. Never both. */
	let lineKind: "moonwave" | "plain" | undefined;
	let block: string | undefined;
	let plain = false;
	for (; i >= 0; i--) {
		const token = tokens[i];
		if (token.kind === "whitespace") {
			// Directly above: one line break, not a blank line between.
			if ((token.text.match(/\n/g) ?? []).length > 1) break;
			continue;
		}
		if (token.kind !== "comment") break;
		const open = /^--\[(=*)\[/.exec(token.text);
		if (open) {
			if (lines.length === 0) {
				block = token.text.slice(open[0].length, token.text.length - (open[1].length + 2));
				// `--[=[` is Moonwave's; `--[[` is anybody's.
				plain = open[1].length === 0;
			}
			break;
		}
		const kind = /^---(?!-)/.test(token.text) ? "moonwave" : "plain";
		const body = token.text.slice(kind === "moonwave" ? 3 : 2);
		// A rule of dashes, `-- ------` or `----`, separates; it says nothing.
		// A line with nothing on it is a paragraph break within the run.
		if (/^[\s-]*-[\s-]*$/.test(body) || token.text.startsWith("----")) break;
		if (lineKind && kind !== lineKind) break;
		lineKind = kind;
		lines.unshift(body.replace(/^ /, ""));
	}
	if (block === undefined && lineKind === "plain") plain = true;
	const raw = block ?? (lines.length ? lines.join("\n") : undefined);
	if (raw === undefined || raw.trim() === "") return undefined;
	if (plain && readsAsCode(raw)) return undefined;
	return { ...parseDoc(raw), style: block === undefined ? "lines" : "block" };
}

/**
 * Whether a comment's text is Luau rather than words about it: it parses,
 * with at least one statement. Tags are left out first, since `@param x`
 * reads as neither.
 */
function readsAsCode(text: string): boolean {
	const body = text.split("\n").filter((line) => !/^\s*@\w/.test(line)).join("\n").trim();
	if (body === "") return false;
	const parsed = parseChunk(body);
	return parsed.errors.length === 0 && parsed.value.length > 0;
}

/** Lines less the indent they all share, blank edges dropped. */
function dedent(raw: string): string[] {
	const lines = raw.replace(/\r/g, "").split("\n");
	while (lines.length && lines[0].trim() === "") lines.shift();
	while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
	const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)![0].length));
	return lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0));
}

/** `type -- description`, either half optional. */
function typeAndText(rest: string): { type?: string; description?: string } {
	const dash = rest.indexOf("--");
	const type = (dash === -1 ? rest : rest.slice(0, dash)).trim();
	const description = dash === -1 ? "" : rest.slice(dash + 2).trim();
	return { ...(type ? { type } : {}), ...(description ? { description } : {}) };
}

export function parseDoc(raw: string): DocComment {
	const doc: DocComment = { text: "", params: [], returns: [], errors: [] };
	const prose: string[] = [];
	let fenced = false;
	for (const line of dedent(raw)) {
		if (/^\s*```/.test(line)) fenced = !fenced;
		const tag = fenced ? null : /^\s*@(\w+)\s*(.*)$/.exec(line);
		if (!tag) {
			prose.push(line);
			continue;
		}
		const [, name, rest] = tag;
		switch (name) {
			case "param": {
				const [, param = "", after = ""] = /^(\S+)\s*(.*)$/.exec(rest) ?? [];
				if (param) doc.params.push({ name: param, ...typeAndText(after) });
				break;
			}
			case "return": {
				const { type, description } = typeAndText(rest);
				if (type) doc.returns.push({ type, ...(description ? { description } : {}) });
				break;
			}
			case "error": {
				const { type, description } = typeAndText(rest);
				if (type) doc.errors.push({ type, ...(description ? { description } : {}) });
				break;
			}
			case "deprecated":
				doc.deprecated = typeAndText(rest).description ?? rest.trim();
				break;
			case "yields":
				doc.yields = true;
				break;
			case "class":
			case "prop":
			case "type":
			case "interface":
			case "function":
			case "method": {
				// Moonwave's `@function Class.name` names it with its owner, and
				// `@prop name type` / `@type name type` say what it is.
				const [, first = "", after = ""] = /^(\S+)\s*(.*)$/.exec(rest) ?? [];
				const named = first.split(/[.:]/).pop();
				const type = (name === "prop" || name === "type") ? typeAndText(after).type : undefined;
				doc.subject ??= { tag: name, ...(named ? { name: named } : {}), ...(type ? { type } : {}) };
				break;
			}
			case "within":
				if (rest.trim()) doc.within = rest.trim();
				break;
			// Moonwave's own bookkeeping -- @within, @tag, @since, @class and
			// the rest -- says where a page goes, not what the function does.
		}
	}
	// An `@interface`'s `.name type -- text` lines are its fields, not prose.
	if (doc.subject?.tag === "interface") {
		const kept: string[] = [];
		for (const line of prose) {
			const field = /^\s*\.([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/.exec(line);
			if (!field) {
				kept.push(line);
				continue;
			}
			(doc.fields ??= []).push({ name: field[1], ...typeAndText(field[2]) });
		}
		prose.splice(0, prose.length, ...kept);
	}
	doc.text = prose.join("\n").trim();
	return doc;
}
