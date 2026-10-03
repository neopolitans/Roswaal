/**
 * The `wally-packages` page of the documentation. `buildSite` places it.
 */

import { code } from "./blocks.js";
import type { DocPage } from "../site.js";
import {
	ADD_FROM_WALLY, PROJECT_TREE_WALLY, PROJECT_TREE_WALLY_ADDED, REMOVE_PACKAGE, WALLY_MENU,
} from "../toolbars.js";

/**
 * Wally, as Roswaal reads and writes it.
 */
export function wallyPackagesPage(): DocPage {
	return {
		slug: "wally-packages",
		narrow: true,
		title: "Wally packages",
		summary: "Packages in the project tree, how a require reaches one, and adding and removing them.",
		blocks: [
			{
				t: "p",
				text:
					"[Wally](https://wally.run) installs a project's packages into `Packages/` from the " +
					"list in `wally.toml`. Roswaal reads both: the list shows in the project tree, and a " +
					"require that goes through `Packages/` is followed to the package's code.",
			},

			{ t: "h", level: 2, text: "In the project tree" },
			{
				t: "p",
				text:
					"`wally.toml` is under Graph content, with each package it lists and the version " +
					"installed. Double-click one to open its code; one not installed yet says so. " +
					"`Packages/` is under Compile content, in purple, and starts closed.",
			},
			{ t: "toolbar", bar: PROJECT_TREE_WALLY, hint: true },

			{ t: "h", level: 2, text: "How a require reaches a package" },
			{
				t: "p",
				text:
					"`wally install` writes a short file for each package that requires the real one " +
					"from `Packages/_Index`:",
			},
			{
				t: "code",
				lang: "luau",
				text: code`
					-- Packages/Flux.lua, written by Wally
					return require(script.Parent._Index["someone_flux@0.2.0"]["flux"])
					`,
			},
			{
				t: "p",
				text:
					"Roswaal follows it there, and through the package's own project file to its code, " +
					"so `require(ReplicatedStorage.Packages.Flux)` hovers with Flux's own functions and " +
					"comments. A package whose code was copied in over that line is read as the code it is.",
			},

			{ t: "h", level: 2, text: "Adding a package" },
			{
				t: "p",
				text: "Right-click `wally.toml`:",
			},
			{
				t: "table",
				head: ["", "What it does"],
				rows: [
					["**Add from Wally…**", "Puts the line in `wally.toml` and installs the package, with what it depends on"],
					["**Insert package zip…**", "Installs a zip. A Wally package goes where `wally install` puts one; any other module is copied into `Packages/`"],
					["**Insert GitHub repo…**", "Copies a repository's module into `Packages/`, found through its project file. In the installed editor"],
				],
			},
			{
				t: "walkthrough",
				steps: [
					{
						text: "Right-click `wally.toml` in the project tree, or press and hold it on a touch screen.",
						picture: [PROJECT_TREE_WALLY],
						point: "wally.toml",
					},
					{ text: "Choose **Add from Wally…**.", picture: [WALLY_MENU], point: "Add from Wally…" },
					{
						text: "Type the package as `scope/name`. Pick a **Realm** if it is not for both sides.",
						picture: [ADD_FROM_WALLY],
						point: "Package",
					},
					{
						text: "Press **Add**. The line goes into `wally.toml`, then the package installs with what it depends on.",
						picture: [ADD_FROM_WALLY],
						point: "Add",
					},
					{
						text: "It is listed under `wally.toml` with the version installed.",
						picture: [PROJECT_TREE_WALLY_ADDED],
						point: "The new package",
					},
				],
			},
			{
				t: "p",
				text:
					"**Realm** puts the line under `[dependencies]`, `[server-dependencies]` or " +
					"`[dev-dependencies]`, which install into `Packages/`, `ServerPackages/` and " +
					"`DevPackages/`.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"**Add from Wally asks the registry twice a package**, and stops at 16 requests. " +
					"Nothing is retried.",
			},
			{
				t: "p",
				text:
					"If a download fails, the line stays in `wally.toml` and the package shows as not " +
					"installed. Download its zip, right-click the package and choose **Insert its zip…**.",
			},

			{ t: "h", level: 2, text: "Removing a package" },
			{
				t: "p",
				text:
					"**Remove package…**, on a package's menu, lists the files that still require it and " +
					"asks first. It takes the line out of `wally.toml`, and the package out of `Packages/` " +
					"with any package only it needed. Code copied in over the package's file is left " +
					"where it is.",
			},
			{
				t: "walkthrough",
				steps: [
					{ text: "Right-click the package under `wally.toml`.", picture: [PROJECT_TREE_WALLY], point: "A package" },
					{ text: "Choose **Remove package…**.", picture: [WALLY_MENU], point: "Remove package…" },
					{
						text: "It lists the files that still require it. Press **Remove** to take it out.",
						picture: [REMOVE_PACKAGE],
						point: "Remove",
					},
				],
			},
		],
	};
}
