/**
 * The `controls` page of the documentation. `buildSite` places it.
 */

import type { DocPage } from "../site.js";

/**
 * Every control the editor has, in one place.
 *
 * Written from the two files that bind one — `App.tsx`'s key handler and
 * `Canvas.tsx`'s pointer handlers — so the page can be checked against them
 * rather than remembered. It has to exist: the canvas has no menu bar to browse
 * and no tooltip on empty space, so a gesture nobody wrote down is a gesture
 * nobody has.
 */
export function controlsPage(): DocPage {
	return {
		slug: "controls",
		title: "Controls",
		summary: "Every key, mouse, trackpad and touch gesture the canvas understands.",
		blocks: [
			{
				t: "p",
				text:
					"This page is the keyboard, the mouse and touch. The buttons are on [Toolbars](toolbars), " +
					"which draws each bar with every control named under it.",
			},
			{ t: "h", level: 2, text: "Keys and gestures" },
			{
				t: "tabs",
				label: "What are you using?",
				tabs: [
					{
						id: "controls-desktop",
						title: "Desktop",
						device: ["localhost", "webapp"],
						blocks: [
							{
								t: "p",
								text:
									"Keys act on the canvas, and do nothing while you are typing in a field. **Ctrl** is " +
									"**⌘** on a Mac. **Escape** closes whatever is open — a menu, a panel, the preview.",
							},
							{
								t: "table",
								head: ["Key", "What it does"],
								rows: [
									["`Ctrl` + `Z`", "Undo"],
									["`Ctrl` + `Shift` + `Z`, `Ctrl` + `Y`", "Redo"],
									["`Ctrl` + `S`", "Compile the open graph"],
									["`Ctrl` + `A`", "Select everything in the graph on screen"],
									[
										"`Ctrl` + `C`, `Ctrl` + `X`, `Ctrl` + `V`",
										"Copy, cut, paste. A function brings its graph and a comment brings what it is drawn around. The paste lands with its top-left corner at the pointer, or offset from the original when the pointer is off the canvas",
									],
									["`Ctrl` + `D`", "Duplicate the selection, at the pointer"],
									["`Ctrl` + `Shift` + `L`", "Realign the graph on screen"],
									[
										"`Delete`, `Backspace`",
										"Delete the selection. A function takes its graph, and asks first",
									],
									["`A`", "Align the selection, walking it in the order you picked it"],
									["`C`", "Comment around the selection, or an empty one if nothing is selected"],
									[
										"`P`",
										"Preview the Luau the selection compiles to. With nothing selected: the function on screen, or the whole script",
									],
								],
							},
							{
								t: "note",
								kind: "info",
								text:
									"While a compile runs outside Dynamic the canvas is locked; only `Ctrl` + `A`, `Ctrl` " +
									"+ `C` and `P` work.",
							},
						],
					},
					{
						id: "controls-mobile",
						title: "Mobile (Webapp)",
						device: ["tablet", "phone"],
						blocks: [
							{
								t: "p",
								text:
									"A long press is a right-click and a double tap is a double-click, everywhere — " +
									"so every gesture in the sections below has a touch version. An Apple Pencil " +
									"works the same way, and draws a marquee as a mouse does.",
							},
							{
								t: "table",
								head: ["Gesture", "What it does"],
								rows: [
									["Drag empty space with one finger", "Pan"],
									["Tap empty space", "Clear the selection"],
									["Two fingers", "Pinch to zoom, drag to pan"],
									["Press and hold empty space, then drag", "Marquee select"],
									["Press and hold empty space, then lift", "Node menu, where you held"],
									[
										"Press and hold with two fingers, then lift",
										"The node picker, as `Ctrl` + right-click opens",
									],
									[
										"Tap a node in the node picker",
										"Preview it. Double tap it, tap **Spawn node**, or hold and drag it onto the graph to place it",
									],
									["Long press a node or a pin", "Its menu, as a right-click opens"],
									[
										"Press and hold a variable, a file or a tab, then drag",
										"Drag it, as a mouse does — onto the graph, into a folder",
									],
									[
										"Press and hold a variable, a file or a tab, then lift",
										"Its menu, if it has one",
									],
									["**Undo** and **Redo**, under the graph", "As `Ctrl` + `Z` and `Ctrl` + `Y` do"],
									[
										"**Align**, **Copy**, **Cut**, **Duplicate**, **Delete**, **Paste**, under the graph",
										"What their shortcuts do, to the selection. Node Design's logic graph has the same bar. Icons or words: **Settings → Editor → Action buttons**",
									],
									[
										"**Preview** and **Logic**, in Node Design",
										"Show the node, or its logic, with the whole editor to itself",
									],
									[
										"Double tap",
										"Open a graph from the tree, add a reroute knot, rename a comment",
									],
									["Double tap an instance in DataModel", "Slide Properties out with it"],
									["Drag a node, or from a pin", "As with a mouse"],
									[
										"**Project**, **Variables** and **Inspector**, under the graph",
										"Slide that panel out over the graph, one at a time",
									],
									[
										"The search button beside **Contents**, in these pages",
										"Search the docs, as `Ctrl` + `K` does",
									],
								],
							},
							{
								t: "note",
								kind: "info",
								text:
									"An iPad with a keyboard takes the Desktop shortcuts as well, with **⌘** for " +
									"**Ctrl**.",
							},
						],
					},
				],
			},
			{ t: "h", level: 2, text: "Aligning" },
			{
				t: "p",
				text:
					"`A` lines a selection up, walking it in the order you picked it. The first node — " +
					"the **anchor**, drawn with a heavier ring — never moves.",
			},
			{
				t: "p",
				text:
					"From there it follows the **wires** through the rest of the selection, and each " +
					"node lines up on the neighbour it was reached from. So a chain straightens hop " +
					"by hop — a source, a knot and the node the knot feeds all come out flat, even " +
					"though the far end was never wired to the anchor, and whatever order you picked " +
					"them in. A selected node with no wired path to the anchor takes its top edge.",
			},
			{
				t: "p",
				text:
					"Where two nodes are wired, the **pins** line up rather than the boxes. That is the " +
					"difference that matters at a reroute knot: a knot is a dot with both pins at its " +
					"centre and the node it feeds has its input some way down a header, so levelling " +
					"the boxes would leave every wire through it bent.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"Nothing moves sideways — a node's column says when it runs. Use **Realign** to " +
					"rebuild the columns. Comments stay put.",
			},
			{ t: "h", level: 2, text: "The canvas" },
			{
				t: "table",
				head: ["Gesture", "What it does"],
				rows: [
					[
						"Scroll",
						"Zoom towards the pointer, or pan on a Mac or iPad. **Settings → Editor → Scrolling the graph** changes it",
					],
					["Pinch, or `Ctrl` + scroll", "Zoom, towards the pointer"],
					["Scroll sideways", "Pan"],
					["Middle-drag, or `Alt` + drag", "Pan"],
					["Drag on empty space", "Marquee select"],
					["`Shift` or `Ctrl` + drag on empty space", "Marquee adds to the selection"],
					["Click empty space", "Clear the selection"],
					["Right-click empty space", "Node menu, at the point you clicked"],
				],
			},
			{ t: "h", level: 2, text: "Nodes" },
			{
				t: "table",
				head: ["Gesture", "What it does"],
				rows: [
					["Drag", "Move it, and everything selected with it"],
					["`Shift` while dragging", "Snap to the grid; the rest keep their offsets"],
					["`Shift` or `Ctrl` + click", "Add to or remove from the selection"],
					["Right-click", "Node menu"],
					["Double-click a Declare Function, or its **ƒ**", "Open the function's graph"],
				],
			},
			{ t: "h", level: 2, text: "Functions and tabs" },
			{
				t: "table",
				head: ["Gesture", "What it does"],
				rows: [
					["The arrow beside a `.nodescript` in the tree", "List its functions"],
					["Double-click a function in the tree", "Open its graph in a tab"],
					["Click a function in the Variables panel", "Open its graph"],
					["Middle-click a tab", "Close it"],
				],
			},
			{ t: "h", level: 2, text: "Panels" },
			{
				t: "table",
				head: ["Gesture", "What it does"],
				rows: [
					["Drag a panel by its heading", "Move it to another edge"],
					["Drag a panel onto the graph", "It becomes a window there"],
					["The **⇥** button on a panel", "The same, without the drag"],
					["Drag the divider beside a dock", "Resize it; double-click to collapse"],
					["**Settings → Variables → Window**", "The same choice, remembered as a preference"],
					["Drag the window by its heading", "Move it"],
					[
						"Drag either corner of the window",
						"Resize it. The top-left moves it as it shrinks, so the far corner stays put",
					],
					["The **⇤** button on the window", "Put it back in the dock it came from"],
				],
			},
			{ t: "h", level: 2, text: "Node Design" },
			{
				t: "table",
				head: ["Gesture", "What it does"],
				rows: [
					[
						"Drag a type from the palette onto the node",
						"Add a pin: the left half an input, the right half an output",
					],
					["Click a pin, or its label", "Edit its name, type, default and tooltip"],
					["`Ctrl` + `S`", "Save the node"],
					["Right-click the logic canvas", "Add a node to the node's logic"],
					["`A`, `Ctrl` + `Shift` + `L`", "Align and realign in the logic canvas, as on a graph"],
					[
						"`Ctrl` + `C`, `X`, `V`, `D`",
						"Copy, cut, paste and duplicate in the logic canvas, on the same terms as a graph. Node Inputs and Node Outputs are left out of all four: there is one of each and they are already here",
					],
				],
			},
			{ t: "h", level: 2, text: "Pins and wires" },
			{
				t: "table",
				head: ["Gesture", "What it does"],
				rows: [
					["Drag from a pin", "Start a wire; everything it cannot reach dims"],
					["Drop a wire on empty space", "Node menu, showing only what can take that wire"],
					[
						"Drop a wire from a service",
						"That service's methods, listed first — see [Services and their methods](services)",
					],
					[
						"Type a service or class name in the menu",
						"**ReplicatedStorage** gives Get Service; **Part** gives New Instance, each filled in",
					],
					["Drag from a wired input", "Pick that wire up and move it somewhere else"],
					["`Shift` + click a pin", "Disconnect everything on it"],
					["Right-click a pin", "Pin menu — split a struct, promote to a variable"],
					["`Shift` or `Alt` + click a wire", "Disconnect it"],
					["Double-click a wire", "Add a reroute knot where you clicked"],
				],
			},
			{ t: "h", level: 2, text: "Advanced shortcuts" },
			{
				t: "p",
				text:
					"Two that are worth knowing and neither of which you need: each is a slower, " +
					"fuller way of asking something the editor already answers quickly.",
			},
			{
				t: "table",
				head: ["Gesture", "What it does"],
				rows: [
					[
						"`Ctrl` + right-click the canvas",
						"The **node picker**: the same list as the menu, with each node **drawn** as you walk it. For when you remember the shape rather than the name. Click a node, press **Spawn node**, or drag it onto the graph",
					],
					[
						"`Ctrl` + `K`, in the editor",
						"Jump to a documentation page. Pick one and the docs window opens on it",
					],
					["`Ctrl` + `K`, in the docs", "The search palette, over the page"],
				],
			},
			{ t: "h", level: 2, text: "Searching" },
			{
				t: "table",
				head: ["Typed", "What you get"],
				rows: [
					[
						"`and`, `or`, `not`, `==`, `..`, `#`",
						"The node that writes that Luau, first in the list",
					],
					["`if`, `else`, `elseif`", "Branch"],
					["`for`, `while`, `break`, `return`", "The loop or the flow node that writes it"],
					[
						"Another name for a node: `Define Function`, `Define Type`, `Sleep`, `Log`",
						"That node, below any node actually called it",
					],
					["A service or class name", "Get Service or New Instance, filled in"],
					["A method name", "`RunService:IsServer` and the rest of that service's methods"],
				],
			},
			{ t: "h", level: 2, text: "Comments" },
			{
				t: "table",
				head: ["Gesture", "What it does"],
				rows: [
					["`C`", "A new comment: around the selection, or empty where you are looking"],
					["Right-click the canvas", "**Add comment**, placed where you clicked"],
					["Drag", "Move it, and the nodes that were inside it when you grabbed it"],
					["`Ctrl` + `C`", "Copy it, and the nodes it is drawn around"],
					["Select it", "Its colour, in the Inspector: eight swatches or a hex you type"],
					[
						"Double-click",
						"Edit the text. Enter adds a line; Esc, Ctrl+Enter or a click away saves",
					],
					["Drag the bottom-right corner", "Resize"],
					["Drag the top-left corner", "Resize, keeping the bottom-right where it is"],
				],
			},
			{ t: "h", level: 2, text: "Dragging things in" },
			{
				t: "table",
				head: ["Gesture", "What it does"],
				rows: [
					["Drag a variable from the panel", "Get Variable"],
					["`Ctrl` while dropping it", "Set Variable instead"],
					["Drag a file from the project tree", "Offers what can be done with it"],
					["Double-click a `.nodescript` in the tree", "Open it"],
					["Double-click an instance in DataModel", "Open it in Properties"],
					["Drag a property from Properties", "**Get Member** on an Instance node at its path"],
					["`Ctrl` while dropping it", "**Set Property** instead"],
					[
						"Drag an attribute from Properties",
						"**Get Attribute**, or **Set Attribute** with `Ctrl`",
					],
					["Drag the instance's name from Properties", "An Instance node at its path"],
				],
			},
		],
	};
}
