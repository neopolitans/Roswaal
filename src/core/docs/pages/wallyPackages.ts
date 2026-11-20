/**
 * The `wally-packages` page of the documentation. `buildSite` places it.
 */

import type { DocPage } from "../site.js";
import {
	ADD_PACKAGE,
	PROJECT_TREE_WALLY,
	PROJECT_TREE_WALLY_ADDED,
	REMOVE_PACKAGE,
	WALLY_MENU,
	WHICH_VERSION,
} from "../toolbars.js";
import { code } from "./blocks.js";

/**
 * Wally, as Roswaal reads and writes it.
 */
export function wallyPackagesPage(): DocPage {
	return {
		slug: "wally-packages",
		narrow: true,
		title: "Wally packages",
		summary:
			"Packages in the project tree, how a require reaches one, and adding and removing them.",
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
					"The **Packages** heading lists each package by realm, Shared, Server and Dev, " +
					"each realm the folder Wally installs it into. A package shows the version installed, " +
					"and **+1 dependency** opens what Wally installed with it. Code put in `Packages/` " +
					"from a zip or GitHub is **vendored**, and one in `wally.toml` not installed yet is " +
					"**not installed**, with **Install** on its menu. Double-click a package to open its code.",
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
				text:
					"Press **Add** on the Packages heading, or choose **Add package…** on a package's " +
					"menu. **Add a package** takes it from one of three sources:",
			},
			{
				t: "table",
				head: ["Source", "What it does"],
				rows: [
					[
						"**From Wally**",
						"Puts the line in `wally.toml` and installs the package, with what it depends on",
					],
					[
						"**Zip**",
						"Installs a zip. A Wally package goes where `wally install` puts one; any other module is vendored into `Packages/`",
					],
					[
						"**GitHub**",
						"Vendors a repository's module into `Packages/`, found through its project file. In the installed editor",
					],
				],
			},
			{
				t: "walkthrough",
				steps: [
					{
						text: "Press **Add** on the Packages heading in the project tree.",
						picture: [PROJECT_TREE_WALLY],
						point: "Packages",
					},
					{
						text: "Type the package as `scope/name`. Pick a **Realm** if it is not for both sides; under it, the window says where the realm lands in Studio.",
						picture: [ADD_PACKAGE],
						point: "Package",
					},
					{ text: "Press **Add**.", picture: [ADD_PACKAGE], point: "Add" },
					{
						text: "If the registry has more than one version, pick one. The newest is picked already; an older one is pinned to exactly that version.",
						picture: [WHICH_VERSION],
						point: "Version",
					},
					{
						text: "Press **Add**. The line goes into `wally.toml`, then the package installs with what it depends on.",
						picture: [WHICH_VERSION],
						point: "Add",
					},
					{
						text: "It is listed under Packages with the version installed.",
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
					"**From Wally asks the registry twice a package**, and once more for its " +
					"versions when it asks which. It stops at 16 requests, and nothing is retried.",
			},
			{
				t: "p",
				text:
					"If a download fails, the line stays in `wally.toml` and the package shows as not " +
					"installed. Right-click it and choose **Install** to try again, or download its zip " +
					"and choose **Insert its zip…**.",
			},

			{ t: "h", level: 2, text: "Removing a package" },
			{
				t: "p",
				text:
					"**Remove package…**, on a package's menu, lists the files that still require it and " +
					"asks first. It takes the line out of `wally.toml`, and the package out of `Packages/` " +
					"with any package only it needed. Code copied in over the package's file is left " +
					"where it is. A vendored package that `wally.toml` never listed is deleted.",
			},
			{
				t: "walkthrough",
				steps: [
					{
						text: "Right-click the package under Packages.",
						picture: [PROJECT_TREE_WALLY],
						point: "A package",
					},
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
