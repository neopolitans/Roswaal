/**
 * The preferences a window applies at once when one changes.
 *
 * Before 0.228.5 the editor reapplied the page's chrome only when Rounded nodes
 * changed, so Grid pattern, Grid contrast and Class icons waited for a reload:
 * switching between dots and lines did nothing, then everything at once. Here
 * every preference is changed in turn, and any that alters what `applyChrome`
 * writes onto the page has to be in `CHROME_PREFERENCES`, so a new one cannot
 * be missed again.
 */

import { beforeEach, describe, expect, it } from "vitest";

const root = { style: new Map<string, string>(), dataset: {} as Record<string, string> };
(globalThis as { document?: unknown }).document = {
	documentElement: {
		style: { setProperty: (name: string, value: string) => root.style.set(name, value) },
		dataset: root.dataset,
	},
};

const { DEFAULTS } = await import("../src/app/preferences.js");
const { applyChrome, CHROME_PREFERENCES } = await import("../src/app/theme.js");
type Preferences = typeof DEFAULTS;

/** What the page holds after `applyChrome`, as one string to compare. */
function painted(prefs: Preferences): string {
	root.style.clear();
	for (const key of Object.keys(root.dataset)) delete root.dataset[key];
	applyChrome(prefs);
	return JSON.stringify({ style: [...root.style].sort(), data: { ...root.dataset } });
}

/** A different value of the same kind. */
function another(value: unknown): unknown {
	if (typeof value === "boolean") return !value;
	if (typeof value === "number") return value + 1;
	if (typeof value === "string") return `${value}-other`;
	if (value === null) return "other";
	return Array.isArray(value) ? [...value, "other"] : { ...(value as object), other: true };
}

describe("the preferences applyChrome writes onto the page", () => {
	beforeEach(() => painted(DEFAULTS));

	it("are exactly CHROME_PREFERENCES", () => {
		const base = painted(DEFAULTS);
		const changesThePage = (Object.keys(DEFAULTS) as (keyof Preferences)[]).filter(
			(key) => painted({ ...DEFAULTS, [key]: another(DEFAULTS[key]) }) !== base,
		);
		expect([...changesThePage].sort()).toEqual([...CHROME_PREFERENCES].sort());
	});

	it("include the grid's pattern, which the page reads as data-grid", () => {
		painted({ ...DEFAULTS, gridPattern: "lines" });
		expect(root.dataset.grid).toBe("lines");
		painted({ ...DEFAULTS, gridPattern: "dots" });
		expect(root.dataset.grid).toBe("dots");
	});
});
