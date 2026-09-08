/**
 * The Luau syntax highlighter, driven the way CodeMirror drives it.
 *
 * Written after it took the whole editor down. Opening any `.luau` file
 * containing a `--[[ ]]` comment or a `[[ ]]` string threw, React unmounted,
 * and the page went black with nothing on it — and it had been doing that since
 * the mode was written. Nothing caught it because the only Luau anyone opened
 * was the demo's generated output, which contains neither.
 *
 * The cause is worth stating precisely, because it is invisible in the source.
 * CodeMirror pulls `token` off the parser object and calls it bare —
 * `readToken(streamParser.token, stream, state)` — so `this` inside it is
 * `undefined`, and the two branches that resumed by calling `this.token(...)`
 * threw the moment they were reached. **So these tests call `luauParser.token`
 * detached from the object**, exactly as CodeMirror does. Calling it as a
 * method would pass against the bug.
 */

import { StringStream } from "@codemirror/language";
import { describe, expect, it } from "vitest";

import { luauParser } from "../src/app/luauMode.js";

/** Detached on purpose — binding it here would hide the bug this file exists for. */
const { token } = luauParser;

interface Token {
	text: string;
	style: string | null;
}

/** Tokenises some lines, carrying state across them as an editor would. */
function tokenise(source: string): Token[] {
	const state = luauParser.startState!(2);
	const out: Token[] = [];
	for (const line of source.split("\n")) {
		const stream = new StringStream(line, 4, 2);
		// A blank line still has to advance the parser rather than spin.
		if (line === "") continue;
		while (!stream.eol()) {
			const before = stream.pos;
			const style = token(stream, state);
			if (stream.pos === before) {
				throw new Error(`stalled at ${stream.pos} in ${JSON.stringify(line)}`);
			}
			out.push({ text: line.slice(stream.start, stream.pos), style });
			stream.start = stream.pos;
		}
	}
	return out;
}

const styles = (source: string) => tokenise(source).map((t) => t.style);

describe("long comments and long strings", () => {
	/** The exact shape that blanked the editor. Every native M103 file opens with one. */
	it("does not throw on a block comment", () => {
		expect(() => tokenise("--[[ what this module is for ]]")).not.toThrow();
	});

	it("colours a one-line block comment as a comment", () => {
		expect(styles("--[[ hello ]]")).toEqual(["comment"]);
	});

	it("keeps colouring one that runs over several lines", () => {
		const source = "--[[\n\tstill the comment\n]]\nlocal x = 1";
		const found = tokenise(source);
		expect(found.filter((t) => t.style === "comment").length).toBeGreaterThanOrEqual(3);
		expect(found.some((t) => t.text === "local" && t.style === "keyword")).toBe(true);
	});

	it("handles a long string, and does not call it a comment", () => {
		expect(styles("local s = [[text]]")).toContain("string");
		expect(styles("local s = [[text]]")).not.toContain("comment");
	});

	/** The level has to be remembered, or `]]` inside `[==[ ]==]` closes it early. */
	it("closes a levelled long string only on its own bracket", () => {
		const found = tokenise("local s = [==[ has ]] inside ]==]\nlocal after = 1");
		expect(found.some((t) => t.text === "after")).toBe(true);
		expect(found.filter((t) => t.style === "string").length).toBeGreaterThan(0);
	});

	it("leaves an unterminated block comment open to the end", () => {
		expect(styles("--[[ never closed\nlocal x = 1")).toEqual(["comment", "comment"]);
	});
});

/**
 * The rest of the mode. Thin, because highlighting is not parsing — but each of
 * these is something the stock Lua mode gets wrong, which is why the mode
 * exists at all.
 */
describe("the things Lua's own mode gets wrong", () => {
	it("knows Luau's keywords", () => {
		expect(styles("continue")).toEqual(["keyword"]);
		expect(styles("export type Foo = number")[0]).toBe("keyword");
	});

	it("reads compound assignment as one operator", () => {
		const found = tokenise("x += 1");
		expect(found.find((t) => t.text === "+=")?.style).toBe("operator");
	});

	it("reads integer division as one operator", () => {
		expect(tokenise("a // b").find((t) => t.text === "//")?.style).toBe("operator");
	});

	it("takes an interpolated string whole", () => {
		const found = tokenise("local s = `count {n}`");
		expect(found.find((t) => t.text.startsWith("`"))?.style).toBe("string");
	});

	it("marks Roblox globals apart from ordinary names", () => {
		expect(tokenise("workspace").find((t) => t.text === "workspace")?.style)
			.toBe("variableName.standard");
		expect(tokenise("myThing").find((t) => t.text === "myThing")?.style).toBe("variableName");
	});

	it("does not mistake an exponent's sign for an operator", () => {
		expect(styles("1e-9")).toEqual(["number"]);
		expect(styles("6.02e+23")).toEqual(["number"]);
	});

	it("reads hex and binary whole", () => {
		expect(styles("0x1F")).toEqual(["number"]);
		expect(styles("0b1010")).toEqual(["number"]);
		expect(styles("0x1p4"), "hex takes a p exponent").toEqual(["number"]);
	});
});

/**
 * The property that matters more than any single colour: whatever it is given,
 * it advances and it returns. A tokeniser that stalls hangs the tab, and one
 * that throws takes the editor with it.
 */
describe("never throws and never stalls", () => {
	const awkward = [
		"--[==[ levelled ]==]",
		"local t = { [1] = 2 }",
		"`unterminated interpolation",
		'"unterminated string',
		"[[",
		"]]",
		"--",
		"::label::",
		"local x: { [string]: number } = {}",
		"local f = function(a: string, ...: number) end",
		"0x1F 0b1010 1e-9 .5",
		"a.b:c(d)",
		"\\",
		"«»",
	];

	for (const line of awkward) {
		it(`survives ${JSON.stringify(line)}`, () => {
			expect(() => tokenise(line)).not.toThrow();
		});
	}
});
