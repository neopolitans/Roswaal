/**
 * This browser's editor preferences, and the panel layout inside them.
 *
 * The layout changes in two ways: as a stream while something is dragged (a
 * splitter, a floating window), and as one decision (a dock toggled, a panel
 * moved). A stream updates the editor on every move and is written when it
 * settles; a decision is written at once.
 */

import type React from "react";
import { useCallback, useEffect, useState } from "react";

import {
	COMPACT_QUERY,
	clampLayout,
	type DockSide,
	floatPanel,
	framePanel,
	type Layout,
	movePanel,
	type PanelFrame,
	type PanelId,
	reopenPanel,
	resizeDock,
	showTab,
	toggleDock,
} from "./panels.js";
import { usePreferenceSync } from "./preferenceSync.js";
import { type Preferences, readPreferences, writePreferences } from "./preferences.js";
import { applyChrome, applyTheme, findTheme } from "./theme.js";

export interface LayoutPrefs {
	prefs: Preferences;
	setPrefs: React.Dispatch<React.SetStateAction<Preferences>>;
	/** Changes a preference, and stores it unless `persist` is false. */
	updatePrefs: (patch: Partial<Preferences>, persist?: boolean) => void;
	revealPanel: (panel: PanelId) => void;
	onDockResize: (side: DockSide, size: number) => void;
	onDockResizeEnd: () => void;
	onDockToggle: (side: DockSide) => void;
	onFloatPanel: (panel: PanelId, floating: boolean) => void;
	onFramePanel: (panel: PanelId, frame: PanelFrame) => void;
	onFramePanelEnd: () => void;
	onMovePanel: (panel: PanelId, side: DockSide) => void;
	/**
	 * Any change to the cards: moved, tabbed, folded, closed. Written at once,
	 * unless `persist` is false for a stream, which `onDockResizeEnd` writes.
	 */
	onLayout: (change: (layout: Layout) => Layout, persist?: boolean) => void;
}

