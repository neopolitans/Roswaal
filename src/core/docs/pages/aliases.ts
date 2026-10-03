/**
 * The `aliases` page of the documentation. `buildSite` places it.
 */

import type { DocPage } from "../site.js";

/**
 * `.luaurc` alias maps.
 *
 * Its own page rather than a section of *Modules*, because almost none of it is
 * about requiring: it is about a file, where that file sits, and what it
 * inherits from the ones above it. Modules keeps the one row a reader needs
 * while writing a specifier and sends them here for the rest.
 *
 * Everything stated as a rule is quoted from the RFC in `src/core/luaurc.ts`,
 * which carries the date it was checked. The two the page spends most space on
 * are the two that look correct in every project with a single `.luaurc` at the
 * root — which is most projects, right up until it is not.
 */
export function aliasesPage(): DocPage {
	return {
		slug: "aliases",
		title: "Aliases and .luaurc",
		summary: "A short name for a path, shared by the project: where it is defined, and what it reaches.",
		narrow: true,
		blocks: [
			{
				t: "p",
				text:
					"`@roact/Component` is a require that does not say where Roact is. The path lives " +
					"in a `.luaurc`, and the alias is the name you use instead — so a package that " +
					"moves is one file changed rather than every graph that reads it.",
			},
			{
				t: "p",
				text:
					"An alias belongs to the **project**, not to a graph. The file is committed, so " +
					"everyone working in the repository resolves `@roact` to the same place, and two " +
					"graphs cannot disagree about it.",
			},
			{
				t: "code",
				lang: "json",
				text: [
					"{",
					'\t"languageMode": "strict",',
					'\t"aliases": {',
					'\t\t"roact": "./Packages/Roact",',
					'\t\t"shared": "./src/Shared"',
					"\t}",
					"}",
				].join("\n"),
			},

			{ t: "h", level: 2, text: "Where the file goes" },
			{
				t: "p",
				text:
					"Anywhere. A `.luaurc` applies to **its own directory and everything under it**, " +
					"so a project can have one at the root and another beside a corner of itself that " +
					"needs something different.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"**A nearer file adds to the one above it; it does not replace it.** An alias it " +
					"names overrides the one above; every other alias is inherited.",
			},
			{
				t: "table",
				head: ["A require in", "Sees"],
				rows: [
					["`src/ui/Panel`", "`src/ui/.luaurc`, then `src/.luaurc`, then the root's"],
					["`src/Main`", "`src/.luaurc`, then the root's"],
					["Anywhere with no file above it", "No aliases at all"],
				],
			},

			{ t: "h", level: 2, text: "Where a relative path lands" },
			{
				t: "p",
				text:
					"Against **the** `.luaurc` **that defined it** — not against the file doing the " +
					"requiring. *\"If an alias is bound to a relative path, the path will be evaluated " +
					"relative to the .luaurc file in which the alias was defined.\"*",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"**This rule can be wrong unnoticed.** A graph beside the `.luaurc` resolves the same " +
					"either way; the first graph in a subdirectory is where it shows.",
			},

			{ t: "h", level: 2, text: "Naming one" },
			{
				t: "ul",
				items: [
					"**Case does not matter.** `@Roact` and `@roact` are one alias. Defining both in " +
						"one file is defining one alias twice, and Roswaal says so rather than letting " +
						"you write a file whose behaviour nobody can predict.",
					"Letters, digits, `.`, `-` and `_`. A name **cannot contain** `/` **or** `\\` — the " +
						"separator is what ends the alias and starts the path after it.",
					"`@` on its own is reserved.",
				],
			},

			{ t: "h", level: 2, text: "An alias that points at another" },
			{
				t: "p",
				text:
					"Allowed, and followed: *\"This search continues iteratively if a chain of aliases " +
					"must be resolved.\"* So `\"ui\": \"@roact/Component\"` is `Packages/Roact/Component` " +
					"if `@roact` is `./Packages/Roact`, and each link resolves against the file that " +
					"defined **that** link rather than the first one.",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"A ring is an error, reported as the ring it walked: `a → b → c → a`.",
			},

			{ t: "h", level: 2, text: "Editing one" },
			{
				t: "p",
				text:
					"A `.luaurc` is a file in the **project tree**, under Graph content beside your " +
					"graphs — Roswaal reads it rather than writing it, which is the line that section " +
					"is drawn on. Double-click it to open the alias editor: what this file defines, " +
					"where each one lands once the chain is followed, and underneath, what it " +
					"inherits from above.",
			},
			{
				t: "ul",
				items: [
					"Inherited aliases are shown but not editable. They belong to another file, and " +
						"the way to change one is to open the file that defines it.",
					"Every write **splices the** `aliases` **object** and leaves the rest of the file " +
						"exactly as it was: `languageMode`, lint settings, fields Roswaal has never " +
						"heard of.",
					"A file with **comments inside its** `aliases` is refused rather than rewritten, " +
						"and says why. An edit reorders the entries, and a note about why a package is " +
						"vendored cannot survive that.",
				],
			},

			{ t: "h", level: 2, text: "What Roswaal checks" },
			{
				t: "table",
				head: ["Specifier", "Verdict"],
				rows: [
					["An alias a `.luaurc` defines", "Fine"],
					["A name nothing defines, in a project that has a `.luaurc`", "**Error** — a typo"],
					["A name nothing defines, in a project with no `.luaurc` at all", "**Warning**"],
					["Any alias, in a graph compiling for Roblox", "**Warning** — see below"],
				],
			},
			{
				t: "p",
				text:
					"The second and third rows are the same specifier and different answers, and the " +
					"difference is deliberate. A project that uses alias maps and does not name this " +
					"one has a misspelling. A project with no `.luaurc` anywhere may be generating one " +
					"at build time, or keeping it outside the folder Roswaal opened — refusing to " +
					"compile that would be refusing a project that builds.",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"**Roblox does not resolve aliases yet** (announced as coming; checked 16 September " +
					"2026), so a `.luaurc` in a Roblox project is a warning, not an error. `@self/`, " +
					"`@game/`, `./` and `../` do work — see [Modules](modules).",
			},
		],
	};
}
