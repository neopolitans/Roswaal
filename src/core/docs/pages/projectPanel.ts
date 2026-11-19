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
					"The Project panel is a card on the left of the editor; the button after the mark " +
					"shows and hides it. It lists the project's files and, when the project has a place, " +
					"the place's instances.",
			},
			{ t: "toolbar", bar: PROJECT_PANEL_HEAD, hint: true },

			{ t: "h", level: 2, text: "The headings" },
			{
				t: "table",
				head: ["Heading", "Holds"],
				rows: [
					[
						"**Graphs**",
						"Your graphs, from the services down. The folder they live in is a setting, Settings › Compiling › Graphs live in, so it is not a row. **New graph** makes one at the top",
					],
					[
						"**Node maps**",
						"Where your files land in Studio. A map's row shows the project file it writes, green when written as the map has it, and **serve** on the one `rojo serve` reads. Unfold a map for what it syncs; a row opens the map there. **clash** marks two maps writing one file, and neither writes it. **New map** makes one at the top",
					],
					["**Packages**", "What `wally.toml` depends on. **Add** puts a package in"],
					[
						"**Place**",
						"The place in use, marked in use, and the others waiting in `.roswaal/places`. **Open** shows the place in use in the Place Editor; **Use** swaps a waiting one in, and is refused while Studio has either open. **Add** keeps a copy of the place, a place file or a baseplate there. A Roblox project with no place has **Add Place** here",
					],
					[
						"**Output**",
						"What Roswaal writes, and code it did not: `src/`, `place/`, `Packages/` and `.luaurc`. Luau there opens read-only. It starts folded",
					],
					[
						"**Node packs**",
						"The nodes the project adds. Double-click a pack to open Node Design. It starts folded",
					],
				],
			},
			{
				t: "p",
				text:
					"Each heading folds from the chevron by its name. Drop a file on **Graphs** to move it " +
					"to the top.",
			},

			{ t: "h", level: 2, text: "Colours and icons" },
			{
				t: "table",
				head: ["Icon", "Means"],
				rows: [
					[
						"A service's or container's own icon",
						"A folder named for it, as Studio's Explorer shows it",
					],
					["A node map in the corner", "A folder a node map syncs; hover it for the map"],
					["A faint folder saying empty", "A folder with nothing in it yet"],
					[
						"A dot after a graph or map",
						"Edits not saved yet, as on its tab. Hover a graph for its file and the Luau it compiles to",
					],
					["A grey outlined folder", "A plain folder"],
					["A grey filled folder", "A Folder a node map syncs, under Output"],
					[
						"A blue filled folder",
						"A script in Studio, with the rest of the folder as its children",
					],
					["A red filled folder", "`place/`: scripts only the place can hold"],
					["A purple filled folder", "`Packages/`: Wally's packages"],
					["A white or slate script", "A Script: white on a dark theme, slate on a light one"],
					["A green script", "A LocalScript"],
					["A blue script", "A ModuleScript"],
				],
			},

			{ t: "h", level: 2, text: "New graphs and folders" },
			{
				t: "p",
				text:
					"Point at a graph or a folder under Graphs and two buttons appear at its right: " +
					"**New graph** and **New folder**. On a folder they make one inside it. On a graph, " +
					"New graph asks whether inside it, as its child, or beside it, and New folder goes " +
					"beside it. Pressing one leaves the folder open or shut as it was. On a touch screen " +
					"they show on the row you tap.",
			},
			{
				t: "p",
				text:
					"**A yellow border** marks a graph or folder no node map syncs: its Luau is written, " +
					"and Rojo never sees it. A folder holding a synced one, as ReplicatedStorage holds " +
					"Tank, is not marked.",
			},

			{ t: "h", level: 2, text: "Menus" },
			{
				t: "table",
				head: ["Right-click", "Offers"],
				rows: [
					[
						"A folder or a file",
						"**New graph here** and **New map here** under Graphs, **New folder**, **Show in file manager**, **Rename** and **Delete**",
					],
					[
						"A graph",
						"**New graph…**, which asks where: inside it, as its child, or beside it in its folder. **Open Luau** opens the Luau it compiles to, read-only, and **Show Luau in file manager** finds it",
					],
					[
						"A `.luau` you wrote",
						'**Import as graph** as well: a new graph that compiles back to that file. Its prompt names the risks and asks what file-level locals become and how the graph reads. It is laid out in rows as the file reads, keeping its blank lines. Names and types stay as the file has them, and a name that hides a global or a service is flagged on its node. A line such as `local Players = game:GetService("Players")` becomes one of the graph\'s services, and a method call becomes its node where the importer knows what it is called on. The file stays as it is until you overwrite it, after seeing what changes',
					],
					[
						"A package, or Add on the Packages heading",
						"Adding and removing packages. See [Wally packages](wally-packages)",
					],
				],
			},

			{ t: "h", level: 2, text: "Scripts with children" },
			{
				t: "p",
				text:
					"**New graph…** on a graph puts the new one inside it, unless you choose Beside. " +
					"The first child makes the graph its folder's `init.nodescript`, so " +
					"`Greeter.nodescript` becomes `Greeter/init.nodescript`, and puts the child " +
					"beside it. It compiles to `Greeter/init.luau`, as Rojo makes a folder holding an " +
					"`init` file a script. The tree shows the folder as the script, named Greeter; " +
					"double-click it to open its graph. In Dynamic mode its Luau moves at once.",
			},
			{
				t: "p",
				text:
					"Drag the script to move it, children and all, or rename it. Its own " +
					"`init.nodescript` does not move alone. A child's module is " +
					"`require(script.Child)` from the script, and its Script Functions and types " +
					"are offered as any module's are.",
			},
			{
				t: "p",
				text:
					"Deleting a graph deletes the Luau Roswaal wrote for it. A script whose last child " +
					"goes stays in its folder, unless **Settings › Compiling › When the last child goes** " +
					"moves it back out.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"A graph and a folder of the same name side by side would be two instances Studio " +
					"calls by one name, so Roswaal refuses to make or move one beside the other.",
			},

			{ t: "h", level: 2, text: "Opening everything inside" },
			{
				t: "p",
				text:
					"`Shift` + click a folder, or an instance's arrow in DataModel, to open or close it " +
					"with everything inside it, as in Studio's Explorer.",
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
