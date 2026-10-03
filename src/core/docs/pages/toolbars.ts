/**
 * The `toolbars` page of the documentation. `buildSite` places it.
 */

import type { DocPage } from "../site.js";
import {
	ACTION_ROW,
	DESIGNER_BAR,
	DESIGNER_BAR_BROWSER,
	DESIGNER_BAR_PHONE,
	DESIGNER_BAR_TABLET,
	DESIGNER_TOUCH_BAR,
	DOCS_BAR,
	DOCS_SITE_BAR,
	DOCS_SITE_BAR_PHONE,
	DOCS_SITE_BAR_TOUCH,
	EDITOR_BAR,
	EDITOR_BAR_BROWSER,
	EDITOR_BAR_PHONE,
	EDITOR_BAR_TABLET,
	GRAPH_BAR,
	GRAPH_BAR_PHONE,
	GRAPH_BAR_TABLET,
	MAP_BAR,
	PROJECT_PANEL_HEAD,
} from "../toolbars.js";

/**
 * Where every button is, and what it does.
 *
 * It exists because of the one complaint icon-only chrome always earns: people
 * could not find Node Design, the documentation or Settings. All three are a
 * glyph at the right-hand end of the editor's top bar, and a glyph says nothing
 * until it is hovered — so the answer is a picture of the bar with the controls
 * named under it, not another paragraph about them.
 *
 * Every bar is drawn from the spec in `toolbars.ts` rather than described here,
 * so the page cannot list a control the tool does not have.
 */
