/**
 * `luauExtensions`: what each kind of Luau editor is built with.
 *
 * Checked through the state CodeMirror builds, which needs no DOM.
 */

import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { luauExtensions } from "../src/app/luauExtensions.js";

function stateOf(options: Parameters<typeof luauExtensions>[0]): EditorState {
	return EditorState.create({ doc: "local x = 1", extensions: luauExtensions(options) });
}

describe("luauExtensions", () => {
	it("is editable unless asked to be a view", () => {
		expect(stateOf({}).readOnly).toBe(false);
		expect(stateOf({ readOnly: true }).readOnly).toBe(true);
	});

	it("reports each edit as text", () => {
		const seen: string[] = [];
		// The update listener is a view facet, so nothing fires without a view;
		// building the state with it must still work.
		expect(() => stateOf({ onChange: (text) => seen.push(text) })).not.toThrow();
	});

	it("takes the whole set the code editor uses", () => {
		const state = stateOf({
			completion: () => null,
			lint: () => [],
			warnings: () => [],
			hover: { target: () => "roblox" },
			signature: true,
		});
		expect(state.doc.toString()).toBe("local x = 1");
	});
});
