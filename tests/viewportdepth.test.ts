/**
 * The place view's depth: reversed under WebGPU, the near plane at 1 and the
 * far one at 0, so a float depth buffer keeps faces a thousandth of a stud
 * apart in order far from the camera.
 */

import { describe, expect, it } from "vitest";
import { perspective } from "../src/app/viewport/math.js";

/** Depth after the divide, for a point this far in front of the camera. */
const depthAt = (m: Float32Array, distance: number) => {
	const z = -distance;
	const clipZ = m[10] * z + m[14];
	const clipW = m[11] * z + m[15];
	return clipZ / clipW;
};

describe("The place view's depth", () => {
	it("puts the near plane at 1 and the far plane at 0 when reversed", () => {
		const m = perspective(1.2, 1.5, 0.5, 40000, true, true);
		expect(depthAt(m, 0.5)).toBeCloseTo(1, 6);
		expect(depthAt(m, 40000)).toBeCloseTo(0, 6);
		// Nearer is greater, all the way out.
		expect(depthAt(m, 10)).toBeGreaterThan(depthAt(m, 11));
	});

	it("tells apart faces a thousandth of a stud apart, a thousand studs out", () => {
		const m = perspective(1.2, 1.5, 2, 40000, true, true);
		const a = Math.fround(depthAt(m, 1000));
		const b = Math.fround(depthAt(m, 1000.001));
		expect(a).toBeGreaterThan(b);
	});

	it("keeps the usual way for WebGL2: near at 0, far at 1 after the divide", () => {
		const m = perspective(1.2, 1.5, 0.5, 40000, true);
		expect(depthAt(m, 0.5)).toBeCloseTo(0, 6);
		expect(depthAt(m, 40000)).toBeCloseTo(1, 6);
	});
});
