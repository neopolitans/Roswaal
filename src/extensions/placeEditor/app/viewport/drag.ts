/**
 * Dragging parts in the place editor, as Studio's free drag does: what is
 * dragged keeps its turn and rests on the surface under the pointer, its side
 * nearest that surface against it, the point grabbed staying under the
 * pointer. Dragged by its pivot, the pivot goes on the surface instead,
 * wherever it is in the part, so a part whose pivot is its middle sinks
 * halfway in. R and T turn it a quarter on the spot. How it sits was fitted
 * to Studio's screen captures.
 *
 * Matrices are 3x3, row-major, as a CFrame's rotation is stored.
 */

import { type PlaceScene, SCENE_KINDS, SCENE_STRIDE } from "../../core/scene.js";

export type Mat3 = readonly number[];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** A rigid move of the world: each point `x` to `r x + t`. */
export interface Rigid {
	r: Mat3;
	t: readonly number[];
}

export const STILL: Rigid = { r: IDENTITY, t: [0, 0, 0] };

const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: readonly number[], b: readonly number[]) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: readonly number[], b: readonly number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: readonly number[], k: number) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: readonly number[], b: readonly number[]) => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];
const unit = (a: readonly number[]) => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));

/** `a b`: turned by `b`, then by `a`. */
export function mul(a: Mat3, b: Mat3): number[] {
	const out: number[] = [];
	for (let i = 0; i < 3; i++)
		for (let j = 0; j < 3; j++)
			out.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]);
	return out;
}

/** `v` turned by `m`. */
export function apply(m: Mat3, v: readonly number[]): number[] {
	return [0, 1, 2].map((i) => m[i * 3] * v[0] + m[i * 3 + 1] * v[1] + m[i * 3 + 2] * v[2]);
}

/** Entries within a hair of 0 or 1 made exactly so: a quarter turn's matrix, clean. */
function clean(m: number[]): number[] {
	return m.map((v) => {
		const r = Math.round(v);
		return Math.abs(v - r) < 1e-9 && Math.abs(r) <= 1 ? r + 0 : v;
	});
}

/** A quarter turn about the unit `axis`, anticlockwise looking down it, as Rodrigues gives it. */
export function quarterTurn(axis: readonly number[]): number[] {
	const [x, y, z] = unit(axis);
	// cos 90° is 0 and sin 90° is 1: R = I + K + K², K the cross-product matrix.
	const k = [0, -z, y, z, 0, -x, -y, x, 0];
	const k2 = mul(k, k);
	return clean(IDENTITY.map((v, i) => v + k[i] + k2[i]));
}

/** The world's horizontal axis, X or Z, nearest `right`: what T tilts about, as the camera looks. */
export function tiltAxis(right: readonly number[]): number[] {
	return Math.abs(right[0]) >= Math.abs(right[2])
		? [Math.sign(right[0]) || 1, 0, 0]
		: [0, 0, Math.sign(right[2]) || 1];
}

/** R about the world's up, T about its horizontal axis across the view: each a quarter turn more. */
export function turnedBy(turn: Mat3, key: "R" | "T", right: readonly number[]): number[] {
	return mul(quarterTurn(key === "R" ? [0, 1, 0] : tiltAxis(right)), turn);
}

/** How far a box reaches from its centre along unit `n`: half each edge's share of `n`. */
export function reach(cols: readonly (readonly number[])[], n: readonly number[]): number {
	return cols.reduce((sum, col) => sum + Math.abs(dot(col, n)), 0) / 2;
}

/** A box as a scene row holds it: three whole edges and the centre. */
export interface Box {
	cols: number[][];
	centre: number[];
}

/** A scene row's box (its first twelve words). */
export function boxOfRow(row: ArrayLike<number>): Box {
	return {
		cols: [0, 1, 2].map((j) => [row[j * 3], row[j * 3 + 1], row[j * 3 + 2]]),
		centre: [row[9], row[10], row[11]],
	};
}

/** What a drag knows from its press. */
export interface DragStart {
	/** What is dragged, all of it in one box, as it was. */
	box: Box;
	/** What it turns about, and in a pivot drag what goes on the surface. */
	pivot: readonly number[];
	/** Where the pointer took hold of it. */
	grab: readonly number[];
	byPivot: boolean;
}

/**
 * Where the pointer's ray meets something to set the drag down on: the point,
 * the face's outward normal, and the frame of the part it is on, whose grid
 * a snap keeps to. `rest` false is a plane the ray met for want of a part:
 * what is dragged follows the pointer across it, not set down on it.
 */
