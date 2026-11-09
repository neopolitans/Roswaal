/**
 * The box round several parts, square to a given orientation: what a model's
 * selection box and handles are drawn round.
 */

import { SCENE_STRIDE } from "../../core/rbx/scene.js";

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * The smallest box holding every part in `rows`, each a scene row, square to
 * `turn` -- a row-major 3x3 whose columns are the box's axes, as a pivot's
 * rotation is -- or to the world. A scene row back: each axis times the box's
 * size along it, then its centre. Empty for no parts.
 */
export function boxAround(
	rows: readonly ArrayLike<number>[],
	turn?: readonly number[],
): Float32Array {
	const r = turn ?? IDENTITY;
	const lo = [Infinity, Infinity, Infinity];
	const hi = [-Infinity, -Infinity, -Infinity];
	for (const w of rows)
		for (let c = 0; c < 8; c++) {
			const s = [c & 1 ? 0.5 : -0.5, c & 2 ? 0.5 : -0.5, c & 4 ? 0.5 : -0.5];
			const v = [0, 1, 2].map((a) => w[9 + a] + w[a] * s[0] + w[3 + a] * s[1] + w[6 + a] * s[2]);
			for (let j = 0; j < 3; j++) {
				const along = v[0] * r[j] + v[1] * r[3 + j] + v[2] * r[6 + j];
				lo[j] = Math.min(lo[j], along);
				hi[j] = Math.max(hi[j], along);
			}
		}
	if (lo[0] === Infinity) return new Float32Array();
	const mid = [0, 1, 2].map((j) => (lo[j] + hi[j]) / 2);
	const column = (j: number) => [r[j], r[3 + j], r[6 + j]].map((v) => v * (hi[j] - lo[j]));
	const centre = [0, 1, 2].map(
		(a) => r[a * 3] * mid[0] + r[a * 3 + 1] * mid[1] + r[a * 3 + 2] * mid[2],
	);
	const out = new Float32Array(SCENE_STRIDE);
	out.set([...column(0), ...column(1), ...column(2), ...centre]);
	return out;
}
