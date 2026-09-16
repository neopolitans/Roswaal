/**
 * What a graph can see, and what the two lists of it therefore offer.
 *
 * The Variables panel and the node search both answer "what can I reach from
 * here", and they used to answer it separately — the panel was scoped first and
 * the search went on offering `Get restore` in `show`'s graph for a local that
 * `hide` declares. So the rule lives in `functionGraph.ts` and both read it,
 * and this file holds it once.
 *
 * Offering one anyway is not cosmetic: the node you get compiles to an error,
 * and the list was the thing that said it was there.
 */

import { describe, expect, it } from "vitest";

import { buildPresets } from "../src/app/NodeMenu.jsx";
import {
	hoistedFunctions, paramsVisibleFrom, visibleFrom,
} from "../src/core/functionGraph.js";
import { Builder } from "./helpers.js";

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

	it("finds the hoisted ones from the script", () => {
		const b = new Builder();
		const top = b.node("function.entry");
		b.node("function.declareHere");
		expect([...hoistedFunctions(b.build())]).toEqual([top]);
	});
});

/**
 * A parameter is not a declaration drawn somewhere — it exists only where its
 * body runs, which is a narrower question than `visibleFrom` answers.
 */
describe("a parameter owner seen from the graph on screen", () => {
	const fn = { id: "hide", def: "function.declareHere", graph: undefined };
	const handler = { id: "conn", def: "event.connect", graph: "hide" };

	it("offers a function's parameters in its own graph and nowhere else", () => {
		expect(paramsVisibleFrom(fn, "hide")).toBe(true);
		expect(paramsVisibleFrom(fn, "show")).toBe(false);
		// Its declaration is drawn in the script's own graph; its parameters
		// are not readable there.
		expect(paramsVisibleFrom(fn, null)).toBe(false);
	});

	/** A handler's body is nested in its graph rather than being one. */
	it("offers a handler's parameters where its Connect is drawn", () => {
		expect(paramsVisibleFrom(handler, "hide")).toBe(true);
		expect(paramsVisibleFrom(handler, null)).toBe(false);
		expect(paramsVisibleFrom({ ...handler, graph: undefined }, null)).toBe(true);
	});
});

/**
 * The same rule, reached through the list the search box actually renders.
 * A graph shaped like Occupancy: a file-level local, and one declared inside a
 * function beside another function.
 */
describe("the node search's presets", () => {
	function occupancy() {
		const b = new Builder("Occupancy");
		b.variable("Occupancy", "table", { t: "raw", v: "{}" });
		const hide = b.node("function.declareHere", { id: "hide", config: { name: "hide", params: [{ name: "character", type: "Model" }] } });
		b.node("function.declareHere", { id: "show", config: { name: "show", params: [{ name: "exitAt", type: "CFrame" }] } });
		// At the file level, which both functions close over.
		const restores = b.node("local.declare", { id: "restores" });
		b.lit(restores, "name", { t: "string", v: "restores" });
		// Inside hide, and nowhere else.
		const restore = b.node("local.declare", { id: "restore", graph: hide });
		b.lit(restore, "name", { t: "string", v: "restore" });
		return b.build();
	}

	const titles = (graph: string | null) =>
		buildPresets(occupancy(), graph).map((p) => p.title);

	it("offers a local of another function nowhere but that function", () => {
		expect(titles("hide")).toContain("Get restore");
		expect(titles("show")).not.toContain("Get restore");
		expect(titles(null)).not.toContain("Get restore");
	});

	it("offers the file's own local in every graph", () => {
		for (const graph of ["hide", "show", null] as const) {
			expect(titles(graph), String(graph)).toContain("Get restores");
		}
	});

	/**
	 * What the menu's **This graph** filter narrows to.
	 *
	 * It selects the presets, and the presets are exactly what this graph
	 * declares — so the filter inherits every scoping rule tested here for
	 * free. A parameter is the case worth saying out loud: inside a function's
	 * own graph it is one of that graph's own things, and in the file's graph
	 * it does not exist at all, so the filter must not conjure it.
	 */
	it("narrows This graph to what that graph actually declares", () => {
		const inHide = titles("hide");
		// Its own parameter, its own local, and the file's variables and functions.
		expect(inHide).toEqual(expect.arrayContaining([
			"Get character", "Get restore", "Get restores", "Get Occupancy", "Get hide",
		]));
		// And nothing belonging to the function next door.
		expect(inHide).not.toContain("Get exitAt");

		// At the file level there is no parameter to offer at all.
		expect(titles(null).some((t) => t === "Get character" || t === "Get exitAt")).toBe(false);
	});

	it("offers a parameter only inside the body it belongs to", () => {
		expect(titles("hide")).toContain("Get character");
		expect(titles("show")).not.toContain("Get character");
		expect(titles("show")).toContain("Get exitAt");
		expect(titles(null)).not.toContain("Get character");
	});

	/** Both are reachable from anywhere by construction, so both stay listed. */
	it("goes on offering every variable and every function", () => {
		for (const graph of ["hide", "show", null] as const) {
			expect(titles(graph), String(graph)).toEqual(
				expect.arrayContaining(["Get Occupancy", "Set Occupancy", "Get hide", "Get show"]),
			);
		}
	});
});