export function useLayoutPrefs(): LayoutPrefs {
	/**
	 * This browser's preferences, read once and written back on every change.
	 *
	 * State rather than a read at each use, so a change made in the settings
	 * panel reaches the toolbar toggle and the autosave timer in the same
	 * render. `main.tsx` has already applied the theme by the time this runs —
	 * this is the copy that keeps it applied as it changes.
	 */
	const [prefs, setPrefs] = useState<Preferences>(readPreferences);

	/**
	 * The window got smaller, so the docks give way.
	 *
	 * Without this a layout that was fine on a wide window keeps its dock sizes
	 * when the window narrows, and the centre is squeezed to nothing -- with the
	 * splitters that would fix it pushed off the edge. It runs once on mount
	 * too, which is where a layout restored from a wider monitor is brought back
	 * inside this one.
	 *
	 * Not persisted as it goes. A window being dragged smaller fires this
	 * continuously, and a narrow window is usually temporary -- writing each
	 * step would trade the sizes somebody chose for the ones a resize happened
	 * to end on.
	 */
	useEffect(() => {
		const onResize = () =>
			setPrefs((current) =>
				// A phone draws the docks as drawers, so there is nothing to make
				// room for -- and clamping would shrink the sizes kept for a
				// wider window down to what fits beside a 320px graph.
				window.matchMedia(COMPACT_QUERY).matches
					? current
					: {
							...current,
							layout: clampLayout(current.layout, window.innerWidth, window.innerHeight),
						},
			);
		onResize();
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	/**
	 * A splitter is being dragged: update, but do not write.
	 *
	 * This fires on every pointer move, and `writePreferences` serialises the
	 * whole blob and hits `localStorage` synchronously. Sixty of those a second
	 * to store an intermediate width nobody asked to keep is work done for a
	 * value that is about to be replaced.
	 */
	const onDockResize = useCallback((side: DockSide, size: number) => {
		setPrefs((current) => ({
			...current,
			layout: resizeDock(current.layout, side, size, window.innerWidth, window.innerHeight),
		}));
	}, []);

	/** The drag finished, so the size somebody chose is worth keeping. */
	const onDockResizeEnd = useCallback(() => {
		setPrefs((current) => {
			writePreferences(current);
			return current;
		});
	}, []);

	/**
	 * A window is being dragged or resized: update, but do not write.
	 *
	 * The same bargain a splitter makes — this fires on every pointer move, and
	 * `writePreferences` serialises the whole blob synchronously.
	 */
	const onFramePanel = useCallback((panel: PanelId, frame: PanelFrame) => {
		setPrefs((current) => ({ ...current, layout: framePanel(current.layout, panel, frame) }));
	}, []);

	/** The window was let go, so where it is now is worth keeping. */
	const onFramePanelEnd = useCallback(() => {
		setPrefs((current) => {
			writePreferences(current);
			return current;
		});
	}, []);

	/** One decision, so it is written at once. */
	const onFloatPanel = useCallback((panel: PanelId, floating: boolean) => {
		setPrefs((current) => {
			const next = { ...current, layout: floatPanel(current.layout, panel, floating) };
			writePreferences(next);
			return next;
		});
	}, []);

	/** A panel dropped into another dock. One decision, so it is written at once. */
	const onMovePanel = useCallback((panel: PanelId, side: DockSide) => {
		setPrefs((current) => {
			const next = { ...current, layout: movePanel(current.layout, panel, side) };
			writePreferences(next);
			return next;
		});
	}, []);

	const onLayout = useCallback((change: (layout: Layout) => Layout, persist = true) => {
		setPrefs((current) => {
			const next = { ...current, layout: change(current.layout) };
			if (persist) writePreferences(next);
			return next;
		});
	}, []);

	/** Collapsing is one decision rather than a stream, so it is written at once. */
	const onDockToggle = useCallback((side: DockSide) => {
		setPrefs((current) => {
			const next = { ...current, layout: toggleDock(current.layout, side) };
			writePreferences(next);
			return next;
		});
	}, []);

	/**
	 * Changes a preference, and by default stores it.
	 *
	 * `persist` is the exception for a value that arrives as a stream rather
	 * than as a decision -- a dock size mid-drag, or a clamp while a window is
	 * being resized. Those update the editor and are written when they settle.
	 */
	const updatePrefs = useCallback((patch: Partial<Preferences>, persist = true) => {
		setPrefs((current) => {
			const next = { ...current, ...patch };
			if (persist) writePreferences(next);
			if ("theme" in patch) applyTheme(findTheme(next.theme));
			if ("roundedNodes" in patch) applyChrome(next);
			return next;
		});
	}, []);
	// A theme picked in the docs window, which has its own settings panel.
	usePreferenceSync(setPrefs);

	/**
	 * Makes a panel visible: open, and its dock expanded if it is docked.
	 * Written at once, since being asked to show something is a decision.
	 */
	const revealPanel = useCallback((id: PanelId) => {
		setPrefs((current) => {
			const panel = current.layout.panels[id];
			let layout = current.layout;
			if (!panel.open) layout = reopenPanel(layout, id);
			// A tab in a card is shown by showing its tab.
			const head = layout.panels[id].tabOf;
			if (head !== undefined && layout.panels[head].active !== id) layout = showTab(layout, id);
			if (!panel.floating && !layout.docks[panel.dock].open)
				layout = toggleDock(layout, panel.dock);
			if (layout === current.layout) return current;
			const next = { ...current, layout };
			writePreferences(next);
			return next;
		});
	}, []);

	return {
		prefs,
		setPrefs,
		updatePrefs,
		revealPanel,
		onDockResize,
		onDockResizeEnd,
		onDockToggle,
		onFloatPanel,
		onFramePanel,
		onFramePanelEnd,
		onMovePanel,
		onLayout,
	};
}