export function toolbarsPage(): DocPage {
	return {
		slug: "toolbars",
		title: "Toolbars",
		summary: "Every bar in the tool, drawn, with what each button does.",
		blocks: [
			{
				t: "p",
				text:
					"Roswaal's chrome is mostly icons. Hovering one gives its name, which works once " +
					"you know roughly where to look — so this page is the map: each bar drawn as it " +
					"appears, with every control named underneath it.",
			},
			{
				t: "note",
				kind: "info",
				text: "The three hardest to find:",
				items: [
					"**Docs** — the document icon, third from the right on the editor's top bar.",
					"**Node Design** — the palette icon, second from the right.",
					"**Settings** — the gear icon, last on the bar.",
				],
			},
			{
				t: "p",
				text:
					"On a computer all three open in **their own window** rather than over the canvas, " +
					"so nothing appears to happen on the page you were on: look for a new tab. On a " +
					"phone or a tablet they take turns in the one tab, and the back button returns.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"**There are two editors:** the one `roswaal serve` runs, and the **browser preview** " +
					"on the project site — the same build, on a project kept in the browser instead of " +
					"your repository.",
				items: [
					"**Every preview window is marked:** a blue mark beside the version (yellow on the " +
						"canary), or a `preview` chip in Node Design. If you see either, your work is in " +
						"this browser, not on disk.",
					"Otherwise the bars are the same. Where one differs, both are drawn below under a switch.",
				],
			},
			{ t: "h", level: 2, text: "The editor's top bar" },
			{
				t: "tabs",
				label: "Where are you working?",
				tabs: [
					{
						id: "editor-daemon",
						title: "Desktop (localhost)",
						device: ["localhost"],
						blocks: [{ t: "toolbar", bar: EDITOR_BAR, hint: true }],
					},
					{
						id: "editor-browser",
						title: "Desktop (Webapp)",
						device: ["webapp"],
						blocks: [{ t: "toolbar", bar: EDITOR_BAR_BROWSER }],
					},
					{
						id: "editor-tablet",
						title: "Tablet (Webapp)",
						device: ["tablet"],
						blocks: [{ t: "toolbar", bar: EDITOR_BAR_TABLET }],
					},
					{
						id: "editor-phone",
						title: "Phone (Webapp)",
						device: ["phone"],
						blocks: [{ t: "toolbar", bar: EDITOR_BAR_PHONE }],
					},
				],
			},
			{
				t: "p",
				text:
					"It is always there, and everything on it acts on the **project** rather than on " +
					"the document you have open. The bar below it, and the tools over the canvas, are " +
					"the ones that change with what you are looking at.",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"In the browser preview, **Docs** opens the published pages, which cover the " +
					"**built-in library only**. Your own packs are documented in the editor `roswaal " +
					"serve` runs.",
			},
			{ t: "h", level: 2, text: PROJECT_PANEL_HEAD.title },
			{ t: "toolbar", bar: PROJECT_PANEL_HEAD },
			{
				t: "p",
				text: "The rest of the panel is on [The Project panel](project-panel).",
			},
			{ t: "h", level: 2, text: GRAPH_BAR.title },
			{
				t: "tabs",
				label: "Where are you working?",
				tabs: [
					{
						id: "graph-desktop",
						title: "Desktop",
						device: ["localhost", "webapp"],
						blocks: [{ t: "toolbar", bar: GRAPH_BAR }],
					},
					{
						id: "graph-tablet",
						title: "Tablet (Webapp)",
						device: ["tablet"],
						blocks: [{ t: "toolbar", bar: GRAPH_BAR_TABLET }],
					},
					{
						id: "graph-phone",
						title: "Phone (Webapp)",
						device: ["phone"],
						blocks: [{ t: "toolbar", bar: GRAPH_BAR_PHONE }],
					},
				],
			},
			{
				t: "note",
				kind: "info",
				text:
					"These are **three separate floating panels**, not one strip. The gaps between them " +
					"are canvas you can click and drag.",
			},
			{
				t: "p",
				text:
					"The graph's name only appears here if you ask for it: **Show document name** in " +
					"[Settings](settings). Without it, unsaved edits are a dot in the same place. " +
					"The keys these buttons duplicate are on [Controls](controls).",
			},
			{ t: "h", level: 3, text: MAP_BAR.title },
			{ t: "toolbar", bar: MAP_BAR },
			{
				t: "p",
				text:
					"A node map is a tree rather than a graph, so it takes a row above the view instead " +
					"of floating tools, and it has none of the graph tools — there is no canvas for " +
					"them to act on. That is the shape, not something missing.",
			},
			{ t: "h", level: 2, text: "Node Design's top bar" },
			{
				t: "tabs",
				label: "Where are you working?",
				tabs: [
					{
						id: "designer-daemon",
						title: "Desktop (localhost)",
						device: ["localhost"],
						blocks: [{ t: "toolbar", bar: DESIGNER_BAR }],
					},
					{
						id: "designer-browser",
						title: "Desktop (Webapp)",
						device: ["webapp"],
						blocks: [{ t: "toolbar", bar: DESIGNER_BAR_BROWSER }],
					},
					{
						id: "designer-tablet",
						title: "Tablet (Webapp)",
						device: ["tablet"],
						blocks: [{ t: "toolbar", bar: DESIGNER_BAR_TABLET }],
					},
					{
						id: "designer-phone",
						title: "Phone (Webapp)",
						device: ["phone"],
						blocks: [{ t: "toolbar", bar: DESIGNER_BAR_PHONE }],
					},
				],
			},
			{
				t: "p",
				text:
					"Node Design is reached from the **palette icon** on the editor's top bar, or at " +
					"`/designer` while the daemon is running. What to do once you are in it is on " +
					"[Creating custom nodes](creating-custom-nodes).",
			},
			{ t: "h", level: 2, text: "The documentation's top bar" },
			{
				t: "tabs",
				label: "Which copy are you reading, and on what?",
				tabs: [
					{
						id: "docs-daemon",
						title: "Desktop (localhost)",
						device: ["localhost"],
						blocks: [{ t: "toolbar", bar: DOCS_BAR }],
					},
					{
						id: "docs-published",
						title: "Desktop (Webapp)",
						device: ["webapp"],
						blocks: [{ t: "toolbar", bar: DOCS_SITE_BAR }],
					},
					{
						id: "docs-tablet",
						title: "Tablet (Webapp)",
						device: ["tablet"],
						blocks: [{ t: "toolbar", bar: DOCS_SITE_BAR_TOUCH }],
					},
					{
						id: "docs-phone",
						title: "Phone (Webapp)",
						device: ["phone"],
						blocks: [{ t: "toolbar", bar: DOCS_SITE_BAR_PHONE }],
					},
				],
			},
			{
				t: "p",
				text:
					"These are two different headers rather than one header pointing at two places. " +
					"The window the daemon serves has an editor and a project behind it, so it offers " +
					"Settings and a way back. The published copy has neither, so it offers the browser " +
					"preview and the source instead.",
			},
			{
				t: "p",
				text:
					"The documentation window is reached from the **document icon** on the editor's top " +
					"bar, or at `/docs`. `Ctrl` + `K` searches it from the editor and from Node Design " +
					"without opening it first.",
			},
			{ t: "h", level: 2, text: "Getting between the three windows" },
			{
				t: "p",
				text:
					"Roswaal is three windows out of one build, and each one can reach the others. " +
					"On a computer none of them replaces the window you are on; on a phone or a tablet " +
					"they take turns in one tab, and the back button returns.",
			},
			{
				t: "table",
				head: ["To get to", "From the editor", "From Node Design", "From Docs"],
				rows: [
					["The editor", "—", "**Open Editor**", "**Open Editor**"],
					["Docs", "The document icon", "**Docs**, or `Ctrl` + `K`", "—"],
					["Node Design", "The palette icon", "—", "Not from here"],
					["Settings", "The gear", "The gear", "**Settings**"],
				],
			},
			{
				t: "note",
				kind: "warn",
				text:
					"Settings in Node Design and the docs has no Project tab. Project settings are " +
					"changed from the editor, which has the project open.",
			},
			{ t: "h", level: 2, text: "Only on a touch screen" },
			{
				t: "p",
				text:
					"Two bars a tablet and a phone have and a computer does not, the same on both. Where " +
					"they sit is on [The Interface](the-interface).",
			},
			{ t: "h", level: 3, text: ACTION_ROW.title },
			{ t: "toolbar", bar: ACTION_ROW },
			{ t: "h", level: 3, text: DESIGNER_TOUCH_BAR.title },
			{ t: "toolbar", bar: DESIGNER_TOUCH_BAR },
		],
	};
}
