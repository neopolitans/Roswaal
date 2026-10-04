/**
 * The `building-and-rojo` page of the documentation. `buildSite` places it.
 */

import type { MapNode, NodeMap } from "../../nodemap.js";
import type { DocPage } from "../site.js";
import { EDITOR_BAR, MAP_BAR } from "../toolbars.js";

/**
 * A map partway through being built, for the walkthrough: a new map's
 * ServerScriptService, then whatever ReplicatedStorage holds by that step.
 */
function buildingMap(replicated: MapNode[] | null): NodeMap {
	const children: MapNode[] = [
		{
			id: "sss",
			name: "ServerScriptService",
			children: [{ id: "source", name: "Source", className: "Folder", path: "src", children: [] }],
		},
	];
	if (replicated) children.push({ id: "rs", name: "ReplicatedStorage", children: replicated });
	return {
		schemaVersion: 1,
		kind: "map",
		id: "docs-map-building",
		name: "Game",
		output: "default.project.json",
		root: { id: "dm", name: "DataModel", className: "DataModel", children },
	};
}

const folder = (name: string, path?: string): MapNode => ({
	id: "shared",
	name,
	className: "Folder",
	...(path ? { path } : {}),
	children: [],
});

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
					"A `.nodemap` says where your files land in the DataModel, and is edited in Roswaal " +
					"rather than as JSON by hand. Here is one built from the start:",
			},
			{
				t: "walkthrough",
				steps: [
					{
						text:
							"Press **New node map** on the top row, or right-click a folder in the Project " +
							"panel, and name the map.",
						picture: [EDITOR_BAR],
						point: "New node map",
					},
					{
						text:
							"It opens in a tab of its own: the tree on the left, the Inspector on the right. " +
							"A new map starts with ServerScriptService, filled from `src`.",
						map: { map: buildingMap(null), select: "dm" },
						point: "tree",
					},
					{
						text:
							"With **DataModel** selected, **Add service…** adds a service under it. Pick " +
							"ReplicatedStorage.",
						map: { map: buildingMap(null), select: "dm" },
						point: "actions",
					},
					{
						text: "Select ReplicatedStorage and press **Add folder**.",
						map: { map: buildingMap([]), select: "rs" },
						point: "actions",
					},
					{
						text: "Name the folder in **Name**.",
						map: { map: buildingMap([folder("Folder")]), select: "shared" },
						point: "name",
					},
					{
						text:
							"Set **Path** to the folder on disk that fills it. A folder under `src` that is " +
							"not there yet is made when the map is written.",
						map: { map: buildingMap([folder("Shared")]), select: "shared" },
						point: "path",
					},
					{
						text:
							"The project file shows what the map writes, with the selected row's lines " + "lit.",
						map: { map: buildingMap([folder("Shared", "src/Shared")]), select: "shared" },
						point: "preview",
					},
					{
						text:
							"Press **Write project file**, or `Ctrl` + `S`. In Dynamic mode, saving the map " +
							"writes it.",
						picture: [MAP_BAR],
						point: "Write project file",
					},
				],
			},
			{ t: "h", level: 2, text: "What a graph compiles to" },
			{
				t: "p",
				text:
					"The file is named after the graph, and its ending comes from the script kind, " +
					"chosen in the Inspector with nothing selected. The ending is how Rojo knows " +
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
				t: "nodemap",
				map: ROBLOX_MAP,
				caption:
					"The real panel. **Select a row** and the Inspector fills with that instance's " +
					"fields, while the project file scrolls to the lines the row writes. A row lights " +
					"its own lines and not its children's — they are rows too. The fields are filled " +
					"rather than editable: this is the editor demonstrating itself, not a scratch " +
					"project.",
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
					"Select an instance to edit it. Drag the line between the tree and the Inspector to " +
					"resize them.",
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
					"In Dynamic mode a saved map rewrites its project file. **Write project file**, " +
					"**Compile project** and `roswaal compile` also make the folders it syncs, and move " +
					"a folder whose path you changed to the new path, with its graphs. A project file " +
					"Roswaal did not write needs `--force`.",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"A graph in a folder no map syncs is listed in Script analysis as **unsynced**: " +
					"its Luau is written, but Rojo never sees it.",
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
