/**
 * Release notes for 0.90.0 to 0.99.x, newest first.
 *
 * One of the files `../releases.ts` puts together, a tenth of the minor
 * versions each, so the newest notes are not at the top of a very long file.
 */

import type { Release } from "../releases.js";

export const RELEASES_0_90: Release[] = [
	{
		version: "0.99.0",
		date: "2026-09-29",
		headline: "The web app opens a place.",
		affects: ["editor", "docs"],
		added: [
			"**Open place… in the web app.** Project → Open place… makes a project from a `.rbxl` or `.rbxlx`. It shows how many scripts Rojo can sync and how many only the place can hold, then asks what to call the project, which scripts to bring in, and whether to merge identical copies.",
			"**The place stays with the project** in the browser, across a reload, and Download includes it.",
			"**A zip holding a place file** opens with the place kept, where before it was listed as left out.",
		],
		changed: [
			"**Merged scripts that share a name** are named for where their copies live, as in Script (Street Light), rather than numbered.",
		],
	},
	{
		version: "0.98.1",
		date: "2026-09-29",
		headline: "An imported map is named after its project.",
		affects: ["editor", "docs"],
		changed: [
			"**An imported project's node map** is named after the project's folder, as Rojo names a project, rather than after the place file.",
			"**The document bar** labels a map Node Map.",
		],
	},
	{
		version: "0.98.0",
		date: "2026-09-29",
		headline: "A place file becomes a project.",
		affects: ["docs"],
		added: [
			"**Importing a place.** `roswaal import place.rbxl` makes a new project from a `.rbxl` or `.rbxlx`: scripts Rojo can sync under `src/`, a node map that leaves the rest of the place alone, and the place itself in the project root.",
			"**Scripts inside parts and models** come out with `--scripts all`, under `place/`. Identical copies become one file unless you pass `--no-merge`.",
			"**The project's place file** in `roswaal.json`, as `place`. Unset, a `.rbxl` or `.rbxlx` in the project root, `place.rbxl` first.",
		],
		fixed: [
			"**A flag with nothing after it** no longer takes the next word as its value: `roswaal compile --force Main.nodescript` compiles that graph.",
		],
	},
	{
		version: "0.97.4",
		date: "2026-09-29",
		headline: "The website moves to roswaal.app.",
		affects: ["editor", "designer", "docs"],
		changed: [
			"**The website is at roswaal.app**, and the canary at canary.roswaal.app.",
			"**The old address on github.io is a backup copy**, with a banner pointing to roswaal.app. Search engines are asked not to list it.",
		],
		watch: [
			"**A project kept in the browser does not move with the address.** Download it as a .zip at the old address, then open it at roswaal.app with Open .zip… in the projects panel.",
		],
	},
	{
		version: "0.97.3",
		date: "2026-09-23",
		headline: "A graph's selected tab is marked on the website.",
		affects: ["docs"],
		fixed: [
			"**The selected tab over a graph** is filled with the accent colour on the website, as it is in the docs window.",
		],
	},
	{
		version: "0.97.2",
		date: "2026-09-23",
		headline: "Custom Code opens from a documentation graph.",
		affects: ["docs"],
		changed: [
			"**Clicking a Custom Code node in a documentation graph opens its Luau**, read-only, in the code editor's frame, with its line numbers and colours.",
		],
		fixed: [
			"**A graph's tabs sit over the graph they switch**, with the Variables panel level with the graph beside it.",
			"**The Roblox demo is drawn as it is laid out in the editor.** Levelling the wires, as the docs do for their own scenes, pulled the Main script's Custom Code nodes onto its flow.",
		],
	},
	{
		version: "0.97.1",
		date: "2026-09-23",
		headline: "A graph in tabs keeps its Variables panel.",
		affects: ["docs"],
		fixed: [
			"**The Variables panel shows beside every tab** of a graph drawn in tabs, as it did beside the one graph. On the Roblox demo page, whose note now says each Function has a tab.",
		],
	},
	{
		version: "0.97.0",
		date: "2026-09-23",
		headline: "Documentation graphs are drawn as the editor draws them.",
		affects: ["docs"],
		changed: [
			"**A function in a documentation graph has a tab of its own**, as in the editor: the script's graph first, then one per function. On the pages for Function, Get Function, Return, Call Function and Module Exports, and in the Roblox demo.",
			"**Members and fields builds the values it reads**: each type example fills in a table, rather than calling a function the page never defines.",
		],
	},
	{
		version: "0.96.0",
		date: "2026-09-23",
		headline: "What can be nil says so.",
		affects: ["editor", "docs"],
		added: [
			"**A pin that can be nil says so**: Local Character is a `Model?`, Get Player From Character a `Player?`, and the Find First nodes `Instance?` or the class they name. The pin still wires and offers members as the class does.",
			"**Roblox properties that can be empty are typed so**: `Player.Character` is a `Model?`, and so are `Parent`, `PrimaryPart`, a weld's `Part0` and `Part1`, and the other references that are empty until something sets them. In Get Member, the code editor's completions and hover, and the node reference.",
		],
	},
	{
		version: "0.95.1",
		date: "2026-09-23",
		headline: "Functions on a table are known.",
		affects: ["editor"],
		fixed: [
			"**Functions put on a table** are offered, described on hover and shown with their parameters while a call is typed: `function Occupancy.value(…)` in the code, and a Declare Function wired onto a table variable. In the code editor and the read-only Luau viewer.",
		],
	},
	{
		version: "0.95.0",
		date: "2026-09-23",
		headline: "The whole engine, from its documentation, credited.",
		added: [
			"**The engine catalogue**: every class with its properties, methods, events and callbacks — types, parameters, security, thread safety, capabilities — every enum and its items, every datatype, and the globals and libraries, read from Roblox's Creator Documentation. `npm run build:engine` refreshes it; it replaces `build:statics`.",
			"**Events and enums in the code editor**: a dot after an instance offers its events with its properties, `Enum.` offers the enums and `Enum.Material.` their items, and hovering any of them describes it with a link to its page.",
		],
		fixed: [
			"**Documentation text Roswaal carries is credited**, and marked as under its own licence rather than 0BSD: summaries from Roblox's Creator Documentation (CC BY 4.0), and parameter descriptions from Lune's type definitions (MPL-2.0). On the Attributions page, in ATTRIBUTIONS.md, in the README and in the generated files.",
		],
	},
	{
		version: "0.94.0",
		date: "2026-09-23",
		headline: "A hover gives a name's type, and methods are known.",
		affects: ["editor"],
		added: [
			"**A hover gives the name and its type** — `INPUT2: string`, `event: (name: string) -> (RemoteEvent)` — with what kind of name it is under it, quieter: local, local function, parameter, method, property, class.",
			"**Methods are known for every class**: hovering `existing:IsA` gives `Object:IsA(className: string) → boolean` with a link to where Roblox documents it, a colon after a local offers its class's methods, inherited ones included, and a method's parameters show while its call is typed.",
			"A local's type comes from its value when none is written: a string, a number, a comparison, a function's signature, and `FindFirstChild` as an `Instance?`. A service reached by its name, `RunService:`, is known as that service.",
			"`npm run build:statics` also fetches each class's own methods.",
		],
	},
	{
		version: "0.93.0",
		date: "2026-09-23",
		headline: "A .luau file shows what its names are, and follows the cursor.",
		affects: ["editor"],
		added: [
			"**Hovering a name** in a `.luau` file — generated or hand-written — says what it is and links to its Roblox docs page, as the code editor does. A file that requires `@lune/` is read as Lune code.",
		],
		fixed: [
			"**The text cursor shows** in a `.luau` file, and the highlighted line follows it with the arrow keys, Page Up/Down and Home/End — not only where the file was clicked. The file stays read-only.",
		],
	},
	{
		version: "0.92.0",
		date: "2026-09-23",
		headline: "The call being typed shows its parameters.",
		affects: ["editor"],
		added: [
			"**Inside a call's brackets, its parameters show above the cursor**, with the one being typed picked out: `Instance.new(className: string, parent: Instance?)`, moving to `parent` after the comma. For a datatype's constructors and functions, and a service's methods on a local the code says holds that service.",
		],
		changed: [
			"**The hover's signature is highlighted** as Luau — the call, its parameter types and what it returns — and set a size larger than the sentence under it.",
		],
	},
	{
		version: "0.91.0",
		date: "2026-09-23",
		headline: "Keys complete in brackets as well as after a dot.",
		affects: ["editor"],
		added: [
			"**A key in brackets completes**: `tbl[\"A` offers the table's keys inside the string, and `tbl[` offers them quoted. Brackets reach every string key — `[\"two words\"]` included — where a dot offers only the ones that are names. A class's properties complete the same way.",
		],
	},
	{
		version: "0.90.1",
		date: "2026-09-23",
		headline: "The hover's signature reads as code.",
		affects: ["editor"],
		changed: [
			"**The hover's signature** is set in the code editor's own face, bold, on a band a shade darker than the text under it.",
			"Its link reads **Part - Roblox Creator Docs**.",
		],
	},
	{
		version: "0.90.0",
		date: "2026-09-23",
		headline: "The code editor says what a name is, and what a local holds.",
		affects: ["editor"],
		added: [
			"**Hovering a name in the code editor** says what it is: `Instance.new(\"Part\")` returns a Part, with a sentence on what a Part is and a link to its Roblox docs page. The same for a class written as a string or a type, a datatype and its constants, a local, and a property read off one.",
			"**A local's members are offered after a dot** when its declaration says what it holds: `local part: Part`, `= Instance.new(\"Part\")`, `= game:GetService(\"Players\")` and `:: Model` offer that class's properties, and a table written out offers its keys.",
			"`npm run build:statics` also fetches a one-line summary of every class and datatype for the hover.",
		],
		fixed: [
			"`local Temp : Part`, with a space before the colon, is read as a type position.",
			"Class names complete from all 625 classes, not the 54 common ones.",
		],
	},
];
