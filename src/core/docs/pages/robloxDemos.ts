/**
 * The `roblox-demos` page of the documentation. `buildSite` places it.
 */

import { compile } from "../../compiler/index.js";
import type { NodeScript } from "../../schema.js";
import { stripHeader } from "../nodeReference.js";
import { ROBLOX_DEMO_GRAPHS, ROBLOX_DEMO_MAP } from "../robloxDemos.gen.js";
import type { Block, DocPage, PageContext } from "../site.js";
import { declarationsPanel } from "../toolbars.js";
import { code } from "./blocks.js";

/**
 * The Roblox demo page: the project that ships, read rather than described.
 *
 * Its graphs and its node map come from `examples/demo` itself, which is the
 * project the introduction panel offers to take a copy of — so what somebody
 * reads here and what they get when they take it are the same thing.
 *
 * Two graphs and a map rather than four programmes, because that is what the
 * demo is. The Lune page had to invent its examples; this one only has to show
 * the one that was already there, and showing a real project is worth more
 * than four tidier ones would be.
 */
export function robloxDemosPage({ registry }: PageContext): DocPage {
	const greeter = ROBLOX_DEMO_GRAPHS.greeter;
	const main = ROBLOX_DEMO_GRAPHS.main;

	const luau = (script: NodeScript): string => stripHeader(compile(script, registry).code);

	const blocks: Block[] = [
		{
			t: "p",
			text:
				"One project, two graphs and a node map. It is `examples/demo` — the project " +
				"the Roswaal panel offers to take a copy of, and the one `roswaal init` leaves " +
				"you standing in — so what is drawn here is what you would open.",
		},
		{
			t: "note",
			kind: "info",
			text:
				"**Take a copy rather than opening it in place.** *Demos* under the mark copies it " +
				"somewhere of your own; the original is shared by everyone who installed Roswaal.",
		},

		{ t: "h", level: 2, text: "A module, and a function in it" },
		{
			t: "p",
			text:
				"`Greeter` is a ModuleScript. It declares a function, returns a string from it, " +
				"and hands the function out through **Module Exports** — which is the node that " +
				"decides what `require` gives back.",
		},
		{
			t: "graph",
			script: greeter,
			panel: declarationsPanel(greeter),
			// A real project, laid out in the editor: drawn where its nodes are.
			asAuthored: true,
			caption: "The graph this was compiled from, and what it declares.",
		},
		{ t: "code", lang: "luau", text: luau(greeter) },
		{
			t: "note",
			kind: "info",
			text:
				"Each **Function** has a tab of its own, as in the editor. See [Functions](functions).",
		},

		{ t: "h", level: 2, text: "A script that runs when the place does" },
		{
			t: "p",
			text:
				"`Main` is a Script, so it runs on the server. It gets a service, requires the " +
				"module beside it, calls the function out of it, and connects to an event — " +
				"which between them is most of what any Roblox script does.",
		},
		{
			t: "graph",
			script: main,
			panel: declarationsPanel(main),
			asAuthored: true,
			caption: "The graph this was compiled from, and what it declares.",
		},
		{ t: "code", lang: "luau", text: luau(main) },
		{
			t: "note",
			kind: "info",
			text:
				"**Nothing in that file arrived on its own:** the `require`, the **Get Service** and " +
				"the **Connect** are all nodes. See [Modules](modules) and [Services and their " +
				"methods](services).",
		},

		{ t: "h", level: 2, text: "Where it lands in the DataModel" },
		{
			t: "p",
			text:
				"The map says where the generated files go, and compiles to the " +
				"`default.project.json` that Rojo reads. This is the demo's own, in the editor " +
				"that edits it:",
		},
		{
			t: "nodemap",
			map: ROBLOX_DEMO_MAP,
			caption:
				"The demo's map. **Select a row** and the Inspector fills with that instance's " +
				"fields, while the project file scrolls to the lines the row writes.",
		},
		{
			t: "p",
			text:
				"[Compiling and nodemaps for Roblox](building-and-rojo) is the page about that " +
				"panel — what each field does, and what happens when you compile.",
		},

		{ t: "h", level: 2, text: "Running it" },
		{
			t: "p",
			text:
				"Compile the project, then point Rojo at it and connect from Studio. Roswaal " +
				"writes the `.luau` files and the project file; everything after that is Rojo's, " +
				"and Roswaal never talks to Studio itself.",
		},
		{
			t: "code",
			lang: "sh",
			text: code`
				roswaal compile   # writes src/ and default.project.json
				rojo serve        # then connect from Studio
				`,
		},
		{
			t: "note",
			kind: "info",
			text:
				"The demo also ships two **node packs** in `.roswaal/nodes`, unused by these graphs, " +
				"to open in Node Design. See [Creating custom nodes](creating-custom-nodes).",
		},
	];

	return {
		slug: "roblox-demos",
		title: "The Roblox demo",
		summary: "The project that ships: a module, a server script, and the map that places them.",
		blocks,
	};
}
