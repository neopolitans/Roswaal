/**
 * The `places-and-rojo` page of the documentation. `buildSite` places it.
 */

import type { NodeMap } from "../../nodemap.js";
import { projectToMap } from "../../rojoImport.js";
import { GUIDE_SCENES } from "../examples.js";
import type { DocPage } from "../site.js";
import { DATAMODEL_BROWSER, EXPORT_PANEL, PROPERTIES_PANEL } from "../toolbars.js";
import { code } from "./blocks.js";

/**
 * A Rojo project as a Wally game usually has one: shared code and packages in
 * ReplicatedStorage, the server's and the client's own folders. Read into a
 * map by the importer itself, so the picture is what Import Rojo project makes
 * of it -- and a test holds that the map writes this file back unchanged.
 */
export const ROJO_SAMPLE = {
	name: "orchard",
	tree: {
		$className: "DataModel",
		ReplicatedStorage: {
			Shared: { $path: "src/shared" },
			Packages: { $path: "Packages" },
		},
		ServerScriptService: {
			Server: { $path: "src/server" },
		},
		StarterPlayer: {
			StarterPlayerScripts: {
				Client: { $path: "src/client" },
			},
		},
	},
};

const ROJO_IMPORTED: NodeMap = (() => {
	let n = 0;
	return projectToMap(ROJO_SAMPLE, {
		output: "default.project.json",
		fallbackName: "orchard",
		makeId: () => `rojo-${n++}`,
	}).map;
})();

/**
 * Bringing an existing game in: a Rojo project, a place, or both, and what
 * goes back out. Apart from *Compiling and nodemaps for Roblox*, which is
 * about compiling.
 */
