/**
 * The line diff shown before Roswaal overwrites a file it did not write.
 */

import { describe, expect, it } from "vitest";

import { diffLines, shownLines } from "../src/core/lineDiff.js";

describe("a line diff", () => {
	it("keeps what both have and marks what changes", () => {
		expect(diffLines("a\nb\nc", "a\nB\nc")).toEqual([
			{ kind: "same", text: "a" },
			{ kind: "del", text: "b" },
			{ kind: "add", text: "B" },
			{ kind: "same", text: "c" },
		]);
	});

	it("sees CRLF and LF as the same line", () => {
		expect(diffLines("a\r\nb", "a\nb").every((d) => d.kind === "same")).toBe(true);
	});

	it("finds lines added at the end", () => {
		expect(diffLines("a", "a\nb")).toEqual([
			{ kind: "same", text: "a" },
			{ kind: "add", text: "b" },
		]);
	});
});

describe("the shortened view", () => {
	it("folds long unchanged runs to a count, keeping context round each change", () => {
		const before = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
		const after = before.replace("line 10", "line ten");
		const shown = shownLines(diffLines(before, after), 2);
		expect(shown[0]).toEqual({ kind: "gap", count: 8 });
		expect(shown.filter((l) => l.kind === "same")).toHaveLength(4);
		expect(shown.at(-1)).toEqual({ kind: "gap", count: 7 });
	});

	it("is nothing but one gap when nothing changes", () => {
		expect(shownLines(diffLines("a\nb", "a\nb"))).toEqual([{ kind: "gap", count: 2 }]);
	});
});
