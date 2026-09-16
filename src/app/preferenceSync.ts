/**
 * Keeping one window's paint in step with another window's preferences.
 *
 * Roswaal is three windows onto one origin — the editor, Node Design and the
 * documentation — and only one of them has to be open for a theme to change.
 * `localStorage` is where a preference lives, so the browser already tells the
 * other windows when it moves: `storage` fires in every document of the origin
 * *except* the one that wrote. That is exactly the set that needs repainting.
 *
 * Here rather than in three components because it was in one, and the other two
 * were the windows a developer complained about: a theme picked in the editor
 * left Node Design on the scheme it opened in, and a theme picked in the docs
 * never reached the editor at all. One copy cannot drift from itself.
 */

import { useEffect } from "react";

import { PREFERENCES_KEY, readPreferences, type Preferences } from "./preferences.js";
import { applyChrome, applyTheme, findTheme } from "./theme.js";

/**
 * Repaint this window when another one changes a preference.
 *
 * `onChange` is for a window that also *holds* the preferences — the editor and
 * the docs both keep a copy in state and show it in their settings panel, and a
 * panel still showing the old scheme after the window around it changed is
 * worse than not syncing at all. Node Design has no such copy and passes
 * nothing.
 *
 * Everything is read again rather than patched from the event: `newValue` is
 * the whole blob anyway, and re-reading goes through the same validation a cold
 * start does, so a hand-edited key cannot get in by a different door.
 */
export function usePreferenceSync(onChange?: (prefs: Preferences) => void): void {
	useEffect(() => {
		const onStorage = (event: StorageEvent) => {
			// `null` is a whole-storage clear, which is also our key going away.
			if (event.key !== null && event.key !== PREFERENCES_KEY) return;
			const next = readPreferences();
			applyTheme(findTheme(next.theme));
			applyChrome(next);
			onChange?.(next);
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, [onChange]);
}
