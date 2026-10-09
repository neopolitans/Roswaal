/**
 * Chapter 10 of the technical specification: what adding a language takes.
 */

import type { DocPage } from "../site.js";
import { normative, req } from "./spec.js";

export function writingAProfilePage(): DocPage {
	return {
		slug: "technical/writing-a-profile",
		title: "10 Writing a profile",
		summary:
			"What a profile defines for a new language, what it must leave alone, and how it shows it works.",
		spec: normative("Level 2"),
		blocks: [
			{
				t: "p",
				text:
					"A **profile** is everything Part I leaves to a language: its types, what it calls " +
					"things, and what each node becomes. How a graph looks, reads, is wired and is " +
					"stored comes from Part I and is the same in every language. Read Part I first: " +
					"its principles (§2) are what a profile has to keep.",
			},

			{ t: "h", level: 2, text: "10.1 What a profile defines" },
			{
				t: "table",
				head: ["A profile defines", "In Luau for Roblox (§11)"],
				rows: [
					["**Its id**, the value of a graph's `target` (§9.1).", "`roblox`"],
					[
						"**Its types**, and a **family** for each (§6.2).",
						"Luau's types, Roblox's datatypes and every engine class. Classes are objects, `RBXScriptSignal` a signal, `table` a table, `function` a function, the rest values.",
					],
					[
						"**Its conversions** (§6.3): only those the language makes without being asked.",
						"`number` and `string`, both ways.",
					],
					[
						"**Its hierarchy**, if its types have subtypes (§10.3).",
						"Roblox's class tree: a `Part` is a `BasePart` is an `Instance`.",
					],
					[
						"**Its built-in library**: node definitions, as data (§10.4).",
						"Flow, Events, Variables, Values, Math and the rest (§11.5).",
					],
					[
						"**What each node becomes** (§10.5).",
						"A template per node: an expression for a value, a statement or a call for a step.",
					],
					[
						"**Its categories**, each with a colour and a glyph (§5.4), and **its type colours**.",
						"§11.5.",
					],
					[
						"**Its fields** in the graph file and the node map (§9), named so they cannot be mistaken for Part I's.",
						"`scriptClass`, `runContext`, `typecheck`, `services`.",
					],
					[
						"**The file it writes** (§10.6).",
						"A `.luau` file per graph, named for what it becomes in Studio.",
					],
					[
						"**How its source code gives pins types** (§6.4).",
						"Luau annotations; Moonwave and comment tags, proposed (§11.9).",
					],
					["**Its fixtures** (§10.7).", "Not yet published."],
				],
			},

			{ t: "h", level: 2, text: "10.2 What it must not change" },
			{
				t: "ul",
				items: [
					"The ten principles (§2.1).",
					"The abstractions and what they mean (§3), the interactions (§4), and where problems show (§4.6, §5.8).",
					"Geometry, node shapes, pin shapes, layering and the theme roles (§5).",
					"The connection rule and the five families (§6.2, §6.3). A profile adds conversions and a hierarchy to the rule; it does not change the rule.",
					"When things run, and in what order (§7).",
					"Accessibility (§8).",
					"The core fields of the file format (§9).",
				],
			},
			{
				t: "p",
				text:
					"A profile **MAY** add kinds of node, fields in a pack and fields in a file, under " +
					"names of its own. A language that cannot keep one of these, one with no order of " +
					"steps, say, needs a proposal to Part I (§14.2) before it needs a profile.",
			},
			req("10.2-R1", "meets", "A profile **MUST NOT** change the meaning of anything in Part I."),

			{ t: "h", level: 2, text: "10.3 Types and the hierarchy" },
			req(
				"10.3-R1",
				"meets",
				"Every type a pin can have **MUST** have a name, a family, and a colour or the profile's colour for untyped pins.",
			),
			req(
				"10.3-R2",
				"meets",
				"Where the language has subtypes, the profile gives each type its parent. A type **MUST NOT** be its own ancestor, and a reader **SHOULD** stop following parents after a fixed number of steps rather than trust the data.",
			),
			{
				t: "p",
				text: "The profile says how each of its language's type annotations becomes a pin type, including which become `any` because no pin type can express them.",
			},

			{ t: "h", level: 2, text: "10.4 The built-in library" },
			req(
				"10.4-R1",
				"meets",
				"Node definitions **MUST** be data. A profile's library, and every pack written for it, **MUST** load without running any code from it.",
			),
			req(
				"10.4-R2",
				"meets",
				"Each definition has an id, a title, a category, its pins, and what it becomes (§10.5). Its id is how files refer to it (§9.2), so it **MUST NOT** change; a renamed node keeps its old id as an alias (§9.7).",
			),
			{
				t: "p",
				text: "A definition says whether it is a step or a value, whether it is latent (§7.3), and which of the profile's runtimes it works in, where the profile has more than one.",
			},

			{ t: "h", level: 2, text: "10.5 Compiling a node" },
			{
				t: "p",
				text: "What a node becomes is one of four kinds:",
			},
			{
				t: "table",
				head: ["Kind", "For", "Is"],
				rows: [
					["`expr`", "A value", "An expression per output, in which the inputs are substituted."],
					[
						"`call`",
						"A step with one result",
						"An expression whose result is kept if anything reads it.",
					],
					["`statement`", "A step", "A statement; its outputs are declared before it."],
					[
						"`builtin`",
						"Control flow",
						"Written by the compiler itself, because it opens blocks: branches, loops, function and handler bodies.",
					],
				],
			},
			req(
				"10.5-R1",
				"meets",
				"A pack **MUST NOT** use `builtin`: a definition a pack brings compiles from a template.",
			),
			{
				t: "p",
				text:
					"In the Luau profiles a template refers to an input as `$in.<pin>`, to the same " +
					"input's typed value as a name or as source with `$in.<pin>!ident` and " +
					"`$in.<pin>!raw`, and to an output's local as `$out.<pin>`. Another profile " +
					"**MAY** use another syntax for its templates; what they mean is §7's.",
			},

			{ t: "h", level: 2, text: "10.6 The emitted file" },
			{ t: "p", text: "One graph file becomes one program file, named after the graph." },
			req(
				"10.6-R1",
				"meets",
				"The file **SHOULD** begin by saying it was generated, from which graph file, and that it is edited by editing the graph.",
			),
			req(
				"10.6-R2",
				"meets",
				"It **SHOULD** carry the graph's id and a hash of the graph and of its own text, so an implementation can tell a file it wrote from one edited by hand.",
			),
			req(
				"10.6-R3",
				"meets",
				"It **SHOULD** be laid out by the language's usual formatter, where the project has one.",
			),
			req(
				"10.6-R4",
				"meets",
				"It **MUST NOT** need a library of the implementation's to run (§2.1, principle 10).",
			),

			{ t: "h", level: 2, text: "10.7 Fixtures for a new profile" },
			req(
				"10.7-R1",
				"not-yet",
				"A profile **MUST** come with fixtures: graphs, and the programs they should compile to or what those programs should do when run.",
				"Roswaal's two profiles have tests of their own, but no fixtures published in the shape §13 describes.",
			),
			{ t: "p", text: "[Conformance](technical/conformance) describes the layout." },

			{ t: "h", level: 2, text: "10.8 Checklist" },
			{ t: "note", kind: "info", text: "This section is informative." },
			{
				t: "ol",
				items: [
					"Choose an id, and check it is not taken (§14.3).",
					"List the types; give each a family and a colour; write down the conversions and the hierarchy.",
					"Write the library as data, a category, colour and glyph per group.",
					"Write each node's template, and the builtins for control flow.",
					"Decide the fields your profile adds to a file, and their defaults.",
					"Write the fixtures, and run them.",
					"Read §2.1 again, and check each principle still holds.",
				],
			},
		],
	};
}
