/**
 * The script the documentation site runs.
 *
 * There is exactly one, and for a long time half of it threw on its first line
 * of every page. `attachGraphView` was inlined with `toString()`, which carries
 * the transpiler's scaffolding out of the module with it: tsx compiles with
 * `keepNames`, so the arrows inside that function come out wrapped in
 * `__name(...)`, and `__name` exists only in the module that was compiled.
 *
 * Nothing reported it. The graphs are static SVG in the markup, so they still
 * drew — they were simply never fitted to their frames or made draggable, and
 * every drawn graph on all 301 pages sat at its natural size, overflowing its
 * box. It shipped, and it took somebody reading the published docs to see it.
 *
 * So the test is not "does it do the right thing" but "can it run at all":
 * a script that names something nothing defines is a script that stops at the
 * first page it is asked to draw.
 */

import { describe, expect, it } from "vitest";

// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { buildGraphViewer } from "../scripts/lib/graphViewer.mjs";

const viewer: string = await buildGraphViewer();

/**
 * Helpers a script calls without declaring — which is what a transpiler's
 * scaffolding looks like once it has escaped the module it belonged to.
 *
 * A `RegExp` built from a string, so the escapes are written as `\\s` and
 * survive; written into a template literal they become the bare letters and the
 * pattern quietly matches nothing.
 */
function undeclaredHelpers(script: string): string[] {
	const called = new Set(
		[...script.matchAll(/\b(__[A-Za-z]\w*)\s*\(/g)].map((found) => found[1]),
	);
	return [...called].filter(
		(name) => !new RegExp("(?:var|let|const|function)\\s+" + name + "\\b").test(script),
	);
}

describe("the documentation's graph viewer", () => {
	it("is actually there", () => {
		expect(viewer).toContain(".graph-viewport");
		expect(viewer.length).toBeGreaterThan(500);
	});

	/**
	 * The failure exactly. Every `__helper(` a bundle calls has to be declared in
	 * the same bundle; one that is not came from a module that is not here.
	 */
	it("defines every transpiler helper it calls", () => {
		expect(undeclaredHelpers(viewer)).toEqual([]);
	});

	/**
	 * And the check is checked, because it is a regex over source and a regex
	 * that matches nothing passes every time. The first version of this test did
	 * exactly that: `\s` inside a template literal is the letter `s`, so it was
	 * looking for `varsss__names` and finding, reliably, no problems.
	 */
	it("would have caught the bundle that shipped broken", () => {
		const asShipped = 'function attachGraphView(v){const clamp=__name((a)=>a,"clamp");}';
		expect(undeclaredHelpers(asShipped)).toEqual(["__name"]);

		const asBundled = 'var __name = (f, n) => f;\nconst clamp = __name((a) => a, "clamp");';
		expect(undeclaredHelpers(asBundled)).toEqual([]);
	});

	/**
	 * Parsed as a script rather than only pattern-matched, so a bundle that is
	 * syntactically broken fails here instead of on a page.
	 */
	it("parses as a script a browser would accept", () => {
		expect(() => new Function(viewer)).not.toThrow();
	});

	/**
	 * Run against a page with no graphs on it — which is most of them. It must
	 * reach the end rather than throwing on the way, or the search box that
	 * shares the file goes with it.
	 */
	it("runs on a page with nothing to draw", () => {
		const document = { querySelectorAll: () => [] };
		expect(() => new Function("document", viewer)(document)).not.toThrow();
	});

	/** And on a page with one, which is where the old bundle died. */
	it("claims a viewport and fits what is inside it", () => {
		const style: Record<string, string> = {};
		const classes: string[] = [];
		const box = { width: 400, height: 300, left: 0, top: 0, right: 400, bottom: 300 };
		const svg = {
			getAttribute: (name: string) => (name === "width" ? "800" : "600"),
			style,
			getBoundingClientRect: () => box,
		};
		const viewport = {
			getBoundingClientRect: () => box,
			querySelector: () => svg,
			classList: { add: (name: string) => void classes.push(name), remove: () => {} },
			addEventListener: () => {},
			setPointerCapture: () => {},
			releasePointerCapture: () => {},
		};
		const document = { querySelectorAll: () => [viewport] };

		expect(() => new Function("document", viewer)(document)).not.toThrow();
		// It claimed the frame, which is what the stylesheet keys the cursor and
		// the hover label off.
		expect(classes).toContain("interactive");
		// And it scaled the drawing down rather than leaving it at 800 wide.
		expect(style.transform).toMatch(/scale\(0\.\d+\)/);
	});
});
