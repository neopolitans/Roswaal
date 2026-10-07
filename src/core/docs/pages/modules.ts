/**
 * The `modules` page of the documentation. `buildSite` places it.
 */

import type { DocPage } from "../site.js";
import { MODULES_PANEL } from "../toolbars.js";
import { code } from "./blocks.js";

/**
 * Requiring, in both runtimes.
 *
 * The one subject where Roblox and Lune genuinely differ, and where a reader
 * hitting that difference previously had nowhere to look. It is also where the
 * rule the whole Lune sequence is built on has to be stated: a generated file
 * does not grow imports nobody chose.
 */
export function modulesPage(): DocPage {
	return {
		slug: "modules",
		title: "Modules",
		summary:
			"What a script requires and the services it fetches, where you declare them, and what each runtime resolves.",
		blocks: [
			{
				t: "p",
				text:
					"A module is code in another file that this one uses. Roswaal writes the `require` " +
					"for you — but only ever for a module you have **declared**, and each declaration " +
					"writes exactly one, at the top of the generated file.",
			},
			{
				t: "note",
				kind: "good",
				text:
					"**Nothing is required that the graph does not say.** Every import in the generated " +
					"file is one the panel or the canvas shows.",
			},
			{ t: "h", level: 2, text: "Declaring one" },
			{
				t: "p",
				text:
					"Modules live in the **Variables panel**, under their own heading. It is the same " +
					"question the variables answer — what does this script have to hand — and a " +
					"dependency belongs somewhere you can see it rather than somewhere you go looking.",
			},
			{ t: "toolbar", bar: MODULES_PANEL, hint: true },
			{
				t: "table",
				head: ["Field", "What it is"],
				rows: [
					[
						"**Name**",
						"The local it binds to, and what the pill shows. Yours to choose — see below",
					],
					[
						"**Module**",
						"What goes inside `require(...)`: a string, or on Roblox where the ModuleScript sits",
					],
					["**Members**", "Names pulled off it into locals of their own, comma separated"],
				],
			},
			{
				t: "p",
				text:
					"Drag a module onto the canvas for a **Get Module** pill — one output, no header, " +
					"exactly as a variable gives you a Get. Four of them still write one `require`, " +
					"because the declaration is on the script rather than on any of the pills.",
			},
			{
				t: "p",
				text:
					"**Require at Top** declares one on the canvas instead, for when you would rather " +
					"see it there. It takes the same specifier and hands back the same module.",
			},
			{
				t: "p",
				text:
					"Or drag a ModuleScript from the **DataModel** browser onto the Modules heading: it " +
					"is declared under its own name, by where it sits.",
			},
			{ t: "h", level: 2, text: "What goes in the box" },
			{
				t: "p",
				text:
					"A string must start with a prefix. That is not a house style: an unprefixed " +
					"path is **an error in Luau itself**, since the require rules were amended — " +
					'`require("Foo")` used to resolve and now does not. On Roblox you can name where ' +
					"the module sits instead, with no quotes: see below.",
			},
			{
				t: "table",
				head: ["Form", "Roblox", "Lune", "What it reaches"],
				rows: [
					["`./name`", "Yes", "Yes", "A sibling of this file"],
					["`../name`", "Yes", "Yes", "Up one, then down"],
					["`@self/name`", "Yes", "—", "A child of this script"],
					["`@game/Service/name`", "Yes", "—", "Down from the DataModel root"],
					["`@lune/fs`", "—", "Yes", "Lune's standard library"],
					["`@alias/name`", "Not yet", "Yes", "An [alias](aliases) from a `.luaurc`"],
					["`ReplicatedStorage.Shared.Greeter`", "Yes", "—", "The ModuleScript at that place"],
					["`script.Parent.Util`", "Yes", "—", "Up from this script, then down"],
				],
			},
			{
				t: "note",
				kind: "warn",
				text:
					"Specifiers are checked against the graph's runtime: `@lune/fs` in a Roblox graph is " +
					"an error. A `.luaurc` alias is a **warning** in Roblox, which does not resolve them " +
					"yet — see [Aliases and .luaurc](aliases).",
			},
			{ t: "h", level: 2, text: "By where it sits" },
			{
				t: "p",
				text:
					"Most Roblox code requires a module by the instance, not by a string, and the Modules " +
					"list takes that too. Start from a service, `script` or `workspace`, and write the " +
					"path the way you would in Luau:",
			},
			{
				t: "table",
				head: ["Written", "Required as"],
				rows: [
					["`ReplicatedStorage.Shared.Greeter`", "`require(ReplicatedStorage.Shared.Greeter)`"],
					["`game.ReplicatedStorage.Shared.Greeter`", "The same"],
					['`game:GetService("ReplicatedStorage").Shared.Greeter`', "The same"],
					['`ReplicatedStorage:WaitForChild("Shared").Greeter`', "As written"],
					['`workspace["Main Menu"].Util`', "As written"],
				],
			},
			{
				t: "p",
				text:
					"The service is fetched once, at the top, and the require reads it — the same local " +
					"a Get Service for it reads. With no name given, the module is named after the " +
					"ModuleScript.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"A path is names after dots, names in brackets and `:WaitForChild(...)`. Anything " +
					"else — another call, an operator — is an error rather than written, because a " +
					"field in a panel is not somewhere code should be able to hide.",
			},
			{ t: "h", level: 2, text: "Naming it yourself" },
			{
				t: "p",
				text:
					"The name is a choice, not a derivation. Two modules can genuinely want to be " +
					"called `util` — `./combat/util` and `./inventory/util` — and only you can say " +
					"which becomes `combatUtil`.",
			},
			{
				t: "p",
				text:
					"So a name you type is used **exactly**. It is never quietly turned into `util2`: " +
					"two declarations wanting one name is an error naming both, because a file can bind " +
					"it once and the fix is a rename that is yours to pick.",
			},
			{ t: "h", level: 2, text: "Members, and the Roblox datatypes in Lune" },
			{
				t: "p",
				text:
					"**Members** bind names from inside the module to locals of their own. It is Lune's " +
					"own idiom, and it is what makes the Roblox datatypes work there.",
			},
			{
				t: "code",
				lang: "luau",
				text: code`
					local roblox = require("@lune/roblox")
					local Vector3 = roblox.Vector3
					local CFrame = roblox.CFrame
					`,
			},
			{
				t: "p",
				text:
					"With `Vector3` bound, `Vector3.new(1, 2, 3)` means what it means in Roblox — so a " +
					"graph moved between runtimes needs the declaration, not different nodes. " +
					"Shadowing a name Luau provides is allowed here because it is the point; Roswaal " +
					"warns, so that naming a module `table` is a decision rather than an accident.",
			},
			{ t: "h", level: 2, text: "Declaring services" },
			{
				t: "p",
				text:
					"A Roblox graph's Variables panel has a **Services** heading above Modules. A service " +
					"declared there is fetched at the very top of the file, in the order you list them, " +
					"whether or not a node asks for it — so Custom Code can read `Players` by name, and " +
					"the top of the file reads the way you would write it.",
			},
			{
				t: "p",
				text:
					"**Add** takes a service by name, or drag one from the **DataModel** browser onto the " +
					"heading. Drag a declared service onto the canvas for a **Get Service**, which reads " +
					"the same local. A Get Service for a service you have not declared still works, and " +
					"fetches it after the declared ones.",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"**A service nothing uses is a warning.** Declare what the script reads, so the top of " +
					"the file is a true list of what it depends on. On Lune, which has no services, a " +
					"declared one is an error.",
			},
			{ t: "h", level: 2, text: "Where the requires end up" },
			{
				t: "p",
				text:
					"At the top, below the `GetService` calls — where a hand-written Roblox file puts " +
					"them, and in the order you declared them. Declared services come first, then any a " +
					"node asked for.",
			},
			{
				t: "code",
				lang: "luau",
				text: code`
					local Players = game:GetService("Players")
					local ReplicatedStorage = game:GetService("ReplicatedStorage")

					local Greeter = require(ReplicatedStorage.Shared.Greeter)
					local Combat = require("@game/ReplicatedStorage/Combat")
					`,
			},
			{
				t: "note",
				kind: "info",
				text:
					"Deleting a module leaves the pills that read it in place, reporting an error — as " +
					"deleting a variable does.",
			},
		],
	};
}
