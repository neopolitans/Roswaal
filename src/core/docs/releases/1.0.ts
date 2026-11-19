/**
 * Release notes for 1.0: 1.0.0, its patches, and the canary builds leading to
 * each, newest first.
 *
 * One of the files `../releases.ts` puts together, a minor version each.
 */

import type { Release } from "../releases.js";

export const RELEASES_1_0: Release[] = [
	{
		version: "1.0.0-canary.20",
		date: "2026-11-20",
		headline: "Syncs from reaches into the place, and a map's problems are in Script analysis.",
		added: [
			"**Syncs from's DataModel tab** lists the place's instances, starting at the node's own. **Keep from the place** has Rojo leave that instance as the place has it. **Save as a model file** copies an instance to a .rbxm at the node's folder and syncs from it; the place keeps its own.",
			"**Model files in Syncs from.** The Files tab offers .rbxm, .rbxmx and .model.json files beside folders. The project file leaves the class to the file.",
			"**This Map** in Script analysis, while a map is open: each mapping the reading rule would not give, with use the rule's folder beside it, and the map's other problems. A row picks its node.",
			"**Align on a map.** `A` lines up the selection as on a graph: the first node picked stays, and the rest follow the wires to it.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.0.0-canary.19",
		date: "2026-11-20",
		headline: "A node map selects as a graph does.",
		added: [
			"**Selecting on a map's canvas.** Drag on empty canvas for a marquee, or hold a finger still and then drag. Shift or Ctrl adds to the selection, `Ctrl` + `A` selects everything, and Escape clears it.",
			"**The selection moves and deletes together.** Dragging any node or comment in it moves the rest, and Delete removes all of it. `C` draws a comment around it, and `Ctrl` + `Shift` + `L` realigns the map.",
		],
		changed: [
			"**Dragging empty canvas** on a map draws a marquee with a mouse, as on a graph. The middle button or Alt pans, and a finger still pans.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.0.0-canary.18",
		date: "2026-11-20",
		headline: "A node map opens on the canvas, as a graph does.",
		added: [
			"**A node map on the canvas.** The DataModel is on the left, and a wire runs from each node to what it holds. Pan, zoom and move nodes as on a graph. Their places are kept in the `.nodemap`, and **Realign** lays the map out again.",
			"**Syncs from** on each node picks the folder Rojo fills it from, or **Pass through**. **Optional** writes Rojo's optional path, so a missing folder passes through instead of failing. Instance has it too, and importing a Rojo project reads it.",
			"**Drag a wire off a node's out pin** for a picker of the folders the reading rule puts there, classes and Comment, placed where you let go. Drop the wire on a node instead to move that node here.",
			"**Pick up a node's incoming wire** and drop it on another node to move it there. Its folder moves too, with its graphs. Moved into a node that syncs its folder, a plain folder is folded in.",
			"**Comments on a map**, with a title and a note. They are kept in the `.nodemap`, and the project file never sees them.",
		],
		changed: [
			"**Add, Realign, and Graph or List** follow the map's tab. A map opens in Graph; List keeps the rows.",
			"**A mapping the reading rule would not give** shows its warning under its node.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.0.0-canary.17",
		date: "2026-11-20",
		headline: "The top bar gives its room to the tabs.",
		changed: [
			"**Manual or Dynamic** is one button saying which, with the other in its menu.",
			"**The Project and Inspector buttons** moved into the Panels menu, as Left column and Right column. **Column buttons** in Settings puts them back in the bar. A touch screen keeps them.",
			"**A node map** shows its tab and nothing after it. Its Rojo project's name is in This map.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.0.0-canary.16",
		date: "2026-11-20",
		headline: "A node map's graph is drawn as graph nodes, each saying whether it syncs.",
		added: [
			"**Sync** on each node of a map, in the graph and in Instance: Syncs, where Rojo fills it from its own folder, or Passes through, where it only holds what is mapped under it. Switching to Syncs folds plain folders mapped inside it into that folder; switching to Passes through maps each folder inside it on its own.",
			"**A node that passes through** says when files directly in its folder would not sync.",
		],
		changed: [
			"**The map's graph** draws its nodes as the canvas does: a header tinted by what the node is, flow pins joined header to header, and + Add under the picked node.",
			"**Path** in Instance shows only while the node syncs.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.0.0-canary.15",
		date: "2026-11-19",
		headline: "A node map can be drawn as a graph.",
		added: [
			"**Graph**, beside List over a node map's tree, draws it left to right with each level a column, wired from parent to child, from the DataModel or from src. The + on a node's right edge adds a service on the DataModel and a folder anywhere else, and the reading rule sits in the corner with its exceptions. Drag the empty canvas to move about it.",
		],
		fixed: ["**A node map's tree** ran under the Project file docked along the foot."],
		affects: ["editor", "docs"],
	},
	{
		version: "1.0.0-canary.14",
		date: "2026-11-19",
		headline: "Node maps are a mode of their own, read from either end.",
		added: [
			"**The reading rule.** A folder named for a service lands in that service, Rojo's template folders land where its template puts them, and anything else lands inside its parent. **Service** and **Folder** fill in paths by it, renaming a row moves the folder it gave, and a mapping it would not give is counted as an exception.",
			"**The tree reads from either end:** DataModel lists instances with the folder that fills each, src lists folders with where each lands. Folders on disk under a synced instance are listed too, and **Map it** maps one where the rule puts it.",
			"**Choose…** beside a path picks a folder from the project as Save As does, with New folder.",
			"**Rojo's place settings** are fields in This map: Place IDs, Blocked place IDs, Place ID, Game ID and Port.",
		],
		changed: [
			"**The node map editor** is a mode, as the Place Editor is: the tree in the middle, Instance and This map on the right, and the Project file along the foot. Each is a panel that docks, resizes, folds and closes.",
			"**Rows** carry the Explorer's icons, the map's mark on each synced folder, and a chip saying what is at the path: files, empty, made when written, or not found. A chip shows its folder in the Project panel.",
			"**Rows drag** to move or nest, and a folder dragged in from the Project panel is mapped. Delete is on a row's menu and the Delete key.",
			"**The Project file** says whether the file on disk matches what the map writes.",
			"**A new map** starts with ServerScriptService synced from its own folder in src, rather than from the whole of src.",
		],
		fixed: ["**Starts as** in New graph drew its script icons without their colours."],
		affects: ["editor", "docs"],
	},
	{
		version: "1.0.0-canary.13",
		date: "2026-11-19",
		headline: "The Project panel is headed by what you do with each part.",
		changed: [
			"**The Project panel** has five headings, each folding from its name: Graphs, Place, Node maps, Packages and Output. Graph Content and Compile Content are gone.",
			"**Graphs** start at the services. The folder graphs live in is a setting, not a row, and graphs and maps are listed without their extensions.",
			"**Place** lists the place file and models, with Open on a place. **Node maps** and **Packages** have headings of their own, with New map and Add on them.",
			"**Output** holds what Roswaal writes and code it did not write, and starts folded. **Node packs** moved to the foot, and open Node Design.",
			"**Folders named for a service or container** show its icon. A folder a node map syncs carries the map's mark in the corner, and an empty folder is faint and says so.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.0.0-canary.12",
		date: "2026-11-19",
		headline: "Rojo project files with comments, and .project.jsonc, are read.",
		fixed: [
			"**Rojo project files** with comments or trailing commas, which Rojo 7.6.1 and later accept, were read as not JSON. **.project.jsonc** files, which Rojo 7.7 added, were not found. Both are read now, by Import Rojo project, by requires that follow a folder's own project file, and by Wally's packages.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.0.0-canary.11",
		date: "2026-11-19",
		headline: "Every modal window shares one look.",
		changed: [
			"**Modal windows** share one shell: rounder corners, one shadow, and one backdrop with a light blur. They open with a short fade, and not at all when the system asks for less motion.",
			"**Every head** has a badge, the title and a line saying where or what, with × at the right. The pickers, Export, Selection preview and the pack and licence windows have it too.",
			"**A form's fields** are drawn as Settings rows: two or three choices side by side, more as a list, and switches for every checkbox, in Export and Selection preview included.",
			"**New graph** shows where it is and each script kind's icon. **Delete** names what goes in its title.",
			"**On a narrow screen**, a dialog rises from the bottom as a sheet.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.0.0-canary.10",
		date: "2026-11-19",
		headline: "The Place Viewer is the Place Editor; service pickers show their services.",
		changed: [
			"**The Place Viewer is now the Place Editor.** Its switch and settings carry over.",
			"**Service pickers** on Get Service and the Instance node group services by purpose with their icons, as Add Service does; game, script, workspace and shared come first. A class picker shows its classes' icons.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.0.0-canary.9",
		date: "2026-11-19",
		headline: "Nodes show the class they name.",
		added: [
			"**Class icons on nodes.** Get Service and Service Function show their service's icon in place of their glyph; New Instance and the Find Firsts show their class's after the tab, in the header's text colour. The docs' pictures show them too. Settings › Nodes turns them off.",
			"**Class icons in class pickers**, in Settings › Nodes, shows the class's icon in a node's class picker. It is off by default.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.0.0-canary.8",
		date: "2026-11-19",
		headline: "Folders a node map syncs can be dragged, and the map follows.",
		changed: [
			"**Dragging a folder a node map syncs**, such as M103's Tank, moves it, and the map follows: the entry's path changes, it moves under the service it went to, and Rojo's project file is written again. Where a folder around it already syncs it, its Folder entry goes; a folder that leaves such a place gets an entry of its own. Service folders stay where they are.",
		],
		fixed: [
			"**Moving or renaming a folder** through roswaal serve on Windows failed with EPERM when the folder held folders, as the daemon watches them. Its files now move one at a time.",
		],
		affects: ["editor"],
	},
	{
		version: "1.0.0-canary.7",
		date: "2026-11-19",
		headline: "Folders of graphs can be dragged.",
		fixed: [
			"**Dragging a folder** in Graph Content moves it, a script with children included; a click still opens and closes it. Folders a node map syncs, and the graphs' own folder, stay where they are.",
		],
		affects: ["editor"],
	},
	{
		version: "1.0.0-canary.6",
		date: "2026-11-19",
		headline:
			"Scripts with children move, rename and delete as one; a child's module offers its functions.",
		added: [
			"**Moving a script with children.** Drag it in the tree to move it with its children. Its init.nodescript does not move alone.",
			"**When the last child goes**, in Settings › Compiling, moves a script's graph back out of its folder once it has no children. It is off by default.",
			"**Requires from script.** A Require Module that starts at script, such as script.Child or script.Parent.Sibling, offers that module's Script Functions and types.",
		],
		changed: [
			"**Deleting a graph** deletes the Luau Roswaal wrote for it. Deleting a script with children names them first.",
			"**Moving or renaming graphs** in Dynamic mode compiles them where they are now, and removes the Luau they wrote before, on the website too. A Rojo meta file beside a graph's Luau moves with it.",
			"**A move that would put a graph beside a folder of its name** is refused, as creating and renaming already were.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.0.0-canary.5",
		date: "2026-11-18",
		headline: "Script icons say the script in their corner.",
		changed: [
			"**Script icons** in Graph Content, Compile Content and the tab row carry a badge in the corner: a server for a Script, a monitor for a LocalScript, a puzzle piece for a ModuleScript. The icon is drawn whole, the Luau logo included, and cut away behind the badge.",
		],
		affects: ["editor"],
	},
	{
		version: "1.0.0-canary.4",
		date: "2026-11-18",
		headline:
			"New graph asks where on a graph's menu; graphs are coloured by the script they become.",
		changed: [
			"**New graph** on a graph's menu, or a script with children's, asks where the new graph goes: inside it, as its child, which is the default, or beside it in its folder. It also asks what it starts as, a ModuleScript unless you choose otherwise. New child script is part of it now.",
			"**Graphs in Graph Content** are coloured by the script they compile to, as their Luau is: a Script white or slate, a LocalScript green, a ModuleScript blue.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.0.0-canary.3",
		date: "2026-11-18",
		headline: "Graphs can have child scripts, as Rojo's scripts do.",
		added: [
			"**New child script.** Right-click a graph to add a ModuleScript under it. The graph becomes its folder's init.nodescript and compiles to init.luau, init.server.luau or init.client.luau there; a Rojo meta file beside its Luau goes with it.",
			"**Scripts with children in the tree.** The folder shows as the script, with its name; double-click it to open its graph.",
		],
		changed: [
			"**Names Studio could not tell apart** are refused: a graph called init, and a graph and a folder of one name side by side.",
		],
		fixed: [
			"**Instance lint** knew a script with children as a Folder when a child's file was read before the script's own.",
			"**Importing an init file** opened a graph called init until it was opened again.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.0.0-canary.2",
		date: "2026-11-18",
		headline: "The Place Viewer is an extension, with its own page in Settings.",
		added: [
			"**Extensions in Settings.** The Place Viewer is listed under Extensions, with its version, its switch, what it adds and its release notes. Turned off, it keeps only that page, and its settings are kept for when it is back on.",
			"**Reset in Scene view.** A setting not at its default is marked, with a button that puts it back.",
		],
		changed: [
			"**Scene view and Roblox account** are under the Place Viewer in Settings. Sign in with Roblox and Downloaded assets are on Roblox account.",
			"**If local and while local** is on the Compiling page, as a switch, under Studio betas.",
			"**The Privacy Policy** names Settings › Roblox account as where a project's downloaded assets are cleared. Its Last Edited date is 18 November 2026.",
		],
		watch: [
			"**Extended Features is gone.** Its settings moved to the Place Viewer's page and to Compiling, and keep their values.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.0.0-canary.1",
		date: "2026-11-18",
		headline: "Canary builds are numbered as previews of the next release, starting with 1.0.0.",
		changed: [
			"**Version numbers.** A canary build is numbered after the release it leads to: 1.0.0-canary.1 is the first build towards 1.0.0. Stable releases keep plain numbers.",
			"**Release notes** fold a release's canary builds under it, and its lines carry the release they shipped in.",
		],
		affects: ["docs"],
	},
];
