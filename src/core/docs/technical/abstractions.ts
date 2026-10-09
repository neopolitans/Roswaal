/**
 * Chapter 3 of the technical specification: the things a graph is made of,
 * defined once, so every other chapter can use the words without explaining
 * them again.
 */

import type { DocPage } from "../site.js";
import { normative } from "./spec.js";

export function abstractionsPage(): DocPage {
	return {
		slug: "technical/abstractions",
		title: "3 Abstractions",
		summary:
			"The things a graph is made of, defined once: graphs, nodes, pins, links, steps and values, scope, functions, events, modules, comments and knots.",
		spec: normative(),
		blocks: [
			{
				t: "p",
				text:
					"Each term is defined here and used with this meaning everywhere else. A profile " +
					"**MAY** call a thing by its language's name in its own chapters and on screen, as " +
					"long as it means the same thing.",
			},

			{ t: "h", level: 2, text: "3.1 Graph and document" },
			{
				t: "ul",
				items: [
					"A **graph** is a set of nodes and the links between them, drawn on one canvas.",
					"A **document** is what is stored in one file (§9.1): one script's main graph, the graph of every function declared in it, its variables and modules, and its comments. It becomes one program.",
					"A **project** is a folder of documents that are compiled together, with its settings (§9.6).",
				],
			},

			{ t: "h", level: 2, text: "3.2 Node and node definition" },
			{
				t: "ul",
				items: [
					"A **node definition** says what a kind of node is: its title, category, pins, settings, and what it compiles to. Definitions come from the profile's built-in library and from **packs**, files of definitions a project adds.",
					"A **node** is one use of a definition in a graph: where it is, the values typed into it, and its settings.",
					"A pack's definition with the same id as an earlier one replaces it.",
				],
			},

			{ t: "h", level: 2, text: "3.3 Pin: flow and data" },
			{
				t: "ul",
				items: [
					"A **pin** is where a link attaches to a node. It is an **input** or an **output**, and a **flow** pin or a **data** pin.",
					"A flow pin carries the order things happen in (§7.1). A data pin carries a value, and has a type (§6.1).",
					"An input with no link **MAY** hold a value typed in. Some inputs only take a typed value, because it becomes part of the program's text, such as a name; they take no link.",
					"An input may be **required**, which a compiler insists on, or **optional**, which may be left out of a call altogether.",
				],
			},

			{ t: "h", level: 2, text: "3.4 Link" },
			{
				t: "p",
				text:
					"A **link**, drawn as a **wire**, joins one output to one input of the same kind " +
					"(§6.3). An input takes one link. A data output may lead to any number; a flow " +
					"output to one (§7.1).",
			},

			{ t: "h", level: 2, text: "3.5 Step and value" },
			{
				t: "ul",
				items: [
					"A **step** has flow pins: it runs when the flow reaches it, once each time, and may change things.",
					"A **value** node, also called pure, has no flow pins: it is worked out where it is used (§7.2), and changes nothing a reader cannot see from its name.",
					"Every node is one or the other, and is drawn so the difference shows (§5.3).",
					"A step that starts a flow is an **entry**; one after which nothing in its chain can run, such as a return, is **terminal**.",
				],
			},

			{ t: "h", level: 2, text: "3.6 Scope, variable, local" },
			{
				t: "ul",
				items: [
					"A **variable** belongs to the document. It is declared in the file (§9.3), not by a node, and exists for the whole program.",
					"A **local** is declared by a step and exists from there, in that block (§7.4).",
					"A **block** is a run of steps that a step opens: a branch's arms, a loop's body, a function's or a handler's body.",
					"A **scope** is what can be read at a point in a flow: the variables, and the locals, parameters and step outputs of the blocks it is in.",
				],
			},

			{ t: "h", level: 2, text: "3.7 Function, event, module" },
			{
				t: "ul",
				items: [
					"A **function** is a body that runs when called, with parameters and results. It is drawn in a graph of its own. It is **hoisted**, existing before any flow runs, or **declared** by a step in a flow (§7.5).",
					"An **event** is something that happens while the program runs, such as a player joining. A **handler** is a step that connects a body to an event (§7.6).",
					"A **module** is another program this one uses, named in the document's list of modules (§9.3). A document can itself be a module, giving others its exports.",
				],
			},

			{ t: "h", level: 2, text: "3.8 Comment and reroute" },
			{
				t: "ul",
				items: [
					"A **comment** is a titled box on the canvas. It holds whatever lies inside it, groups it and moves with it, and has no meaning to the program.",
					"A **reroute knot** is a point a wire passes through, to route it around other nodes. It has one input and one output of the wire's kind, takes the type of what feeds it, and has no meaning to the program: a wire through knots means exactly what the wire without them would.",
				],
			},
		],
	};
}
