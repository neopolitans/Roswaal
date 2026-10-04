/**
 * The `building-and-rojo` page of the documentation. `buildSite` places it.
 */

import type { NodeMap } from "../../nodemap.js";
import type { DocPage } from "../site.js";

/**
 * The map drawn on the Roblox page.
 *
 * Small on purpose. It is here to be read in one look and matched against the
 * file beside it, not to be a realistic project — a tree deep enough to be
 * realistic is one where the reader loses which row they were following.
 *
 * `Shared` carries a class *and* a path, which is the case worth seeing: the
 * row says Folder, and the project file does not, because a path pointing at
 * a directory already tells Rojo that much.
 */
const ROBLOX_MAP: NodeMap = {
	schemaVersion: 1,
	kind: "map",
	id: "docs-map-roblox",
	name: "Tycoon",
	output: "default.project.json",
	root: {
		id: "dm",
		name: "DataModel",
		className: "DataModel",
		children: [
			{
				id: "rs",
				name: "ReplicatedStorage",
				children: [
					{ id: "shared", name: "Shared", className: "Folder", path: "src/Shared", children: [] },
				],
			},
			{
				id: "sss",
				name: "ServerScriptService",
				children: [
					{ id: "server", name: "Server", className: "Folder", path: "src/Server", children: [] },
				],
			},
		],
	},
};

