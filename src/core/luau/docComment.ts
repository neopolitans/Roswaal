/**
 * The documentation comment written above a declaration, as Moonwave and
 * luau-lsp read one: a `--[=[ … ]=]` block, or a run of `---` lines, directly
 * above the statement, with `@param` and `@return` tags pulled out of it.
 * A blank line between the comment and the statement ends it: the comment
 * then belongs to the file, or to whatever it sat above.
 *
 * A plain `--` comment is not documentation: above a function it is as often
 * a line of code switched off as it is a sentence about the function.
 */

import { tokenize, type Token } from "./lexer.js";

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
	 * that above a declaration is not that declaration's.
	 */
	subject?: { tag: string; name?: string };
}

/** Tags that make a comment about something other than what follows it. */
const ELSEWHERE = new Set(["class", "prop", "type", "interface"]);

/** The doc comment, if it is about a declaration called `name`. */
export function docFor(doc: DocComment | undefined, name: string): DocComment | undefined {
	if (!doc?.subject) return doc;
	if (ELSEWHERE.has(doc.subject.tag)) return undefined;
	return doc.subject.name === undefined || doc.subject.name === name ? doc : undefined;
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
	let block: string | undefined;
	for (; i >= 0; i--) {
		const token = tokens[i];
		if (token.kind === "whitespace") {
			// Directly above: one line break, not a blank line between.
			if ((token.text.match(/\n/g) ?? []).length > 1) break;
			continue;
		}
		if (token.kind !== "comment") break;
		// `--[=[`, with at least one `=`: a `--[[` block is as often code
		// switched off, and Moonwave and luau-lsp read only the other.
		const open = /^--\[(=*)\[/.exec(token.text);
		if (open) {
			if (lines.length === 0 && open[1].length > 0) {
				block = token.text.slice(open[0].length, token.text.length - (open[1].length + 2));
			}
			break;
		}
		if (!token.text.startsWith("---") || token.text.startsWith("----")) break;
		lines.unshift(token.text.slice(3).replace(/^ /, ""));
	}
	const raw = block ?? (lines.length ? lines.join("\n") : undefined);
	return raw === undefined ? undefined : parseDoc(raw);
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
				// Moonwave's `@function Class.name` names it with its owner.
				const named = /^\S+/.exec(rest)?.[0]?.split(/[.:]/).pop();
				doc.subject ??= { tag: name, ...(named ? { name: named } : {}) };
				break;
			}
			// Moonwave's own bookkeeping -- @within, @tag, @since, @class and
			// the rest -- says where a page goes, not what the function does.
		}
	}
	doc.text = prose.join("\n").trim();
	return doc;
}
