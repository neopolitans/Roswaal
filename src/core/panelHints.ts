/**
 * What the Variables panel says under a section with nothing in it.
 *
 * One line each at the panel's usual width, read at a glance: the heading
 * already names the section, so this says only what goes there or how to
 * add one. The
 * longer account of what a section is goes in `more`, which the panel shows on
 * hover and the docs explain in full.
 *
 * Here rather than in the panel because the docs draw the same panel
 * (`docs/layouts.ts`), and two copies of a sentence are two chances to change
 * one of them.
 */

import type { Target } from "./schema.js";

export interface PanelHint {
	text: string;
	more: string;
}

export const EMPTY_VARIABLES: PanelHint = {
	text: "Values the whole script shares.",
	more:
		"A variable is a value the whole script can read and write, as opposed to a local, which " +
		"only exists inside the block that declared it.",
};

export const EMPTY_SERVICES: PanelHint = {
	text: "Add, or drag in a service.",
	more:
		"A service declared here is fetched once at the top of the generated file, in this order, " +
		"and read by name anywhere: drag it out for a Get Service, or use it in Custom Code.",
};

const MODULES_MORE =
	"A module is required once at the top of the generated file and read wherever you drag it, " +
	"so four uses write one require.";

/** On Lune there is no DataModel to drag a ModuleScript from. */
export function emptyModules(target: Target): PanelHint {
	return {
		text: target === "roblox" ? "Add, or drag in a module script." : "Add one to require it.",
		more: MODULES_MORE,
	};
}
