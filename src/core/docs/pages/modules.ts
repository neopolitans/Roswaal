/**
 * The `modules` page of the documentation. `buildSite` places it.
 */

import { code } from "./blocks.js";
import type { DocPage } from "../site.js";
import { MODULES_PANEL } from "../toolbars.js";

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
		summary: "What a script requires, where you declare it, and what each runtime resolves.",
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
					["**Name**", "The local it binds to, and what the pill shows. Yours to choose — see below"],
					["**Module**", "What goes inside `require(...)`, verbatim"],
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
			{ t: "h", level: 2, text: "What goes in the box" },
			{
				t: "p",
				text:
					"A specifier must start with a prefix. That is not a house style: an unprefixed " +
					"path is **an error in Luau itself**, since the require rules were amended — " +
					"`require(\"Foo\")` used to resolve and now does not.",
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
			{ t: "h", level: 2, text: "Where the requires end up" },
			{
				t: "p",
				text:
					"At the top, below the `GetService` calls — where a hand-written Roblox file puts " +
					"them, and in the order you declared them.",
			},
			{
				t: "code",
				lang: "luau",
				text: code`
					local Players = game:GetService("Players")

					local Combat = require("@game/ReplicatedStorage/Combat")
					local config = require("./config")
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
