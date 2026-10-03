/**
 * The `the-interface` page of the documentation. `buildSite` places it.
 */

import {
	DESIGNER_LAYOUT, DESIGNER_LAYOUT_PHONE, DESIGNER_LAYOUT_TOUCH, EDITOR_LAYOUT, EDITOR_LAYOUT_PHONE,
	EDITOR_LAYOUT_TOUCH,
} from "../layouts.js";
import type { DocPage } from "../site.js";
import { ACTION_ROW, DESIGNER_TOUCH_BAR } from "../toolbars.js";

/**
 * A map of the two windows a graph is built in, before the pages about using
 * them.
 *
 * Controls says what each key and gesture does and Toolbars names each button,
 * which both assume the reader knows where the Inspector is. This is where
 * they find out: each window drawn as its regions, numbered, with a line each
 * -- and, in the Mobile tabs, where those regions go on a touch screen and
 * what is only there. The docs themselves are not drawn: a page to read needs
 * no map.
 */
export function theInterfacePage(): DocPage {
	return {
		slug: "the-interface",
		title: "The Interface",
		summary: "What each part of the editor and Node Design is, and where it sits.",
		blocks: [
			{
				t: "p",
				text:
					"Roswaal has three windows: the editor, where you build graphs; **Node Design**, " +
					"where you make the nodes they are built from; and these docs. This page is a map of " +
					"the first two. How each part is used is on [Controls](controls), and every button is " +
					"named on [Toolbars](toolbars).",
			},
			{
				t: "p",
				text:
					"On a tablet or a phone the same parts are there, arranged for a finger; a phone " +
					"folds its bars further still. The **Tablet** and **Phone** tabs show where they go, " +
					"and what is only there.",
			},
			{ t: "h", level: 2, text: "The editor" },
			{
				t: "tabs",
				label: "What are you using?",
				tabs: [
					{
						id: "interface-editor-desktop",
						title: "Desktop",
						device: ["localhost", "webapp"],
						blocks: [
							{ t: "layout", layout: EDITOR_LAYOUT, hint: true },
							{
								t: "note",
								kind: "info",
								text:
									"That is where each panel starts. Drag one by its heading to another edge, " +
									"or out over the graph as a window.",
							},
						],
					},
					{
						id: "interface-editor-tablet",
						title: "Tablet (Webapp)",
						device: ["tablet"],
						blocks: [
							{ t: "layout", layout: EDITOR_LAYOUT_TOUCH },
							{ t: "toolbar", bar: ACTION_ROW },
						],
					},
					{
						id: "interface-editor-phone",
						title: "Phone (Webapp)",
						device: ["phone"],
						blocks: [{ t: "layout", layout: EDITOR_LAYOUT_PHONE }],
					},
				],
			},
			{
				t: "p",
				text:
					"With a place, **Properties** joins the right-hand side, under the Inspector, for an " +
					"instance opened from the DataModel.",
			},
			{ t: "h", level: 2, text: "Node Design" },
			{
				t: "p",
				text:
					"Opened from the editor's top bar. It lists the project's node packs; open one and " +
					"pick a node to edit it.",
			},
			{
				t: "tabs",
				label: "What are you using?",
				tabs: [
					{
						id: "interface-designer-desktop",
						title: "Desktop",
						device: ["localhost", "webapp"],
						blocks: [{ t: "layout", layout: DESIGNER_LAYOUT }],
					},
					{
						id: "interface-designer-tablet",
						title: "Tablet (Webapp)",
						device: ["tablet"],
						blocks: [
							{ t: "layout", layout: DESIGNER_LAYOUT_TOUCH },
							{ t: "toolbar", bar: DESIGNER_TOUCH_BAR },
						],
					},
					{
						id: "interface-designer-phone",
						title: "Phone (Webapp)",
						device: ["phone"],
						blocks: [{ t: "layout", layout: DESIGNER_LAYOUT_PHONE }],
					},
				],
			},
			{
				t: "note",
				kind: "info",
				text:
					"On phones or tablets, the Editor, Node Design and Docs share one tab, and Back " +
					"returns. On a computer each has its own.",
			},
		],
	};
}
