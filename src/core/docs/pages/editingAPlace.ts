/**
 * The `editing-a-place` page of the documentation. `buildSite` places it.
 */

import { GUIDE_SCENES } from "../examples.js";
import type { DocPage } from "../site.js";
import { DATAMODEL_BROWSER, EXPORT_PANEL, PROPERTIES_PANEL } from "../toolbars.js";
import { code } from "./blocks.js";

/**
 * A place file in the project: starting from one, browsing and editing its
 * DataModel, dragging from it, and writing scripts back into it. Drawing it in
 * 3D is the Place Editor's, on *The place in 3D*.
 */
export function editingAPlacePage(): DocPage {
	return {
		slug: "editing-a-place",
		narrow: true,
		title: "Editing a place",
		summary:
			"Starting from a place file, browsing and changing its instances, and writing your scripts back into it.",
		blocks: [
			{
				t: "p",
				text:
					"A project can keep its place, the `.rbxl` or `.rbxlx` Studio opens. This page is " +
					"bringing one in, browsing and changing its instances, and writing your scripts into " +
					"it. Drawing it in 3D is on [The place in 3D](place-in-3d); Rojo projects are on " +
					"[Rojo projects and node maps](rojo-projects).",
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
					"**Export** includes it.",
			},

			{ t: "h", level: 2, text: "Browsing the place" },
			{
				t: "p",
				text:
					"When the project has a place, the Project panel switches between **Files** and " +
					"**DataModel**. DataModel lists the place's instances as Studio's Explorer does: its " +
					"usual services first and children by name. It lists the services that hold something " +
					"and those the project's Luau reaches. **Add Service to Explorer** opens the rest, " +
					"grouped and searchable, and the one picked is listed from then on. Filter by name, " +
					"or by a class name typed in full.",
			},
			{ t: "toolbar", bar: DATAMODEL_BROWSER, hint: true },
			{
				t: "p",
				text:
					"`Shift` + click adds an instance to what is picked, or takes it out. `Ctrl` + click, " +
					"`Cmd` on a Mac, picks every row from the last one you picked. What is picked here is " +
					"picked in the 3D view too.",
			},
			{
				t: "p",
				text:
					"Double-click or double-tap an instance to open the **Properties** panel on the right: " +
					"its properties, tags and attributes under Studio's headings. While it is open it follows " +
					"what you pick, and a reference goes to what it names. For a script a project file " +
					"writes, **Open** opens that file, and its graph when one generates it. An asset id " +
					"links to its page on the Creator Store. The pin in its header keeps what it shows in a " +
					"window of its own, which you can move and resize, and Properties goes on following " +
					"what you pick: pin as many as you like.",
			},
			{ t: "toolbar", bar: PROPERTIES_PANEL },

			{ t: "h", level: 2, text: "Changing properties" },
			{
				t: "p",
				text:
					"Turn on **Settings → Workspace → Modify DataModel Instances** and Properties changes " +
					"values as well as showing them. Click a value to type over it, tick a box, pick from a " +
					"list, or pick a colour from its swatch. `Enter` writes it; `Esc` puts it back.",
			},
			{
				t: "p",
				text:
					"Changes show at once and reach the place file when you save: `Ctrl` + `S`, or **Save** " +
					"in the bar. Until then the place's tab has a dot, and closing it or leaving the page " +
					"asks first. A save keeps a copy of the file as it was in `.roswaal/backups`, unless " +
					"Roswaal saved it last. If Studio saves the file meanwhile, you pick which to keep.",
			},
			{
				t: "table",
				head: ["Can be changed", "Not yet"],
				rows: [
					[
						"True or false, numbers, text, enums, colours and BrickColors; vectors, sizes, UDims, " +
							"UDim2s, ranges and rects, a field a component; CFrames, as a Position and an " +
							"Orientation in degrees; and references, picked from the place's instances of the " +
							"class they take. On properties a script can set. Attributes and tags too, added " +
							"and removed with the + and × beside them, and names, on anything but a service",
						"Scripts' source, which is the project's to write",
					],
				],
			},
			{
				t: "note",
				kind: "warn",
				text: "**Close the place in Studio first.** Studio's next save puts back the values it has.",
			},

			{ t: "h", level: 2, text: "Adding, moving and deleting instances" },
			{
				t: "p",
				text:
					"With the same setting on, an instance's menu in DataModel adds a child, duplicates it " +
					"or deletes it. Right-click it, or pick it and press its **⋯**. Drag an instance onto " +
					"another to move it there.",
			},
			{
				t: "table",
				head: ["Change", "What happens"],
				rows: [
					[
						"Add Child…",
						"Pick a class. The new instance is named after it and starts with Studio's defaults for a fresh one",
					],
					[
						"Duplicate",
						"A copy beside it, with new ids. References inside the copy point into the copy",
					],
					[
						"Delete",
						"It goes, with everything in it. What pointed at it points at nothing. A script a project file writes is unlinked; the file stays",
					],
					["Drag onto another", "It moves there, and links to scripts in it follow"],
				],
			},
			{
				t: "p",
				text:
					"Services stay where they are, and a class Studio only puts in one kind of parent, such " +
					"as a **WrapLayer** in a MeshPart, is only offered there.",
			},
			{
				t: "p",
				text:
					"`Ctrl` + `Z` undoes the last change to the place, a deletion included, and `Ctrl` + " +
					"`Y` redoes it, from the place's tab, DataModel or Properties, saved or not. On a graph " +
					"they undo the graph.",
			},

			{ t: "h", level: 2, text: "Dragging onto a graph" },
			{
				t: "table",
				head: ["Drag from Properties", "What it makes"],
				rows: [
					[
						"A property",
						"An **Instance** node at the instance's path, cast to its class, wired into **Get Member**, typed as the property is",
					],
					[
						"A property, with `Ctrl` held as you drop",
						"The same, into **Set Property**. A read-only property stays a Get Member",
					],
					["An attribute", "**Get Attribute**, or **Set Attribute** with `Ctrl`"],
					["The instance's name", "The Instance node alone"],
				],
			},
			{
				t: "p",
				text: "An instance dragged from the DataModel list makes the Instance node alone too.",
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

			{ t: "h", level: 2, text: "Dragging into code" },
			{
				t: "p",
				text:
					"Drop an instance, a property or an attribute into **Code Block**'s editor and it " +
					"writes the Luau that reaches it, where you let go. The DataModel and Properties " +
					"stay above the editor while it is open, to drag from.",
			},
			{
				t: "table",
				head: ["Dropped on", "What it writes"],
				rows: [
					[
						"A blank line of Code Block",
						'`local Tank = game:GetService("ReplicatedStorage").Tank`',
					],
					["Anywhere else, or a box that holds one value", "The path alone"],
				],
			},

			{ t: "h", level: 2, text: "Writing scripts into the place" },
			{
				t: "p",
				text:
					"**Export**, beside Settings in the top bar, takes the project out as a zip, or its " +
					"place file alone. `Ctrl` + `Shift` + `E` opens it too, and **Project → Export…** is " +
					"still there. For a project with a place it says what **Modify RBXL** would write and " +
					"add before you choose; **Don't Modify RBXL** sends the place as it was. The project's " +
					"own place file is not changed either way. `roswaal export out.rbxl` writes the " +
					"modified place to a file.",
			},
			{
				t: "p",
				text:
					"**Save as** writes the place as `.rbxl`, or as Legacy `.rbxlx`, whichever the project " +
					"keeps. A place saved in the other format leaves out the kinds of property Roswaal " +
					"cannot write yet, and the menu names them first. When a graph has changed since it was " +
					"compiled, **Compile first** compiles it before the export. Ticked, **Start with these " +
					"choices** keeps them in `roswaal.json`, and Settings → Compiling → Exporting shows them.",
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
