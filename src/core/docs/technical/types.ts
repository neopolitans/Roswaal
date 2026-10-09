/**
 * Chapter 6 of the technical specification: pin types, their families, and
 * which pins connect.
 *
 * The connection examples are not written out by hand: each row is the answer
 * the compiler's own `pinsCompatible` gives, worked out as the page is built,
 * so the table and the rule cannot disagree.
 */

import { pinsCompatible } from "../../compiler/validate.js";
import { PAIR } from "../../schema.js";
import { TYPE_FAMILIES, typeFamily } from "../../typeFamily.js";
import type { DocPage } from "../site.js";
import { normative } from "./spec.js";

/** Wires to test the rule with: from, to, and what the example shows. */
const EXAMPLES: [from: string, to: string, shows: string][] = [
	["number", "number", "the same type"],
	["any", "Model", "`any` connects to anything"],
	["Vector3", "any", "and anything to `any`"],
	["number", "string", "a conversion the language makes by itself"],
	["string", "number", "in either direction"],
	["Model", "Instance", "a subtype into its supertype"],
	["Instance", "Model", "but not the other way: a cast narrows it"],
	["boolean", "number", "two unrelated types"],
	[PAIR, PAIR, "a key and value pair, into a pair input"],
	[PAIR, "any", "a pair goes nowhere else, not even `any`"],
];

export function typesPage(): DocPage {
	return {
		slug: "technical/types",
		title: "6 Types",
		summary:
			"What a pin's type is, the five families every type falls into, which pins connect, and where types come from.",
		spec: normative(),
		blocks: [
			// 6.1 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "6.1 Pin types, abstractly" },
			{
				t: "ul",
				items: [
					"A flow pin has no type. A data pin has one, written as a name: the profile's name for it, such as `number` or `Model`.",
					"Two names are the same in every profile: `any`, which holds anything, and `pair`, a key and its value, which exists only to build a dictionary.",
					"Whether a value may be missing is not part of the type. A pin **MAY** be marked as possibly missing, and a renderer **SHOULD** say so where it shows the type (Roswaal writes `Model?`), but it does not change what connects.",
					"A node **MAY** work out a pin's type from its other pins or settings, such as a node that makes an object of a class it is told, whose output is then that class. A reroute knot takes the type of what feeds it.",
					"A node **MAY** let a person choose the type of an input it declares as `any`. The choice narrows what can be wired and typed in; it **MUST NOT** change the program.",
				],
			},

			// 6.2 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "6.2 Families" },
			{
				t: "p",
				text:
					"Every type belongs to exactly one of five **families**, which decide the shape " +
					"its pin is drawn in (§5.5). A profile **MUST** put each of its types in one, and " +
					"**MUST NOT** add a family.",
			},
			{
				t: "table",
				head: ["Family", "Drawn as", "Holds"],
				rows: TYPE_FAMILIES.map((f) => [`\`${f.family}\``, f.shape, f.what]),
			},
			{ t: "p", text: "Generated from `core/typeFamily.ts`." },
			{
				t: "p",
				text:
					"Anything untyped, generic or unknown is a `value`: the circle is the shape that " +
					"claims nothing. Families are for reading. They take no part in what connects.",
			},

			// 6.3 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "6.3 Connecting pins" },
			{
				t: "p",
				text:
					"A wire joins an output to an input of the same kind: flow to flow, data to data. " +
					"Any flow output may lead to any flow input. A data output may lead to a data " +
					"input when the first rule that applies says so:",
			},
			{
				t: "ol",
				items: [
					"If either side is `pair`, they connect only when both are, or when the input is marked as taking pairs.",
					"A pin with no type counts as `any`.",
					"The same type connects.",
					"`any` connects in either direction.",
					"Two types connect where the profile says the language converts one into the other by itself. In the Luau profiles: `number` and `string`, both ways.",
					"A subtype connects into its supertype, by the profile's hierarchy (§10.3). The other way does not: narrowing needs a cast, which is a node of its own.",
					"Nothing else connects.",
				],
			},
			{
				t: "table",
				head: ["From", "To", "Connects", "Shows"],
				rows: EXAMPLES.map(([from, to, shows]) => [
					`\`${from}\``,
					`\`${to}\``,
					pinsCompatible({ type: from }, { type: to }) ? "Yes" : "No",
					shows,
				]),
			},
			{
				t: "p",
				text:
					"Generated: each row's answer is `pinsCompatible` in `core/compiler/validate.ts`, " +
					"run on that pair as these pages are built. `Model` and `Instance` are the Roblox " +
					"profile's.",
			},
			{
				t: "ul",
				items: [
					"An editor **MUST** refuse to make a wire this rule does not allow, and **SHOULD** say why.",
					"A compiler **MUST** report a wire between a flow pin and a data pin as an error, and **SHOULD** report a data wire this rule does not allow, which can arrive in a file written elsewhere, as a warning.",
					"A wire between two types the rule joins through a conversion **SHOULD** be drawn so the change shows (§5.6).",
				],
			},

			// 6.4 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "6.4 Types from source code" },
			{
				t: "p",
				text:
					"A graph can call functions written in another graph of the same project, and its " +
					"pins take their types from that graph's declarations: a parameter becomes an " +
					"input of its type, a result an output. A profile says how its language's own type " +
					"annotations become pin types (§10.3), and a type the profile cannot express as a " +
					"pin type becomes `any`.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"**Not yet in Roswaal.** Functions in hand-written source files, rather than in " +
					"graphs, do not give pins types yet; their doc comments feed the code editor's " +
					"hover and completion only.",
			},

			// 6.5 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "6.5 Tags in comments" },
			{
				t: "note",
				kind: "info",
				text:
					"**Proposed, not built.** A way to type a hand-written function's pins from tags " +
					"in its doc comments, written so that a documentation generator that does not " +
					"know them ignores them. For Luau the design has to keep Moonwave sites building: " +
					"Moonwave treats an unknown tag in a doc comment as an error, so these tags would " +
					"live in plain `--` comments, which Moonwave skips. §11.9 will carry the Luau " +
					"form when it is decided.",
			},

			// 6.6 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "6.6 What a profile must add" },
			{
				t: "ul",
				items: [
					"Its type names, and the family of each (§6.2).",
					"Its conversions: which types connect because the language converts between them by itself, and nothing the language would need asked to do.",
					"Its hierarchy, if the language has subtypes, as a parent for each type.",
					"How each of its language's type annotations becomes a pin type.",
					"A colour for each type it wants told apart at a glance, and a short name for any whose full name is too long for a chip (§5.5).",
				],
			},
			{
				t: "p",
				text: `The Roblox profile's families, for example: \`Model\` is ${article(typeFamily("Model"))}, \`RBXScriptSignal\` ${article(typeFamily("RBXScriptSignal"))}, \`table\` ${article(typeFamily("table"))}.`,
			},
		],
	};
}

function article(family: string): string {
	return `${/^[aeiou]/.test(family) ? "an" : "a"} \`${family}\``;
}
