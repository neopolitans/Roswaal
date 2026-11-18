/** The Place Viewer: a place drawn in 3D, in a tab of its own. */

import type { ExtensionManifest } from "../manifest.js";

export type PlaceViewerModule = typeof import("./app/placeViewerModule.js");

export const PLACE_VIEWER: ExtensionManifest<PlaceViewerModule> = {
	id: "placeViewer",
	name: "Place Viewer",
	version: "0.1.0",
	maturity: "preview",
	description: "Draws your place in 3D, in a tab of its own.",
	load: () => import("./app/placeViewerModule.js"),
};
