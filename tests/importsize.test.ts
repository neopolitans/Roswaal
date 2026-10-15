/**
 * Import as graph takes time in step with the file, and takes a file only up
 * to `LARGEST_IMPORT`.
 *
 * An import runs whole, and the daemon answers nothing else while it does.
 * Several of its steps once looked through everything made so far for each
 * statement, so a long file of short statements took minutes. The bounds here
 * are generous, many times what each takes, so a slow machine still passes and
 * a step gone back to looking through everything does not.
 */

import { describe, expect, it } from "vitest";

import { importLuau, LARGEST_IMPORT } from "../src/core/import/fromLuau.js";

function importTime(src: string): number {
	const started = performance.now();
	const result = importLuau(src, { name: "Long", scriptClass: "Script", target: "roblox" });
	if (!result.ok) throw new Error(result.error);
	return performance.now() - started;
}

const SHAPES: [string, (i: number) => string, string?][] = [
	["an elseif chain on one line", (i) => (i === 0 ? "if a then" : " elseif a then"), " end\n"],
	["a statement a line", (i) => `print(${i})\n`],
	["a commented statement a line", (i) => `-- ${i}\nprint(${i})\n`],
	["a local a line", (i) => `local a${i} = ${i}\n`],
	["an if a line", () => "if a then print(1) end\n"],
	["calls kept as code", (i) => `foo(bar${i})\n`],
	[
		"functions of two statements",
		(i) => `local function f${i}()\n\tprint(${i})\n\tprint(1)\nend\n`,
	],
];

describe.each(SHAPES)("a long file of %s", (_shape, line, end = "") => {
	it("imports in time in step with its length", () => {
		const src = Array.from({ length: 20_000 }, (_, i) => line(i)).join("") + end;
		// Under a second on a laptop; it was several, up to minutes, before.
		expect(importTime(src)).toBeLessThan(5000);
	}, 20_000);
});

describe("a file larger than Roswaal imports", () => {
	it("is refused with the limit, before it is parsed", () => {
		const src = `${"-- a comment, and nothing else\n".repeat(LARGEST_IMPORT / 16)}`;
		expect(src.length).toBeGreaterThan(LARGEST_IMPORT);
		const result = importLuau(src, { name: "Large", scriptClass: "Script", target: "roblox" });
		expect(result).toEqual({
			ok: false,
			error: `It is larger than ${LARGEST_IMPORT / 1024 / 1024} MiB, more than Roswaal imports as a graph.`,
		});
	});

	it("is taken up to the limit", () => {
		const src = "print(1)\n".padEnd(LARGEST_IMPORT, " ");
		expect(importLuau(src, { name: "Edge", scriptClass: "Script", target: "roblox" }).ok).toBe(
			true,
		);
	});
});