export interface Surface {
	point: readonly number[];
	normal: readonly number[];
	/** The part's unit axes and centre: the grid's. */
	axes: readonly (readonly number[])[];
	origin: readonly number[];
	rest: boolean;
}

/** Two unit axes along a surface, square to its normal: the part's two that lie flattest along it. */
export function surfaceAxes(surface: Surface): [number[], number[]] {
	const n = surface.normal;
	const flat = [...surface.axes].sort((a, b) => Math.abs(dot(a, n)) - Math.abs(dot(b, n)));
	const u = unit(sub(flat[0], scale(n, dot(flat[0], n))));
	return [u, cross(n, u)];
}

/** `value` to the nearest whole `step` from `from`; as it is with no step. */
export function snapTo(value: number, from: number, step: number): number {
	if (!(step > 0)) return value;
	return from + Math.round((value - from) / step) * step;
}

/**
 * The move a drag makes with the pointer's ray meeting `surface`: `turn`
 * (R and T so far) about the pivot, then set down on the surface. Free, the
 * box's side nearest the surface goes against it, the point grabbed under the
 * pointer, and its edges keep to the surface's grid of `step` studs. By the
 * pivot, the pivot goes on the surface, keeping to that grid.
 */
export function dragMove(start: DragStart, turn: Mat3, surface: Surface, step: number): Rigid {
	const P = start.pivot;
	const about = (x: readonly number[]) => add(apply(turn, sub(x, P)), P);
	const cols = start.box.cols.map((c) => apply(turn, c));
	const centre = about(start.box.centre);
	const [u, v] = surfaceAxes(surface);
	let t: number[];
	if (start.byPivot) {
		let at = [...surface.point];
		for (const axis of [u, v]) {
			const now = dot(at, axis);
			at = add(at, scale(axis, snapTo(now, dot(surface.origin, axis), step) - now));
		}
		t = sub(at, P);
	} else {
		const n = surface.normal;
		const grab = sub(about(start.grab), centre);
		let c: number[];
		if (surface.rest) {
			const along = sub(grab, scale(n, dot(grab, n)));
			c = add(sub(surface.point, along), scale(n, reach(cols, n)));
		} else c = add(centre, sub(surface.point, about(start.grab)));
		// The box's near edge along each axis to the grid, so edges line up.
		for (const axis of [u, v]) {
			const edge = dot(c, axis) - reach(cols, axis);
			c = add(c, scale(axis, snapTo(edge, dot(surface.origin, axis), step) - edge));
		}
		t = sub(c, centre);
	}
	// Turned about P, then moved by t: x to turn x + (P - turn P + t).
	return { r: turn, t: add(sub(P, apply(turn, P)), t) };
}

/** Where `x` goes under `m`. */
export function moved(m: Rigid, x: readonly number[]): number[] {
	return add(apply(m.r, x), m.t);
}

/** A scene row (or a pivot: a row-major 3x3, then a position) moved by `m`, in place. */
export function moveRow(row: { [i: number]: number }, m: Rigid, pivot = false): void {
	if (pivot) {
		const turned = mul(
			m.r,
			[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => row[i]),
		);
		turned.forEach((v, i) => {
			row[i] = v;
		});
	} else
		for (let j = 0; j < 3; j++) {
			const col = apply(m.r, [row[j * 3], row[j * 3 + 1], row[j * 3 + 2]]);
			for (let a = 0; a < 3; a++) row[j * 3 + a] = col[a];
		}
	const at = moved(m, [row[9], row[10], row[11]]);
	for (let a = 0; a < 3; a++) row[9 + a] = at[a];
}

/** The scene with the rows whose id `ids` holds moved by `m`; the rest as they were. */
export function sceneMoved(scene: PlaceScene, ids: ReadonlySet<number>, m: Rigid): PlaceScene {
	const each = (sets: PlaceScene["kinds"]) => {
		const out = { ...sets };
		for (const kind of SCENE_KINDS) {
			const { data, count } = sets[kind];
			const words = new Uint32Array(data.buffer, data.byteOffset, data.length);
			let copy: Float32Array | null = null;
			for (let i = 0; i < count; i++) {
				if (!ids.has(words[i * SCENE_STRIDE + 13])) continue;
				copy ??= data.slice();
				moveRow(copy.subarray(i * SCENE_STRIDE, (i + 1) * SCENE_STRIDE), m);
			}
			if (copy) out[kind] = { data: copy, count };
		}
		return out;
	};
	return { ...scene, kinds: each(scene.kinds), translucent: each(scene.translucent) };
}

/** Whether a move moves nothing. */
export function still(m: Rigid): boolean {
	return (
		m.r.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-9) && m.t.every((v) => Math.abs(v) < 1e-6)
	);
}
