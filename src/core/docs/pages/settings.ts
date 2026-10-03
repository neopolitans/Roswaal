/**
 * The `settings` page of the documentation. `buildSite` places it.
 */

import { defaultConfig } from "../../schema.js";
import { CODE_ROLES, ROLES } from "../../theme.js";
import { BUILTIN_THEMES } from "../../themeData.js";
import type { DocPage } from "../site.js";

/**
 * Settings and themes.
 *
 * Half of this page is generated, for the reason the node reference is: the
 * lists it carries are the real ones. The `roswaal.json` defaults come from
 * `defaultConfig()`, the theme roles from `ROLES`, and the table of shipped
 * schemes from the schemes themselves — so a default that changes, a role that
 * is added, or a palette that is dropped from a fork cannot leave this page
 * quietly describing the version before.
 */
export function settingsPage(): DocPage {
	const defaults = defaultConfig();

	return {
		slug: "settings",
		narrow: true,
		title: "Settings and themes",
		summary: "What is a project setting, what is yours, and how a colour scheme is written.",
		blocks: [
			{
				t: "p",
				text:
					"There are two kinds of setting and they behave differently, which is worth " +
					"getting straight before changing either. **Project settings** are " +
					"`roswaal.json`: committed, shared by everyone working on the repository, and " +
					"they change what the compiler does. **Preferences** are yours — stored in " +
					"your browser, never written to the project, and invisible to everybody else.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"Both are edited from **Settings**; preferences from the Docs window's too. Each " +
					"section says where it is stored, so a personal colour scheme stays out of pull " +
					"requests.",
			},

			{ t: "h", level: 2, text: "Project settings" },
			{
				t: "p",
				text:
					"Written to `roswaal.json` in the project root. `roswaal init` writes the " +
					"defaults out; every one of them is optional in a hand-written file.",
			},
			{
				t: "table",
				head: ["Key", "Default", "What it does"],
				rows: [
					[
						"`target`",
						`\`${defaults.target}\``,
						"Which flavour of Luau new graphs compile for. `lune` is **experimental**, and not yet tested by an experienced Lune developer; it drops the Roblox globals and nodes.",
					],
					[
						"`sourceDir`",
						`\`${defaults.sourceDir}\``,
						"Where `.nodescript` and `.nodemap` files are read from.",
					],
					[
						"`outDir`",
						`\`${defaults.outDir}\``,
						"Where generated `.luau` is written. This is the directory Rojo syncs.",
					],
					[
						"`compileMode`",
						`\`${defaults.compileMode}\``,
						"`hot` recompiles a graph every time it is written, which is every edit; `manual` waits to be asked. The editor shows these as **Dynamic** and **Manual** — the stored name is `hot` for the sake of every `roswaal.json` already written.",
					],
					[
						"`nodePaths`",
						`\`${JSON.stringify(defaults.nodePaths)}\``,
						"Directories scanned for `.nodedef.json` node packs.",
					],
					[
						"`format`",
						`\`${defaults.format}\``,
						"Run stylua over generated files when it is on PATH. When it is not, the file is written unformatted rather than not written.",
					],
					[
						"`comments`",
						"`true`",
						"Write each comment's header into the generated Luau, above the code of the nodes it is drawn around. A header of one line is written `-- like this`, one of several as a `--[[ ]]` block. Off keeps them in the editor, which is what other visual scripting tools do — see [Coming from Blueprints](coming-from-blueprints) if that is the habit you have.",
					],
					[
						"`indentStyle`",
						`\`${defaults.indentStyle}\``,
						"What one level of indentation is in the generated Luau: `tab`, or `space`. Handed to stylua as well when `format` is on, so this decides rather than whatever `stylua.toml` says.",
					],
					[
						"`indentWidth`",
						`\`${defaults.indentWidth}\``,
						"How many spaces one level is, when `indentStyle` is `space`. Ignored otherwise, except that stylua is told it so a tab still counts the right amount against its column limit.",
					],
					[
						"`rojoProject`",
						`\`${defaults.rojoProject ?? ""}\``,
						"Left for Rojo. Where a file lands in the DataModel comes from your node maps, and nothing is written to this file.",
					],
					[
						"`place`",
						"unset",
						"The project's place file, set by `roswaal import`. Unset, a `.rbxl` or `.rbxlx` in the project root, `place.rbxl` first.",
					],
					[
						"`schemaVersion`",
						"set for you",
						"Which schema the file was written against. `migrate.ts` reads it.",
					],
				],
			},

			{ t: "h", level: 2, text: "Preferences" },
			{
				t: "p",
				text:
					"Stored in this browser under one key, and nowhere else. They do not follow " +
					"you to another machine, which is the right thing to give up: the " +
					"alternative is a per-developer file in a shared checkout.",
			},
			{
				t: "table",
				head: ["Preference", "What it does"],
				rows: [
					[
						"Theme",
						"The colour scheme, or **Follow the system** — which is the absence of a theme rather than a scheme of its own, so the app keeps changing with your OS.",
					],
					[
						"Realign",
						"Whether Realign straightens the execution spine or tidies into plain columns. A habit of reading rather than a property of the graph, which is why two people sharing a repository do not have to agree about it.",
					],
					[
						"Wires",
						"**Curved** is a bezier out of each pin, and the default. **Rigid** turns at right angles only. **Angular** leaves the pin level, takes one straight run to the other end, and arrives level — a diagonal rather than a cut corner. Where the input is *behind* the output there is no straight line to take, so angular borrows rigid's lane out and back, with its corners cut.",
					],
					[
						"Node corners",
						"Rounded or square. Capsule getters and reroute knots keep their shapes either way — a pill and a circle are what say *this is a value* and *this is a bend in the wire*, and neither has a title to say it instead.",
					],
					[
						"Long names",
						"**Truncate** cuts a header too long for its node short, with the whole of it in the tooltip — what nodes have always done. **Widen** draws the node wide enough for its header instead. It is the one of these looks that moves *pins*, so the wire router and the pictures on these pages are computed from the same width: a node and its own picture are never two different sizes.",
					],
					[
						"New concatenate nodes",
						"What a new **Concatenate** writes: a **join** with `..`, or an **interpolated string**, where a part typed into the node is text and a part wired in is a hole in braces. The same string either way, and both are Luau, so the choice is about how the line reads. Stored **on the node**, as the brackets are — this only decides what one you drop today starts as, and **Concatenation Type** in the Inspector changes any of them.",
					],
					[
						"New logic nodes",
						"Whether a new **And**, **Or**, **Not**, comparison or arithmetic pill starts out bracketing its expression. Only the starting point: whether a node brackets is stored **on the node**, so it travels with the graph and reads the same on everybody's machine. Precedence is handled either way — this is about how the line reads, never about what it means. The casts are pills too and are not offered it: `(value :: T)` brackets itself already.",
					],
					[
						"Name in the graph tools",
						"**Show** puts the graph's name at the start of the tools over the canvas — `ƒ hide (Occupancy)` in a function's graph. Hidden by default, since the tab and the watermark say it already; unsaved edits are marked with a dot either way.",
					],
					[
						"Shorten function tabs",
						"What a function's tab says. **None** keeps `ƒ hide (Occupancy)`; **Function name** and **Script name** keep one of the two. The tooltip has both.",
					],
					[
						"Write a graph",
						"How long after your last edit a graph is written. A delay, not a switch — there is no unsaved copy of a graph, so switching it off would give you a document that quietly stops matching itself rather than a buffer.",
					],
					["On opening Roswaal", "Reopen the last project, or start at the picker."],
					[
						"Docs font",
						"The face the docs are read in: **System**, **Serif**, **Wide** or **Monospace**. Code keeps its own.",
					],
					[
						"Preview size",
						"How large node and graph pictures are drawn in the docs, from 50% to 300%. A graph bigger than its frame can be dragged around.",
					],
				],
			},

			{
				t: "note",
				kind: "info",
				text: "**Wires and node corners change how a graph looks, never what it compiles to.**",
			},

			{ t: "h", level: 2, text: "Themes" },
			{
				t: "p",
				text:
					"One JSON file per scheme, in `themes/` at the repository root. Roswaal and " +
					"[Beako](https://github.com/neopolitans/Beako) use the same format, so a theme " +
					"written for one reads in the other.",
			},
			{
				t: "table",
				head: ["Scheme", "Credit", "Licence"],
				rows: [...BUILTIN_THEMES]
					.sort((a, b) => a.order - b.order)
					.map((t) => [
						t.name,
						t.credit ?? "—",
						t.licence
							? `${t.licence.spdx}, in full under Settings → Licences`
							: "0BSD, with the repository",
					]),
			},
			{
				t: "h",
				level: 3,
				text: "Adding one",
			},
			{
				t: "p",
				text:
					"Copy the closest scheme, rename it after the slug of its new name, and edit. " +
					"Every field is required — there is deliberately no inheritance, because a " +
					"half-defined palette silently borrowing another one's colours is far harder " +
					"to debug than a missing-key error.",
			},
			{
				t: "code",
				lang: "json",
				text: JSON.stringify(
					{
						name: "My Theme",
						order: 7,
						dark: true,
						credit: "You",
						colors: { app: "#16181d", panel: "#1b1e24", "…": "…" },
						code: { keyword: "#c98fd0", string: "#8fce9b", "…": "…" },
					},
					null,
					2,
				),
			},
			{
				t: "p",
				text:
					"`npm run build:themes` compiles `themes/` into the bundle and refuses to " +
					"build a scheme that would not work. What it checks is worth knowing before " +
					"you hit it:",
			},
			{
				t: "ul",
				items: [
					"Every role is present, and every colour is a full `#rrggbb`. No short form, no names, no alpha.",
					"`dark` agrees with the actual brightness of `app`. It is not a description — every overlay is derived from it — so a scheme claiming `true` on a light ground would paint white onto white and make every hover state invisible.",
					"A node is distinguishable from the canvas it sits on.",
					"Body text clears 4.5:1 against both `app` and `panel`, and the quieter text roles clear their own lower bars.",
					"Syntax colours are visible on the surface code is shown on. `comment` is held to a lower bar than the rest on purpose — every serious syntax theme mutes its comments, and that is the author's decision rather than a mistake to correct for them.",
				],
			},

			{ t: "h", level: 3, text: "What a theme sets" },
			{
				t: "table",
				head: ["Role", "What it colours"],
				rows: [
					...ROLES.map((r) => [`\`${r.role}\``, r.what]),
					...CODE_ROLES.map((r) => [`\`code.${r.role}\``, r.what]),
				],
			},

			{ t: "h", level: 3, text: "What it does not" },
			{
				t: "p",
				text:
					"**Node category colours and pin type colours are fixed.** Red is a boolean, " +
					"green is a number, gold is a vector — that mapping is most of what makes a " +
					"Roswaal graph readable at a glance, and a scheme " +
					"that moved it would be trading the one thing the colours are for against a " +
					"matter of taste. They live in `palette.ts` and stay there.",
			},
			{
				t: "p",
				text:
					"**Hover, the grid, the watermark and the node shadow are not authored " +
					"either.** They are overlays — a translucent white or black over whatever is " +
					"underneath — and an overlay is the one kind of token an author gets wrong " +
					"without seeing it, because the mistake is invisible on the surface they " +
					"happened to be looking at. They are computed from `dark` instead, so a " +
					"palette cannot ship a hover state that does not show.",
			},
			{
				t: "note",
				kind: "warn",
				text: "A data wire takes its pin's colour, not a theme's. Themes have no data-wire role.",
			},
		],
	};
}
