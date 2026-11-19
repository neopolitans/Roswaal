/** The Place Editor: a place drawn in 3D, in a tab of its own. */

import type { ExtensionManifest } from "../manifest.js";
import type { RobloxStatus } from "./app/robloxApi.js";
import { setRobloxStatus } from "./settings/robloxAccount.js";
import { SCENE_VIEW } from "./settings.js";

export type PlaceEditorModule = typeof import("./app/placeEditorModule.js");

export const PLACE_EDITOR: ExtensionManifest<PlaceEditorModule> = {
	id: "placeEditor",
	// The Place Viewer until 1.0.0-canary.10.
	formerIds: ["placeViewer"],
	name: "Place Editor",
	version: "0.1.0",
	maturity: "preview",
	description: "Draws your place in 3D, in a tab of its own.",
	offNote:
		"Off, it is not loaded, which saves memory in the browser. Its settings are kept for when it is back on.",
	defaultOn: true,
	legacyOn: "placeViewer",
	adds: [
		{
			title: "A place tab",
			what: "Your place in 3D, beside your graphs, with the place toolbar.",
			kind: "Tab",
		},
		{
			title: "Rendering, Performance, Meshes",
			what: "Panels from the place toolbar.",
			kind: "Panels",
		},
		{ title: "Scene view, Roblox account", what: "Its pages in Settings.", kind: "Settings" },
	],
	pages: [
		{
			id: "scene",
			title: "Scene view",
			note: "How a place is drawn in 3D. Part of the Place Editor, kept in this browser.",
			groups: SCENE_VIEW,
		},
		{
			id: "roblox",
			title: "Roblox account",
			note: "Fetches the meshes and images a place uses. Part of the Place Editor; the sign-in stays on this computer.",
			component: () =>
				import("./settings/RobloxAccountPage.jsx").then((m) => ({ default: m.RobloxAccountPage })),
		},
	],
	releases: [
		{
			version: "0.1.0",
			roswaal: "1.0.0-canary.2",
			date: "2026-11-18",
			text: "The Place Editor is an extension, with its own version. Everything before it is in Roswaal's notes up to 0.265.0.",
		},
	],
	events: {
		roblox: (data) => setRobloxStatus(data as Omit<RobloxStatus, "available">),
	},
	load: () => import("./app/placeEditorModule.js"),
};
