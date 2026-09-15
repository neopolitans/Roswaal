/**
 * What the Variables panel lists, and where it stops.
 *
 * The panel is where you go to ask what this graph can reach, so listing
 * something it cannot is worse than listing nothing: dragging one out gives you
 * a Get Local the compiler then refuses, and the panel was the thing that said
 * it was there.
 */

import { describe, expect, it } from "vitest";

import { visibleFrom } from "../src/app/VariablesPanel.jsx";

/** No hoisted functions, which is the ordinary case. */
const none: ReadonlySet<string> = new Set();

describe("a declaration seen from the graph on screen", () => {
	it("is visible in the graph that declares it", () => {
		expect(visibleFrom({ graph: "hide" }, "hide", none)).toBe(true);
	});

	/** The report: `restore` belongs to `hide` and was listed while in `show`. */
	it("is not visible in a sibling function's graph", () => {
		expect(visibleFrom({ graph: "hide" }, "show", none)).toBe(false);
	});

	it("is not visible in the script's own graph", () => {
		expect(visibleFrom({ graph: "hide" }, null, none)).toBe(false);
	});

	it("is visible everywhere when it belongs to the file itself", () => {
		expect(visibleFrom({ graph: undefined }, null, none)).toBe(true);
		expect(visibleFrom({ graph: undefined }, "hide", none)).toBe(true);
	});

	/**
	 * A hoisted Function is written above every local the main flow declares, so
	 * it closes over none of them. A Declare Function in the flow closes over
	 * everything above it, which is what `restores` is.
	 */
	it("is not visible inside a hoisted function, which is written above it", () => {
		const hoisted = new Set(["top"]);
		expect(visibleFrom({ graph: undefined }, "top", hoisted)).toBe(false);
		expect(visibleFrom({ graph: undefined }, "inFlow", hoisted)).toBe(true);
	});

	it("is still visible inside a hoisted function when it is that function's own", () => {
		const hoisted = new Set(["top"]);
		expect(visibleFrom({ graph: "top" }, "top", hoisted)).toBe(true);
	});
});
