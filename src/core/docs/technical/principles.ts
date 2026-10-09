/**
 * Chapter 2 of the technical specification: the ten principles every other
 * rule follows from, and which every profile has to keep.
 */

import type { DocPage } from "../site.js";
import { normative, req } from "./spec.js";

interface Principle {
	title: string;
	why: string;
	roswaal: string;
	mustNot: string;
}

const PRINCIPLES: Principle[] = [
	{
		title: "Order is visible",
		why: "What runs, and in what order, is read from the flow wires: along the headers, one wire per step. No step runs that a flow wire does not reach.",
		roswaal:
			"Flow triangles hung outside the node, the flow in and on along the header (§5.5), and flow wires as the only order (§7.1).",
		mustNot: "run a node because of where it sits, or reorder steps behind the reader.",
	},
	{
		title: "Values have no order",
		why: "A value node is worked out where it is used and only there. It has no flow pins and no place in time, so it can be read on its own.",
		roswaal:
			"Value nodes are rounder and have no header bar (§5.3); a value used twice in a block is worked out once (§7.2).",
		mustNot: "give a value node an effect a reader cannot see from its name.",
	},
	{
		title: "A pin says what it is without colour",
		why: "Its name, its family's shape, and its type in words where the name does not already say it. Colour adds to that and never carries it alone.",
		roswaal:
			"Five pin shapes, type chips under the rule that a type is never said twice, and the type's card on request (§5.5).",
		mustNot: "introduce a type that falls outside every family (§6.2).",
	},
	{
		title: "A node at rest shows only what it says",
		why: "Controls appear when they are reached for: on hover, on selection, from the keyboard. A graph read at a glance is a graph of names and wires.",
		roswaal:
			"Adding and removing pins on hover or selection (§4.5); the category as a small corner tab (§5.4).",
		mustNot: "add chrome to a node that is always shown.",
	},
	{
		title: "A problem is said where it is, and seen first",
		why: "An error or warning is written in words beside the node it belongs to, and drawn above everything in the graph. Only the panels around the canvas may cover it.",
		roswaal: "The note under the node, the pin at fault marked, and a layer of its own (§5.8).",
		mustNot: "report a problem only in a list, away from the graph.",
	},
	{
		title: "One set of numbers",
		why: "Where things are is computed from fixed numbers, never measured from text, so a graph is drawn the same by every implementation, in every font and at every zoom.",
		roswaal:
			"One table of geometry, used by the canvas, the wire router and the documentation's pictures alike (§5.2).",
		mustNot: "change a node's geometry. It may add kinds of node that follow it.",
	},
	{
		title: "Familiar, never surprising",
		why: "Someone who knows another node graph editor reads a graph without being taught: wires, pins by type, steps in a chain, values feeding them. Where this design differs, it differs on purpose and says why.",
		roswaal:
			"Flow triangles hung outside the node and data sockets on its border, as other editors draw them, and a guide that maps one editor's terms onto these (§2.3).",
		mustNot: "rename a core idea after its own language's jargon in Part I's places.",
	},
	{
		title: "What you see is what compiles",
		why: "A graph file is plain data, and every node compiles from what is on it, its settings and the project's settings file. Nothing else changes the program.",
		roswaal:
			"JSON graphs (§9), packs that are data and never run, and a compile that reads only the project's own files.",
		mustNot: "read anything a graph does not show or a project's files do not hold.",
	},
	{
		title: "Every hand, every screen",
		why: "A mouse, a keyboard, a finger and a screen reader can each do everything; a phone and a projector can each show the graph.",
		roswaal:
			"Touch gestures for every action and themes built from tokens (§4.8, §5.7). Not yet: the keyboard and screen readers on the canvas (§8.4).",
		mustNot: "add a node that only a mouse can use.",
	},
	{
		title: "The output is the language's own",
		why: "What a graph compiles to reads as code a person in that language would write: named after the graph, laid out by the language's own tools, needing nothing of the implementation's to run.",
		roswaal:
			"Plain Luau, formatted by StyLua where the project has it, with no library of Roswaal's to ship beside it.",
		mustNot:
			"make its output depend on a runtime library of the implementation's, unless the language offers no other way.",
	},
];

export function principlesPage(): DocPage {
	return {
		slug: "technical/principles",
		title: "2 Principles",
		summary:
			"The ten principles every rule in the specification follows from, which every profile has to keep.",
		spec: normative(),
		blocks: [
			{ t: "h", level: 2, text: "2.1 The ten principles" },
			{
				t: "p",
				text: "Every rule in this specification follows from one of these.",
			},
			req(
				"2.1-R1",
				"partly",
				"A profile **MUST** keep all ten. Where a language seems to need an exception, the exception is a proposal to change this page (§14.2), not a choice a profile makes quietly.",
				"Roswaal's two Luau profiles do not yet keep principle 9 on the canvas (§8.4), and a graph with more than one script start runs them by position (§7.1), which principle 1 rules out.",
			),
			...PRINCIPLES.flatMap((p, i) => [
				{ t: "h" as const, level: 3 as const, text: `${i + 1}. ${p.title}` },
				{ t: "p" as const, text: p.why },
				{
					t: "compare" as const,
					items: [
						{ label: "In Roswaal", text: p.roswaal },
						{ label: "A profile must not", text: p.mustNot, tone: "warn" as const },
					],
				},
			]),
			{ t: "h", level: 2, text: "2.2 Where they come from" },
			{ t: "note", kind: "info", text: "This section is informative." },
			{
				t: "p",
				text:
					"Principles 1, 2 and 7 are the node graph editors people already use: the line " +
					"they all draw between steps and values, and the shapes they draw them in. " +
					"Principles 3, 4 and 5 were settled in Roswaal 0.161, when the " +
					"node was redrawn to be read rather than recognised: shapes and words beside " +
					"colour, controls that wait to be reached for, and problems that cannot be " +
					"covered. Principle 6 is older: one table of numbers, shared by the canvas and " +
					"the documentation's pictures, so neither can drift from the other. Principles 8 " +
					"and 10 are how Roswaal has worked from the start: a node pack is data that is " +
					"read and never run, and the Luau it writes is meant to be read and kept by " +
					"people who never open the graph. Principle 9 is the one Roswaal keeps least so " +
					"far.",
			},

			{ t: "h", level: 2, text: "2.3 Familiar from other editors" },
			{ t: "note", kind: "info", text: "This section is informative." },
			{
				t: "p",
				text:
					"[Coming from Blueprints](coming-from-blueprints) maps one widely used editor's " +
					"terms onto these, one by one. In short: flow pins are what node graph editors " +
					"call execution or flow pins, and are drawn as a flow socket usually is; a value " +
					"node is what they call pure; a reroute knot is everyone's reroute; and the type " +
					"colours keep to the usual ones where the types line up, so a boolean is red and a " +
					"number green.",
			},
		],
	};
}