export function placesAndRojoPage(): DocPage {
	return {
		slug: "places-and-rojo",
		narrow: true,
		title: "Places and Rojo projects",
		summary:
			"Bringing a game in from its Rojo project or its place, browsing the place, and writing scripts back into it.",
		blocks: [
			{
				t: "p",
				text:
					"Most games already exist as a Rojo project, a place file, or both. This page is " +
					"how Roswaal takes either in, shows you the place, and writes your scripts back into " +
					"it. How a graph compiles is on [Compiling and nodemaps for Roblox](building-and-rojo).",
			},

			{ t: "h", level: 2, text: "Starting from a Rojo project" },
			{
				t: "p",
				text:
					"A project Rojo already manages has its tree in `default.project.json`. **Project → " +
					"Import Rojo project…**, or `roswaal import default.project.json`, reads it into a node " +
					"map beside your graphs. The file is not changed, and every field in it is kept, " +
					"including ones the map editor has no control for.",
			},
			{
				t: "nodemap",
				map: ROJO_IMPORTED,
				caption:
					"A project file read into a map. **Select a row** for its fields; the project file " +
					"beside it is the one the map writes, the same as the one it was read from.",
			},
			{
				t: "p",
				text:
					"In the web app, **Open .zip…** and **Open folder…** offer the same when there is a " +
					"project file no map writes, with a list to pick from when there are several. A place " +
					"file in the zip or folder is found too.",
			},
			{
				t: "p",
				text:
					"When the map compiles back to the same project, the map writes the file from then on. " +
					"Compiling leaves it alone until the map changes, and then keeps its indentation and " +
					"line endings. If the map would write it differently, the file stays yours until you " +
					"compile with force.",
			},

			{ t: "h", level: 2, text: "Starting from a place" },
			{
				t: "p",
				text:
					"`roswaal import place.rbxl` makes a new project from a `.rbxl` or `.rbxlx`. Scripts " +
					"Rojo can sync go under `src/`, and every service in the node map it writes has " +
					"**Ignore unknown**, so Rojo never removes a part it was not given. The place is " +
					"copied into the project.",
			},
			{
				t: "p",
				text:
					"A script inside a part, a model or a GUI stays in the place: Rojo cannot sync it " +
					"without owning its parent. `--scripts all` brings those out too, under `place/`, " +
					"where Rojo does not look. Identical copies become one file unless you pass " +
					"`--no-merge`.",
			},
			{
				t: "p",
				text:
					"In the web app, **Project → Open place…** does the same, and asks the same questions " +
					"with the counts in front of you. The place is kept with the project, and " +
					"**Export…** includes it.",
			},

			{ t: "h", level: 2, text: "Browsing the place" },
			{
				t: "p",
				text:
					"When the project has a place, the Project panel switches between **Files** and " +
					"**DataModel**. DataModel lists the place's instances as Studio's Explorer does: its " +
					"usual services first, children by name, and empty services at the end. Filter by " +
					"name, or by a class name typed in full.",
			},
			{ t: "toolbar", bar: DATAMODEL_BROWSER, hint: true },
			{
				t: "p",
				text:
					"Double-click or double-tap an instance to open the **Properties** panel on the right: " +
					"its properties, tags and attributes under Studio's headings. While it is open it follows " +
					"what you pick, and a reference goes to what it names. For a script a project file " +
					"writes, **Open** opens that file, and its graph when one generates it. The browser " +
					"only reads the place.",
			},
			{ t: "toolbar", bar: PROPERTIES_PANEL },

			{ t: "h", level: 2, text: "Dragging onto a graph" },
			{
				t: "table",
				head: ["Drag from Properties", "What it makes"],
				rows: [
					[
						"A property",
						"An **Instance** node at the instance's path, wired into **Get Member**, typed as the property is",
					],
					["A property, with `Ctrl` held as you drop", "The same, into **Set Property**"],
					["An attribute", "**Get Attribute**, or **Set Attribute** with `Ctrl`"],
					["The instance's name", "The Instance node alone"],
				],
			},
			{
				t: "tabs",
				label: "Dropped from Properties",
				tabs: [
					{
						id: "drop-property",
						title: "A property",
						blocks: [
							{
								t: "graph",
								script: GUIDE_SCENES.dropProperty(),
								caption: "Anchored, dropped: Get Member, typed boolean, printed here.",
							},
							{
								t: "code",
								lang: "luau",
								text: code`
								local Workspace = game:GetService("Workspace")

								print(Workspace.House.Door.Anchored)
								`,
							},
						],
					},
					{
						id: "drop-property-set",
						title: "With Ctrl",
						blocks: [
							{
								t: "graph",
								script: GUIDE_SCENES.dropPropertySet(),
								caption: "The same drop with `Ctrl` held: Set Property.",
							},
							{
								t: "code",
								lang: "luau",
								text: code`
								local Workspace = game:GetService("Workspace")

								Workspace.House.Door.Anchored = false
								`,
							},
						],
					},
					{
						id: "drop-attribute",
						title: "An attribute",
						blocks: [
							{
								t: "graph",
								script: GUIDE_SCENES.dropAttribute(),
								caption: "IsOpen, an attribute: Get Attribute.",
							},
							{
								t: "code",
								lang: "luau",
								text: code`
								local Workspace = game:GetService("Workspace")

								print(Workspace.House.Door:GetAttribute("IsOpen"))
								`,
							},
						],
					},
				],
			},

			{ t: "h", level: 2, text: "Writing scripts into the place" },
			{
				t: "p",
				text:
					"**Project → Export…** takes the project out as a zip, or its place file alone. For a " +
					"project with a place it says what **Modify RBXL** would write and add before you " +
					"choose; **Don't Modify RBXL** sends the place as it was. The project's own place file " +
					"is not changed either way. `roswaal export out.rbxl` writes the modified place to a file.",
			},
			{ t: "toolbar", bar: EXPORT_PANEL },
			{
				t: "p",
				text:
					"A script is found by the id the import recorded, or by its path, and a merged file is " +
					"written into every copy. A file whose script is not in the place yet — a graph made " +
					"since — is added, with a Folder for each part of its path the place does not have. " +
					"Nothing else in the place changes.",
			},
			{
				t: "table",
				head: ["Export says", "Why the file was not written"],
				rows: [
					["No service in the place for", "Its path starts at a service the place does not have"],
					[
						"More than one script with that path",
						"Two siblings share a name, so which one is meant is not certain",
					],
					[
						"A different kind of script in the place",
						"Module code where the place has a Script, or the other way round",
					],
					[
						"Still in the place, with no file now",
						"The file was removed or renamed. The script stays; delete it in Studio if it should go",
					],
				],
			},
		],
	};
}
