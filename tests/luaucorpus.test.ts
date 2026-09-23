/**
 * The Luau reader, run over real game code.
 *
 * The code is not in this repository and must never be added to it. Point
 * `ROSWAAL_LUAU_CORPUS` at a directory of `.luau`/`.lua` files — a private
 * copy, never the originals — and every file is checked; unset, the test is
 * skipped. Failures name the file relative to that directory and stay on the
 * machine that ran them.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { lineIndex, tokenize } from "../src/core/luau/lexer.js";
import { parseChunk } from "../src/core/luau/parser.js";

const root = process.env.ROSWAAL_LUAU_CORPUS;

function luauFiles(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) out.push(...luauFiles(path));
		else if (/\.luau?$/.test(name)) out.push(path);
	}
	return out;
}

describe.skipIf(!root)("the corpus", () => {
	const files = root ? luauFiles(root) : [];

	it("has files to read", () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it("lexes every file losslessly, with no errors", () => {
		const problems: string[] = [];
		for (const file of files) {
			const src = readFileSync(file, "utf8");
			const tokens = tokenize(src);
			const name = relative(root!, file);
			if (tokens.map((t) => t.text).join("") !== src) problems.push(`${name}: not lossless`);
			const at = lineIndex(src);
			for (const bad of tokens.filter((t) => t.kind === "error")) {
				const { line, column } = at(bad.start);
				problems.push(`${name}:${line}:${column}: ${bad.message}`);
			}
		}
		expect(problems).toEqual([]);
	});

	it("parses every file with no errors", () => {
		const problems: string[] = [];
		for (const file of files) {
			const src = readFileSync(file, "utf8");
			const at = lineIndex(src);
			for (const error of parseChunk(src).errors) {
				const { line, column } = at(error.start);
				problems.push(`${relative(root!, file)}:${line}:${column}: ${error.message}`);
			}
		}
		expect(problems).toEqual([]);
	});
});
