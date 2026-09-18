/**
 * Per-developer preferences.
 *
 * ## Why these are not in `roswaal.json`
 *
 * `roswaal.json` is committed. It describes the *project* — where graphs live,
 * what they compile to, whether stylua runs — and every developer on a
 * repository has to agree about all of it. A colour scheme is the opposite kind
 * of setting: nobody else's business, and a change to it should never turn up
 * in a diff. Putting one in the other's file is how a theme preference becomes
 * a merge conflict.
 *
 * So the split is by *who the setting belongs to*, not by how it feels:
 *
 * | | Lives in | Shared |
 * | --- | --- | --- |
 * | Project settings | `roswaal.json` | yes, and committed |
 * | Preferences | this, in `localStorage` | no, per browser profile |
 *
 * ## Why `localStorage` and not a file
 *
 * The daemon could store these, and Beako's browser does exactly that in
 * `.beako/UserPreferences.json`. The reason not to here is `/docs`: the
 * documentation is a second window onto the same bundle at the same origin, and
 * it is also served as a *static site* with no daemon behind it at all. Only
 * `localStorage` is readable in every one of those cases, so it is the one
 * place a theme can be stored and have the docs honour it too.
 *
 * The cost is that preferences do not follow a developer to another browser,
 * which is the right thing to give up: they are small, and there are a handful.
 *
 * ## One key
 *
 * Preferences used to be one `localStorage` key each, added as needed —
 * `roswaal.alignExec` was the only survivor. One blob means a preference added
 * later does not need a migration, and reading them is one parse rather than a
 * lookup per field.
 */

import type { WireStyle } from "./geometry.js";
import { DEFAULT_LAYOUT, readLayout, type Layout } from "./panels.js";
import { RUNTIME_LABEL, RUNTIME_SUMMARY, RUNTIMES, type Runtime } from "../core/nodes/runtimes.js";

/**
 * What the node menu can be narrowed to.
 *
 * Two axes in one control, deliberately. Three of the options say which
 * **runtime** a node needs; `graph` says it came from **this document** rather
 * than from the library at all — a variable you named, a local, a function, a
 * parameter. They are not the same kind of claim, and a reader opening a
 * search box is not asking two questions: they are asking "narrow this", and
 * these are the ways it narrows.
 *
 * Mutually exclusive for the same reason. "This graph, but only the Luau ones"
 * is not a question anybody has — everything a graph declares is as portable
 * as the graph is.
 */
export type MenuFilter = Runtime | "graph";

/** The order they are offered in: what you wrote first, then the library. */
export const MENU_FILTERS: readonly MenuFilter[] = ["graph", ...RUNTIMES];

export const FILTER_LABEL: Record<MenuFilter, string> = {
	graph: "This graph",
	...RUNTIME_LABEL,
};

export const FILTER_SUMMARY: Record<MenuFilter, string> = {
	graph: "The variables, locals, functions and parameters this graph declares.",
	...RUNTIME_SUMMARY,
};

/**
 * Where the blob lives.
 *
 * Exported because a `storage` event says which key moved, and a window that
 * repaints itself for somebody else's key is a window that repaints for every
 * unrelated thing on the origin.
 */
export const PREFERENCES_KEY = "roswaal.preferences";
const KEY = PREFERENCES_KEY;

/** The key the Straighten toggle used before preferences existed. */
const LEGACY_ALIGN_EXEC = "roswaal.alignExec";

