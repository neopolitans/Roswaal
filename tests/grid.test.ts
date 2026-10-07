/**
 * The grid behind graphs, since 0.150.0: dots by default, lines on request,
 * at a strength the reader picks -- and drawn in one place.
 *
 * The one place is the point. Before 0.150.0 ten surfaces each painted their
 * own grid, at four spacings and two patterns, and nothing said they should
 * agree. These hold the stylesheet to a single recipe that every surface
 * shares, so a change to the grid is a change in one rule.
 */

import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { landingPage } from "../scripts/lib/landing.mjs";
// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import * as tourModule from "../scripts/lib/tour.mjs";
import { gridMarks, gridSpacing } from "../src/app/GridLayer.jsx";
import {
	DEFAULTS,
	GRID_CONTRASTS,
	GRID_PATTERNS,
	readPreferences,
} from "../src/app/preferences.js";
import { derivedTokens } from "../src/core/theme.js";

const css = readFileSync(new URL("../src/app/theme.css", import.meta.url), "utf8");

/** "The grid" section of theme.css: from its heading to the next one. */
function gridSection(): { start: number; end: number } {
	const start = css.indexOf(
		"/* ------------------------------------------------------------- the grid */",
	);
	const end = css.indexOf("/* ----", start + 10);
	return { start, end };
}

describe("the grid's settings", () => {
	const stored = globalThis.localStorage;
	afterEach(() => {
		globalThis.localStorage = stored;
	});
	const storing = (value: unknown) => {
		globalThis.localStorage = {
			getItem: () => JSON.stringify(value),
			setItem: () => undefined,
		} as unknown as Storage;
	};

	it("are dots, at a strength that follows the system, by default", () => {
		expect(DEFAULTS.gridPattern).toBe("dots");
		expect(DEFAULTS.gridContrast).toBe("auto");
		expect(GRID_PATTERNS.map((g) => g.value)).toEqual(["dots", "lines"]);
		expect(GRID_CONTRASTS.map((g) => g.value)).toEqual(["auto", "light", "standard", "strong"]);
	});

	it("keep what was chosen", () => {
		storing({ gridPattern: "lines", gridContrast: "strong" });
		const prefs = readPreferences();
		expect(prefs.gridPattern).toBe("lines");
		expect(prefs.gridContrast).toBe("strong");
	});

	it("fall back to the defaults for anything else", () => {
		storing({ gridPattern: "stripes", gridContrast: 7 });
		const prefs = readPreferences();
		expect(prefs.gridPattern).toBe("dots");
		expect(prefs.gridContrast).toBe("auto");
	});
});

describe("the grid's colours", () => {
	const levels = ["light", "standard", "strong"] as const;
	const alpha = (value: string) => Number(/,\s*([\d.]+)\)$/.exec(value)?.[1]);

	/** Every scheme gets each strength, in the ink its ground needs. */
	it("come at every strength from every scheme", () => {
		for (const dark of [false, true]) {
			const tokens = derivedTokens(dark);
			for (const kind of ["dot", "fine", "coarse"]) {
				const values = levels.map((level) => tokens[`--grid-${kind}-${level}`]);
				for (const value of values)
					expect(value).toMatch(dark ? /^rgba\(255, 255, 255,/ : /^rgba\(0, 0, 0,/);
				const [light, standard, strong] = values.map((v) => alpha(v!));
				expect(light).toBeLessThan(standard!);
				expect(standard).toBeLessThan(strong!);
			}
		}
	});

	it("are the same in the stylesheet's own light and dark as a scheme derives", () => {
		for (const dark of [false, true]) {
			for (const [token, value] of Object.entries(derivedTokens(dark))) {
				if (!token.startsWith("--grid-")) continue;
				expect(css, `${token} in ${dark ? "dark" : "light"}`).toContain(`${token}: ${value};`);
			}
		}
	});
});

describe("the grid is drawn in one place", () => {
	it("draws no grid outside its own section of the stylesheet", () => {
		const { start, end } = gridSection();
		expect(start).toBeGreaterThan(0);
		const outside = css.slice(0, start) + css.slice(end);
		expect(outside).not.toMatch(/gradient\([^)]*var\(--grid-(dot|fine|coarse)\)/);
		expect(outside).not.toMatch(/radial-gradient\(\s*circle/);
	});

	it("lists every surface once, for dots and for lines alike", () => {
		const { start, end } = gridSection();
		const section = css.slice(start, end);
		const lists = [...section.matchAll(/:where\(([^{]*?)\)\s*\{/g)].map((m) =>
			m[1]!
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean),
		);
		const [dots, lines] = lists;
		expect(dots?.length).toBeGreaterThan(5);
		expect(lines).toEqual(dots);
	});

	/** The front page and its tour wear the same grid rather than painting their own. */
	it("is the front page's and the tour's grid too", () => {
		const html: string = landingPage("9.9.9", { canary: false });
		expect(html).toMatch(/<header class="landing-banner grid-surface/);
		expect(html).not.toMatch(/radial-gradient\(circle/);
		expect(tourModule.TOUR_STYLE).not.toMatch(/radial-gradient/);
		const canvases = html.match(/class="[^"]*\btour-canvas\b[^"]*"/g) ?? [];
		expect(canvases.length).toBeGreaterThan(5);
		for (const one of canvases) expect(one).toContain("grid-surface");
	});
});

/**
 * The editor canvas's grid, drawn since 0.154.1 rather than painted: a
 * repeating background is rounded to whole device pixels a tile at a time,
 * and zooming walked the error across the screen as jitter.
 */
describe("the canvas's grid", () => {
	it("puts every mark on its own place, however far along and at any zoom", () => {
		for (const zoom of [0.6, 1, 1.013, 1.027, 1.055, 2.37]) {
			const { step } = gridSpacing(zoom);
			const origin = 13.7;
			const marks = gridMarks(origin, step, 4000);
			for (const { at, k } of marks) expect(Math.abs(at - (origin + k * step))).toBeLessThan(1e-9);
			// Consecutive marks are one step apart all the way, never rounded.
			for (let i = 1; i < marks.length; i++)
				expect(marks[i]!.at - marks[i - 1]!.at).toBeCloseTo(step, 9);
		}
	});

	it("covers the whole length, a step beyond each edge", () => {
		const marks = gridMarks(-500.25, 24, 1440);
		expect(marks[0]!.at).toBeLessThanOrEqual(-0);
		expect(marks.at(-1)!.at).toBeGreaterThanOrEqual(1440);
		expect(marks.every((m) => m.at >= -24 && m.at <= 1464)).toBe(true);
	});

	/** The index counts from the world origin, so the heavier lines stay put as the view pans. */
	it("counts marks from the world's origin, wherever the view is", () => {
		for (const origin of [0, -48, 37.5, -1000.3]) {
			for (const { at, k } of gridMarks(origin, 24, 1440)) {
				expect((at - origin) / 24).toBeCloseTo(k, 9);
			}
		}
	});

	it("goes to the coarse spacing when the fine would be a wash", () => {
		expect(gridSpacing(1)).toEqual({ step: 24, far: false });
		expect(gridSpacing(0.5)).toEqual({ step: 60, far: true });
	});
});
