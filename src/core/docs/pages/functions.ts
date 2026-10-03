/**
 * The `functions` page of the documentation. `buildSite` places it.
 */

import { previews } from "./blocks.js";
import type { DocPage, PageContext } from "../site.js";
import { FUNCTIONS_PANEL } from "../toolbars.js";

/**
 * Luau's types, where a graph meets them.
 *
 * Split out of *Roswaal types* in 0.31.0. It was three paragraphs at the foot
 * of that page, written when casting was the only place the two type systems
 * touched — and by 0.30.0 it was not: a type can be declared in three shapes, a
 * local and a variable can carry one, a required module's types can be named,
 * and a type that is more than a name is written into the file as itself. That
 * is a page, not a footnote.
 */
/** Functions, and the graph each one opens in. */
export function functionsPage({ registry }: PageContext): DocPage {
	return {
		slug: "functions",
		title: "Functions",
		summary:
			"The two ways to declare one, the graph each opens in, how to call it, and what can " +
			"reach inside.",
		narrow: true,
		blocks: [
			{
				t: "p",
				text:
					"Every function in a nodescript has a **graph of its own**. Its body is built there, " +
					"it opens in a tab, and the nodescript's own graph stays about the script's flow.",
			},
			{
				t: "p",
				text:
					"Functions are the language's, not the engine's, so everything on this page works " +
					"the same whether the graph compiles for Roblox or for [Lune](modules).",
			},

			{ t: "h", level: 2, text: "Two ways to declare one" },
			{
				t: "table",
				head: ["Node", "Written", "Drawn in"],
				rows: [
					["**Function**", "At the top of the file, so anything can call it", "Its own graph only, as the entry node"],
					["**Declare Function**", "Where the node sits in the flow, or onto a table with **On Table**", "The flow, and its own graph as the entry node"],
				],
			},
			...previews(
				registry,
				["function.entry", "function.declareHere"],
				"As the reference draws them, with every pin. On the canvas Declare Function shows " +
				"half of these in each of its two graphs.",
			),
			{
				t: "p",
				text:
					"Reach for **Declare Function** when the function has to come after something — " +
					"`function TankConfig.read(tank: Model)` needs `TankConfig` to exist first — and " +
					"for **Function** when it is simply something the script has.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"**On Table** must resolve to a variable or a local; Luau cannot attach a function to " +
					"an expression. Left unwired, it is a plain `local function`.",
			},

			{ t: "h", level: 2, text: "The signature" },
			{
				t: "p",
				text:
					"Name, parameters and return values are all edited in the Inspector, on either " +
					"declaration node. The signature is written under the node's header — " +
					"`read(tank: Model): Config` — so a graph full of functions can be read without " +
					"opening any of them.",
			},
			{
				t: "table",
				head: ["Field", "What it does"],
				rows: [
					["**Name**", "What the function is called, and what a Get Function offers"],
					["**Parameters**", "Name and optional Luau type each. They become data outputs on the entry node, in this order"],
					["**Return values**", "Name and optional Luau type each. They become input pins on every **Return** in this function"],
				],
			},
			{
				t: "p",
				text:
					"A type here is **free text**, the same as a local's or a variable's: `BasePart?`, " +
					"`{ [Model]: Restore }` and a union are all types no dropdown could offer. Left " +
					"blank there is no annotation at all rather than `any`.",
			},
			{
				t: "p",
				text:
					"Renaming a parameter carries every node reading it along. **Reordering** them " +
					"leaves those nodes alone, because a Get Parameter holds the parameter's name and " +
					"not its position. **Removing** one leaves the node saying which parameter is " +
					"gone.",
			},

			{ t: "h", level: 2, text: "A function's graph" },
			{
				t: "p",
				text:
					"It opens in a tab marked **ƒ** and named for the function and its script: " +
					"`hide (Occupancy)`. **Shorten function tabs** in [settings](settings) keeps one of " +
					"the two names. The entry node carries **Body** and the parameters, and the " +
					"function's **Return** nodes go in this graph too.",
			},
			{
				t: "ul",
				items: [
					"In the project tree, the arrow beside a `.nodescript` lists its functions. Double-click one to open it.",
					"Click a function in the **Variables panel**.",
					"Double-click a **Declare Function** in the flow, or click the **ƒ** on its header.",
					"Adding a **Function** opens its graph straight away.",
				],
			},
			{
				t: "p",
				text:
					"`P` **with nothing selected previews the function you are in**, rather than the " +
					"whole script. The nodescript's own graph still previews all of it.",
			},

			{ t: "h", level: 2, text: "Declare Function, in two graphs" },
			{
				t: "table",
				head: ["Graph", "Its pins there"],
				rows: [
					["The flow it is declared in", "In, Then, On Table, and Function — the function as a value"],
					["Its own graph", "Body, and one output per parameter"],
				],
			},
			{
				t: "p",
				text:
					"It is one node with a place in each. Moving it in one graph does not move it in " +
					"the other, and renaming it or changing its parameters shows in both.",
			},

			{ t: "h", level: 2, text: "Returning" },
			{
				t: "p",
				text:
					"**Return** ends the enclosing function, and it lives in that function's graph. " +
					"Give the function return values in the Inspector and each one becomes a pin on " +
					"every Return in it — named, typed, and with a default you can type in rather " +
					"than having to wire a node up for a constant.",
			},
			...previews(
				registry,
				["function.return"],
				"A Return with no values configured is the bare `return`. Each value you add to the " +
				"signature adds a pin here.",
			),
			{
				t: "note",
				kind: "info",
				text:
					"A function with no Return is fine: it returns nothing, like the Luau it compiles to.",
			},

			{ t: "h", level: 2, text: "Calling one" },
			{
				t: "p",
				text:
					"A function is reached as a **value** first, and then called. **Get Function** is " +
					"that value for a function declared in this graph; the **Function** output on " +
					"either declaration node is the same thing, which is what lets one be handed to " +
					"**Connect** or returned from a module without a wrapper node.",
			},
			{
				t: "table",
				head: ["Node", "When"],
				rows: [
					["**Call Function**", "The call does something. It sits in the execution chain and binds its result to a local"],
					["**Call For Value**", "The call asks something. No execution wire, so it goes where a value goes — inside a table, an argument, an expression"],
					["**Call Method**", "The call is colon-style, on an object: `part:Destroy()`. See [Services and their methods](services) for the service case"],
				],
			},
			...previews(
				registry,
				["function.get", "call.function", "call.value"],
				"Both call nodes take the function on a wire, and the argument count is set in the " +
				"Inspector rather than fixed by the node.",
			),
			{
				t: "code",
				lang: "luau",
				text:
					"-- Call Function: the result is bound, and the order is on the wire\n"
					+ "local config = TankConfig.read(tank)\n"
					+ "\n"
					+ "-- Call For Value: spliced into whatever reads it\n"
					+ "return { movementSpeed = readNumber(hullSettings, \"MovementSpeed\") }",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"A **Get Function** earlier in the flow than its **Declare Function** is an error. A " +
					"hoisted **Function** has no order to get wrong.",
			},

			{ t: "h", level: 2, text: "Reading a parameter" },
			{
				t: "p",
				text:
					"The parameter pins on the entry node work and are not going away, but in a " +
					"function of any size the wires off them cross the whole body. **Get Parameter** " +
					"reads one by name instead — the same trade [Get Local](variables-and-locals) " +
					"makes. Pick the function and the parameter in the Inspector.",
			},
			...previews(registry, ["function.getParam"]),
			{
				t: "ul",
				items: [
					"It works inside an **event handler** as well as a function: Connect binds its " +
						"handler's parameters in the same way.",
					"Typing a parameter's name into the node search offers **Get ‹parameter›** " +
						"directly, with From and Parameter already filled in.",
					"A parameter is offered only **inside the body it belongs to** — a function's in " +
						"its own graph, a handler's where its node is drawn.",
				],
			},
			{
				t: "note",
				kind: "warn",
				text:
					"A **Get Parameter** outside its function's body creates an error pointing to both.",
			},

			{ t: "h", level: 2, text: "Finding one" },
			{
				t: "p",
				text:
					"The **Variables panel** lists every function this script declares, under its own " +
					"heading. Click one to open its graph; drag it onto the canvas for a **Get " +
					"Function**.",
			},
			{ t: "toolbar", bar: FUNCTIONS_PANEL, hint: true },
			{
				t: "p",
				text:
					"Both node searches know them too. **This graph**, in the node menu's filter row, " +
					"sets the built-in library aside and leaves what this graph declares: its " +
					"variables, locals, functions and — in a function's own graph — that function's " +
					"parameters. `Ctrl` + `right-click` opens the same list as the **node picker**, " +
					"with each entry drawn as you walk it.",
			},

			{ t: "h", level: 2, text: "What reaches inside" },
			{
				t: "p",
				text:
					"**A wire cannot run between two graphs.** A value reaches a function through a " +
					"parameter — wired from the entry node, or read with [Get Parameter](variables-and-locals) — " +
					"through a local declared before it, or through a script variable. Anything you add " +
					"in a function's tab goes in that function's graph.",
			},
			{
				t: "p",
				text:
					"Which locals count as *before it* is the one place the two declarations differ. " +
					"A **Declare Function** is written where it sits, so it closes over the file's " +
					"locals and the Variables panel lists them inside it. A hoisted **Function** is " +
					"written above them, so it cannot see them and they are not offered.",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"A wire between two graphs can only come from a hand-edited file or a bad merge, " +
					"and it creates an error on the node it runs into.",
			},

			{ t: "h", level: 2, text: "Editing a function as a whole" },
			{
				t: "ul",
				items: [
					"**Select all**, marquee select, **Realign** and align act on the graph on screen, and only that.",
					"**Deleting** a function deletes its graph, and asks first when there are nodes in it. Its tab closes.",
					"**Copying** a function copies its graph, so the paste is a working function. Only its declaration lands at the pointer; the nodes inside keep their places.",
				],
			},
		],
	};
}
