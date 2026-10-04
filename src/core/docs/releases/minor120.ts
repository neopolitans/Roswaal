/**
 * Release notes for 0.120.0 to 0.129.x, newest first.
 *
 * One of the files `../releases.ts` puts together, a tenth of the minor
 * versions each, so the newest notes are not at the top of a very long file.
 */

import type { Release } from "../releases.js";

export const RELEASES_0_120: Release[] = [
	{
		version: "0.132.0",
		date: "2026-10-04",
		headline: "Shift+click opens or closes everything inside.",
		affects: ["editor", "docs"],
		added: [
			"**Shift+click a folder** in the Project panel, or an instance's arrow in DataModel, to open or close it with everything inside it, as in Studio's Explorer.",
		],
	},
	{
		version: "0.131.2",
		date: "2026-10-04",
		headline: "Node Design on a tablet: the type palette and the Luau sheet clear their neighbours.",
		affects: ["designer"],
		fixed: [
			"On a tablet, the pin types sit at the foot of the window, and rise clear of the action row only while the logic is nodes, home indicator included.",
			"On a tablet, the Luau sheet starts below the bar naming the pack and node, rather than under it.",
		],
	},
	{
		version: "0.131.1",
		date: "2026-10-04",
		headline: "Walkthrough pictures fill their frame.",
		affects: ["docs"],
		fixed: [
			"A walkthrough step showing the top row draws the canvas grid behind the whole row, not a strip beside it, and folds its buttons to their glyphs to fit.",
			"Nodemap basics draws the map panel at the column's width, so steps 2 to 7 no longer scroll sideways.",
		],
	},
	{
		version: "0.131.0",
		date: "2026-10-04",
		headline: "Prompts redrawn, and the tablet drawer brought into line.",
		affects: ["editor", "docs"],
		added: [
			"**A prompt says what it is about**: Delete lists what goes by name, and a graph changed on disk names its file.",
			"**Prompts name their keys**: Enter to confirm and Esc to cancel, at the foot.",
		],
		changed: [
			"Every prompt has a header with a badge in the colour of the question: the accent to make or open something, red to delete, amber when something needs deciding, grey for a notice. Close is at its end.",
			"Fields in a prompt sit beside bold labels, and New graph, New node map and New folder say under the name where it will be made.",
			"In a form, one of several is a row to pick, and the picked one is tinted.",
			"On a tablet, the Project and Variables drawer has its panels as tabs in its header, as a card does on a computer.",
			"The Project panel's lines under open folders start from the first folder, and stop short of a graph's own fold.",
		],
		fixed: [
			"The list of open tabs opens on an iPad and an iPhone.",
			"A choice between three answers no longer clips its buttons.",
		],
	},
	{
		version: "0.130.1",
		date: "2026-10-04",
		headline: "The docs' drawn Variables panel, tidied.",
		affects: ["docs"],
		fixed: [
			"In the docs' drawing of the Variables panel, the card's header no longer covers the edge of the lit section around it.",
		],
	},
	{
		version: "0.130.0",
		date: "2026-10-04",
		headline: "The panels redrawn: section headings, fields and the type picker.",
		affects: ["editor", "docs"],
		added: [
			"**The type picker lists its groups down the side**: press one to go to it. On a phone the list is left out.",
			"**Fold a section** of the Inspector, Properties or the type picker from its heading.",
			"**Roswaal types** draws each type with its wire colour.",
		],
		changed: [
			"Section headings in the Inspector, Properties, the Project panel, Variables and the type picker are the section's name in the accent colour, with a count and a line running on from it.",
			"The Inspector and Properties show what is selected as its name and kind beside a badge in its colour. The docs link is a button.",
			"In the Inspector a one-line field sits beside its label, and a parameter, field or return shows its wire colour, its type in the code face, and a remove that turns red on hover.",
			"Pins show their wire colour, filled going in and hollow coming out, with the type as a chip.",
			"Text fields are set into their panel, with an accent ring while you type. A read-only field has a dashed edge.",
			"Properties: values a weight above their names, references as a chip, true and false as a box, and Close is the card's ×.",
			"The Project panel: Graph Content and Compile Content, lines under open folders, a tinted selection, the open document in bold, and generated files no longer in italics.",
			"Script analysis shows No problems with a tick, or its counts as red and amber chips. Each entry leads with a mark.",
		],
		fixed: [
			"Properties shows code in a class's description as code rather than between backticks.",
			"The first step of the node map walkthrough no longer cuts off the end of the top row.",
		],
	},
	{
		version: "0.129.0",
		date: "2026-10-04",
		headline: "Building a node map, step by step.",
		affects: ["docs"],
		added: [
			"**Nodemap basics is a walkthrough**, as Getting started is: a map built from New node map to Write project file, with the panel drawn as it stands at each step and the control to press ringed.",
		],
		changed: [
			"The interactive map panel and its legend are under Building a node map.",
			"The Toolbars page draws a node map's tab in With a node map open.",
		],
	},
	{
		version: "0.128.0",
		date: "2026-10-04",
		headline: "Drag an instance from the DataModel into Custom Code.",
		affects: ["editor", "docs"],
		added: [
			'**Drop an instance into Custom Code** and the Luau that reaches it is written where you let go. On a blank line it is a whole local, such as local Tank = game:GetService("ReplicatedStorage").Tank; anywhere else, the path alone.',
			"**Properties and attributes drop too**, as the property read or a GetAttribute call.",
		],
		changed: [
			"While a code editor is open, the DataModel and Properties stay above it, and the editor moves aside to clear them.",
		],
	},
	{
		version: "0.127.0",
		date: "2026-10-04",
		headline: "Node maps and Luau files open in tabs of their own.",
		affects: ["editor", "docs"],
		added: [
			"**Node maps, Luau files and .luaurc files open in tabs** beside the graphs, instead of in place of them.",
			"**Every tab shows what it is**: the document icon for a graph, ƒ for a function, the node map icon, and Luau's script icon in the colour of the script it becomes.",
			"**Resize a node map's tree and Inspector** by dragging the line between them; double-click it to put it back. On a phone the line moves up and down.",
		],
		changed: [
			"A node map's tab is named after its file.",
			"Node maps with unsaved edits are all saved, not only the one in front.",
		],
		fixed: ["Opening a node map with two or more graphs open no longer closes all but the first."],
	},
	{
		version: "0.126.0",
		date: "2026-10-04",
		headline: "The release notes, easier to search and to link to.",
		affects: ["docs"],
		added: [
			"**Search the release notes**, and filter them by Added, Changed, Fixed or Breaking, and by Editor, Node Design or Docs. Folds holding a match open; clearing the search closes them again.",
			"**Jump to** a range of ten minor versions, such as 0.110–0.119.",
			"**Every release has its own link**, such as release-notes.html#v0.119.0. The front page's Lately cards use them.",
			"**New since your last visit**: releases newer than the last one this browser saw are marked New.",
		],
		changed: [
			"The latest release is a card at the top of the page, and every older one sits in its minor version's fold, which says what that version brought while closed.",
			"Each release is a card, with its entries as rows rather than a bordered table.",
		],
	},
	{
		version: "0.125.0",
		date: "2026-10-04",
		headline: "The front page, brought up to date.",
		affects: ["docs"],
		added: [
			"**The front page wears the windows' floating chrome**: the mark, Docs, Release notes, Source and Try it, still there once you scroll.",
			"**Three examples** to switch between: a player joining, a loop, and reading a file with Lune. Each is a docs graph beside the Luau it compiles to.",
			"**Lately**: the latest minor releases from the release notes, eight on a computer and six on a tablet or phone.",
			"**Works with what you have**: Rojo, place files, Wally, Lune, your own Luau modules and stylua, each linked to its docs page.",
			"**Inside the editor** adds On Event, places and Rojo projects, and panels that float and dock, and each card names the version it arrived in.",
		],
		changed: [
			"Try it and Getting started are in the banner, with Roblox, Lune, the licence and the devices under them.",
			"The feature cards are drawn as nodes, and the planned ones as dashed nodes not yet placed.",
			"The cards say stylua formats the output when it is installed.",
			"On a phone the example graph's frame is shorter, and the banner's graph is left out.",
		],
		fixed: ["What is planned no longer lists event nodes for instances, which shipped in 0.119.0."],
	},
	{
		version: "0.124.0",
		date: "2026-10-04",
		headline: "A new start page, and a new node packs page.",
		affects: ["editor", "designer", "docs"],
		added: [
			"**The start page** wears the floating chrome the other windows do, with Docs and Node Design in reach before a project is open.",
			"**Recent projects are cards**: what each compiles for, how many graphs it has, and when it was last opened. A project that has gone says so. Past five, a filter.",
			"**The demos are on the start page**, to take a copy of.",
			"**Node packs: one search** over packs and the nodes in them. Press `/` to search.",
			"**Node packs: a filters card**, for this project's packs, the built-in ones, and what they run on.",
			"**Click a pack to look inside**: its nodes are listed beside the packs, each one to open. Double-click, Enter or **Open pack** opens the pack.",
			"**A pack's card shows its nodes** in their colours, and has **New node**. The rest is in its menu.",
			"**Each section folds** from beside its count.",
		],
		changed: [
			"The path field says what is there as you type, with the project's runtime and graph count.",
			"When the daemon is not answering, the start page shows `roswaal serve`, ready to copy.",
			"Node packs' cards are solid and tinted, over the canvas grid.",
			"Deleting a pack asks in a dialog.",
			"Node Design draws the canvas grid behind Luau logic, as it does behind nodes.",
			"In Node Design on a computer, or a tablet held sideways, the Luau and Nodes switch is beside Details in the top row.",
			"Under the node's plate, each side shows its pin count between its − and + buttons.",
		],
	},
	{
		version: "0.123.0",
		date: "2026-10-04",
		headline: "A synced folder follows its node map path.",
		affects: ["editor", "docs"],
		added: [
			"**Changing an entry's path in a node map moves its folder** on the next compile: the folder Rojo syncs and the graphs that compile there go to the new path, and the graphs compile there. Open graphs follow. Into a folder that already has files, the editor asks first, and `roswaal compile` takes `--merge`.",
			"**Script analysis lists unsynced graphs**: a graph whose Luau goes to a folder no node map syncs, such as after its entry was removed.",
			"**Dynamic mode covers node maps**: saving one rewrites its project file. Folders are moved and made by the map's own compile, so a path still being typed moves nothing.",
		],
		changed: [
			"**Compile project** writes the node maps before the graphs, in the editor and in `roswaal compile`.",
		],
	},
	{
		version: "0.122.3",
		date: "2026-10-04",
		headline: "The published docs' mark sits in its group.",
		affects: ["docs"],
		fixed: [
			"**The mark on the published docs** is drawn as the Docs window draws it, the height of the groups beside it, where it had kept its old chip's border inside the new group.",
		],
	},
	{
		version: "0.122.2",
		date: "2026-10-04",
		headline: "The published docs float their contents, as the Docs window does.",
		affects: ["docs", "editor"],
		changed: [
			"**The published docs** have the Docs window's layout: floating groups along the top with the search beside the mark, and the contents and the outline as cards over the page that fold away and say where you are.",
			"**A card's header controls** are a size smaller, so they sit inside the header rather than filling it.",
		],
	},
	{
		version: "0.122.1",
		date: "2026-10-04",
		headline: "A dragged card docks only near an edge.",
		affects: ["editor"],
		fixed: [
			"**A dragged card offers to dock** only within a short reach of the window's edge, or over that dock's own column. It offered from a fifth of the way across.",
			"**The outline of a dock** a card would land in is drawn where the dock would be, under the top row and above the status pill.",
		],
	},
	{
		version: "0.122.0",
		date: "2026-10-04",
		headline: "Cards share their dock, take tabs, and say which one you are in.",
		affects: ["editor", "docs"],
		added: [
			"**Every card has a header**: its title, what its panel puts there (the project's name and Files | DataModel, Variables' Add), a fold, and a menu. The card you last used has its header lit.",
			"**Tabs.** Drop a card on another card's header and they share it as tabs. Drag one tab out to move it on its own.",
			"**Cards share their dock's height.** Drag the line between two to trade height between them; double-click it to share it evenly. A card alone in its dock is as tall as what it shows.",
			"**Drop a card above or below another**, by its upper or lower half, as well as at an edge or onto the graph.",
			"**A card's menu** moves it without dragging, separates a tab, folds it, closes it, and shows a closed panel again.",
			"**A window resizes from any edge or corner.**",
		],
		changed: [
			"**Double-clicking a card's header** folds it to the header.",
			"**The docs' drawings** of the editor, the Project panel and the Variables panel show the cards' headers, and [Controls](controls) lists the new gestures.",
		],
	},
	{
		version: "0.121.3",
		date: "2026-10-04",
		headline: "Phones and tablets get their room back.",
		affects: ["editor", "designer", "docs"],
		changed: [
			"**The canary** is marked by its yellow mark alone: the banner across its editor, Node Design and docs is gone.",
			"**On a phone**, a node map, a source file and the aliases are one column the width of the screen, ending above the status pill. Source files and the selection preview wrap long lines.",
			"**On a phone or a tablet**, the status pill is one row when there is nothing to report, and the side strip keeps clear of it and of the top row. On a short screen the strip leaves out its slider.",
			"**On a tablet**, Compile project and Compile script show their glyphs where the top row is short of room.",
			"**The docs' header** is one row on a phone.",
			"**Node Design on a phone** draws the node smaller where it would not fit across the screen.",
		],
		fixed: [
			"**Text on an iPhone** is no longer enlarged in places, such as the selection preview's notes.",
			"**The pin counts under a node** stay on one line with a touch screen's larger buttons.",
			"**The docs' window diagrams** keep the device's own button size, fit a phone's column, and no longer draw over the contents drawer.",
		],
	},
	{
		version: "0.121.2",
		date: "2026-10-04",
		headline: "Getting started steps through the whole window.",
		affects: ["docs", "editor"],
		changed: [
			"**Getting started** steps through drawings of the whole window, at the width of the page: the editor, its projects panel, the Project menu and the start page, on a computer or a tablet.",
			"**Node Design's pictures** on [The interface](the-interface) draw the node on its plate, and the problems line where a phone has it, under the pack bar.",
		],
		fixed: [
			"**No number on a window diagram** is drawn under a card or over another number.",
			"**The start page** names a recent project by its folder, where on Windows it showed the whole path twice.",
		],
	},
	{
		version: "0.121.1",
		date: "2026-10-04",
		headline: "The docs' window diagrams fill their column.",
		affects: ["docs"],
		changed: [
			"**The window diagrams** on [The interface](the-interface) fill the width of the page, and the desktop stands on a monitor. A lit part has a bolder outline, and every number sits above what it labels.",
			"**The editor's top row** on [Toolbars](toolbars) fits the page: where it is short of room, Compile project and Compile script show their icons, as the editor does in a narrow window.",
		],
	},
	{
		version: "0.121.0",
		date: "2026-10-04",
		headline: "Every window floats its controls over the work.",
		affects: ["editor", "designer", "docs"],
		added: [
			"**The graph fills the window.** The top bar and the graph's tools are one row of floating groups: the project and the open graph at the left, compiling and the other windows at the right. Where the row is short of room, the less used half folds into More.",
			"**Project, Variables and the Inspector are cards** over the graph, with the status pill below them. On a tablet they open from the top groups and close when you tap the graph; on a phone they are sheets from a bar along the bottom.",
			"**The side strip**: zoom, undo, redo and fit, along the bottom with a mouse and down the left edge on a touch screen.",
			"**Two fingers tapped on the graph undo, and three redo.**",
			"**Notices** drop from the top of the window and say what happened: what a compile wrote, a wire that was refused.",
			"**With nothing selected, the Inspector shows the graph's settings**: what it compiles to, its type checking and its target, which have left the toolbar.",
			"**Node Design** floats too: the logic fills the window, the node's preview is a card in the top right that folds away, with the selected pin's settings and the node's details under it, and the pin types dock at the bottom right.",
			"**The docs window's search** is beside the mark.",
		],
		changed: [
			"**A node map, a source file and the aliases** open as a sheet on the canvas, between the cards.",
			"**On a phone**, the mark carries the window's glyph in grey: a graph, the palette, or a page.",
			"**Switches** are lit with a tint rather than filled, as a held tool is.",
			"**The docs window's contents and outline** are cards over the page that fold to where you are, and the page scrolls the whole width. Scrollbars are thin everywhere.",
			"[The interface](the-interface), [Toolbars](toolbars) and [Controls](controls) draw and describe the new layout.",
			"**Name in the graph tools** is gone from Settings: the graph's tab names it.",
		],
	},
	{
		version: "0.120.1",
		date: "2026-10-04",
		headline: "Plain folders are grey, and DataModel drags onto a graph.",
		affects: ["editor", "docs"],
		changed: [
			"**Plain folders** in the project tree and the DataModel list are grey rather than cream. Blue, purple and red are left for services, packages and place/.",
		],
		fixed: [
			"**An instance in the DataModel list** can be dragged onto a graph for an Instance node at its path, as its name in Properties could.",
		],
	},
	{
		version: "0.120.0",
		date: "2026-10-04",
		headline: "A node map makes the folders it syncs.",
		affects: ["editor", "docs"],
		added: [
			"**Writing a node map makes the folders it syncs**: each folder under src the map points at, and the folder mirroring it under .roswaal/scripts, so a graph has somewhere to go. The Status panel lists what was made, and the map's Path field says made on compile until then.",
		],
		changed: [
			"**Folders a node map syncs** are drawn filled, plain ones outlined: blue for a service or container, cream for a Folder. Under Graph content, the folder mirroring one is drawn as it is.",
			"**Corners, shadows and text sizes** outside the canvas follow one scale: three corners, three shadows and seven text sizes.",
		],
		fixed: [
			"**Removing the last script in a folder a map syncs** leaves the folder, rather than turning the map's next write into an error.",
		],
	},
];