export interface Preferences {
	/**
	 * The colour scheme by name, or `null` to follow the operating system.
	 *
	 * By name rather than by index or slug because the name is what the picker
	 * shows and what a developer would say out loud. A name that no longer
	 * matches a scheme falls back to following the system rather than failing,
	 * so deleting a theme from a fork cannot brick the editor.
	 */
	theme: string | null;
	/** Realign straightens the execution spine rather than making plain columns. */
	alignExec: boolean;
	/**
	 * How long after the last edit a graph is written, in milliseconds.
	 *
	 * A delay rather than an on/off switch, deliberately. There is no separate
	 * saved copy of a graph — the file *is* the document — so switching
	 * autosave off would not give you an unsaved buffer, it would give you a
	 * document that quietly stops matching the thing it claims to be. What a
	 * developer actually wants from that switch is usually "stop writing while
	 * I am still dragging", and a longer delay is that.
	 */
	autosaveMs: number;
	/** Reopen the last project on load, rather than starting at the picker. */
	reopenLastProject: boolean;
	/**
	 * How wires are drawn: curved, rigid, or rigid with its corners cut.
	 *
	 * Purely how the graph looks — nothing about what it means or what it
	 * compiles to — which is why it is here and not in the document. People have
	 * patched other node editors to get the two rigid styles; shipping them saves
	 * anyone that.
	 */
	wireStyle: WireStyle;
	/**
	 * Rounded corners on ordinary nodes.
	 *
	 * **Capsules and reroute knots keep their shapes.** A getter is a pill and a
	 * knot is a circle because the *form* is what says "this is a value" and
	 * "this is just a bend in the wire" — they have no header and no title to
	 * say it instead. Squaring those off would not be a style preference, it
	 * would delete the signal.
	 */
	roundedNodes: boolean;
	/**
	 * What scrolling over the graph does, with nothing held.
	 *
	 * A mouse wheel has one axis and is how Windows users have always zoomed a
	 * node graph. A trackpad has two, and binding both to zoom leaves a Mac —
	 * and an iPad with a keyboard case — no way to move around at all, because
	 * the two-finger drag *is* the scroll. Pinching zooms under every choice:
	 * browsers report it as a scroll with Ctrl held, or as a gesture in Safari.
	 *
	 * `auto` is decided per machine by `wheelAction`, not stored as its answer,
	 * so the same preferences blob synced between a Mac and a PC is right on both.
	 */
	wheel: WheelChoice;
	/**
	 * What a node does when its header is longer than the node is wide.
	 *
	 * `false` truncates, which is what a node has always done: the title
	 * ellipsises and the whole of it is in the tooltip and the Inspector. `true`
	 * widens the node instead, so `Declare Local (restores)` is readable on the
	 * canvas without hovering it.
	 *
	 * A preference rather than a property of the graph — it changes nothing
	 * about what the graph means — but unlike the other looks it moves *pins*,
	 * so the wire router and the documentation's pictures are computed from the
	 * same width. A node and its picture are never two different sizes.
	 */
	wideNodes: boolean;
	/**
	 * Whether a new operator pill starts out bracketing its expression.
	 *
	 * A *default for new nodes*, not a switch over the graph. Whether a node
	 * brackets what it works out is stored on the node, so it travels with the
	 * graph and reads the same on everybody's machine -- this only decides what
	 * a node you drop today starts as, which is a question about your hands
	 * rather than about the file.
	 *
	 * Off, because the emitter brackets exactly what Luau's precedence requires
	 * and nothing more, and `not humanoid or not root` is the line the module
	 * this was found in actually contains.
	 */
	logicParens: boolean;
	/**
	 * What a new cast pill writes in its middle: `::`, or the node's name.
	 *
	 * A default for new nodes, exactly as `logicParens` is, and for the same
	 * reason — the choice is stored on the node, because it sets the pill's
	 * width and a node has to be the same size on everybody's machine.
	 *
	 * Symbol by default: `value :: BasePart` is the line the cast writes, and a
	 * pill that says what the generated code says is the shorter path between
	 * the graph and the file.
	 */
	castNames: boolean;
	/**
	 * What a function's tab says. In full it is `ƒ hide (Occupancy)`; shortened,
	 * one of the two names. The tooltip keeps both either way.
	 */
	functionTabs: FunctionTabs;
	/**
	 * Show the graph's name at the start of the tools floating over the canvas.
	 * Off by default: the tab and the watermark already say it. In a function's
	 * graph it reads `ƒ hide (Occupancy)`.
	 */
	toolbarName: boolean;
	/** The typeface the docs are read in. Code keeps its own monospace either way. */
	docsFont: DocsFont;
	/**
	 * Show the release notes from before Roswaal was public.
	 *
	 * Everything up to 0.59.1 was written while nobody else could run it. It is
	 * kept because the reasoning in it is still the reasoning behind the tool,
	 * and hidden because a reader looking for what changed last week should not
	 * have to scroll two years of a private project to find it.
	 */
	showPreReleaseNotes: boolean;
	/**
	 * What the node menu is narrowed to, or `null` for everything.
	 *
	 * On top of the filter the graph's own target already applies, not instead
	 * of it: a Lune graph never offers a Roblox node whatever this says.
	 *
	 * A preference rather than per-graph state because it is a way of working
	 * rather than a property of a document, and because a filter that resets
	 * every time the menu opens is one nobody uses twice.
	 */
	nodeFilter: MenuFilter | null;
	/**
	 * How large node and graph pictures are drawn in the docs, from 0.5 to 3.
	 * A graph's frame grows with it, and a graph that outgrows the column is
	 * panned rather than shrunk back.
	 */
	docsPreviewScale: number;
	/**
	 * Where the panels are: which dock each is in, and how big each dock is.
	 *
	 * Only the **shape**. Which documents were open is deliberately not stored:
	 * a graph may have moved since, and restoring four of them means four
	 * fetches before the editor is usable, to arrive at yesterday's windows.
	 *
	 * One layout rather than one per project. `localStorage` is per origin and
	 * the daemon serves one project at a time, so this is very nearly
	 * per-project already, and the alternative is a map keyed by absolute path
	 * that grows every time somebody opens a repository once.
	 */
	layout: Layout;
}

