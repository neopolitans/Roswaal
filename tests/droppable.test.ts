/**
 * Every drag the panels start, the canvas accepts.
 *
 * A drop target has to cancel `dragover` before the browser will let anything
 * land, so the canvas keeps a list of the kinds it takes — and a kind missing
 * from it fails with no error, because `onDrop` is simply never called. Get
 * Function's drop had been written since 0.32.0 and could not be reached for
 * that reason alone. Read from the source rather than rendered, because the
 * question is whether three lists written in two files agree.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const canvas = read("src/app/Canvas.tsx");
const panel = read("src/app/VariablesPanel.tsx");

const kinds = (source: string, call: "setData" | "getData") =>
	new Set([...source.matchAll(new RegExp(`${call}\\("(application/x-roswaal[\\w-]*)"`, "g"))].map((m) => m[1]));

const droppable = new Set(
	[...canvas.match(/export const DROPPABLE = \[([\s\S]*?)\]/)![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]),
);

describe("what the canvas accepts", () => {
	it("takes everything the Variables panel drags out", () => {
		const dragged = kinds(panel, "setData");
		expect(dragged.size).toBeGreaterThan(0);
		for (const kind of dragged) expect(droppable, kind).toContain(kind);
	});

	it("takes everything its own drop reads", () => {
		for (const kind of kinds(canvas, "getData")) expect(droppable, kind).toContain(kind);
	});

	it("takes a function, for a Get Function", () => {
		expect(droppable).toContain("application/x-roswaal-function");
	});
});
