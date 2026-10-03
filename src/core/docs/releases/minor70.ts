/**
 * Release notes for 0.70.0 to 0.79.x, newest first.
 *
 * One of the files `../releases.ts` puts together, a tenth of the minor
 * versions each, so the newest notes are not at the top of a very long file.
 */

import type { Release } from "../releases.js";

export const RELEASES_0_70: Release[] = [
	{
		version: "0.79.0",
		date: "2026-09-22",
		headline: "Asking what a value is.",
		affects: ["editor", "docs"],
		added: [
			"**Not Equal to Self**, a pill: `x ~= x`, which is true of NaN and nothing else. Luau has no `isnan`, and a value compared against itself reads as a mistake until you know the trick.",
			"**Type as String** writes the name `typeof` answers — `\"Vector3\"` — picked from a list rather than typed into a String node, where a misspelling is a check that never matches. The list is what `typeof` can answer: Luau's own names, Roblox's datatypes and `Instance`.",
		],
		changed: [
			"**Type Of is a pill**, showing the `typeof` it writes.",
			"**A value a node reads twice is worked out once.** `x ~= x` on a call bound a local and compared it to itself; it used to make the call twice. A name, a number or a field read is still read where it is used.",
		],
	},
	{
		version: "0.78.0",
		date: "2026-09-22",
		headline: "Members where the wire comes from.",
		affects: ["editor", "docs"],
		added: [
			"**Drag a wire out of a typed pin and the node menu offers that type's members**, under their own heading: a Part's properties, a declared type's fields, a required module's type's. Picking one places a **Get Member** already wired to the pin you dragged.",
		],
	},
	{
		version: "0.77.0",
		date: "2026-09-22",
		headline: "Members on one line, and a class that stays a class.",
		affects: ["editor", "docs"],
		added: [
			"**Members are in both node searches.** Type `input.` and every member of what the graph names is there — variables, locals and parameters. Picking one places the getter and a Get Member on it, wired.",
		],
		changed: [
			"**Get Member is one line**: the access it writes, one input, one output. Which member it reads is chosen in the Inspector rather than on the node.",
			"**A node that names a class hands back that class.** New Instance set to `Part` gives a Part, Get Service gives the service's own class, and the Find First Child and Ancestor nodes follow their Class Name. Their members are then in Get Member's list without a Cast first.",
			"**An instance class's pin is an Instance's blue.** A pin typed `Part` was drawn as an untyped `any`, and a wire from it faded on the way into an Instance pin.",
			"**A cast hands back the type it asserts.** `packet :: Input` gives an Input rather than an `any`, so Get Member offers that type's fields straight off the cast.",
			"**A type is found wherever it is declared in the file**, so a Get Member inside a function sees a type declared beside the function.",
		],
		watch: [
			"**A Get Member from 0.76.0 is moved to the new shape** when its graph is opened, and its member is kept.",
			"**A generated annotation names the class**: `local weld: WeldConstraint = Instance.new(\"WeldConstraint\")` where it used to say `Instance`. Recompiling rewrites those lines.",
		],
	},
	{
		version: "0.76.0",
		date: "2026-09-22",
		headline: "Reading the members a type declares.",
		affects: ["editor", "docs"],
		added: [
			"**Get Member** reads a field off a value whose type declares one, as a pill: wire the value in and pick from what its type holds. The result takes that field's type, so a Vector3 field gives a Vector3 pin.",
			"**Its list comes from the type**: a Declare Type in this graph, entered as fields or written as a table; a type a required module exports; or a Roblox class's properties, in a Roblox graph.",
			"**A member this graph's own type does not have is refused** before the file is written, with the type's fields listed.",
		],
		changed: [
			"**Get Field is unchanged** and is still the node for a table whose keys come and go while the program runs.",
		],
	},
	{
		version: "0.75.1",
		date: "2026-09-22",
		headline: "UDim arithmetic drawn as pills.",
		affects: ["editor", "docs"],
		changed: [
			"**UDim +**, **UDim −**, **UDim2 +** and **UDim2 −** are drawn as pills, as the rest of the arithmetic is. They are every operator the engine gives the two: neither takes a unary minus or a multiplication.",
		],
	},
	{
		version: "0.75.0",
		date: "2026-09-22",
		headline: "Arithmetic drawn as pills.",
		affects: ["editor", "designer", "docs"],
		changed: [
			"**Arithmetic is drawn as pills**, as the comparisons and **and** / **or** are: Add, Subtract, Multiply, Divide, Modulo, Power and Negate, the Vector3 and Vector2 operators, **CFrame ×** and **CFrame + Vector3**. Each shows the Luau it writes: `+`, `-`, `*`, `/`, `%`, `^`.",
			"**Brackets**, in the Inspector, and **New logic nodes** in Settings apply to arithmetic pills too.",
		],
		fixed: [
			"**A Cast's type picker lists this graph's own types**, and those a required module exports, as the Inspector's type fields do.",
			"**A pill with one input keeps its width** when a value of another kind is typed on it.",
		],
		watch: [
			"**Arithmetic nodes already in a graph are drawn as pills** from this version, and are narrower than they were. Their wires and the code they write are unchanged.",
		],
	},
	{
		version: "0.74.5",
		date: "2026-09-22",
		headline: "Nodes dragged out of the node picker look like nodes.",
		affects: ["editor"],
		fixed: [
			"**A node dragged out of the node picker is drawn as the node**, above your finger or pointer. On a touch screen it showed the row's text.",
		],
	},
	{
		version: "0.74.4",
		date: "2026-09-22",
		headline: "Comments around a Declare Function in its own graph.",
		affects: ["editor"],
		fixed: [
			"**A comment made around a Declare Function inside its own graph goes around it.** It was placed where the node sits in the graph outside.",
		],
	},
	{
		version: "0.74.3",
		date: "2026-09-22",
		headline: "The node picker by touch, and unknown and never.",
		affects: ["editor", "docs"],
		added: [
			"**Spawn node**, under the node picker's preview, places the node shown.",
			"**Drag a node out of the node picker** onto the graph to place it there. Hold it first on a touch screen.",
			"**unknown** and **never** are in the type picker's Luau types. A pin of either takes any wire.",
		],
		changed: [
			"**On a touch screen, tapping a node in the node picker previews it.** Double tap it, tap **Spawn node** or drag it out to place it. A mouse click still places it.",
			"**The node picker's footer shows touch controls on a touch screen.**",
		],
		fixed: [
			"**A parameter's or a return's type has its padding** in the Inspector.",
			"**Name and type share a parameter row 60/40** as the Inspector is resized. The type stayed 90px wide.",
		],
	},
	{
		version: "0.74.2",
		date: "2026-09-22",
		headline: "Delete locals and functions from the Variables panel.",
		affects: ["editor", "docs"],
		added: [
			"**×** on a local or a function in the Variables panel deletes it, after asking. A function's graph goes with it, as it does from the canvas. Nodes that read it stay, and report an error until repointed or removed.",
		],
	},
	{
		version: "0.74.1",
		date: "2026-09-22",
		headline: "Binding fills its row.",
		affects: ["editor"],
		fixed: [
			"**A variable's Binding, local or const, fills its row** in the Variables panel, as the fields above and below it do.",
		],
	},
	{
		version: "0.74.0",
		date: "2026-09-22",
		headline: "Nodes by other names, and the node picker by touch.",
		affects: ["editor", "designer", "docs"],
		added: [
			"**Nodes have other names in both node searches.** `Define Function` finds Function and Declare Function, `Define Type` finds Declare Type, `Sleep` finds Wait, `Log` finds Print. A node actually called what you typed still comes first.",
			"**Press and hold with two fingers, then lift**, on a tablet or a phone, opens the node picker where you held, as `Ctrl` + right-click does. One finger still opens the node menu.",
		],
		fixed: [
			"**A function dragged from the Variables panel lands on the graph** as a Get Function. The canvas had always refused the drop.",
		],
	},
	{
		version: "0.73.2",
		date: "2026-09-22",
		headline: "Table types, one field to a line.",
		affects: ["editor", "docs"],
		added: [
			"**Declare Type has a Layout setting for Table of Fields**: *Inline*, or *One per line*, as Make Dictionary has. One per line writes each field on its own line with a trailing comma.",
		],
	},
	{
		version: "0.73.1",
		date: "2026-09-18",
		headline: "Steps you can walk through.",
		affects: ["docs"],
		verified: ["getting-started"],
		added: [
			"**Walkthroughs**: steps done on screen, shown one at a time. A drawing of the screen at each step rings the control to press, and the list under it lights the step you are on and marks the ones done. Move with **Back** and **Next**, by tapping a step, or by tapping the ringed control.",
			"**Getting started opens a project as a walkthrough** on each tab: the start page on a computer, the **Project** menu in the web app, and **Open .zip…** on a tablet or a phone.",
		],
	},
	{
		version: "0.73.0",
		date: "2026-09-18",
		headline: "Open a project from a zip.",
		affects: ["editor", "docs"],
		added: [
			"**Project → Open .zip…** in the web app's projects panel opens a project from a zip, in every browser — on an iPad, from the Files app. It replaces the project kept in the browser, after asking, and takes the name of the folder the zip wraps it in. **Download** makes a zip it opens.",
			"**What does not come in is listed.** A zip's `.git`, `node_modules` and the files a Mac or Windows adds are left out, and so is anything that is not text, such as a place file.",
			"**A zip without roswaal.json** can be set up as a project, as a folder can.",
		],
		changed: [
			"**The projects panel's footer is Home, Project, Node Design and Docs.** Open folder, Open .zip, Download and Start again are in the **Project** menu.",
			"**Getting started opens a project in steps** on each tab: `roswaal serve` and the start page on a computer, the projects panel's **Project** menu in the web app, and a zip carried from a computer to a tablet or a phone.",
			"**On a phone, the graph's script type reads Script, Local or Module** on its folded button, so the tools keep one row. The list inside names them in full.",
		],
	},
	{
		version: "0.72.0",
		date: "2026-09-18",
		headline: "A map of the editor and Node Design.",
		affects: ["editor", "docs"],
		verified: ["the-interface", "getting-started", "toolbars"],
		added: [
			"**The Interface**, a new page under Getting started, before Controls. It draws the editor and Node Design as their parts — each numbered, with a line on what it is for — on a computer and, in a second tab, on a phone or a tablet, where the panels slide out and the action row is. Hover or tap a part to light its line. See [The Interface](the-interface).",
			"**Toolbars draws each bar on a computer, a tablet and a phone**, under tabs named as the rest of the documentation names them, with the two bars only a touch screen has — the action row, and Node Design's bar over a node — at the end. A tablet's and a phone's bar is drawn at that screen's width, with every control on it listed.",
			"**Documentation pages open on the tab for your screen** — Desktop, Tablet or Phone — and mark it as this device. A tab you pick is kept for the rest of the visit, on every page.",
			"**Settings → Editor → Action row** draws the action row as separate buttons, as it was, or as one bar like the graph's own tools.",
		],
		fixed: [
			"**Home in the web app's project picker goes to the front page**, rather than back to the editor's start.",
			"**The top bar and the graph's tools keep to one row on an iPad in portrait.** Where they are short of room, Compile project, Straighten and Compile script show only their icons, and the Compile caption goes; each keeps its name as its tooltip.",
			"**The documentation's Roswaal mark lights when the pointer is over it**, and when it is pressed, like every other button in its header.",
			"**Node Design's node tools fold on a phone too.** Details and Save are their icons; the types to drag on, the pin counts, and the node's kind each sit behind a button, and a type still drags from its panel onto the node. Docs in its header is its icon, so Settings keeps the row.",
			"**The compile target reads Lune, with a warning triangle after it**, rather than Lune (experimental); the dropdown lists just the targets.",
			"**The Interface draws a phone as well as a tablet**, each under its own tab.",
			"**Node Design's logic graph shows its Luau when asked**, from a preview button on its tools, as the editor's graph does, rather than beside the graph all the time.",
			"**The graph's tools fit one row on a phone.** The script's type and mode, and the compile target, each sit behind a button that says what is chosen and opens the dropdowns under it.",
			"**The action row's icons have room around them.** Each button is 46 pixels square; the icon sat two pixels from its edge.",
		],
		changed: [
			"**The editor's top bar shows which build it is as the colour of the Roswaal mark**: blue for the browser preview, yellow for the canary, plain for an installed build. The preview chip is gone from the bar, and the version beside the mark steps aside when the bar is short of room; it is in the mark's tooltip either way.",
			"**Node Design, the documentation, the projects panel, the project picker and the front page wear the same colour** on their Roswaal mark, beside the version where there is one. Node Design's preview chip is gone with the editor's.",
			"**Toolbars says Node Design reaches Settings with its gear**, as it does. Neither its Settings nor the documentation window's has a Project tab.",
			"**Getting started opens with the three ways in** — installed on a computer, in a browser on a computer, and on a tablet or a phone — each under its own tab.",
			"**Toolbars says the three windows share one tab on a phone or a tablet**, rather than that none of them replaces the one you are on.",
			"**Toolbars heads the action row and Node Design's touch bar each with its name**, under Only on a touch screen.",
			"**The front page says where Roswaal runs**, locally on a computer or online on a computer, tablet or phone, in two short lines under its buttons, with Roblox marked stable beside Lune's experimental.",
		],
	},
	{
		version: "0.71.0",
		date: "2026-09-18",
		headline: "Trackpads, touch screens and phones.",
		affects: ["editor", "docs"],
		added: [
			"**Two fingers on a trackpad pan the graph on a Mac or an iPad**, and pinching zooms, in Safari as well as Chrome. Scrolling still zooms elsewhere; **Settings → Editor → Scrolling the graph** picks Pan or Zoom on any machine.",
			"**The graph works by touch.** One finger pans, two pinch and pan, and a tap on empty space clears the selection. Press and hold empty space, then drag, to draw a marquee; lift instead for the node menu. A long press opens the menu a right-click would, and a double tap is a double-click — opening a graph from the tree, adding a reroute knot. Both work everywhere in the editor, and with an Apple Pencil. See [Controls](controls).",
			"**Drag by touch.** Press and hold a variable, a local, a file or a tab until it lifts, then drag it — onto the graph, into a folder — as with a mouse. Held and lifted without moving, it opens its menu instead. The drawer it came from slides away as the drag starts.",
			"**Undo, Redo, Align, Copy, Cut, Duplicate, Delete and Paste are buttons under the graph** on a phone or a tablet — Undo and Redo always, the rest while there is something for them to act on. Node Design's logic graph has the same bar. They are icons, or words with **Settings → Editor → Action buttons**.",
			"**Node Design shows the node or its logic, not both, on a phone or a tablet**, switched with Preview and Logic in the bar above it, which also holds Luau and Nodes. The logic graph gets the whole editor, with the Luau it compiles to beneath it.",
			"**Graphs drawn in the documentation move the way the canvas does**: scrolling pans or zooms as Settings says, pinching zooms on a trackpad or with two fingers, and a double tap fits the graph back in its frame.",
			"**Node Design follows Scrolling the graph too**, and on a phone or a tablet its node list slides over the node editor from a bar above it.",
			"**On a phone or a tablet, the panels slide over the graph.** Project, Variables and Inspector each have a button under it and come out one at a time, with the whole height to themselves; opening a graph from the tree puts the tree away again.",
			"**The documentation reads on a phone or a tablet**: the contents slide out from a Contents button in the header, and the page takes the width. Tap beside them to put them away. The search button beside it opens the search Ctrl+K does.",
		],
		changed: [
			"**The mark on a documentation page opens your projects** — the editor with its projects panel up — rather than the documentation's front page, which is the first entry in the contents.",
			"**The Controls page has a tab each for Desktop and Mobile (Webapp)**, in place of the one Keyboard table. See [Controls](controls).",
			"**Settings stacks on a narrow screen**: the sections run along the top and each control sits under its label.",
		],
		fixed: [
			"**The documentation's outline no longer squeezes the page below 1100px wide.** It was meant to hide there and did not, so on an iPad or a phone in landscape it wrapped under the contents and both halved in height.",
			"**A tapped button no longer stays grey on an iPad or an iPhone.** Safari kept the last button tapped in its hover state — the Variables button, after its drawer was closed by tapping the graph.",
			"**A node map's project file keeps its height** when the Inspector beside it scrolls. On a shorter screen it was squeezed to a single line.",
			"**The arrows above an iPad's keyboard stay in the documentation's search.** They moved the cursor to a field behind it, out of sight, with the keyboard still up.",
			"**Node Design, the editor and the documentation open in the same tab on an iPad or an iPhone**, and the back button returns. The second time Node Design was opened it loaded in a tab of its own that Safari did not bring forward, so the button seemed to do nothing. Edits waiting to be saved are written first, and Node Design asks before leaving a node with unsaved changes. On a computer each still has its own tab.",
			"**The project tree scrolls within its own panel**, so a long tree no longer runs down over the Variables panel beneath it.",
			"**A wire dragged by touch lands on the pin it is dropped on.** It reported the drop to the pin it started from.",
			"**Tapping a control in a toolbar, Variables or node map picture no longer flickers.** The tap lit the new one, went back to the old one, then lit the new one again.",
			"**The docks keep their sizes after a phone is turned round.** Squeezed to fit a narrow screen, they stayed squeezed when it widened.",
			"**Focusing a field on an iPhone no longer zooms the whole editor or documentation page in.**",
			"**Dropdowns look the same in every browser**, and the same as the pictures of them in the docs. In Safari on a Mac they were the system's own control, a different height from the buttons beside them.",
			"**A documentation page could lay out with its contents in the reading column** after an update, until the browser's copy of the stylesheet expired. Each build's pages now name the exact stylesheet and script they were built with.",
		],
	},
	{
		version: "0.70.1",
		date: "2026-09-16",
		headline: "The guides split into four, and a pill fits what is on it.",
		affects: ["editor", "docs"],
		added: [
			"**A demo graph shows what it declares, beside it.** The Variables panel — the real widget, given the graph’s own modules rather than example rows — sits to the left of each picture on [Lune demos](lune-demos). A drawn graph shows `fs.readFile` and not where `fs` came from, and where it came from is the rule the whole library rests on.",
		],
		changed: [
			"**The demos are drawn as they were arranged.** The placement rule that builds them gets every node into a sensible column and leaves wires crossing; the layout is authored in the editor now and folded back, so the page draws the arrangement somebody actually made.",
			"**The guides are four shelves rather than one list of sixteen** — Writing graphs, For Roblox, For Lune, The tool. Three of the sixteen titles began “Compiling and nodemaps”, and a list that long is one you read line by line looking for a word. Somebody who only has Lune now finds their four pages together.",
		],
		fixed: [
			"**A loose Look At node has been taken out of the demo’s Main graph.** It was wired to nothing and had been sitting there since 0.18.x. Recompiling the demo also refreshed generated files that predated comment headers, so the one above the player-joined handler is in the file now.",
			"**A folder opened from your machine appears on the recent list by name**, rather than as the mount point it was given. A browser is never told where a picked folder is — only its own name — so the path on that list meant nothing next session and the card it drew could not be opened.",
			"**A project on the recent list that will not open is said so on its own card**, with a cross to take it off. The list is roots from previous sessions and a root can stop being one between them — deleted, renamed, on a drive that is not plugged in, or thrown away with the browser’s volume. It used to close the panel over a dialog saying only what went wrong, leaving nothing to do about it.",
			"**The folder picker opens in front of the browser, not behind it.** Its owner window was constructed and never shown, so there was nothing for Windows to raise and the dialog appeared behind whatever had focus — which is the browser, every time, because the click that asked for it happened there. Clicking Browse again now waits for that dialog instead of refusing: somebody pressing it twice cannot see the first one, and being told a picker is already open reads as the button being broken.",
			"**More than one folder is remembered**, and each is offered by name. The browser build kept a single handle, so working across two real projects made the older one unreachable — you had to find it in the picker again, which is what remembering it was for.",
			"**A folder with nothing in it no longer disappears on reload.** The browser build stored the project as files keyed by path, and a directory somebody had made and not put anything in yet is not implied by any of them — so it came back as nothing, and whatever remembered where it was said “Not a directory”. Directories are stored alongside the files now, and a project stored before this reads exactly as it did.",
			"**A dialog raised while the panel was open rendered behind it** — invisible, modal, and holding the focus. The panel now sits under anything that speaks.",
			"**An operator’s value field no longer hangs off the side of it.** A pill’s width came from its pins’ defaults while what is drawn on a row comes from the pin’s default *or the value on that node*. For most of them the two agree by accident; `compare.eq` takes `any` with no default, so it was measured with no room for a field and then drawn with one.",
		],
		watch: [
			"The width still does not change when a wire lands, which is what the old rule was protecting: a value stays on the node, so the field stops being drawn and the column simply stays empty.",
		],
	},
	{
		version: "0.70.0",
		date: "2026-09-16",
		headline: "The Roswaal mark opens the way in, from any window.",
		affects: ["editor", "docs"],
		added: [
			"**An introduction panel on the Roswaal mark**, in the editor, Node Design and the documentation alike. The projects you were in, the projects that shipped, and the way to the other two windows — one panel, because the question somebody has when they reach for the mark is the same one in all three.",
			"**The demos are offered by name, with the runtime they compile for.** A Roblox demo and a Lune one, each with its chip, so arriving at Lune support no longer means opening a Roblox project and being told the rest transfers.",
			"**A Lune project to open**, at `examples/lune-demo`: the four programmes from [Lune demos](lune-demos), generated from the same graphs the page draws.",
		],
		changed: [
			"**The editor's project menu is gone**, and what it did is in the panel. It was the only surface where the mark did anything, and what it did was not what the other two needed.",
			"Which projects you have opened before is now read by all three windows rather than by the editor alone.",
		],
		fixed: [
			"**A demo is taken as a copy, not opened where it lies.** The demos ship beside the tool, so opening one put the editor straight onto the files every other user of that install would get — and in a checkout, editing one turned up as a change to Roswaal rather than as somebody’s own work. A card copies it somewhere of your choosing and opens that; a second copy is `lune-demo-2` rather than an overwrite.",
			"The panel’s recent shelf kept its gutter until it was scrolled, and then lost it. A snap aligns a card to the scrollport rather than to the padding, so the first card slid flush against the edge while the shelf below it, still at zero, kept its sixteen pixels.",
			"Showing the shelf’s scrollbar on hover changed the scrollport’s height, so the cards shifted as the pointer arrived and back again as it left.",
			"The wordmark lost its weight when the mark became a button: `font: inherit` resets more than the family.",
			"**Four graphs the documentation builds shared one id**, which was invisible while they were pictures and destructive as a project: the compiler keys generated files by graph id, so each compile deleted the file before it. All four wrote and one survived.",
		],
		watch: [
			"The panel asks the host which demos it has rather than assuming. A daemon has them on disk beside itself; an install that packed the CLI without the examples has none, and the panel then offers none rather than paths that are not there.",
		],
	},
];
