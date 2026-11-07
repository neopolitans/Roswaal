/**
 * The shapes the viewport draws parts with: every face wound to face out, as
 * the back-face cull keeps only those, and curved ones lit smooth.
 */

import { describe, expect, it } from "vitest";
import { meshFor } from "../src/app/viewport/geometry.js";
import type { SCENE_KINDS } from "../src/core/rbx/scene.js";

/** Each triangle's winding normal and the corners' normals, by triangle. */
function triangles(kind: (typeof SCENE_KINDS)[number]) {
	const { vertices: v, indices } = meshFor(kind);
	const at = (i: number) => [v[i * 6], v[i * 6 + 1], v[i * 6 + 2]];
	const normal = (i: number) => [v[i * 6 + 3], v[i * 6 + 4], v[i * 6 + 5]];
	const out = [];
	for (let t = 0; t < indices.length; t += 3) {
		const [a, b, c] = [at(indices[t]), at(indices[t + 1]), at(indices[t + 2])];
		const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
		const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
		const wound = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
		const centre = [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3);
		out.push({ wound, centre, normals: [indices[t], indices[t + 1], indices[t + 2]].map(normal) });
	}
	return out;
}
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe("The part shapes", () => {
	it("face every triangle outward, caps and all", () => {
		for (const kind of ["block", "cylinder", "ball"] as const)
			for (const t of triangles(kind)) expect(dot(t.wound, t.centre), kind).toBeGreaterThan(0);
	});

	it("closes a cylinder at both ends", () => {
		const caps = triangles("cylinder").filter((t) => Math.abs(Math.abs(t.centre[0]) - 0.5) < 1e-6);
		expect(caps.some((t) => t.centre[0] > 0)).toBe(true);
		expect(caps.some((t) => t.centre[0] < 0)).toBe(true);
	});

	it("lights a cylinder's side and a ball by the surface, not the facet", () => {
		const side = triangles("cylinder").filter((t) => Math.abs(t.centre[0]) < 0.49);
		const t = side[0];
		// Two corners of one side facet point different ways: the normal follows the curve.
		expect(t.normals.some((n) => Math.abs(dot(n, t.normals[0]) - 1) > 1e-3)).toBe(true);
		for (const n of side.flatMap((s) => s.normals)) expect(n[0]).toBeCloseTo(0);
		const ball = triangles("ball")[5];
		expect(ball.normals.some((n) => Math.abs(dot(n, ball.normals[0]) - 1) > 1e-3)).toBe(true);
	});
});
