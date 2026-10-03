/**
 * Release notes for 0.100.0 to 0.109.x, newest first.
 *
 * One of the files `../releases.ts` puts together, a tenth of the minor
 * versions each, so the newest notes are not at the top of a very long file.
 */

import type { Release } from "../releases.js";

export const RELEASES_0_100: Release[] = [
	{
		version: "0.109.0",
		date: "2026-09-30",
		headline: "Code knows the place's instances.",
		affects: ["editor", "docs"],
		added: [
			"**Instance paths are checked** against the place and the project's files. The Luau viewer marks a name neither has, under ReplicatedStorage, ServerStorage, the Starter services and the like, and a WaitForChild waiting for one.",
			"**Hover an instance** in a path for its class and where it is.",
			"**The code editor offers what is there** after a dot in an instance path, or inside WaitForChild's string.",
		],
	},
	{
		version: "0.108.0",
		date: "2026-09-30",
		headline: "Hover follows require.",
		affects: ["editor", "docs"],
		added: [
			"**Hover follows require** in a Luau file opened from the project. A local holding a required module shows where the module is, and its functions and fields hover with their signatures and comments. The require is followed through the node map, Wally's Packages and each package's own project file, or a .luaurc alias.",
		],
		fixed: [
			"**wally.toml** is listed after the folders in Graph content, where it looked like it sat inside .luaurc.",
			"**A package vendored in place of Wally's thunk** opens its own code, where the tree followed the commented-out thunk.",
		],
	},
	{
		version: "0.107.0",
		date: "2026-09-30",
		headline: "Wally packages in the project tree.",
		affects: ["editor", "docs"],
		added: [
			"**wally.toml in Graph content**, with each package it lists and the version installed. Double-click one to open the module a require of it reaches; one not installed says so.",
			"**Packages in Compile content**: Wally's folders are shown, in purple and closed at first, where they were hidden. Compiling and export still leave them alone.",
		],
	},
	{
		version: "0.106.5",
		date: "2026-09-30",
		headline: "Plain comments show in hover.",
		affects: ["editor", "docs"],
		changed: [
			"**Hover shows plain comments** above a function, field or local: a --[[ ]] block or -- lines, as well as Moonwave's. A comment that is code switched off is left out.",
		],
		fixed: [
			"**A local declared first and defined later** by a function statement hovers with the comment above the function.",
			"**A local called from inside a callback** passed to a call hovers again, where it showed nothing.",
		],
	},
	{
		version: "0.106.4",
		date: "2026-09-30",
		headline: "Hover finds every documented function.",
		affects: ["editor"],
		fixed: [
			"**A local function's doc comment** shows where the function is declared, and on one whose parameters run onto the next lines, which showed nothing.",
			"**A global function** a file declares hovers with its signature and doc comment, where it is declared and where it is called.",
			"**A doc comment about a class or another function** is no longer shown on the declaration under it.",
			"**const function** reads as Luau, where it was marked as a mistake.",
		],
	},
	{
		version: "0.106.3",
		date: "2026-09-30",
		headline: "Several Rojo project files are picked from a list.",
		affects: ["editor"],
		changed: [
			"**Import Rojo project** offers a dropdown when there is more than one project file, with default.project.json first, where it had a button each.",
		],
	},
	{
		version: "0.106.2",
		date: "2026-09-30",
		headline: "Open folder offers to import a Rojo project too.",
		affects: ["editor", "docs"],
		changed: [
			"**Open folder** asks whether to import the folder's Rojo project file as a node map, as Open .zip does.",
			"**StarterPlayerScripts, StarterCharacterScripts and StarterGear** have a blue folder in DataModel, like the services they sit in.",
		],
	},
	{
		version: "0.106.1",
		date: "2026-09-30",
		headline: "Open .zip offers to import a Rojo project.",
		affects: ["editor", "docs"],
		changed: [
			"**Open .zip** asks whether to import the zip's Rojo project file as a node map, when it has one no map writes.",
		],
	},
	{
		version: "0.106.0",
		date: "2026-09-29",
		headline: "Import a Rojo project as a node map.",
		affects: ["editor", "docs"],
		added: [
			"**Import Rojo project**, in the Project menu or as roswaal import default.project.json, reads a Rojo project file into a node map. Every field is kept, including ones the map editor has no control for, and a class the file writes out is kept as written.",
		],
		changed: [
			"**A project file the map already matches is left alone** when you compile, however it is laid out, and the compile list says same. When the map changes, the file keeps its indentation and line endings.",
		],
		fixed: [
			"**A Lune node map stays a Lune map when saved.** Saving dropped what made it one, so it came back as a DataModel map.",
		],
	},
	{
		version: "0.105.0",
		date: "2026-09-29",
		headline: "Place instances open in a Properties panel.",
		affects: ["editor", "docs"],
		added: [
			"**The Properties panel.** Double-click or double-tap an instance in DataModel to open its properties on the right, in the right-hand drawer on a phone or tablet. While it is open it follows what you pick; Close puts it away.",
		],
		changed: [
			"**DataModel** keeps the whole height of the Project panel, where the properties took the bottom half.",
		],
	},
	{
		version: "0.104.1",
		date: "2026-09-29",
		headline: "The DataModel switch shares the project's row.",
		affects: ["editor"],
		changed: [
			"**Files and DataModel** sit on the project name's row, right-aligned, so the tree keeps its height on a phone or tablet.",
		],
	},
	{
		version: "0.104.0",
		date: "2026-09-29",
		headline: "Hover reads doc comments.",
		affects: ["editor", "docs"],
		added: [
			"**Doc comments in hover.** A --[=[ ]=] block or --- lines directly above a function show with it: text, highlighted examples, notes, parameters and returns. Types from @param and @return fill a signature the code leaves untyped.",
			"**Hover on methods a file declares**, including on a table inside a table, and on a field set to another function of the same table.",
		],
		fixed: [
			"**Hover on a table's functions** works in a file that also has anonymous functions, where it showed nothing.",
		],
	},
	{
		version: "0.103.0",
		date: "2026-09-29",
		headline: "The DataModel browser.",
		affects: ["editor", "docs"],
		added: [
			"**The DataModel browser.** A project with a place has Files and DataModel in the Project panel. DataModel lists the place's instances as Studio's Explorer does, with a filter, and shows the picked instance's properties, tags and attributes. A script a project file writes opens that file.",
		],
	},
	{
		version: "0.102.4",
		date: "2026-09-29",
		headline: "The Export menu is a panel.",
		affects: ["editor"],
		changed: [
			"**Export Project** is laid out as a panel: Format as a dropdown, the Name with the file's extension straight after it, and Modify RBXL or Don't Modify RBXL side by side, with what goes out summed up at the foot.",
		],
		fixed: [
			"**An export from the installed editor on Windows** is named after the project's folder, where it took the folder's whole path.",
		],
	},
	{
		version: "0.102.3",
		date: "2026-09-29",
		headline: "Members and fields is reviewed.",
		affects: ["docs"],
		changed: ["**Members and fields** has a plainer summary."],
		reviewed: ["members-and-fields"],
	},
	{
		version: "0.102.2",
		date: "2026-09-29",
		headline: "A graph's tabs keep the page in view.",
		affects: ["docs"],
		fixed: [
			"**Clicking a graph's tab** on the website, such as Remotes on Members and fields, no longer turns the page blank.",
		],
	},
	{
		version: "0.102.1",
		date: "2026-09-29",
		headline: "Members and fields reads more plainly.",
		affects: ["docs"],
		changed: [
			"**Members and fields** is reworded in five places after a proofread: the opening, the Table of fields tab, the No fixed fields tab, and the module example's opening line.",
		],
	},
	{
		version: "0.102.0",
		date: "2026-09-29",
		headline: "Export Project.",
		affects: ["editor", "docs"],
		added: [
			"**Export Project**, from Project → Export…, takes the project out as a zip or its place file alone. For a project with a place it says what Modify RBXL would write and add, and what it cannot place, before you choose.",
		],
		changed: ["**Download is now Export…** in the Project menu."],
	},
	{
		version: "0.101.2",
		date: "2026-09-29",
		headline: "Each kind of script has its own colour.",
		affects: ["editor", "docs"],
		changed: [
			"**A Script's icon is slate on a light theme**, where black was too heavy; it stays white on a dark one.",
			"**A LocalScript's icon is green**, so it is told apart from a ModuleScript, which stays blue.",
		],
	},
	{
		version: "0.101.1",
		date: "2026-09-29",
		headline: "A Luau file's icon says which script it is.",
		affects: ["editor", "docs"],
		changed: [
			"**Luau files in the project tree** have a filled page with a code mark: white on a dark theme and black on a light one for a Script, blue for a ModuleScript or LocalScript.",
			"**Folder colours in Compile content** have a shade for light themes, so they read as well as on dark ones.",
		],
	},
	{
		version: "0.101.0",
		date: "2026-09-29",
		headline: "New scripts go into the place too.",
		affects: ["editor", "docs"],
		added: [
			"**A script not in the place yet** is added by Modify RBXL and `roswaal export`, with a Folder for each part of its path the place does not have. A new script can hold others.",
			"**New instances get their own values**: a fresh UniqueId, no tags, attributes or capabilities. What was in the place is unchanged.",
		],
		watch: [
			"**A script is not added** under a service the place does not have, or beside an instance with its name; the export lists it instead. A place whose scripts carry a property Roswaal cannot extend gets its source changes and none of the additions, and says why.",
		],
	},
	{
		version: "0.100.1",
		date: "2026-09-29",
		headline: "Compile content's folders are coloured.",
		affects: ["editor", "docs"],
		changed: [
			"**Folders under Compile content** are coloured by what they are: cream for a plain folder, blue for a service, container or script in Studio, red for place/. Hovering one says which.",
		],
	},
	{
		version: "0.100.0",
		date: "2026-09-29",
		headline: "Scripts go back into the place.",
		affects: ["editor", "docs"],
		added: [
			"**Modify RBXL**, when downloading a project with a place, writes the project's scripts into the copy in the zip; Don't Modify RBXL leaves it as it was. The project's own place is not changed either way.",
			"**Exporting from the CLI.** `roswaal export out.rbxl` writes the modified place to a file.",
			"**What was written** is said after each export, with any file whose script is not in the place yet.",
		],
		watch: ["**Only scripts already in the place are written.** A new one is listed, not added."],
	},
];
