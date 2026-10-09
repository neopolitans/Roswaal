/**
 * Release notes for 0.120.0 to 0.129.x, newest first.
 *
 * One of the files `../releases.ts` puts together, a tenth of the minor
 * versions each, so the newest notes are not at the top of a very long file.
 */

import type { Release } from "../releases.js";

export const RELEASES_0_120: Release[] = [
	{
		version: "0.164.1",
		date: "2026-10-09",
		headline: "A mouse wheel scrolls the tab rows sideways.",
		affects: ["editor"],
		fixed: [
			"**The graph tabs, and the Code panel's tabs, scroll with a mouse wheel.** Both rows scroll sideways with their scrollbars hidden, which a trackpad does by itself; a mouse wheel turns only up and down, so on Windows the tabs past the edge could not be reached with it. Turning the wheel over a row that has more tabs than it shows now scrolls it sideways.",
		],
	},
	{
		version: "0.164.0",
		date: "2026-10-09",
		headline: "The technical specification as a site of its own, at spec.roswaal.app.",
		affects: ["docs"],
		added: [
			"**The specification has a site of its own**, built for spec.roswaal.app and previewed at `/technical/` on the canary. It loads its own small stylesheet and script and nothing of the editor's: a chapter is about 15 KB to read, against about 340 KB as a page of the docs, and its search, over the specification alone, loads the first time it is used.",
			"Each chapter has its own address, such as `/visual-grammar/`, and a sidebar of the chapters and the sections of the one being read. On a phone the chapters fold into a Chapters button.",
			"**Each draft keeps an address of its own**: the latest draft is at the root, and Draft 0.1 is also at `/0.1/`, where it stays as published once a newer draft replaces it.",
			"It is drawn in Roswaal's own light and dark themes, read from the themes the editor ships, with the same node pictures as the docs.",
		],
		changed: [
			"The specification stays in the Docs panel too, built from the same pages. Its front page and §14.1 say where it is published, and which address to cite.",
		],
	},
	{
		version: "0.163.1",
		date: "2026-10-09",
		headline: "Luau Expression's mark sits inline, as a value's glyph does.",
		affects: ["editor", "docs"],
		fixed: [
			"Luau Expression drew its `ƒx` in a box with an edge of its own, a tab a value node does not have. It now sits before its name as every other value's glyph does, on the canvas and in the documentation's pictures.",
		],
	},
	{
		version: "0.163.0",
		date: "2026-10-09",
		headline: "Tidier function headers, and any parameter or output removed from where it is.",
		affects: ["editor", "docs"],
		added: [
			"**A grey × beside each entry a node can lose**: a function's parameters, a call's arguments, Sequence's outputs, a Return's results, Module Exports' entries and Make Dictionary's rows. It takes that one away, wherever it is, and the wires and values on the ones after it move up with them. It shows when you point at the node or select it, and not when the node is at its minimum.",
			"**An Add row under a node that grows**, also on hover or selection: **+ Add parameter**, **+ Add argument**, **+ Add output** and so on. It always adds at the end. A problem note under such a node sits a row lower, so it never covers the row.",
		],
		changed: [
			"**A function's header is its name over its types.** Function and Declare Function show `(Model, BasePart) → boolean`, each type in its pin's colour, in place of the names and types together, which were cut short: the names are on the pins below. Both take the ƒ glyph, where the hoisted Function had the play glyph of an entry, and Return takes an arrow back in place of the stop square.",
			"The − and + have left the headers of nodes that grow, for the Add row and the ×. An operator keeps its own beside its symbol.",
			"**Code Block, Luau Expression and Declare Type carry the Code panel's marks**: `{ }`, `ƒx` and `<T>` in their corner tab, in the code face and the theme's code colours, on the code editor's own surface, so a node and its tab in the Code panel read as one thing.",
			"The technical specification says how adding and removing entries behaves (§4.5) and what a function's header shows (§5.4).",
		],
		fixed: [
			"**Removing a parameter, a result or an export in the Inspector no longer moves wires onto the wrong pin.** Taking out any but the last left the wires of the ones after it on their neighbours, and the last one's pointing at a pin that no longer existed. It now renumbers as the × does.",
			"**A getter's name is no longer cut short on a Mac.** Capsules were estimated a little narrow for the system face there, so a name such as AccumulateNum read “Accumulate…”. Every getter is a few pixels wider.",
			"A call wired from a declared function no longer offers to add arguments, which it takes from its function.",
		],
	},
	{
		version: "0.162.0",
		date: "2026-10-09",
		headline:
			"The technical specification, Draft 0.1: Roswaal's design written so another editor can follow it.",
		affects: ["editor", "docs"],
		added: [
			"**The technical specification**, at roswaal.app/technical, in [the docs](technical) and in the Docs panel, under a heading of its own. Fourteen chapters in three parts: the principles, abstractions, interactions, visual grammar, types, execution, accessibility and file format that hold in every language; how to write a profile for a new language, with Luau for Roblox and Luau for Lune as the first two; and how conformance will be checked and the specification changed.",
			"Each page says whether it is **Normative**, binding an implementation in the words of RFC 2119, or **Informative**, and that it is **Draft 0.1**. Nothing in a draft is promised until 1.0.",
			"Its tables of numbers are **generated** from Roswaal's own source as the pages are built: node geometry, the drawing layers, the grid and zoom, the pin families, the theme roles, the built-in library by category, and the connection rule, whose examples are the compiler's own answers.",
			"Where Roswaal does not yet do what the specification asks, the page says so beside the requirement: the canvas cannot yet be used from the keyboard or by a screen reader, and pins do not grow for a finger.",
		],
		changed: [
			"[Wires and pins](wires-and-pins) describes the pin shapes and type chips, and value nodes as rounder with no header bar. Adding and removing pins, and [Coming from Blueprints](coming-from-blueprints), describe the controls and flow pins as 0.161 draws them.",
		],
		fixed: [
			"**A getter, an operator and a reroute knot show their type underneath**, centred, rather than in a chip beside their output, where it cut a getter's name short, covered an operator's symbol and sat on top of a knot's pin.",
			"**A handler whose body reads its own connection** now works. A Body that disconnected its own Connection compiled to `local connection = …:Connect(function() connection:Disconnect() end)`, where the `connection` inside the function is not yet the local and so is nil. The local is now declared first and assigned by the connect.",
		],
		watch: [
			"The documentation's pictures of getters, operators and knots do not show the type under them yet.",
			"Draft 0.1 publishes no conformance fixtures or checker; its Conformance chapter says what is planned.",
		],
	},
	{
		version: "0.161.0",
		date: "2026-10-09",
		headline:
			"Nodes redrawn to be read: a quieter header, pins shaped by kind, types in words, problems in plain sight.",
		affects: ["editor", "designer", "docs"],
		added: [
			"**A glyph for every category**, in a tab in the header's corner: the full height of the header, in the category's colour, with an 18px glyph drawn for the purpose. It stays readable with a whole graph in view, where the old header colour was the only cue.",
			"**Pins are shaped by what they carry.** A plain value is a circle, an Instance or any class a rounded square, a table a diamond, a function a dot in a ring, and an event to listen to a hexagon. Colour still says the exact type; the shape says the kind without it.",
			"**Outputs say their type in words** where the pin's name does not already: a short name in a chip of the type's colour, so `RBXScriptConnection` reads Connection. A pin called player holding a Player, or one with no fixed type, has no chip.",
			"**Pointing at a type chip opens the type's card**, the same one the Code panel shows: what it is, from Roblox's Creator Documentation, and a link to its page. On a touch screen, a tap opens it and a tap elsewhere closes it.",
			"**A problem is written out under its node**, above everything else in the graph: no node, comment or wire covers it, and only the panels and menus do. The pin it names is marked in red in the node.",
		],
		changed: [
			"**Headers are a tint of their category** with the title in the ordinary text colour, in place of a solid bar with white text. Pin names are drawn nearly in the text colour rather than grey.",
			"**The flow in and the flow on ride the header**, level with its middle, so a run of steps is joined header to header and reads straight across. A named flow pin, such as Body, True or Then 0, keeps its row. Most steps are a row shorter for it.",
			"**Flow triangles are drawn in the flow wire's colour**, dark on a light canvas and light on a dark one, rather than a pale grey that all but disappeared against a light node.",
			"**A pure node is rounder, with no header bar**: its name and glyph are in its category's colour, on a faint wash of it. The green stripe down its left edge is gone; the scheme colour that drew it now tints the outline.",
			"**The − and + on a node that takes a list appear on hover or selection**, and are hidden at rest. On a touch screen, select the node to show them. The documentation's node pictures no longer draw them.",
			"Node corners are 8px, from 7px.",
		],
		watch: [
			"**Graphs keep their positions**, but most steps are now a row shorter, so a node that was placed snugly under one has more room below it than before.",
			"A type from one of the project's own modules has no card yet: the chip shows its name, and pointing at it opens nothing.",
		],
	},
	{
		version: "0.160.3",
		date: "2026-10-09",
		headline: "The attributions grid's names sit in the middle of their cells.",
		affects: ["editor", "docs"],
		fixed: [
			"In the Attributions page's Simple grid, a name that wraps, such as **Luau logo (canary)**, sits in the middle of its cell rather than to the left of it. The grid took the docs' table spacing, with none on a cell's left and more on its right, which only showed once a name filled its cell.",
		],
	},
	{
		version: "0.160.2",
		date: "2026-10-08",
		headline: "A name that wraps in the attributions grid stays centred.",
		affects: ["editor", "docs"],
		fixed: [
			"In the Attributions page's Simple grid, a name too long for one line, such as **Creator Documentation**, centres each of its lines in the cell, as a name on one line does, rather than keeping them to the left.",
		],
	},
	{
		version: "0.160.1",
		date: "2026-10-08",
		headline: "The attributions grid centred, and two of the bars' details put right.",
		affects: ["editor", "designer", "docs"],
		fixed: [
			"The Attributions page's Simple grid centres every cell and heading, leaving only the rights holders down the left, clear of the border.",
			"With a node map or a `.luau` script open, the cluster naming it on the top row is as tall as the tabs and tools beside it, rather than two pixels short.",
			"On the Toolbars page, Node Design's pack bar draws **Preview or Logic** and **Luau or Nodes** as two switches, each in its own box, as a phone shows them, rather than one row of four.",
			"*Getting started*, *The Interface*, *Controls*, *Toolbars* and *Attributions* are marked as read again, on 8 October 2026.",
		],
	},
	{
		version: "0.160.0",
		date: "2026-10-08",
		headline: "Attributions you can find yourself in: by holder, at a glance or in full.",
		affects: ["editor", "docs"],
		added: [
			"**The Attributions page is a browser.** **Simple** shows every rights holder on one screen against the seven ways Roswaal uses their work; pick a name to find it in **Advanced**, the list by holder, with search, a filter for each usage type, and a link to every holder.",
			"**Every licence opens from its entry.** The licence beside an entry is a button that opens the licence itself, exactly as Roswaal carries it: in the editor's read-only view in the app's docs, and as numbered lines on the website. The notices file opens the same way.",
			"**Seven usage types**, each with what it means: Included, Quoted, Written for, Works with, Example, Inspired by and Named after. They replace the four headings the page had, one of which covered both code that ships and tools that never do.",
		],
		changed: [
			"Each holder's trademark line is above its entries, once. The name Roswaal is an entry of its own, under its notice.",
			"`ATTRIBUTIONS.md` is one table by rights holder, with the usage type of each entry.",
		],
	},
	{
		version: "0.159.0",
		date: "2026-10-08",
		headline: "Every licence Roswaal carries travels with it, and opens to its exact text.",
		affects: ["editor", "designer", "docs"],
		added: [
			"**A notices file beside every build.** The editor, the web app and `roswaal serve` each carry the licence of every open-source package they bundle in `THIRD-PARTY-NOTICES.txt`, copied from the package's own licence file, and the release binaries carry Node.js's too. It is read from what the build actually contains, and a bundled package with no licence file stops the build.",
			"**Each release zip has the notices file beside the binary.**",
			"**Licences open to their exact text.** **Settings → Licences** lists every licence Roswaal carries; each opens, read-only and with line numbers, to the text exactly as published, with where it was copied from, the day, and its SHA-256 to check against the original. The Attributions page shows the same, and this build's notices file is a row of its own.",
			"Three licences Roswaal had not carried until now: Apache-2.0 for the icons (Material Symbols), MPL-2.0 for Lune's type definitions, and CC BY 4.0 for the summaries from Roblox's Creator Documentation, each copied unchanged from its holder's repository.",
			"**How Roswaal is made**, in Settings, under the Attributions list and in the README: designed and directed by its maintainer, with much of the code written with Claude, Anthropic's AI model, and nothing of Anthropic's in it.",
			"Node.js, the bundled open-source packages, Affinity and Procreate are on the Attributions page and in `ATTRIBUTIONS.md`.",
		],
		changed: [
			'Every attribution says, in one sentence, what Roswaal does with it, and either where it is or that nothing of theirs ships. Where nothing ships, the licence reads **None needed** rather than "not licensed to us". Trademark lines are said once per holder, and that Roswaal is not affiliated with anyone listed, once for the page.',
			"`roswaal serve` from a release binary no longer caches files other than the editor's hashed assets for a year, so an upgrade is seen at once.",
		],
	},
	{
		version: "0.158.1",
		date: "2026-10-08",
		headline:
			"Cards hand back the room they do not use, and the completion list follows the pointer.",
		affects: ["editor"],
		fixed: [
			"Two cards sharing a dock are each no taller than what they show. Folding a section of the Project panel hands the room it leaves to the card below, Variables say, and opening it takes the room back; before, each kept its share of the column, empty or not.",
			"The completion list hangs a few pixels clear of the line, so the accent underline under the word you are typing shows rather than merging with the list's edge. The word itself has a faint cream wash over it, in Node Design's logic field as well as the Code panel.",
			"Moving the pointer over an answer in the completion list picks it, as the arrow keys do, so Enter or Tab takes the one you are pointing at. The arrow keys still carry on from there with the pointer resting on the list.",
		],
	},
	{
		version: "0.158.0",
		date: "2026-10-08",
		headline:
			"The web app's docs are part of it: Docs switches in place, and documents your own packs.",
		affects: ["editor", "docs"],
		added: [
			"**Docs in the web app is a page of the app**, as it has always been under `roswaal serve`. The mode strip switches to it in place, like Node Design, so going to the docs and back loads nothing, and the editor and the page you were reading are both as you left them.",
			"**Your project's own packs are documented there**: each node gets its page, its picture and what it compiles to, beside the built-in library, and the search finds them.",
		],
		changed: [
			"Links to the docs from the web app (a node's page from the Inspector, the projects screen, Ctrl+K) open the app's docs at `docs.html` rather than the static pages.",
			"The static documentation under `docs/` stays, for search engines and links from elsewhere. Its mode strip leads into the app, which picks up where it was in that tab.",
			"The page about toolbars no longer warns that the web app's Docs leaves out your packs.",
			"**A link to the site now unfurls properly** in Discord, on the DevForum and in search: a title, a fresh description, a 1200 × 630 card made from the front page's banner (yellow on the canary), the site's colour down the side of a Discord embed, and an icon a forum can show. Every docs page has its own title and summary, and the editor, Node Design and the docs carry their own.",
		],
		fixed: [
			"Switching modes waits for the mode you chose: the one you are leaving stays on screen as it was until the new one has drawn its bar (for the editor, its project and graphs back), then the new one fades in over it. The editor no longer flashes its loading frame on the way.",
			"The mode strip's box slides once, all the way, as the new mode fades in. The logo and the strip stay solid through the switch rather than fading with the page, and no second box lingers where the slide began or jumps back as the editor finishes loading.",
		],
	},
	{
		version: "0.157.0",
		date: "2026-10-08",
		headline: "Editor, Design and Docs in one strip, switched in the tab you are in.",
		affects: ["editor", "docs"],
		added: [
			"**The mode strip**, beside the mark in every window: Editor, Design and Docs, with a box behind the one you are in that slides to the one you pick. A click switches the tab you are in; `Ctrl`- or `Cmd`-click, a middle click or a right-click opens a mode in a new tab. On a computer and a tablet; a phone keeps them in **More**.",
			"**The editor is kept while you are elsewhere.** Going to Node Design and back leaves its tabs, where each was looking, its undo and the Code panel exactly as they were, with nothing reloaded; the back and forward buttons move between modes the same way. A node Node Design saved is in the palette when you come back.",
			"On the web app the docs are the published pages, so going to them is a page load. The editor writes down its open graphs, the one in front, their cameras and the Code panel's tabs first, and puts them back when you return to the same project in that tab; a reload does the same.",
			"Where the code panel's tabs run out of room, a list at the end of the row names every one.",
		],
		changed: [
			"The version number is off the top row, to make room for the strip. It is in the projects panel the mark opens, and in the mark's tooltip.",
			"The Docs and Node Design buttons at the right of the editor's row, Node Design's Docs and Open Editor, and the docs' Open Editor and **Try it in your browser** are the strip now.",
			"A project opened from the projects panel in Node Design or the docs is opened by the editor kept behind them, so what it had open is saved and closed first.",
			"A Code panel folded down keeps only its title, its tabs, the list, and its Unfold and ⋯; Go to node and Full view come back when it unfolds. Picking a tab unfolds it.",
		],
		fixed: [
			"A window over the graph that you are using now comes in front of the docks, the Code panel along the foot included, rather than always sitting behind them. Clicking back into a docked card puts it behind again.",
			"Script analysis folded by its chevron shrinks to its bar as a window over the graph, rather than keeping the unfolded window's height.",
			"Script analysis in a side dock is as tall as its list, about five problems, and scrolls past that, rather than taking a share of the column whatever it holds; folded, it is its bar. Its bar stays on one line in a narrow dock.",
			"The editor no longer shows the projects screen for a moment while it opens: until it has its project, and the graphs it is putting back, it shows the empty canvas with the mark and the strip, then fades the rest in. A mode switch fades into what you left, not into the picker.",
		],
	},
	{
		version: "0.156.1",
		date: "2026-10-08",
		headline: "Every note in Settings, said in a line.",
		affects: ["editor", "docs"],
		changed: [
			"Each setting's note, each choice's and each page's is cut to what you need to choose: half as long in all, the longest from 223 characters to 85. **Compile** reads \"Dynamic compiles on every edit. Manual waits for you.\"",
			"The notes under **Action buttons** and **Action row** no longer start by saying they are for a phone or a tablet; the group they are in says so.",
			"What a note no longer says is on [Settings and themes](settings), which now lists `castsByHierarchy` with the rest of `roswaal.json`.",
		],
	},
	{
		version: "0.156.0",
		date: "2026-10-08",
		headline:
			"Settings, redone: pages by where they are kept, groups of rows, and a search over all of it.",
		affects: ["editor", "docs"],
		added: [
			"**Search settings**, at the top of the list: finds a setting on any page by its name or by what it does. Esc clears it, and Esc again closes Settings.",
			'Settings in the docs says where the rest is: "The Settings for your Project and Canvas Style are in Editor Mode", with a link to the editor.',
		],
		fixed: [
			"**Rojo project file** is gone from Settings. Nothing read it, and its note said nothing was written to that file, when a node map writes it: at the map's own **Output**, `default.project.json` unless it says otherwise, and only over a file Roswaal wrote or one handed over with force. A new project's `roswaal.json` no longer names one; an older one that does still loads.",
			"Attributions, the theme docs and the Aquatic theme no longer link a repository that is not public. Aquatic's source is Roswaal's own.",
		],
		changed: [
			"**Settings lists its pages under where they are kept**: this project's `roswaal.json` (**Compiling** and **Node packs**), and this browser (**Canvas**, **Nodes**, **Workspace**, **Themes** and **Docs**), with **Licences** at the foot.",
			"The Editor page is three: **Canvas** for the grid, wires, node corners, Realign and scrolling; **Nodes** for long names and what new nodes start as; **Workspace** for writing a graph, the Variables panel, function tabs, the action row and what opens first. The Project page is **Compiling**, and its node packs have a page of their own.",
			"A page's rows are in groups under a small heading, each a box of its own; segmented choices are pills on a track, and on-off settings are switches.",
			"The same sheet in the editor, Node Design and the docs, and on the docs site. Node Design leaves out the project's pages, and the docs show only **Themes** and **Docs**.",
			"[Settings and themes](settings) lists what is on each page, and the docs that sent you to **Settings → Editor** or **Settings → Project** now name the page it is on.",
		],
	},
	{
		version: "0.155.0",
		date: "2026-10-07",
		headline:
			"Code opens in a panel along the foot of the graph, a tab per field, applied as you type.",
		affects: ["editor", "docs"],
		added: [
			"**The Code panel.** A Code Block, a Luau Expression or a type written out opens in a panel along the foot of the graph, between the side panels, rather than in a dialog that shut the rest of the editor away. The tree, Variables and the Inspector stay usable while you write.",
			"**A tab per field**, in the panel's header after its title. Open several and switch between them; each keeps its own place and undo. A tab is marked with what it edits (**{ }** a Code Block, **ƒx** a Luau Expression, **<T>** a type) and named after its node's label if it has one, then the graph it is in, or its first line of code when two would read the same; it closes with × or a middle-click, and a graph's tabs come back when you return to it.",
			"**Applied as you type.** There is no Done: a pause in typing applies the text to the node as one step of the graph's undo, and clicking away applies it at once. A graph that is compiling takes the change when it finishes rather than dropping it.",
			"**Full view.** The button at the top right of the panel, or Ctrl+Shift+Enter, grows it over the graph with the side panels kept, as the dialog was. Esc or the same keys go back.",
			"**Drag names in from Variables**: a variable, service, module, local, function or type dragged into the code writes its name, as the DataModel writes a path.",
			"**Go to node** selects the node a tab edits and brings it into view.",
		],
		changed: [
			"**Custom Code is now Code Block**: a block of code written by hand, which is what it is. Searching for Custom Code still finds it, and graphs that use it are unchanged.",
			"The panel moves like any other: to a side, onto another card's header as a tab, or over the graph as a window. Any card can now be docked along the foot, and its menu has **Along the foot**.",
			"The status pill keeps its place at the bottom left, and lies over the strip's corner when it opens to list problems, rather than moving the strip while code is being typed.",
			"[Hand-written Luau](hand-written-luau) describes the panel.",
		],
	},
	{
		version: "0.154.1",
		date: "2026-10-07",
		headline:
			"The canvas's grid holds still while you zoom, and code hovers are no longer cut off.",
		affects: ["editor"],
		fixed: [
			"Zooming the canvas no longer makes the dot grid jitter. A browser rounds a repeating background to whole device pixels one tile at a time, so at some zooms the dots far from the canvas's corner sat up to 7px from where they belonged, and jumped back as the zoom changed. The canvas now draws its grid itself, each dot and line where it falls, within half a pixel at every zoom. Dots or Lines, Grid contrast and the theme are followed as before.",
			"A hover, signature, lint message or completion list in the code editor is no longer cut off by the editor's edge: one shown above the first lines was clipped to its last row. The editors' tooltips are drawn over the page, the same in the code editor, the source view and Node Design.",
		],
	},
	{
		version: "0.154.0",
		date: "2026-10-07",
		headline: "Instance.new offers only the classes it can make.",
		affects: ["editor"],
		changed: [
			"New Instance's Class Name lists only the classes `Instance.new` can make. Abstract classes such as `BasePart`, `GuiObject` and `Instance`, and the services, are left out, going by the engine data's NotCreatable and Service tags. Is A, Find First Child Of Class and the other class pins still list every class.",
			'In Custom Code, completion after `Instance.new("` offers the same, and after `:IsA("` every class.',
		],
		fixed: [
			"A New Instance given a class it cannot make, typed in by hand, is an error on its Class Name pin naming what can be made instead (`Instance.new cannot make a BasePart … Make a MeshPart, a Part, a Seat instead`), or pointing a service at Get Service. It failed only when the script ran. A class newer than this build's data is still taken.",
		],
	},
	{
		version: "0.153.0",
		date: "2026-10-07",
		headline: "Promote a node to the Variables panel, and drop a module's graph onto Modules.",
		affects: ["editor", "docs"],
		added: [
			"**Right-click a node to promote it**, as you would a pin. **Promote to Services** on a Get Service declares the service. **Promote to Modules** on a Require Module or Require at Top declares the module and puts a Get Module in its place, its wires and module function calls kept. **Promote to Variable** on a Declare Local in the script's own flow, with a value typed in, makes it a script variable, its Get and Set Locals becoming Gets and Sets; inside a function, a loop or a handler it stays a local, since there it is a fresh value each time. **Promote to Declare Local** on a step with a Result name gives the result its own Declare Local after it. Each leaves the generated file meaning the same.",
			"A node with nothing to promote opens the node palette on right-click as before. One that has something opens a small menu with **Add Node Here…** at the foot.",
			"**Graph Content and Compile Content onto Modules.** Drag a module's `.nodescript` or its compiled `.luau` from the project tree onto Modules to declare it by where the project's node map puts it.",
		],
		changed: [
			"Dropping or promoting a module that is already declared reuses that declaration, rather than adding `Greeter2`.",
			"[Modules](modules) and [Variables and locals](variables-and-locals) say how to promote each kind of node.",
		],
	},
	{
		version: "0.152.0",
		date: "2026-10-07",
		headline: "Require a module by where it sits, and declare the services a script fetches.",
		affects: ["editor", "docs"],
		added: [
			'**Modules by where they sit.** On Roblox, a module in the Variables panel can be `ReplicatedStorage.Shared.Greeter`, `game.ReplicatedStorage.Shared.Greeter`, `script.Parent.Util` or a path with `:WaitForChild("Name")`, and compiles to `require(ReplicatedStorage.Shared.Greeter)` through the hoisted service. Left unnamed, it is named after the ModuleScript. Only a path is accepted: another call or an operator in the field is an error.',
			"**Services**, in the Variables panel of a Roblox graph: the services the script fetches at the top of the file, in the order you list them. Drag one onto the canvas for a Get Service that reads the same local; Custom Code can use it by name, and completion and DataModel drops in Custom Code start from it.",
			"A declared service nothing uses is a warning, so the top of the file lists what the script depends on. On Lune a declared service is an error.",
			"Drag a ModuleScript from the DataModel browser onto Modules to declare it by where it sits, or a service onto Services to declare it.",
			"**Call a declared module's functions.** A module declared by where it sits offers its exported functions in the node search, `Call Greeter.greet`, as a Require Module node's do, and the call goes through the declaration's one `require`.",
		],
		changed: [
			"Exported types of a module declared by where it sits are offered as `Greeter.Type`, as a Require Module node's are.",
			"Custom Code completion offers the script's declared modules by name.",
			"An empty section of the Variables panel is one short line, what goes there or how to add one; hover it for the longer account.",
			"[Modules](modules) explains requiring by where a module sits, and declaring services.",
		],
	},
	{
		version: "0.151.0",
		date: "2026-10-07",
		headline:
			"Dragging from the DataModel starts from the locals you have, and completion reads like a form.",
		affects: ["editor", "docs"],
		changed: [
			"An instance dragged into Custom Code starts from the nearest local that already holds part of its path: `Shared.Config` where `local Shared` holds ReplicatedStorage.Shared, `ReplicatedStorage.Remotes` where Get Service fetched ReplicatedStorage earlier in the graph. The locals come from the code itself, then from the Custom Code and Get Service before it in the graph.",
			"Dragging an instance a local already holds onto a blank line writes that local's name, not a second local for the same thing.",
			'Instances in Workspace start from `workspace`, where they started from `game:GetService("Workspace")`.',
			"Completion in Custom Code is a list hung from the line you are typing on, the word you are completing underlined in the accent colour, with long entries shortened to fit and the list scrolling past ten.",
			"The front page tour's drag slide shows it: a script that has `Shared` already, and Config dragged in as `Shared.Config`.",
		],
		fixed: [
			"The front page tour's drag slide draws its code as code again, with the script's name above it, where the name lost its heading and long lines wrapped.",
		],
	},
	{
		version: "0.150.0",
		date: "2026-10-07",
		headline: "A dot grid behind graphs, as strong as you need it, and a quieter corner label.",
		affects: ["editor", "designer", "docs"],
		added: [
			"**Grid**, in Settings: **Dots**, a dot at every point Shift-drag snaps a node to, or **Lines**, the ruled grid with every fifth line heavier.",
			"**Grid contrast**, in Settings: **Auto**, **Light**, **Standard** or **Strong**. Auto is light, and strong when your system asks for more contrast. Strong draws larger dots.",
		],
		changed: [
			"The grid is dots by default, everywhere a graph sits: the canvas, Node Design, the start page, the node packs page, the sheets a map or a source opens in, the docs' drawings, and the front page.",
			"Every grid is drawn by one rule, 24 apart wherever it stands at full size, and follows the same two settings.",
			"What the canvas is showing — the script's class and name, or the script and the function — is one quiet line in its corner, where it was a large title across the work.",
		],
	},
	{
		version: "0.149.0",
		date: "2026-10-07",
		headline: "The front page tour shows completion, the DataModel, Wally and importing.",
		affects: ["docs"],
		added: [
			'**Completion that knows Roblox**: type after `Instance.new("`, `:GetService("`, `:IsA("` or `Vector3.` and take what the editor offers.',
			"**From the DataModel into your code**: drag an instance from the DataModel browser into Custom Code, a whole local on a blank line and the path alone inside one.",
			"**Wally packages, in the tree**: wally.toml with each package and its version, before and after Add from Wally….",
			"**Luau in, graph out**: a file imported in Verbatim, Tidy and Modern, its graph beside the Luau it writes, and the report the editor gives. Marked **In progress**, with what it does not do yet.",
			"A slide that is still being finished says **In progress** beside its version.",
		],
		changed: ["The tour has eleven slides, and on a phone its numbers wrap to a second row."],
	},
	{
		version: "0.148.1",
		date: "2026-10-07",
		headline: "A new project's spawn stands on its baseplate.",
		affects: ["editor", "docs"],
		fixed: [
			"The SpawnLocation in a new project's `place.rbxlx` stands on the baseplate, at height 0.5, where it floated half a stud above it.",
		],
	},
	{
		version: "0.148.0",
		date: "2026-10-07",
		headline: "A new project from nothing, with a place to start in.",
		affects: ["editor", "docs"],
		added: [
			"**New projects.** `roswaal new <folder>`, **Create** on the start page and **New project…** in the Project menu make a project from nothing: a node map that writes `default.project.json` with Rojo's three folders (Server in ServerScriptService, Client in StarterPlayerScripts, Shared in ReplicatedStorage) and a Main graph that prints Hello world, compiled and ready. `--lune`, or choosing Lune, makes a Lune project with one main graph.",
			"**A place to start in.** A new Roblox project has `place.rbxlx` unless you say not to: the usual services, a 512-stud BasePlate with its top at height 0, and a 12-stud SpawnLocation at the centre. Roswaal writes it rather than copying Studio's template, and `roswaal export` writes the project's scripts into it.",
			"In the web app, **New project…** replaces the project kept in the browser, or, in Chrome and Edge, goes into an empty folder you pick.",
			"**Hover knows the globals.** `game`, `workspace`, `script` and `plugin` show their class and link both the class and their own entry in the Creator Docs; Roblox's other globals and Luau's link their entries, and a library and its members (`math.floor`, `task.wait`) link the library's page. `game:GetService` and `workspace.Gravity` read as the class's own.",
		],
		changed: [
			"The start page offers **Create** for an empty folder or a path with nothing at it yet, where it said there was nothing there. A folder with files keeps **Initialise**.",
			"A new project goes only into an empty folder, or one that is not there yet. One with files in it is refused, and left as it was.",
			"[Getting started](getting-started), [Command line](command-line) and [Places and Rojo projects](places-and-rojo) say how to start a new project.",
		],
		fixed: [
			"The web app walkthrough on Getting started moves on when **Project** is pressed. It had ringed the Project panel behind it instead.",
			"The front page tour's computer, tablet and phone are drawn as [The interface](the-interface) draws the editor on each, where they were a sketch that put the cards in the wrong places.",
		],
	},
	{
		version: "0.147.0",
		date: "2026-10-07",
		headline: "The front page has a tour of the editor, and its versions open their notes.",
		affects: ["editor", "docs"],
		added: [
			"**Take the tour**: seven slides on the front page, each a part of the editor to try. Select nodes to see which lines of the generated file they wrote, search for a node by name, walk the node picker as it draws each node, hover the names in a script and a Moonwave-documented module, see the editor on a computer, a tablet and a phone, and work a menu from the keyboard.",
			"Under the example of what Roswaal writes, a line leads on to the tour and scrolls all of it into view.",
			"Search literally, or visually; Preview anything, any time; and Panels that float and dock each link up to the slide where they can be tried.",
			"Each slide names the release its part first shipped in and the ones that built on it.",
		],
		changed: [
			"A version on the front page opens the release notes it first shipped in: the cards under Inside the editor, the slides, and Lately.",
			"Custom nodes, made your way is dated 0.34.0, when a node's logic could first be built from nodes.",
		],
		fixed: [
			"The selection preview no longer calls Script Start a pure node. It says Script Start is where code starts running, and lights no lines for it.",
			"What is planned no longer lists importing Luau, which shipped in 0.140.0.",
		],
	},
	{
		version: "0.146.0",
		security: true,
		date: "2026-10-06",
		headline:
			"roswaal for macOS, nodes from a pack say so, and files from elsewhere are read to a limit.",
		affects: ["editor", "docs"],
		added: [
			"`roswaal` for macOS on Apple Silicon, built with the Windows one for every release and attached to it. Getting started has the steps for each, with Rokit and from source.",
			"A node from a node pack says so: the node picker marks it **Pack** and names its file, and the Inspector says which pack it came from and shows the Luau it writes.",
		],
		changed: [
			"A zip is unpacked to the sizes its index gives, and no more than 128 MiB in all. A damaged zip says it is damaged.",
			"A place file's chunks are opened to the sizes they could have, and its instances are read as a tree.",
			"Downloads from the Wally registry and from GitHub are read to a limit: 128 MiB for an archive, 4 MiB for a list of versions.",
			"Adding a Wally package checks its name, alias and version before `wally.toml` is changed.",
			"The backup copy of the editor on GitHub Pages opens projects from a .zip or a place, not folders, and lets go of any folder it remembered. Folders open on roswaal.app.",
			"*Creating custom nodes* says that a pack's nodes put their author's Luau into your game.",
		],
		watch: [
			"A Wally version is written as `1.2.3`, `^1.2.3` or `=1.2.3`, which are the forms Roswaal installs from. Anything else is refused with that message.",
		],
	},
	{
		version: "0.145.0",
		date: "2026-10-06",
		headline: "The release notes have a page for each minor version.",
		affects: ["editor", "docs"],
		changed: [
			"The release notes are a page for each minor version: 0.144.x holds 0.144.0 to 0.144.4, with every line saying which release it shipped in. The contents list the newest five, and a versions dropdown reaches every one, with the notes from before Roswaal was public grouped at the bottom.",
			"The release notes' front page shows the newest version in full, and a line each for the four before it.",
			"A version that fixed a security weakness says so: a Security fixes badge on the version, and a Security tag on the release that did.",
			"A link to one release, such as `release-notes.html#v0.119.0`, goes to its version's page with that release's lines marked.",
			"Searching the docs ranks a guide above release notes that only mention what was typed.",
		],
		watch: [
			"The release notes' own search box, filter chips and jump bar are gone. The docs search finds every release, and the dropdown reaches every version.",
		],
	},
	{
		version: "0.144.4",
		security: true,
		date: "2026-10-06",
		headline: "Roswaal keeps to the project it has open.",
		affects: ["editor", "designer"],
		fixed: [
			"On macOS, Show in file manager selects a folder in Finder, as it does a file, rather than opening it.",
		],
		changed: [
			"A symbolic link in a project that leads outside it is not read, written or removed through, and says so. A link that stays inside the project works as before, and so does a project that is itself reached through a link.",
			"`sourceDir`, `outDir` and `nodePaths` in `roswaal.json` must be folders inside the project.",
			"Removing a Wally package only ever removes folders in its `_Index`.",
		],
		watch: [
			"A project whose `roswaal.json` names a folder outside it, or that keeps its graphs or its output behind a link to somewhere else, no longer opens or compiles that way. Move the folder into the project.",
		],
	},
	{
		version: "0.144.3",
		security: true,
		date: "2026-10-06",
		headline: "The website runs scripts from itself only.",
		affects: ["editor", "designer", "docs"],
		changed: [
			"Every page of the website -- the editor, Node Design and the docs -- carries a Content-Security-Policy, the same one the local editor sends: scripts and requests from the site itself, and nothing else.",
		],
	},
	{
		version: "0.144.2",
		security: true,
		date: "2026-10-06",
		headline: "The local editor answers its own pages, and only shows in its own windows.",
		affects: ["editor"],
		changed: [
			"`roswaal serve` answers requests from the pages it serves itself and no others. A page served by another program on this machine -- a notebook, a dev server -- is treated like any other website. In development, the daemon run by `npm run dev` also answers Vite's port.",
			"The local editor cannot be shown inside another site's frame, and loads scripts only from itself.",
		],
	},
	{
		version: "0.144.1",
		security: true,
		date: "2026-10-06",
		headline:
			"Text from a graph lands in the generated Luau as the text it is, and Luau nested too deeply is an error.",
		affects: ["editor"],
		fixed: [
			"A variable's description that runs to more than one line is written as a block comment, as a comment on the graph is, and the graph's name and id stay on their own lines of the file's header.",
			"A path's starting point that is not `game`, `script`, `workspace` or `shared` is looked up as a service by name, so `Workspace` works. A path from one of those four, such as `script.Parent`, is written as before.",
			"A Lune Function whose call is not a function's name is an error rather than being written as it stands.",
			"A comment holding every long-bracket closer up to sixteen `=` gets one more, so it still closes.",
			"Luau nested more than 500 deep -- brackets, blocks, tables or types inside one another -- is reported as an error by checking, completion and Import as graph, which read the rest of the file, instead of stopping them.",
		],
	},
	{
		version: "0.144.0",
		date: "2026-10-06",
		headline: "Every context menu and dropdown is one menu, and works from the keyboard.",
		affects: ["editor", "designer", "docs"],
		added: [
			"Menus work from the keyboard: Up and Down move through what can be chosen, Home and End jump to either end, Enter chooses, and Escape or Tab closes the menu and puts focus back where it was.",
		],
		changed: [
			"Every context menu and dropdown is drawn by one menu, which opens over everything and stays on screen: the project tree's, a pin's, the node palette, a card's ⋯, the open documents, More, Project, and a pack's ⋯ in Node Design.",
			"More's dividers show. They were there, and drawn as nothing.",
			"Menus are divided where their entries are different kinds of thing. The project tree's: making things, then Show in file manager, then Rename and Delete. A pin's: Promote to Variable, then splitting or recombining, then breaking links. More: the project, the graph's tools on a phone, the files, then the other windows. A card's: where it goes, then the card itself, then what is closed. Project: opening, then importing and exporting, then Start again. A pack's: copies, then Show in file manager, then Delete. The node palette sets Comment apart from the nodes, and Node Design's More sets its two pages to read apart from where to go.",
			"Remove package… is the last entry of a package's menu, below the ways to add one, where every other menu keeps its red entry.",
			"A pin's dropdown of known values has a rule above Other…, which turns the pin into a field to type into.",
			"The docs draw More, the Wally menu and the Project menu as the editor draws them, dividers and all. Controls has a section on the menu keys.",
		],
	},
	{
		version: "0.143.6",
		date: "2026-10-06",
		headline: "The project tree's menu opens over the graph, all of it on screen.",
		affects: ["editor"],
		fixed: [
			"Right-clicking anything under Graph Content or Compile Content opened a menu clipped by the Project card: cut off at its edge, and Delete out of sight below it. The menu opens over everything now, and near the bottom or the right of the window it opens on the other side of the pointer, as a native menu does.",
			"Show in file manager fits on one line of that menu.",
		],
	},
	{
		version: "0.143.5",
		date: "2026-10-06",
		headline: "Luau typed into a node not wired in yet is offered its graph's locals.",
		affects: ["editor"],
		fixed: [
			"A Custom Code or Luau Expression not yet wired in offered no locals. It offers its function's parameters, then every other local in its graph, marked in scope once wired. Once it is wired, scope is worked out exactly again.",
		],
	},
	{
		version: "0.143.4",
		date: "2026-10-06",
		headline: "The website's links into the docs open the page they name.",
		affects: ["editor"],
		fixed: [
			"On the website, the Inspector's ? opened the landing page. It opens the node's docs page, as it does under the daemon.",
			"The website's other links to a docs page, from the start screen, Node Design and Ctrl+K, open that page rather than the first one.",
		],
	},
	{
		version: "0.143.3",
		date: "2026-10-06",
		headline: "A call's cast result shows on its pin.",
		affects: ["editor", "docs"],
		changed: [
			"A call whose result is cast shows `:: BasePart` beside its result pin, in the type's colour, so the cast reads on the canvas as a Cast pill does.",
		],
	},
	{
		version: "0.143.2",
		date: "2026-10-06",
		headline: "Code completion follows a path of members.",
		affects: ["editor"],
		fixed: [
			"`hull.Position.` offers a Vector3's members, and a path of any length is followed while each step's type is known, through a property, an event or a child instance the project knows. A colon at its end offers methods.",
		],
	},
	{
		version: "0.143.1",
		date: "2026-10-06",
		headline: "Luau typed into a graph is offered a typed local's members.",
		affects: ["editor"],
		fixed: [
			"After `hull.` or `hull:` in Custom Code or Luau Expression, the members and methods of the local's type are offered, for named results, Declare Locals, parameters, script variables and loop variables. A cast result counts as its cast type.",
			"Loop variables are offered by name too.",
		],
	},
	{
		version: "0.143.0",
		date: "2026-10-06",
		headline: "Import as graph has settings, and an overwrite shows what changes first.",
		affects: ["editor", "docs"],
		added: [
			"The import prompt asks what file-level locals become: script variables, declared where they were by Initialize Variable, or Declare Locals.",
			"It asks how the graph reads: Tidy, Verbatim or Modern. Every mode behaves the same. Modern writes `a and b or c` as an if-expression where the middle can never be false or nil.",
			"The report lists likely bugs in the original, such as `x and false or y`, which never gives false. They are left as written.",
			"A file that requires `@lune/` modules is imported for Lune. When the project is for Roblox, the prompt asks which.",
			"Overwriting a file Roswaal did not write shows the lines that change, and asks before writing.",
		],
		changed: ["File-level locals become script variables unless the import says otherwise."],
	},
	{
		version: "0.142.1",
		date: "2026-10-06",
		headline: "Cast result reads as optional until it is set.",
		affects: ["editor", "docs"],
		changed: [
			"Cast result shows a dashed No cast, as an optional pin shows default. Clicking it opens the type list, and × beside the chosen type removes the cast.",
		],
	},
	{
		version: "0.142.0",
		date: "2026-10-06",
		headline: "A node can go into a data wire, and a call can cast its result.",
		affects: ["editor", "docs"],
		added: [
			"Pick up a wire off a data input, drop it on empty space and choose a node: it goes in between, the value feeding it and it feeding the input. Nodes that fit both ends come first, and a step also joins the reader's chain when there is one way in.",
			"Cast result, in the Inspector of a call with one result, writes `call(...) :: Type`. The result pin and its named local take that type, including on Script Function calls to local functions.",
			"Import as graph reads a cast on a call to a known function, `need(...) :: BasePart`, as that call with Cast result set.",
		],
	},
	{
		version: "0.141.2",
		date: "2026-10-06",
		headline: "Import as graph names its risks before it starts.",
		affects: ["editor", "docs"],
		changed: [
			"Import as graph asks first, listing what a conversion cannot promise: the same behaviour, the original's comments and formatting, and checks on what stays as Luau text.",
		],
	},
	{
		version: "0.141.1",
		date: "2026-10-06",
		headline: "Luau typed into a graph can see its named results.",
		affects: ["editor"],
		fixed: [
			"Custom Code and Luau Expression offer the named results before them, and a method's self, as they type.",
			"A named result always declares its local. Folded into a Declare Local straight after it, the name did not exist for Luau further down to read.",
		],
	},
	{
		version: "0.141.0",
		date: "2026-10-06",
		headline: "Declare Function can declare a method.",
		affects: ["editor", "docs"],
		added: [
			"Declare Function's **On Table as** sets `T:name` for a method, written `function Tank:aim(target)`. Its graph gains a self output, and Get Parameter offers self.",
			"Script Function calls a method with a colon, in its own script and through a required module.",
			"Import as graph reads `function T:m()` as a method instead of keeping it as code.",
		],
	},
	{
		version: "0.140.0",
		date: "2026-10-06",
		headline: "A .luau file can be imported as a graph.",
		affects: ["editor", "docs"],
		added: [
			"Right-click a `.luau` you wrote in the Project panel for **Import as graph**. It opens a new graph that compiles back to that file, and says how many statements became nodes.",
			"Locals, `if`, the three loops, functions with their parameters and returns, calls, field writes and a module's `return` become their nodes. What has no node yet, such as a type, stays as its own code in a Custom Code or Luau Expression node.",
			"The `.luau` file is not changed. Compiling over it asks for force, as for any file Roswaal did not write, and a graph already at the import's path is never replaced.",
		],
		changed: ["A loop variable named `_` keeps that name in the generated Luau."],
	},
	{
		version: "0.139.3",
		date: "2026-10-06",
		headline: "Typing a type's name in the node menu offers a Cast to it.",
		affects: ["editor", "docs"],
		changed: [
			"Type a type's name into the node menu, as `Motor6D` off a value, and it offers Cast to Motor6D, with its Type already set.",
		],
	},
	{
		version: "0.139.2",
		date: "2026-10-06",
		headline: "Make Dictionary's new rows follow the row above.",
		affects: ["editor"],
		changed: [
			"A row added to Make Dictionary arrives as the row above it is: whole, taking a Key Value Pair, after a recombined row, and split into Key and Value otherwise.",
		],
	},
	{
		version: "0.139.1",
		date: "2026-10-06",
		headline: "Key Value Pair's Value picker and field are one height.",
		affects: ["editor"],
		fixed: [
			"The Value picker in Key Value Pair's Inspector is the height of the field beside it, and only as wide as what it says, leaving the field the room to type in.",
		],
	},
	{
		version: "0.139.0",
		date: "2026-10-06",
		headline: "Key Value Pair's value can be a local or a variable, picked from a list.",
		affects: ["editor"],
		added: [
			"Key Value Pair's Value opens a picker: String, Number, Boolean, Luau or nil to type in, and the locals, named results and variables this graph can see. Picking one places its Get beside the pair and wires it in.",
		],
		changed: ["While Value is wired, the field names what is wired into it."],
	},
	{
		version: "0.138.4",
		date: "2026-10-06",
		headline: "Dynamic compiling no longer undoes an edit you just made.",
		affects: ["editor"],
		fixed: [
			"With Dynamic compiling, an open graph could take an older copy of its own file back from disk, so a recombined pin came apart on its own and a wire being dragged lost the pin it was going to land on. A graph now knows its recent saves, ignores news of a file it is still saving, and waits for a wire or the menu it was dropped into before taking a change from disk.",
		],
	},
	{
		version: "0.138.3",
		date: "2026-10-06",
		headline: "A named result shows in its node's header.",
		affects: ["editor", "docs"],
		changed: [
			"A call with a Result name and no Label of its own is titled with both, as need (leftTrack). A node that already shows the result name under its header keeps it there.",
		],
	},
	{
		version: "0.138.2",
		date: "2026-10-05",
		headline: "Off a pin, the node menu offers the value before its members.",
		affects: ["editor", "docs"],
		fixed: [
			"Searching the node menu off a pin lists Get and a local's name before that local's members, and a result of exactly the pin's type before one that only connects.",
			"Members the pin cannot take, such as a boolean property for an Instance pin, are no longer offered.",
		],
	},
	{
		version: "0.138.1",
		date: "2026-10-05",
		headline: "Go to a local from the Variables panel.",
		affects: ["editor", "docs"],
		changed: [
			"Double-click a local in the Variables panel, or `Ctrl` + click it, to go to the node that declares it, brought into view.",
			"A named result's result tag is drawn in the type's quiet colour, so its name reads first.",
		],
	},
	{
		version: "0.138.0",
		date: "2026-10-05",
		headline: "A step's named result is a local you can read by name.",
		affects: ["editor", "docs"],
		added: [
			"A step with a Result name is listed under Locals in the Variables panel, and the node search offers Get and its name. Get Local reads it wherever it is in scope, with no wire back to the call.",
		],
	},
	{
		version: "0.137.1",
		date: "2026-10-05",
		headline: "Saving into a folder in the browser stops failing while you work.",
		affects: ["editor"],
		fixed: [
			"In the browser, with a folder open, a file read just as it was being written is read again rather than failing. Placing nodes quickly with Dynamic compiling no longer reports Could not save.",
			"A long path in an error wraps inside its window rather than running out of it.",
		],
		changed: [
			"A save that does fail says so in a notice at the top of the window. Click it for the full error.",
		],
	},
	{
		version: "0.137.0",
		date: "2026-10-05",
		headline: "A node dragged off a wired execution output goes in between.",
		affects: ["editor", "docs"],
		added: [
			"Drag off an execution output that is already wired, drop on empty space and pick a node: it goes in between, leading on to the next step from Then, Then 0 on a Sequence, or Completed on a loop.",
			"Hold `Ctrl` as you drop a wire on empty space to pick the node from the node picker instead of the menu.",
		],
	},
	{
		version: "0.136.1",
		date: "2026-10-05",
		headline: "Roswaal Types reviewed again.",
		affects: ["docs"],
		changed: ["Roswaal Types is marked as last reviewed on 5 October 2026."],
	},
	{
		version: "0.136.0",
		date: "2026-10-05",
		headline: "Class as String.",
		affects: ["editor", "docs"],
		added: [
			'**Class as String**, beside Type as String: an Instance class picked from the engine\'s classes, as a string such as `"Model"`, for any argument that takes a class name.',
		],
	},
	{
		version: "0.135.0",
		date: "2026-10-05",
		headline: "ClassName, and a Result name declares its local.",
		affects: ["editor", "docs"],
		added: [
			"ClassName in the type picker for parameters, returns and pins: written as `string`, and every pin of that type offers the engine's classes.",
			"A Result name declares its local even when nothing reads the result yet. Call Function, Call Method and the Service and Lune Function steps have the field too.",
		],
		fixed: [
			"A tab with unsaved edits shows one dot beside its name, rather than a second one after its close button.",
		],
	},
	{
		version: "0.134.0",
		date: "2026-10-05",
		headline: "Calls take their arguments from the function wired in, and any input can be typed.",
		affects: ["editor", "docs"],
		added: [
			"Call Function and Call For Value wired from a Get Function, or a declaration's Function output, take that function's parameters as named, typed pins, and its first return as the result's type. The pins follow the signature when it changes.",
			"An input a node declares `any` can be given a type under Pins in the Inspector. It wires, colours and takes a typed-in value as that type; the Luau written does not change.",
		],
		fixed: ["An optional argument left empty at the end of Call For Value is left off the call."],
	},
	{
		version: "0.133.1",
		date: "2026-10-05",
		headline: "The Luau logo stays on the canary for now.",
		affects: ["editor", "docs"],
		changed: [
			"Only the canary draws `.luau` files with the Luau logo. The stable build keeps the code file icon, and its Settings → Licences and Attributions say so.",
		],
	},
	{
		version: "0.133.0",
		date: "2026-10-05",
		headline: "Call a function by its name, with a pin for each parameter.",
		affects: ["editor", "docs"],
		added: [
			"**Script Function**, a step and a value. Type a function's name into the node search and Call need places one, with need's parameters as named, typed pins and its return values as outputs.",
			"A required module's exported functions are offered the same way, as Call Config.read.",
			"The pins follow the function's signature. Rename, reorder or remove a parameter and the wires move with it.",
			"On the canary, `.luau` files in the Project panel, tabs and DataModel wear the Luau logo, in the colour of the script they become, and Settings → Licences carries its licence.",
		],
		fixed: [
			"Call For Value's arguments grow and shrink from its header and the Inspector, as Call Function's do.",
		],
	},
	{
		version: "0.132.4",
		date: "2026-10-04",
		headline: "The pin's settings in the new style, and deleting a node asks in a window.",
		affects: ["designer", "docs"],
		changed: [
			"The selected pin's settings are drawn as the Inspector's panels are: a head with the pin's name and side, bold labels beside their fields, and the pin's moves in a foot.",
			"Deleting a node in Node Design asks in a window rather than in the top row.",
		],
		fixed: [
			"The pin's settings no longer run off the foot of the column on a tablet held upright; their fields scroll inside the card.",
			"On a tablet held upright, the pin types start after the logic's tools rather than under them.",
		],
	},
	{
		version: "0.132.3",
		date: "2026-10-04",
		headline: "Node Design's bottom row lines up, and slimmer pin steppers.",
		affects: ["designer"],
		changed: ["The Inputs and Outputs steppers under the node's plate are slimmer."],
		fixed: [
			"Node Design's undo and redo row sits above the bottom toolbars wherever it shows, a tablet with a trackpad included, rather than on the pin types.",
			"The pin types start beside the logic's tools rather than cut off at Execution.",
			"Written in Luau, the pin types line up with Logic's switch on the bottom row, and the Luau sheet comes down to just above them.",
		],
	},
	{
		version: "0.132.2",
		date: "2026-10-04",
		headline: "Node Design's action row above the pin types on a tablet.",
		affects: ["designer"],
		fixed: [
			"On a tablet, the pin types are Node Design's bottom row, beside the logic's tools, and the undo and redo row sits above them rather than under them.",
		],
	},
	{
		version: "0.132.1",
		date: "2026-10-04",
		headline: "Node Design held upright, and Contents the height of its neighbours.",
		affects: ["designer", "docs"],
		changed: [
			"Node Design on a tablet held upright, or in a window taller than it is wide: the node runs across the top and the Luau sheet takes the whole width beneath it.",
		],
		fixed: ["The docs' Contents button is the height of the buttons beside it on a tablet."],
	},
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
		headline:
			"Node Design on a tablet: the type palette and the Luau sheet clear their neighbours.",
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
