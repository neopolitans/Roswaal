/**
 * Unit shapes, centred, spanning -0.5..0.5: a position and a flat normal per
 * vertex (6 floats), and a triangle list, counter-clockwise from outside.
 */

import type { SceneKind } from "../../core/rbx/scene.js";

export interface Mesh {
	vertices: Float32Array;
	indices: Uint16Array;
}

type V3 = [number, number, number];

function build(faces: V3[][]): Mesh {
	const v: number[] = [];
	const idx: number[] = [];
	for (const face of faces) {
		const [a, b, c] = face;
		const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
		const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
		const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
		const l = Math.hypot(n[0], n[1], n[2]) || 1;
		const base = v.length / 6;
		for (const p of face) v.push(p[0], p[1], p[2], n[0] / l, n[1] / l, n[2] / l);
		for (let i = 1; i < face.length - 1; i++) idx.push(base, base + i, base + i + 1);
	}
	return { vertices: new Float32Array(v), indices: new Uint16Array(idx) };
}

const h = 0.5;
function block(): Mesh {
	return build([
		[
			[h, -h, -h],
			[h, h, -h],
			[h, h, h],
			[h, -h, h],
		],
		[
			[-h, -h, h],
			[-h, h, h],
			[-h, h, -h],
			[-h, -h, -h],
		],
		[
			[-h, h, -h],
			[-h, h, h],
			[h, h, h],
			[h, h, -h],
		],
		[
			[-h, -h, h],
			[-h, -h, -h],
			[h, -h, -h],
			[h, -h, h],
		],
		[
			[-h, -h, h],
			[h, -h, h],
			[h, h, h],
			[-h, h, h],
		],
		[
			[h, -h, -h],
			[-h, -h, -h],
			[-h, h, -h],
			[h, h, -h],
		],
	]);
}

// Roblox's wedge: a full bottom and back (+Z), sloping from the top of the
// back down to the bottom of the front.
function wedge(): Mesh {
	return build([
		[
			[-h, -h, h],
			[h, -h, h],
			[h, h, h],
			[-h, h, h],
		],
		[
			[-h, -h, h],
			[-h, -h, -h],
			[h, -h, -h],
			[h, -h, h],
		],
		[
			[-h, h, h],
			[h, h, h],
			[h, -h, -h],
			[-h, -h, -h],
		],
		[
			[h, -h, -h],
			[h, h, h],
			[h, -h, h],
		],
		[
			[-h, -h, h],
			[-h, h, h],
			[-h, -h, -h],
		],
	]);
}

// Near enough for two of them in the place: the top corner over one back corner.
function cornerWedge(): Mesh {
	const top: V3 = [h, h, h];
	return build([
		[
			[-h, -h, h],
			[-h, -h, -h],
			[h, -h, -h],
			[h, -h, h],
		],
		[[-h, -h, h], [h, -h, h], top],
		[[h, -h, h], [h, -h, -h], top],
		[[h, -h, -h], [-h, -h, -h], top],
		[[-h, -h, -h], [-h, -h, h], top],
	]);
}

// Along X, as a Roblox cylinder is.
function cylinder(segments = 24): Mesh {
	const faces: V3[][] = [];
	const ring = (i: number): [number, number] => {
		const a = (i / segments) * Math.PI * 2;
		return [Math.cos(a) * h, Math.sin(a) * h];
	};
	const capL: V3[] = [];
	const capR: V3[] = [];
	for (let i = 0; i < segments; i++) {
		const [y0, z0] = ring(i);
		const [y1, z1] = ring(i + 1);
		faces.push([
			[-h, y0, z0],
			[-h, y1, z1],
			[h, y1, z1],
			[h, y0, z0],
		]);
		capR.push([h, y0, z0]);
		capL.unshift([-h, y0, z0]);
	}
	faces.push(capR.slice().reverse(), capL.slice().reverse());
	return build(faces);
}

function ball(rings = 10, segments = 16): Mesh {
	const faces: V3[][] = [];
	const at = (r: number, s: number): V3 => {
		const t = (r / rings) * Math.PI;
		const p = (s / segments) * Math.PI * 2;
		return [Math.sin(t) * Math.cos(p) * h, Math.cos(t) * h, Math.sin(t) * Math.sin(p) * h];
	};
	for (let r = 0; r < rings; r++) {
		for (let s = 0; s < segments; s++) {
			const a = at(r, s);
			const b = at(r, s + 1);
			const c = at(r + 1, s + 1);
			const d = at(r + 1, s);
			if (r === 0) faces.push([a, c, d]);
			else if (r === rings - 1) faces.push([a, b, d]);
			else faces.push([a, b, c, d]);
		}
	}
	return build(faces);
}

/** A cone along +X, its base at x = -0.5 and its point at +0.5, as the cylinder lies along X. */
function cone(segments = 24): Mesh {
	const v: number[] = [];
	const idx: number[] = [];
	const h = 0.5;
	const slope = Math.atan2(h * 2, h);
	for (let i = 0; i < segments; i++) {
		const a0 = (i / segments) * Math.PI * 2;
		const a1 = ((i + 1) / segments) * Math.PI * 2;
		const am = (a0 + a1) / 2;
		// The side, with a normal leaning towards the point.
		const nx = Math.cos(slope);
		const nr = Math.sin(slope);
		const base = v.length / 6;
		v.push(-h, Math.cos(a0) * h, Math.sin(a0) * h, nx, Math.cos(am) * nr, Math.sin(am) * nr);
		v.push(h, 0, 0, nx, Math.cos(am) * nr, Math.sin(am) * nr);
		v.push(-h, Math.cos(a1) * h, Math.sin(a1) * h, nx, Math.cos(am) * nr, Math.sin(am) * nr);
		idx.push(base, base + 2, base + 1);
		// The base.
		const cap = v.length / 6;
		v.push(
			-h,
			0,
			0,
			-1,
			0,
			0,
			-h,
			Math.cos(a0) * h,
			Math.sin(a0) * h,
			-1,
			0,
			0,
			-h,
			Math.cos(a1) * h,
			Math.sin(a1) * h,
			-1,
			0,
			0,
		);
		// Wound to face -X, away from the point.
		idx.push(cap, cap + 2, cap + 1);
	}
	return { vertices: new Float32Array(v), indices: new Uint16Array(idx) };
}

export function meshFor(kind: SceneKind | "cone"): Mesh {
	switch (kind) {
		case "wedge":
			return wedge();
		case "cornerWedge":
			return cornerWedge();
		case "cylinder":
			return cylinder();
		case "ball":
			return ball();
		case "cone":
			return cone();
		default:
			return block();
	}
}

/** A unit box's twelve edges, as a line list, in the 6-float layout the solids use. */
export function boxEdges(): { vertices: Float32Array; indices: Uint16Array } {
	const h = 0.5;
	const v: number[] = [];
	for (const x of [-h, h])
		for (const y of [-h, h]) for (const z of [-h, h]) v.push(x, y, z, 0, 1, 0);
	const at = (x: number, y: number, z: number) => x * 4 + y * 2 + z;
	const idx: number[] = [];
	for (let a = 0; a < 2; a++)
		for (let b = 0; b < 2; b++) {
			idx.push(at(0, a, b), at(1, a, b), at(a, 0, b), at(a, 1, b), at(a, b, 0), at(a, b, 1));
		}
	return { vertices: new Float32Array(v), indices: new Uint16Array(idx) };
}
