/**
 * What an extension says about itself.
 *
 * Small and loaded with the editor, so the editor can name an extension, say
 * which version it is and offer to turn it on without downloading it. What the
 * extension does is behind `load`, a chunk of its own that a browser with it
 * turned off never fetches.
 */

export interface ExtensionManifest<Module = unknown> {
	/** `placeViewer`: names its settings, its storage and its routes' owner. */
	id: string;
	/** `Place Viewer`. */
	name: string;
	/** Its own semver, apart from Roswaal's. */
	version: string;
	/** Preview while it may still change shape; Stable once it will not. */
	maturity: "preview" | "stable";
	/** One line on what it does. */
	description: string;
	/** The extension itself. */
	load(): Promise<Module>;
}
