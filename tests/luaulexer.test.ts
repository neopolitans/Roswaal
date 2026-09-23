/**
 * The Luau lexer: every token the language has, and nothing lost.
 *
 * Each sample here is written for the test. The lexer is also run over real
 * game code kept outside this repository — see `luaucorpus.test.ts`.
 */

import { describe, expect, it } from "vitest";

import { lineIndex, significant, tokenize, type Token } from "../src/core/luau/lexer.js";

/** The significant tokens as `kind:text`, for compact expectations. */
function lex(src: string): string[] {
	return significant(tokenize(src))
		.filter((t) => t.kind !== "eof")
		.map((t) => `${t.kind}:${t.text}`);
}

function errors(src: string): Token[] {
	return tokenize(src).filter((t) => t.kind === "error");
}

describe("lossless", () => {
	const samples = [
		"local x = 1\r\nprint(x)\r\n",
		"-- a comment\n--[==[ long\ncomment ]==]\nreturn nil",
		"local s = `a {b} c {d} e`\t\n",
		"local t = { [ [[k]] ] = [=[v]]=], }",
		"x //= 2; y ..= 'z'",
	];
	for (const src of samples) {
		it(`gives back ${JSON.stringify(src.slice(0, 24))}… exactly`, () => {
			const tokens = tokenize(src);
			expect(tokens.map((t) => t.text).join("")).toBe(src);
			expect(tokens.at(-1)!.kind).toBe("eof");
			for (let k = 1; k < tokens.length; k++) expect(tokens[k].start).toBe(tokens[k - 1].end);
		});
	}
});

describe("names and keywords", () => {
	it("keeps reserved words apart from names", () => {
		expect(lex("local function f() end")).toEqual([
			"keyword:local", "keyword:function", "name:f", "symbol:(", "symbol:)", "keyword:end",
		]);
	});

	it("leaves Luau's contextual words as names", () => {
		expect(lex("continue type export typeof")).toEqual([
			"name:continue", "name:type", "name:export", "name:typeof",
		]);
	});
});

describe("numbers", () => {
	it("reads every form Luau has", () => {
		expect(lex("1 1.5 .5 5. 1e10 2E-3 0xFF_FF 0b1010_0101 1_000_000")).toEqual([
			"number:1", "number:1.5", "number:.5", "number:5.", "number:1e10", "number:2E-3",
			"number:0xFF_FF", "number:0b1010_0101", "number:1_000_000",
		]);
	});

	it("does not take a range for a fraction", () => {
		expect(lex("1..2")).toEqual(["number:1", "symbol:..", "number:2"]);
	});

	it("refuses a number run into a name", () => {
		expect(errors("local x = 3abc")[0].message).toBe("This is not a number Luau can read.");
	});
});

describe("strings", () => {
	it("reads both quotes, with escapes", () => {
		expect(lex(String.raw`"a\"b" 'c\'d' "\u{48}\x41\65\z
			tail"`)).toEqual([
			String.raw`string:"a\"b"`, String.raw`string:'c\'d'`,
			"string:\"\\u{48}\\x41\\65\\z\n\t\t\ttail\"",
		]);
	});

	it("reads long strings at any level", () => {
		expect(lex("[[a]] [=[b]]c]=] [==[d]=]e]==]")).toEqual([
			"string:[[a]]", "string:[=[b]]c]=]", "string:[==[d]=]e]==]",
		]);
	});

	it("reports a string left open at the end of the line, and carries on", () => {
		const tokens = tokenize("local s = \"open\nlocal t = 1");
		const bad = tokens.find((t) => t.kind === "error")!;
		expect(bad.message).toBe("This string is not closed before the end of the line.");
		expect(significant(tokens).map((t) => t.text)).toContain("t");
	});

	it("reports a long string never closed", () => {
		expect(errors("x = [==[ never")[0].message).toBe("This string is not closed before the end of the code.");
	});
});

describe("interpolated strings", () => {
	it("is one token with no holes", () => {
		expect(lex("`plain`")).toEqual(["interpSimple:`plain`"]);
	});

	it("splits around each hole, and lexes the hole as Luau", () => {
		expect(lex("`a {b + 1} c {d} e`")).toEqual([
			"interpBegin:`a {", "name:b", "symbol:+", "number:1", "interpMid:} c {", "name:d", "interpEnd:} e`",
		]);
	});

	it("counts a table inside a hole, so its brace does not end the hole", () => {
		expect(lex("`n = {#{1, 2}}`")).toEqual([
			"interpBegin:`n = {", "symbol:#", "symbol:{", "number:1", "symbol:,", "number:2", "symbol:}",
			"interpEnd:}`",
		]);
	});

	it("nests one interpolated string inside another", () => {
		expect(lex("`a {`b {c}`} d`")).toEqual([
			"interpBegin:`a {", "interpBegin:`b {", "name:c", "interpEnd:}`", "interpEnd:} d`",
		]);
	});

	it("keeps an escaped brace in the text", () => {
		expect(lex("`\\{not a hole}`")).toEqual(["interpSimple:`\\{not a hole}`"]);
	});
});

describe("comments", () => {
	it("keeps them out of what the parser reads", () => {
		expect(lex("a -- note\n--[[ block ]] b --[=[ x ]=] c")).toEqual(["name:a", "name:b", "name:c"]);
	});

	it("does not take a dash dash inside a string for a comment", () => {
		expect(lex("'--no'")).toEqual(["string:'--no'"]);
	});
});

describe("symbols", () => {
	it("takes the longest one", () => {
		expect(lex("... .. . //= // / ..= :: : -> - ~= == =")).toEqual([
			"symbol:...", "symbol:..", "symbol:.", "symbol://=", "symbol://", "symbol:/", "symbol:..=",
			"symbol:::", "symbol::", "symbol:->", "symbol:-", "symbol:~=", "symbol:==", "symbol:=",
		]);
	});

	it("reads type syntax as symbols the parser can use", () => {
		expect(lex("x :: Part? | { [string]: number } & T<U...>")).toEqual([
			"name:x", "symbol:::", "name:Part", "symbol:?", "symbol:|", "symbol:{", "symbol:[", "name:string",
			"symbol:]", "symbol::", "name:number", "symbol:}", "symbol:&", "name:T", "symbol:<", "name:U",
			"symbol:...", "symbol:>",
		]);
	});

	it("reads an attribute", () => {
		expect(lex("@native function f() end").slice(0, 2)).toEqual(["symbol:@", "name:native"]);
	});

	it("reports a character that is not Luau, and carries on", () => {
		const tokens = tokenize("a $ b");
		expect(tokens.find((t) => t.kind === "error")!.message).toBe('"$" is not part of Luau.');
		expect(lex("a $ b").at(-1)).toBe("name:b");
	});
});

describe("lineIndex", () => {
	it("turns offsets into lines and columns", () => {
		const at = lineIndex("ab\ncd\n\nef");
		expect(at(0)).toEqual({ line: 1, column: 1 });
		expect(at(4)).toEqual({ line: 2, column: 2 });
		expect(at(7)).toEqual({ line: 4, column: 1 });
	});
});
