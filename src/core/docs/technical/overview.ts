/**
 * Chapter 1 of the technical specification: what it covers, how its parts fit,
 * the levels an implementation can conform at, and its notation.
 */

import type { DocPage } from "../site.js";
import { normative, req } from "./spec.js";

export function overviewPage(): DocPage {
	return {
		slug: "technical/overview",
		title: "1 Overview",
		summary:
			"What the specification covers, how its parts fit, and the levels an implementation conforms at.",
		spec: normative(),
		blocks: [
			{ t: "h", level: 2, text: "1.1 Scope and goals" },
			{
				t: "note",
				kind: "info",
				text: "This section is informative.",
			},
			{
				t: "p",
				text:
					"The specification describes a way of writing programs as graphs: steps joined by " +
					"wires that say what happens in what order, and values joined by wires that say " +
					"where each comes from. It covers what such a graph is made of, how it is drawn and " +
					"used, what it means when it runs, and how it is stored. It does not cover an " +
					"editor's panels, menus or settings, except where they show the graph.",
			},
			{
				t: "p",
				text: "It has three goals, in order:",
			},
			{
				t: "ol",
				items: [
					"**A graph reads the same everywhere.** Somebody who can read a graph in one conforming editor can read it in another, in any language the editor supports.",
					"**A graph means the same everywhere.** Two conforming implementations given the same graph produce programs that do the same thing.",
					"**A new language costs a profile, not a new design.** Everything about how graphs look and are used is fixed once, in Part I, and a language adds only what is its own.",
				],
			},
			{
				t: "p",
				text:
					"It is written for people building an editor, a viewer, a compiler or a converter " +
					"for these graphs, and for people adding a language to one.",
			},

			{ t: "h", level: 2, text: "1.2 How the parts fit" },
			{
				t: "note",
				kind: "info",
				text: "This section is informative.",
			},
			{
				t: "p",
				text:
					"**Part I** is language-neutral. It names no language's types, functions or " +
					"syntax, except in examples marked as a profile's. **Part II** has one chapter per " +
					"profile: a profile is the set of types, nodes and compiled forms that makes the " +
					"graphs of Part I into programs in one language. **Part III** says how to show that " +
					"an implementation conforms, and how the specification itself changes.",
			},
			{
				t: "p",
				text:
					"An implementation supports one or more profiles, and a graph says which profile " +
					"it was written for (§9.1).",
			},
			req(
				"1.2-R1",
				"not-yet",
				"An implementation given a graph for a profile it does not support **MUST** say so, rather than open the graph as though it belonged to another.",
				"Roswaal reads a graph whose `target` it does not know as a Roblox graph.",
			),

			{ t: "h", level: 2, text: "1.3 Conformance levels" },
			{
				t: "p",
				text:
					"An implementation conforms at one or more of four levels. Each level names the " +
					"chapters it is held to. Compile includes Format, and Interact includes Render, but " +
					"the two pairs are independent: a compiler can conform without drawing anything, " +
					"and a viewer without compiling.",
			},
			{
				t: "table",
				head: ["Level", "For", "Held to"],
				rows: [
					[
						"**1 · Format**",
						"Anything that reads or writes graph files: an editor, a converter, a linter.",
						"[9 File format](technical/file-format), and the abstractions of [3](technical/abstractions) it stores.",
					],
					[
						"**2 · Compile**",
						"Anything that turns a graph into a program, in a given profile.",
						"Level 1, [6 Types](technical/types), [7 Execution](technical/execution), and the profile's compiled forms.",
					],
					[
						"**3 · Render**",
						"Anything that draws a graph: an editor, a viewer, documentation.",
						"[5 Visual grammar](technical/visual-grammar) and [8 Accessibility](technical/accessibility) §8.1–8.2.",
					],
					[
						"**4 · Interact**",
						"Anything that lets a person edit a graph.",
						"Level 3, [4 Interaction](technical/interaction), and the rest of [8 Accessibility](technical/accessibility).",
					],
				],
			},
			req(
				"1.3-R1",
				"not-yet",
				"An implementation **MUST** state which levels and which profiles it conforms to, and which draft of the specification.",
				"Roswaal does not say yet. It will once there are fixtures to check a claim against (§13).",
			),
			{
				t: "p",
				text: "[Conformance](technical/conformance) describes the fixtures each level is checked against.",
			},

			{ t: "h", level: 2, text: "1.4 Notation" },
			{
				t: "p",
				text:
					"The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, " +
					"**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY** and " +
					"**OPTIONAL** are to be interpreted as described in BCP 14 " +
					"([RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and " +
					"[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)) when, and only when, they " +
					"appear in all capitals, as shown here.",
			},
			{
				t: "ul",
				items: [
					"Lengths are in **canvas units**: one unit is one CSS pixel at 100% zoom. An implementation that draws at another scale scales every length together.",
					"`code` names a field, a value or a token exactly as it is written in a file or a program.",
					"A section marked **informative** inside a normative page binds nothing; neither do examples, notes and figures anywhere.",
					"A table marked **generated** is built from the reference implementation's source, which is named beside it. Its values are normative unless the page says otherwise.",
				],
			},
		],
	};
}
