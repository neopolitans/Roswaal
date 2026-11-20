/**
 * The `extensions` page of the documentation. `buildSite` places it.
 */

import type { DocPage } from "../site.js";

/**
 * What an extension is in Roswaal 1.0, and the one there is.
 *
 * Kept to what the editor does today: an extension is a part of Roswaal
 * itself, with its own version and switch. There is no way to install one
 * from elsewhere, and the page says so rather than leaving it to be guessed.
 * The Place Editor's own facts are its manifest's, in
 * `src/extensions/placeEditor/manifest.ts`.
 */
export function extensionsPage(): DocPage {
	return {
		slug: "extensions",
		title: "Extensions",
		summary: "Parts of Roswaal you can turn off, each with its own version: the Place Editor.",
		narrow: true,
		blocks: [
			{
				t: "p",
				text:
					"An extension is a part of Roswaal that can be turned off. It has its own version, " +
					"its own release notes and its own pages in Settings. Roswaal itself never needs " +
					"one: with every extension off, graphs, node maps, packages and the DataModel all " +
					"work as before.",
			},
			{
				t: "table",
				head: ["Extension", "Version", "What it does"],
				rows: [
					[
						"**Place Editor**",
						"0.1.0 · Preview",
						"Draws your place in 3D in a tab of its own, with the place toolbar and the Rendering, Performance and Meshes panels",
					],
				],
			},
			{ t: "h", level: 2, text: "Turning one off" },
			{
				t: "p",
				text:
					"**Settings › Place Editor** has its switch, what it adds and its release notes. " +
					"Off, it is not loaded, which saves memory in the browser, and its settings are kept " +
					"for when it is back on. The place's tab then says the Place Editor is off. Its pages, " +
					"**Scene view** and **Roblox account**, are listed under it while it is on.",
			},
			{ t: "h", level: 2, text: "Versions" },
			{
				t: "p",
				text:
					"**Preview** means it may still change shape; **Stable** means it will not. A Roswaal " +
					"release that changes an extension names the extension's new version in its notes.",
			},
			{
				t: "note",
				kind: "info",
				text: "**Extensions come with Roswaal.** There is no way to add one from elsewhere yet.",
			},
		],
	};
}
