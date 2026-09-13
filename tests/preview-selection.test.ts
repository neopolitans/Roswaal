/**
 * The selection preview, and the source map it reads.
 *
 * This is the first thing to consume `EmitResult.sourceMap`, so half of what is
 * tested here is really the map: that a statement node's line is attributed to
 * it, and that a pure node inlined into somebody else's line is attributed to
 * nobody. Both matter beyond this feature — Studio errors pointing back at a
 * node is the same lookup in the other direction.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { analyse, fold, previewSelection, type Row } from "../src/app/SelectionPreview.js";

/**
 * `P` with nothing selected previews what is on screen. In a function's tab
 * that is the function, not the file.
 */
describe("previewing with nothing selected", () => {
	function withFunction() {
		const b = new Builder();
		b.node("script.begin");
		const fn = b.node("function.declareHere", { config: { name: "hide", params: [], returns: [] } });
		const inside = b.node("debug.print", { graph: fn });
		const outside = b.node("debug.print");
		return { script: b.build(), fn, inside, outside };
	}

	it("is the function, declaration and graph, in a function's tab", () => {
		const { script, fn, inside, outside } = withFunction();
		const picked = previewSelection(script, fn, new Set());
		expect([...picked].sort()).toEqual([fn, inside].sort());
		expect(picked.has(outside)).toBe(false);
	});

	it("is the whole script in the nodescript's own graph", () => {
		const { script } = withFunction();
		expect(previewSelection(script, null, new Set()).size).toBe(0);
	});

	it("is the selection whenever there is one", () => {
		const { script, fn, outside } = withFunction();
		const selection = new Set([outside]);
		expect(previewSelection(script, fn, selection)).toBe(selection);
	});
});
import { Builder } from "./helpers.js";

const registry = createRegistry();

/** A graph with three prints and a pure sum feeding the middle one. */
function scene() {
	const b = new Builder();
	const start = b.node("script.begin");
	const first = b.node("debug.print");
	const second = b.node("debug.print");
	const third = b.node("debug.print");
	const sum = b.node("math.add");

	b.lit(first, "value", { t: "string", v: "one" });
	b.lit(third, "value", { t: "string", v: "three" });
	b.link(start, "then", first, "in");
	b.link(first, "then", second, "in");
	b.link(second, "then", third, "in");
	b.link(sum, "result", second, "value");

	const script = b.build();
	const result = compile(script, registry);
	return { script, result, ids: { start, first, second, third, sum } };
}

function look(selection: string[]) {
	const { script, result } = scene();
	return analyse({
		script,
		registry,
		selection: new Set(selection),
		code: result.code,
		sourceMap: result.sourceMap,
		onClose: () => {},
	});
}

/**
 * ## The map itself
 *
 * It was **off by one** from the day it was written until this feature read it:
 * the header's line count came from `split("\n").length`, which counts the
 * empty string after the trailing newline as a line. Every entry pointed one
 * line low — the first statement at the line below it, the last node at the
 * blank line ending the file.
 *
 * Nothing noticed because nothing consumed it. Asserted here against the real
 * text rather than against an offset, so the next thing to read the map — Studio
 * errors pointing back at a node — starts from a mapping something has checked.
 */
describe("the source map", () => {
	it("points at the line that is really there", () => {
		const { result, ids } = scene();
		const lines = result.code.split("\n");

		for (const entry of result.sourceMap) {
			expect(lines[entry.line - 1], `line ${entry.line} for ${entry.node}`).toBeDefined();
		}

		const forThird = result.sourceMap.find((e) => e.node === ids.third)!;
		expect(lines[forThird.line - 1]).toContain('print("three")');
	});

	it("never lands on a blank line", () => {
		const { result } = scene();
		const lines = result.code.split("\n");
		for (const entry of result.sourceMap) {
			expect(lines[entry.line - 1].trim(), `line ${entry.line}`).not.toBe("");
		}
	});

	it("does not point into the header", () => {
		const { result } = scene();
		const lines = result.code.split("\n");
		for (const entry of result.sourceMap) {
			expect(lines[entry.line - 1].startsWith("--"), `line ${entry.line}`).toBe(false);
		}
	});
});

describe("attributing lines to nodes", () => {
	it("marks the line a selected statement node produced", () => {
		const { ids } = scene();
		const out = look([ids.third]);
		expect(out.direct).toBe(1);

		const mine = out.rows.filter((r) => r.mine);
		expect(mine).toHaveLength(1);
		expect(text(mine[0])).toContain('print("three")');
	});

	it("marks several when several are selected", () => {
		const { ids } = scene();
		const out = look([ids.first, ids.third]);
		expect(out.direct).toBe(2);
		expect(out.rows.filter((r) => r.mine).map(text).join("\n")).toContain('print("one")');
	});

	/**
	 * The case that would otherwise read as a broken feature. A pure node with
	 * one consumer is spliced into its use site and has no line of its own, so
	 * a naive lookup returns nothing for a perfectly ordinary selection.
	 */
	it("follows a pure node forward to the line its value ends up on", () => {
		const { ids } = scene();
		const out = look([ids.sum]);

		expect(out.direct, "the sum itself produced no line").toBe(0);
		expect(out.inlined, "and the panel says which node that was").toEqual(["Add"]);

		const downstream = out.rows.filter((r) => r.downstream);
		expect(downstream).toHaveLength(1);
		expect(text(downstream[0])).toContain("print(");
	});

	it("does not call a line downstream when it is already the selection's own", () => {
		const { ids } = scene();
		const out = look([ids.sum, ids.second]);
		// The print is the sum's consumer *and* selected. It should read as the
		// selection's own line, not as somewhere its value happened to land.
		expect(out.rows.filter((r) => r.mine)).toHaveLength(1);
		expect(out.rows.filter((r) => r.downstream)).toHaveLength(0);
	});

	it("finds nothing for a node no execution reaches", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const kept = b.node("debug.print");
		const orphan = b.node("debug.print");
		b.link(start, "then", kept, "in");

		const script = b.build();
		const result = compile(script, registry);
		const out = analyse({
			script, registry,
			selection: new Set([orphan]),
			code: result.code,
			sourceMap: result.sourceMap,
			onClose: () => {},
		});
		expect(out.direct).toBe(0);
		expect(out.inlined).toEqual([]);
		expect(out.rows.some((r) => r.mine || r.downstream)).toBe(false);
	});
});

describe("folding the rest of the file away", () => {
	const row = (line: number, mine = false): Row => ({ line, tokens: [], mine, downstream: false });

	it("keeps a couple of lines either side of a marked one", () => {
		const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => row(n, n === 6));
		const kept = fold(rows).filter((r): r is Row => r !== null).map((r) => r.line);
		expect(kept).toEqual([4, 5, 6, 7, 8]);
	});

	it("collapses each run of unmarked lines to one marker, not one per line", () => {
		const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => row(n, n === 6));
		const folds = fold(rows).filter((r) => r === null);
		expect(folds).toHaveLength(2);
	});

	it("leaves a file with nothing marked as a single fold", () => {
		const rows = [1, 2, 3].map((n) => row(n));
		expect(fold(rows)).toEqual([null]);
	});

	it("folds nothing when every line is marked", () => {
		const rows = [1, 2, 3].map((n) => row(n, true));
		expect(fold(rows).some((r) => r === null)).toBe(false);
	});
});

function text(row: Row): string {
	return row.tokens.map((t) => t.text).join("");
}
