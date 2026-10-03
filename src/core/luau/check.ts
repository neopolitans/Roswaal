/**
 * Whether hand-written Luau reads as Luau — as what it is meant to be.
 *
 * Custom Code is a block of statements, a Luau Expression or code typed into a
 * pin is one value, and a Declare Type written out is one type. The text lands
 * in the generated file as it stands, so a mistake in it breaks the file
 * somewhere the developer never wrote; said against the node, with the line
 * and the exact span, it is a mistake they can find.
 *
 * Replaces the bracket-and-keyword balance check, which could not tell a
 * value from a statement and did not know interpolated strings or long
 * brackets with `=` in them. The shape of a problem is the same, so the
 * editor's lint and the compiler read it alike.
 */

import { lineIndex } from "./lexer.js";
import { type ParseOptions, parseChunk, parseExpression, parseType } from "./parser.js";

export type LuauFragment = "block" | "expression" | "type";

export interface SyntaxProblem {
	message: string;
	/** 1-based, within the text checked. */
	line: number;
	/** Character offsets into the text, so an editor can underline it. */
	from: number;
	to: number;
}

/**
 * A node template's placeholders: `$in.force`, `$out.hit`, `$in.name!ident`,
 * and the folds, `$args(, )`, `$opt(, )`, `$index(t, k)`.
 */
const PLACEHOLDER =
	/\$[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?(?:![A-Za-z]+)?(?:\([^)\n]*\))?/g;

/**
 * Checks a node template from Node Design: Luau with placeholders in it.
 *
 * Each placeholder stands where a value will, so it is read as a name of
 * exactly its own length -- `$in.force` as `_in_force` -- and every offset
 * the parser reports is still an offset into the template as written.
 *
 * `kind` says whether the template is statements or one value. Without it
 * either is accepted, and a template that is neither is reported as
 * statements, which is what most templates are.
 */
export function checkTemplate(source: string, kind?: LuauFragment): SyntaxProblem[] {
	const filled = source.replace(PLACEHOLDER, (found) => `_${found.slice(1).replace(/\W/g, "_")}`);
	if (kind) return checkLuau(filled, kind);
	const asBlock = checkLuau(filled, "block");
	if (asBlock.length === 0) return asBlock;
	return checkLuau(filled, "expression").length === 0 ? [] : asBlock;
}

export function checkLuau(
	source: string,
	kind: LuauFragment,
	options: ParseOptions = {},
): SyntaxProblem[] {
	const { errors } =
		kind === "block"
			? parseChunk(source, options)
			: kind === "expression"
				? parseExpression(source)
				: parseType(source);
	const at = lineIndex(source);
	return errors.map((error) => ({
		message: error.message,
		line: at(error.start).line,
		from: error.start,
		// An error at the end of the text still needs a character to mark.
		to: Math.max(error.end, error.start + 1),
	}));
}
