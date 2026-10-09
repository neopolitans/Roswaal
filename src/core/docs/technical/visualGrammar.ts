/**
 * Chapter 5 of the technical specification: how a graph is drawn.
 *
 * Every number on this page that the editor also uses is read from the
 * editor's own tables — `NODE`, `LAYER`, `GRID`, `ZOOM`, the type families and
 * the theme roles — so the page cannot describe a node the canvas no longer
 * draws.
 */

import { GRID, LAYER, ZOOM } from "../../canvasLayers.js";
import { GLYPH_STROKE } from "../../nodeGlyphs.js";
import { NODE } from "../../nodeMetrics.js";
import type { Registry } from "../../nodes/index.js";
import { derivedTokens, ROLES } from "../../theme.js";
import { TYPE_FAMILIES } from "../../typeFamily.js";
import { previews } from "../pages/blocks.js";
import type { Block, DocPage, PageContext } from "../site.js";
import { normative, req } from "./spec.js";

const GENERATED = (source: string) => `Generated from \`${source}\`.`;

/** Node pictures framed as the Roblox profile's: Part I names no language of its own. */
function example(registry: Registry, ids: string[], caption: string): Block[] {
	return previews(registry, ids, caption).map((block) =>
		block.t === "preview" ? { ...block, label: "Example · Luau for Roblox" } : block,
	);
}

/** What each layer holds, in the specification's words. */
const LAYER_WHAT: Record<keyof typeof LAYER, string> = {
	background: "The canvas colour.",
	grid: "The grid.",
	watermark: "The graph's name, in a corner of the canvas.",
	world: "The layer the graph is drawn in. Every value below is ordered inside it.",
	comment: "Comment boxes, behind the nodes they group.",
	commentHeader: "Their title bars, still reachable when a node overlaps the box.",
	wire: "Wires, behind nodes, so no pin is covered by its own wire.",
	wireDrag: "The wire being dragged out of a pin.",
	node: "Nodes.",
	nodeSelected: "Selected nodes, above the rest.",
	problem: "Problem notes, above every node, selected or not.",
	marquee: "The selection rectangle, while it is drawn.",
	lock: "The cover over the graph while it compiles.",
	menu: "Menus and popovers.",
};

