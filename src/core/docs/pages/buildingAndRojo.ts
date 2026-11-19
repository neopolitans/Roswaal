/**
 * The `building-and-rojo` page of the documentation. `buildSite` places it.
 */

import type { MapNode, NodeMap } from "../../nodemap.js";
import { FEEDBACK_REPOSITORY } from "../links.js";
import type { DocPage } from "../site.js";
import { MAP_BAR, PROJECT_TREE_NEW } from "../toolbars.js";

/**
 * A map partway through being built, for the walkthrough: a new map's
 * ServerScriptService, then ReplicatedStorage once it is added. Both synced
 * from their own folders in `src`, as the reading rule gives them.
 */
function buildingMap(replicated: boolean): NodeMap {
	const children: MapNode[] = [
		{ id: "sss", name: "ServerScriptService", path: "src/ServerScriptService", children: [] },
	];
	if (replicated) {
		children.push({
			id: "rs",
			name: "ReplicatedStorage",
			path: "src/ReplicatedStorage",
			children: [],
		});
	}
	return {
		schemaVersion: 1,
		kind: "map",
		id: "docs-map-building",
		name: "Game",
		output: "default.project.json",
		root: { id: "dm", name: "DataModel", className: "DataModel", children },
	};
}

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
					{
						id: "shared",
						name: "Shared",
						className: "Folder",
						path: "src/ReplicatedStorage/Shared",
						children: [],
					},
				],
			},
			{
				id: "sss",
				name: "ServerScriptService",
				children: [
					{
						id: "server",
						name: "Server",
						className: "Folder",
						path: "src/ServerScriptService/Server",
						children: [],
					},
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
							"Point at a folder in the Project panel and press its **New node map** button, or " +
							"right-click the folder and choose **New map here**, then name the map.",
						picture: [PROJECT_TREE_NEW],
						point: "New graph and New node map",
					},
					{
						text:
							"It opens as its own mode: the tree in the middle, **Instance** and **This map** " +
							"on the right, the **Project file** along the foot. A new map starts with " +
							"ServerScriptService, synced from `src/ServerScriptService`.",
						map: { map: buildingMap(false), select: "dm" },
						point: "tree",
					},
					{
						text:
							"**Service** adds a service, synced from its own folder in `src`. Pick " +
							"ReplicatedStorage. A folder not there yet is made when the map is written.",
						map: { map: buildingMap(true), select: "rs" },
						point: "actions",
					},
					{
						text:
							"With ReplicatedStorage picked, **Folder** makes a folder in " +
							"`src/ReplicatedStorage`. Rojo brings it in through ReplicatedStorage, so the map " +
							"needs no row of its own for it.",
						map: { map: buildingMap(true), select: "rs" },
						point: "actions",
					},
					{
						text: "The project file shows what the map writes, with the picked row's lines lit.",
						map: { map: buildingMap(true), select: "rs" },
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
					"formatted as it is written. If StyLua refuses it, it is written unformatted and the compile says why.",
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
					"The real editor. **Select a row** and **Instance** fills with its fields, while the " +
					"project file scrolls to the lines the row writes. A row lights its own lines and " +
					"not its children's: they are rows too. The fields are filled rather than editable.",
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
					"Select an instance to edit it in **Instance**. The panels around the tree dock, " +
					"resize, fold and close like any other, and the Panels menu brings one back.",
			},
			{ t: "h", level: 3, text: "The reading rule" },
			{
				t: "p",
				text:
					"Where a folder lands follows from where it sits, so a map is built from one side. " +
					"A folder named for a service lands in that service; Rojo's `src/shared`, " +
					"`src/server` and `src/client` land where its template puts them; anything else " +
					"lands inside its parent, as a Folder.",
			},
			{
				t: "p",
				text:
					"**Service** and **Folder** fill in paths by it, and renaming a row moves the folder " +
					"the rule gave it. The switch over the tree reads it from either end: **DataModel** " +
					"lists instances with the folder that fills each, **src** lists folders with where " +
					"each lands. A mapping the rule would not have given is an exception, counted under " +
					"the tree.",
			},
			{
				t: "p",
				text:
					"**Graph** and **List**, after the map's tab, draw the same tree two ways. **Graph** " +
					"opens the map on the canvas: the DataModel on the left, and a wire from each node to " +
					"what it holds. Pan, zoom and move nodes as on a graph. Their places are kept in the " +
					"`.nodemap`, and **Realign** lays them out again. Selecting works as on a graph: " +
					"drag on empty canvas for a marquee, Shift or Ctrl to add, `Ctrl` + `A` for " +
					"everything, `A` to line it up, and Delete for the selection. **List** draws rows, " +
					"with the switch that reads them from either end.",
			},
			{
				t: "p",
				text:
					"**Syncs from** on each node is the folder or model file Rojo fills it from. Choose " +
					"another, or **Pass through**: the node syncs nothing and holds what is wired under " +
					"it, each folder inside mapped on its own. Choosing the rule's folder folds plain " +
					"folders mapped inside it into that one. **Optional** writes Rojo's optional path, so " +
					"a missing folder passes through instead of failing. A node passing through says when " +
					"files directly in its folder would not sync.",
			},
			{
				t: "p",
				text:
					"Its **DataModel** tab lists the place's instances, starting at the node's own. " +
					"**Keep from the place** syncs nothing there and has Rojo leave the instance as the " +
					"place has it. **Save as a model file** copies the picked instance to a `.rbxm` at the " +
					"node's folder and syncs from that; the place keeps its own.",
			},
			{
				t: "p",
				text:
					"While a map is open, Script analysis lists its problems under **This Map**: each " +
					"mapping the reading rule would not give, with **use the rule's folder** beside it.",
			},
			{
				t: "p",
				text:
					"**Drag a wire off a node's out pin** into empty space for the picker: the folders the " +
					"reading rule puts there, classes, and Comment. Drop it on another node instead to " +
					"move that node here. **Pick up a node's incoming wire** and drop it on another node " +
					"to move it there. The folder the rule gave it moves too, with its graphs. Moved into " +
					"a node that syncs its folder, a plain folder is folded into it.",
			},
			{
				t: "p",
				text:
					"**Comments** frame nodes with a title and a note. They are kept in the `.nodemap` " +
					"and never reach the project file. Press `C`, or pick Comment, to add one.",
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
						"The folder or file on disk that fills the instance, inside the project. **Choose…** picks one. A folder under `src` is made when the map is written, with its mirror under `.roswaal/scripts` for the graphs; anything else is marked when Roswaal cannot find it",
					],
					[
						"Optional",
						"A missing folder passes through instead of failing, as Rojo's optional path",
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
					"**Service** and **Folder** build the tree. Drag a row to move it, or a folder from " +
					"the Project panel to map it. In **This map**, **Writes** is the file it writes, " +
					"**Place IDs**, **Game ID** and **Port** are Rojo's place settings, and " +
					"**Project-wide ignores** go to Rojo as written. Anything wrong, such as two " +
					"instances with one name, is listed under the tree, and in Graph under its node.",
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
					"A graph in a folder no map syncs is listed in Script analysis, under **Project**, as **unsynced**: " +
					"its Luau is written, but Rojo never sees it.",
			},
			{
				t: "note",
				kind: "danger",
				text:
					"**Paths stay inside the project.** A path or output that leads out, such as `../shared`, " +
					"is an error, and the project file is not written. If your project needs one, " +
					`[tell us](${FEEDBACK_REPOSITORY}/issues/new).`,
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
