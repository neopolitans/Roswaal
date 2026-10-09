/**
 * Chapter 11 of the technical specification: the Luau for Roblox profile,
 * Roswaal's first.
 *
 * Its tables are counted from the library and the engine data as the pages are
 * built, so a node added to the library shows up here without anyone editing
 * this file.
 */

import { categoryLabel } from "../../categories.js";
import { CATEGORY_GLYPHS } from "../../nodeGlyphs.js";
import { BUILTIN_NODES, categories, type Registry } from "../../nodes/index.js";
import { classify } from "../../nodes/runtimes.js";
import { CLASSES, DATATYPES, ENUMS } from "../../robloxData.js";
import { code } from "../pages/blocks.js";
import type { DocPage } from "../site.js";
import { normative } from "./spec.js";

/** The built-in library by category, with how many run on each target. */
function libraryRows(): string[][] {
	const registry: Registry = new Map(BUILTIN_NODES.map((def) => [def.id, def]));
	return categories(registry).map((category) => {
		const defs = BUILTIN_NODES.filter((def) => def.category === category);
		const runtimes = new Set(defs.map((def) => classify(def)));
		const runs =
			runtimes.size === 1 && runtimes.has("luau")
				? "Both"
				: runtimes.has("luau")
					? "Both, and Roblox only"
					: runtimes.has("lune")
						? "Lune only"
						: "Roblox only";
		return [
			categoryLabel(category),
			String(defs.length),
			runs,
			`\`${CATEGORY_GLYPHS[category] ?? "other"}\``,
		];
	});
}

export function luauForRobloxPage(): DocPage {
	const roblox = BUILTIN_NODES.filter((def) => classify(def) !== "lune").length;
	return {
		slug: "technical/luau-for-roblox",
		title: "11 Luau for Roblox",
		summary:
			"The profile for Roblox experiences: Luau's types and Roblox's, the class tree, the built-in library, and the files it writes.",
		spec: normative(),
		blocks: [
			{ t: "h", level: 2, text: "11.1 Overview" },
			{ t: "note", kind: "info", text: "This section is informative." },
			{
				t: "p",
				text:
					"The profile with the id `roblox` turns graphs into Luau scripts for Roblox " +
					"experiences, laid out as a Rojo project. It is the profile Roswaal was built for, " +
					`and its library has ${roblox} built-in nodes. [Luau for Lune](technical/luau-for-lune) ` +
					"shares most of it.",
			},

			{ t: "h", level: 2, text: "11.2 Types and conversions" },
			{
				t: "ul",
				items: [
					"Luau's own types: `number`, `string`, `boolean`, `table`, `function`, `thread`, and `nil` as a value.",
					`Roblox's datatypes, such as \`Vector3\`, \`CFrame\` and \`Color3\`: ${DATATYPES.length} of them.`,
					`Every engine class, such as \`Part\` and \`Player\`: ${CLASSES.length} of them.`,
					"The one conversion: `number` and `string`, both ways, as Luau converts them.",
				],
			},
			{ t: "h", level: 3, text: "From a Luau annotation to a pin type" },
			{
				t: "table",
				head: ["Annotation", "Pin type"],
				rows: [
					["None, `unknown`, `never`", "`any`"],
					["A name, such as `Model` or `Vector3`", "That name"],
					[
						"A name with `?`, such as `Model?`",
						"That name; the pin is marked as possibly missing (§6.1)",
					],
					["A dotted name, such as `Module.Config`", "That name"],
					["A table type, `{ … }`", "`table`"],
					["A union, a function type, anything else", "`any`"],
				],
			},
			{ t: "p", text: "From `pinTypeOf` in `core/nodes/variables.ts`." },

			{ t: "h", level: 2, text: "11.3 Families of Roblox's types" },
			{
				t: "table",
				head: ["Family", "Types"],
				rows: [
					["`object`", "Every engine class."],
					["`signal`", "`RBXScriptSignal`."],
					["`table`", "`table`, and any written table type."],
					["`function`", "`function`, and any written function type."],
					[
						"`value`",
						"Everything else: Luau's other types and Roblox's datatypes, `RBXScriptConnection` among them.",
					],
				],
			},
			{
				t: "p",
				text:
					"On a type chip, `RBXScript` is left off the front of a name (`RBXScriptConnection` " +
					"reads Connection), a written table type reads `table` and a function type " +
					"`function`.",
			},

			{ t: "h", level: 2, text: "11.4 Classes and the hierarchy" },
			{
				t: "p",
				text:
					"The class tree, the classes' summaries and their members come from Roblox's " +
					"Creator Documentation, generated into Roswaal's source by its build scripts " +
					`rather than read at run time: ${CLASSES.length} classes, ${DATATYPES.length} ` +
					`datatypes and ${ENUMS.length} enums. Every class has one parent, up to \`Object\` ` +
					"at the root, and a class connects into any of its ancestors (§6.3).",
			},

			{ t: "h", level: 2, text: "11.5 The built-in library" },
			{
				t: "table",
				head: ["Category", "Nodes", "Runs on", "Glyph"],
				rows: libraryRows(),
			},
			{
				t: "p",
				text:
					"Generated from `core/nodes` and `core/nodeGlyphs.ts`. **Both** means the node " +
					"works in a Lune graph too (§12). The Roblox Types category is split by datatype, " +
					"each with a colour and a glyph of its own. A node that starts or ends a flow takes " +
					"the glyph `entry` or `terminal`; Function and Declare Function take `function`, " +
					"and Return `return`, " +
					"whatever its category.",
			},

			{ t: "h", level: 2, text: "11.6 What each node compiles to" },
			{
				t: "p",
				text:
					"Every built-in node's page in these docs, such as [Print](node/debug.print), " +
					"shows the Luau it compiles to. " +
					"How values are bound and inlined is §7.2's rule, written as Luau: a value read " +
					"once is written where it is read, and one read twice in a block becomes a " +
					"`local`.",
			},

			{ t: "h", level: 2, text: "11.7 Scripts, modules, run contexts" },
			{
				t: "table",
				head: ["Script class", "Run context", "File written"],
				rows: [
					["`Script`", "absent, `Server` or `Legacy`", "`<name>.server.luau`"],
					["`Script`", "`Client`", "`<name>.client.luau`"],
					["`LocalScript`", "any", "`<name>.client.luau`"],
					["`ModuleScript`", "any", "`<name>.luau`"],
				],
			},
			{
				t: "p",
				text:
					"Rojo decides what a file becomes in Studio from its name, so the class and run " +
					"context are written into the name. A module returns what its **Module Exports** " +
					"node is given. Where each file goes in the place is the node map's (§9.5), which " +
					"becomes a Rojo project file.",
			},
			{ t: "h", level: 3, text: "The file's header" },
			{
				t: "code",
				lang: "luau",
				text: code`
					--!strict
					-- Generated by Roswaal. Do not edit this file directly;
					-- edit Main.nodescript and recompile instead.
					-- roswaal-graph: <the graph's id>
					-- roswaal-source: <a hash of the graph>
					-- roswaal-output: <a hash of what follows>
					`,
			},
			{
				t: "p",
				text:
					"The first line is the graph's `typecheck`: `--!strict`, `--!nonstrict`, or no line " +
					"for `default`. Then come the services the script uses, its `require`s, its types, " +
					"its variables, its hoisted functions, its flow, and a module's `return`. Where " +
					"the project asks and StyLua is installed, the file is formatted by StyLua.",
			},

			{ t: "h", level: 2, text: "11.8 Packs and hand-written Luau" },
			{
				t: "ul",
				items: [
					"A pack is a `.nodedef.json` file, or a `.nodedef.luau` file that returns a table: read as data, never run.",
					"A pack's nodes compile with `expr`, `call` or `statement` templates (§10.5).",
					"Graphs can hold hand-written Luau in a Code Block, a step, or a Luau Expression, a value. It is written into the program as it is.",
				],
			},

			{ t: "h", level: 2, text: "11.9 Moonwave and comment tags" },
			{
				t: "note",
				kind: "info",
				text:
					"**Proposed.** Typing a hand-written module's functions for graphs from its " +
					"Moonwave doc comments, and from Roswaal's own tags where Moonwave has none, in " +
					"plain `--` comments so a Moonwave site still builds (§6.5). Not decided, and not " +
					"built.",
			},
		],
	};
}

