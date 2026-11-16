/**
 * Script analysis's dragged size, as it is read back from storage: a size held
 * to the smallest it can be dragged to, and anything else as no size at all,
 * which is the card fitting what it lists.
 */

import { describe, expect, it } from "vitest";

import {
	ANALYSIS_MIN,
	analysisHeight,
	analysisLeast,
	analysisSizeOf,
	DEFAULTS,
} from "../src/app/preferences.js";

describe("How short Script analysis can be dragged", () => {
	it("is its bar and summary with nothing listed", () => {
		expect(analysisLeast({ bar: 30, summary: 24, row: 0 })).toBe(54);
	});

	it("keeps the first row of a list in sight", () => {
		expect(analysisLeast({ bar: 30, summary: 24, row: 35.5 })).toBe(90);
	});

	it("is never less than the bar a stored size is held to", () => {
		expect(analysisLeast({ bar: 0, summary: 0, row: 0 })).toBe(ANALYSIS_MIN.height);
	});

	it("holds a drag between what it shows and the room there is", () => {
		expect(analysisHeight(20, 54, 600)).toBe(54);
		expect(analysisHeight(200.4, 54, 600)).toBe(200);
		expect(analysisHeight(900, 54, 600)).toBe(600);
	});

	it("gives way to the room when there is less of it than it shows", () => {
		expect(analysisHeight(20, 54, 40)).toBe(40);
	});
});

describe("Script analysis's stored size", () => {
	it("is none by default: the card fits what it lists", () => {
		expect(DEFAULTS.analysisSize).toBeNull();
	});

	it("keeps a size, in whole pixels", () => {
		expect(analysisSizeOf({ width: 470.4, height: 234.6 })).toEqual({ width: 470, height: 235 });
	});

	it("holds one smaller than the card can be to the smallest", () => {
		expect(analysisSizeOf({ width: 10, height: 10 })).toEqual(ANALYSIS_MIN);
	});

	it.each([
		null,
		undefined,
		"big",
		5,
		{ width: 400 },
		{ width: "400", height: 300 },
		{ width: Number.NaN, height: 300 },
		{ width: Number.POSITIVE_INFINITY, height: 300 },
	])("reads %j as no size", (value) => {
		expect(analysisSizeOf(value)).toBeNull();
	});
});
