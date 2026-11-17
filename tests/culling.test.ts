/**
 * Culling: parts sorted into chunks, the view's planes, a depth image's
 * test, and the runs a draw is left with.
 */

import { describe, expect, it } from "vitest";
import {
	boxHidden,
	boxInView,
	chunkRows,
	type DepthImage,
	depthCells,
	sameView,
	sidePlanes,
	visibleRuns,
} from "../src/app/viewport/culling.js";
import { lookAt, multiply, perspective } from "../src/app/viewport/math.js";
import { SCENE_STRIDE } from "../src/core/rbx/scene.js";

/** Unit cubes at `points`, each row's whole numbers its own index (and a NaN-like colour). */
function cubes(points: number[][]): Float32Array {
	const data = new Float32Array(points.length * SCENE_STRIDE);
	const words = new Uint32Array(data.buffer);
	points.forEach((p, i) => {
		const o = i * SCENE_STRIDE;
		data.set([1, 0, 0, 0, 1, 0, 0, 0, 1, p[0], p[1], p[2]], o);
		words[o + 12] = 0xffff0000 + i;
		words[o + 13] = i;
		words[o + 14] = 7;
	});
	return data;
}

const view = (eye: number[], at: number[]) =>
	multiply(perspective((70 * Math.PI) / 180, 16 / 9, 0.5, 5000, true, true), lookAt(eye, at));

describe("culling", () => {
	it("sorts parts into chunks of nearby ones, every row kept whole", () => {
		const points = [
			[0, 0, 0],
			[500, 0, 0],
			[1, 1, 1],
			[501, 2, 0],
			[2, 0, 3],
		];
		const { data, chunks } = chunkRows(cubes(points), points.length);
		expect(chunks.length).toBe(2);
		expect(chunks.reduce((n, c) => n + c.count, 0)).toBe(points.length);
		const words = new Uint32Array(data.buffer);
		const ids = [...Array(points.length)].map((_, n) => words[n * SCENE_STRIDE + 13]);
		expect([...ids].sort()).toEqual([0, 1, 2, 3, 4]);
		for (let n = 0; n < points.length; n++) {
			const i = ids[n];
			expect(words[n * SCENE_STRIDE + 12]).toBe(0xffff0000 + i);
			expect(data[n * SCENE_STRIDE + 9]).toBe(points[i][0]);
		}
		// Each chunk's box holds its parts.
		for (const c of chunks)
			for (let n = c.first; n < c.first + c.count; n++)
				for (let a = 0; a < 3; a++) {
					const p = data[n * SCENE_STRIDE + 9 + a];
					expect(p - 0.5).toBeGreaterThanOrEqual(c.min[a]);
					expect(p + 0.5).toBeLessThanOrEqual(c.max[a]);
				}
	});

	it("splits a crowded cell into chunks of at most the most", () => {
		const points = [...Array(10)].map((_, i) => [i * 0.1, 0, 0]);
		const { chunks } = chunkRows(cubes(points), points.length, 32, 4);
		expect(chunks.map((c) => c.count)).toEqual([4, 4, 2]);
	});

	it("keeps a box in view, and leaves out one beside or behind the camera", () => {
		const planes = sidePlanes(view([0, 0, 0], [0, 0, -1]));
		expect(boxInView(planes, [-1, -1, -20], [1, 1, -18])).toBe(true);
		expect(boxInView(planes, [-1, -1, 18], [1, 1, 20])).toBe(false);
		expect(boxInView(planes, [500, -1, -20], [502, 1, -18])).toBe(false);
		// Straddling the edge of the view: in.
		expect(boxInView(planes, [10, -1, -12], [40, 1, -10])).toBe(true);
	});

	it("hides a box only when something nearer is drawn over all of it", () => {
		const vp = view([0, 0, 0], [0, 0, -1]);
		const { cols, rows } = depthCells(1600, 900);
		const wall = (far: number): DepthImage => ({
			cols,
			rows,
			far: new Float32Array(cols * rows).fill(far),
			viewProj: vp,
			eye: [0, 0, 0],
		});
		const behind = [
			[-1, -1, -40],
			[1, 1, -38],
		] as const;
		expect(boxHidden(wall(20), behind[0], behind[1])).toBe(true);
		expect(boxHidden(wall(60), behind[0], behind[1])).toBe(false);
		// A hole in the wall over the box: seen.
		const holed = wall(20);
		holed.far[Math.floor(rows / 2) * cols + Math.floor(cols / 2)] = 1e30;
		expect(boxHidden(holed, behind[0], behind[1])).toBe(false);
		// The eye inside the box, or the box reaching behind the eye: never hidden.
		expect(boxHidden(wall(1), [-1, -1, -1], [1, 1, 1])).toBe(false);
		expect(boxHidden(wall(1), [-1, -1, -40], [1, 1, 10])).toBe(false);
	});

	it("joins neighbouring chunks into runs", () => {
		const chunks = [0, 3, 5, 9, 12].map((first, k, all) => ({
			first,
			count: (all[k + 1] ?? 14) - first,
			min: [0, 0, 0] as [number, number, number],
			max: [0, 0, 0] as [number, number, number],
		}));
		const shown = new Set([0, 1, 3, 4]);
		expect(visibleRuns(chunks, (c) => shown.has(chunks.indexOf(c)))).toEqual([0, 5, 9, 5]);
		expect(visibleRuns(chunks, () => false)).toEqual([]);
	});

	it("knows a depth image of the same view", () => {
		const vp = view([0, 0, 0], [0, 0, -1]);
		expect(sameView(vp, vp)).toBe(true);
		expect(sameView(view([0, 1, 0], [0, 0, -1]), vp)).toBe(false);
		expect(sameView(null, vp)).toBe(false);
	});
});
