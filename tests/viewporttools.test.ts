/**
 * The place editor's tools: 1 to 4 choose them, 1 with Select chosen puts it
 * down, and with no tool the pointer moves the camera and picks nothing.
 */

import { describe, expect, it } from "vitest";
import {
	dragMode,
	picks,
	showsHandles,
	TOOLS,
	toolAfter,
	toolForKey,
} from "../src/extensions/placeEditor/app/viewport/tools.js";

const mouse = (button: number, keys: { shift?: boolean; alt?: boolean } = {}) => ({
	button,
	pointerType: "mouse",
	shiftKey: keys.shift ?? false,
	altKey: keys.alt ?? false,
});
const touch = (keys: { shift?: boolean } = {}) => ({ ...mouse(0, keys), pointerType: "touch" });

describe("viewport tools", () => {
	it("keeps the bar's order and Studio's keys", () => {
		expect(TOOLS.map(([id, , key]) => [id, key])).toEqual([
			["select", "1"],
			["move", "2"],
			["rotate", "3"],
			["scale", "4"],
		]);
		expect(toolForKey("1")).toBe("select");
		expect(toolForKey("4")).toBe("scale");
		expect(toolForKey("5")).toBeUndefined();
	});

	it("puts Select down with 1, and picks it up with 1 again", () => {
		expect(toolAfter("select", "select", true)).toBeNull();
		expect(toolAfter(null, "select", true)).toBe("select");
		expect(toolAfter("select", "select", false)).toBeNull();
		expect(toolAfter(null, "select", false)).toBe("select");
	});

	it("chooses another tool as usual, from no tool too", () => {
		expect(toolAfter("select", "move", true)).toBe("move");
		expect(toolAfter(null, "rotate", true)).toBe("rotate");
		expect(toolAfter("move", "move", true)).toBe("move");
		expect(toolAfter("move", "select", true)).toBe("select");
	});

	it("keeps the editing tools for editing", () => {
		expect(toolAfter("select", "move", false)).toBe("select");
		expect(toolAfter(null, "scale", false)).toBeNull();
	});

	it("shows handles for the editing tools only", () => {
		expect(showsHandles("move")).toBe(true);
		expect(showsHandles("rotate")).toBe(true);
		expect(showsHandles("scale")).toBe(true);
		expect(showsHandles("select")).toBe(false);
		expect(showsHandles(null)).toBe(false);
	});

	it("picks nothing with no tool", () => {
		expect(picks(null)).toBe(false);
		for (const [id] of TOOLS) expect(picks(id)).toBe(true);
	});

	it("draws no box with no tool, and keeps every camera drag", () => {
		expect(dragMode(mouse(0), "select")).toBe("box");
		expect(dragMode(mouse(0), null)).toBe("none");
		for (const tool of ["select", null] as const) {
			expect(dragMode(mouse(0, { alt: true }), tool)).toBe("orbit");
			expect(dragMode(mouse(2), tool)).toBe("look");
			expect(dragMode(mouse(2, { shift: true }), tool)).toBe("pan");
			expect(dragMode(mouse(1), tool)).toBe("pan");
			expect(dragMode(touch(), tool)).toBe("orbit");
			expect(dragMode(touch({ shift: true }), tool)).toBe("pan");
		}
	});
});
