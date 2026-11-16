/**
 * The Rendering panel's Light ranges: each light near the camera drawn as
 * wire lines over the view, in its own colour dimmed, so what reaches where
 * shows. A PointLight is its range's sphere as three circles; a SpotLight its
 * cone out to its range; a SurfaceLight its face and how far and wide it reaches.
 */

import { LIGHT_POINT, LIGHT_STRIDE, LIGHT_SURFACE } from "../../core/rbx/scene.js";

/** How far past a light's range the camera may be and still see it, in studs. */
export const GIZMO_REACH = 160;
/** The most lights drawn: the nearest, so a place with hundreds stays readable and cheap. */
export const GIZMO_MOST = 40;
/** How far the camera moves, in studs, before the lights near it are found again. */
export const GIZMO_STEP = 8;
/** Segments to a full circle. */
const SEGMENTS = 32;
/** A light's colour, brightest channel to this: dimmer than the handles. */
const DIM = 0.7;

type V = readonly number[];

const add = (a: V, b: V, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V) => {
	const l = len(a) || 1;
	return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V, b: V) => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];

/** Two unit vectors square to `d` and to each other. */
export function across(d: V): [number[], number[]] {
	const n = norm(d);
	const a = norm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
	return [a, cross(n, a)];
}

/** A light's colour for its lines: its hue at a fixed brightness, white for one with none. */
export function gizmoColour(colour: V): number[] {
	const m = Math.max(colour[0], colour[1], colour[2]);
	return m > 0 ? colour.slice(0, 3).map((c) => (c / m) * DIM) : [DIM, DIM, DIM];
}

/**
 * The lights' indices in `lights` (see `sceneLights`) to draw from `eye`: those
 * whose range comes within `reach` of it, nearest first, `most` at most.
 */
export function nearLights(
	lights: readonly number[] | undefined,
	eye: V,
	reach = GIZMO_REACH,
	most = GIZMO_MOST,
): number[] {
	if (!lights) return [];
	const near: [number, number][] = [];
	for (let i = 0; i + LIGHT_STRIDE <= lights.length; i += LIGHT_STRIDE) {
		const gap =
			Math.hypot(lights[i] - eye[0], lights[i + 1] - eye[1], lights[i + 2] - eye[2]) -
			lights[i + 3];
		if (gap <= reach) near.push([Math.max(0, gap), i / LIGHT_STRIDE]);
	}
	near.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	return near.slice(0, most).map(([, i]) => i);
}

/** Lines into `out`, as the overlay reads them: x, y, z, r, g, b for each end. */
class Lines {
	readonly out: number[] = [];
	constructor(private col: V) {}
	line(a: V, b: V): void {
		this.out.push(a[0], a[1], a[2], this.col[0], this.col[1], this.col[2]);
		this.out.push(b[0], b[1], b[2], this.col[0], this.col[1], this.col[2]);
	}
	/** An arc about `c` of radius `r`, in the plane of unit `a` and `b`, from angle `from` to `to`. */
	arc(c: V, a: V, b: V, r: number, from = 0, to = 2 * Math.PI): void {
		const steps = Math.max(2, Math.ceil((SEGMENTS * Math.abs(to - from)) / (2 * Math.PI)));
		let last = add(add(c, a, r * Math.cos(from)), b, r * Math.sin(from));
		for (let s = 1; s <= steps; s++) {
			const t = from + ((to - from) * s) / steps;
			const p = add(add(c, a, r * Math.cos(t)), b, r * Math.sin(t));
			this.line(last, p);
			last = p;
		}
	}
}

/** One light's lines: see the file's head. `l` is its 20 floats. */
export function lightLines(l: V, into: number[] = []): number[] {
	const at = [l[0], l[1], l[2]];
	const range = l[3];
	const kind = l[7];
	const dir = norm([l[8], l[9], l[10]]);
	const half = Math.min(Math.max(l[11], 0), Math.PI / 2);
	const lines = new Lines(gizmoColour([l[4], l[5], l[6]]));
	if (kind === LIGHT_POINT) {
		lines.arc(at, [1, 0, 0], [0, 1, 0], range);
		lines.arc(at, [0, 1, 0], [0, 0, 1], range);
		lines.arc(at, [1, 0, 0], [0, 0, 1], range);
	} else if (kind === LIGHT_SURFACE) {
		// The face, then how far it reaches: out by Range along the face's way,
		// spread by its Angle, so wide angles reach out sideways too.
		const u = [l[12], l[13], l[14]];
		const v = [l[16], l[17], l[18]];
		const grow = (s: V) => {
			const n = len(s);
			return n > 1e-6 ? s.map((x) => x * (1 + (range * Math.sin(half)) / n)) : s.map(() => 0);
		};
		const fu = grow(u);
		const fv = grow(v);
		const far = add(at, dir, range * Math.cos(half));
		const corner = (c: V, a: V, b: V, i: number) =>
			add(add(c, a, i === 0 || i === 3 ? -1 : 1), b, i < 2 ? -1 : 1);
		for (let i = 0; i < 4; i++) {
			const j = (i + 1) % 4;
			lines.line(corner(at, u, v, i), corner(at, u, v, j));
			lines.line(corner(far, fu, fv, i), corner(far, fu, fv, j));
			lines.line(corner(at, u, v, i), corner(far, fu, fv, i));
		}
	} else {
		// A SpotLight: the rim its Angle reaches at its Range, lines out to it,
		// and two arcs across the cone's rounded end.
		const [a, b] = across(dir);
		const rim = add(at, dir, range * Math.cos(half));
		const r = range * Math.sin(half);
		lines.arc(rim, a, b, r);
		for (const side of [a, b, a.map((x) => -x), b.map((x) => -x)])
			lines.line(at, add(rim, side, r));
		lines.arc(at, dir, a, range, -half, half);
		lines.arc(at, dir, b, range, -half, half);
	}
	for (const x of lines.out) into.push(x);
	return into;
}

/** The lines for every light `nearLights` finds from `eye`. */
export function lightGizmoLines(
	lights: readonly number[] | undefined,
	eye: V,
	reach = GIZMO_REACH,
	most = GIZMO_MOST,
): Float32Array {
	if (!lights) return new Float32Array();
	const out: number[] = [];
	for (const i of nearLights(lights, eye, reach, most))
		lightLines(lights.slice(i * LIGHT_STRIDE, (i + 1) * LIGHT_STRIDE), out);
	return new Float32Array(out);
}

/** Where the camera is, to `GIZMO_STEP` studs: the lines are found again when this changes. */
export function gizmoCell(eye: V): string {
	return eye.map((x) => Math.floor(x / GIZMO_STEP)).join(",");
}
