/**
 * An extension's switch and settings, as this browser keeps them: one key per
 * extension, read through its declarations, with what `Preferences` held
 * before the extension existed carried over.
 */

import { describe, expect, it } from "vitest";

import {
	declaredSettings,
	isChanged,
	readExtension,
	validValue,
	writeExtension,
} from "../src/app/extensionSettings.js";
import { PREFERENCES_KEY } from "../src/app/preferences.js";
import { parseVersion } from "../src/core/version.js";
import { EXTENSIONS, PLACE_EDITOR } from "../src/extensions/index.js";

function memory(entries: Record<string, unknown> = {}) {
	const kept = new Map(Object.entries(entries).map(([k, v]) => [k, JSON.stringify(v)]));
	return {
		getItem: (key: string) => kept.get(key) ?? null,
		setItem: (key: string, value: string) => void kept.set(key, value),
		kept,
	};
}

describe("an extension's settings", () => {
	it("start at its defaults, on as it says", () => {
		const state = readExtension(PLACE_EDITOR, memory());
		expect(state.on).toBe(true);
		expect(state.values).toEqual({
			renderer: "auto",
			frameRate: "vsync",
			outlineWidth: "medium",
			outlineThrough: true,
			altClickSteps: false,
			glassHides: true,
			postEffects: true,
		});
	});

	it("carry over what Preferences held before the extension had a key", () => {
		const state = readExtension(
			PLACE_EDITOR,
			memory({
				[PREFERENCES_KEY]: {
					placeViewer: false,
					viewportRenderer: "webgl2",
					viewportFrameRate: "60",
					outlineWidth: "thick",
					altClickSteps: true,
					theme: "dusk",
				},
			}),
		);
		expect(state.on).toBe(false);
		expect(state.values).toMatchObject({
			renderer: "webgl2",
			frameRate: "60",
			outlineWidth: "thick",
			altClickSteps: true,
			glassHides: true,
		});
	});

	it("read the extension's own key over Preferences, once it has one", () => {
		const storage = memory({
			[PREFERENCES_KEY]: { placeViewer: false, outlineWidth: "thick" },
			"roswaal.ext.placeEditor": { on: true, values: { outlineWidth: "thin" } },
		});
		const state = readExtension(PLACE_EDITOR, storage);
		expect(state.on).toBe(true);
		expect(state.values.outlineWidth).toBe("thin");
	});

	it("read the key it kept under a former id, until its own has one", () => {
		// The Place Editor was the Place Viewer until 1.0.0-canary.10.
		const storage = memory({
			"roswaal.ext.placeViewer": { on: false, values: { outlineWidth: "thin" } },
		});
		expect(readExtension(PLACE_EDITOR, storage)).toMatchObject({
			on: false,
			values: { outlineWidth: "thin" },
		});
		storage.setItem("roswaal.ext.placeEditor", JSON.stringify({ on: true, values: {} }));
		expect(readExtension(PLACE_EDITOR, storage).on).toBe(true);
	});

	it("put anything it does not offer back to the default", () => {
		const state = readExtension(
			PLACE_EDITOR,
			memory({
				"roswaal.ext.placeEditor": {
					on: "yes",
					values: { renderer: "vulkan", glassHides: "no", unknown: 1 },
				},
			}),
		);
		expect(state.on).toBe(true);
		expect(state.values.renderer).toBe("auto");
		expect(state.values.glassHides).toBe(true);
		expect(state.values).not.toHaveProperty("unknown");
	});

	it("keep what is written, under the extension's own key", () => {
		const storage = memory();
		const next = {
			on: false,
			values: { ...readExtension(PLACE_EDITOR, storage).values, postEffects: false },
		};
		writeExtension(PLACE_EDITOR, next, storage);
		expect(JSON.parse(storage.kept.get("roswaal.ext.placeEditor") ?? "{}")).toEqual(next);
		expect(readExtension(PLACE_EDITOR, storage)).toEqual(next);
	});

	it("are marked only when not at their default", () => {
		const outline = declaredSettings(PLACE_EDITOR).find((d) => d.key === "outlineWidth")!;
		expect(isChanged(outline, "medium")).toBe(false);
		expect(isChanged(outline, "thick")).toBe(true);
	});
});

describe("every extension's manifest", () => {
	it("has a unique id, a version of its own, and releases Roswaal shipped", () => {
		const ids = EXTENSIONS.map((m) => m.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const manifest of EXTENSIONS) {
			expect(manifest.version, manifest.id).toMatch(/^\d+\.\d+\.\d+$/);
			expect(manifest.releases[0]?.version, manifest.id).toBe(manifest.version);
			for (const release of manifest.releases)
				expect(parseVersion(release.roswaal), release.roswaal).toBeDefined();
		}
	});

	it("declares each setting once, with a default it offers", () => {
		for (const manifest of EXTENSIONS) {
			const decls = declaredSettings(manifest);
			const keys = decls.map((d) => d.key);
			expect(new Set(keys).size, manifest.id).toBe(keys.length);
			for (const decl of decls) expect(validValue(decl, decl.default), decl.key).toBe(decl.default);
			const pages = manifest.pages.map((p) => p.id);
			expect(new Set(pages).size, manifest.id).toBe(pages.length);
			for (const page of manifest.pages)
				expect(Boolean(page.groups) || Boolean(page.component), page.id).toBe(true);
		}
	});
});
