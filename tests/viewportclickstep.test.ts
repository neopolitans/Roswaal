/**
 * What a click on a part in the place viewer picks: the highest Model in
 * Workspace that holds it, and, with Alt-click set to step, one Model further
 * in than what is picked each time, down to the part.
 */

import { describe, expect, it } from "vitest";
import { modelSteps, outermostModel, stepDown } from "../src/app/viewport/marquee.js";
import type { PlaceOutline } from "../src/core/rbx/browse.js";

const classes = ["Workspace", "Model", "Folder", "UnionOperation", "Part"];
const [WORKSPACE, MODEL, FOLDER, UNION, PART] = [0, 1, 2, 3, 4];

/** Workspace > A > B > Things (a Folder) > C > Union, and a few parts beside them. */
const tree: PlaceOutline = {
	classes,
	nodes: [
		[WORKSPACE, "Workspace", -1, 0], // 0
		[MODEL, "A", 0, 0], // 1
		[MODEL, "B", 1, 0], // 2
		[FOLDER, "Things", 2, 0], // 3
		[MODEL, "C", 3, 0], // 4
		[UNION, "Union", 4, 0], // 5
		[PART, "Loose", 0, 0], // 6
		[FOLDER, "Props", 0, 0], // 7
		[PART, "Crate", 7, 0], // 8
		[MODEL, "D", 0, 0], // 9
		[PART, "Wheel", 9, 0], // 10
	],
};
const [A, B, THINGS, C, U, LOOSE, PROPS, CRATE, D, WHEEL] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const ws = 0;

describe("A click on a part", () => {
	it("goes down through the Models that hold it, not its Folders", () => {
		expect(modelSteps(tree, ws, U)).toEqual([A, B, C, U]);
		expect(modelSteps(tree, ws, CRATE)).toEqual([CRATE]);
	});

	it("picks the highest Model in Workspace, or the part outside any", () => {
		expect(outermostModel(tree, ws, U)).toBe(A);
		expect(outermostModel(tree, ws, WHEEL)).toBe(D);
		expect(outermostModel(tree, ws, LOOSE)).toBe(LOOSE);
		expect(outermostModel(tree, ws, CRATE)).toBe(CRATE);
	});
});

describe("An Alt-click that steps down", () => {
	it("picks one Model further in each time, then the part", () => {
		expect(stepDown(tree, ws, U, [A])).toBe(B);
		expect(stepDown(tree, ws, U, [B])).toBe(C);
		expect(stepDown(tree, ws, U, [C])).toBe(U);
	});

	it("stays on the part once it is picked", () => {
		expect(stepDown(tree, ws, U, [U])).toBe(U);
	});

	it("starts one below the outermost Model when nothing picked holds the part", () => {
		expect(stepDown(tree, ws, U, [])).toBe(B);
		expect(stepDown(tree, ws, U, [D])).toBe(B);
		expect(stepDown(tree, ws, WHEEL, [A])).toBe(WHEEL);
	});

	it("goes on from the deepest picked thing that holds the part", () => {
		expect(stepDown(tree, ws, U, [D, B, A])).toBe(C);
	});

	it("steps below a Folder picked in the tree, to the next Model", () => {
		expect(stepDown(tree, ws, U, [THINGS])).toBe(C);
		expect(stepDown(tree, ws, CRATE, [PROPS])).toBe(CRATE);
	});

	it("picks the outermost Model when Workspace itself is picked", () => {
		expect(stepDown(tree, ws, U, [ws])).toBe(A);
	});

	it("picks a part that no Model holds", () => {
		expect(stepDown(tree, ws, LOOSE, [])).toBe(LOOSE);
		expect(stepDown(tree, ws, CRATE, [])).toBe(CRATE);
	});
});