export function buildingAndRojoPage(): DocPage {
	return {
		// The slug stays. It is in published links and in the editor's own jump
		// list, and a title is not a URL -- renaming the page should not move it.
		slug: "building-and-rojo",
		narrow: true,
		title: "Compiling and nodemaps for Roblox",
		summary: "How a graph becomes a file, and a file becomes an instance in Studio.",
		blocks: [
			{
				t: "p",
				text:
					"This page is about graphs whose **Target** is Roblox. The bar along the top of " +
					"the canvas says which, and a new graph takes the project's. For Lune, the answer " +
					"is a different one and it is on " +
					"[Compiling and nodemaps for Lune](compiling-for-lune).",
			},
			{
				t: "p",
				text:
					"A graph is a `.nodescript` under `.roswaal/scripts`. Compiling it writes a `.luau` " +
					"file to the same place under `src`, and [Rojo](https://rojo.space) syncs that into " +
					"Studio. Roswaal never talks to Studio itself.",
			},
			{
				t: "p",
				text:
					"Folders carry across: `.roswaal/scripts/ReplicatedStorage/Shared/Greeter.nodescript` " +
					"writes `src/ReplicatedStorage/Shared/Greeter.luau`. Both directories are project " +
					"[settings](settings).",
			},

			{ t: "h", level: 2, text: "Nodemap basics" },
			{
				t: "p",
				text:
					"Here is the whole of it. A `.nodemap` is edited in Roswaal rather than as JSON by " +
					"hand, and this is that editor — the tree on the left, the Inspector on the right, " +
					"and the project file it writes underneath. Every part is named beside it; the rest " +
					"of this page explains them in order.",
			},
			{
				t: "nodemap",
				map: ROBLOX_MAP,
				caption:
					"The real panel. **Select a row** and the Inspector fills with that instance's " +
					"fields, while the project file scrolls to the lines the row writes. A row lights " +
					"its own lines and not its children's — they are rows too. The fields are filled " +
					"rather than editable: this is the editor demonstrating itself, not a scratch " +
					"project.",
			},
			{ t: "h", level: 2, text: "What a graph compiles to" },
			{
				t: "p",
				text:
					"The file is named after the graph, and its ending comes from the script kind, " +
					"chosen in the tools along the top of the canvas. The ending is how Rojo knows " +
					"which class of instance to make.",
			},
			{
				t: "table",
				head: ["Kind", "File", "In Studio"],
				rows: [
					["Script", "`Greeter.server.luau`", "A `Script`, running on the server"],
					[
						"LocalScript",
						"`Greeter.client.luau`",
						"A `LocalScript`, running on a player's machine",
					],
					["ModuleScript", "`Greeter.luau`", "A `ModuleScript`, run by whatever requires it"],
				],
			},

			{ t: "h", level: 2, text: "Compiling" },
			{
				t: "table",
				head: ["", "What it compiles"],
				rows: [
					["**Compile script**, or `Ctrl` + `S`", "The open graph"],
					["**Compile project**", "Every graph, then every node map"],
					[
						"**Compile: Dynamic**",
						"Each graph as you edit it, and any that change on disk — after a `git pull`, say",
					],
					["`roswaal compile`", "Everything, or the one graph or map you give it"],
					["`roswaal watch`", "The same, without the editor"],
				],
			},
			{
				t: "p",
				text:
					"A graph with errors writes nothing; warnings do not stop it. With `format` on and " +
					"[StyLua](https://github.com/JohnnyMorganz/StyLua) on your PATH, the file is " +
					"formatted as it is written.",
			},
			{
				t: "p",
				text:
					"In either mode, an open graph whose file changes on disk takes the new version. If it " +
					"has edits that are not saved yet, you are asked which to keep.",
			},

			{ t: "h", level: 2, text: "Generated files" },
			{
				t: "p",
				text:
					"A generated file starts with a header naming its graph and a hash of what was " +
					"written. Roswaal will not overwrite a file whose hash no longer matches — one " +
					"edited by hand — or a file it did not write.",
			},
			{
				t: "note",
				kind: "danger",
				text:
					"To overwrite one anyway, click **overwrite** in the compile results, or run `roswaal " +
					"compile --force`. **The hand edit is lost.**",
			},

			{ t: "h", level: 2, text: "Moving and deleting graphs" },
			{
				t: "p",
				text:
					"Rename a graph, move it or change its kind, and its next compile removes the file " +
					"it used to write.",
			},
			{
				t: "p",
				text:
					"A generated file whose graph is gone is **stale**, and Rojo goes on syncing it. The " +
					"compile results list stale files with a **remove** link. From the command line, " +
					"`roswaal prune` lists them and `roswaal prune --yes` removes them.",
			},

			{ t: "h", level: 2, text: "Building a node map" },
			{
				t: "p",
				text:
					"A `.nodemap` says where your files land in the DataModel, and compiles to a Rojo " +
					"project file — `default.project.json` unless you change it. You edit the tree in " +
					"Roswaal rather than the JSON by hand.",
			},
			{
				t: "p",
				text:
					"Two things in that file are worth naming, because both are Roswaal leaving " +
					"something out on purpose. A service carries no `$className`, because Rojo already " +
					"knows what `ReplicatedStorage` is and saying it again is something Rojo rejects. " +
					"And `Shared` is a Folder in the tree with no `$className` in the file, because a " +
					"path pointing at a directory already implies one.",
			},
			{
				t: "p",
				text:
					"Make a map with **New map** in the toolbar, or by right-clicking a folder in the " +
					"project tree. It starts with `src` in ServerScriptService. Select an instance to " +
					"edit it:",
			},
			{
				t: "table",
				head: ["Field", "What it does"],
				rows: [
					["Name", "The instance's name in the DataModel"],
					[
						"Class",
						"Blank for a service, because Rojo already knows what ServerScriptService is. Otherwise Folder, Model, Configuration, ScreenGui, Part or Tool",
					],
					[
						"Path",
						"The folder or file on disk that fills the instance. A folder under `src` is made when the map is written, with its mirror under `.roswaal/scripts` for the graphs; anything else is marked when Roswaal cannot find it",
					],
					["Ignore unknown", "Rojo leaves alone anything in Studio that it did not put there"],
					[
						"Ignore paths",
						"Files under the path that Rojo should skip. Start one with `/` to write it from the project root",
					],
				],
			},
			{
				t: "p",
				text:
					"**Add folder** and **Add service** build the tree. Under **Project file**, " +
					"**Output** is where the file is written and **Project-wide ignores** go to Rojo as " +
					"written. The JSON it will write is shown underneath, with anything wrong — an " +
					"instance with no name, or two with the same one.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"A map is written only by **Write project file**, **Compile project** or `roswaal " +
					"compile` — never by Dynamic. Writing it makes the folders it syncs. A project " +
					"file Roswaal did not write needs `--force`.",
			},

			{ t: "h", level: 2, text: "Requiring a module" },
			{
				t: "p",
				text:
					"A map is also how Roswaal knows where a file ends up. Drag a graph or a `.luau` " +
					"from the project tree onto the canvas, and it offers **Require Module** with the " +
					"path filled in — `src/ReplicatedStorage/Shared/Greeter.luau` becomes " +
					"`ReplicatedStorage.Shared.Greeter` — or **Instance** for a reference to it. If no " +
					"map covers the file, it says so.",
			},

			{ t: "h", level: 2, text: "An existing game" },
			{
				t: "p",
				text:
					"A Rojo project or a place you already have becomes a Roswaal project on " +
					"[Places and Rojo projects](places-and-rojo), which also covers browsing the place " +
					"and writing scripts back into it. Packages are on [Wally packages](wally-packages).",
			},
		],
	};
}
