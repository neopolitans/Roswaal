/**
 * Release notes for 0.120.0 to 0.129.x, newest first.
 *
 * One of the files `../releases.ts` puts together, a tenth of the minor
 * versions each, so the newest notes are not at the top of a very long file.
 */

import type { Release } from "../releases.js";

export const RELEASES_0_120: Release[] = [
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
