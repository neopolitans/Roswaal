/**
 * The tools' handles as solid shapes: shafts, cone tips, sphere ends, and rings
 * made of short cylinders so a ring's thickness does not grow with its size.
 * Each is an instance in the scene's 14-word layout, so the renderers draw them
 * with the pipeline the parts use, in front of everything.
 */

import { type Mesh, meshFor } from "./geometry.js";

export const HANDLE_KINDS = ["cylinder", "cone", "ball"] as const;
export type HandleKind = (typeof HANDLE_KINDS)[number];
export type Handles = Record<HandleKind, Float32Array>;

export function handleMesh(kind: HandleKind): Mesh {
	return meshFor(kind);
}

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
const bits = (n: number) => {
	u32[0] = n >>> 0;
	return f32[0];
};
const NO_ID = bits(0xfffffffe);

const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: number[], b: number[], k = 1) => [
	a[0] + b[0] * k,
	a[1] + b[1] * k,
	a[2] + b[2] * k,
];
const scale = (a: number[], k: number) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: number[]) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: number[]) => scale(a, 1 / (len(a) || 1));
const cross = (a: number[], b: number[]) => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];
/** Two directions square to `d` and to each other. */
function perpendicular(d: number[]): [number[], number[]] {
	const n = norm(d);
	const other = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
	const u = norm(cross(n, other));
	return [u, cross(n, u)];
}

export class HandleBuilder {
	private lists: Record<HandleKind, number[]> = { cylinder: [], cone: [], ball: [] };

	private push(
		kind: HandleKind,
		c0: number[],
		c1: number[],
		c2: number[],
		p: number[],
		rgb: number[],
	): void {
		const colour =
			Math.round(rgb[0] * 255) |
			(Math.round(rgb[1] * 255) << 8) |
			(Math.round(rgb[2] * 255) << 16) |
			(255 << 24);
		this.lists[kind].push(...c0, ...c1, ...c2, ...p, bits(colour), NO_ID);
	}

	/** A shape stretched from `from` to `to`, `thick` across. */
	along(kind: HandleKind, from: number[], to: number[], thick: number, rgb: number[]): void {
		const d = sub(to, from);
		const [u, v] = perpendicular(d);
		this.push(kind, d, scale(u, thick), scale(v, thick), scale(add(from, to), 0.5), rgb);
	}

	ball(at: number[], diameter: number, rgb: number[]): void {
		this.push("ball", [diameter, 0, 0], [0, diameter, 0], [0, 0, diameter], at, rgb);
	}

	/** A ring round `axis` through `centre`, as short cylinders. */
	ring(
		centre: number[],
		axis: number[],
		radius: number,
		thick: number,
		rgb: number[],
		pieces = 72,
	): void {
		const [u, v] = perpendicular(axis);
		const at = (i: number) => {
			const t = (i / pieces) * Math.PI * 2;
			return add(centre, add(scale(u, Math.cos(t)), v, Math.sin(t)), radius);
		};
		for (let i = 0; i < pieces; i++) {
			const a = at(i);
			const b = at(i + 1);
			// A touch longer than the chord, so the joins between pieces do not show.
			const mid = scale(add(a, b), 0.5);
			const d = scale(sub(b, a), 1.15);
			const radial = norm(sub(mid, centre));
			// Along, out and back along the axis: the order that keeps the piece right-handed, so it is not drawn inside out.
			this.push("cylinder", d, scale(radial, thick), scale(norm(axis), -thick), mid, rgb);
		}
	}

	build(): Handles {
		return {
			cylinder: new Float32Array(this.lists.cylinder),
			cone: new Float32Array(this.lists.cone),
			ball: new Float32Array(this.lists.ball),
		};
	}
}

export const EMPTY_HANDLES: Handles = {
	cylinder: new Float32Array(),
	cone: new Float32Array(),
	ball: new Float32Array(),
};
