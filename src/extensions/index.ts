/**
 * Roswaal's extensions, as the editor knows them: parts of the tool that can
 * be turned off, each with its own version.
 *
 * The one place the editor may import from `src/extensions/` (the server's are
 * `server.ts` and `daemon.ts`). A test holds that line, so an extension's
 * insides never become something core depends on.
 */

import type { ExtensionManifest } from "./manifest.js";
import { PLACE_VIEWER } from "./placeViewer/manifest.js";

export type {
	ExtensionAddition,
	ExtensionManifest,
	ExtensionPage,
	ExtensionRelease,
	SettingChoice,
	SettingDecl,
	SettingGroup,
} from "./manifest.js";
export { PLACE_VIEWER, type PlaceViewerModule } from "./placeViewer/manifest.js";
export {
	OUTLINE_WIDTHS,
	type OutlineWidth,
	type PlaceViewerSettings,
	type ViewportFrameRate,
	type ViewportRenderer,
} from "./placeViewer/settings.js";

/** Every extension, in the order Settings lists them. */
export const EXTENSIONS: readonly ExtensionManifest[] = [PLACE_VIEWER];
