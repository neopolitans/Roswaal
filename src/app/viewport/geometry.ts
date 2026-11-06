/**
 * Unit shapes, centred, spanning -0.5..0.5: a position and a flat normal per
 * vertex (6 floats), and a triangle list, counter-clockwise from outside.
 */

import { MATERIAL_SHADE, MATERIALS } from "../../core/rbx/materials.js";
import {
	type PlaceScene,
	SCENE_KINDS,
	SCENE_STRIDE,
	type SceneKind,
} from "../../core/rbx/scene.js";

/**
 * The nearest part a ray from `o` along `d` meets, by its id, or -1: each
 * part's own shape -- a box, a wedge, a cylinder along X, a ball; a corner
 * wedge and a MeshPart as their boxes -- in its own unit space, where the
 * ray's distance along itself is the same as in the world. A part the ray
 * starts inside is passed through, as the view draws it from inside.
 */
export function rayPick(scene: PlaceScene, o: number[], d: number[]): number {
	let best = Infinity;
	let found = -1;
	for (const set of [scene.kinds, scene.translucent])
		for (const kind of SCENE_KINDS) {
			const { data, count } = set[kind];
			const words = new Uint32Array(data.buffer, data.byteOffset, data.length);
			for (let i = 0; i < count; i++) {
				const at = i * SCENE_STRIDE;
				// Into the part's unit space: each column's share, over its length squared.
				const ox = o[0] - data[at + 9];
				const oy = o[1] - data[at + 10];
				const oz = o[2] - data[at + 11];
				const lo = [0, 0, 0];
				const ld = [0, 0, 0];
				for (let a = 0; a < 3; a++) {
					const cx = data[at + a * 3];
					const cy = data[at + a * 3 + 1];
					const cz = data[at + a * 3 + 2];
					const ss = cx * cx + cy * cy + cz * cz || 1e-9;
					lo[a] = (cx * ox + cy * oy + cz * oz) / ss;
					ld[a] = (cx * d[0] + cy * d[1] + cz * d[2]) / ss;
				}
				let near = -Infinity;
				let far = Infinity;
				// The unit box's slabs, along each axis.
				const slab = (a: number) => {
					if (Math.abs(ld[a]) < 1e-12) {
						if (Math.abs(lo[a]) > 0.5) far = -Infinity;
						return;
					}
					let t0 = (-0.5 - lo[a]) / ld[a];
					let t1 = (0.5 - lo[a]) / ld[a];
					if (t0 > t1) [t0, t1] = [t1, t0];
					near = Math.max(near, t0);
					far = Math.min(far, t1);
				};
				// Inside a circle of radius 0.5 across axes `a` and `b`.
				const round = (axes: number[]) => {
					let qa = 0;
					let qb = 0;
					let qc = -0.25;
					for (const a of axes) {
						qa += ld[a] * ld[a];
						qb += 2 * lo[a] * ld[a];
						qc += lo[a] * lo[a];
					}
					const disc = qb * qb - 4 * qa * qc;
					if (disc < 0 || qa < 1e-12) {
						if (qc > 0) far = -Infinity;
						return;
					}
					const r = Math.sqrt(disc);
					near = Math.max(near, (-qb - r) / (2 * qa));
					far = Math.min(far, (-qb + r) / (2 * qa));
				};
				if (kind === "ball") round([0, 1, 2]);
				else if (kind === "cylinder") {
					slab(0);
					round([1, 2]);
				} else {
					slab(0);
					slab(1);
					slab(2);
					// A wedge is solid where y <= z: its slope runs from the back's top to the front's foot.
					if (kind === "wedge") {
						const f0 = lo[1] - lo[2];
						const f1 = ld[1] - ld[2];
						if (Math.abs(f1) < 1e-12) {
							if (f0 > 0) far = -Infinity;
						} else if (f1 > 0) far = Math.min(far, -f0 / f1);
						else near = Math.max(near, -f0 / f1);
					}
				}
				if (near > far || far <= 0 || near <= 0) continue;
				if (near < best) {
					best = near;
					found = words[at + 13];
				}
			}
		}
	return found;
}

/** Whether anything in the place gives light of its own -- Neon, CrackedLava -- for the glow. */
export function sceneGlows(scene: PlaceScene): boolean {
	for (const set of [scene.kinds, scene.translucent])
		for (const k of SCENE_KINDS) {
			const { data, count } = set[k];
			const words = new Uint32Array(data.buffer, data.byteOffset, data.length);
			for (let i = 0; i < count; i++) {
				const m = MATERIALS[words[i * SCENE_STRIDE + 14] & 255];
				if (m && (m.shade === MATERIAL_SHADE.neon || m.pattern === "lava")) return true;
			}
		}
	return false;
}

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

/**
 * A unit box's twelve edges, each as a band to be drawn a few pixels wide: four
 * vertices an edge, each holding both of its ends (position and normal, in the
 * layout the solids use), told apart by their index -- bit 0 the side of the
 * band, bit 1 the end. The vertex shader widens them on screen.
 */
export function boxEdges(): { vertices: Float32Array; indices: Uint16Array } {
	const h = 0.5;
	const corner = (c: number) => [c & 4 ? h : -h, c & 2 ? h : -h, c & 1 ? h : -h];
	const v: number[] = [];
	const idx: number[] = [];
	for (let a = 0; a < 8; a++)
		for (const bit of [4, 2, 1]) {
			if (a & bit) continue;
			const base = v.length / 6;
			for (let k = 0; k < 4; k++) v.push(...corner(a), ...corner(a | bit));
			idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
		}
	return { vertices: new Float32Array(v), indices: new Uint16Array(idx) };
}
