import { describe, expect, it } from "vitest";
import {
	nearSkyCentre,
	nearSkyInto,
	SKY_BLOCK,
	SKY_LAYERS,
	SKY_NEAR,
	SKY_NEAR_LAYER,
	SKY_NEAR_STEP,
	skyBlock,
} from "../src/extensions/placeEditor/app/viewport/view.js";

const box = { min: [-5000, -50, -2000], max: [2000, 1800, 2000] };

function project(block: Float32Array, layer: number, p: number[]): number[] {
	const m = block.subarray(layer * 16, layer * 16 + 16);
	return [0, 1, 2, 3].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
}

describe("the near sky maps", () => {
	it("keep their centre to a step, so they are drawn again only once the camera has moved one", () => {
		expect(nearSkyCentre([10, 30, -20])).toEqual([0, SKY_NEAR_STEP, -0]);
		expect(nearSkyCentre([100, 5000, 0])).toEqual([96, 4992, 0]);
	});

	it("follow the whole place's views in the block, with their texel and their box", () => {
		const block = skyBlock(box, [0, 1, 0], true);
		expect(block.length).toBe(SKY_BLOCK);
		nearSkyInto(block, box, [96, 4992, 0], true);
		const at = 16 * SKY_LAYERS;
		expect(block[at + 3]).toBe(1);
		expect(block[at + 7]).toBe(1);
		expect(Array.from(block.subarray(at + 8, at + 12))).toEqual([96, 4992, 0, SKY_NEAR]);
		// A texel well under a wall's width, where the whole place's are many studs.
		expect(block[at + 4]).toBeLessThan(1);
		expect(block[at]).toBeGreaterThan(5);
	});

	it("see their centre in the middle of each map, and the box's corners within it", () => {
		const block = skyBlock(box, [0, 1, 0], true);
		const centre = [96, 4992, 0];
		nearSkyInto(block, box, centre, true);
		for (let k = 0; k < 8; k++) {
			const c = project(block, SKY_NEAR_LAYER + k, centre);
			expect(Math.abs(c[0] / c[3])).toBeLessThan(1e-4);
			expect(Math.abs(c[1] / c[3])).toBeLessThan(1e-4);
			for (const dx of [-1, 1])
				for (const dz of [-1, 1]) {
					const q = project(block, SKY_NEAR_LAYER + k, [
						96 + dx * SKY_NEAR,
						4992 + SKY_NEAR,
						dz * SKY_NEAR,
					]);
					expect(Math.abs(q[0])).toBeLessThanOrEqual(1);
					expect(Math.abs(q[1])).toBeLessThanOrEqual(1);
				}
		}
	});

	it("reach far enough towards the sky to hold a roof far above", () => {
		const block = skyBlock(box, [0, 1, 0], true);
		nearSkyInto(block, box, [0, 0, 0], true);
		// Straight up is the first direction: a roof 1,500 studs up is in front of the map.
		const roof = project(block, SKY_NEAR_LAYER, [0, 1500, 0]);
		const floor = project(block, SKY_NEAR_LAYER, [0, 0, 0]);
		expect(roof[2]).toBeGreaterThanOrEqual(0);
		expect(roof[2]).toBeLessThan(floor[2]);
		expect(floor[2]).toBeLessThanOrEqual(1);
	});
});
