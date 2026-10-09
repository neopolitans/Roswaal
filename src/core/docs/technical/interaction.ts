/**
 * Chapter 4 of the technical specification: how a person edits a graph.
 *
 * Written from the canvas (`src/app/Canvas.tsx`, `useGraphCommands.ts`,
 * `edits.ts`, `touch.ts`, `store.ts`). Where Roswaal does not yet do what a
 * requirement asks, the page says so beside it rather than lowering the bar.
 */

import { GRID } from "../../canvasLayers.js";
import type { DocPage } from "../site.js";
import { normative, req } from "./spec.js";

export function interactionPage(): DocPage {
	return {
		slug: "technical/interaction",
		title: "4 Interaction",
		summary:
			"How a person edits a graph: finding and placing nodes, wiring, selecting and moving, editing values, problems, keys, touch and undo.",
		spec: normative("Level 4"),
		blocks: [
			{
				t: "p",
				text:
					"An editor conforming at level 4 (§1.3) lets a person do everything in this " +
					"chapter. It fixes **what** each action does, so a person moving between editors " +
					"is not surprised; it leaves **which key** to each editor, except where a key is " +
					"so widely known that using another would surprise.",
			},

			// 4.1 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "4.1 Placing and finding nodes" },
			req(
				"4.1-R1",
				"meets",
				"An editor **MUST** offer a searchable list of every node the graph's profile and its packs provide, opened where the pointer is, and place the chosen node there.",
			),
			req(
				"4.1-R2",
				"meets",
				"Search **SHOULD** match a node's title first, then its other names, its category and its description, and **SHOULD** also find things that become nodes: the graph's variables, functions and parameters.",
			),
			req(
				"4.1-R3",
				"partly",
				"Dropping a wire on empty canvas **MUST** open the same list, narrowed to nodes with a pin the wire can connect to (§6.3), and connect the wire to the first such pin of the node chosen.",
				"Roswaal's list is narrowed. Its larger visual picker, opened with Ctrl, is not, though it still connects the wire.",
			),
			req(
				"4.1-R4",
				"meets",
				"Choosing a step while dragging from a wired flow output **SHOULD** put the new step into the chain, between the two it was joining.",
			),
			{
				t: "p",
				text:
					"In Roswaal the list opens on a right-click, and on a long press with a finger. " +
					"Ctrl with a right-click opens a larger, visual picker grouped by category.",
			},

			// 4.2 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "4.2 Wiring, and what lights up" },
			{
				t: "p",
				text: "A wire is made by dragging from one pin and dropping on another. Either end may be dragged from.",
			},
			req(
				"4.2-R1",
				"meets",
				"While a wire is in flight, every pin it cannot connect to **MUST** fade, and the pins it can **SHOULD** be marked, so the legal targets are the only ones that read as reachable (§5.8).",
			),
			req(
				"4.2-R2",
				"meets",
				"While a wire is in flight, a pin's target area **SHOULD** grow, because by then the person knows which pin they want.",
			),
			req(
				"4.2-R3",
				"meets",
				"Dropping on an input that already has a wire **MUST** replace that wire (§7.1). Dragging from a wired input **SHOULD** lift its wire off, to be dropped somewhere else.",
			),
			req(
				"4.2-R4",
				"meets",
				"Dropping a data wire on the body of a node that takes a list **SHOULD** add a pin and connect to it.",
			),
			req(
				"4.2-R5",
				"meets",
				"Where a wire would connect only through a conversion the profile offers, such as narrowing a class to a subclass, an editor **MUST NOT** connect the pins directly. It **MAY** place the conversion node itself, as Roswaal does.",
			),
			req(
				"4.2-R6",
				"meets",
				"A wire **MUST** be removable from either end and from the wire itself. Roswaal removes one with Shift-click or Alt-click on the wire, and every wire on a pin with Shift-click on the pin.",
			),
			req(
				"4.2-R7",
				"meets",
				"Double-clicking a wire **SHOULD** add a reroute knot where it was clicked.",
			),

			// 4.3 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "4.3 Selecting, moving, aligning" },
			{
				t: "ul",
				items: [
					"A click selects a node; Shift or Ctrl with a click adds it to or takes it from the selection. A drag on empty canvas draws a rectangle, selecting every node and comment it touches.",
					"Dragging a selected node moves the whole selection, as one undoable step.",
					"With several nodes selected, the first one selected is the **anchor**, marked as in §5.8. Align moves each selected node up or down only, so the wires between them run level, starting from the anchor.",
				],
			},
			req(
				"4.3-R1",
				"meets",
				`Positions are free. Holding Shift while moving **SHOULD** snap the node being dragged to the grid (${GRID.fine} units, §5.1), the rest of the selection keeping its place relative to it.`,
			),
			req(
				"4.3-R2",
				"meets",
				"Moving a comment **MUST** move what is inside it: every node and comment wholly within it. What is inside is worked out when the move starts, never stored.",
			),

			// 4.4 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "4.4 Editing values in place" },
			req(
				"4.4-R1",
				"meets",
				"An input with no wire **MUST** be editable on the node itself, with an editor for its type: a check box for a boolean, a number field, a text field, or a choice from the values the pin allows.",
			),
			req(
				"4.4-R2",
				"meets",
				"An optional input **MUST** show whether it is passed at all, apart from what it is set to. Roswaal shows **default** until it is set, and a control beside a set value to stop passing it.",
			),
			{
				t: "p",
				text:
					"A value that becomes code, such as hand-written source, **MAY** be edited in a " +
					"larger editor opened from the node, and a pin holding a value with parts, such as " +
					"a vector, **MAY** be split into a pin per part and recombined.",
			},

			// 4.5 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "4.5 Controls on hover" },
			{
				t: "p",
				text: "A node at rest shows only what it says (§2.1, principle 4).",
			},
			req(
				"4.5-R1",
				"meets",
				"Controls that change a node, such as adding or removing a pin on a node that takes a list, **MUST** be hidden at rest and **MUST** appear when the pointer is over the node, when the node is selected, or when the keyboard reaches them.",
			),
			req(
				"4.5-R2",
				"meets",
				"Hidden, they **MUST NOT** take clicks, and showing them **MUST NOT** move anything else in the node.",
			),
			req(
				"4.5-R3",
				"meets",
				"A node that takes a list **SHOULD** offer one control that adds an entry at the end, and one beside each entry that removes it, wherever it is in the list. Roswaal hangs an Add row under the node and puts a grey × beside each entry.",
			),
			req(
				"4.5-R4",
				"meets",
				"Removing an entry **MUST** keep the wires and typed values of the entries after it on those same entries, and **MUST** remove the removed entry's own wires.",
			),
			req(
				"4.5-R5",
				"meets",
				"A control to remove an entry **MUST NOT** be offered when the node is at its minimum.",
			),

			// 4.6 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "4.6 Problems: where and how they show" },
			req(
				"4.6-R1",
				"meets",
				"A problem a compiler finds in a node (§7.7) **MUST** be shown on the canvas, on that node, as soon as it is found: its count on the node, its sentence under the node, the pin it names marked (§5.8).",
			),
			req(
				"4.6-R2",
				"meets",
				"An editor **MUST NOT** show a problem only in a list away from the graph. It **MAY** list every problem elsewhere as well.",
			),
			req(
				"4.6-R3",
				"meets",
				"A warning that is about where a node sits rather than what it is, such as a node not yet joined to anything, **SHOULD NOT** be marked on the node while a graph is being built. A warning a person can act on from the node **SHOULD** be.",
			),

			// 4.7 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "4.7 Keyboard" },
			req(
				"4.7-R1",
				"meets",
				"An editor **SHOULD** use the platform's own keys for undo, redo, copy, cut, paste, select all and delete.",
			),
			{
				t: "p",
				text:
					"These are Roswaal's keys; beyond those, they are informative. Ctrl is ⌘ on a Mac. " +
					"Keys do nothing while a text field or a dialog has the keyboard.",
			},
			{
				t: "table",
				head: ["Keys", "Does"],
				rows: [
					["Ctrl+Z", "Undo."],
					["Ctrl+Shift+Z, Ctrl+Y", "Redo."],
					["Ctrl+A", "Select every node and comment in the graph on screen."],
					[
						"Ctrl+C, Ctrl+X, Ctrl+V",
						"Copy, cut and paste the selection; a copied comment brings what is inside it. Paste puts it at the pointer.",
					],
					["Ctrl+D", "Duplicate the selection at the pointer."],
					["Delete, Backspace", "Delete the selection."],
					["A", "Align the selection to its anchor (§4.3)."],
					["C", "Add a comment, around the selection if there is one."],
					["Ctrl+S", "Compile."],
					["Ctrl+Shift+L", "Lay the graph out again, or only the selection."],
					["P", "Show the code the graph compiles to."],
				],
			},
			{
				t: "note",
				kind: "warn",
				label: "Where Roswaal falls short",
				text:
					"A person who cannot use a pointer cannot yet " +
					"edit a graph in Roswaal: no key moves between nodes or pins, makes a wire, opens " +
					"the node list or moves a node. §8.4 requires these of a level 4 editor, and " +
					"Roswaal does not yet conform to it.",
			},

			// 4.8 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "4.8 Touch" },
			req(
				"4.8-R1",
				"meets",
				"An editor that can be used by touch **MUST** offer every action of this chapter to a finger.",
			),
			{ t: "p", text: "Roswaal's gestures:" },
			{
				t: "table",
				head: ["Gesture", "Does, in Roswaal"],
				rows: [
					["One finger on the canvas", "Pans."],
					["Two fingers", "Pinch to zoom, about the point between them."],
					[
						"Long press",
						"What a right-click does: the node list on the canvas, the pin's menu on a pin. Lifted after moving, it draws a selection rectangle instead.",
					],
					["Hold two fingers, then lift", "Opens the visual picker."],
					["Double tap", "What a double-click does."],
					["Two-finger tap, three-finger tap", "Undo, redo."],
				],
			},
			{
				t: "p",
				text:
					"A long press is 500 ms, and a finger that moves less than 10 units still counts as " +
					"pressing. On a small or touch-only screen, Roswaal shows a bar of the commands a " +
					"keyboard would give: undo, redo, align, copy, cut, duplicate, delete and paste.",
			},

			// 4.9 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "4.9 Undo" },
			req(
				"4.9-R1",
				"meets",
				"Every change to a graph **MUST** be undoable: nodes, wires, comments, values, variables and settings stored in the file. Selecting, panning and zooming are not changes and **MUST NOT** be undone.",
			),
			req(
				"4.9-R2",
				"meets",
				"A gesture **MUST** be one step however many changes it makes: a drag, a resize, a node placed with a wire connected to it.",
			),
			req(
				"4.9-R3",
				"partly",
				"Typing into a field **SHOULD** be one step from the first key to leaving the field.",
				"Roswaal's Inspector fields are one step each; the fields on the canvas itself undo a change at a time.",
			),
			{
				t: "p",
				text: "One file has one history, shared by every view of it, such as each function's graph.",
			},
			{
				t: "p",
				text: "Roswaal keeps 100 steps per file.",
			},
		],
	};
}