export const AUTOSAVE_CHOICES = [
	{ ms: 200, label: "Immediately" },
	{ ms: 600, label: "After a moment" },
	{ ms: 2000, label: "After two seconds" },
	{ ms: 5000, label: "After five seconds" },
];

export const WIRE_STYLES: { style: WireStyle; label: string; what: string }[] = [
	{ style: "curved", label: "Curved", what: "A bezier out of each pin. The default." },
	{ style: "rigid", label: "Rigid", what: "Right angles only — horizontal and vertical runs, square corners." },
	{ style: "angular", label: "Angular", what: "The same route, with each corner cut to a 45-degree slope." },
];

export type WheelChoice = "auto" | "zoom" | "pan";

export const WHEEL_CHOICES: { value: WheelChoice; label: string; what: string }[] = [
	{ value: "auto", label: "Automatic", what: "Pans on a Mac or iPad, zooms elsewhere." },
	{ value: "pan", label: "Pan", what: "Scrolling moves the graph. Pinch, or hold Ctrl or ⌘, to zoom." },
	{ value: "zoom", label: "Zoom", what: "Scrolling zooms. Sideways scrolling still pans." },
];

/**
 * What `auto` means on this machine.
 *
 * Apple's platforms are trackpad-first, and an iPad asking for the desktop
 * site reports itself as a Mac, so one test covers both. Everything else keeps
 * the wheel zooming, which is what the graph has always done.
 */
export function wheelAction(choice: WheelChoice, platform = currentPlatform()): "zoom" | "pan" {
	if (choice !== "auto") return choice;
	return /Mac|iPhone|iPad|iPod/i.test(platform) ? "pan" : "zoom";
}

function currentPlatform(): string {
	if (typeof navigator === "undefined") return "";
	const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
	return data?.platform || navigator.platform || "";
}

export type FunctionTabs = "full" | "function" | "script";

export const FUNCTION_TAB_CHOICES: { value: FunctionTabs; label: string; what: string }[] = [
	{ value: "full", label: "None", what: "ƒ hide (Occupancy)" },
	{ value: "function", label: "Function name", what: "ƒ hide" },
	{ value: "script", label: "Script name", what: "ƒ Occupancy" },
];

export type DocsFont = "system" | "serif" | "wide" | "mono";

/**
 * The docs' reading faces. Stacks of fonts an operating system already has,
 * because the docs run offline and a web font would be a network request.
 * The stacks themselves live in `theme.css`, keyed by `data-docs-font`.
 */
export const DOCS_FONTS: { font: DocsFont; label: string; what: string }[] = [
	{ font: "system", label: "System", what: "Your system's interface font. The default." },
	{ font: "serif", label: "Serif", what: "Georgia or the nearest serif, for long reading." },
	{ font: "wide", label: "Wide", what: "Verdana or similar: wide letters and generous spacing." },
	{ font: "mono", label: "Mono", what: "The monospace face the code blocks use." },
];

/** The preview size slider's range, as a scale. */
export const PREVIEW_SCALE = { min: 0.5, max: 3, step: 0.25 } as const;

export const DEFAULTS: Preferences = {
	theme: null,
	alignExec: true,
	autosaveMs: 600,
	reopenLastProject: true,
	wireStyle: "curved",
	roundedNodes: true,
	wheel: "auto",
	// Truncating is what nodes already did, so the default changes nothing for
	// anybody who does not go looking for it.
	wideNodes: false,
	logicParens: false,
	castNames: false,
	functionTabs: "full",
	toolbarName: false,
	docsFont: "system",
	showPreReleaseNotes: false,
	// Everything the target allows, which is what the menu did before there was
	// a filter at all.
	nodeFilter: null,
	docsPreviewScale: 1,
	layout: DEFAULT_LAYOUT,
};

