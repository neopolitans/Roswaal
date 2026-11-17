/**
 * Frustum and occlusion culling for the camera's passes: each draw's parts
 * sorted into chunks of nearby parts, a box round each chunk, and per frame
 * the runs of chunks to draw. The shadow and sky maps draw every part, since
 * a part out of view still casts a shadow into it.
 *
 * Occlusion is tested against a small depth image of the last frame: a chunk
 * whose nearest point lies behind the farthest depth drawn over all of its
 * box on screen is hidden. A frame late, so a chunk coming into view from
 * behind something can show a frame after it should; never one that is in
 * front.
 */

import { SCENE_STRIDE } from "../../core/rbx/scene.js";

/** Cells a chunk's parts are gathered in, studs a side; and the most parts a chunk. */
export const CHUNK_CELL = 32;
export const CHUNK_MOST = 256;

/** A run of instances, by their place in the draw's (reordered) buffer, and the box round them. */
export interface Chunk {
	first: number;
	count: number;
	min: [number, number, number];
	max: [number, number, number];
}

/**
 * The box round one instance: its axes (the transform's columns, each the
 * size along it) over a unit shape, padded a little for meshes that reach
 * past their part's box.
 */
function instanceBox(data: Float32Array, i: number, min: number[], max: number[]): void {
	const o = i * SCENE_STRIDE;
	for (let a = 0; a < 3; a++) {
		const half =
			0.55 * (Math.abs(data[o + a]) + Math.abs(data[o + 3 + a]) + Math.abs(data[o + 6 + a])) + 0.5;
		const c = data[o + 9 + a];
		min[a] = c - half;
		max[a] = c + half;
	}
}

/**
 * `count` instances sorted into chunks: by the CHUNK_CELL cell their middle
 * lies in, CHUNK_MOST at most a chunk. The rows are reordered to match; the
 * reordering keeps each row whole (its whole numbers as they were).
 */
export function chunkRows(
	data: Float32Array,
	count: number,
	cell: number = CHUNK_CELL,
	most: number = CHUNK_MOST,
): { data: Float32Array; chunks: Chunk[] } {
	const keys = new Array<string>(count);
	const order = new Array<number>(count);
	for (let i = 0; i < count; i++) {
		const o = i * SCENE_STRIDE;
		keys[i] =
			`${Math.floor(data[o + 9] / cell)},${Math.floor(data[o + 10] / cell)},${Math.floor(data[o + 11] / cell)}`;
		order[i] = i;
	}
	order.sort((a, b) => (keys[a] < keys[b] ? -1 : keys[a] > keys[b] ? 1 : a - b));
	// Copied as words, so a colour that reads as a NaN float is not changed on the way.
	const from = new Uint32Array(data.buffer, data.byteOffset, count * SCENE_STRIDE);
	const out = new Float32Array(count * SCENE_STRIDE);
	const to = new Uint32Array(out.buffer);
	const chunks: Chunk[] = [];
	const lo = [0, 0, 0];
	const hi = [0, 0, 0];
	let chunk: Chunk | null = null;
	let key = "";
	for (let n = 0; n < count; n++) {
		const i = order[n];
		to.set(from.subarray(i * SCENE_STRIDE, (i + 1) * SCENE_STRIDE), n * SCENE_STRIDE);
		instanceBox(data, i, lo, hi);
		if (!chunk || keys[i] !== key || chunk.count >= most) {
			chunk = { first: n, count: 0, min: [lo[0], lo[1], lo[2]], max: [hi[0], hi[1], hi[2]] };
			chunks.push(chunk);
			key = keys[i];
		}
		chunk.count++;
		for (let a = 0; a < 3; a++) {
			if (lo[a] < chunk.min[a]) chunk.min[a] = lo[a];
			if (hi[a] > chunk.max[a]) chunk.max[a] = hi[a];
		}
	}
	return { data: out, chunks };
}

/**
 * The view's four side planes from its view-projection matrix (column-major),
 * each as a, b, c, d with a point inside when a x + b y + c z + d >= 0. The
 * side planes alone also reject what is behind the camera; the near and far
 * planes are left out, as the far one is past the place.
 */
export function sidePlanes(m: ArrayLike<number>): Float32Array {
	const row = (r: number) => [m[r], m[4 + r], m[8 + r], m[12 + r]];
	const x = row(0);
	const y = row(1);
	const w = row(3);
	const planes = new Float32Array(16);
	[
		w.map((v, k) => v + x[k]),
		w.map((v, k) => v - x[k]),
		w.map((v, k) => v + y[k]),
		w.map((v, k) => v - y[k]),
	].forEach((p, k) => planes.set(p, k * 4));
	return planes;
}

