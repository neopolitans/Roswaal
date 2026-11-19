/**
 * A union's parts as one surface: the faces, or the parts of faces, that lie
 * inside another of the same union's parts are taken away, as a union is one
 * solid and has no faces where two of its parts meet.
 *
 * Only parts with flat faces take part: blocks, wedges and corner wedges, each
 * a convex solid. A face loses what is inside another such part, or lies
 * against one of its faces (the seam between two parts placed edge to edge).
 * Where two parts share an outer face, facing the same way, the earlier part
 * keeps it. A face only partly covered is cut along the covering part's faces
 * into convex pieces, and only the uncovered pieces are kept. Cylinders, balls
 * and meshes are left as they are, and take nothing from the rest.
 */

import { SCENE_STRIDE, type SceneKind } from "./scene.js";

export type V = [number, number, number];

/** A flat face: its corners counter-clockwise from outside, and its plane `n · x = d`, `n` outward. */
export interface SealedFace {
	points: V[];
	n: V;
	d: number;
}

/** How near, in studs, a face must be to another part's face to lie against it. */
export const NEAR = 1e-3;

const h = 0.5;
/** The unit shapes as `geometry.ts` draws them, each face counter-clockwise from outside. */
export const UNIT_FACES: Partial<Record<SceneKind, V[][]>> = {
	block: [
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
	],
	wedge: [
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
	],
	cornerWedge: [
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
		],
		[
			[h, -h, h],
			[h, -h, -h],
			[h, h, h],
		],
		[
			[h, -h, -h],
			[-h, -h, -h],
			[h, h, h],
		],
		[
			[-h, -h, -h],
			[-h, -h, h],
			[h, h, h],
		],
	],
};

export const dot = (a: ArrayLike<number>, b: ArrayLike<number>) =>
	a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A polygon's normal times twice its area (Newell's method). */
function areaNormal(points: readonly V[]): V {
	const n: V = [0, 0, 0];
	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		n[0] += (a[1] - b[1]) * (a[2] + b[2]);
		n[1] += (a[2] - b[2]) * (a[0] + b[0]);
		n[2] += (a[0] - b[0]) * (a[1] + b[1]);
	}
	return n;
}

export const area = (points: readonly V[]) => Math.hypot(...areaNormal(points)) / 2;

export interface Solid {
	faces: SealedFace[];
	min: V;
	max: V;
}

/** A row's shape as a convex solid, its faces in the row's space; none for a round shape, a mesh, or one too thin to have sides. */
function solidOf(kind: SceneKind, row: ArrayLike<number>): Solid | undefined {
	const unit = UNIT_FACES[kind];
	return unit && solidFrom(unit, row);
}

/** A convex unit shape's faces, counter-clockwise from outside, placed by a row: a solid in the row's space, or none when the row is flat. */
export function solidFrom(unit: readonly V[][], row: ArrayLike<number>): Solid | undefined {
	const det =
		row[0] * (row[4] * row[8] - row[5] * row[7]) -
		row[3] * (row[1] * row[8] - row[2] * row[7]) +
		row[6] * (row[1] * row[5] - row[2] * row[4]);
	if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return undefined;
	const map = (u: V): V =>
		[0, 1, 2].map((i) => row[9 + i] + row[i] * u[0] + row[3 + i] * u[1] + row[6 + i] * u[2]) as V;
	const polys = unit.map((face) => face.map(map));
	const all = polys.flat();
	const centre = [0, 1, 2].map((a) => all.reduce((s, p) => s + p[a], 0) / all.length);
	const faces: SealedFace[] = [];
	for (let points of polys) {
		let n = areaNormal(points);
		const length = Math.hypot(...n);
		if (length < 1e-12) return undefined;
		n = n.map((v) => v / length) as V;
		const mid = [0, 1, 2].map((a) => points.reduce((s, p) => s + p[a], 0) / points.length);
		// A mirrored row turns every face inside out: put them back.
		if (dot(n, mid) - dot(n, centre) < 0) {
			n = n.map((v) => -v) as V;
			points = [...points].reverse();
		}
		faces.push({ points, n, d: dot(n, points[0]) });
	}
	// Too thin to tell one side from the other: left out.
	for (const f of faces)
		if (Math.max(...all.map((p) => f.d - dot(f.n, p))) < NEAR * 4) return undefined;
	const min = [0, 1, 2].map((a) => Math.min(...all.map((p) => p[a]))) as V;
	const max = [0, 1, 2].map((a) => Math.max(...all.map((p) => p[a]))) as V;
	return { faces, min, max };
}

