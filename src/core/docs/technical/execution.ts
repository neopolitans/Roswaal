/**
 * Chapter 7 of the technical specification: what a graph means when it runs.
 *
 * Written from the compiler (`src/core/compiler`), language-neutrally: the
 * Luau a node becomes is the profile's (§11.6), and what that Luau does is what
 * this chapter says it must.
 */

import type { DocPage } from "../site.js";
import { normative, req } from "./spec.js";

export function executionPage(): DocPage {
	return {
		slug: "technical/execution",
		title: "7 Execution",
		summary:
			"What a graph means when it runs: which steps run and in what order, when values are worked out, scope, functions and events.",
		spec: normative("Level 2"),
		blocks: [
			{
				t: "p",
				text:
					"A compiler conforming at level 2 (§1.3) turns a graph into a program that behaves " +
					"as this chapter says. It says nothing about the program's text: two compilers " +
					"may write different code for one graph, as long as both programs do what the " +
					"graph means.",
			},

			// 7.1 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "7.1 Flow: what runs, in what order" },
			{ t: "h", level: 3, text: "Where a flow starts" },
			{
				t: "ul",
				items: [
					"A flow starts at an **entry**: the script's start, a function's body (§7.5), or an event handler's body (§7.6). Nothing else starts one.",
					"A graph **MAY** have more than one script start. Their flows run one after another, ordered by position, top to bottom, and share one scope.",
					"A graph with nodes and no entry runs nothing.",
				],
			},
			req(
				"7.1-R1",
				"meets",
				"A compiler **SHOULD** warn when a graph has more than one script start.",
			),
			req("7.1-R2", "meets", "A compiler **SHOULD** say so when a graph has nodes and no entry."),
			{ t: "h", level: 3, text: "How it moves" },
			{
				t: "ul",
				items: [
					"A step runs when the flow reaches its flow input, and the flow then leaves by one of its flow outputs. **What runs, and in what order, is decided by flow wires alone**, never by where a node sits.",
					"A step that no flow reaches never runs.",
					"To do several things in turn, a graph uses a sequence node, whose outputs run one after another, top to bottom, in one block (§7.4).",
				],
			},
			req("7.1-R3", "meets", "A flow output **MUST** lead to at most one node."),
			req(
				"7.1-R4",
				"meets",
				"A flow input **MUST** take at most one wire. Two flows cannot join at one node.",
			),
			req(
				"7.1-R5",
				"partly",
				"A compiler **SHOULD** warn about a node that nothing running reaches.",
				"Roswaal follows every wire, not only flow wires, so a step joined to the rest only by data wires is not warned about, though it never runs.",
			),
			req(
				"7.1-R6",
				"meets",
				"Flow wires **MUST NOT** form a loop. Repetition is a loop node's: a compiler **MUST** report a loop of flow wires as an error.",
			),
			{ t: "h", level: 3, text: "Blocks" },
			{
				t: "p",
				text:
					"Some steps run part of the flow as a **block** of their own. Which outputs open a " +
					"block and which carry on afterwards is part of each node's definition:",
			},
			{
				t: "table",
				head: ["Step", "Opens", "Then carries on from"],
				rows: [
					[
						"Branch",
						"A block for true and a block for false. Only false and nothing take the false block.",
						"Nothing: a branch ends its chain. What follows belongs in its arms.",
					],
					[
						"Sequence",
						"Nothing: its outputs run in turn, in the enclosing block.",
						"Each output, in order.",
					],
					[
						"A loop",
						"A block run once for each pass.",
						"Its completed output, after the last pass.",
					],
					[
						"Declare Function",
						"The function's body (§7.5), which runs when the function is called, not here.",
						"Its next output, straight away.",
					],
					[
						"An event handler",
						"The handler's body (§7.6), which runs when the event fires.",
						"Its next output, straight away.",
					],
				],
			},
			req(
				"7.1-R7",
				"meets",
				"A step that ends its block, such as a return, break or continue, **MUST** be the last step of its chain. A compiler **MUST** report a step that could never run after one, such as a sequence output following an output that returned.",
			),
			req(
				"7.1-R8",
				"meets",
				"Break and continue **MUST** be inside a loop's block, and not inside a function nested in it.",
			),

			// 7.2 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "7.2 Values: when worked out" },
			{
				t: "p",
				text:
					"A **value** node (pure: no flow pins) has no place in the order of things. Its " +
					"value is worked out when a step that uses it runs, as part of that step, and not " +
					"where the value node sits.",
			},
			req(
				"7.2-R1",
				"meets",
				"Within one block, a value **MUST** be worked out once however many inputs it feeds, so work and side effects are not repeated. A compiler **MAY** write a value used once directly where it is used.",
			),
			req(
				"7.2-R2",
				"meets",
				"A **variable**'s value is read where it is used, every time, never shared between uses: a set between two reads **MUST** be seen by the second.",
			),
			{
				t: "ul",
				items: [
					"A value used in two different blocks, such as both arms of a branch, is worked out in each; one used inside a loop is worked out on each pass.",
					"A step's own outputs exist from when it runs, inside the block it ran in and the blocks nested in that one. Reading one elsewhere is an error; the graph keeps it in a variable instead.",
					"An input with no wire takes the value typed into it, or its default. A required input with neither is an error, written as which node needs a value on which pin.",
					"The order in which one step's inputs are worked out is not specified, so a graph that depends on it is not portable between implementations.",
				],
			},

			// 7.3 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "7.3 Yielding" },
			{
				t: "p",
				text:
					"A node that can pause the program, waiting for time to pass, an event or another " +
					"machine, is **latent**. A latent step pauses the flow it is in and nothing else.",
			},
			req(
				"7.3-R1",
				"meets",
				"A renderer **MUST** mark a latent node where it can be seen. Roswaal puts an hourglass in its header.",
			),
			{
				t: "note",
				kind: "info",
				label: "Open in Draft 0.1",
				text:
					`The specification does not yet say where a latent node may ` +
					"be used. Roswaal compiles a latent node like any other of its kind and does not " +
					"check, for example, that a value node which waits is used where waiting is allowed.",
			},

			// 7.4 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "7.4 Scope" },
			{
				t: "ul",
				items: [
					"A graph's **variables** exist for the whole program: before any function and any flow runs, each holds its default. Every flow and function can read and set them.",
					"A **local** exists from the step that declares it, in that block and the blocks nested in it, and nowhere else.",
					"Each arm of a branch, each loop body, each handler body and each function body is a block nested in the one it sits in. A sequence's outputs share one block, so a local declared under its first output is seen under its second.",
					"A hoisted function (§7.5) sees the graph's variables and its own parameters and locals, and none of the main flow's locals. A declared function sees everything in scope where it is declared.",
				],
			},
			req(
				"7.4-R1",
				"meets",
				"A compiler **MUST** report a read of a local, a parameter or a step's output outside its scope as an error.",
			),

			// 7.5 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "7.5 Functions and calls" },
			{
				t: "ul",
				items: [
					"A **function** has a body, which is an entry (§7.1), parameters, which are values inside the body, and results.",
					"A **hoisted** function is a node of its own, outside any flow. It exists before any flow runs, so it can be called from anywhere in the graph, including itself and other hoisted functions.",
					"A **declared** function is a step: it comes to exist when the flow reaches it, and can be used only after. Its body sees what is in scope where it is declared.",
					"A **return** step ends the function's body with its results.",
					"A **call** runs a function with arguments and gives its results, as a step or, where the profile allows, as a value.",
				],
			},
			req(
				"7.5-R1",
				"meets",
				"Each function's body is drawn in a graph of its own (§9.2), and a wire **MUST NOT** run between two graphs: a value reaches a function through a parameter, a local or a variable.",
			),

			// 7.6 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "7.6 Events" },
			{
				t: "ul",
				items: [
					"An **event handler** is a step with a body. When the flow reaches it, it connects the body to an event and carries on at once; the body runs each time the event fires, later, as a flow of its own.",
					"The event's arguments are parameters of the body.",
					"A handler **MAY** run its body only the first time the event fires.",
					"A handler gives a **connection**, a value that can stop the body running.",
					"Waiting for an event inside a flow, rather than connecting a body to it, is a latent step (§7.3), not a handler.",
				],
			},

			// 7.7 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "7.7 Problems a compiler reports" },
			req(
				"7.7-R1",
				"meets",
				"A compiler **MUST** report each of these as an error, on the node or wire at fault (§5.8), and **MUST NOT** produce a program from a graph that has one:",
			),
			{
				t: "ul",
				items: [
					"A wire between a flow pin and a data pin.",
					"A node wired to itself.",
					"An input with more than one wire; a flow output with more than one wire.",
					"A loop of flow wires; a loop of data wires among value nodes.",
					"A required input with no value.",
					"A read out of scope (§7.4).",
					"A value node placed in a flow.",
					"A node the implementation does not know.",
					"A node that only works in another profile's programs.",
				],
			},
			req(
				"7.7-R2",
				"meets",
				"A compiler **SHOULD** report these as warnings: a node joined to nothing that runs, a graph with no entry, more than one script start, and a wire between pins whose types do not connect (§6.3).",
			),
		],
	};
}