/** Whether any of the box lies inside every plane. */
export function boxInView(
	planes: Float32Array,
	min: readonly number[],
	max: readonly number[],
): boolean {
	for (let k = 0; k < 16; k += 4) {
		const a = planes[k];
		const b = planes[k + 1];
		const c = planes[k + 2];
		// The box's corner furthest along the plane's normal.
		const d =
			a * (a >= 0 ? max[0] : min[0]) +
			b * (b >= 0 ? max[1] : min[1]) +
			c * (c >= 0 ? max[2] : min[2]) +
			planes[k + 3];
		if (d < 0) return false;
	}
	return true;
}

/**
 * A small depth image of the last frame, for occlusion: `cols` by `rows`
 * cells, each the farthest depth drawn in it as a distance from the eye,
 * the view it was drawn from, and where the eye was.
 */
export interface DepthImage {
	cols: number;
	rows: number;
	/** Distance from the eye, studs; Infinity where nothing was drawn. */
	far: Float32Array;
	viewProj: Float32Array;
	eye: number[];
}

/**
 * Whether `depth` hides the box: every cell its corners cover on screen holds
 * something drawn nearer than the box's nearest point. A box the eye is in,
 * or with a corner behind the eye, is never hidden.
 */
export function boxHidden(
	depth: DepthImage,
	min: readonly number[],
	max: readonly number[],
): boolean {
	const { eye, viewProj: m } = depth;
	if (
		eye[0] >= min[0] &&
		eye[0] <= max[0] &&
		eye[1] >= min[1] &&
		eye[1] <= max[1] &&
		eye[2] >= min[2] &&
		eye[2] <= max[2]
	)
		return false;
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for (let c = 0; c < 8; c++) {
		const p = [c & 1 ? max[0] : min[0], c & 2 ? max[1] : min[1], c & 4 ? max[2] : min[2]];
		const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
		if (w <= 1e-3) return false;
		const x = (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w;
		const y = (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w;
		if (x < x0) x0 = x;
		if (x > x1) x1 = x;
		if (y < y0) y0 = y;
		if (y > y1) y1 = y;
	}
	// The box's nearest point to the eye.
	const near = Math.hypot(
		Math.max(min[0] - eye[0], 0, eye[0] - max[0]),
		Math.max(min[1] - eye[1], 0, eye[1] - max[1]),
		Math.max(min[2] - eye[2], 0, eye[2] - max[2]),
	);
	const c0 = Math.max(0, Math.floor(((x0 + 1) / 2) * depth.cols));
	const c1 = Math.min(depth.cols - 1, Math.floor(((x1 + 1) / 2) * depth.cols));
	const r0 = Math.max(0, Math.floor(((1 - y1) / 2) * depth.rows));
	const r1 = Math.min(depth.rows - 1, Math.floor(((1 - y0) / 2) * depth.rows));
	if (c0 > c1 || r0 > r1) return false;
	for (let r = r0; r <= r1; r++) {
		for (let c = c0; c <= c1; c++) if (!(depth.far[r * depth.cols + c] < near)) return false;
	}
	return true;
}

/** The depth image's width in cells; its height keeps the view's shape. */
export const DEPTH_COLS = 160;

/** The depth image's cells for a view `width` by `height`. */
export function depthCells(width: number, height: number): { cols: number; rows: number } {
	const cols = DEPTH_COLS;
	return { cols, rows: Math.max(1, Math.round((cols * height) / Math.max(width, 1))) };
}

/** Whether two matrices are the same, so a depth image is the current view's. */
export function sameView(a: ArrayLike<number> | null | undefined, b: ArrayLike<number>): boolean {
	if (!a || a.length !== b.length) return false;
	for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

/** The runs of chunks to draw, as first instance and count, neighbours joined. */
export function visibleRuns(chunks: readonly Chunk[], shown: (chunk: Chunk) => boolean): number[] {
	const runs: number[] = [];
	for (const chunk of chunks) {
		if (!shown(chunk)) continue;
		const n = runs.length;
		if (n > 0 && runs[n - 2] + runs[n - 1] === chunk.first) runs[n - 1] += chunk.count;
		else runs.push(chunk.first, chunk.count);
	}
	return runs;
}
