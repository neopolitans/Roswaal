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

/**
 * Whether a side's first pin rides on the header rather than on a row.
 *
 * The flow in, and the flow on: an unnamed execution pin first in its list.
 * Drawn level with the middle of the header, so a run of steps is joined
 * header to header and the order of things reads straight across the graph,
 * with the values each step uses hanging below it. A named flow pin — Body,
 * True, Then 0 — keeps its row, because its name is what says which way the
 * flow goes.
 */
export function onHeader(pins: readonly { kind: string; name?: string }[]): boolean {
	const first = pins[0];
	return first !== undefined && first.kind === "exec" && !first.name;
}

/** The row a pin sits on, or -1 for the header. */
export function pinRow(pins: readonly { kind: string; name?: string }[], index: number): number {
	return onHeader(pins) ? index - 1 : index;
}

/**
 * How many rows a node's body has, once its header has taken its flow pins.
 * None, for a node whose only pins are those: it is a header and a footer.
 * One, for a node with no pins at all, so it still has a body to hold.
 */
export function bodyRows(
	inputs: readonly { kind: string; name?: string }[],
	outputs: readonly { kind: string; name?: string }[],
): number {
	const headIn = onHeader(inputs);
	const headOut = onHeader(outputs);
	const rows = Math.max(inputs.length - (headIn ? 1 : 0), outputs.length - (headOut ? 1 : 0));
	return rows === 0 && !headIn && !headOut ? 1 : rows;
}

/** The y of a pin's centre from the node's top, given its header and row heights. */
export function pinCentreY(
	pins: readonly { kind: string; name?: string }[],
	index: number,
	head: number,
	rowHeight: number,
): number {
	const row = pinRow(pins, index);
	return row < 0 ? head / 2 : head + row * rowHeight + rowHeight / 2;
}
