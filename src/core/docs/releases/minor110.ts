/**
 * Release notes for 0.110.0 to 0.119.x, newest first.
 *
 * One of the files `../releases.ts` puts together, a tenth of the minor
 * versions each, so the newest notes are not at the top of a very long file.
 */

import type { Release } from "../releases.js";

export const RELEASES_0_110: Release[] = [
	{
		version: "0.117.0",
		date: "2026-10-03",
		headline: "Autosave keeps every edit, and the compiler checks its own Luau.",
		affects: ["editor", "designer", "docs"],
		added: [
			"**Every compile reads its Luau back** with the parser. Output that does not parse is an error and is not written.",
			"**An open graph follows its file.** When the file changes on disk, from a branch switch, a pull or another editor, a graph with no unsaved edits takes the new version and one with edits asks which to keep. A graph whose file is deleted closes. This works in Manual mode too, and [Compiling and nodemaps for Roblox](building-and-rojo) says so.",
		],
		changed: [
			"**Leaving the page** while an edit is still waiting to be saved asks first, and a tab that is hidden writes what is waiting.",
		],
		fixed: [
			"**Switching or closing a tab** inside the autosave pause no longer loses the edit. Neither does leaving a node map for something else.",
			"**An edit made while a save was under way** is no longer marked as saved, and a save that finishes while another tab is in front no longer marks that tab saved.",
			"**Deleting from the project tree** closes the function tabs and graphs it took, and a waiting save no longer brings a deleted file back.",
			"**Negate** of a negative number, or of another Negate, no longer writes `--`, which Luau reads as a comment. A negative number raised to a power is bracketed: `(-2) ^ 2`.",
			"**Get Key, Set Key and Call Method** bracket what they index or call on: `(config or defaults).speed`, `(\"hello\"):upper()`.",
			"**A While loop whose condition is read elsewhere** works the condition out on every pass. It was worked out once above the loop, which then never ended.",
			"**Lune functions** compile with their optional arguments left empty: `task.wait()` no longer asks for a duration.",
			"**A constant variable** stays constant after the graph is reloaded.",
			"**Keyboard shortcuts** no longer fire from a dropdown or behind a dialog. Typing in an Inspector dropdown could add a comment or delete the node.",
			"**Moving a folder into itself** is refused. In the web app it damaged the project, and in a folder opened from disk it copied itself until the browser stopped.",
			"**A truncated or damaged place file** is reported as damaged rather than freezing the editor.",
			"**A package zip** can no longer write outside its own folder. Entries with `..` in their path are skipped, and a package's name, version and alias have to be plain names.",
			"**Graphs, node maps and roswaal.json** are written to a new file and renamed into place, so a crash part-way through a save leaves the old file whole.",
			"**The daemon** refuses to delete, move or rename the project folder itself.",
		],
	},
	{
		version: "0.116.2",
		date: "2026-09-30",
		headline: "Attributions name the libraries Roswaal is tested with.",
		affects: ["docs"],
		changed: [
			"[Attributions](attributions) lists the libraries these pages name and Roswaal was tested with: Sift, Signal, Promise and Roact. None is bundled. Wally and Moonwave join Rojo under what Roswaal is built on.",
		],
	},
	{
		version: "0.116.1",
		date: "2026-09-30",
		headline: "Places and Rojo projects, and Wally packages, are verified.",
		affects: ["docs"],
		verified: ["places-and-rojo", "wally-packages"],
	},
	{
		version: "0.116.0",
		date: "2026-09-30",
		headline: "Places and Wally pages draw the editor.",
		affects: ["docs"],
		added: [
			"[Places and Rojo projects](places-and-rojo) draws the node map an import makes, the DataModel browser, the Properties panel, each drop from Properties with the Luau it compiles to, and the Export panel.",
			"[Wally packages](wally-packages) draws the project tree with its packages, and walks through adding one and removing one.",
		],
	},
	{
		version: "0.115.1",
		date: "2026-09-30",
		headline: "The four new pages are reviewed.",
		affects: ["docs"],
		reviewed: ["project-panel", "places-and-rojo", "wally-packages", "reading-luau"],
	},
	{
		version: "0.115.0",
		date: "2026-09-30",
		headline: "Four new docs pages.",
		affects: ["docs"],
		added: [
			"[The Project panel](project-panel), under Getting started: its two lists, what each colour and icon means, its menus, and the switch to the DataModel.",
			"[Places and Rojo projects](places-and-rojo), [Wally packages](wally-packages) and [Reading your Luau](reading-luau), under For Roblox. Their sections were on Compiling and nodemaps for Roblox and Hand-written Luau, which now link to them.",
		],
		changed: [
			"[Controls](controls) lists opening an instance in Properties and dragging from it. [Toolbars](toolbars) draws the Project panel's heading.",
		],
	},
	{
		version: "0.114.0",
		date: "2026-09-30",
		headline: "Custom Code follows requires, and a property drops as Get Member.",
		affects: ["editor", "docs"],
		added: [
			"**Custom Code and Luau Expression** follow a require from where the graph compiles to: the module's members complete and hover with their docs, and an instance path the project does not have is underlined, script.Parent included.",
			"**Export** lists scripts still in the place whose files were removed or renamed.",
		],
		changed: [
			"**A property dragged from Properties** onto a graph gives Get Member, typed as the property is, in place of Get Property. Ctrl still gives Set Property.",
		],
	},
	{
		version: "0.113.0",
		date: "2026-09-30",
		headline: "Remove a package.",
		affects: ["editor", "docs"],
		added: [
			"**Remove package**, from a package's menu under wally.toml: it comes out of wally.toml and Packages, with any package only it needed. What still requires it is listed before you confirm, and code put in place of Wally's thunk is left alone.",
		],
	},
	{
		version: "0.112.2",
		date: "2026-09-30",
		headline: "A field that holds a module shows that module's description.",
		affects: ["editor"],
		fixed: [
			"**A field that holds a module**, Array = require(script.Array) in Sift, shows that module's description where its own @prop has none, in its own file and wherever it is required. An alias of one, Sift.List, shows the same.",
		],
	},
	{
		version: "0.112.1",
		date: "2026-09-30",
		headline: "A table's keys hover where they are written.",
		affects: ["editor"],
		fixed: [
			"**A key written in a table**, Array in local Sift = { Array = … }, hovers as Sift.Array does, with its @prop, where it showed nothing.",
		],
	},
	{
		version: "0.112.0",
		date: "2026-09-30",
		headline: "Add packages from the project tree.",
		affects: ["editor", "docs"],
		added: [
			"**Add from Wally**, from the menu on wally.toml: the line goes into wally.toml and the package installs with what it depends on, two requests to the registry a package at most. If a download fails, the line stays and the package shows as not installed.",
			"**Insert package zip**: a Wally package installs where wally install puts one; any other module is vendored into Packages. On a package not installed, Insert its zip fills it.",
			"**Insert GitHub repo** vendors a repository into Packages, in the installed editor.",
		],
	},
	{
		version: "0.111.0",
		date: "2026-09-30",
		headline: "Drag a property onto a graph.",
		affects: ["editor", "docs"],
		added: [
			"**Drag from Properties onto a graph**: a property gives an Instance node at the instance's path wired into Get Property, and an attribute into Get Attribute. Hold Ctrl as you drop for Set. Drag the instance's name for the Instance node alone.",
		],
	},
	{
		version: "0.110.0",
		date: "2026-09-30",
		headline: "Hover reads @class, @prop and @interface.",
		affects: ["editor", "docs"],
		added: [
			"**Moonwave's @class, @prop, @interface and @type** are read wherever they stand in a file: a module and its table show their @class, a field its @prop and type, and a function whose parameters or returns name an @interface lists its fields.",
			"**Doc tags in comments are coloured** in the Luau viewer and the code editor, as the tooltips set them apart.",
		],
		fixed: [
			"**Fields written in a table's constructor** hover in the file that writes them.",
		],
	},
];
