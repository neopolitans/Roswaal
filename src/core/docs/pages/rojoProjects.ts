/**
 * The `rojo-projects` page of the documentation. `buildSite` places it.
 */

import type { MapNode, NodeMap } from "../../nodemap.js";
import { projectToMap } from "../../rojoImport.js";
import { FEEDBACK_REPOSITORY } from "../links.js";
import type { DocPage } from "../site.js";
import { MAP_BAR, PROJECT_TREE_WALLY } from "../toolbars.js";

/**
 * A Rojo project as a Wally game usually has one: shared code and packages in
 * ReplicatedStorage, the server's and the client's own folders. Read into a
 * map by the importer itself, so the picture is what Import Rojo project makes
 * of it -- and a test holds that the map writes this file back unchanged.
 */
export const ROJO_SAMPLE = {
	name: "orchard",
	tree: {
		$className: "DataModel",
		ReplicatedStorage: {
			Shared: { $path: "src/shared" },
			Packages: { $path: "Packages" },
		},
		ServerScriptService: {
			Server: { $path: "src/server" },
		},
		StarterPlayer: {
			StarterPlayerScripts: {
				Client: { $path: "src/client" },
			},
		},
	},
};

const ROJO_IMPORTED: NodeMap = (() => {
	let n = 0;
	return projectToMap(ROJO_SAMPLE, {
		output: "default.project.json",
		fallbackName: "orchard",
		makeId: () => `rojo-${n++}`,
	}).map;
})();

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

/**
 * Rojo projects and the node maps that write them: bringing a project in,
 * starting one, and saying where files land in Studio. Compiling is on
 * *Compiling for Roblox*, and the place itself on *Editing a place*.
 */
export function rojoProjectsPage(): DocPage {
	return {
		slug: "rojo-projects",
		narrow: true,
		title: "Rojo projects and node maps",
		summary:
			"Bringing in a Rojo project or starting one, and the node maps that say where your files land in Studio.",
		blocks: [
			{
				t: "p",
				text:
					"A Rojo project's `default.project.json` says where each folder lands in Studio. In " +
					"Roswaal a node map writes it. This page is how a project comes in, how to start one, " +
					"and how a map is built. Compiling is on [Compiling for Roblox](compiling-for-roblox), " +
					"and the place on [Editing a place](editing-a-place).",
			},

			{ t: "h", level: 2, text: "Starting from a Rojo project" },
			{
				t: "p",
				text:
					"A project Rojo already manages has its tree in `default.project.json`. **Project → " +
					"Import Rojo project…**, or `roswaal import default.project.json`, reads it into a node " +
					"map beside your graphs. The file is not changed, and every field in it is kept, " +
					"including ones the map editor has no control for. A `.project.jsonc` file, or one with " +
					"comments and trailing commas, reads as Rojo reads it.",
			},
			{
				t: "nodemap",
				map: ROJO_IMPORTED,
				caption:
					"A project file read into a map. **Select a row** for its fields; the project file " +
					"beside it is the one the map writes, the same as the one it was read from.",
			},
			{
				t: "p",
				text:
					"It asks which. **Project File Only** is the map, and your Luau stays hand-written, " +
					"as the tree already lists it. **Project File + Luau as Graphs** is the map and then " +
					"every hand-written `.luau` in the folders the file syncs, read into graphs with one " +
					"set of [Import as graph](project-panel) settings. Wally's packages are left out, and " +
					"the `.luau` files are not changed.",
			},
			{
				t: "p",
				text:
					"**Browse…**, **Open .zip…** and **Open folder…** offer the same when there is a " +
					"project file no map writes, with a list to pick from when there are several. A place " +
					"file in the zip or folder is found too.",
			},
			{
				t: "p",
				text:
					"When the map compiles back to the same project, the map writes the file from then on. " +
					"Compiling leaves it alone until the map changes, and then keeps its indentation and " +
					"line endings. If the map would write it differently, the file stays yours until you " +
					"compile with force.",
			},

			{ t: "h", level: 2, text: "Starting from nothing" },
			{
				t: "p",
				text:
					"`roswaal new`, **Create** on the start page and **New project…** in the editor make a " +
					"project with `place.rbxl` unless you say not to: the place Studio starts a new " +
					"experience with. A 2048-stud `Baseplate` with its top at height 0, a 12-stud " +
					"`SpawnLocation` standing on it at the centre, and Studio's sky, light and chat. " +
					"Roswaal writes it itself rather than copying Studio's Baseplate template, and Studio " +
					"makes the Camera and the Terrain when the file is opened. `roswaal export` writes the " +
					"project's scripts into it, with the folders they need. In the installed editor, " +
					"**Choose…** beside New project's folder opens the system's folder dialog.",
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
							"Press **New map** on the Project panel's Node maps heading, or right-click a " +
							"folder and choose **New map here**, then name the map.",
						picture: [PROJECT_TREE_WALLY],
						point: "New map",
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
					"a missing folder passes through instead of failing; it needs Rojo 7.1 or later. A node passing through says when " +
					"files directly in its folder would not sync.",
			},
			{
				t: "p",
				text:
					"A node marked **autosync** holds a Wally realm's folder that roswaal.json keeps " +
					"synced. Moving or renaming it changes where autosync keeps it; deleting it asks to " +
					"turn autosync off, since the mapping would otherwise come back. Its Syncs from is " +
					"the realm's folder and cannot be changed while autosync is on.",
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
				t: "p",
				text:
					"**One map is served.** It writes `default.project.json`, which `rojo serve` reads. " +
					"Every other map writes its own file under `.roswaal/projects`, with its paths " +
					"written from there, so `rojo serve .roswaal/projects/Lobby.project.json` still " +
					"serves it. **Serve this map**, on a map's menu or in This map, swaps them. A new " +
					"map starts unserved while another serves.",
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
		],
	};
}
