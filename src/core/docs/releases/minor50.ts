/**
 * Release notes for 0.50.0 to 0.59.x, newest first.
 *
 * One of the files `../releases.ts` puts together, a tenth of the minor
 * versions each, so the newest notes are not at the top of a very long file.
 */

import type { Release } from "../releases.js";

export const RELEASES_0_50: Release[] = [
	{
		version: "0.59.2",
		date: "2026-09-15",
		headline: "A published documentation page leads somewhere.",
		affects: ["docs"],
		added: [
			"**The header of every documentation page** carries *Try it in your browser* and *Source*. The mark still goes to the documentation's own index.",
		],
	},
	{
		version: "0.59.1",
		date: "2026-09-15",
		headline: "The source is public.",
		affects: ["docs"],
		added: [
			"**Roswaal is open source** — [github.com/neopolitans/Roswaal](https://github.com/neopolitans/Roswaal), under 0BSD. Read it, fork it, take what you want from it.",
			"The front page links the repository, beside the documentation.",
		],
		changed: [
			"The front page no longer calls itself a preview. It carries the version instead.",
			"Reports still go to [roswaal-feedback](https://github.com/neopolitans/roswaal-feedback/issues/new) — the source repository is for reading.",
		],
	},
	{
		version: "0.59.0",
		date: "2026-09-15",
		headline: "The front page says what is planned, and what it runs on.",
		affects: ["docs"],
		added: [
			"**A list of what is planned** — Wally packages, importing Luau you already have, a real Luau parser, reading a Rojo project as a node map, runtime errors that point at a node, and overriding a built-in node. Plans rather than promises: none of it is in the version you can try today, and any of it may change or be dropped.",
		],
		changed: [
			"The front page says it compiles for **Roblox** and **Lune**, and marks Lune experimental — Roswaal is built and checked against Roblox.",
		],
	},
	{
		version: "0.58.1",
		date: "2026-09-15",
		headline: "The front page says custom nodes once, and points at the edit button.",
		affects: ["docs"],
		changed: [
			"Designing a node and writing a pack were two points saying most of the same thing, and are now one. The room went to the **Suggest an edit** pencil that every documentation page already carries, which nothing on the site mentioned.",
		],
	},
	{
		version: "0.58.0",
		date: "2026-09-15",
		headline: "An execution wire no longer runs behind the nodes feeding it.",
		affects: ["docs"],
		changed: [
			"**A drawn graph moves its value nodes off the execution wire's lane.** A flow wire often runs a long way — from the start of a script to the node that handles an event, past everything working out its arguments — and a pure node sitting on that line had the wire pass behind it, which reads as a wire going into it. Fifteen of the thirty-nine drawn graphs had one; two remain, where the node carries flow of its own and belongs there.",
		],
	},
	{
		version: "0.57.0",
		date: "2026-09-15",
		headline: "Ctrl+K opens the documentation from Node Design too.",
		affects: ["designer", "docs"],
		added: [
			"**Ctrl+K searches the documentation from Node Design**, the way it already did from the graph. Designing a node is where the reference for the one you are copying is most wanted, and it was the one place the shortcut did nothing.",
		],
		changed: [
			"The front page says what the editor is actually like to use: the two ways to search for a node, the two ways to write one in Node Design, and the colour schemes.",
		],
	},
	{
		version: "0.56.0",
		date: "2026-09-15",
		headline: "Drawn graphs line their wires up.",
		affects: ["docs", "editor"],
		changed: [
			"**A drawn graph nudges its nodes so the wires between them run level**, on the documentation site, in the editor's docs window, and on the front page. Only vertically, and only a node that something feeds — the columns stay where they were, so the shape of the graph is unchanged. An execution wire wins over a value one, since that is the wire the graph is about.",
			"**The front page leads with what Roswaal is and what it costs**, and says what you own: the graphs, the generated Luau, and a 0BSD licence with nothing to ask permission for.",
		],
	},
	{
		version: "0.55.0",
		date: "2026-09-15",
		headline: "Roswaal has a front page.",
		affects: ["docs"],
		added: [
			"**A landing page**, showing a graph and the Luau compiled from it. Both halves are built from the same `.nodescript` by the same compiler the editor runs, so the picture cannot show a wiring the code does not have — and it says what is there beyond the nodes: the two escape hatches, node packs of your own, and a reference page for every node.",
		],
		fixed: [
			"**Luau is coloured wherever it is shown.** The palette was scoped to a list of containers and a new one had not been added to it, so a code block could be correct, classed, and entirely grey.",
		],
	},
	{
		version: "0.54.0",
		date: "2026-09-15",
		headline: "The browser version remembers your folder, and can set one up.",
		affects: ["editor"],
		added: [
			"**A folder you opened in the browser is opened again next time.** Where the permission has lapsed — which it does between sessions — the project menu offers it by name, and the click that accepts is the click that asks for permission back.",
			"**A folder with no** `roswaal.json` **can be set up from the browser**, so trying Roswaal on your own project no longer means installing it first. It asks before writing, and writes what `roswaal init` writes: `roswaal.json`, `.roswaal/scripts` and `.roswaal/nodes`. Nothing else in the folder is touched.",
		],
		changed: [
			"**Start again from the demo** also forgets the folder it was remembering.",
		],
	},
	{
		version: "0.53.2",
		date: "2026-09-15",
		headline: "Drawn graphs fit their frames again on the documentation site.",
		affects: ["docs"],
		fixed: [
			"**Every drawn graph on the published documentation was rendering at its natural size and overflowing its box**, and could not be panned or zoomed. The site's one script was throwing on its first line of every page, which took the search box with it.",
			"**The documentation's script and stylesheet carry the version in their address**, so a release is not served to a returning reader alongside the previous one's script. A published site cannot set its own cache headers, and the two are cached for ten minutes under names that never change.",
		],
	},
	{
		version: "0.53.0",
		date: "2026-09-15",
		headline: "The browser version can open a project on your own computer.",
		affects: ["editor"],
		added: [
			"**Open a folder on your computer**, from the browser version's project menu, with nothing installed. Roswaal reads and writes that folder directly, so compiled Luau lands where Rojo is already watching for it. **Chrome and Edge only** — the browser has to be able to hand a folder over, and where it cannot, the option is not offered.",
		],
		watch: [
			"A folder with no `roswaal.json` is refused rather than opened as an empty project. Run `roswaal init` in it first.",
			"Nothing watches the folder while it is open in a browser: a change made outside Roswaal — a branch switch, a pull, another editor — is not noticed until you reopen it. The daemon on your machine does watch.",
		],
	},
	{
		version: "0.52.0",
		date: "2026-09-15",
		headline: "The browser version keeps what you were working on.",
		affects: ["editor"],
		added: [
			"**Roswaal in a browser keeps your project between visits.** It is stored in that browser and nowhere else — not on a server, and not on your disk — so it does not follow you to another machine, and clearing your browser's site data takes it with everything else. Download it as a zip for anything you would mind losing.",
			"**Start again from the demo**, in the project menu of the browser version, for when you want the project you started with back.",
		],
	},
	{
		version: "0.51.0",
		date: "2026-09-15",
		headline: "The editor asks what it is running on, and offers only that.",
		affects: ["editor", "designer"],
		added: [
			"**Download as a zip**, in the project menu: every graph, node map, node pack, config file and generated Luau, in one archive named after the project.",
		],
		changed: [
			"**A control that needs something this copy of Roswaal does not have is no longer offered.** Showing a file in a file manager and handing one to an editor are shown but disabled, with a tooltip saying where they work; opening another project, the recent list and copying a node pack between projects are hidden, since there is nothing behind them to do. On a machine with a filesystem nothing changes — on one without a folder dialog, the Browse button is gone rather than failing when pressed.",
			"**A host that is not answering says so**, instead of showing the screen that asks you to choose a project folder.",
		],
	},
	{
		version: "0.50.4",
		date: "2026-09-15",
		headline: "A path means the same thing on every platform.",
		affects: ["editor"],
		fixed: [
			"**A path written with backslashes is read the same way on Linux and macOS as it is on Windows.** The separator was only stripped when it was the one the daemon's own machine uses, so a graph at `scripts\Shared\Greeter.nodescript` compiled to `Greeter.luau` on Windows and to `scriptsSharedGreeter.luau` elsewhere. Renaming, moving, and the checks that keep a path inside its project read the same paths and were wrong in the same way.",
		],
	},
	{
		version: "0.50.3",
		date: "2026-09-15",
		headline: "The dock and undock buttons sit on the row they belong to.",
		affects: ["editor"],
		fixed: [
			"**The buttons that move a panel between a dock and a window are centred on the heading they sit over.** On the diagnostics panel, whose heading is the errors-and-warnings bar rather than a title, the button sat six pixels low and hung out of the bottom of the bar; on every other panel it sat four pixels low.",
		],
	},
	{
		version: "0.50.2",
		date: "2026-09-15",
		headline: "A window resizes from either corner, and draws what it holds.",
		affects: ["editor", "docs"],
		added: [
			"**A window resizes from its top-left corner as well as its bottom-right**, moving as it shrinks so the far corner stays where it is — the same pair of handles a comment has.",
		],
		fixed: [
			"**A panel in a window lays out as it does in a dock.** The project tree drew its outline and its tree as two halves of the window with a screen of nothing between them: the window was stretching every element a panel rendered, rather than the panel.",
			"**One scroll container per window**, round the panel, which is the job a dock does for the panels in it.",
		],
	},
	{
		version: "0.50.1",
		date: "2026-09-15",
		headline: "Drag a panel onto the graph.",
		affects: ["editor", "docs"],
		added: [
			"**Dragging a panel out of its dock and onto the graph makes it a window**, where you dropped it. The gesture did nothing before: the only drop targets were the three edges, so a drop in the middle read as a miss.",
			"**A ⇥ button on every docked panel** does the same without the drag — the mirror of the ⇤ that puts a window back.",
		],
		fixed: [
			"**Both buttons are the size of the heading they sit in**, rather than the toolbar's 28px icons, and sit level with the panel's own Add button.",
		],
	},
	{
		version: "0.50.0",
		date: "2026-09-15",
		headline: "A picker that draws the node, and constants in the Variables list.",
		affects: ["editor", "docs"],
		added: [
			"`Ctrl` **+ right-click opens the node picker**: the same nodes as the menu, with each one **drawn** as you walk the list, in your own wire style and node corners. For when you remember what a node looks like rather than what it is called. Listed under *Advanced shortcuts* on the Controls page.",
			"`Ctrl` **+** `K` **in the editor jumps to a documentation page.** Pick one and the docs window opens on it — the same search the docs window has, from wherever you are in a graph.",
			"**A variable can be a** `const`, set per variable in its own row: declared once at the top of the file with its starting value, and never assigned again. **Set Variable** and **Initialize Variable** on one are refused before the file is written.",
			"**Constants are marked in the Variables list**, variables and locals alike, with the keyword they write.",
		],
		fixed: [
			"**A dock stops resizing when you let go**, wherever you let go. Releasing the splitter away from it left the drag running, so the next time the pointer passed over it the dock carried on growing.",
		],
	},
];
