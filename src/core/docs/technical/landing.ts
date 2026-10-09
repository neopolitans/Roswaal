/**
 * The front page of the technical specification: what it is, how far along,
 * and its three parts.
 */

import type { DocPage } from "../site.js";
import { informative, SPEC_DRAFT } from "./spec.js";

export function technicalPage(): DocPage {
	return {
		slug: "technical",
		title: "Technical specification",
		summary: `Roswaal's design as an open standard for visual scripting: the principles first, then each language's profile. Draft ${SPEC_DRAFT}.`,
		blurb:
			"How a Roswaal graph looks, reads, is wired, stored and run, written so another editor, for Luau or any other language, can implement it.",
		spec: informative(),
		blocks: [
			{
				t: "p",
				text:
					"This is Roswaal's design written down as a specification: what a graph is, how it " +
					"is drawn and used, what it means when it runs, and how it is stored, in words " +
					"another implementation can be held to. Roswaal is the reference implementation, " +
					"and the specification describes it as it is. Where the two disagree, that is a bug " +
					"in one of them, and which one is a question for [the process](technical/process).",
			},
			{
				t: "note",
				kind: "warn",
				text:
					`**This is Draft ${SPEC_DRAFT}.** Anything here can still change, and nothing is promised ` +
					"until version 1.0. It is published so it can be read and argued with while the " +
					"design settles, not so it can be built against as though it were fixed.",
			},

			{ t: "h", level: 2, text: "Three parts" },
			{
				t: "table",
				head: ["Part", "What it covers", "Chapters"],
				rows: [
					[
						"**I · Principles**",
						"Everything that is the same in every language: the principles, the abstractions, how a graph is used, how it is drawn, its types, what it means when it runs, and its file format.",
						"[1 Overview](technical/overview) · [2 Principles](technical/principles) · [3 Abstractions](technical/abstractions) · [4 Interaction](technical/interaction) · [5 Visual grammar](technical/visual-grammar) · [6 Types](technical/types) · [7 Execution](technical/execution) · [8 Accessibility](technical/accessibility) · [9 File format](technical/file-format)",
					],
					[
						"**II · Profiles**",
						"What one language adds: its types, its library of nodes, and what each node compiles to.",
						"[10 Writing a profile](technical/writing-a-profile) · [11 Luau for Roblox](technical/luau-for-roblox) · [12 Luau for Lune](technical/luau-for-lune)",
					],
					[
						"**III · Conformance and process**",
						"How an implementation shows it follows the specification, and how the specification changes.",
						"[13 Conformance](technical/conformance) · [14 Process](technical/process)",
					],
				],
			},
			{
				t: "p",
				text:
					"Part I never depends on a language. Where it needs an example, the example is " +
					"Luau's and is marked as coming from the Luau profiles. A new language starts at " +
					"[Writing a profile](technical/writing-a-profile), and reads Part I first: the " +
					"principles are what a profile has to keep.",
			},

			{ t: "h", level: 2, text: "Reading a page" },
			{
				t: "ul",
				items: [
					"**Normative** pages say what an implementation must do. **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** mean what [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) say, and only when written in capitals.",
					"**Informative** pages explain, give reasons and examples, and require nothing.",
					"A table that says it is **generated** is built from Roswaal's own source each time these pages are, so it cannot drift from the editor. The file it comes from is named beside it.",
					"Sections are numbered, and a number is how one part of the specification refers to another: §5.8 is section 8 of chapter 5.",
				],
			},

			{ t: "h", level: 2, text: "Versions" },
			{
				t: "p",
				text:
					"The specification has a version of its own, separate from Roswaal's. Draft " +
					`${SPEC_DRAFT} describes Roswaal 0.162, the first release to carry it; how a node is ` +
					"drawn settled the release before. " +
					"[Process](technical/process) says what each version will promise once there is a 1.0.",
			},

			{ t: "h", level: 2, text: "Where it is published" },
			{
				t: "p",
				text:
					"At [spec.roswaal.app](https://spec.roswaal.app/), a site of its own that loads " +
					"nothing of the editor's, and here in Roswaal's documentation, offline in the Docs " +
					"panel. Both are built from the same pages. On the site, the latest draft is at the " +
					`root and each draft also keeps an address of its own, such as spec.roswaal.app/${SPEC_DRAFT}/, ` +
					"which does not change once a newer draft is the latest: cite that one.",
			},
		],
	};
}
