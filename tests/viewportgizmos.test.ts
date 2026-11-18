/**
 * The Rendering panel's Light ranges: which lights near the camera are drawn,
 * and the wire lines each kind of light is drawn as.
 */

import { describe, expect, it } from "vitest";
import {
	GIZMO_STEP,
	gizmoCell,
	gizmoColour,
	lightGizmoLines,
	lightLines,
	nearLights,
} from "../src/extensions/placeViewer/app/viewport/gizmos.js";
import {
	LIGHT_POINT,
	LIGHT_SPOT,
	LIGHT_STRIDE,
	LIGHT_SURFACE,
} from "../src/extensions/placeViewer/core/scene.js";

/** One light as `sceneLights` lays it out. */
function light(
	kind: number,
	at: number[],
	range: number,
	opts: { colour?: number[]; dir?: number[]; half?: number; u?: number[]; v?: number[] } = {},
): number[] {
	const { colour = [1, 1, 1], dir = [0, -1, 0], half = 0, u = [0, 0, 0], v = [0, 0, 0] } = opts;
	return [...at, range, ...colour, kind, ...dir, half, ...u, 0, ...v, 0];
}

/** Each line's two ends, as points. */
function ends(lines: ArrayLike<number>): number[][] {
	const out: number[][] = [];
	for (let i = 0; i < lines.length; i += 6) out.push([lines[i], lines[i + 1], lines[i + 2]]);
	return out;
}

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("nearLights", () => {
	it("keeps the lights whose range comes near the camera, nearest first", () => {
		const lights = [
			...light(LIGHT_POINT, [100, 0, 0], 10),
			...light(LIGHT_POINT, [20, 0, 0], 10),
			...light(LIGHT_POINT, [1000, 0, 0], 10),
			// Far off, but its range reaches back toward the camera.
			...light(LIGHT_POINT, [250, 0, 0], 60),
		];
		expect(nearLights(lights, [0, 0, 0], 200)).toEqual([1, 0, 3]);
	});

	it("draws the nearest few at most", () => {
		const lights: number[] = [];
		for (let i = 0; i < 10; i++) lights.push(...light(LIGHT_POINT, [i * 5, 0, 0], 2));
		expect(nearLights(lights, [0, 0, 0], 1000, 3)).toEqual([0, 1, 2]);
	});

	it("has nothing to draw for a place without lights", () => {
		expect(nearLights(undefined, [0, 0, 0])).toEqual([]);
		expect(lightGizmoLines(undefined, [0, 0, 0]).length).toBe(0);
	});
});

describe("lightLines", () => {
	it("draws a PointLight as three circles of its range", () => {
		const out = lightLines(light(LIGHT_POINT, [5, 6, 7], 12));
		expect(out.length % 12).toBe(0);
		const points = ends(out);
		for (const p of points) expect(dist(p, [5, 6, 7])).toBeCloseTo(12, 4);
		// One circle on each plane through the light.
		expect(points.some((p) => Math.abs(p[2] - 7) < 1e-6 && Math.abs(p[0] - 5) > 1)).toBe(true);
		expect(points.some((p) => Math.abs(p[0] - 5) < 1e-6 && Math.abs(p[1] - 6) > 1)).toBe(true);
		expect(points.some((p) => Math.abs(p[1] - 6) < 1e-6 && Math.abs(p[2] - 7) > 1)).toBe(true);
	});

	it("draws a SpotLight's cone within its range and angle", () => {
		const half = Math.PI / 6;
		const out = lightLines(light(LIGHT_SPOT, [0, 10, 0], 20, { dir: [0, -1, 0], half }));
		for (const p of ends(out)) {
			const d = dist(p, [0, 10, 0]);
			expect(d).toBeLessThanOrEqual(20 + 1e-4);
			if (d < 1e-6) continue;
			// Every point is inside the cone: no more than half its angle off straight down.
			const off = Math.acos(Math.min(1, (10 - p[1]) / d));
			expect(off).toBeLessThanOrEqual(half + 1e-4);
		}
		// It reaches its range straight down.
		expect(ends(out).some((p) => dist(p, [0, -10, 0]) < 1e-4)).toBe(true);
	});

	it("draws a SurfaceLight's face and how far it reaches", () => {
		const out = lightLines(
			light(LIGHT_SURFACE, [0, 0, 0], 10, {
				dir: [0, 0, -1],
				half: 0,
				u: [2, 0, 0],
				v: [0, 1, 0],
			}),
		);
		const points = ends(out);
		// Four edges of the face, four of the far end, four between.
		expect(out.length).toBe(12 * 12);
		for (const corner of [
			[-2, -1, 0],
			[2, -1, 0],
			[2, 1, 0],
			[-2, 1, 0],
			[-2, -1, -10],
			[2, 1, -10],
		])
			expect(points.some((p) => dist(p, corner) < 1e-6)).toBe(true);
	});

	it("spreads a SurfaceLight's far end by its angle", () => {
		const out = lightLines(
			light(LIGHT_SURFACE, [0, 0, 0], 10, {
				dir: [0, 0, -1],
				half: Math.PI / 2,
				u: [2, 0, 0],
				v: [0, 1, 0],
			}),
		);
		// At 180 degrees it reaches sideways, in the face's own plane.
		expect(ends(out).some((p) => dist(p, [12, 11, 0]) < 1e-4)).toBe(true);
	});

	it("colours the lines in the light's hue, dimmed", () => {
		const out = lightLines(light(LIGHT_POINT, [0, 0, 0], 4, { colour: [4, 2, 0] }));
		expect([out[3], out[4], out[5]]).toEqual(gizmoColour([4, 2, 0]));
		expect(gizmoColour([4, 2, 0])[0]).toBeLessThan(1);
		expect(gizmoColour([4, 2, 0])[1]).toBeCloseTo(gizmoColour([4, 2, 0])[0] / 2);
		expect(gizmoColour([0, 0, 0])).toEqual([0.7, 0.7, 0.7]);
	});
});

describe("lightGizmoLines", () => {
	it("draws only the lights near the camera", () => {
		const near = light(LIGHT_POINT, [0, 0, 0], 5);
		const far = light(LIGHT_POINT, [5000, 0, 0], 5);
		const one = lightGizmoLines(near, [0, 0, 20]);
		const both = lightGizmoLines([...near, ...far], [0, 0, 20]);
		expect(both.length).toBe(one.length);
		expect(both.length).toBeGreaterThan(0);
		expect(near.length).toBe(LIGHT_STRIDE);
	});

	it("is found again only when the camera moves a step", () => {
		expect(gizmoCell([1, 2, 3])).toBe(gizmoCell([GIZMO_STEP - 1, 2, 3]));
		expect(gizmoCell([1, 2, 3])).not.toBe(gizmoCell([GIZMO_STEP + 1, 2, 3]));
	});
});
