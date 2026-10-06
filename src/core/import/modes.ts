/**
 * What the import modes change, and what every mode reports.
 *
 * Every mode keeps the file's behaviour as the Luau spec defines it. The
 * modes differ in how the graph reads:
 *
 * - **Verbatim** keeps the source's shapes.
 * - **Tidy**, the default, folds idioms into nodes that read better. Its folds
 *   arrive with the library's template nodes; until then it reads as Verbatim.
 * - **Modern** rewrites to newer syntax where the rewrite is provably the same.
 *
 * A rewrite that cannot be shown to behave the same is not made. And a likely
 * bug in the original is reported in every mode and left as it is: an import
 * that quietly "fixed" it would be a different program.
 */

import type { Block, Expr, Span } from "../luau/ast.js";
import { visitBlock } from "../luau/visit.js";
import type { Target } from "../schema.js";

export type ImportMode = "verbatim" | "tidy" | "modern";

/** What a file-level `local` becomes. */
export type TopLevelLocals = "variable" | "local";

/** Something the report says about a line of the original. */
export interface Finding {
	line: number;
	message: string;
}

/** A piece of the source replaced by other text where it is kept as code. */
export interface Edit extends Span {
	text: string;
}

/**
 * Whether a value is never `false` or `nil`, from its shape alone: a number,
 * a string, `true`, a table, a function. Anything read or worked out could be
 * either, so it is not.
 */
function surelyTruthy(e: Expr): boolean {
	switch (e.kind) {
		case "number":
		case "string":
		case "interpolated":
		case "table":
		case "function":
			return true;
		case "boolean":
			return e.value;
		case "paren":
			return surelyTruthy(e.inner);
		default:
			return false;
	}
}

/** Whether a value is always `false` or `nil`. */
function surelyFalsy(e: Expr): boolean {
	if (e.kind === "paren") return surelyFalsy(e.inner);
	return e.kind === "nil" || (e.kind === "boolean" && !e.value);
}

/** `a and b or c`, as its three parts. */
function andOr(e: Expr): { a: Expr; b: Expr; c: Expr } | undefined {
	if (e.kind !== "binary" || e.op !== "or") return undefined;
	const left = e.left.kind === "paren" ? e.left.inner : e.left;
	if (left.kind !== "binary" || left.op !== "and") return undefined;
	return { a: left.left, b: left.right, c: e.right };
}

function lineOf(src: string, offset: number): number {
	return src.slice(0, offset).split("\n").length;
}

/**
 * Likely bugs in the original, reported in every mode and never changed.
 *
 * `x and false or y` reads as "false when x", and is always `y`: the `or`
 * takes over whenever the middle is false or nil.
 */
export function findLikelyBugs(block: Block, src: string): Finding[] {
	const out: Finding[] = [];
	visitBlock(block, {
		expr(e) {
			const parts = andOr(e);
			if (!parts || !surelyFalsy(parts.b)) return;
			const text = src.slice(e.start, e.end);
			const b = src.slice(parts.b.start, parts.b.end);
			out.push({
				line: lineOf(src, e.start),
				message: `\`${text}\` never gives ${b}; it gives what follows \`or\`. Left as written.`,
			});
		},
	});
	return out;
}

/**
 * The rewrites Modern makes, as edits to the source.
 *
 * `a and b or c` becomes `if a then b else c` only when `b` is surely truthy,
 * because that is the only case in which the two agree. Nested candidates are
 * left to the outer one, so no two edits overlap.
 */
export function modernEdits(block: Block, src: string): Edit[] {
	const out: Edit[] = [];
	const text = (s: Span) => src.slice(s.start, s.end);
	visitBlock(block, {
		expr(e) {
			const parts = andOr(e);
			if (!parts || !surelyTruthy(parts.b)) return;
			out.push({
				start: e.start,
				end: e.end,
				text: `if ${text(parts.a)} then ${text(parts.b)} else ${text(parts.c)}`,
			});
			return false;
		},
	});
	return out;
}

/** The text of `span` with the edits inside it made. */
export function applyEdits(src: string, span: Span, edits: readonly Edit[]): string {
	const inside = edits
		.filter((e) => e.start >= span.start && e.end <= span.end)
		.sort((a, b) => a.start - b.start);
	let out = "";
	let at = span.start;
	for (const edit of inside) {
		if (edit.start < at) continue;
		out += src.slice(at, edit.start) + edit.text;
		at = edit.end;
	}
	return out + src.slice(at, span.end);
}

/**
 * The runtime a file is written for, from what it requires: a `@lune/` module
 * means Lune. Nothing says Roblox as surely, so no answer means the project's.
 */
export function detectTarget(src: string): Target | undefined {
	return /\brequire\s*\(?\s*["']@lune\//.test(src) ? "lune" : undefined;
}
