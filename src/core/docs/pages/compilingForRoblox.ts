/**
 * The `compiling-for-roblox` page of the documentation. `buildSite` places it.
 */

import type { DocPage } from "../site.js";

/**
 * How a Roblox graph becomes a file. Where that file lands in Studio is the
 * node map's business, on *Rojo projects and node maps*.
 */
export function compilingForRobloxPage(): DocPage {
	return {
		slug: "compiling-for-roblox",
		narrow: true,
		title: "Compiling for Roblox",
		summary: "How a graph becomes a Luau file that Rojo syncs into Studio.",
		blocks: [
			{
				t: "p",
				text:
					"This page is about graphs whose **Target** is Roblox. The bar along the top of " +
					"the canvas says which, and a new graph takes the project's. For Lune, the answer " +
					"is a different one and it is on " +
					"[Compiling for Lune](compiling-for-lune).",
			},
			{
				t: "p",
				text:
					"A graph is a `.nodescript` under `.roswaal/scripts`. Compiling it writes a `.luau` " +
					"file to the same place under `src`, and [Rojo](https://rojo.space) syncs that into " +
					"Studio. Roswaal never talks to Studio itself.",
			},
			{
				t: "p",
				text:
					"Folders carry across: `.roswaal/scripts/ReplicatedStorage/Shared/Greeter.nodescript` " +
					"writes `src/ReplicatedStorage/Shared/Greeter.luau`. Both directories are project " +
					"[settings](settings).",
			},
			{ t: "h", level: 2, text: "What a graph compiles to" },
			{
				t: "p",
				text:
					"The file is named after the graph, and its ending comes from the script kind, " +
					"chosen in the Inspector with nothing selected. The ending is how Rojo knows " +
					"which class of instance to make.",
			},
			{
				t: "table",
				head: ["Kind", "File", "In Studio"],
				rows: [
					["Script", "`Greeter.server.luau`", "A `Script`, running on the server"],
					[
						"LocalScript",
						"`Greeter.client.luau`",
						"A `LocalScript`, running on a player's machine",
					],
					["ModuleScript", "`Greeter.luau`", "A `ModuleScript`, run by whatever requires it"],
				],
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
					"formatted as it is written. If StyLua refuses it, it is written unformatted and the compile says why.",
			},
			{
				t: "p",
				text:
					"In either mode, an open graph whose file changes on disk takes the new version. If it " +
					"has edits that are not saved yet, you are asked which to keep.",
			},

			{ t: "h", level: 2, text: "Generated files" },
			{
				t: "p",
				text:
					"A generated file starts with a header naming its graph and a hash of what was " +
					"written. Roswaal will not overwrite a file whose hash no longer matches — one " +
					"edited by hand — or a file it did not write.",
			},
			{
				t: "note",
				kind: "danger",
				text:
					"To overwrite one anyway, click **overwrite** in the compile results, or run `roswaal " +
					"compile --force`. **The hand edit is lost.**",
			},

			{ t: "h", level: 2, text: "Moving and deleting graphs" },
			{
				t: "p",
				text:
					"Rename a graph, move it or change its kind, and its next compile removes the file " +
					"it used to write.",
			},
			{
				t: "p",
				text:
					"A generated file whose graph is gone is **stale**, and Rojo goes on syncing it. The " +
					"compile results list stale files with a **remove** link. From the command line, " +
					"`roswaal prune` lists them and `roswaal prune --yes` removes them.",
			},

			{
				t: "p",
				text:
					"Where each file lands in Studio is set by a node map, on " +
					"[Rojo projects and node maps](rojo-projects).",
			},
		],
	};
}
