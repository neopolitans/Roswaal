/**
 * Picking many instances in the DataModel browser: which keys do what, and
 * the selection each click leaves.
 */

import { describe, expect, it } from "vitest";
import {
	addTo,
	clickMode,
	clickRow,
	NO_SELECTION,
	primaryOf,
	type RowSelection,
	sameItems,
} from "../src/app/placeSelection.js";

const keys = (held: { shift?: boolean; ctrl?: boolean; meta?: boolean } = {}) => ({
	shiftKey: held.shift ?? false,
	ctrlKey: held.ctrl ?? false,
	metaKey: held.meta ?? false,
});

/** The rows as listed: not in index order, as a sorted tree is not. */
const order = [10, 4, 7, 2, 9];

describe("clickMode", () => {
	it("is the author's mapping: Ctrl for a run, Shift to add or take out", () => {
		expect(clickMode(keys())).toBe("only");
		expect(clickMode(keys({ ctrl: true }))).toBe("range");
		expect(clickMode(keys({ meta: true }))).toBe("range");
		expect(clickMode(keys({ shift: true }))).toBe("toggle");
		expect(clickMode(keys({ ctrl: true, shift: true }))).toBe("addRange");
	});
});

describe("clickRow", () => {
	it("picks a row alone, and runs from it next", () => {
		const s = clickRow({ items: [4, 7], anchor: 4 }, 2, "only", order);
		expect(s).toEqual({ items: [2], anchor: 2 });
	});

	it("adds a row, or takes it out when it is in", () => {
		let s: RowSelection = clickRow(NO_SELECTION, 4, "only", order);
		s = clickRow(s, 9, "toggle", order);
		expect(s.items).toEqual([4, 9]);
		expect(primaryOf(s)).toBe(9);
		s = clickRow(s, 4, "toggle", order);
		expect(s.items).toEqual([9]);
		expect(s.anchor).toBe(4);
	});

	it("picks the rows listed between the anchor and the row, down or up", () => {
		const from: RowSelection = { items: [4], anchor: 4 };
		expect(clickRow(from, 9, "range", order).items).toEqual([4, 7, 2, 9]);
		// Up the list: the row clicked is still last, so it is the one shown.
		const up = clickRow({ items: [2], anchor: 2 }, 10, "range", order);
		expect(up.items).toEqual([2, 7, 4, 10]);
		expect(primaryOf(up)).toBe(10);
	});

	it("keeps the anchor through runs, so a second one runs from the same row", () => {
		let s = clickRow({ items: [7], anchor: 7 }, 9, "range", order);
		s = clickRow(s, 4, "range", order);
		expect(s).toEqual({ items: [7, 4], anchor: 7 });
	});

	it("replaces what was picked with a run, or adds it with Shift too", () => {
		const s: RowSelection = { items: [10, 7], anchor: 7 };
		expect(clickRow(s, 9, "range", order).items).toEqual([7, 2, 9]);
		expect(clickRow(s, 9, "addRange", order).items).toEqual([10, 7, 2, 9]);
	});

	it("picks the row alone when the anchor is not listed", () => {
		expect(clickRow(NO_SELECTION, 2, "range", order)).toEqual({ items: [2], anchor: 2 });
		expect(clickRow({ items: [3], anchor: 3 }, 2, "range", order)).toEqual({
			items: [2],
			anchor: 2,
		});
	});
});

describe("addTo and sameItems", () => {
	it("adds each once, moving one already there to the end", () => {
		expect(addTo([1, 2, 3], [2, 5])).toEqual([1, 3, 2, 5]);
	});

	it("compares rows in order", () => {
		expect(sameItems([1, 2], [1, 2])).toBe(true);
		expect(sameItems([1, 2], [2, 1])).toBe(false);
		expect(sameItems([], [])).toBe(true);
	});
});
