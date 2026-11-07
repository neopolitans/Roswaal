/**
 * Tab takes a highlighted suggestion, as Enter does.
 *
 * The lists check the key with `acceptsSuggestion`; the Luau editors bind Tab
 * to `acceptCompletion` ahead of `indentWithTab`.
 */

import { acceptCompletion } from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { acceptsSuggestion, type KeyPress } from "../src/app/keys.js";
import { luauExtensions } from "../src/app/luauExtensions.js";

const press = (key: string, mods: Partial<KeyPress> = {}): KeyPress => ({
	key,
	shiftKey: false,
	ctrlKey: false,
	altKey: false,
	metaKey: false,
	...mods,
});

describe("acceptsSuggestion", () => {
	it("takes Enter and a plain Tab", () => {
		expect(acceptsSuggestion(press("Enter"))).toBe(true);
		expect(acceptsSuggestion(press("Tab"))).toBe(true);
	});

	it("leaves Shift+Tab and other chords to move focus", () => {
		expect(acceptsSuggestion(press("Tab", { shiftKey: true }))).toBe(false);
		expect(acceptsSuggestion(press("Tab", { ctrlKey: true }))).toBe(false);
		expect(acceptsSuggestion(press("Tab", { altKey: true }))).toBe(false);
		expect(acceptsSuggestion(press("Tab", { metaKey: true }))).toBe(false);
	});

	it("ignores other keys", () => {
		expect(acceptsSuggestion(press("ArrowDown"))).toBe(false);
		expect(acceptsSuggestion(press(" "))).toBe(false);
	});
});

describe("the Luau editor's Tab", () => {
	it("tries a completion before it indents", () => {
		const state = EditorState.create({
			extensions: luauExtensions({ completion: () => null }),
		});
		const tabs = state
			.facet(keymap)
			.flat()
			.filter((binding) => binding.key === "Tab");
		const accept = tabs.findIndex((binding) => binding.run === acceptCompletion);
		const indent = tabs.findIndex((binding) => binding.run === indentWithTab.run);
		expect(accept).toBeGreaterThanOrEqual(0);
		expect(indent).toBeGreaterThan(accept);
	});

	it("is not bound in a read-only view", () => {
		const state = EditorState.create({ extensions: luauExtensions({ readOnly: true }) });
		const tabs = state
			.facet(keymap)
			.flat()
			.filter((binding) => binding.key === "Tab");
		expect(tabs).toEqual([]);
	});
});
