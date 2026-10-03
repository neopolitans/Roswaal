/**
 * The `members-and-fields` page of the documentation. `buildSite` places it.
 */

import { GUIDE_SCENES } from "../examples.js";
import { code, previews } from "./blocks.js";
import type { DocPage, PageContext } from "../site.js";
import { TYPE_FIELDS_INSPECTOR, TYPE_OPEN_INSPECTOR, TYPE_WRITTEN_INSPECTOR } from "../toolbars.js";

/**
 * Reading what a value holds.
 *
 * Its own page rather than a section of the types one, because the question
 * arrives from the other direction: the types page is about *declaring* what a
 * value is, and this is about a graph in front of you that has one and wants a
 * field off it. It sits after Variables and locals for the same reason — the
 * things it reads members off are what that page is about.
 */
export function membersAndFieldsPage({ registry }: PageContext): DocPage {
	return {
		slug: "members-and-fields",
		narrow: true,
		title: "Members and fields",
		summary: "Reading a field from a value whose type says what it holds, and what to use when it doesn't.",
		blocks: [
			{
				t: "p",
				text:
					"A value often holds other values, such as a table with string keys or an instance " +
					"with properties. Two nodes read one out, and which you want depends on one " +
					"question - **Does anything know what is there?**",
			},
			{
				t: "table",
				head: ["Node", "Reads", "When"],
				rows: [
					[
						"**Get Member**",
						"A field the type declares",
						"The type says what it holds: a Declare Type's fields, a Roblox class's properties. The list is offered, and for a type this file declares, a name not on it is refused before the file is written.",
					],
					[
						"**Get Field**",
						"Any key you name",
						"Nothing can promise what is in there: a dictionary filled and emptied as the program runs, or whatever `require` returns, which arrives untyped.",
					],
				],
			},
			...previews(
				registry,
				["value.member", "value.field"],
				"Get Member is one line: the access it writes, one input, one output. Get Field " +
				"takes the key as a pin, because the key is yours to name.",
			),

			{ t: "h", level: 2, text: "A type you declared" },
			{
				t: "p",
				text:
					"A type is declared by a [Declare Type](casting) node — at the top " +
					"of the file or where it sits — and what it is *written as* decides whether it has " +
					"members to offer. A table of fixed fields does; everything else is a type Luau " +
					"understands and this cannot enumerate.",
			},
			{
				t: "table",
				head: ["Written as", "Example", "Members"],
				rows: [
					[
						"**Table of Fields**",
						"Rows in the Inspector: `throttle`, `number`",
						"Each row, with its type. The ordinary case, and the one the editor checks as you type it.",
					],
					[
						"**Custom Luau**, a table",
						"`{ throttle: number, aim: Vector3 }`",
						"The same fields, read out of the text — so a type typed out by hand behaves as the rows do.",
					],
					[
						"**Custom Luau**, anything else",
						"`\"idle\" | \"driving\"`, `(number) -> string`",
						"None. There is no fixed field list to offer, and a Get Member on one is refused.",
					],
					[
						"**A dictionary type**",
						"`{ [string]: number }`",
						"None: the keys are the program's business. That is Get Field's case.",
					],
					[
						"**Type of a Value**",
						"`typeof(Tuning)`",
						"None here. Luau resolves it; Roswaal does not follow it, so its members are Get Field's.",
					],
				],
			},
			{
				t: "p",
				text:
					"**The type's name is what travels.** A Declare Local, a function's parameter, a " +
					"variable or a [Cast](casting) set to `Input` gives a pin typed `Input`, and every " +
					"pin typed `Input` offers the same fields — the declaration is read wherever it " +
					"sits in the file, including from inside a function.",
			},
			{
				t: "tabs",
				label: "How the type is written",
				tabs: [
					{
						id: "type-rows",
						title: "Table of fields",
						blocks: [
							{
								t: "p",
								text:
									"The ordinary case: `Input` is a custom type that holds fields for `throttle`, " +
									"`steer` and `aim`, each entered as a row in the declaration. The local variable " +
									"is marked as the type, with the pill reading `aim` and passing on the resulting " +
									"Vector3.",
							},
							{ t: "toolbar", bar: TYPE_FIELDS_INSPECTOR },
							{
								t: "graph",
								script: GUIDE_SCENES.typeFieldsRows(),
								caption: "Three fields declared, and one of them read off a local of that type.",
							},
							{
								t: "code",
								lang: "luau",
								text: code`
									export type Input = {
										throttle: number,
										steer: number,
										aim: Vector3,
									}

									local input: Input = {
										throttle = 1,
										steer = 0,
										aim = Vector3.zAxis,
									}
									print(input.aim)
									`,
							},
							{
								t: "p",
								text:
									"**The result is typed as the field is.** `aim` gives a Vector3 pin and " +
									"`throttle` a number pin, so what comes out wires into a Vector3 node without " +
									"a [Cast](casting).",
							},
						],
					},
					{
						id: "type-written",
						title: "Written as Luau",
						blocks: [
							{
								t: "p",
								text:
									"A type written as **Custom Luau** — click its Definition to open the code editor — behaves as the rows do, as long " +
									"as what you wrote is a table of named fields. This is the shape to reach for " +
									"when a field's own type is more than a name — `{ Player }`, `Model?`.",
							},
							{ t: "toolbar", bar: TYPE_WRITTEN_INSPECTOR },
							{
								t: "graph",
								script: GUIDE_SCENES.typeFieldsWritten(),
								caption: "The same thing, written as Luau instead of entered as rows.",
							},
							{
								t: "code",
								lang: "luau",
								text: code`
									export type Shot = { damage: number, from: Vector3 }

									local shot: Shot = { damage = 25, from = Vector3.zero }
									print(shot.damage)
									`,
							},
						],
					},
					{
						id: "type-open",
						title: "No fixed fields",
						blocks: [
							{
								t: "p",
								text:
									"A dictionary type, a union, a function type: Luau understands each of them, " +
									"and none have a field list that anybody can write down. Get Member offers nothing " +
									"and refuses a member on one — **Get Field** is the node, and the key is a pin " +
									"you fill in or wire.",
							},
							{ t: "toolbar", bar: TYPE_OPEN_INSPECTOR },
							{
								t: "graph",
								script: GUIDE_SCENES.typeFieldsOpen(),
								caption: "A table keyed by name: the keys are the program's business, so the key is a pin.",
							},
							{
								t: "code",
								lang: "luau",
								text: code`
									export type Scores = { [string]: number }

									local scores: Scores = { alice = 12, bob = 9 }
									print(scores.alice)
									`,
							},
						],
					},
				],
			},

			{ t: "h", level: 2, text: "A type a module exports" },
			{
				t: "p",
				text:
					"A module's exported types are offered here too, under the name this graph writes " +
					"them as: require `Tank.Config` as `Config`, and a value annotated `Config.Tuning` " +
					"offers that type's fields. The fields are read from the graph that declares them, " +
					"so renaming one there changes what is offered here.",
			},
			{
				t: "graphs",
				label: "Two files, one idea",
				graphs: [
					{
						id: "module-config",
						title: "Tank.Config",
						script: GUIDE_SCENES.tankConfigModule(),
						caption: "The module: it declares the type, and returns a table with that value on it.",
					},
					{
						id: "module-user",
						title: "Remotes",
						script: GUIDE_SCENES.memberOfModule(),
						caption: "The graph that requires it: Get Field takes the key, Get Member reads the type's field.",
					},
				],
			},
			{
				t: "code",
				lang: "luau",
				text: code`
					local ReplicatedStorage = game:GetService("ReplicatedStorage")
					local Config = require(ReplicatedStorage.Tank.Config)
					local tuning: Config.Tuning = Config.tuning
					print(tuning.turnRate)
					`,
			},
			{
				t: "p",
				text:
					"**This graph uses both nodes, for different reasons.** The module's own table is " +
					"a value nothing here can describe — Roswaal does not read the other file's " +
					"returns — so `Config.tuning` is a **Get Field**. What comes out is annotated as a " +
					"type that *is* described, so `turnRate` off it is a **Get Member**.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"This list comes from the daemon reading the other graph. With no project open behind " +
					"the browser it is empty; the name still compiles, and the compiler does not check " +
					"it.",
			},

			{ t: "h", level: 2, text: "A Roblox instance" },
			{
				t: "p",
				text:
					"An instance's properties come from the engine, so they need no declaring. A node " +
					"that names a class hands back that class — **New Instance** set to `Part` gives a " +
					"Part — and a Part's properties are then what Get Member offers.",
			},
			{
				t: "graph",
				script: GUIDE_SCENES.memberOfInstance(),
				caption: "New Instance gives a Part; the pill reads its Anchored, which is a boolean.",
			},
			{ t: "code", lang: "luau", text: code`
				local part: Part = Instance.new("Part")
				if part.Anchored then
				end
				` },
			{
				t: "p",
				text:
					"Inherited properties are there too: `Name` and `Parent` come from `Instance`, and " +
					"a `Part` offers them alongside its own. **Get Service** gives the service's own " +
					"class, and the Find First Child and Ancestor nodes follow their Class Name, so " +
					"each of those leads straight into a member without a cast first.",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"The property list is offered in Roblox graphs only, and is as of this release. A " +
					"newer property can be typed in and compiles the same.",
			},

			{ t: "h", level: 2, text: "Finding one" },
			{
				t: "table",
				head: ["Gesture", "What you get"],
				rows: [
					["Drag a wire out of a typed pin", "That type's members in the node menu, under their own heading. Picking one places a Get Member already wired"],
					["Type `input.` in either node search", "Every member of everything this graph names — a variable, a local, a parameter. Picking one places the getter and the Get Member on it, wired"],
					["Select a Get Member", "Its **Member** in the Inspector, as a list of what the wired type declares"],
				],
			},

			{ t: "h", level: 2, text: "When there is no list" },
			{
				t: "p",
				text:
					"A table whose keys come and go while the program runs has no fixed members, and " +
					"nothing offers any: that is **Get Field**, which takes the key as a pin and reads " +
					"whatever is there. A key that is not a Luau name — a number, or a string with a " +
					"space in it — is Get Field's as well, since `t.my key` is not something Luau can " +
					"write.",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"**A member the type does not have is refused**, for a type this file declares. " +
					"Roblox properties and other modules' types are not checked.",
			},
		],
	};
}
