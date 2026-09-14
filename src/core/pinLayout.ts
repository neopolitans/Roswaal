/**
 * Where a pin sits relative to the node it belongs to.
 *
 * Its own module for the reason `operatorLayout.ts` is one: the canvas computes
 * it in `src/app/geometry.ts` and the documentation's pictures compute it in
 * `src/core/docs/preview.ts`, `src/core` cannot import from `src/app`, and two
 * copies of this arithmetic would let a wire and the pin it lands on drift a
 * pixel apart without anything noticing.
 *
 * Only the numbers both sides need are here. Everything else about a pin —
 * its colour, its hit area, what it looks like unwired — belongs to whoever is
 * drawing it.
 */

/** The fields of `NODE` in `src/app/layers.ts` that pin placement reads. */
export interface PinGeometry {
	pinSlot: number;
	execAspect: number;
	execGap: number;
}

/** How wide an execution pin's triangle is: equilateral, as tall as the slot. */
export function execWidth(g: PinGeometry): number {
	return g.pinSlot * g.execAspect;
}

/**
 * How far past the node's edge an execution wire reaches.
 *
 * An execution pin hangs outside the node, so a wire that still ended at the
 * border would stop short and leave the triangle floating beside it, joined to
 * nothing. This is the centre of the triangle: an input's wire arrives at its
 * base and an output's leaves from its point, which is the direction the shape
 * already points, and the run between two nodes reads as one line through both
 * arrowheads.
 *
 * Data pins are balanced *on* the edge, so their reach is zero and there is no
 * case for them here.
 */
export function execReach(g: PinGeometry): number {
	return g.execGap + execWidth(g) / 2;
}