/** The Lune profile, chapter 12. */
export function luauForLunePage(): DocPage {
	const lune = BUILTIN_NODES.filter((def) => classify(def) !== "roblox").length;
	return {
		slug: "technical/luau-for-lune",
		title: "12 Luau for Lune",
		summary:
			"The profile for Lune programs: what changes from Roblox, Lune's standard library, and running the output.",
		spec: normative(),
		blocks: [
			{ t: "h", level: 2, text: "12.1 What changes from Roblox" },
			{ t: "note", kind: "info", text: "This section is informative." },
			{
				t: "p",
				text:
					"The profile with the id `lune` turns graphs into Luau programs run by Lune, " +
					"outside Roblox. It is Luau for Roblox (§11) without the engine: the same Luau " +
					`types and conversion, the same templates, and ${lune} of the built-in nodes, ` +
					"those §11.5 marks as running on both, plus Lune's own.",
			},
			{
				t: "ul",
				items: [
					"There are no engine classes, services or events. A Roblox-only node in a Lune graph is an error.",
					"`scriptClass` is not read. A Lune graph is a module when it has a Module Exports node.",
					"Every graph becomes `<name>.luau`.",
					"Modules are loaded by Lune's specifiers, such as `@lune/fs`. An instance path is an error.",
					"Roblox datatypes that Lune's `@lune/roblox` implements, such as `Vector3`, can be used once the graph lists that module, with the datatype among its members.",
				],
			},

			{ t: "h", level: 2, text: "12.2 Types and the standard library" },
			{
				t: "p",
				text:
					"Lune's standard library is generated into Roswaal's source from the type " +
					"definitions Lune publishes, pinned to one Lune release. Its functions become two " +
					"nodes, **Lune Function**, a step, and **Lune Function (Value)**, a value, which " +
					"take their pins from the chosen function's signature. A function Lune marks as " +
					"one whose result must be used is offered as a value.",
			},

			{ t: "h", level: 2, text: "12.3 What each node compiles to" },
			{
				t: "p",
				text:
					"As in §11.6. A Lune call never loads its module itself: the graph's list of " +
					"modules (§9.3) has to name it, and a call into a module the list does not name " +
					"is an error.",
			},

			{ t: "h", level: 2, text: "12.4 Running the output" },
			{
				t: "p",
				text:
					"The file is run with `lune run`, as any Lune program is. It carries the header " +
					"of §11.7, and needs nothing of Roswaal's (§2.1, principle 10).",
			},
		],
	};
}