export function visualGrammarPage({ registry }: PageContext): DocPage {
	const dark = derivedTokens(true);
	const light = derivedTokens(false);
	const tint = (tokens: Record<string, string>) =>
		`${Math.round(Number(tokens["--head-tint"]) * 100)}%`;
	const execWidth = Math.round(NODE.pinSlot * NODE.execAspect * 100) / 100;

	return {
		slug: "technical/visual-grammar",
		title: "5 Visual grammar",
		summary:
			"How a graph is drawn: the canvas, the shape and size of every kind of node, pins, wires, colour and what is drawn over what.",
		spec: normative("Level 3"),
		blocks: [
			{
				t: "p",
				text:
					"A renderer conforming at level 3 (§1.3) draws a graph as this chapter says. Its " +
					"numbers are canvas units (§1.4).",
			},
			req(
				"5-R1",
				"meets",
				"Where a length is given, a renderer **MUST** use it, so that a graph drawn by one implementation can be laid over the same graph drawn by another and every pin meets the same wire.",
			),

			// 5.1 -----------------------------------------------------------------
			{ t: "h", level: 2, text: "5.1 The canvas and its grid" },
			{
				t: "p",
				text:
					"A graph is drawn on an unbounded canvas that pans and zooms. Nodes and comments " +
					"have positions on it; wires are computed from those positions and are never " +
					"stored (§9.2).",
			},
			{
				t: "table",
				head: ["Value", "Number", "Meaning"],
				rows: [
					[
						"Grid spacing",
						`${GRID.fine}`,
						"The distance between grid points, and the step positions snap to.",
					],
					[
						"Coarse grid",
						`every ${GRID.coarseMultiple}th`,
						"Where a ruled grid draws a heavier line.",
					],
					[
						"Fine grid hidden below",
						`${Math.round(GRID.fineFadeBelow * 100)}% zoom`,
						"Below this, a renderer SHOULD stop drawing the fine grid rather than draw it as noise.",
					],
					[
						"Zoom range",
						`${Math.round(ZOOM.min * 100)}% to ${Math.round(ZOOM.max * 100)}%`,
						"The furthest out and in a renderer that lets the reader zoom SHOULD allow.",
					],
					["Zoom step", `× ${ZOOM.step}`, "One step of the wheel or a zoom key."],
				],
			},
			{ t: "p", text: GENERATED("core/canvasLayers.ts") },
			{
				t: "p",
				text:
					"The grid **MAY** be drawn as dots at each grid point or as ruled lines, and at " +
					"more than one strength; Roswaal offers both, with dots the default.",
			},
			req("5.1-R1", "meets", "The grid **MUST** be drawn below everything in the graph (§5.8)."),

			// 5.2 -----------------------------------------------------------------
			{ t: "h", level: 2, text: "5.2 Node geometry" },
			{
				t: "p",
				text:
					"An ordinary node is a header and a body of rows. Its size and the place of " +
					"every pin follow from these numbers alone, never from measuring text, so a node " +
					"is the same size in every implementation, every font and at every zoom.",
			},
			{
				t: "table",
				head: ["Name", "Value", "Meaning"],
				rows: [
					["`width`", `${NODE.width}`, "An ordinary node's width."],
					["`headerHeight`", `${NODE.headerHeight}`, "The header, with a title only."],
					[
						"`headerHeightTall`",
						`${NODE.headerHeightTall}`,
						"The header when the node shows a second line under its title.",
					],
					[
						"`rowHeight`",
						`${NODE.rowHeight}`,
						"One row of the body: one input, one output, or one of each.",
					],
					["`footer`", `${NODE.footer}`, "Space under the last row."],
					["`tab`", `${NODE.tab}`, "The width of the category tab in the header's corner (§5.4)."],
					["`radius`", `${NODE.radius}`, "A step's corner. A pure node's is twice this (§5.3)."],
					["`nodeStroke`", `${NODE.nodeStroke}`, "The node's border."],
					["`pinSlot`", `${NODE.pinSlot}`, "The square a pin is drawn in."],
					[
						"`pinLane`",
						`${NODE.pinLane}`,
						"How much of a row a pin's layout takes inside the node.",
					],
					[
						"`execAspect`",
						`${NODE.execAspect}`,
						"A flow pin's width as a fraction of its height: an equilateral triangle.",
					],
					["`execGap`", `${NODE.execGap}`, "The space between a flow pin and the node's edge."],
					["`compactHeight`", `${NODE.compactHeight}`, "A getter capsule's height."],
					["`rerouteSize`", `${NODE.rerouteSize}`, "A reroute knot's diameter."],
					["`operatorRadius`", `${NODE.operatorRadius}`, "An operator pill's corner."],
				],
			},
			{ t: "p", text: GENERATED("core/nodeMetrics.ts") },
			{ t: "h", level: 3, text: "Height" },
			{
				t: "p",
				text:
					"A node's height is its header's height, plus `rowHeight` for each row, plus " +
					"`footer`. The number of rows is the larger of its inputs and its outputs, " +
					"leaving out the flow pins that ride on the header (§5.5). A node whose only pins " +
					"ride on the header has no rows; a node with no pins at all has one.",
			},
			{ t: "h", level: 3, text: "Where a pin is" },
			{
				t: "ul",
				items: [
					"The *n*th row's centre is `headerHeight + n × rowHeight + rowHeight / 2` below the node's top, counting from 0.",
					"A flow pin on the header is centred `headerHeight / 2` below the node's top.",
					"A data pin is centred **on** the node's left or right edge.",
					`A flow pin's triangle is ${execWidth} wide (\`pinSlot × execAspect\`) and stands \`execGap\` clear of the edge, outside the node. Its wire meets it at the triangle's centre, \`execGap + width / 2\` from the edge.`,
				],
			},
			req(
				"5.2-R1",
				"meets",
				"A wire **MUST** end where its pin is, by these rules. A renderer that drew the pin elsewhere would show a wire ending in empty space.",
			),

			// 5.3 -----------------------------------------------------------------
			{ t: "h", level: 2, text: "5.3 Node kinds and shapes" },
			...example(
				registry,
				["event.connect", "roblox.getProperty", "variable.get", "math.add"],
				"A step, a value, a getter and an operator.",
			),
			{
				t: "p",
				text: "Shape is the first thing read about a node, so each kind has one of its own.",
			},
			req("5.3-R1", "meets", "A renderer **MUST NOT** draw one kind of node in another's shape."),
			{
				t: "table",
				head: ["Kind", "Shape", "Why"],
				rows: [
					[
						"**Step**",
						`A card: a header with a tinted bar and the category tab (§5.4), a body of rows, \`radius\` corners.`,
						"It happens, in order, once. Its flow pins are on its header.",
					],
					[
						"**Value**",
						"A card twice as round, with no header bar: its title and glyph are drawn in the category's colour, and the body takes a faint wash of it.",
						"It has no order: it is worked out where it is used (§7.2).",
					],
					[
						"**Getter**",
						`A capsule ${NODE.compactHeight} tall with fully round ends, its name inside and one output on its right. Its width is estimated from its name, never less than ${NODE.compactMinWidth}.`,
						"Reading a variable is the commonest value and the smallest.",
					],
					[
						"**Operator**",
						`A pill with \`operatorRadius\` corners, its symbol in the middle, its inputs down the left and its one result centred on the right.`,
						"An expression such as `a + b` reads as the expression.",
					],
					[
						"**Reroute knot**",
						`A circle \`rerouteSize\` across, with both pins at its centre.`,
						"A bend in a wire, not a node with sides.",
					],
					[
						"**Comment**",
						"A translucent box in a chosen colour with a title bar, drawn behind the nodes it holds.",
						"It groups and labels; it never runs.",
					],
				],
			},
			{
				t: "p",
				text:
					"A renderer **MAY** offer square corners as a preference. A value's corner then " +
					"squares with a step's, so the two keep their difference in proportion; a " +
					"capsule, a pill and a knot keep their shapes, which are what say what they are.",
			},

			// 5.4 -----------------------------------------------------------------
			{ t: "h", level: 2, text: "5.4 Headers and the category tab" },
			{
				t: "ul",
				items: [
					`A step's header is a **tint** of its category's colour over the node's body: ${tint(light)} of it in a light theme and ${tint(dark)} in a dark one, with a line at twice that along its lower edge. Its title is drawn in the theme's text colour.`,
					`In the header's left corner is the **category tab**: \`tab\` wide, the full height of the header, filled with the category's colour, holding the category's glyph at 18 units in white. Glyphs are drawn as strokes ${GLYPH_STROKE} wide on a 24-unit grid, scaled to fit.`,
					"The title starts 8 units after the tab and is cut short with an ellipsis rather than wrapped. A second line, where a node has one, is set smaller under the title, in a monospaced face.",
					"A value has no tab: its glyph, at 15 units, and its title are drawn in the category's colour, mixed with the text colour enough to stay readable on the body.",
				],
			},
			req(
				"5.4-R1",
				"meets",
				"A renderer **MUST NOT** fill a header with the category's colour at full strength and **MUST NOT** put the category's colour behind the title text. The colour belongs to the tab.",
			),
			req(
				"5.4-R2",
				"meets",
				"A node that holds code **SHOULD** show the profile's mark for that kind of code in its tab, in place of a glyph, as the profile's code editor marks it. Roswaal's are `{ }` for statements, `ƒx` for an expression and `<T>` for a type, in the theme's code colours on the code editor's surface.",
			),
			req(
				"5.4-R3",
				"meets",
				"A function definition's second line **SHOULD** be its signature as types alone, each in its type's colour, such as `(Model, BasePart) → boolean`: the names are on its pins, and with them the line is too long to read.",
			),
			{
				t: "p",
				text:
					"Which categories exist, their colours and their glyphs belong to the profile " +
					"(§10.1). A node that starts or ends a flow, or declares a function, takes the " +
					"profile's colour and glyph for that, whatever its category, so a graph's entry " +
					"points can be found first.",
			},

			// 5.5 -----------------------------------------------------------------
			{ t: "h", level: 2, text: "5.5 Pins, shapes and type chips" },
			{ t: "h", level: 3, text: "Flow pins" },
			{
				t: "ul",
				items: [
					"A flow pin is an equilateral triangle pointing right, drawn outside the node (§5.2), in the colour of a flow wire. It is drawn hollow until a wire is connected and solid after.",
					"A node's first input, if it is an unnamed flow pin, rides on the header, and so does its first output. Every other flow pin, and every named one, such as Body or True, has a row, because its name is what says where that flow goes.",
				],
			},
			{ t: "h", level: 3, text: "Data pins" },
			...example(
				registry,
				["call.function", "table.new", "roblox.getEvent"],
				"A function's dot in a ring on Call Function, a table's diamond on New Table, whose " +
					"output's name already says its type and so has no chip, and an object's square " +
					"and a signal's hexagon on Get Event, whose unnamed output's chip says Signal.",
			),
			{
				t: "p",
				text:
					"A data pin is centred on the node's edge, in its type's colour, and its shape is " +
					"its type's **family** (§6.2):",
			},
			{
				t: "table",
				head: ["Family", "Shape", "Holds"],
				rows: TYPE_FAMILIES.map((f) => [`\`${f.family}\``, f.shape, f.what]),
			},
			{ t: "p", text: GENERATED("core/typeFamily.ts") },
			req(
				"5.5-R1",
				"partly",
				"A renderer **MUST** draw these shapes, so a pin's kind can be read without telling colours apart (§8.1).",
				"A reroute knot's pin is drawn as a circle whatever it carries.",
			),
			{
				t: "p",
				text:
					"Each shape is drawn open while nothing is wired to it and filled once something " +
					"is, with a thin ring of a dark well colour around it, so it keeps its colour " +
					"against the node's body on one side and the canvas on the other.",
			},
			{ t: "h", level: 3, text: "Labels and type chips" },
			{
				t: "ul",
				items: [
					"A pin's name is drawn beside it, inside the node, nearly in the text colour.",
					"An output also shows its type, as a **chip**: a short name in a rounded box tinted with the type's colour. The chip is left out when the pin is untyped or generic, and when the pin's name already says the type, so a type is never said twice.",
					"A long type name **MAY** be shortened on the chip; the profile says how (§10.1).",
					"A reroute knot, a getter and an operator pill are too small to hold a chip beside their one output, so theirs is centred under them, outside the node, where it takes no part in the node's size or its wires.",
				],
			},
			req(
				"5.5-R2",
				"partly",
				"The full name of a type on a chip **MUST** be shown when the reader asks, by pointing at the chip or tapping it, with what the type is.",
				"The canvas does. The documentation's pictures draw the chips but cannot open their card, and do not yet draw a getter's, an operator's or a knot's type under it.",
			),

			// 5.6 -----------------------------------------------------------------
			{ t: "h", level: 2, text: "5.6 Wires and how they route" },
			{
				t: "ul",
				items: [
					"A wire runs from an output to an input. A flow wire is drawn in the theme's flow-wire colour; a data wire in the colour of the pin it leaves.",
					"A flow wire is drawn heavier than a data wire.",
				],
			},
			req(
				"5.6-R1",
				"meets",
				"Where a data wire joins pins of different colours, as when a number feeds a string, it **SHOULD** fade from one colour to the other along its length.",
			),
			req("5.6-R2", "meets", "A wire **MUST** be drawn below every node (§5.8)."),
			{
				t: "p",
				text:
					"Roswaal offers three routes, as a preference: **curved**, a cubic curve that " +
					`leaves and enters its pins horizontally, its control points at least ${NODE.wireSlack} ` +
					"units out; **rigid**, horizontal and vertical runs; and **angular**, which cuts " +
					"its corners. Curved is the default.",
			},
			req(
				"5.6-R3",
				"meets",
				"A renderer **MUST** offer the curved route, and **MAY** offer others.",
			),

			// 5.7 -----------------------------------------------------------------
			{ t: "h", level: 2, text: "5.7 Colour tokens and themes" },
			{
				t: "p",
				text:
					"Every colour on the canvas comes from a **theme**, a set of named colours, " +
					"except a category's colour and a type's, which come from the profile. A theme " +
					"names these roles:",
			},
			{
				t: "table",
				head: ["Role", "Token", "What"],
				rows: ROLES.map((r) => [`\`${r.role}\``, `\`${r.css}\``, r.what]),
			},
			{ t: "p", text: GENERATED("core/theme.ts") },
			{
				t: "p",
				text:
					"A theme says whether it is light or dark, and the translucent overlays (hover, " +
					"the grid, the header tint) are worked out from that rather than chosen, so no " +
					"theme can make one invisible.",
			},
			req("5.7-R1", "meets", "A theme **MUST** meet the contrasts of §8.2."),

			// 5.8 -----------------------------------------------------------------
			{ t: "h", level: 2, text: "5.8 States and layering" },
			{ t: "h", level: 3, text: "What is drawn over what" },
			{
				t: "table",
				head: ["Layer", "Order", "Holds"],
				rows: Object.entries(LAYER).map(([name, z]) => [
					`\`${name}\``,
					String(z),
					LAYER_WHAT[name as keyof typeof LAYER],
				]),
			},
			{ t: "p", text: GENERATED("core/canvasLayers.ts") },
			req(
				"5.8-R1",
				"meets",
				"A renderer **MUST** keep this order. The numbers are Roswaal's; another implementation **MAY** use any numbers that keep the same order.",
			),
			{ t: "p", text: "The panels around the canvas are outside this stack, above it." },
			{ t: "h", level: 3, text: "Problems are seen first" },
			req(
				"5.8-R2",
				"meets",
				"A node with an error **MUST** be marked: its border in the theme's danger colour and a count of its errors on its corner.",
			),
			req(
				"5.8-R3",
				"meets",
				"The first problem's sentence **MUST** be written under the node, in a note, with how many more there are. A pin a problem names **MUST** be marked in the node.",
			),
			req(
				"5.8-R4",
				"meets",
				"Notes **MUST** be drawn above every node, comment and wire, selected or not, so nothing in the graph covers what is wrong with it. Only the panels around the canvas, its menus and the compile cover **MAY** cover one.",
			),
			req(
				"5.8-R5",
				"meets",
				"A note **MUST** be drawn in a layer of its own rather than inside its node: a node is drawn as a unit, so nothing inside one can rise above the node next to it.",
			),
			req(
				"5.8-R6",
				"meets",
				"Where two notes overlap, the one belonging to a selected node **SHOULD** be drawn on top.",
			),
			req(
				"5.8-R7",
				"meets",
				"A note **SHOULD NOT** take the pointer, so the node under it can still be grabbed.",
			),
			{ t: "h", level: 3, text: "Other states" },
			{
				t: "table",
				head: ["State", "Drawn as"],
				rows: [
					["Selected", "The border in the selection colour, with a ring of it outside."],
					["The anchor of a selection", "A heavier ring: the node the others line up on (§4.3)."],
					["Wire in flight", "Every pin it cannot land on fades; the ones it can are ringed."],
					[
						"A node a wire would grow",
						"Ringed in the success colour, when dropping the wire on it would add a pin.",
					],
					[
						"Pointed at, or selected",
						"Controls that change the node, such as adding a pin, appear (§4.5).",
					],
				],
			},
			{
				t: "note",
				kind: "info",
				label: "Open question",
				text:
					"What a problem note does zoomed far out, where its sentence " +
					"cannot be read: shrink to its count, or keep its size on screen. To be decided in " +
					"the editor before it is written here.",
			},
		],
	};
}
