/**
 * Release notes for 1.0: 1.0.0, its patches, and the canary builds leading to
 * each, newest first.
 *
 * One of the files `../releases.ts` puts together, a minor version each.
 */

import type { Release } from "../releases.js";

export const RELEASES_1_0: Release[] = [
	{
		version: "1.0.0-canary.2",
		date: "2026-11-18",
		headline: "The Place Viewer is an extension, with its own page in Settings.",
		added: [
			"**Extensions in Settings.** The Place Viewer is listed under Extensions, with its version, its switch, what it adds and its release notes. Turned off, it keeps only that page, and its settings are kept for when it is back on.",
			"**Reset in Scene view.** A setting not at its default is marked, with a button that puts it back.",
		],
		changed: [
			"**Scene view and Roblox account** are under the Place Viewer in Settings. Sign in with Roblox and Downloaded assets are on Roblox account.",
			"**If local and while local** is on the Compiling page, as a switch, under Studio betas.",
			"**The Privacy Policy** names Settings › Roblox account as where a project's downloaded assets are cleared. Its Last Edited date is 18 November 2026.",
		],
		watch: [
			"**Extended Features is gone.** Its settings moved to the Place Viewer's page and to Compiling, and keep their values.",
		],
		affects: ["editor", "docs"],
	},
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
