/**
 * Strings written into generated Luau.
 */

import { describe, expect, it } from "vitest";

import { quoteString } from "../src/core/compiler/quote.js";
import { parseExpression } from "../src/core/luau/parser.js";

describe("a quoted string", () => {
	/** Luau reads up to three digits after a backslash, so `\1` then `2` was `\12`. */
	it("writes a control character as three digits, so a digit after it stays a digit", () => {
		expect(quoteString("\u00012")).toBe('"\\0012"');
		expect(quoteString("a\u007fb")).toBe('"a\\127b"');
	});

	it("is a string Luau parses", () => {
		for (const text of ["\u00012", "tab\there", 'say "hi"', "back\\slash", "\u001f9"]) {
			expect(parseExpression(quoteString(text)).errors).toEqual([]);
		}
	});
});
