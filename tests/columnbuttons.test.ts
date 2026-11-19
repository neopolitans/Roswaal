/**
 * The column buttons: the Project and Inspector buttons in the top bar, off
 * by default now that the Panels menu holds both columns.
 */

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULTS, readPreferences } from "../src/app/preferences.js";

describe("the column buttons", () => {
	const original = globalThis.localStorage;
	afterEach(() => {
		Object.defineProperty(globalThis, "localStorage", { value: original, configurable: true });
	});
	const stored = (value: unknown) =>
		Object.defineProperty(globalThis, "localStorage", {
			value: { getItem: () => JSON.stringify(value), setItem: () => {}, removeItem: () => {} },
			configurable: true,
		});

	it("are hidden until Settings shows them", () => {
		expect(DEFAULTS.barPanelButtons).toBe(false);
		expect(readPreferences().barPanelButtons).toBe(false);
	});

	it("are shown once asked for, and anything else stored is ignored", () => {
		stored({ barPanelButtons: true });
		expect(readPreferences().barPanelButtons).toBe(true);
		stored({ barPanelButtons: "yes" });
		expect(readPreferences().barPanelButtons).toBe(false);
	});
});
