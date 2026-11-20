/**
 * How an Instance node shows its path: as steps across the Path row, the
 * last always whole, earlier ones folding into "…" from the start of the
 * path when the row is too narrow for them.
 *
 * Pure, and counted in characters, so the node, the wire router and the docs'
 * pictures all agree on what fits without measuring the page.
 */

import { NODE } from "./nodeMetrics.js";

/** The steps of a dotted path: `Tanks.Remotes.TankExit` gives three. */
export function pathSteps(path: string): string[] {
	return path
		.split(".")
		.map((step) => step.trim())
		.filter((step) => step !== "");
}

/** The instance a path reaches: its last step, or "" for none. */
export function pathLeaf(path: string): string {
	const steps = pathSteps(path);
	return steps[steps.length - 1] ?? "";
}

/** Characters a separator between two steps takes: " › ". */
export const STEP_GAP = 3;
/** Characters "…" and its separator take. */
const FOLD = 1 + STEP_GAP;

/**
 * The steps that fit in `budget` characters, kept from the end: the last is
 * always shown whole, and earlier ones fold into `hidden` from the start.
 */
export function foldSteps(
	steps: readonly string[],
	budget: number,
): { shown: string[]; hidden: string[] } {
	if (steps.length <= 1) return { shown: [...steps], hidden: [] };
	const all = steps.reduce((sum, step) => sum + step.length, 0) + STEP_GAP * (steps.length - 1);
	if (all <= budget) return { shown: [...steps], hidden: [] };
	const shown = [steps[steps.length - 1]];
	let used = shown[0].length + FOLD;
	for (let i = steps.length - 2; i >= 0; i--) {
		const cost = steps[i].length + STEP_GAP;
		if (used + cost > budget) break;
		shown.unshift(steps[i]);
		used += cost;
	}
	return { shown, hidden: steps.slice(0, steps.length - shown.length) };
}

/** Characters of steps the Path row holds at a node's ordinary width. */
export const PATH_ROW_CHARS = 24;

/** How wide a node has to be to show every step of `path`, for Long names › Widen. */
export function pathRowWidth(path: string): number {
	const steps = pathSteps(path);
	const chars =
		steps.reduce((sum, step) => sum + step.length, 0) + STEP_GAP * Math.max(0, steps.length - 1);
	return Math.ceil(
		2 * NODE.nodeStroke +
			NODE.rowPadding +
			NODE.pinFootprint +
			NODE.rowGap +
			"Path".length * NODE.labelCharWidth +
			NODE.rowGap +
			chars * NODE.labelCharWidth +
			NODE.rowPadding,
	);
}
