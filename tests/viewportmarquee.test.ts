/**
 * The viewport's box select: where a point falls on the view, and which parts
 * a box drawn over it takes, by their centres.
 */

import { describe, expect, it } from "vitest";
import {
	partsInRect,
	rectBetween,
	screenPoint,
	type ViewShot,
} from "../src/extensions/placeEditor/app/viewport/marquee.js";
import { SCENE_STRIDE } from "../src/extensions/placeEditor/core/scene.js";

/** Ten studs back from the origin, looking down -Z, a view twice as wide as it is tall. */
const shot: ViewShot = {
	eye: [0, 0, 10],
	forward: [0, 0, -1],
	right: [1, 0, 0],
	up: [0, 1, 0],
	tan: 1,
	width: 200,
	height: 100,
};

/** A part's scene words: a size and a centre, unrotated. */
function part(size: number[], at: number[]): Float32Array {
	const w = new Float32Array(SCENE_STRIDE);
	w.set([size[0], 0, 0, 0, size[1], 0, 0, 0, size[2], ...at]);
	return w;
}

describe("A point on the view", () => {
	it("is the middle straight ahead", () => {
		expect(screenPoint(shot, [0, 0, 0])).toEqual([100, 50]);
	});

	it("is right and up the way the camera's axes go", () => {
		expect(screenPoint(shot, [10, 0, 0])).toEqual([150, 50]);
		expect(screenPoint(shot, [0, 5, 0])).toEqual([100, 25]);
	});

	it("is nowhere behind the camera", () => {
		expect(screenPoint(shot, [0, 0, 20])).toBeNull();
		expect(screenPoint(shot, [0, 0, 10])).toBeNull();
	});
});

describe("A box drawn over the view", () => {
	it("is the same whichever corner it starts from", () => {
		const box = { left: 10, top: 20, right: 30, bottom: 40 };
		expect(rectBetween(10, 20, 30, 40)).toEqual(box);
		expect(rectBetween(30, 40, 10, 20)).toEqual(box);
		expect(rectBetween(30, 20, 10, 40)).toEqual(box);
	});

	it("takes a part across its edge only when the part's centre is inside", () => {
		const parts = new Map<number, Float32Array>([
			// Centre at x 150, the box's edge at 140: half of it is out, its centre in.
			[1, part([8, 2, 2], [10, 0, 0])],
			// Centre at x 130, outside, though its right end reaches into the box.
			[2, part([8, 2, 2], [6, 0, 0])],
			// Well inside.
			[3, part([1, 1, 1], [12, 0, 0])],
			// Behind the camera, where its centre falls nowhere.
			[4, part([1, 1, 1], [12, 0, 20])],
		]);
		const box = rectBetween(140, 0, 200, 100);
		expect(partsInRect(parts, shot, box)).toEqual([1, 3]);
	});

	it("takes nothing when it holds no centre", () => {
		const parts = new Map([[1, part([2, 2, 2], [0, 0, 0])]]);
		expect(partsInRect(parts, shot, rectBetween(0, 0, 20, 20))).toEqual([]);
	});
});

describe("what a box takes", () => {
	// Workspace 0 holds a Model 1 (holding a Model 2 holding parts 3 and 4, and
	// part 5), a Folder 6 holding a Model 7 holding part 8, and a loose part 9.
	const outline = {
		classes: ["Workspace", "Model", "Part", "Folder"],
		nodes: [
			[0, "Workspace", -1, 0],
			[1, "Ship", 0, 0],
			[1, "Cannon", 1, 0],
			[2, "Barrel", 2, 0],
			[2, "Base", 2, 0],
			[2, "Hull", 1, 0],
			[3, "Props", 0, 0],
			[1, "Lamp", 6, 0],
			[2, "Bulb", 7, 0],
			[2, "Loose", 0, 0],
		] as [number, string, number, number][],
	};

	it("takes each part's outermost Model, once, and the parts no Model holds", async () => {
		const { boxTargets } = await import("../src/extensions/placeEditor/app/viewport/marquee.js");
		expect(boxTargets(outline, 0, [3, 4, 5, 8, 9])).toEqual([1, 7, 9]);
		expect(boxTargets(outline, 0, [9])).toEqual([9]);
		expect(boxTargets(outline, 0, [])).toEqual([]);
	});

	it("picks as a click does: the outermost Model, never the Workspace", async () => {
		const { outermostModel } = await import(
			"../src/extensions/placeEditor/app/viewport/marquee.js"
		);
		expect(outermostModel(outline, 0, 3)).toBe(1);
		expect(outermostModel(outline, 0, 8)).toBe(7);
		expect(outermostModel(outline, 0, 9)).toBe(9);
	});
});
