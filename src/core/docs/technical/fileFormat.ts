/**
 * Chapter 9 of the technical specification: how graphs are stored.
 *
 * Written from `core/schema.ts`, `core/nodemap.ts`, `core/migrate.ts` and the
 * canonical writer, `serialiseScript` in `core/compiler/index.ts`.
 */

import { SCHEMA_VERSION } from "../../schema.js";
import { code } from "../pages/blocks.js";
import type { DocPage } from "../site.js";
import { normative } from "./spec.js";

export function fileFormatPage(): DocPage {
	return {
		slug: "technical/file-format",
		title: "9 File format",
		summary:
			"How a graph is stored: the graph file, its nodes and wires, variables and modules, comments, node maps, project settings and versions.",
		spec: normative(),
		blocks: [
			{
				t: "p",
				text:
					"Graphs are stored as JSON, one graph file per script. An implementation " +
					"conforming at level 1 (§1.3) reads and writes these files as this chapter says. " +
					"Field names are given exactly; a field marked optional **MAY** be left out, and " +
					"one left out means what this chapter says it means.",
			},

			// 9.1 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "9.1 The graph file" },
			{
				t: "p",
				text:
					"A graph file holds one script: the main graph and the graph of every function " +
					"declared in it. It is named with the `.nodescript` extension, and its top level " +
					"is an object:",
			},
			{
				t: "table",
				head: ["Field", "Type", "Holds"],
				rows: [
					[
						"`schemaVersion`",
						"number",
						`The version of this format, \`${SCHEMA_VERSION}\` (§9.7).`,
					],
					["`kind`", '`"script"`', "What the file is."],
					["`id`", "string", "The graph's identity, which does not change when it is renamed."],
					[
						"`name`",
						"string",
						"Its name. Where the file's own name says otherwise, the file's name wins.",
					],
					[
						"`target`",
						"string",
						'The profile it is written for (§1.2): `"roblox"` or `"lune"` in Roswaal.',
					],
					["`scriptClass`", "string", "What kind of program it becomes, in the profile's terms."],
					["`runContext`", "string, optional", "Where it runs, where the profile distinguishes."],
					[
						"`typecheck`",
						"string",
						"How strictly the program is type-checked, in the profile's terms.",
					],
					["`variables`", "array", "The graph's variables (§9.3)."],
					[
						"`modules`",
						"array, optional",
						"The modules the program uses (§9.3). Absent means none.",
					],
					[
						"`services`",
						"array of strings, optional",
						"Services declared by name, where the profile has them (§9.3).",
					],
					["`nodes`", "array", "Every node, in every graph of the file (§9.2)."],
					["`links`", "array", "Every wire (§9.2)."],
					["`comments`", "array", "Every comment (§9.4)."],
				],
			},
			{
				t: "p",
				text:
					"`scriptClass`, `runContext`, `typecheck` and `services` are the Luau profiles' " +
					"fields, kept at the top level for Draft 0.1; §10.1 says how a profile names its " +
					"own. A reader **MUST** keep fields it does not know when it writes a file back.",
			},

			// 9.2 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "9.2 Nodes and links" },
			{ t: "h", level: 3, text: "A node" },
			{
				t: "table",
				head: ["Field", "Type", "Holds"],
				rows: [
					["`id`", "string", "Unique in the file."],
					[
						"`def`",
						"string",
						"Which node it is: the id of a node definition in the profile or a pack.",
					],
					["`x`, `y`", "number", "Its top-left corner on the canvas, in canvas units."],
					[
						"`literals`",
						"object, optional",
						"The values typed into its unwired inputs, by pin id (below).",
					],
					["`config`", "object, optional", "Its settings, which the node definition interprets."],
					["`label`", "string, optional", "A title of its own, in place of the definition's."],
					[
						"`graph`",
						"string, optional",
						"The id of the function declaration whose graph it is drawn in. Absent: the main graph.",
					],
					[
						"`inner`",
						"object, optional",
						"For a function declaration: where it is drawn inside its own graph, as `x` and `y`.",
					],
				],
			},
			{
				t: "p",
				text:
					"`graph` decides only where a node is drawn. What a function's body is, is decided " +
					"by its wires (§7.5).",
			},
			{ t: "h", level: 3, text: "A value typed in" },
			{
				t: "p",
				text: "A literal is an object with a tag `t`, and a value `v` for every tag but `nil`:",
			},
			{
				t: "table",
				head: ["t", "v", "Is"],
				rows: [
					['`"nil"`', "none", "No value."],
					['`"boolean"`', "boolean", "True or false."],
					['`"number"`', "number", "A number."],
					['`"string"`', "string", "Text."],
					['`"raw"`', "string", "Source code, written into the program as it is."],
				],
			},
			{ t: "h", level: 3, text: "A link" },
			{
				t: "p",
				text:
					'A link is `{ "id", "from": { "node", "pin" }, "to": { "node", "pin" } }`: ' +
					"from an output to an input, each named by its node's id and its pin's id. Its " +
					"route is never stored; it is drawn from the two pins' positions (§5.2).",
			},
			{
				t: "p",
				text:
					"Ids are opaque strings. Roswaal makes them as random UUIDs; another " +
					"implementation **MAY** use any scheme that keeps them unique within the file, and " +
					"**MUST NOT** read meaning into another's.",
			},

			// 9.3 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "9.3 Variables, modules, services" },
			{
				t: "table",
				head: ["A variable's field", "Type", "Holds"],
				rows: [
					["`id`", "string", "Its identity: nodes that read it refer to this."],
					["`name`", "string", "Its name in the program."],
					["`type`", "string", "Its pin type (§6.1)."],
					["`default`", "literal", "Its value before anything sets it (§7.4)."],
					["`description`", "string, optional", "What it is for."],
					["`const`", "boolean, optional", "Whether it can never be set."],
				],
			},
			{
				t: "table",
				head: ["A module's field", "Type", "Holds"],
				rows: [
					["`id`", "string", "Its identity."],
					["`name`", "string", "The name the module is bound to in the program."],
					[
						"`specifier`",
						"string",
						"What to load, written as the profile's way of loading a module takes it.",
					],
					[
						"`members`",
						"array of strings, optional",
						"Names taken off the module into names of their own.",
					],
					["`description`", "string, optional", "What it is for."],
				],
			},
			{
				t: "p",
				text:
					"The list of modules is the program's whole list: a compiler **MUST NOT** load a " +
					"module the list does not name. Locals and functions are not listed: each is a " +
					"node (§3.6, §3.7).",
			},

			// 9.4 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "9.4 Comments" },
			{
				t: "p",
				text:
					'A comment is `{ "id", "x", "y", "w", "h", "text" }`, with an optional ' +
					"`color`, six hexadecimal digits without the `#`, and an optional `graph`, as on a " +
					"node. What a comment holds is never stored: it is whatever lies inside it (§4.3).",
			},

			// 9.5 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "9.5 Node maps" },
			{
				t: "p",
				text:
					"A node map, `.nodemap`, says where each compiled program goes in the place it " +
					'runs from. Its top level is `{ "schemaVersion", "kind": "map", "id", ' +
					'"name", "output", "root" }`, with an optional `target`. `root` is a tree of ' +
					"entries, each with an `id`, a `name` and `children`. A map, and what its entries " +
					"may say, belongs to the profile: the Roblox profile's describes a place and " +
					"becomes a Rojo project file (§11.7); the Lune profile's describes folders.",
			},

			// 9.6 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "9.6 Project settings" },
			{
				t: "p",
				text:
					"A project is a folder with a `roswaal.json` at its root. Its fields say which " +
					"profile the project uses (`target`), where graph files are (`sourceDir`), where " +
					"programs are written (`outDir`), where node packs are (`nodePaths`), when to " +
					'compile (`compileMode`, `"manual"` or `"hot"`), and how programs are laid ' +
					"out (`format`, `indentStyle`, `indentWidth`, `comments`). A missing field takes " +
					"its default; a field a reader does not know **MUST** be kept.",
			},

			// 9.7 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "9.7 Versions and migration" },
			{
				t: "ul",
				items: [
					`Every file carries \`schemaVersion\`. This draft describes version ${SCHEMA_VERSION}.`,
					"A reader **MUST** refuse a file with a higher version than it knows, and say it was written by a newer implementation, rather than guess at it.",
					"A reader **SHOULD** bring an older file up to date as it reads it: fill in fields that did not exist, and rename nodes and pins that were renamed. It **MUST** say what it changed.",
					"A writer **MUST** write the version it implements.",
				],
			},
			{
				t: "note",
				kind: "info",
				text:
					`**In Draft 0.1, version ${SCHEMA_VERSION} has changed shape without changing ` +
					"number.** Roswaal recognises an old file by what is in it, not by its version: " +
					"a renamed node by its old id, an old field by its presence. Until 1.0, an " +
					"implementation reading Roswaal's files has to do the same. From 1.0 a change of " +
					"shape will change the number (§14.1).",
			},

			// 9.8 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "9.8 Writing a file" },
			{
				t: "p",
				text:
					"So that a graph saved twice is the same bytes, and a change to a graph is a small " +
					"change to its file, a writer **SHOULD** write the canonical form: two-space " +
					"indentation and a final newline; keys in the order this chapter lists them; " +
					"nodes, links and comments sorted by id; the keys inside `literals` and `config` " +
					"sorted; positions rounded to two decimal places; and optional fields left out " +
					"when empty. Variables and modules keep the order the author gave them.",
			},
			{
				t: "code",
				lang: "json",
				text: code`
					{
					  "schemaVersion": 1,
					  "kind": "script",
					  "id": "demo-count-characters",
					  "name": "count-characters",
					  "scriptClass": "ModuleScript",
					  "target": "lune",
					  "typecheck": "strict",
					  "variables": [],
					  "modules": [{ "id": "m_fs", "name": "fs", "specifier": "@lune/fs" }],
					  "nodes": [
					    { "id": "n0", "def": "script.begin", "x": 0, "y": 0 },
					    {
					      "id": "n1",
					      "def": "lune.value",
					      "x": 4,
					      "y": 105,
					      "literals": { "a0": { "t": "string", "v": "README.md" } },
					      "config": { "call": "readFile", "module": "fs" }
					    }
					  ],
					  "links": [],
					  "comments": []
					}
					`,
			},
			{
				t: "p",
				text:
					"The start of `examples/lune-demo/.roswaal/scripts/count-characters.nodescript`, " +
					"shortened to its first two nodes and without its wires, with short objects drawn " +
					"on one line.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"**To come: JSON Schemas.** Draft 0.1 defines the format in these tables. A JSON " +
					"Schema for each file, generated from Roswaal's types, is part of the plan for " +
					"the first published draft (§14).",
			},
		],
	};
}
