/**
 * Where a context menu goes, so that all of it is on screen.
 *
 * The project tree's menu opened at the pointer and ran off the bottom of the
 * window from the last rows of Compile Content, taking Delete with it.
 */

import { describe, expect, it } from "vitest";

import { fitOnScreen, hangFrom } from "../src/app/menuPlace.js";

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

describe("a menu hanging from its button", () => {
	// The More button at the right-hand end of the top row.
	const button = { left: 1680, top: 12, right: 1716, bottom: 44 };

	it("hangs below, lined up with the button's start", () => {
		const left = { left: 100, top: 12, right: 136, bottom: 44 };
		expect(hangFrom(left, menu, view)).toEqual({ x: 100, y: 48 });
	});

	it("lines up with the button's end when asked", () => {
		expect(hangFrom(button, menu, view, { align: "end" })).toEqual({ x: 1542, y: 48 });
	});

	it("slides along to stay inside the window", () => {
		expect(hangFrom(button, menu, view).x).toBe(1728 - 8 - 174);
	});

	it("goes above when there is no room below", () => {
		const foot = { left: 100, top: 1060, right: 160, bottom: 1092 };
		expect(hangFrom(foot, menu, view)).toEqual({ x: 100, y: 936 });
	});

	it("opens above when asked, and below when there is no room above", () => {
		const foot = { left: 100, top: 1060, right: 160, bottom: 1092 };
		expect(hangFrom(foot, menu, view, { side: "above" })).toEqual({ x: 100, y: 936 });
		const top = { left: 100, top: 12, right: 160, bottom: 44 };
		expect(hangFrom(top, menu, view, { side: "above" })).toEqual({ x: 100, y: 48 });
	});
});
