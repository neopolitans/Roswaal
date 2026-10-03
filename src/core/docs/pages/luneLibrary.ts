/**
 * The `lune-library` page of the documentation. `buildSite` places it.
 */

import { LUNE_MODULES, LUNE_VERSION } from "../../luneApi.js";
import { code, previews } from "./blocks.js";
import type { DocPage, PageContext } from "../site.js";

/**
 * Lune's standard library.
 *
 * Its own page rather than a section of *Modules*, because Modules is about
 * requiring and this is about what you can call once you have. The table of
 * modules is built from the catalogue rather than typed out, so a Lune release
 * that adds a function changes this page by being regenerated.
 */
export function luneLibraryPage({ registry }: PageContext): DocPage {
	const counts = LUNE_MODULES.map((module) => ({
		alias: module.alias,
		what: module.what,
		functions: module.functions.length,
		classes: module.classes.length,
	}));
	const total = counts.reduce((sum, one) => sum + one.functions, 0);

	return {
		slug: "lune-library",
		title: "Lune's standard library",
		summary: "Files, networking, processes and the rest — as two nodes that know every signature.",
		narrow: true,
		blocks: [
			{
				t: "p",
				text:
					"Lune ships its own library: the filesystem, HTTP, child processes, the terminal, " +
					"a scheduler. Each part is a module you require — `@lune/fs`, `@lune/net` — and " +
					`Roswaal knows all ${total} of their functions.`,
			},

			{ t: "h", level: 2, text: "Two nodes, not sixty-one" },
			{
				t: "p",
				text:
					"One node per function would put sixty-odd entries in the palette and a release " +
					"of Roswaal between you and anything Lune shipped last month. So there are two, " +
					"and they read a catalogue: **Lune Function** for a call that does something, " +
					"**Lune Function (Value)** for one that answers something.",
			},
			...previews(
				registry,
				["lune.call", "lune.value"],
				"Both arrive blank. Pick the call in the Inspector — or search the palette for it " +
				"by name, and the node comes configured.",
			),
			{
				t: "p",
				text:
					"**The palette still knows every function.** Type `readFile` and `fs.readFile` " +
					"is there; picking it places the node already set to that call, with `path` and " +
					"the result pin typed from Lune's own signature.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"**Lune decides which you get, not Roswaal.** A function Lune tags `must_use` is a " +
					"value; the rest are steps. So `fs.readFile` is a value and `fs.writeFile` a step.",
			},

			{ t: "h", level: 2, text: "The module has to be declared" },
			{
				t: "p",
				text:
					"A Lune Function node **does not write its own** `require`. Pick `fs.readFile` " +
					"in a script that does not require `@lune/fs` and the node says so, and the " +
					"Inspector offers a button that declares it.",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"`@lune/fs` is no exception, though it is always available: placing a node never adds " +
					"a require. See [Modules](modules).",
			},
			{
				t: "p",
				text:
					"So the button is the whole of the difference: **said and offered, never done**. " +
					"Declaring it the moment you picked the call would be the editor expanding what " +
					"your project depends on without being asked.",
			},
			{
				t: "code",
				lang: "luau",
				text: code`
					local fs = require("@lune/fs")

					print(fs.readFile("notes.txt"))
					`,
			},
			{
				t: "p",
				text:
					"The local is the one **you** named in the Variables panel. Call it `disk` and " +
					"the call reads `disk.readFile` — see [Variables and locals](variables-and-locals) " +
					"for why the name is yours.",
			},

			{ t: "h", level: 2, text: "What is in it" },
			{
				t: "table",
				head: ["Module", "What it is for", "Functions"],
				rows: counts.map((one) => [
					`\`@lune/${one.alias}\``,
					one.what,
					String(one.functions),
				]),
			},
			{
				t: "p",
				text:
					"A module also hands back **types with methods of their own** — `regex.new` " +
					"gives you a `Regex`, and its `find` is asked of that value rather than of the " +
					"module. Those are [Call Method](node/call.method), not these two nodes.",
			},

			{ t: "h", level: 2, text: "Arguments and results" },
			{
				t: "ul",
				items: [
					"Arguments arrive **named and typed from Lune's signature**, with Lune's own " +
						"description on each pin.",
					"An **optional** argument starts empty, so leaving it alone leaves it off the " +
						"call. `task.wait()` and `task.wait(0)` are different calls and you can write " +
						"either.",
					"A type Roswaal's pins cannot say — `buffer | string` — becomes an `any` pin " +
						"whose description gives the real one. A pin claiming `string` would refuse a " +
						"buffer the runtime accepts.",
				],
			},

			{ t: "h", level: 2, text: "Which Lune" },
			{
				t: "p",
				text:
					`Every signature here comes from Lune **${LUNE_VERSION}**, read out of the ` +
					"`types.d.luau` files that ship with it rather than from a page describing " +
					"them. Moving to a new Lune is `npm run build:lune`, and the diff is the API " +
					"change — which is the point of generating it rather than writing it down.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"`@lune/fs` and its siblings **cannot be aliased** — Lune reserves those names. See " +
					"[Aliases and .luaurc](aliases) for the ones you can define.",
			},
		],
	};
}
