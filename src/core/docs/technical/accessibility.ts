/**
 * Chapter 8 of the technical specification: reading and editing a graph
 * without relying on colour, fine aim, sight or a pointer.
 *
 * The requirements are what an editor owes the people using it, not what
 * Roswaal happens to do. Where Roswaal falls short, the page says so beside
 * the requirement it does not yet meet.
 */

import type { DocPage } from "../site.js";
import { normative, req } from "./spec.js";

export function accessibilityPage(): DocPage {
	return {
		slug: "technical/accessibility",
		title: "8 Accessibility",
		summary:
			"Reading a graph without colour, contrast in every theme, targets a finger can hit, screen readers, and motion.",
		spec: normative("Levels 3 and 4"),
		blocks: [
			{
				t: "p",
				text:
					"§8.1 and §8.2 hold every renderer (level 3); the rest hold every editor (level " +
					"4). Where this page and another disagree, this one wins.",
			},

			// 8.1 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "8.1 Reading without colour" },
			req(
				"8.1-R1",
				"meets",
				"A renderer **MUST NOT** rely on colour alone to tell any two things on the canvas apart.",
			),
			{ t: "p", text: "Every colour has a second cue:" },
			{
				t: "ul",
				items: [
					"A node's category: the glyph in its tab (§5.4).",
					"A pin's kind: flow pins are triangles, and a data pin's shape is its family (§5.5).",
					"A pin's type: the chip on an output, and the full name on request (§5.5).",
					"A step and a value: their shapes (§5.3).",
					"An error and a warning: the error's count is a number in an oval, the warning's mark a single sign in a circle, and the note says which it is in words.",
					"A selected node and the anchor: the ring's weight (§5.8).",
				],
			},

			// 8.2 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "8.2 Contrast in every theme" },
			req(
				"8.2-R1",
				"meets",
				"A theme **MUST** be refused if any of these is lower than its minimum, using the WCAG 2 contrast ratio:",
			),
			{
				t: "table",
				head: ["Colour", "Against", "At least"],
				rows: [
					["Body text", "The window, and panels", "4.5 : 1"],
					["Secondary text", "The window, and panels", "3 : 1"],
					["Faint text", "The window, and panels", "2 : 1"],
					["A node's body", "The canvas", "1.12 : 1"],
					["Code colours", "A text field", "3 : 1, and 2 : 1 for comments"],
				],
			},
			{
				t: "p",
				text: "These are the checks `validateTheme` in `core/theme.ts` makes of every theme Roswaal ships or loads.",
			},
			req(
				"8.2-R2",
				"meets",
				"A theme **MUST** say whether it is dark, and the claim **MUST** match its window colour, because the overlays worked out from it (§5.7) depend on it.",
			),
			{
				t: "note",
				kind: "info",
				label: "Not yet checked",
				text:
					"The specification will also require profile colours, the pin and category " +
					"colours, to stand apart from both the node body and the canvas in light and " +
					"dark themes. Roswaal does not check them yet.",
			},

			// 8.3 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "8.3 Hit targets" },
			{
				t: "p",
				text:
					"Starting a wire takes aim, and a pin's target **MAY** be little more than the pin, " +
					"so the rest of the node can still be grabbed. Roswaal's is the 16-unit slot plus " +
					"3 units around it.",
			},
			req(
				"8.3-R1",
				"meets",
				"Landing a wire takes no aim: while a wire is in flight every pin's target **MUST** grow. Roswaal's grows to 9 units around the slot, 34 across.",
			),
			req(
				"8.3-R2",
				"not-yet",
				"On a touch screen, every control **SHOULD** be at least 44 by 44 CSS pixels at the zoom the graph is shown at, as WCAG 2.5.5 asks, and where a control cannot be, the editor **SHOULD** offer a way to zoom to one that is.",
				"On a touch screen Roswaal's toolbar buttons grow to 38 pixels, and its pins do not grow at all.",
			),

			// 8.4 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "8.4 Keyboard and screen readers" },
			req(
				"8.4-R1",
				"not-yet",
				"Every action of chapter 4 **MUST** be possible from the keyboard alone: moving between nodes and between a node's pins, making and removing a wire, opening the node list and placing a node, moving a node, and editing its values.",
				"Nothing on Roswaal's canvas is reached by the keyboard yet.",
			),
			req(
				"8.4-R2",
				"not-yet",
				"A node **MUST** have an accessible name: its title, its kind, and its problems. A pin **MUST** have one: its name, its side, its type, and what it is wired to.",
				"Roswaal's nodes and pins have no accessible names; its menus, dialogs and panels have roles and labels.",
			),
			req(
				"8.4-R3",
				"not-yet",
				"Changes a person makes **SHOULD** be announced: a wire made, a node placed or deleted, a problem found or fixed.",
				"Roswaal announces only compiling and its toasts.",
			),
			req(
				"8.4-R4",
				"not-yet",
				"Focus **MUST** be visible on the canvas, on a node and on a pin.",
				"Roswaal draws no focus ring on its canvas.",
			),
			{
				t: "note",
				kind: "warn",
				label: "Where Roswaal falls short",
				text: "Until §8.4 is met, Roswaal does not conform at level 4.",
			},

			// 8.5 ----------------------------------------------------------------
			{ t: "h", level: 2, text: "8.5 Motion" },
			req(
				"8.5-R1",
				"meets",
				"Where the system asks for reduced motion, an editor **MUST** drop animation that is not needed to understand a change, such as controls fading in on hover.",
			),
			req(
				"8.5-R2",
				"meets",
				"A renderer **MUST NOT** make anything flash more than three times a second.",
			),
			req(
				"8.5-R3",
				"meets",
				"An editor **MUST NOT** move the view without being asked, except to show something the person asked to see.",
			),
		],
	};
}
