/**
 * Each extension's switch and settings, kept in this browser.
 *
 * One localStorage key per extension (`roswaal.ext.placeEditor`), apart from
 * the editor's own `Preferences`, so turning an extension off or removing one
 * never touches anything else, and its settings stay for when it is back.
 *
 * Read through the extension's declarations every time: a value the
 * extension does not declare, or one it does not offer, falls back to the
 * default, so a hand-edited key cannot get in by this door. Values that were
 * `Preferences` fields before the extension existed are carried over the
 * first time its key is read.
 */

import { useCallback, useSyncExternalStore } from "react";

import type { ExtensionManifest, SettingDecl } from "../extensions/index.js";
import { PREFERENCES_KEY } from "./preferences.js";

export type SettingValue = string | boolean;

export interface ExtensionState {
	on: boolean;
	values: Readonly<Record<string, SettingValue>>;
}

const keyOf = (id: string) => `roswaal.ext.${id}`;

/** Every setting an extension declares, across its pages. */
export function declaredSettings(manifest: ExtensionManifest): SettingDecl[] {
	return manifest.pages.flatMap((page) => page.groups ?? []).flatMap((group) => group.settings);
}

/** A stored value if the setting offers it, otherwise its default. */
export function validValue(decl: SettingDecl, value: unknown): SettingValue {
	if (decl.type === "boolean") return typeof value === "boolean" ? value : decl.default;
	return typeof value === "string" && decl.choices.some((c) => c.value === value)
		? value
		: decl.default;
}

/** Whether a setting is at something other than its default. */
export function isChanged(decl: SettingDecl, value: SettingValue): boolean {
	return value !== decl.default;
}

function parse(text: string | null): Record<string, unknown> | null {
	if (text === null) return null;
	try {
		const value = JSON.parse(text);
		return value && typeof value === "object" && !Array.isArray(value) ? value : null;
	} catch {
		return null;
	}
}

/** What the extension's own key holds, or what `Preferences` held before it had one. */
function stored(
	manifest: ExtensionManifest,
	storage: Pick<Storage, "getItem">,
): { on?: unknown; values: Record<string, unknown> } {
	const own = [manifest.id, ...(manifest.formerIds ?? [])]
		.map((id) => parse(storage.getItem(keyOf(id))))
		.find((found) => found !== null);
	if (own) {
		const values = own.values;
		return {
			on: own.on,
			values: values && typeof values === "object" ? (values as Record<string, unknown>) : {},
		};
	}
	const legacy = parse(storage.getItem(PREFERENCES_KEY)) ?? {};
	const values: Record<string, unknown> = {};
	for (const decl of declaredSettings(manifest)) {
		if (decl.legacy && decl.legacy in legacy) values[decl.key] = legacy[decl.legacy];
	}
	return { on: manifest.legacyOn ? legacy[manifest.legacyOn] : undefined, values };
}

/** An extension's state as this browser keeps it, every value checked. */
export function readExtension(
	manifest: ExtensionManifest,
	storage: Pick<Storage, "getItem"> = localStorage,
): ExtensionState {
	let raw: { on?: unknown; values: Record<string, unknown> };
	try {
		raw = stored(manifest, storage);
	} catch {
		// Blocked storage: the defaults.
		raw = { values: {} };
	}
	const values: Record<string, SettingValue> = {};
	for (const decl of declaredSettings(manifest))
		values[decl.key] = validValue(decl, raw.values[decl.key]);
	return { on: typeof raw.on === "boolean" ? raw.on : manifest.defaultOn, values };
}

export function writeExtension(
	manifest: ExtensionManifest,
	state: ExtensionState,
	storage: Pick<Storage, "setItem"> = localStorage,
): void {
	try {
		storage.setItem(keyOf(manifest.id), JSON.stringify(state));
	} catch {
		// A private window or blocked storage: it lasts until the page closes.
	}
	cache.set(manifest.id, state);
	for (const listener of listeners) listener();
}

const cache = new Map<string, ExtensionState>();
const listeners = new Set<() => void>();

function current(manifest: ExtensionManifest): ExtensionState {
	let state = cache.get(manifest.id);
	if (!state) {
		state = readExtension(manifest);
		cache.set(manifest.id, state);
		keepCarriedOver(manifest, state);
	}
	return state;
}

/**
 * Writes what was carried over from `Preferences` into the extension's own
 * key, the first time there is none. `Preferences` no longer holds those
 * fields, so the next save of it drops them: this is their one chance to move.
 */
function keepCarriedOver(manifest: ExtensionManifest, state: ExtensionState): void {
	try {
		if (localStorage.getItem(keyOf(manifest.id)) === null)
			localStorage.setItem(keyOf(manifest.id), JSON.stringify(state));
	} catch {
		// Blocked storage keeps nothing anyway.
	}
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	// Another window changed one: read it again, through the same checks.
	const onStorage = (event: StorageEvent) => {
		if (event.key !== null && !event.key.startsWith("roswaal.ext.")) return;
		cache.clear();
		listener();
	};
	window.addEventListener("storage", onStorage);
	return () => {
		listeners.delete(listener);
		window.removeEventListener("storage", onStorage);
	};
}

export interface ExtensionControls extends ExtensionState {
	setOn(on: boolean): void;
	set(key: string, value: SettingValue): void;
	/** Puts a setting back to its default. */
	reset(key: string): void;
}

/** An extension's switch and settings, kept in step with every window. */
export function useExtension(manifest: ExtensionManifest): ExtensionControls {
	const state = useSyncExternalStore(subscribe, () => current(manifest));
	const setOn = useCallback(
		(on: boolean) => writeExtension(manifest, { ...current(manifest), on }),
		[manifest],
	);
	const set = useCallback(
		(key: string, value: SettingValue) => {
			const decl = declaredSettings(manifest).find((d) => d.key === key);
			if (!decl) return;
			const was = current(manifest);
			writeExtension(manifest, {
				...was,
				values: { ...was.values, [key]: validValue(decl, value) },
			});
		},
		[manifest],
	);
	const reset = useCallback(
		(key: string) => {
			const decl = declaredSettings(manifest).find((d) => d.key === key);
			if (decl) set(key, decl.default);
		},
		[manifest, set],
	);
	return { ...state, setOn, set, reset };
}
