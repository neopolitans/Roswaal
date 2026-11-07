/**
 * The box a left-drag draws over the view, and the parts it takes: each part
 * whose centre falls inside it on screen, as Studio's does. A part across the
 * box's edge is taken only when its centre is in.
 */

/** A box on the view, in CSS pixels from its top-left corner. */
export interface ScreenRect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** How the camera sees: where it stands, its unit axes, and the view's size. */
export interface ViewShot {
	eye: number[];
	forward: number[];
	right: number[];
	up: number[];
	/** The tangent of half the vertical field of view. */
	tan: number;
	width: number;
	height: number;
}

/** The box between two corners, either way round. */
export function rectBetween(ax: number, ay: number, bx: number, by: number): ScreenRect {
	return {
		left: Math.min(ax, bx),
		top: Math.min(ay, by),
		right: Math.max(ax, bx),
		bottom: Math.max(ay, by),
	};
}

/** Where a point in the world falls on the view; null when it is behind the camera. */
export function screenPoint(shot: ViewShot, point: ArrayLike<number>): [number, number] | null {
	const d = [point[0] - shot.eye[0], point[1] - shot.eye[1], point[2] - shot.eye[2]];
	const dot = (v: number[]) => d[0] * v[0] + d[1] * v[1] + d[2] * v[2];
	const z = dot(shot.forward);
	if (z <= 0) return null;
	const aspect = shot.width / shot.height;
	const sx = dot(shot.right) / z / (shot.tan * aspect);
	const sy = dot(shot.up) / z / shot.tan;
	return [((sx + 1) / 2) * shot.width, ((1 - sy) / 2) * shot.height];
}

/**
 * The parts whose centres fall inside `rect`, in the order given. Each part is
 * its id and its scene words, whose 10th to 12th are its centre.
 */
export function partsInRect(
	parts: Iterable<[number, ArrayLike<number>]>,
	shot: ViewShot,
	rect: ScreenRect,
): number[] {
	const inside: number[] = [];
	for (const [id, words] of parts) {
		const at = screenPoint(shot, [words[9], words[10], words[11]]);
		if (!at) continue;
		const [x, y] = at;
		if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) inside.push(id);
	}
	return inside;
}
