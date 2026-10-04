/**
 * The `compiling-for-lune` page of the documentation. `buildSite` places it.
 */

import type { NodeMap } from "../../nodemap.js";
import type { DocPage } from "../site.js";

/** The same figure for a Lune project: a tree, and the disk it describes. */
const LUNE_MAP: NodeMap = {
	schemaVersion: 1,
	kind: "map",
	id: "docs-map-lune",
	name: "tool",
	target: "lune",
	output: "",
	root: {
		id: "root",
		name: "tool",
		children: [
			{ id: "main", name: "main", file: true, children: [] },
			{
				id: "lib",
				name: "lib",
				children: [
					{ id: "json", name: "json", file: true, children: [] },
					{ id: "text", name: "text", file: true, children: [] },
				],
			},
		],
	},
};

/**
 * Compiling for Lune, and the map that describes a filesystem.
 *
 * Its own page rather than a branch inside the Roblox one. The two answer the
 * same question — where does this file end up — and answer it so differently
 * that one page would spend its length saying "unless you are on the other
 * one". A Lune developer should be able to read a page that is about Lune,
 * and that means this page carries the whole of compiling rather than sending
 * them to the Roblox page for the half that happens to be shared.
 */
export function compilingForLunePage(): DocPage {
	return {
		slug: "compiling-for-lune",
		narrow: true,
		title: "Compiling and nodemaps for Lune",
		summary: "A graph becomes a file, and the file is where it is. No DataModel, no project file.",
		blocks: [
			{
				t: "p",
				text:
					"This page is about graphs whose **Target** is Lune. The Inspector says which with " +
					"nothing selected, and a new graph takes the project's. For Roblox, the answer is " +
					"a different one and it is on [Compiling and nodemaps for Roblox](building-and-rojo).",
			},
			{
				t: "p",
				text:
					"A graph is a `.nodescript` under `.roswaal/scripts`. Compiling it writes a `.luau` " +
					"file to the same place under the output directory, in the same shape: " +
					"`.roswaal/scripts/lib/json.nodescript` writes `src/lib/json.luau`. Both " +
					"directories are project [settings](settings).",
			},
			{
				t: "note",
				kind: "info",
				text:
					"**There is no DataModel, so there is nothing to sync.** Lune runs the file where it " +
					"is — `lune run main` — so the layout on disk is the whole answer.",
			},

			{ t: "h", level: 2, text: "Nodemap basics" },
			{
				t: "p",
				text:
					"Here is the whole of it. A `.nodemap` is edited in Roswaal rather than by hand, and " +
					"this is that editor with *Describes* set to **A filesystem** — the tree on the left, " +
					"the Inspector on the right, and the layout it describes underneath. Every part is " +
					"named beside it; the rest of this page explains them in order.",
			},
			{
				t: "nodemap",
				map: LUNE_MAP,
				caption:
					"The same panel, describing a filesystem. **Select a row** to fill the Inspector. " +
					"A name carries no extension — `main` in the map, `main.luau` on disk, and the " +
					"require that reaches it beside.",
			},
			{ t: "h", level: 2, text: "What a graph compiles to" },
			{
				t: "p",
				text:
					"Always a `.luau` file named after the graph. A Roblox graph picks between Script, " +
					"LocalScript and ModuleScript, and the choice decides the file's ending because " +
					"Rojo reads it — `Greeter.server.luau`. Lune has no such distinction: a file is a " +
					"file, and whether it is a program or a module is decided by whether something " +
					"requires it.",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"**Lune support is experimental.** It has not yet been tested by an experienced " +
					"Lune developer, so treat what it writes as a starting point.",
			},

			{ t: "h", level: 2, text: "Compiling" },
			{
				t: "table",
				head: ["", "What it compiles"],
				rows: [
					["**Compile script**, or `Ctrl` + `S`", "The open graph"],
					["**Compile project**", "Every graph, then every node map"],
					[
						"**Compile: Dynamic**",
						"Each graph as you edit it, and any that change on disk — after a `git pull`, say",
					],
					["`roswaal compile`", "Everything, or the one graph or map you give it"],
					["`roswaal watch`", "The same, without the editor"],
				],
			},
			{
				t: "p",
				text:
					"A graph with errors writes nothing; warnings do not stop it. With `format` on and " +
					"[StyLua](https://github.com/JohnnyMorganz/StyLua) on your PATH, the file is " +
					"formatted as it is written. Then `lune run main` — Roswaal does not run it for you.",
			},
			{
				t: "p",
				text:
					"A generated file starts with a header naming its graph and a hash of what was " +
					"written. Roswaal will not overwrite a file whose hash no longer matches — one " +
					"edited by hand — or a file it did not write. Rename a graph or move it and its " +
					"next compile removes the file it used to write; `roswaal prune` lists the ones " +
					"left behind by a graph that is gone.",
			},

			{ t: "h", level: 2, text: "What a nodemap is for here" },
			{
				t: "p",
				text:
					"A map still has a job, and it is the one Rojo was doing incidentally: **saying " +
					"the layout out loud, and checking it holds together**. Set a map's *Describes* to " +
					"**A filesystem** and it becomes directories and files rather than services and " +
					"instances. A new map is already the right kind — it follows the project's target.",
			},
			{
				t: "p",
				text:
					"What the right-hand column is *not* is a file Roswaal writes. A filesystem map " +
					"compiles to nothing: the disk is already the answer, and compiling the map is " +
					"checking that the answer is one Luau can load.",
			},
			{
				t: "table",
				head: ["", "A DataModel map", "A filesystem map"],
				rows: [
					["Root is", "The DataModel", "The project directory"],
					["Children are", "Services, folders, instances", "Directories and files"],
					["Compiles to", "`default.project.json`, for Rojo", "Nothing — it is a check"],
					["A node has", "A class and a path on disk", "A name, and whether it is a file"],
				],
			},

			{ t: "h", level: 2, text: "What it checks" },
			{
				t: "p",
				text:
					"These are **require-time errors in Luau**, not house style. The language refuses " +
					"an ambiguous path rather than picking one, so a layout with both of these is one " +
					"the runtime will not load — and a map catches it while you can still move " +
					"something, with both things named.",
			},
			{
				t: "ul",
				items: [
					'**A file beside a directory of the same name.** `require("./foo")` cannot mean ' +
						"both `foo.luau` and `foo/init.luau`.",
					"**Two files differing only by extension.** `foo.luau` and `foo.lua` both answer " +
						"to `./foo`.",
					"**A name a require cannot reach** — letters, digits, `.`, `-` and `_`, and no " +
						"directory separators.",
				],
			},
			{
				t: "note",
				kind: "info",
				text:
					"**A file's name has no extension:** `main` in the map, `main.luau` on disk. Typing " +
					"one is a warning, so you do not end up with `main.luau.luau`.",
			},

			{ t: "h", level: 2, text: "Requires, and what the file depends on" },
			{
				t: "p",
				text:
					"Everything a Lune program reaches for arrives through a `require` you wrote. " +
					"The standard library is [Lune's standard library](lune-library); a short name " +
					"for a path is [Aliases and .luaurc](aliases); and the rule behind both is on " +
					"[Modules](modules) — a generated file does not grow imports nobody chose.",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"**Roblox datatypes need** `@lune/roblox`. `Vector3` and `CFrame` compile once it is " +
					"required with the datatype as a member; the Inspector has the button. `TweenInfo` is " +
					"not offered in Lune.",
			},
		],
	};
}
