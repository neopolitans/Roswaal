/**
 * What scrolling over the graph does.
 *
 * A mouse wheel zoomed and always had; a trackpad's two-finger drag is the same
 * event, so on a Mac the graph could be zoomed and never moved. `auto` is
 * decided per machine rather than stored as its answer, which is the thing
 * worth pinning: a preferences blob synced from a Mac must not make a PC pan.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { COMPACT_QUERY } from "../src/app/panels.js";
import { DEFAULTS, readPreferences, wheelAction, WHEEL_CHOICES } from "../src/app/preferences.js";

describe("scrolling the graph", () => {
	it("pans on Apple's platforms and zooms elsewhere, when left automatic", () => {
		expect(wheelAction("auto", "MacIntel")).toBe("pan");
		expect(wheelAction("auto", "macOS")).toBe("pan");
		// An iPad asking for the desktop site says it is a Mac; one that does
		// not says so plainly.
		expect(wheelAction("auto", "iPad")).toBe("pan");
		expect(wheelAction("auto", "Win32")).toBe("zoom");
		expect(wheelAction("auto", "Windows")).toBe("zoom");
		expect(wheelAction("auto", "Linux x86_64")).toBe("zoom");
		expect(wheelAction("auto", "")).toBe("zoom");
	});

	it("does what it was told when told", () => {
		expect(wheelAction("zoom", "MacIntel")).toBe("zoom");
		expect(wheelAction("pan", "Win32")).toBe("pan");
	});

	it("starts automatic, and offers each choice once", () => {
		expect(DEFAULTS.wheel).toBe("auto");
		// No storage in Vitest: the private-window case, which is the defaults.
		expect(readPreferences().wheel).toBe("auto");
		const values = WHEEL_CHOICES.map((c) => c.value);
		expect(new Set(values).size).toBe(values.length);
		expect(values).toContain(DEFAULTS.wheel);
	});
});

describe("the phone layout", () => {
	const limit = (axis: "width" | "height") => {
		const pattern = axis === "width" ? /max-width:\s*(\d+)px/ : /max-height:\s*(\d+)px/;
		return Number(pattern.exec(COMPACT_QUERY)?.[1]);
	};

	/**
	 * By size alone: an iPhone 14 Pro is 393 by 852, too narrow standing up and
	 * too short lying down. A desktop window the size of an iPad Mini (744 by
	 * 1133) keeps its docks; an iPad itself gets drawers for being a touch
	 * screen, below.
	 */
	it("draws docks as drawers at a phone's size either way up, and not at a tablet's", () => {
		expect(limit("width")).toBeLessThan(744);
		expect(limit("width")).toBeGreaterThanOrEqual(393);
		expect(limit("height")).toBeLessThan(744);
		expect(limit("height")).toBeGreaterThanOrEqual(393);
	});
});

describe("a touch screen of any size", () => {
	const TOUCH = "(hover: none) and (pointer: coarse)";

	/**
	 * An iPad is wider than any phone breakpoint, so the drawers reach it by
	 * asking what the screen is rather than how big. The editor asks in
	 * `COMPACT_QUERY` and the docs in the stylesheet; one without the other
	 * is an iPad with drawers in one window and columns in the next.
	 */
	it("gets the drawers in the editor and the contents button in the docs", () => {
		expect(COMPACT_QUERY).toContain(TOUCH);
		const css = readFileSync(new URL("../src/app/theme.css", import.meta.url), "utf8");
		expect(css).toContain(`@media (max-width: 760px), ${TOUCH} {`);
	});
});
