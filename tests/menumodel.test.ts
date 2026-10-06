/**
 * What every menu holds, without a menu around it.
 *
 * The divider rule -- one between two sections that both have entries, and
 * none anywhere else -- and how the arrow keys move through what can be chosen.
 */

import { describe, expect, it } from "vitest";

import { type MenuEntry, nextEntry, shownSections } from "../src/app/menuModel.js";

const entry = (label: string): MenuEntry => ({ label });

describe("the sections a menu shows", () => {
	it("drops entries that do not apply, written `cond && entry`", () => {
		const shown = shownSections([{ entries: [false, entry("New folder"), null, undefined] }]);
		expect(shown.map((s) => s.entries.map((e) => e.label))).toEqual([["New folder"]]);
	});

	it("drops a section left with nothing, so no divider is drawn for it", () => {
		// The tree menu under Compile Content: nothing to make but a folder.
		const shown = shownSections([
			{ entries: [false, false] },
			{ entries: [entry("Show in file manager")] },
			{ entries: [] },
			{ entries: [entry("Rename"), entry("Delete")] },
		]);
		expect(shown.map((s) => s.entries.map((e) => e.label))).toEqual([
			["Show in file manager"],
			["Rename", "Delete"],
		]);
	});

	it("keeps a section that holds something other than entries", () => {
		const shown = shownSections([{ content: "Manual | Dynamic", entries: [] }]);
		expect(shown).toHaveLength(1);
	});

	it("keeps a section's heading with it", () => {
		const shown = shownSections([{ label: "Closed", entries: [entry("Show Variables")] }]);
		expect(shown[0].label).toBe("Closed");
	});
});

describe("the keys that move through a menu", () => {
	const all = [true, true, true];

	it("starts at the top on Down and at the bottom on Up", () => {
		expect(nextEntry(-1, all, "ArrowDown")).toBe(0);
		expect(nextEntry(-1, all, "ArrowUp")).toBe(2);
	});

	it("wraps at either end", () => {
		expect(nextEntry(2, all, "ArrowDown")).toBe(0);
		expect(nextEntry(0, all, "ArrowUp")).toBe(2);
	});

	it("passes over what cannot be chosen", () => {
		// Show in file manager, from a browser tab.
		const enabled = [true, false, true];
		expect(nextEntry(0, enabled, "ArrowDown")).toBe(2);
		expect(nextEntry(2, enabled, "ArrowUp")).toBe(0);
	});

	it("jumps to the first and last that can be chosen", () => {
		const enabled = [false, true, true, false];
		expect(nextEntry(2, enabled, "Home")).toBe(1);
		expect(nextEntry(1, enabled, "End")).toBe(2);
	});

	it("goes nowhere when nothing can be chosen", () => {
		expect(nextEntry(-1, [false, false], "ArrowDown")).toBe(-1);
		expect(nextEntry(-1, [], "Home")).toBe(-1);
	});
});
