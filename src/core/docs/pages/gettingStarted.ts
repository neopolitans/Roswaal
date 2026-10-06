/**
 * The `getting-started` page of the documentation. `buildSite` places it.
 */

import {
	WALK_EDITOR,
	WALK_EDITOR_WEB,
	WALK_PROJECT_MENU_TABLET,
	WALK_PROJECT_MENU_WEB,
	WALK_PROJECTS,
	WALK_PROJECTS_TABLET,
	WALK_PROJECTS_WEB,
	WALK_START,
	WALK_TABLET,
} from "../layouts.js";
import { RELEASES_PAGE, SOURCE_REPOSITORY, STABLE_SITE } from "../links.js";
import type { DocPage } from "../site.js";
import { code } from "./blocks.js";

export function gettingStartedPage(): DocPage {
	return {
		slug: "getting-started",
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
							{ t: "h", level: 3, text: "Install roswaal" },
							{
								t: "p",
								text:
									"`roswaal` is one file: the command, the daemon and the editor together, with " +
									`nothing else to install. Download it for your computer from [the latest release](${RELEASES_PAGE}).`,
							},
							{
								t: "tabs",
								label: "Your computer",
								tabs: [
									{
										id: "install-macos",
										title: "macOS",
										blocks: [
											{
												t: "p",
												text:
													"Download `roswaal-<version>-macos-aarch64.zip`. It is for Apple Silicon: " +
													"M1 and later. Safari unzips it for you; elsewhere, double-click the zip. " +
													"Then, in Terminal, put it somewhere your shell looks:",
											},
											{
												t: "code",
												lang: "sh",
												text: code`
													mkdir -p ~/.local/bin
													mv ~/Downloads/roswaal ~/.local/bin/
													xattr -d com.apple.quarantine ~/.local/bin/roswaal
													echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zprofile
													`,
											},
											{
												t: "p",
												text: "Open a new Terminal window and `roswaal version` prints the version.",
											},
											{
												t: "note",
												kind: "info",
												text:
													"**Why the extra step.** macOS marks every download as *quarantined*, and will not " +
													"run a quarantined program unless Apple has notarised it. This build is not " +
													"notarised yet, so macOS says it cannot check it for malicious software and " +
													"refuses. `xattr -d com.apple.quarantine` takes the mark off this one file, " +
													"which says you trust it; it changes nothing else. Signing with an Apple " +
													"Developer ID is planned for late October 2026, and this step goes away then.",
											},
										],
									},
									{
										id: "install-windows",
										title: "Windows",
										blocks: [
											{
												t: "p",
												text:
													"Download `roswaal-<version>-windows-x86_64.zip`, for 64-bit Intel and AMD. " +
													"Then, in PowerShell, from the folder it downloaded to:",
											},
											{
												t: "code",
												lang: "powershell",
												text: code`
													$dir = "$env:LOCALAPPDATA\Programs\roswaal"
													Expand-Archive .\roswaal-*-windows-x86_64.zip -DestinationPath $dir -Force
													Unblock-File "$dir\roswaal.exe"
													$path = [Environment]::GetEnvironmentVariable("Path", "User")
													[Environment]::SetEnvironmentVariable("Path", "$path;$dir", "User")
													`,
											},
											{
												t: "p",
												text:
													"Open a new terminal and `roswaal version` prints the version. " +
													"`Unblock-File` takes off the mark Windows puts on downloads, so it does not " +
													"ask about this file again. The path change is yours alone, and is undone " +
													"in **Settings → System → About → Advanced system settings → Environment Variables**.",
											},
										],
									},
									{
										id: "install-rokit",
										title: "With Rokit",
										blocks: [
											{
												t: "p",
												text:
													"If you install Rojo with [Rokit](https://github.com/rojo-rbx/rokit), it " +
													"installs `roswaal` the same way, and picks the file for your computer:",
											},
											{
												t: "code",
												lang: "sh",
												text: code`
													rokit add neopolitans/Roswaal roswaal
													`,
											},
										],
									},
									{
										id: "install-source",
										title: "From source",
										blocks: [
											{
												t: "p",
												text:
													"On any computer with [Node.js](https://nodejs.org) 24, build it from " +
													"a clone. `npm link` puts `roswaal` on your path, pointing at the clone, " +
													"so a rebuild takes effect without installing again.",
											},
											{
												t: "code",
												lang: "sh",
												text: code`
													git clone ${SOURCE_REPOSITORY}
													cd Roswaal
													npm install
													npm run build
													npm link
													`,
											},
										],
									},
								],
							},
							{ t: "h", level: 3, text: "Start it" },
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
										window: WALK_EDITOR,
										point: "The mark",
									},
									{
										text: "For one that is not listed, press **Home** at the bottom of that panel.",
										window: WALK_PROJECTS,
										point: "Home",
									},
									{
										text: "The start page asks for a folder. Type its path, or press **Browse…** to choose it.",
										window: WALK_START,
										point: "Browse…",
									},
									{
										text:
											"Press **Open**. For a folder that is not a Roswaal project yet it says " +
											"**Initialise**, which writes a `roswaal.json` and nothing else.",
										window: WALK_START,
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
										window: WALK_EDITOR_WEB,
										point: "The mark",
									},
									{
										text: "Press **Project** at the bottom of the panel.",
										window: WALK_PROJECTS_WEB,
										point: "Project",
									},
									{
										text:
											"**Open folder…** works on a folder on your computer and writes into it, as " +
											"the installed editor does. It is in Chrome and Edge.",
										window: WALK_PROJECT_MENU_WEB,
										point: "Open folder…",
									},
									{
										text:
											"Or **Open .zip…**, in any browser, for a project in a zip. It replaces the " +
											"project kept in the browser, and asks first.",
										window: WALK_PROJECT_MENU_WEB,
										point: "Open .zip…",
									},
									{
										text:
											"Or **Open place…** for a `.rbxl` or `.rbxlx`. It shows how many scripts " +
											"Rojo can sync and how many only the place can hold, and asks which to bring " +
											"in. [Places and Rojo projects](places-and-rojo) has the rest.",
										window: WALK_PROJECT_MENU_WEB,
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
										window: WALK_TABLET,
										point: "The mark",
									},
									{
										text: "Tap **Project** at the bottom of the panel.",
										window: WALK_PROJECTS_TABLET,
										point: "Project",
									},
									{
										text: "Tap **Open .zip…**, and pick the zip in Files.",
										window: WALK_PROJECT_MENU_TABLET,
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
					"including the three at the right-hand end of the top row, which are Docs, Node " +
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
