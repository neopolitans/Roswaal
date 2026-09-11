/**
 * The Z-up conversions.
 *
 * The rotation is the one worth checking by arithmetic rather than by eye. A
 * quaternion from an X-forward, Y-right, Z-up tool is carried into Roblox by
 * rewriting its vector part as (-y, -z, x) -- shorthand for conjugating its
 * rotation matrix by the change of axes, where that change flips handedness.
 * So the test does the long version: rotate a vector in the source's axes,
 * move the result across, and compare with moving the vector across first and
 * rotating it by the converted quaternion. The two paths have to meet.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { Literal } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

type V = [number, number, number];
type Q = { x: number; y: number; z: number; w: number };

/** Source axes to Roblox's: forward X becomes -Z, right Y becomes X, up Z becomes Y. */
const across = ([x, y, z]: V): V => [y, z, -x];

/** Rotates `v` by unit quaternion `q`, as v' = q v q*. */
function rotate(q: Q, [vx, vy, vz]: V): V {
	const { x, y, z, w } = q;
	// t = 2 * (q.xyz × v); v' = v + w t + q.xyz × t
	const tx = 2 * (y * vz - z * vy);
	const ty = 2 * (z * vx - x * vz);
	const tz = 2 * (x * vy - y * vx);
	return [
		vx + w * tx + (y * tz - z * ty),
		vy + w * ty + (z * tx - x * tz),
		vz + w * tz + (x * ty - y * tx),
	];
}

/** What CFrame from Z-Up Rotation does to a quaternion, in its argument order. */
const converted = (q: Q): Q => ({ x: -q.y, y: -q.z, z: q.x, w: q.w });