/** The part of `points` where `n · x <= d`, or none. */
export function below(points: readonly V[], n: V, d: number): V[] | undefined {
	const out: V[] = [];
	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		const da = dot(n, a) - d;
		const db = dot(n, b) - d;
		if (da <= 0) out.push(a);
		if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
			const t = da / (da - db);
			out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
		}
	}
	return out.length >= 3 ? out : undefined;
}

export const flip = (n: V): V => [-n[0], -n[1], -n[2]];

/**
 * What of `points`, on `face`, `solid` leaves showing. `earlier` says the
 * solid's part comes before the face's, and so keeps an outer face the two share.
 */
function uncovered(points: V[], face: SealedFace, solid: Solid, earlier: boolean): V[][] {
	const cuts: SealedFace[] = [];
	for (const f of solid.faces) {
		const facing = dot(f.n, face.n);
		if (Math.abs(facing) > 1 - 1e-6 && points.every((p) => Math.abs(dot(f.n, p) - f.d) < NEAR)) {
			// On one of the solid's faces: back to back is a seam, taken away;
			// side by side is a shared outer face, kept by the earlier part.
			if (facing > 0 && !earlier) return [points];
			continue;
		}
		cuts.push(f);
	}
	// Whether the face reaches into the solid at all, by more than a hair.
	let inside: V[] | undefined = points;
	for (const f of cuts) {
		inside = below(inside, f.n, f.d - NEAR);
		if (!inside) return [points];
	}
	// Cut off, plane by plane, what lies outside the solid; what is left is covered.
	const kept: V[][] = [];
	let rest: V[] = points;
	for (const f of cuts) {
		const reach = rest.map((p) => dot(f.n, p) - f.d);
		if (Math.max(...reach) <= NEAR / 2) continue;
		if (Math.min(...reach) >= -NEAR / 2) {
			kept.push(rest);
			return kept;
		}
		const out = below(rest, flip(f.n), -f.d);
		const inn = below(rest, f.n, f.d);
		if (out) kept.push(out);
		if (!inn) return kept;
		rest = inn;
	}
	return kept;
}

export const overlaps = (a: Solid, b: Solid) =>
	[0, 1, 2].every((k) => a.min[k] <= b.max[k] + NEAR && b.min[k] <= a.max[k] + NEAR);

/**
 * The faces each of a union's rows keeps, as convex pieces in the rows' own
 * space, each with its face's plane; null for a row left as it is (a round
 * shape, or a mesh). Undefined when nothing was taken away from any of them.
 */
export function sealedFaces(
	rows: readonly { kind: SceneKind; row: ArrayLike<number> }[],
): (SealedFace[] | null)[] | undefined {
	const solids = rows.map(({ kind, row }) =>
		row.length >= SCENE_STRIDE - 3 ? solidOf(kind, row) : undefined,
	);
	let changed = false;
	const out = solids.map((solid, i) => {
		if (!solid) return null;
		const kept: SealedFace[] = [];
		for (const face of solid.faces) {
			let pieces: V[][] = [face.points];
			solids.forEach((other, j) => {
				if (j === i || !other || pieces.length === 0 || !overlaps(solid, other)) return;
				pieces = pieces.flatMap((p) => uncovered(p, face, other, j < i));
			});
			if (pieces.length !== 1 || pieces[0] !== face.points) changed = true;
			for (const points of pieces)
				if (area(points) > 1e-9) kept.push({ points, n: face.n, d: face.d });
		}
		return kept;
	});
	return changed ? out : undefined;
}
