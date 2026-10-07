/**
 * The `hand-written-luau` page of the documentation. `buildSite` places it.
 */

import { compile } from "../../compiler/index.js";
import type { Registry } from "../../nodes/index.js";
import type { NodeScript } from "../../schema.js";
import { GUIDE_SCENES } from "../examples.js";
import { stripHeader } from "../nodeReference.js";
import type { DocPage, PageContext } from "../site.js";
import { previews } from "./blocks.js";

/**
 * A guide scene's generated Luau, without its header. Compiled rather than
 * written out by hand, so the code under a picture is the code the picture makes.
 */
function compiledBody(script: NodeScript, registry: Registry): string {
	return stripHeader(compile(script, registry).code);
}

export function handWrittenLuauPage({ registry }: PageContext): DocPage {
	return {
		slug: "hand-written-luau",
		narrow: true,
		title: "Hand-written Luau",
		summary: "The two nodes that take code, what they emit, and why there are only two.",
		blocks: [
			{
				t: "p",
				text:
					"Not everything is worth wiring. A regular expression, a table literal, a bit of " +
					"maths you already have — these are shorter as code, and Roswaal has two nodes that " +
					"take it.",
			},

			{ t: "h", level: 2, text: "Which one, and why" },
			{
				t: "p",
				text:
					"The difference is **where the code lands in the generated file**, not how long it " +
					"is. It is the one thing about these two nodes that is worth getting straight, " +
					"because everything else follows from it.",
			},
			{
				t: "table",
				head: ["", "Code Block", "Luau Expression"],
				rows: [
					["Lands where", "a **statement** goes", "a **value** goes"],
					["Execution pins", "Yes — it is a step in the flow", "None. It is pure"],
					["Hands a value back", "No output pin", "Its output, wired anywhere"],
					[
						"Length",
						"As many statements as you like",
						"One expression, however many lines that takes",
					],
					["Reach for it when", "you are *doing* something", "you are *computing* something"],
				],
			},
			...previews(
				registry,
				["code.custom", "value.expression"],
				"The shape says which is which before you read the title: Code Block has execution " +
					"pins and no output, Luau Expression has an output and no execution pins.",
			),
			{ t: "h", level: 3, text: "Code Block" },
			{
				t: "graph",
				script: GUIDE_SCENES.customCode(),
				caption:
					"A step in the flow. Its statements run in order, and whatever is wired after it " +
					"runs next.",
			},
			{ t: "code", lang: "luau", text: compiledBody(GUIDE_SCENES.customCode(), registry) },
			{ t: "h", level: 3, text: "Luau Expression" },
			{
				t: "graph",
				script: GUIDE_SCENES.luauExpression(),
				caption: "A value. Its text is written where the value is used — here, inside the Print.",
			},
			{ t: "code", lang: "luau", text: compiledBody(GUIDE_SCENES.luauExpression(), registry) },
			{
				t: "note",
				kind: "danger",
				text:
					"**Statements do not go in a Luau Expression.** `local x = 1` there would emit " +
					"`print(local x = 1)`, so it is refused before the file is written. If it would not " +
					"fit inside brackets, use Code Block.",
			},
			{
				t: "p",
				text:
					"Code Block has no output pin, so it cannot hand a value onward. To get one out, " +
					"write to a script variable, or use **Declare Local** before it and assign in the " +
					"code — the completion list will offer that local by name.",
			},
			{
				t: "p",
				text:
					"Both pins are typed `luau` rather than `string`, and clicking one opens it in the " +
					"**Code panel**: Luau highlighting, the parser the build runs marking a mistake as you " +
					"type, and completion over Luau's globals **and the names this graph puts in scope**.",
			},

			{ t: "h", level: 2, text: "The Code panel" },
			{
				t: "p",
				text:
					"The panel opens along the foot of the graph, between the side panels, so the tree, " +
					"Variables and the Inspector stay where they are while you write. Each field you open " +
					"is a tab of its own in the panel's header. A tab's mark says what it edits — **{ }** a " +
					"Code Block, **ƒx** a Luau Expression, **<T>** a type written out — then comes the " +
					"node's label if it has one, and the graph it is in, or its first line when two would " +
					"read the same. A graph's tabs come back when you return to it.",
			},
			{
				t: "table",
				head: ["", "What it does"],
				rows: [
					["Typing", "Applied to the node once you pause, and at once when you click away"],
					["`Ctrl` + `Z` in the code", "The code's own undo, a keystroke at a time"],
					["`Ctrl` + `Z` on the graph", "Undoes a pause's worth of typing, and the panel follows"],
					["**Go to node**", "Selects the node on the graph and brings it into view"],
					[
						"**Full view**, or `Ctrl` + `Shift` + `Enter`",
						"The code over the graph, the side panels kept. `Esc` or the same keys go back",
					],
					[
						"Drag from Variables",
						"Writes the name: a variable, service, module, local, function or type",
					],
					[
						"Drag from the DataModel",
						"Writes the path, from the nearest name that already holds part of it",
					],
					["**×** or a middle-click on a tab", "Closes it"],
				],
			},
			{
				t: "p",
				text:
					"There is no Done: what you type is what the node holds. A graph that is compiling " +
					"takes the change once it finishes, rather than dropping it. The panel moves like any " +
					"other — drag its header to a side, onto the Inspector's header to share its card, or " +
					"over the graph for a window — and its menu brings it back **Along the foot**.",
			},

			{ t: "h", level: 2, text: "What is in scope" },
			{
				t: "p",
				text:
					"Completion offers the locals a Code Block can actually see: the script's " +
					"variables, any local declared upstream in the same block, and a function's " +
					"parameters when the block is inside one. A local declared in a sibling branch is " +
					"not offered, because it does not exist there.",
			},
			{
				t: "note",
				kind: "good",
				text:
					"**Completion reads the code you are typing**: its own locals, and the parameters and " +
					"loop variables around the cursor, are offered ahead of the graph's names.",
			},
			{
				t: "p",
				text:
					"Hovering a name says what it is, with the comment above it, and a required module's " +
					"members and the place's instances are known too. [Reading your Luau](reading-luau) " +
					"has the detail.",
			},

			{ t: "h", level: 2, text: "There are exactly two" },
			{
				t: "note",
				kind: "good",
				text:
					"Those two nodes are the **only** places hand-written Luau enters a graph. Every " +
					"other pin shows its constant and will not take code.",
			},
			{
				t: "p",
				text:
					"That guarantee is the point, and it is why a code pin has its own type. Plenty of " +
					"ordinary pins default to a raw Luau constant because their type has no literal " +
					"form — a `Vector3` input cannot sensibly default to `nil`. If every one of those " +
					"opened a code editor, a graph shared with you could hide arbitrary code inside a " +
					"node whose title says *Look At*, and reviewing it would mean opening every pin " +
					"rather than scanning for two node names.",
			},
			{
				t: "p",
				text:
					"To change a constant on an ordinary pin, wire a node into it or split it into its " +
					"components. Both got considerably easier than they were.",
			},

			{ t: "h", level: 2, text: "When to reach for something else" },
			{
				t: "ul",
				items: [
					"**A missing node.** Write it as a node pack instead — declarative, documented automatically, and reusable across graphs. Code Block is a one-off.",
					"**A whole system.** Put it in a ModuleScript and use *Require Module* and *Call Function*. Roswaal is happy to call into Luau it did not write.",
					"**Something you cannot express.** Say so — a gap in the node library is worth filing, and this month several were closed that way.",
				],
			},
			{
				t: "note",
				kind: "info",
				text:
					"Code in these nodes is **parsed** before the file is written: a syntax mistake stops " +
					"the build and points at its line. Names and types are not checked — that is still " +
					"Luau's job, in Studio.",
			},
		],
	};
}
