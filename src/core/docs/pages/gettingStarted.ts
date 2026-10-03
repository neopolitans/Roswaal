/**
 * The `getting-started` page of the documentation. `buildSite` places it.
 */

import { STABLE_SITE } from "../links.js";
import type { DocPage } from "../site.js";
import {
	EDITOR_BAR,
	EDITOR_BAR_BROWSER,
	EDITOR_BAR_TABLET,
	PROJECT_MENU,
	PROJECTS_FOOT,
	START_PAGE,
} from "../toolbars.js";
import { code } from "./blocks.js";

export function gettingStartedPage(): DocPage {
	return {
		slug: "getting-started",
		narrow: true,
		title: "Getting started",
		summary: "From an empty folder to a script running in Studio.",
		blocks: [
			{
				t: "p",
				text:
					"Roswaal is not a Studio plugin. It writes `.luau` files next to your graphs, and " +
					"[Rojo](https://rojo.space) syncs those into Studio like any other source file. That " +
					"means the generated code is a file you can read, diff and commit.",
			},
			{ t: "h", level: 2, text: "Open a project" },
			{
				t: "p",
				text:
					"Three ways in, all the same editor: installed on your computer, in a browser on your " +
					"computer, or in a browser on a tablet or a phone.",
			},
			{
				t: "tabs",
				label: "Where are you working?",
				tabs: [
					{
						id: "start-localhost",
						title: "Desktop (localhost)",
						device: ["localhost"],
						blocks: [
							{
								t: "ol",
								items: [
									"In a terminal, go to your project and set it up once: `roswaal init` writes a " +
										"`roswaal.json` and a `.roswaal/` folder, and nothing else.",
									"Run `roswaal serve`, and open the editor address it prints — " +
										"`http://127.0.0.1:4471`. It opens on that project.",
								],
							},
							{
								t: "code",
								lang: "sh",
								text: code`
									cd my-game
									roswaal init      # once: roswaal.json and .roswaal/
									roswaal serve     # the editor, on 127.0.0.1:4471
									`,
							},
							{
								t: "p",
								text:
									"`.roswaal/` holds your graphs and is **source, not cache** — commit it. `src/` " +
									"holds what Roswaal generates from them.",
							},
							{ t: "h", level: 3, text: "Another project" },
							{
								t: "walkthrough",
								steps: [
									{
										text:
											"Click the Roswaal mark at the top left. The projects panel lists the ones " +
											"you have opened before: click one to switch.",
										picture: [EDITOR_BAR],
										point: "The Roswaal mark",
									},
									{
										text: "For one that is not listed, press **Home** at the bottom of that panel.",
										picture: [PROJECTS_FOOT],
										point: "Home",
									},
									{
										text: "The start page asks for a folder. Type its path, or press **Browse…** to choose it.",
										picture: [START_PAGE],
										point: "Browse…",
									},
									{
										text:
											"Press **Open**. For a folder that is not a Roswaal project yet it says " +
											"**Initialise**, which writes a `roswaal.json` and nothing else.",
										picture: [START_PAGE],
										point: "Open",
									},
								],
							},
						],
					},
					{
						id: "start-webapp",
						title: "Desktop (Webapp)",
						device: ["webapp"],
						blocks: [
							{
								t: "p",
								text:
									`Open [the web app](${STABLE_SITE}try.html). Nothing is ` +
									"installed: it opens on a demo project, kept in this browser, and the Roswaal mark " +
									"is blue to say so. To work on your own:",
							},
							{
								t: "walkthrough",
								steps: [
									{
										text: "Click the Roswaal mark at the top left, for the projects panel.",
										picture: [EDITOR_BAR_BROWSER],
										point: "The Roswaal mark",
									},
									{
										text: "Press **Project** at the bottom of the panel.",
										picture: [PROJECTS_FOOT],
										point: "Project",
									},
									{
										text:
											"**Open folder…** works on a folder on your computer and writes into it, as " +
											"the installed editor does. It is in Chrome and Edge.",
										picture: [PROJECT_MENU, PROJECTS_FOOT],
										point: "Open folder…",
									},
									{
										text:
											"Or **Open .zip…**, in any browser, for a project in a zip. It replaces the " +
											"project kept in the browser, and asks first.",
										picture: [PROJECT_MENU, PROJECTS_FOOT],
										point: "Open .zip…",
									},
									{
										text:
											"Or **Open place…** for a `.rbxl` or `.rbxlx`. It shows how many scripts " +
											"Rojo can sync and how many only the place can hold, and asks which to bring " +
											"in. [Places and Rojo projects](places-and-rojo) has the rest.",
										picture: [PROJECT_MENU, PROJECTS_FOOT],
										point: "Open place…",
									},
								],
							},
							{
								t: "p",
								text:
									"**Export…** in the same menu takes the project out as a zip, with its place file if " +
									"it has one, or the place file alone. Folders you have opened are listed in the panel, " +
									"to reopen with a click.",
							},
						],
					},
					{
						id: "start-mobile",
						title: "Mobile (Webapp)",
						device: ["tablet", "phone"],
						blocks: [
							{
								t: "ol",
								items: [
									"On your computer, zip the project's folder: **Compress** in Finder, or " +
										"**Send to → Compressed (zipped) folder** in Explorer.",
									"Put the zip where the device can reach it: AirDrop, iCloud Drive, or any app " +
										"that saves to Files.",
								],
							},
							{ t: "p", text: "Then, on the device:" },
							{
								t: "walkthrough",
								steps: [
									{
										text:
											`Open [the web app](${STABLE_SITE}try.html) and tap the ` + "Roswaal mark.",
										picture: [EDITOR_BAR_TABLET],
										point: "The Roswaal mark",
									},
									{
										text: "Tap **Project** at the bottom of the panel.",
										picture: [PROJECTS_FOOT],
										point: "Project",
									},
									{
										text: "Tap **Open .zip…**, and pick the zip in Files.",
										picture: [PROJECT_MENU, PROJECTS_FOOT],
										point: "Open .zip…",
									},
								],
							},
							{
								t: "p",
								text:
									"**Project → Export…** saves it back to Files as a zip. The panels slide out over " +
									"the graph, and the edits a keyboard makes are buttons under it: " +
									"[The Interface](the-interface) shows where things are, and " +
									"[Controls](controls) has the gestures. An iPad Mini is the smallest screen it " +
									"is made for; a phone is best for reading graphs.",
							},
						],
					},
				],
			},
			{ t: "h", level: 2, text: "Your first script" },
			{
				t: "ol",
				items: [
					"Right-click the project tree and make a new graph. On a touch screen, press and hold instead of right-clicking.",
					"Every script starts at a red **Script Start** node. Nothing runs without one.",
					"Right-click the canvas, search for `Print`, and wire Script Start's execution pin into it.",
					"Type something into the Value pin.",
					"Press **Compile script**. The generated `.luau` appears in the tree beside it.",
				],
			},
			{
				t: "p",
				text:
					"[The Interface](the-interface) shows what each part of the screen is. Most of the " +
					"chrome is icons, and [Toolbars](toolbars) draws every bar with its buttons named — " +
					"including the three at the right-hand end of the top bar, which are Docs, Node " +
					"Design and Settings.",
			},
			{
				t: "code",
				lang: "luau",
				text: code`
					--!strict
					-- Generated by Roswaal. Do not edit this file directly;
					-- edit Hello.nodescript and recompile instead.

					print("Hello")
					`,
			},
			{
				t: "note",
				kind: "warn",
				text:
					"**A generated file you edited by hand is not overwritten.** Recompile with force " +
					"when you mean to replace it.",
			},
			{ t: "h", level: 2, text: "Getting it into Studio" },
			{
				t: "p",
				text:
					"A **node map** describes where your files land in the DataModel, and compiles to a " +
					"Rojo project file. Make one, point a folder at `src`, then run `rojo serve` and " +
					"connect from the Studio plugin.",
			},
			{
				t: "p",
				text:
					"That is the whole loop: edit the graph, compile, Rojo syncs. Set **Compile** to " +
					"**Dynamic** and the compile step happens as you work.",
			},
		],
	};
}
