/**
 * Moving between the editor, Node Design and the docs in one tab.
 *
 * What can be held without a browser: which modes a document can show in
 * place, a click that is the browser's to handle, and the editor's session
 * kept across a page load.
 */

import { describe, expect, it } from "vitest";

import { parseSession } from "../src/app/editorSession.js";
import { isPlainClick } from "../src/app/ModeStrip.jsx";
import { inBundle, MODES } from "../src/app/pageHost.jsx";

describe("the modes", () => {
	it("are in the strip's order", () => {
		expect(MODES).toEqual(["editor", "designer", "docs"]);
	});

	it("show the docs in place only where they are a page of the bundle", () => {
		expect(inBundle("editor", true)).toBe(true);
		expect(inBundle("designer", true)).toBe(true);
		// The hosted docs are static pages of their own.
		expect(inBundle("docs", true)).toBe(false);
		expect(inBundle("docs", false)).toBe(true);
	});

	it("leaves a modified click to the browser, for a tab or a window", () => {
		const plain = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
		expect(isPlainClick(plain)).toBe(true);
		expect(isPlainClick({ ...plain, ctrlKey: true })).toBe(false);
		expect(isPlainClick({ ...plain, metaKey: true })).toBe(false);
		expect(isPlainClick({ ...plain, shiftKey: true })).toBe(false);
		expect(isPlainClick({ ...plain, button: 1 })).toBe(false);
	});
});

describe("the editor's kept session", () => {
	const kept = JSON.stringify({
		root: "/demo",
		tabs: [
			{ path: "src/Main.nodescript", graph: null, view: { x: 80, y: -120, zoom: 1 } },
			{ path: "src/Main.nodescript", graph: "fn1", view: { x: 0, y: 0, zoom: 0.5 } },
			{ path: "broken", graph: null, view: { x: "far" } },
		],
		active: "src/Main.nodescript#fn1",
		code: {
			"src/Main.nodescript": {
				tabs: [{ key: "n1/code", nodeId: "n1", pin: "code" }],
				active: "n1/code",
			},
		},
	});

	it("comes back for the same project, without a tab it cannot place", () => {
		const session = parseSession(kept, "/demo");
		expect(session?.tabs.map((t) => t.graph)).toEqual([null, "fn1"]);
		expect(session?.active).toBe("src/Main.nodescript#fn1");
		expect(session?.code["src/Main.nodescript"].active).toBe("n1/code");
	});

	it("is not put back over another project, or from something that is not one", () => {
		expect(parseSession(kept, "/other")).toBeNull();
		expect(parseSession("{not json", "/demo")).toBeNull();
		expect(parseSession(null, "/demo")).toBeNull();
	});
});
