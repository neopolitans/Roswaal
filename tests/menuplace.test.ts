/**
 * Where a context menu goes, so that all of it is on screen.
 *
 * The project tree's menu opened at the pointer and ran off the bottom of the
 * window from the last rows of Compile Content, taking Delete with it.
 */

import { describe, expect, it } from "vitest";

import { fitOnScreen } from "../src/app/menuPlace.js";

const view = { width: 1728, height: 1117 };
const menu = { width: 174, height: 120 };

describe("a menu opened at the pointer", () => {
	it("opens at the pointer when it fits", () => {
		expect(fitOnScreen({ x: 140, y: 595 }, menu, view)).toEqual({ x: 140, y: 595 });
	});

	it("opens above the pointer when it would run off the bottom", () => {
		expect(fitOnScreen({ x: 140, y: 1050 }, menu, view)).toEqual({ x: 140, y: 930 });
	});

	it("opens to the left of the pointer when it would run off the right", () => {
		expect(fitOnScreen({ x: 1650, y: 200 }, menu, view)).toEqual({ x: 1476, y: 200 });
	});

	it("flips on both axes in the bottom-right corner", () => {
		expect(fitOnScreen({ x: 1700, y: 1100 }, menu, view)).toEqual({ x: 1526, y: 980 });
	});

	it("keeps a margin from the edge rather than touching it", () => {
		// 595 + 120 is 715: inside a window 720 high, but not by eight pixels.
		expect(fitOnScreen({ x: 140, y: 595 }, menu, { width: 1000, height: 720 })).toEqual({
			x: 140,
			y: 475,
		});
	});

	it("fits a menu taller than either side of the pointer against the bottom", () => {
		const tall = { width: 174, height: 500 };
		expect(fitOnScreen({ x: 140, y: 300 }, tall, { width: 1000, height: 600 })).toEqual({
			x: 140,
			y: 92,
		});
	});

	it("keeps the top on screen when the menu is taller than the window", () => {
		const tall = { width: 174, height: 900 };
		expect(fitOnScreen({ x: 140, y: 300 }, tall, { width: 1000, height: 600 }).y).toBe(8);
	});
});
