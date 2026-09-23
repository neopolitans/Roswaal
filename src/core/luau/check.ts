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
import { parseChunk, parseExpression, parseType } from "./parser.js";

export type LuauFragment = "block" | "expression" | "type";

export interface SyntaxProblem {
	message: string;
	/** 1-based, within the text checked. */
	line: number;
	/** Character offsets into the text, so an editor can underline it. */
	from: number;
	to: number;
}

export function checkLuau(source: string, kind: LuauFragment): SyntaxProblem[] {
	const { errors } = kind === "block"
		? parseChunk(source)
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
