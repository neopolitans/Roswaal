/**
 * What is picked in the DataModel browser and the place's view: one instance
 * or many, by row index, the last picked last.
 *
 * The browser and the view share one list. The last item is the one
 * Properties shows; the anchor is where a run of rows starts from.
 */

export interface RowSelection {
	/** The picked rows, in the order they were picked. */
	items: readonly number[];
	/** The row a Ctrl-click runs from: the last row picked on its own or added. */
	anchor: number | null;
}

export const NO_SELECTION: RowSelection = { items: [], anchor: null };

/**
 * What a click on a row does: pick it alone, add it or take it out, pick the
 * run of rows from the anchor to it, or add that run.
 */
export type ClickMode = "only" | "toggle" | "range" | "addRange";

/**
 * The keys a click is read by. This is the author's mapping, the reverse of
 * Studio's: Ctrl (Cmd on a Mac) picks a run of rows, and Shift adds a row or
 * takes it out. Ctrl and Shift together add the run.
 */
export function clickMode(e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): ClickMode {
	if (e.ctrlKey || e.metaKey) return e.shiftKey ? "addRange" : "range";
	return e.shiftKey ? "toggle" : "only";
}

/** The instance Properties shows: the last one picked. */
export function primaryOf(selection: RowSelection): number | null {
	return selection.items.at(-1) ?? null;
}

/**
 * The selection after a click on `row`. `order` is the rows as they are listed,
 * which a run follows; a run from an anchor no longer listed picks the row
 * alone. A run ends on the row clicked, so that row is the one shown.
 */
export function clickRow(
	selection: RowSelection,
	row: number,
	mode: ClickMode,
	order: readonly number[],
): RowSelection {
	if (mode === "only") return { items: [row], anchor: row };
	if (mode === "toggle") {
		const items = selection.items.includes(row)
			? selection.items.filter((i) => i !== row)
			: [...selection.items, row];
		return { items, anchor: row };
	}
	const from = selection.anchor === null ? -1 : order.indexOf(selection.anchor);
	const to = order.indexOf(row);
	if (from < 0 || to < 0) return { items: [row], anchor: row };
	const step = to >= from ? 1 : -1;
	const run: number[] = [];
	for (let at = from; at !== to + step; at += step) run.push(order[at]);
	if (mode === "range") return { items: run, anchor: selection.anchor };
	return { items: addTo(selection.items, run), anchor: selection.anchor };
}

/** `items` with `more` after them, each once; one already there moves to the end. */
export function addTo(items: readonly number[], more: readonly number[]): number[] {
	const adding = new Set(more);
	return [...items.filter((i) => !adding.has(i)), ...more];
}

/** Whether two lists are the same rows in the same order. */
export function sameItems(a: readonly number[], b: readonly number[]): boolean {
	return a.length === b.length && a.every((v, i) => v === b[i]);
}
