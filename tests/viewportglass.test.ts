/**
 * See-through Glass in the viewport: drawn as a set of its own, so that, as
 * in Studio, no see-through part shows behind it -- unless Settings says
 * otherwise, when every see-through part is drawn together.
 */

import { describe, expect, it } from "vitest";
import { seeThroughSets } from "../src/app/viewport/view.js";
import { MATERIALS } from "../src/core/rbx/materials.js";
import { type PlaceScene, SCENE_KINDS, SCENE_STRIDE } from "../src/core/rbx/scene.js";

const GLASS = MATERIALS.findIndex((m) => m.name === "Glass");
const PLASTIC = MATERIALS.findIndex((m) => m.name === "Plastic");

/** A scene whose see-through blocks have these materials, each id its index. */
function seeThrough(materials: number[]): PlaceScene {
	const empty = () =>
		Object.fromEntries(
			SCENE_KINDS.map((k) => [k, { data: new Float32Array(), count: 0 }]),
		) as PlaceScene["kinds"];
	const data = new Float32Array(materials.length * SCENE_STRIDE);
	const words = new Uint32Array(data.buffer);
	materials.forEach((material, i) => {
		words[i * SCENE_STRIDE + 13] = i;
		// Reflectance in the byte above the material, which the split must ignore.
		words[i * SCENE_STRIDE + 14] = material | (40 << 8);
	});
	const translucent = empty();
	translucent.block = { data, count: materials.length };
	return {
		kinds: empty(),
		translucent,
		centre: [0, 0, 0],
		radius: 50,
		transparent: 0,
	};
}

const ids = (set: { data: Float32Array; count: number }) => {
	const words = new Uint32Array(set.data.buffer, set.data.byteOffset, set.count * SCENE_STRIDE);
	return Array.from({ length: set.count }, (_, i) => words[i * SCENE_STRIDE + 13]);
};

describe("See-through Glass", () => {
	it("is drawn apart from the other see-through parts", () => {
		expect(GLASS).toBeGreaterThanOrEqual(0);
		const { clear, glass } = seeThroughSets(seeThrough([PLASTIC, GLASS, PLASTIC, GLASS]), true);
		expect(ids(glass.block)).toEqual([1, 3]);
		expect(ids(clear.block)).toEqual([0, 2]);
	});

	it("is drawn with the rest when Settings lets parts show through it", () => {
		const { clear, glass } = seeThroughSets(seeThrough([PLASTIC, GLASS]), false);
		expect(glass.block.count).toBe(0);
		expect(ids(clear.block)).toEqual([0, 1]);
	});

	it("leaves a shape with no see-through parts empty in both sets", () => {
		const { clear, glass } = seeThroughSets(seeThrough([GLASS]), true);
		expect(clear.ball.count).toBe(0);
		expect(glass.ball.count).toBe(0);
		expect(clear.block.count).toBe(0);
	});
});
