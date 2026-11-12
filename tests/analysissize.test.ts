/**
 * Script analysis's dragged size, as it is read back from storage: a size held
 * to the smallest it can be dragged to, and anything else as no size at all,
 * which is the card fitting what it lists.
 */

import { describe, expect, it } from "vitest";

import { ANALYSIS_MIN, analysisSizeOf, DEFAULTS } from "../src/app/preferences.js";

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
