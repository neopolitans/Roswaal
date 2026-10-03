/**
 * The `reading-luau` page of the documentation. `buildSite` places it.
 */

import type { DocPage } from "../site.js";

/**
 * What hover, completion and warnings know about Luau: doc comments, required
 * modules and the place's instances. Gathered from `ESCAPE_HATCHES` at 0.115.0,
 * where it had grown past the two code nodes that page is about.
 */
export function readingLuauPage(): DocPage {
	return {
		slug: "reading-luau",
		narrow: true,
		title: "Reading your Luau",
		summary: "What hover, completion and warnings know about Luau: doc comments, required modules and the place's instances.",
		blocks: [
			{
				t: "p",
				text:
					"Roswaal reads your Luau as well as writing it. In a Luau file opened from the " +
					"project tree, and in **Custom Code** and **Luau Expression**, hover, completion and " +
					"warnings use what it finds.",
			},

			{ t: "h", level: 2, text: "Doc comments" },
			{
				t: "p",
				text:
					"Hover a name to see what it is. A comment directly above a function, field or local " +
					"shows with it, written as Moonwave's `--[=[ … ]=]` or `---`, or as a plain " +
					"`--[[ … ]]` or `--` lines. A comment that is code switched off is left out.",
			},
			{
				t: "table",
				head: ["Moonwave tag", "What hover shows"],
				rows: [
					["`@param`, `@return`", "Their types and descriptions, with the signature"],
					["`@class`", "The description of the table it names"],
					["`@prop`", "A field's type and description"],
					["`@interface`", "A table type's fields, listed with a function that returns it"],
					["`@type`", "A type's description"],
				],
			},
			{
				t: "p",
				text:
					"`@class`, `@prop`, `@interface` and `@type` count wherever they stand in the file, " +
					"as Moonwave reads them.",
			},

			{ t: "h", level: 2, text: "Required modules" },
			{
				t: "p",
				text:
					"A local that holds a required module knows what the module gives back: hover " +
					"`Flux.state` for its signature and comment, or `Flux` for where the module is. In " +
					"the code editor, a dot after it offers the module's members.",
			},
			{
				t: "table",
				head: ["Written", "Followed through"],
				rows: [
					["`require(ReplicatedStorage.Shared.Util)`", "The node map, to the file that becomes that instance"],
					["`require(script.Parent.Util)`", "Where this file ends up in the DataModel"],
					["`require(\"./Util\")`, `require(\"@shared/Util\")`", "The file's own folder, or a `.luaurc` alias"],
					["`require(ReplicatedStorage.Packages.Flux)`", "Wally's `Packages/`; see [Wally packages](wally-packages)"],
				],
			},
			{
				t: "p",
				text:
					"In Custom Code, `script` is the file the graph compiles to, so `script.Parent` means " +
					"what it will in Studio.",
			},

			{ t: "h", level: 2, text: "The place's instances" },
			{
				t: "p",
				text:
					"Paths like `ReplicatedStorage.Shared.Util` are checked against the place and the " +
					"files a node map places. Hover a name for its class and where it is. In the code " +
					"editor, a dot or `:WaitForChild(\"` offers what is there.",
			},
			{
				t: "p",
				text:
					"A name neither has is underlined, but only under what is settled before the game " +
					"runs: ReplicatedStorage, ReplicatedFirst, ServerScriptService, ServerStorage, " +
					"Lighting, SoundService, Teams and the Starter services. Workspace and Players fill " +
					"while the game runs, so they are left alone.",
			},
			{
				t: "note",
				kind: "info",
				text: "Instance checks are for Roblox. A Lune script has no DataModel to check against.",
			},
		],
	};
}
