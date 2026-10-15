/**
 * Realign on the flow layout (0.182.0).
 *
 * It replaced the column layout: a chain of steps runs along a row from the
 * graph's entry, each step's values tucked under the step before, and the
 * graph does not jump -- its entry stays where it was, or a pinned node does.
 * A selection is laid out and put back where it was, a comment is fitted back
 * round what it held, and one marked Preserve nodes on Realign moves as one
 * block with what it holds as it was placed.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { commentContents } from "../src/app/edits.js";
import { nodeBounds } from "../src/app/geometry.js";
import { autoLayout } from "../src/app/layout.js";
import { viewOf } from "../src/core/functionGraph.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

const at = (script: NodeScript, id: string) => script.nodes.find((n) => n.id === id)!;
const box = (script: NodeScript, id: string) => nodeBounds(at(script, id), registry);

/** Script Start, three prints, and a value the second reads -- strewn about. */
function strewn() {
	const b = new Builder();
	const start = b.node("script.begin", { x: 40, y: 60 });
	const first = b.node("debug.print", { x: 700, y: 400 });
	const second = b.node("debug.print", { x: 90, y: 900 });
	const third = b.node("debug.print", { x: 1300, y: 20 });
	const value = b.node("math.floor", { x: 1000, y: 1200 });
	b.link(start, "then", first, "in");
	b.link(first, "then", second, "in");
	b.link(second, "then", third, "in");
	b.link(value, "result", second, "value");
	return { b, start, first, second, third, value };
}

const overlapping = (script: NodeScript) => {
	const boxes = script.nodes.map((n) => nodeBounds(n, registry));
	let count = 0;
	for (let i = 0; i < boxes.length; i++)
		for (let j = i + 1; j < boxes.length; j++) {
			const a = boxes[i];
			const c = boxes[j];
			if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h) count++;
		}
	return count;
};

describe("Realign", () => {
	it("keeps the entry where it was and lays the steps along one row", () => {
		const { b, start, first, second, third } = strewn();
		const out = autoLayout(b.build(), registry, { graph: null });
		expect(at(out, start)).toMatchObject({ x: 40, y: 60 });
		const row = [first, second, third].map((id) => at(out, id));
		expect(new Set(row.map((n) => n.y)).size).toBe(1);
		expect(row[0].x).toBeLessThan(row[1].x);
		expect(row[1].x).toBeLessThan(row[2].x);
		expect(overlapping(out)).toBe(0);
	});

	it("tucks a step's value under the step before it", () => {
		const { b, first, second, value } = strewn();
		const out = autoLayout(b.build(), registry, { graph: null });
		const v = box(out, value);
		expect(v.x + v.w).toBeLessThanOrEqual(at(out, second).x);
		expect(v.y).toBeGreaterThan(at(out, first).y);
	});

	it("leaves a pinned node where it is, and lays the rest out round it", () => {
		const { b, start, second } = strewn();
		const script = b.build();
		at(script, second).pinned = true;
		const out = autoLayout(script, registry, { graph: null });
		expect(at(out, second)).toMatchObject({ x: 90, y: 900 });
		expect(at(out, start).y).toBe(900);
	});

	it("lays a selection out where it was, and leaves the rest alone", () => {
		const { b, start, first, second, third } = strewn();
		const script = b.build();
		const only = new Set([first, second, third]);
		const out = autoLayout(script, registry, { graph: null, only });
		expect(at(out, start)).toMatchObject({ x: 40, y: 60 });
		const before = Math.min(...[...only].map((id) => box(script, id).x));
		const after = Math.min(...[...only].map((id) => box(out, id).x));
		expect(after).toBe(before);
	});

	it("fits a comment back round what it held", () => {
		const { b, second } = strewn();
		const script = b.build({
			comments: [{ id: "c1", x: 60, y: 860, w: 300, h: 200, text: "The second print" }],
		});
		const out = autoLayout(script, registry, { graph: null });
		expect([...commentContents(out, registry, "c1")]).toEqual([second]);
	});

	it("moves a box marked Preserve nodes on Realign as one, with what it holds as placed", () => {
		const { b, second, value } = strewn();
		const script = b.build({
			comments: [{ id: "kept", x: 60, y: 860, w: 1300, h: 560, text: "As placed", preserve: true }],
		});
		const out = autoLayout(script, registry, { graph: null });
		const dx = at(out, second).x - at(script, second).x;
		const dy = at(out, second).y - at(script, second).y;
		expect(at(out, value).x - at(script, value).x).toBe(dx);
		expect(at(out, value).y - at(script, value).y).toBe(dy);
		const kept = out.comments.find((c) => c.id === "kept")!;
		expect({ x: kept.x - 60, y: kept.y - 860, w: kept.w, h: kept.h }).toEqual({
			x: dx,
			y: dy,
			w: 1300,
			h: 560,
		});
	});

	it("lays out a graph of values with no steps, nothing over anything", () => {
		const b = new Builder();
		const a = b.node("math.floor", { x: 0, y: 0 });
		const c = b.node("math.floor", { x: 0, y: 0 });
		const d = b.node("math.floor", { x: 0, y: 0 });
		b.link(a, "result", c, "a");
		b.link(c, "result", d, "a");
		const out = autoLayout(b.build(), registry, {});
		expect(overlapping(out)).toBe(0);
		expect(at(out, a).x).toBeLessThan(at(out, c).x);
		expect(at(out, c).x).toBeLessThan(at(out, d).x);
	});

	it("puts nothing over anything on M103's graphs", () => {
		const dir = path.join(__dirname, "../examples/m103/graph/.roswaal/scripts");
		for (const file of [
			"ServerScriptService/Source/Main.nodescript",
			"ReplicatedStorage/Tank/Occupancy.nodescript",
			"ReplicatedStorage/Tank/Rig.nodescript",
		]) {
			const script = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as NodeScript;
			const graphs = [
				null,
				...script.nodes.filter((n) => n.def === "function.declareHere").map((n) => n.id),
			];
			for (const graph of graphs) {
				const view = viewOf(script, graph);
				const out = autoLayout(view, registry, { graph });
				expect(overlapping(out), `${file} ${graph ?? "main"}`).toBe(0);
			}
		}
	});
});
