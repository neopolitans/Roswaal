/**
 * The Upkeep workflow's release watch: comparing versions the way release
 * pages write them, and the list of what it watches.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { newer } from "../scripts/upkeep/versions.mjs";

describe("comparing releases", () => {
	it.each([
		["v0.11.1", "0.10.5", true],
		["0.746", "0.746", false],
		["0.747", "0.746", true],
		["v2.6.0", "2.6.0", false],
		["2.10.0", "2.9.9", true],
		["1.0", "1.0.1", false],
		["v7.7.1", "7.7.1", false],
	])("%s is newer than %s: %s", (a, b, expected) => {
		expect(newer(a, b)).toBe(expected);
	});
});

describe("what the release watch watches", () => {
	const list = JSON.parse(readFileSync(".github/upkeep/upstream.json", "utf8")) as {
		sources: Record<string, { from: string; seen: string; why: string }>;
	};

	it("names where each comes from, what was last seen, and why it matters", () => {
		for (const [key, source] of Object.entries(list.sources)) {
			expect(source.from, key).toMatch(/^(github:[\w.-]+\/[\w.-]+|npm:@?[\w./-]+)$/);
			expect(source.seen, key).toMatch(/^\d+(\.\d+)*$/);
			expect(source.why.length, key).toBeGreaterThan(10);
		}
	});

	it("has seen the Lune and Material Symbols versions the builds are pinned to, or later", () => {
		const lune = readFileSync("scripts/build-lune.mjs", "utf8").match(
			/LUNE_VERSION = "([^"]+)"/,
		)?.[1];
		const material = readFileSync("scripts/build-class-icons.mjs", "utf8").match(
			/MATERIAL = "([^"]+)"/,
		)?.[1];
		expect(newer(lune!, list.sources.lune.seen)).toBe(false);
		expect(newer(material!, list.sources["material-symbols"].seen)).toBe(false);
	});
});
