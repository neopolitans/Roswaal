/**
 * Release notes for 1.0: 1.0.0, its patches, and the canary builds leading to
 * each, newest first.
 *
 * One of the files `../releases.ts` puts together, a minor version each.
 */

import type { Release } from "../releases.js";

export const RELEASES_1_0: Release[] = [
	{
		version: "1.0.0-canary.1",
		date: "2026-11-18",
		headline: "Canary builds are numbered as previews of the next release, starting with 1.0.0.",
		changed: [
			"**Version numbers.** A canary build is numbered after the release it leads to: 1.0.0-canary.1 is the first build towards 1.0.0. Stable releases keep plain numbers.",
			"**Release notes** fold a release's canary builds under it, and its lines carry the release they shipped in.",
		],
		affects: ["docs"],
	},
];
