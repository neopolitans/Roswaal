/**
 * Imported rows cut by width, and values tucked under the step before (0.180.0).
 *
 * Tidy fills each row on its Sequence up to `ROW_WIDTH` rather than eight
 * statements, a file that fits on one row has no Sequence, and a statement's
 * values sit below the row, under the step before the one that reads them.
 * The compiled Luau is the same as the file's either way.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { graphNameOf, importLuau } from "../src/core/import/fromLuau.js";
import { ROW_WIDTH } from "../src/core/import/rows.js";
import { nodeBounds } from "../src/core/nodeBox.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";

const registry = createRegistry();

function imported(src: string, mode: "tidy" | "verbatim" = "tidy"): NodeScript {
	const { name, scriptClass } = graphNameOf("Test.server.luau");
	const result = importLuau(src, { name, scriptClass, target: "roblox", idPrefix: "t", mode });
	if (!result.ok) throw new Error(result.error);
	return result.script;
}

const body = (s: NodeScript) =>
	compile(s, registry).code.replace(/^[\s\S]*?-- roswaal-output: \w+\n\n/, "");
const sequences = (s: NodeScript) => s.nodes.filter((n) => n.def === "flow.sequence");

/** `count` locals, each set from a call, so each has a value to tuck. */
const locals = (count: number) =>
	Array.from({ length: count }, (_, i) => `local v${i} = math.floor(${i}.5)`).join("\n") +
	"\nprint(v0)\n";

describe("rows cut by width", () => {
	it("keeps a file that fits on one row off a Sequence", () => {
		const src = "local a = 1\nlocal b = 2\nprint(a, b)\n";
		const script = imported(src);
		expect(sequences(script)).toHaveLength(0);
		expect(body(script)).toBe(src);
	});

	it("fills each row up to the width, and compiles back to the file", () => {
		const src = locals(24);
		const script = imported(src);
		const [seq] = sequences(script);
		expect(seq).toBeDefined();
		expect(Number(seq.config?.count)).toBeGreaterThan(1);
		expect(body(script)).toBe(src);
		// No row runs past the width, from where the rows start.
		const start = seq.x + nodeBounds(seq, registry, true).w + 56;
		for (const n of script.nodes) {
			const b = nodeBounds(n, registry, true);
			expect(b.x + b.w - start).toBeLessThanOrEqual(ROW_WIDTH);
		}
	});

	it("leaves Verbatim as one chain", () => {
		expect(sequences(imported(locals(24), "verbatim"))).toHaveLength(0);
	});

	it("never parts a step from the statement reading its result", () => {
		const src = `${locals(14)}local m = require(script.Parent.Module)\nlocal n = require(script.Parent.Other)\nprint(m, n)\n`;
		const script = imported(src);
		expect(body(script)).toBe(src);
		const seq = sequences(script)[0];
		const starts = script.links.filter((l) => l.from.node === seq?.id).map((l) => l.to.node);
		for (const id of starts) {
			const node = script.nodes.find((n) => n.id === id);
			// A row never starts with the Initialize Variable a Require feeds.
			const fedByStep = script.links.some(
				(l) =>
					l.to.node === id &&
					script.nodes.find((n) => n.id === l.from.node)?.def.startsWith("module."),
			);
			expect(node && fedByStep).toBeFalsy();
		}
	});
});

describe("values tucked under the step before", () => {
	it("puts a statement's value below the row, left of its reader, the steps one gap apart", () => {
		const script = imported("local a = math.floor(1.5)\nlocal b = math.floor(2.5)\nprint(a, b)\n");
		const inits = script.nodes.filter((n) => n.def === "variable.init").sort((p, q) => p.x - q.x);
		const second = inits[1];
		const first = inits[0];
		const gap = second.x - (first.x + nodeBounds(first, registry, true).w);
		expect(gap).toBe(56);
		const value = script.nodes.find((n) =>
			script.links.some(
				(l) => l.from.node === n.id && l.to.node === second.id && n.def === "math.floor",
			),
		);
		expect(value).toBeDefined();
		if (!value) return;
		expect(value.x + nodeBounds(value, registry, true).w).toBeLessThanOrEqual(second.x);
		expect(value.y).toBeGreaterThan(second.y);
	});
});
