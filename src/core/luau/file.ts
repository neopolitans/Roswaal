/**
 * One Luau source, read once: its tokens, its tree, its errors and its lines.
 *
 * Hover, completion and the checks each ask several questions of the same
 * file -- the locals at a point, the members of a table, the comment above a
 * declaration, the module it returns -- and each question used to tokenise
 * and parse the file again: one hover could parse it nearly twenty times.
 * `luauFile` keeps the last few sources it read, by their text, so every
 * question about the same text shares one reading.
 *
 * Keyed by the text itself, so an edit is a new file and nothing can be
 * stale. What it holds is read-only: a caller that changed the tree would
 * change it for every other caller of the same text.
 */

import type { Block, Diagnostic } from "./ast.js";
import { lineIndex, type Token, tokenize } from "./lexer.js";
import { parseTokens } from "./parser.js";

export interface LuauFile {
	readonly src: string;
	/** Every token, whitespace and comments included, as `tokenize` gives them. */
	readonly tokens: readonly Token[];
	/** The file's statements, as far as they parse. */
	readonly block: Block;
	readonly errors: readonly Diagnostic[];
	/** 1-based line and column of an offset. */
	readonly lineIndex: (offset: number) => { line: number; column: number };
}

/** How many sources are kept: the file being edited, and the modules it requires. */
const KEPT = 16;

const cache = new Map<string, LuauFile>();

/** The source, read: from the cache when the same text was read lately. */
export function luauFile(src: string): LuauFile {
	const kept = cache.get(src);
	if (kept) {
		// Most recently used last, so the oldest is the first to go.
		cache.delete(src);
		cache.set(src, kept);
		return kept;
	}
	const file = read(src);
	cache.set(src, file);
	if (cache.size > KEPT) {
		const oldest = cache.keys().next();
		if (!oldest.done) cache.delete(oldest.value);
	}
	return file;
}

function read(src: string): LuauFile {
	const tokens = tokenize(src);
	const { value, errors } = parseTokens(tokens);
	let lines: LuauFile["lineIndex"] | undefined;
	return {
		src,
		tokens,
		block: value,
		errors,
		// Built on first use: most questions never ask for a line.
		lineIndex: (offset) => (lines ??= lineIndex(src))(offset),
	};
}
