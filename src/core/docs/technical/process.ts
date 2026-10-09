/**
 * Chapters 13 and 14 of the technical specification: how an implementation
 * shows it conforms, and how the specification changes.
 */

import { code } from "../pages/blocks.js";
import type { DocPage } from "../site.js";
import { informative, normative, req, SPEC_DRAFT } from "./spec.js";

export function conformancePage(): DocPage {
	return {
		slug: "technical/conformance",
		title: "13 Conformance",
		summary:
			"How an implementation shows it follows the specification: fixtures for each level and profile, and a checker to run them.",
		spec: normative(),
		blocks: [
			{
				t: "note",
				kind: "warn",
				label: "Planned, not yet released",
				text:
					`Draft ${SPEC_DRAFT} defines the levels (§1.3) but ` +
					"publishes no fixtures and no checker. Until it does, an implementation can only " +
					"claim to follow the text. This chapter says what is coming, so it can be argued " +
					"with before it is built.",
			},

			{ t: "h", level: 2, text: "13.1 Levels and fixtures" },
			{
				t: "p",
				text:
					"Each level of §1.3 is checked against **fixtures**: small inputs with the output " +
					"a conforming implementation gives for them. An implementation conforms at a " +
					"level when it gives that output for every fixture of the level.",
			},
			{
				t: "table",
				head: ["Level", "A fixture is", "Passes when"],
				rows: [
					[
						"1 · Format",
						"A graph file, and what reading it gives.",
						"Reading, then writing, gives the canonical file (§9.8); an old file reads as its migrated form (§9.7); a file from a newer version is refused.",
					],
					[
						"2 · Compile",
						"A graph, and its problems or its program's behaviour.",
						"The same problems are reported on the same nodes and pins, and the program does what the fixture says, by running it where the profile can be run.",
					],
					[
						"3 · Render",
						"A graph, and every node's box and every pin's centre.",
						"Each box and centre is within half a unit of the fixture's (§5.2).",
					],
					[
						"4 · Interact",
						"A graph, a sequence of actions, and the graph after them.",
						"The graph after is the same, and so is the number of undo steps (§4.9).",
					],
				],
			},
			{
				t: "p",
				text:
					"Rendering is checked by geometry rather than by pictures, so that fonts, " +
					"antialiasing and themes do not decide whether an implementation conforms.",
			},

			{ t: "h", level: 2, text: "13.2 Per-profile fixtures" },
			{
				t: "p",
				text:
					"Levels 1, 3 and 4 hold in every profile, so their fixtures are written once, " +
					"with a small library of nodes of their own. Level 2's are per profile:",
			},
			{
				t: "code",
				lang: "sh",
				text: code`
					fixtures/
					  format/            level 1
					  render/            level 3
					  interact/          level 4
					  compile/
					    roblox/          level 2, Luau for Roblox
					    lune/            level 2, Luau for Lune
					`,
			},

			{ t: "h", level: 2, text: "13.3 The checker" },
			{
				t: "p",
				text:
					"A command that runs the fixtures against an implementation and reports, per " +
					"level and profile, which pass. Roswaal's will be `roswaal conform`; an " +
					"implementation is driven through a small adapter that reads a graph and answers " +
					"for it, so the checker does not need to know how it is built.",
			},
		],
	};
}

export function processPage(): DocPage {
	return {
		slug: "technical/process",
		title: "14 Process",
		summary:
			"What each version of the specification promises, how a change is proposed, registering a profile, and the changelog.",
		spec: informative(),
		blocks: [
			{ t: "h", level: 2, text: "14.1 Versions and what they promise" },
			{
				t: "table",
				head: ["Version", "Promises"],
				rows: [
					[
						"**Draft 0.x**",
						"Nothing. Anything can change between drafts. Implementations may follow along.",
					],
					[
						"**1.0**",
						"Every 1.x editor reads every 1.x file. A graph saved by 1.0 opens unchanged in 1.9.",
					],
					[
						"**1.x**",
						"Adds and never removes: fields an older reader can keep without knowing, kinds of node an older renderer can draw as a plain card.",
					],
					["**2.0**", "May change what exists, and comes with a migration from 1.x files (§9.7)."],
				],
			},
			{
				t: "p",
				text:
					"The specification's version is not Roswaal's. A Roswaal release says which " +
					`draft it implements; this is Draft ${SPEC_DRAFT}, first carried by Roswaal 0.162. ` +
					"Each draft is published at an address of its own on spec.roswaal.app, kept as it " +
					"was published once a newer draft replaces it.",
			},
			{ t: "h", level: 3, text: "The road to 1.0" },
			{
				t: "ol",
				items: [
					"Write Part I against the editor as it is, and keep it in step as the editor changes. This draft.",
					"Split what is Luau's and Roblox's out of Roswaal's core into the profile, so Part I's generated tables are the language-neutral ones and Part II's the profile's.",
					"Publish a JSON Schema for each file (§9), and the fixtures and checker (§13).",
					"Build a second, small implementation, a viewer, from the specification alone. Whatever it has to read Roswaal's source to get right is a gap in the text.",
					"A candidate, then 1.0: the file format and the visual grammar freeze, and from then on a change is a proposal.",
				],
			},

			{ t: "h", level: 2, text: "14.2 Proposing a change" },
			{
				t: "p",
				text:
					"Until 1.0, through an issue on Roswaal's repository, linked from the **Suggest " +
					"an edit** button at the top of every page. From 1.0, in four stages, the same " +
					"shape as Luau's own RFCs:",
			},
			{
				t: "table",
				head: ["Stage", "What"],
				rows: [
					[
						"**Proposal**",
						"An issue in a fixed form: the problem, the change, and what it breaks.",
					],
					[
						"**Draft**",
						"The changed pages and fixtures, as a pull request. Roswaal may ship it behind a setting.",
					],
					["**Accepted**", "Merged into the next minor version's draft, with its changelog entry."],
					["**Released**", "In a numbered version, its fixtures part of conformance from then on."],
				],
			},

			{ t: "h", level: 2, text: "14.3 Registering a profile" },
			req(
				"14.3-R1",
				"meets",
				"A profile's id is what a graph file says it is for (§9.1), so two profiles **MUST NOT** share one.",
			),
			{
				t: "p",
				text:
					"Until there is a registry, `roblox` and `lune` are taken, and a new profile is " +
					"registered by proposing it (§14.2).",
			},

			{ t: "h", level: 2, text: "14.4 Changelog" },
			{
				t: "p",
				text:
					"Changes to the specification are listed in Roswaal's [release notes](release-notes) " +
					"until it has a changelog of its own.",
			},
		],
	};
}
