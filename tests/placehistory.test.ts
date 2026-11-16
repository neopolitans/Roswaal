/**
 * The place's undo and redo stacks, and which history Ctrl+Z reaches: the
 * place's while its tab is in front, the graph's otherwise.
 */

import { describe, expect, it } from "vitest";

import {
	applied,
	EMPTY,
	LIMIT,
	type PlaceStep,
	placeHasKeys,
	recorded,
	seen,
	setPlaceInFront,
	taken,
	undoKey,
} from "../src/app/placeHistory.js";

const step = (label: string): PlaceStep => ({
	kind: "property",
	index: 3,
	property: "Ambient",
	raw: { type: "Color3", value: [0, 0, 0] },
	label,
});

describe("the place's history", () => {
	it("undoes the last change first, and redoes what it undid", () => {
		let h = seen(EMPTY, "s0");
		h = recorded(h, step("a"), "s1");
		h = recorded(h, step("b"), "s2");
		const first = taken(h, "undo")!;
		expect(first.step.label).toBe("b");
		h = applied(first.rest, "undo", step("b again"), "s3");
		expect(h.undo.map((s) => s.label)).toEqual(["a"]);
		expect(h.redo.map((s) => s.label)).toEqual(["b again"]);
		expect(h.stamp).toBe("s3");
		const back = taken(h, "redo")!;
		h = applied(back.rest, "redo", step("b undo"), "s4");
		expect(h.undo.map((s) => s.label)).toEqual(["a", "b undo"]);
		expect(h.redo).toEqual([]);
	});

	it("forgets what to redo once a new change is made", () => {
		let h = recorded(seen(EMPTY, "s0"), step("a"), "s1");
		const t = taken(h, "undo")!;
		h = applied(t.rest, "undo", step("redo a"), "s2");
		h = recorded(h, step("c"), "s3");
		expect(h.redo).toEqual([]);
		expect(h.undo.map((s) => s.label)).toEqual(["c"]);
	});

	it("starts again after a change it cannot undo, or one made elsewhere", () => {
		let h = recorded(seen(EMPTY, "s0"), step("a"), "s1");
		expect(recorded(h, null, "s2").undo).toEqual([]);
		// A version it wrote, read late, keeps it; one it never saw empties it.
		expect(seen(h, "s0").undo).toHaveLength(1);
		expect(seen(h, "s1").undo).toHaveLength(1);
		h = seen(h, "studio-saved");
		expect(h.undo).toEqual([]);
		expect(h.stamp).toBe("studio-saved");
		// An undo that leaves nothing to redo it empties the redo stack.
		h = recorded(h, step("x"), "s5");
		const t = taken(h, "undo")!;
		expect(applied(t.rest, "undo", null, "s6").redo).toEqual([]);
	});

	it("keeps the last hundred", () => {
		let h = seen(EMPTY, "s");
		for (let i = 0; i < LIMIT + 5; i++) h = recorded(h, step(String(i)), `s${i}`);
		expect(h.undo).toHaveLength(LIMIT);
		expect(h.undo[0].label).toBe("5");
		expect(taken(EMPTY, "undo")).toBeNull();
	});
});

describe("Ctrl+Z", () => {
	const key = (
		k: string,
		mods: Partial<Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>>,
	) => undoKey({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

	it("is undo, with Shift or as Y redo, with Ctrl or Cmd", () => {
		expect(key("z", { ctrlKey: true })).toBe("undo");
		expect(key("z", { metaKey: true })).toBe("undo");
		expect(key("Z", { ctrlKey: true, shiftKey: true })).toBe("redo");
		expect(key("y", { ctrlKey: true })).toBe("redo");
		expect(key("z", {})).toBeNull();
		expect(key("z", { ctrlKey: true, altKey: true })).toBeNull();
		expect(key("x", { ctrlKey: true })).toBeNull();
	});

	it("reaches the place's history while its tab is in front, and the graph's otherwise", () => {
		setPlaceInFront(false);
		expect(placeHasKeys(null)).toBe(false);
		setPlaceInFront(true);
		expect(placeHasKeys(null)).toBe(true);
		setPlaceInFront(false);
		expect(placeHasKeys(null)).toBe(false);
	});
});