/** A preview size snapped to the slider's steps and held in its range; anything else is 1. */
export function previewScaleOf(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULTS.docsPreviewScale;
	const snapped = Math.round(value / PREVIEW_SCALE.step) * PREVIEW_SCALE.step;
	return Math.min(PREVIEW_SCALE.max, Math.max(PREVIEW_SCALE.min, snapped));
}

/**
 * Reads preferences, filling in anything missing.
 *
 * Never throws. A corrupt or absent blob is the defaults, because the
 * alternative — an editor that will not open because a colour scheme could not
 * be parsed — is a much worse failure than a theme quietly reverting.
 */
export function readPreferences(): Preferences {
	let stored: Partial<Preferences> = {};
	try {
		const raw = localStorage.getItem(KEY);
		if (raw !== null) {
			const parsed: unknown = JSON.parse(raw);
			if (typeof parsed === "object" && parsed !== null) stored = parsed as Partial<Preferences>;
		}
	} catch {
		// A private window, a cleared profile, or a browser refusing storage.
	}

	const prefs: Preferences = {
		theme: typeof stored.theme === "string" ? stored.theme : DEFAULTS.theme,
		alignExec: typeof stored.alignExec === "boolean" ? stored.alignExec : legacyAlignExec(),
		autosaveMs:
			typeof stored.autosaveMs === "number" && AUTOSAVE_CHOICES.some((c) => c.ms === stored.autosaveMs)
				? stored.autosaveMs
				: DEFAULTS.autosaveMs,
		reopenLastProject:
			typeof stored.reopenLastProject === "boolean"
				? stored.reopenLastProject
				: DEFAULTS.reopenLastProject,
		wireStyle: WIRE_STYLES.some((w) => w.style === stored.wireStyle)
			? (stored.wireStyle as WireStyle)
			: DEFAULTS.wireStyle,
		roundedNodes:
			typeof stored.roundedNodes === "boolean" ? stored.roundedNodes : DEFAULTS.roundedNodes,
		wheel: WHEEL_CHOICES.some((c) => c.value === stored.wheel)
			? (stored.wheel as WheelChoice)
			: DEFAULTS.wheel,
		wideNodes:
			typeof stored.wideNodes === "boolean" ? stored.wideNodes : DEFAULTS.wideNodes,
		logicParens:
			typeof stored.logicParens === "boolean" ? stored.logicParens : DEFAULTS.logicParens,
		castNames:
			typeof stored.castNames === "boolean" ? stored.castNames : DEFAULTS.castNames,
		functionTabs: FUNCTION_TAB_CHOICES.some((c) => c.value === stored.functionTabs)
			? (stored.functionTabs as FunctionTabs)
			: DEFAULTS.functionTabs,
		toolbarName:
			typeof stored.toolbarName === "boolean" ? stored.toolbarName : DEFAULTS.toolbarName,
		// A filter that is not one of the known ones -- an older build's
		// preference, or a hand-edited store -- falls back to showing
		// everything rather than to a filter that hides the whole library.
		nodeFilter: MENU_FILTERS.includes(stored.nodeFilter as MenuFilter)
			? (stored.nodeFilter as MenuFilter)
			: null,
		showPreReleaseNotes:
			typeof stored.showPreReleaseNotes === "boolean"
				? stored.showPreReleaseNotes
				: DEFAULTS.showPreReleaseNotes,
		docsFont: DOCS_FONTS.some((f) => f.font === stored.docsFont)
			? (stored.docsFont as DocsFont)
			: DEFAULTS.docsFont,
		docsPreviewScale: previewScaleOf(stored.docsPreviewScale),
		// `readLayout` keeps whatever is valid and defaults the rest, field by
		// field, so a layout written by an older version loses only what it got
		// wrong rather than being thrown away whole.
		layout: readLayout(stored.layout),
	};
	return prefs;
}

/**
 * The one preference that predates this file.
 *
 * Read rather than migrated on write, so a developer who had Straighten off
 * keeps it off without anything having to run at the right moment. The old key
 * is left where it is: removing it would break nothing, and would also mean
 * this could not be undone by rolling back a version.
 */
function legacyAlignExec(): boolean {
	try {
		return localStorage.getItem(LEGACY_ALIGN_EXEC) !== "off";
	} catch {
		return DEFAULTS.alignExec;
	}
}

/** Writes preferences back. Silent on failure, for the same reason reading is. */
export function writePreferences(prefs: Preferences): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(prefs));
	} catch {
		// Nothing useful to do: the setting applied to this session either way.
	}
}
