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

const KEY = "roswaal.preferences";

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
	 * modified Unreal's Blueprint UI to get the two rigid styles; shipping them
	 * saves anyone that.
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
}

export const AUTOSAVE_CHOICES = [
	{ ms: 200, label: "Immediately" },
	{ ms: 600, label: "After a moment" },
	{ ms: 2000, label: "After two seconds" },
	{ ms: 5000, label: "After five seconds" },
];

export const WIRE_STYLES: { style: WireStyle; label: string; what: string }[] = [
	{ style: "curved", label: "Curved", what: "A bezier out of each pin. The default, and what Blueprints does." },
	{ style: "rigid", label: "Rigid", what: "Right angles only — horizontal and vertical runs, square corners." },
	{ style: "angular", label: "Angular", what: "The same route, with each corner cut to a 45-degree slope." },
];

export const DEFAULTS: Preferences = {
	theme: null,
	alignExec: true,
	autosaveMs: 600,
	reopenLastProject: true,
	wireStyle: "curved",
	roundedNodes: true,
};

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
