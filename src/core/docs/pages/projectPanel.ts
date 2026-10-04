/**
 * The `project-panel` page of the documentation. `buildSite` places it.
 */

import type { DocPage } from "../site.js";
import { PROJECT_PANEL_HEAD } from "../toolbars.js";

/**
 * The left-hand panel, part by part: the two lists, the colours and icons,
 * the menus, and the switch to the place's DataModel. A page of its own
 * because the panel holds more — Wally, places, script kinds — than the
 * Interface page's one line about it can cover.
 */
export function projectPanelPage(): DocPage {
	return {
		slug: "project-panel",
		narrow: true,
		title: "The Project panel",
		summary:
			"The project's files and its place's DataModel, and what each colour, icon and menu in them means.",
		blocks: [
			{
				t: "p",
				text:
					"The Project panel is on the left of the editor. It lists the project's files and, " +
					"when the project has a place, the place's instances.",
			},
			{ t: "toolbar", bar: PROJECT_PANEL_HEAD, hint: true },

			{ t: "h", level: 2, text: "Graph content and Compile content" },
			{
				t: "p",
				text:
					"**Graph content** is what you edit: `.roswaal/` with its graphs and node maps, " +
					"`.luaurc` and `wally.toml`. **Compile content** is what they compile to and what " +
					"sits beside it: `src/`, `place/` and `Packages/`. Luau there opens read-only in the " +
					"Luau viewer.",
			},

			{ t: "h", level: 2, text: "Colours and icons" },
			{
				t: "table",
				head: ["Under Compile content", "Means"],
				rows: [
					["A cream outlined folder", "A plain folder"],
					["A cream filled folder", "A Folder a node map syncs"],
					[
						"A blue filled folder",
						"A service, a container or a script in Studio. Under Graph content too, for the folder mirroring one",
					],
					["A red filled folder", "`place/`: scripts only the place can hold"],
					["A purple filled folder", "`Packages/`: Wally's packages"],
					["A white or slate script", "A Script: white on a dark theme, slate on a light one"],
					["A green script", "A LocalScript"],
					["A blue script", "A ModuleScript"],
				],
			},

			{ t: "h", level: 2, text: "Menus" },
			{
				t: "table",
				head: ["Right-click", "Offers"],
				rows: [
					[
						"A folder or a file",
						"**New graph here** and **New map here** under `.roswaal/`, **New folder**, **Show in file manager**, **Rename** and **Delete**",
					],
					[
						"`wally.toml`, or a package under it",
						"Adding and removing packages. See [Wally packages](wally-packages)",
					],
				],
			},

			{ t: "h", level: 2, text: "Dragging from the tree" },
			{
				t: "p",
				text:
					"Drag a graph or a `.luau` onto the canvas for **Require Module** with its path filled " +
					"in, or **Instance** for a reference to it. Drag a file onto a folder to move it.",
			},

			{ t: "h", level: 2, text: "Files and DataModel" },
			{
				t: "p",
				text:
					"With a place, **Files** and **DataModel** sit at the right of the panel's heading. " +
					"DataModel lists the place as Studio's Explorer does. Double-click an instance for " +
					"**Properties**, on the right under the Inspector; on a tablet or a phone, double tap " +
					"and it slides out. [Places and Rojo projects](places-and-rojo) has the rest.",
			},
		],
	};
}
