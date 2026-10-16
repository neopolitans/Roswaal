/**
 * What is put back after the on-screen keyboard: the page, and boxes iOS
 * scrolled that can never scroll on purpose -- and nothing that can.
 *
 * Found on an iPad: a field in the Code panel raised the keyboard, iPadOS
 * scrolled a hidden-overflow box holding the whole editor to show the caret,
 * and when the keyboard went the editor's controls stayed above the screen
 * until every code tab was closed.
 */

import { describe, expect, it } from "vitest";

import { keyboardUp, settle } from "../src/app/keyboardSettle.js";

interface Box {
	name: string;
	scrollTop: number;
	scrollLeft: number;
	overflow: string;
	parentElement: Box | null;
}

const box = (name: string, overflow: string, parent: Box | null, scrollTop = 0): Box => ({
	name,
	scrollTop,
	scrollLeft: 0,
	overflow,
	parentElement: parent,
});

const page = () => {
	const moves: [number, number][] = [];
	return {
		scrollX: 0,
		scrollY: 0,
		scrollTo(x: number, y: number) {
			moves.push([x, y]);
		},
		moves,
	};
};

describe("whether the keyboard is up", () => {
	it("is up while the visible area is well short of the window", () => {
		expect(keyboardUp(700, 1133)).toBe(true);
	});

	it("is down once the visible area is back, give or take a bar", () => {
		expect(keyboardUp(1133, 1133)).toBe(false);
		expect(keyboardUp(1080, 1133)).toBe(false);
	});

	it("is not decided without a visual viewport, so nothing moves", () => {
		expect(keyboardUp(undefined, 1133)).toBe(true);
	});
});

describe("putting the page back", () => {
	it("resets every hidden-overflow box above the field that was scrolled", () => {
		const root = box("html", "hidden hidden", null);
		const workspace = box("workspace", "hidden hidden", root, 640);
		const field = box("field", "visible visible", workspace);
		expect(settle(field, page(), (b) => (b as Box).overflow)).toBe(1);
		expect(workspace.scrollTop).toBe(0);
	});

	it("leaves a box that scrolls on purpose where it is", () => {
		const root = box("html", "hidden hidden", null);
		const list = box("docs", "auto auto", root, 1200);
		const field = box("search", "visible visible", list);
		expect(settle(field, page(), (b) => (b as Box).overflow)).toBe(0);
		expect(list.scrollTop).toBe(1200);
	});

	it("scrolls the page itself back to the top", () => {
		const shifted = page();
		shifted.scrollY = 420;
		settle(null, shifted, () => "visible");
		expect(shifted.moves).toEqual([[0, 0]]);
	});

	it("does nothing when nothing moved", () => {
		const still = page();
		const field = box("field", "visible", box("workspace", "hidden", null));
		expect(settle(field, still, (b) => (b as Box).overflow)).toBe(0);
		expect(still.moves).toEqual([]);
	});
});
