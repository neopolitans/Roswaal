/**
 * The `creating-custom-nodes` page of the documentation. `buildSite` places it.
 */

import type { DocPage } from "../site.js";
import { code } from "./blocks.js";

/**
 * Making a node of your own, by whichever of the three routes suits you.
 *
 * The routes are the thing this page exists for. They were documented in three
 * places that did not know about each other — a paragraph in the README, an
 * example pack written by `roswaal init`, and the library's own source — so
 * which of them applied to you was the hard part, and it was nobody's job to
 * say. The switch at the top is that answer, made explicit.
 */
export function creatingCustomNodesPage(): DocPage {
	return {
		slug: "creating-custom-nodes",
		title: "Creating custom nodes",
		summary:
			"Node Design, pack files and TypeScript: the ways to define a node of your own, and what they share.",
		narrow: true,
		blocks: [
			{
				t: "p",
				text:
					"A node is **data**: an id, some pins, and a template saying what it compiles to. " +
					"Nodes of your own live in *packs* under `.roswaal/nodes`, which the daemon loads " +
					"when it opens the project — so a pack is committed with the repository and " +
					"everybody working in it has the same palette.",
			},
			{
				t: "note",
				kind: "good",
				text:
					"**A pack is never executed.** Luau packs are parsed and allow only literal values, " +
					"so loading someone's pack cannot run their code.",
			},
			{
				t: "tabs",
				label: "Definition support",
				tabs: [
					{
						id: "visual",
						title: "Node Design - Visual",
						blocks: [
							{
								t: "p",
								text:
									"**Build the node by handling it.** Open **Node Design** from the editor's top " +
									"row — the palette icon, second from the right, drawn on [Toolbars](toolbars) — or " +
									"`/designer` on the daemon. It opens on the packs: the project's first, then the " +
									"built-in library, one card per category, to look at.",
							},
							{
								t: "ul",
								items: [
									"**Search** finds packs and the nodes in them; press `/` to start. The filters card picks this project's packs, the built-in ones, or what runs on Roblox or Lune.",
									"**Click a pack** to list its nodes beside the packs. **Double-click** it, or press **Open pack**, to open it.",
									"**New pack** makes an empty one. **Import…** copies a pack from another Roswaal project.",
									"On a pack's card: **New node**. In its **⋯** menu: **Duplicate**, **Copy to another project**, **Copy JSON**, **Show in file manager** and **Delete**, which says which graphs use the pack's nodes first.",
									"A Luau pack opens read-only. **Save as JSON pack** makes an editable copy.",
									"A card says what its nodes run on, and marks it when the project compiles for something else.",
								],
							},
							{ t: "h", level: 3, text: "Building a node" },
							{
								t: "ul",
								items: [
									"**New node** starts with an empty header and one execution pin each side.",
									"**Drag a type** from the palette at the bottom right onto the node: the left half adds an input, the right half an output. **Execution** adds that side's execution pin.",
									"**Click a pin**, or its label, for its name, type, default and tooltip. Its name is what the logic reads: a pin named Force is `$in.force`.",
									"**Type the title** on the header. **Details** holds the id, category, what it runs on, and the summary its documentation reads.",
									"**Pure is decided by the pins**: no execution pins makes a value, an execution input makes a step. A pure node with no inputs and one output can be drawn as a **pill**.",
									"**Save** (`Ctrl` + `S`) is off while anything is in the problems list, so a node that saves is a node the project loads.",
								],
							},
							{ t: "h", level: 3, text: "Logic built from nodes" },
							{
								t: "p",
								text:
									"**Nodes**, on the logic's **Luau | Nodes** switch, builds the logic on a canvas " +
									"that fills the window, between **Node Inputs** — the node's inputs — and **Node " +
									"Outputs** — its outputs. Right-click for nodes. It compiles to Luau as you build it, " +
									"which **Preview** shows, and that Luau is what the node is saved as.",
							},
							{
								t: "ul",
								items: [
									"**It can use** the built-in nodes, the rest of its pack, and the nodes of the packs listed under **Requires**.",
									"**It cannot use** what belongs to a whole script: Script Start, functions, Return, script variables, Module Exports and Declare Type at Top.",
									"**An input read twice** is read once into a local, so a wired call does not run twice.",
									"**What it uses narrows where it runs.** A node built from Get Service runs on Roblox only, whatever it declares.",
								],
							},
							{
								t: "note",
								kind: "good",
								text:
									"**The pack stays data.** Logic compiles on save and the loader only reads Luau. A " +
									"node built from another pack's nodes carries their Luau, so that pack is needed only " +
									"to edit it.",
							},
						],
					},
					{
						id: "luau-logic",
						title: "Node Design - Luau",
						blocks: [
							{
								t: "p",
								text:
									"**Write the logic as a template**, with **Luau** on the logic's switch. The node's " +
									"pins decide what kind of template it is, and every placeholder is filled in where " +
									"the node is placed. Each example below is the template, then the Luau it becomes.",
							},
							{ t: "h", level: 3, text: "A step" },
							{
								t: "p",
								text:
									"An execution input and output. The template is statements, run where the node " +
									"sits. `$in.force` is whatever is wired into Force, or the value typed into it.",
							},
							{
								t: "code",
								lang: "luau",
								text: "$in.character.HumanoidRootPart:ApplyImpulse($in.force)",
							},
							{
								t: "code",
								lang: "luau",
								text: "character.HumanoidRootPart:ApplyImpulse(Vector3.new(0, 50, 0))",
							},
							{ t: "h", level: 3, text: "A step that sets an output" },
							{
								t: "p",
								text:
									"Give the node a data output and **assign** it. Roswaal declares the local before " +
									"the template runs, so the template sets it rather than declaring it.",
							},
							{
								t: "code",
								lang: "luau",
								text: "$out.hit = workspace:Raycast($in.origin, $in.direction)",
							},
							{
								t: "code",
								lang: "luau",
								text: code`
								local hit
								hit = workspace:Raycast(origin, direction)
								`,
							},
							{ t: "h", level: 3, text: "A call with a result" },
							{
								t: "p",
								text:
									"Click an output and tick **The call's result**. The template is then one " +
									"expression, and its value lands in that pin.",
							},
							{ t: "code", lang: "luau", text: '$in.character:FindFirstChildOfClass("Tool")' },
							{
								t: "code",
								lang: "luau",
								text: 'local tool = character:FindFirstChildOfClass("Tool")',
							},
							{ t: "h", level: 3, text: "A pure node" },
							{
								t: "p",
								text:
									"No execution pins: a value. The template is **one expression per output**, " +
									"written into whatever reads it.",
							},
							{ t: "code", lang: "luau", text: "$in.humanoid.Health > 0" },
							{ t: "code", lang: "luau", text: "if humanoid.Health > 0 then" },
							{
								t: "note",
								kind: "warn",
								text:
									"**A placeholder is filled in every time it appears**, so `$in.character` twice " +
									"evaluates a wired call twice. Read it once: `local character = $in.character`. Logic " +
									"built from nodes does this for you.",
							},
						],
					},
					{
						id: "luau",
						title: "Pack file",
						blocks: [
							{
								t: "p",
								text:
									"**A** `.nodedef.luau` **or** `.nodedef.json` **file, written by hand.** Luau is the " +
									"friendlier of the two: it is the language you already write, and it can carry " +
									"comments — which is the reason to choose it, and why Node Design opens one " +
									"read-only. `roswaal init` writes a commented example to start from.",
							},
							{
								t: "code",
								lang: "luau",
								text: code`
									return {
										nodes = {
											{
												id = "combat.knockback",
												title = "Apply Knockback",
												category = "Combat",
												inputs = {
													{ id = "in", kind = "exec" },
													{ id = "character", name = "Character", kind = "data", type = "Instance" },
													{ id = "force", name = "Force", kind = "data", type = "Vector3" },
												},
												outputs = { { id = "then", kind = "exec" } },
												compilesTo = {
													kind = "statement",
													template = "$in.character.HumanoidRootPart:ApplyImpulse($in.force)",
												},
											},
										},
									}
									`,
							},
							{
								t: "p",
								text:
									'A pin default may be written plainly — `default = 5`, `default = "Part"` — ' +
									'rather than as a tagged `{ t = "number", v = 5 }`. The tagged form is still ' +
									"there, and is the only way to write a `raw` default, which is emitted verbatim " +
									"rather than quoted.",
							},
							{
								t: "p",
								text:
									"Two more keys, both optional. `requires`, beside `nodes`, lists the packs " +
									"whose nodes this pack's logic is built from. `logic`, on a node saved from " +
									"Node Design, is the graph its logic was built from — the loader ignores it and " +
									'reads `compilesTo`. `display = "compact"` draws a pure node with no inputs ' +
									"and one output as a pill.",
							},
							{
								t: "note",
								kind: "warn",
								text:
									"A function call anywhere in a pack is a **parse error with a line number**, not " +
									"something that runs. `.nodedef.json` is the same shape with no comments.",
							},
						],
					},
					{
						id: "typescript",
						title: "TypeScript",
						blocks: [
							{
								t: "p",
								text:
									"**A node in Roswaal's own library**, in `src/core/nodes/library.ts`. This is how " +
									"every built-in node is written, and it is the route for a node that belongs to " +
									"*Roswaal* rather than to one game — a missing Roblox call, an operator the " +
									"library should have had.",
							},
							{
								t: "code",
								lang: "ts",
								text: code`
									pure("math.lerp", "Lerp", "Math",
										"($in.a + ($in.b - $in.a) * $in.t)",
										[num("a", "A"), num("b", "B"), num("t", "Alpha")], "number"),
									`,
							},
							{
								t: "p",
								text:
									"`pure`, `call`, `stmt` and `variadic` at the top of that file are shorthands over " +
									"the same three templates a pack writes by hand. There is deliberately **nothing " +
									"a built-in can express that a pack cannot**, which is what keeps the template " +
									"language honest — so a node written here could equally be shipped as a pack.",
							},
							{
								t: "p",
								text:
									"**Which is the question to answer first.** A node written in TypeScript is part " +
									"of Roswaal and arrives when somebody upgrades it; a node in a pack is part of " +
									"your project and arrives with a `git pull`. The designer asks which pack a node " +
									"goes in for the same reason: where a node lives decides who gets it.",
							},
							{
								t: "note",
								kind: "info",
								text:
									"Adding one to the library means building Roswaal and running its tests — see " +
									"[Contributing](contributing). A node that opens a block also needs emitter work; " +
									"packs cannot write one.",
							},
						],
					},
				],
			},
			{ t: "h", level: 2, text: "What every route shares" },
			{
				t: "p",
				text:
					"Whichever way a node is defined, it is the same three fields underneath — and the " +
					"compile kind is the decision that matters most, because it settles whether the node " +
					"sits in the execution chain at all.",
			},
			{
				t: "table",
				head: ["Kind", "Shape", "Emits"],
				rows: [
					[
						"`expr`",
						"Pure, no execution pins",
						"One expression per output pin, spliced into whatever reads it",
					],
					["`call`", "Impure, produces one value", "`local x = <template>`"],
					["`statement`", "Impure, any outputs", "The template, as statements"],
				],
			},
			{
				t: "note",
				kind: "warn",
				text:
					"`builtin` **is reserved** for the flow nodes that open blocks. A pack declaring one " +
					"is rejected on load.",
			},
			{ t: "h", level: 2, text: "Placeholders" },
			{
				t: "table",
				head: ["Placeholder", "Meaning"],
				rows: [
					[
						"`$in.<pin>`",
						"The input's expression — the wired source, or the value typed into it — parenthesised where precedence needs it",
					],
					["`$out.<pin>`", "The local this output was bound to"],
					[
						"`$in.<pin>!ident`",
						"An unconnected literal, sanitised to a Luau identifier. The pin cannot be wired",
					],
					["`$in.<pin>!raw`", "An unconnected literal, inserted verbatim"],
					["`$args(<sep>)`", "A variadic node's inputs, folded with that separator"],
					["`$opt(<sep>)`", "The optional trailing arguments, dropping the ones nobody set"],
				],
			},
			{
				t: "p",
				text:
					"A pin gets **splitting for free**: a pack's `Vector3` input breaks into components " +
					"exactly as a built-in's does, without the pack knowing splitting exists. Every node " +
					"in a project's packs also gets its own reference page in these docs, built from the " +
					"live registry — including the Luau it compiles to.",
			},
		],
	};
}
