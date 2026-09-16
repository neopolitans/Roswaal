/**
 * The projects Roswaal ships, for the panel that offers them.
 *
 * Two so far, one per runtime, and that is the point of the list rather than an
 * accident of how many got written: somebody arriving at Lune support wants to
 * open a Lune project, and being handed a Roblox one and told the rest
 * transfers is the version of this that does not help.
 *
 * ## Why a declared list and not a directory scan
 *
 * `examples/` also holds working material — `m103` is a survey of a Roblox
 * model, with a place file and notes, and it is not something to offer a
 * stranger as a demo. What is a demo is a decision, so it is written down.
 *
 * ## Where they actually are
 *
 * `dir` is the folder under `examples/`, and nothing here resolves it. The
 * daemon has them on disk beside itself; the browser build has them mounted on
 * a volume it seeded at build time; the published documentation has neither and
 * offers the playground instead. One list, three hosts, and the host answers
 * the question it is the only one that can.
 */

import type { Target } from "./schema.js";

export interface DemoProject {
	/** Stable, and the folder name under `examples/`. */
	dir: string;
	/** What it is called in the panel. */
	name: string;
	/** One line, under the name. */
	what: string;
	/** Which runtime it compiles for, for the chip beside its name. */
	target: Target;
	/** Roughly how much is in it, so a card can say without being opened. */
	graphs: number;
}

export const DEMO_PROJECTS: DemoProject[] = [
	{
		dir: "demo",
		name: "Roblox demo",
		what: "Two graphs, a node map, and two custom node packs.",
		target: "roblox",
		graphs: 2,
	},
	{
		dir: "lune-demo",
		name: "Lune demos",
		what: "Read a file, fetch JSON, walk a directory, take an argument.",
		target: "lune",
		graphs: 4,
	},
];

/** The demo for a runtime, where there is one. */
export function demoFor(target: Target): DemoProject | undefined {
	return DEMO_PROJECTS.find((one) => one.target === target);
}