function normalised(q: Q): Q {
	const length = Math.hypot(q.x, q.y, q.z, q.w);
	return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

function compiled(def: string, literals: Record<string, Literal>): string {
	const b = new Builder();
	const start = b.node("script.begin");
	const node = b.node(def, { literals });
	const print = b.node("debug.print");
	b.link(start, "then", print, "in");
	b.link(node, def === "zup.transform" ? "cframe" : "result", print, "value");
	const result = compile(b.build(), registry);
	expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	return body(result.code);
}

describe("CFrame from Z-Up Rotation", () => {
	const quaternions: Q[] = [
		// A quarter turn about up: forward swings to the right.
		{ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 },
		{ x: 0.2, y: -0.4, z: 0.1, w: 0.9 },
		{ x: -0.7, y: 0.1, z: 0.5, w: -0.3 },
	].map(normalised);
	const vectors: V[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [3, -2, 5]];

	it("rotates a vector across the same way either way round", () => {
		for (const q of quaternions) {
			for (const v of vectors) {
				const viaSource = across(rotate(q, v));
				const viaRoblox = rotate(converted(q), across(v));
				for (let i = 0; i < 3; i++) expect(viaRoblox[i]).toBeCloseTo(viaSource[i], 10);
			}
		}
	});

	it("turns forward to the right for a quarter turn about up", () => {
		// Forward is -Z in Roblox and right is +X.
		const turned = rotate(converted(quaternions[0]), [0, 0, -1]);
		expect(turned[0]).toBeCloseTo(1, 10);
		expect(turned[2]).toBeCloseTo(0, 10);
	});

	it("puts the quaternion's parts where the arithmetic above assumes", () => {
		expect(compiled("zup.rotation", {
			x: { t: "number", v: 1 }, y: { t: "number", v: 2 },
			z: { t: "number", v: 3 }, w: { t: "number", v: 4 },
		})).toContain("CFrame.new(0, 0, 0, -(2), -(3), 1, 4)");
	});
});

/**
 * The source tool's own rotator-to-quaternion formula, in degrees: roll, then
 * pitch, then yaw, with pitch and roll turning against the right-hand rule.
 */
function rotatorQuat(pitch: number, yaw: number, roll: number): Q {
	const half = Math.PI / 360;
	const [sp, cp] = [Math.sin(pitch * half), Math.cos(pitch * half)];
	const [sy, cy] = [Math.sin(yaw * half), Math.cos(yaw * half)];
	const [sr, cr] = [Math.sin(roll * half), Math.cos(roll * half)];
	return {
		x: cr * sp * sy - sr * cp * cy,
		y: -cr * sp * cy - sr * cp * sy,
		z: cr * cp * sy - sr * sp * cy,
		w: cr * cp * cy + sr * sp * sy,
	};
}

// Roblox's rotations about its own axes, right-handed.
const rx = (a: number) => ([x, y, z]: V): V =>
	[x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
const ry = (a: number) => ([x, y, z]: V): V =>
	[x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
const rz = (a: number) => ([x, y, z]: V): V =>
	[x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];

/** `CFrame.fromEulerAnglesYXZ(ax, ay, az)`: Z applied first, then X, then Y. */
const yxz = (ax: number, ay: number, az: number) => (v: V): V => ry(ay)(rx(ax)(rz(az)(v)));

/** What CFrame from Z-Up Rotator's template does, in degrees. */
const rotator = (pitch: number, yaw: number, roll: number) => {
	const rad = Math.PI / 180;
	return yxz(pitch * rad, -yaw * rad, -roll * rad);
};

describe("CFrame from Z-Up Rotator", () => {
	const rotators: [number, number, number][] = [[0, 90, 0], [30, -45, 10], [-60, 120, 75]];
	const vectors: V[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [3, -2, 5]];

	it("agrees with the quaternion the source tool would compute", () => {
		for (const [p, y, r] of rotators) {
			for (const v of vectors) {
				const viaSource = across(rotate(rotatorQuat(p, y, r), v));
				const viaRoblox = rotator(p, y, r)(across(v));
				for (let i = 0; i < 3; i++) expect(viaRoblox[i]).toBeCloseTo(viaSource[i], 10);
			}
		}
	});

	// Forward is -Z in Roblox, right is +X and up is +Y.
	it("turns forward to the right for positive yaw", () => {
		const v = rotator(0, 90, 0)([0, 0, -1]);
		expect(v[0]).toBeCloseTo(1, 10);
	});

	it("tilts forward up for positive pitch", () => {
		const v = rotator(90, 0, 0)([0, 0, -1]);
		expect(v[1]).toBeCloseTo(1, 10);
	});

	it("tips the right side down for positive roll", () => {
		const v = rotator(0, 0, 90)([1, 0, 0]);
		expect(v[1]).toBeCloseTo(-1, 10);
	});

	it("writes the conversion into the call it compiles to", () => {
		expect(compiled("zup.rotator", {
			pitch: { t: "number", v: 10 }, yaw: { t: "number", v: -20 }, roll: { t: "number", v: 30 },
		})).toContain("CFrame.fromEulerAnglesYXZ(math.rad(10), -math.rad(-20), -math.rad(30))");
	});
});

describe("Vector3 from Z-Up", () => {
	it("swaps the axes and divides by units per stud", () => {
		expect(compiled("zup.vector3", {
			x: { t: "number", v: 100 }, y: { t: "number", v: 20 }, z: { t: "number", v: 5 },
		})).toContain("Vector3.new(20, 5, -(100)) / 28");
	});

	/** The trap the template is written around: `-` then `-3` is `--3`, a comment. */
	it("never writes two minus signs together", () => {
		const code = compiled("zup.vector3", {
			x: { t: "number", v: -3 }, y: { t: "number", v: -1 }, z: { t: "number", v: -2 },
		});
		expect(code).not.toContain("--");
		expect(code).toContain("-(-3)");
	});
});

describe("CFrame from Z-Up Transform", () => {
	it("scales the location, converts the rotation, and hands scale back on its own", () => {
		const code = compiled("zup.transform", {
			lx: { t: "number", v: 280 }, ly: { t: "number", v: 56 }, lz: { t: "number", v: 28 },
		});
		expect(code).toContain("CFrame.new(56 / 28, 28 / 28, -(280) / 28, -(0), -(0), 0, 1)");
	});

	it("swaps scale's axes without changing its sign", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const node = b.node("zup.transform", {
			literals: { sx: { t: "number", v: 2 }, sy: { t: "number", v: 3 }, sz: { t: "number", v: 4 } },
		});
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		b.link(node, "scale", print, "value");
		expect(body(compile(b.build(), registry).code)).toContain("Vector3.new(3, 4, 2)");
	});
});
