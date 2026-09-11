/**
 * Node previews: a picture of a node, drawn from the same numbers the canvas
 * draws it from.
 *
 * A reference page can describe a node exactly and still leave you unsure you
 * are looking at the right one, because what you are actually holding in your
 * head is a shape — a colour, a count of rows, which side the pins are on. This
 * closes that gap: every node page opens with the node as it appears on the
 * canvas, so recognising it takes a glance rather than a careful read of a pin
 * table.
 *
 * ## Why it cannot drift
 *
 * The obvious way to write this is to draw something that looks about right,
 * and the obvious failure is that the canvas moves and the picture does not —
 * at which point the documentation is confidently showing a node that no longer
 * exists. So nothing here is a second opinion about geometry:
 *
 *  - the pin lists come from `resolveNodePins`, the function the editor calls;
 *  - the sizes come from `NODE` in `src/app/layers.ts`, passed in;
 *  - the colours come from `nodeColor` and `pinColor`, passed in;
 *  - and a test asserts the preview's width, height and row centres against
 *    `nodeBounds` and `pinPosition`, so a change to canvas layout that this
 *    file does not follow fails the build rather than the reader.
 *
 * Passed in rather than imported because `src/core` cannot import from
 * `src/app` — the same reason `html.ts` takes its highlighter as an option.
 *
 * ## What is deliberately not drawn
 *
 * The editor's affordances that come and go: the error badge, the selection
 * ring, the hover states. This is a picture of a node, not a picture of the
 * editor, and a reader hunting for a node they can see in their own graph is
 * not helped by chrome that only appears when they interact with it.
 *
 * The − and + on a node that takes a list *are* drawn, and so is the dashed
 * **default** on an optional input. The canvas shows both on every such node,
 * all the time, so they are part of what the node looks like.
 */

import type { GraphNode, Literal, NodeConfig, NodeDef, NodeScript, PinDef } from "../schema.js";
import { nodeTitle, resolveNodePins, type Registry } from "../nodes/index.js";
import {
	operatorEditorWidth, operatorFields, operatorLayout,
	type OperatorField, type OperatorLayout,
} from "../operatorLayout.js";

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

/**
 * How a pin's unwired value is shown in the row.
 *
 * `field` is a text or number box, `choice` the wider dropdown, `check` a
 * checkbox, and `constant` the plain right-aligned Luau a pin falls back to
 * when its type has no literal form — `Vector3.zero` and its like, which the
 * canvas shows and does not let you edit.
 *
 * `unset` is an optional pin nobody has set: the dashed **default**, meaning
 * the argument is not passed. `clearable` is a set optional pin, which carries
 * the × that unsets it.
 */
export type PreviewValue =
	| { shape: "field" | "choice" | "constant"; text: string; clearable?: boolean }
	| { shape: "check"; on: boolean; clearable?: boolean }
	| { shape: "unset" };

export interface PreviewPin {
	id: string;
	name: string;
	kind: "exec" | "data";
	type?: string;
	/**
	 * Something is connected to this pin.
	 *
	 * Only ever true in a graph preview: a node from the palette has nothing
	 * wired into it. It matters because filled-versus-hollow is the editor's
	 * whole grammar for connected — drawing every pin hollow in a picture of
	 * a *wired* graph would contradict the wires running into them.
	 */
	wired?: boolean;
	/** The inline editor this pin shows when nothing is wired into it. */
	value?: PreviewValue;
}

/**
 * Everything needed to draw one node, and nothing else.
 *
 * Serialisable on purpose: it travels inside a documentation block, which the
 * static site, the in-app panel and the search index all walk without any of
 * them holding a registry.
 */
export interface NodePreview {
	id: string;
	title: string;
	subtitle?: string;
	category: string;
	role?: string;
	display: "normal" | "compact" | "reroute" | "operator";
	/**
	 * What an operator pill shows in its middle, and what its rows carry.
	 *
	 * Field *kinds* rather than a width: a preview is built without geometry and
	 * measured with it, and the widths belong to whoever is drawing.
	 */
	operator?: { symbol: string; growable: boolean; fields: OperatorField[] };
	/** Drawn as the hourglass the canvas puts in the header. */
	latent: boolean;
	inputs: PreviewPin[];
	outputs: PreviewPin[];
	/**
	 * A placed node's own config, so the header buttons can say whether another
	 * pin would fit. Absent on a palette preview, which is at its minimum.
	 */
	config?: NodeConfig;
}

/**
 * Canvas geometry, structurally satisfied by `NODE` in `src/app/layers.ts`.
 *
 * Every field is one the canvas already had, which is the point: this interface
 * is a description of what the preview needs, not a place to invent numbers.
 */
export interface PreviewGeometry {
	width: number;
	headerHeight: number;
	headerHeightTall: number;
	rowHeight: number;
	compactHeight: number;
	compactMinWidth: number;
	compactCharWidth: number;
	compactPadding: number;
	rerouteSize: number;
	footer: number;
	pinSlot: number;
	rowPadding: number;
	radius: number;
	/** The operator pill's own numbers — see `operatorLayout`. */
	operatorPad: number;
	operatorCharWidth: number;
	operatorMinSymbol: number;
	fieldWidth: number;
	fieldWide: number;
	checkWidth: number;
	growButton: number;
}

export interface PreviewOptions {
	geometry: PreviewGeometry;
	/** Header colour. Takes the fields it reads, not a whole `NodeDef`. */
	nodeColor: (node: { id?: string; category: string; role?: string }) => string;
	pinColor: (type: string | undefined, kind: "exec" | "data") => string;
	/**
	 * The curve a wire takes between two points, for graph previews.
	 *
	 * Passed in for the reason everything else here is: it is the canvas's
	 * `wirePath`, and a second cubic written here would be a second opinion
	 * about the one shape a reader uses to recognise a graph. Absent, a graph
	 * preview draws its nodes and leaves the wires out rather than inventing
	 * them — a picture missing a line is honest, a wrong curve is not.
	 */
	wirePath?: (from: { x: number; y: number }, to: { x: number; y: number }) => string;
	/**
	 * Which of a node's header buttons are live, or null for a node that cannot
	 * grow. Passed in with the colours; the rule is `growthState`, shared with
	 * the editor. Absent, no buttons are drawn.
	 */
	growth?: (preview: NodePreview) => { canAdd: boolean; canRemove: boolean } | null;
	/**
	 * How large a single node picture is drawn, as a multiple of canvas size.
	 * Only the outer size changes; the drawing inside is the same numbers,
	 * stretched by its viewBox. A whole graph ignores this: its frame is sized by
	 * whoever shows it, and the pan-and-zoom viewer does the scaling.
	 */
	scale?: number;
}

// ---------------------------------------------------------------------------
// Building a preview from a definition
// ---------------------------------------------------------------------------

/**
 * A node as it is drawn when you drop it on the canvas.
 *
 * No configuration, which is what "as you find it in the palette" means: a
 * variadic is at its minimum arity, nothing is split, and no pin is wired. That
 * is also the state the node's compiled example on the same page documents, so
 * the picture and the code below it are the same node.
 */
export function previewOf(def: NodeDef): NodePreview {
	const { inputs, outputs } = resolveNodePins(def, undefined);
	return {
		id: def.id,
		// The same rule the canvas uses, though with no config there is never a
		// name to find: a preview shows what you get before you have configured
		// anything, which for a Function node is "Function".
		title: def.defaultLabel?.({}) || def.title,
		subtitle: def.subtitle?.({}),
		category: def.category,
		role: def.role,
		display: def.display ?? "normal",
		operator: operatorOf(def, inputs),
		latent: def.latent === true,
		inputs: inputs.map((p) => previewPin(p, "in")),
		outputs: outputs.map((p) => previewPin(p, "out")),
	};
}

/** What a pill needs to be drawn, or nothing for a node that is not one. */
function operatorOf(def: NodeDef, inputs: PinDef[]): NodePreview["operator"] {
	if (def.display !== "operator") return undefined;
	return {
		symbol: def.operator ?? def.title,
		growable: def.variadic !== undefined,
		fields: operatorFields(inputs),
	};
}

/** The pill's layout, from a preview and whoever is drawing it. */
function operatorLayoutOf(preview: NodePreview, g: PreviewGeometry): OperatorLayout {
	return operatorLayout(
		{
			symbol: preview.operator?.symbol ?? "",
			editor: operatorEditorWidth(preview.operator?.fields ?? [], g),
			rows: preview.inputs.filter((pin) => pin.kind === "data").length,
			growable: preview.operator?.growable === true,
		},
		g,
	);
}

function previewPin(pin: PinDef, side: "in" | "out"): PreviewPin {
	return {
		id: pin.id,
		name: pin.name,
		kind: pin.kind,
		type: pin.type,
		value: side === "in" ? valueOf(pin) : undefined,
	};
}

/**
 * Mirrors `renderLiteral` in `NodeView`: which editor a pin actually shows.
 *
 * `typed` is the node's own value for the pin, if it has one. It matters for an
 * optional pin, which reads **default** until something is typed into it.
 */
function valueOf(pin: PinDef, typed?: Literal): PreviewValue | undefined {
	if (pin.kind !== "data" || pin.required === true) return undefined;
	if (pin.optional === true && typed === undefined) return { shape: "unset" };
	const value = editorOf(pin, typed ?? pin.default);
	return value && pin.optional === true ? { ...value, clearable: true } : value;
}

function editorOf(
	pin: PinDef, literal: Literal | undefined,
): Exclude<PreviewValue, { shape: "unset" }> | undefined {
	if (!literal) return undefined;

	switch (literal.t) {
		case "boolean":
			return { shape: "check", on: literal.v };
		case "number":
			return { shape: "field", text: String(literal.v) };
		case "string":
			return {
				shape: pin.options && pin.options.length > 0 ? "choice" : "field",
				text: literal.v,
			};
		case "raw":
			// A raw default is a constant Roswaal wrote, shown and not editable —
			// unless the pin opted into being a code pin, which puts the first line
			// of the Luau in a button. Both read as text here.
			return { shape: "constant", text: literal.v.split(NEWLINE)[0].trim() || "(empty)" };
		case "nil":
			return undefined;
	}
}

/** Written as a code unit so no escape has to survive a build step. */
const NEWLINE = String.fromCharCode(10);

/** The name a capsule getter shows, which is also what sets its width. */
export function previewLabel(preview: NodePreview): string {
	return preview.subtitle || preview.title;
}

// ---------------------------------------------------------------------------
// Size
// ---------------------------------------------------------------------------

export interface PreviewSize {
	width: number;
	height: number;
}

/**
 * The node's size on the canvas.
 *
 * Deliberately the same arithmetic as `nodeBounds` and `nodeHeight`, and a test
 * holds the two together. Kept as its own function so the size is available
 * without producing markup — the layout tests read it, and so does a caller
 * that wants to reserve space.
 */
export function previewSize(preview: NodePreview, g: PreviewGeometry): PreviewSize {
	if (preview.display === "reroute") {
		return { width: g.rerouteSize, height: g.rerouteSize };
	}
	if (preview.display === "compact") {
		return { width: compactWidth(preview, g), height: g.compactHeight };
	}
	if (preview.display === "operator") {
		const layout = operatorLayoutOf(preview, g);
		return { width: layout.width, height: layout.height };
	}
	const rows = Math.max(preview.inputs.length, preview.outputs.length, 1);
	return {
		width: g.width,
		height: headHeight(preview, g) + rows * g.rowHeight + g.footer,
	};
}

function headHeight(preview: NodePreview, g: PreviewGeometry): number {
	return preview.subtitle ? g.headerHeightTall : g.headerHeight;
}

/**
 * The centre of the nth pin row, relative to the node's top-left.
 *
 * The one number the preview and the canvas must agree on: it is where a pin is
 * drawn here and where a wire attaches there. A test compares it against
 * `pinPosition` for every node in the library, and the drawing below calls it
 * rather than recomputing it — a contract checked against a copy of the code is
 * not checked at all.
 */
export function previewRowY(preview: NodePreview, g: PreviewGeometry, index: number): number {
	// A pill has no header, and its rows are centred in it rather than hung
	// below one. Its result is not on a row at all — see `placedPinAnchor`.
	if (preview.display === "operator") {
		return operatorLayoutOf(preview, g).rowsTop + index * g.rowHeight + g.rowHeight / 2;
	}
	return headHeight(preview, g) + index * g.rowHeight + g.rowHeight / 2;
}

function compactWidth(preview: NodePreview, g: PreviewGeometry): number {
	const label = previewLabel(preview);
	return Math.round(
		Math.max(g.compactMinWidth, label.length * g.compactCharWidth + g.compactPadding),
	);
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/**
 * Type sizes, matching `theme.css`. The character widths are estimates in the
 * same spirit as `compactWidth`'s: SVG has no `text-overflow`, so a label that
 * would be clipped has to be shortened before it is drawn, and being a pixel
 * out is better than measuring text in a renderer that may not have a DOM.
 */
const TYPE = {
	title: 12,
	subtitle: 10,
	label: 11,
	value: 11,
	constant: 10,
	unset: 10,
	/** Roughly the width of one character, as a fraction of the font size. */
	ratio: 0.55,
	/** Monospace is wider and more even. */
	monoRatio: 0.6,
} as const;

/** Field widths from `.node .literal`, which sizes them rather than the text. */
const FIELD = { width: 70, wide: 92, height: 17, check: 13, constantMax: 140 } as const;

function textWidth(text: string, size: number, mono = false): number {
	return text.length * size * (mono ? TYPE.monoRatio : TYPE.ratio);
}

/** Shortens to fit, the way `text-overflow: ellipsis` would on the canvas. */
function fit(text: string, max: number, size: number, mono = false): string {
	if (max <= 0) return "";
	const per = size * (mono ? TYPE.monoRatio : TYPE.ratio);
	const room = Math.floor(max / per);
	if (text.length <= room) return text;
	if (room <= 1) return "";
	return text.slice(0, room - 1) + "…";
}

export function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/** Rounds to a tenth of a pixel: enough precision, half the markup. */
function n(value: number): string {
	return String(Math.round(value * 10) / 10);
}

/**
 * One node, as an SVG fragment sized exactly to the node.
 *
 * The surface colours are CSS custom properties rather than literals —
 * `var(--node-body)`, `var(--border)` — so a preview follows the reader's
 * theme the way the canvas does. Only the header and pin colours are baked in,
 * because those are the palette's answer and the palette is not themed.
 *
 * The result is markup rather than a component so that all three renderers can
 * use it: the static site writes it into a file, the in-app panel injects it,
 * and neither can disagree with the other about what a node looks like.
 */
export function previewSvg(preview: NodePreview, options: PreviewOptions): string {
	const g = options.geometry;
	const { width, height } = previewSize(preview, g);
	const body = drawBody(preview, options);

	const scale = options.scale ?? 1;
	return (
		`<svg class="node-preview" width="${n(width * scale)}" height="${n(height * scale)}" ` +
		`viewBox="0 0 ${n(width)} ${n(height)}" ` +
		`xmlns="http://www.w3.org/2000/svg" role="img" ` +
		`aria-label="${escapeXml(describe(preview))}">${body}</svg>`
	);
}

/** Whichever shape this node is drawn as. */
function drawBody(preview: NodePreview, options: PreviewOptions): string {
	if (preview.display === "reroute") return drawReroute(preview, options);
	if (preview.display === "compact") return drawCapsule(preview, options);
	if (preview.display === "operator") return drawOperator(preview, options);
	return drawNode(preview, options);
}

/**
 * An operator pill: the inputs and their values down the left, the symbol in
 * the middle, the result on the right. The canvas's own layout, so the picture
 * and the node cannot be a few pixels apart.
 */
function drawOperator(preview: NodePreview, options: PreviewOptions): string {
	const g = options.geometry;
	const layout = operatorLayoutOf(preview, g);
	const parts: string[] = [
		`<rect x="0.5" y="0.5" width="${n(layout.width - 1)}" height="${n(layout.height - 1)}" ` +
		`rx="${n(layout.height / 2 - 0.5)}" fill="var(--node-body, #fbfbfd)" ` +
		`stroke="var(--node-border, #b3b9c4)"/>`,
	];

	preview.inputs.filter((pin) => pin.kind === "data").forEach((pin, i) => {
		const y = layout.rowsTop + i * g.rowHeight + g.rowHeight / 2;
		parts.push(pinAt(pin, g.rowPadding, y, g.pinSlot, options, "node"));
		if (pin.value) parts.push(drawValue(pin.value, layout.symbolLeft - 5, y).svg);
	});

	parts.push(
		text(layout.symbolLeft + layout.symbolWidth / 2, layout.height / 2, preview.operator?.symbol ?? "", {
			size: 13, weight: 700, fill: "var(--fg, #1c1f24)", anchor: "middle", mono: true,
		}),
	);

	const growth = options.growth?.(preview) ?? null;
	if (growth) {
		const x = layout.growLeft + 3;
		const size = g.growButton;
		const button = (y: number, glyph: string, live: boolean) =>
			`<g${live ? "" : ` opacity="0.3"`}>` +
			`<rect x="${n(x + 0.5)}" y="${n(y + 0.5)}" width="${size - 1}" height="${size - 1}" ` +
			`rx="3" fill="var(--bg-input, #fff)" stroke="var(--border, #c6cad2)"/>` +
			text(x + size / 2, y + size / 2, glyph, {
				size: 10, fill: "var(--fg-muted, #5c636e)", anchor: "middle",
			}) +
			`</g>`;
		const top = layout.height / 2 - size - 1;
		parts.push(button(top, "+", growth.canAdd) + button(top + size + 2, "−", growth.canRemove));
	}

	const output = preview.outputs.find((pin) => pin.kind === "data");
	if (output) {
		parts.push(
			pinAt(output, layout.width - g.rowPadding - g.pinSlot, layout.height / 2, g.pinSlot, options, "node"),
		);
	}
	return parts.join("");
}

/** The alt text. A screen reader gets the shape in words, not a blank box. */
export function describe(preview: NodePreview): string {
	const count = (pins: PreviewPin[], side: string) =>
		pins.length === 0 ? "" : `${pins.length} ${side}${pins.length === 1 ? "" : "s"}`;
	const parts = [count(preview.inputs, "input"), count(preview.outputs, "output")].filter(Boolean);
	const shape = parts.length > 0 ? ` with ${parts.join(" and ")}` : "";
	return `The ${preview.title} node${shape}.`;
}

function drawNode(preview: NodePreview, options: PreviewOptions): string {
	const g = options.geometry;
	const { width, height } = previewSize(preview, g);
	const head = headHeight(preview, g);
	const r = g.radius;
	const parts: string[] = [];

	// Body, then the header over its top corners, then the border over both —
	// the same stacking the DOM gets from a rounded parent clipping its child.
	parts.push(
		`<rect x="0" y="0" width="${n(width)}" height="${n(height)}" rx="${n(r)}" ` +
		`fill="var(--node-body, #fbfbfd)"/>`,
	);
	parts.push(
		`<path d="M0 ${n(r)}A${n(r)} ${n(r)} 0 0 1 ${n(r)} 0H${n(width - r)}` +
		`A${n(r)} ${n(r)} 0 0 1 ${n(width)} ${n(r)}V${n(head)}H0Z" ` +
		`fill="${escapeXml(options.nodeColor(preview))}"/>`,
	);

	// Header text. White with no shadow: the shadow on the canvas is there to
	// survive a header colour picked by a pack, and the palette's own are all
	// dark enough not to need it at this size.
	const growth = options.growth?.(preview) ?? null;
	const buttons = growth ? GROW.size * 2 + GROW.gap + 4 : 0;
	const titleRoom = width - 18 - (preview.latent ? 14 : 0) - buttons;
	if (preview.subtitle) {
		parts.push(
			text(9, 16.75, fit(preview.title, titleRoom, TYPE.title), {
				size: TYPE.title, weight: 600, fill: "#fff",
			}),
		);
		parts.push(
			text(9, 30.5, fit(preview.subtitle, titleRoom, TYPE.subtitle, true), {
				size: TYPE.subtitle, weight: 500, fill: "#fff", opacity: 0.78, mono: true,
			}),
		);
	} else {
		parts.push(
			text(9, head / 2, fit(preview.title, titleRoom, TYPE.title), {
				size: TYPE.title, weight: 600, fill: "#fff",
			}),
		);
	}
	if (preview.latent) {
		parts.push(
			text(width - 9 - buttons, head / 2, "⏳", {
				size: TYPE.subtitle, fill: "#fff", opacity: 0.85, anchor: "end",
			}),
		);
	}
	if (growth) parts.push(drawGrowth(width, head, growth));

	const rows = Math.max(preview.inputs.length, preview.outputs.length, 1);
	for (let i = 0; i < rows; i++) {
		const y = previewRowY(preview, g, i);
		const input = preview.inputs[i];
		const output = preview.outputs[i];

		// The right side reserves a pin's worth whether or not this row has an
		// output, which is what keeps the input values in one column down the
		// node rather than stepping around the output pin.
		let rightEdge = width - (g.rowPadding + g.pinSlot);
		if (output) {
			parts.push(drawPin(output, "out", y, options));
			if (output.name) {
				const room = width / 2;
				const label = fit(output.name, room, TYPE.label);
				parts.push(
					text(rightEdge - 5, y, label, { size: TYPE.label, fill: "var(--fg-muted, #5c636e)", anchor: "end" }),
				);
				rightEdge -= textWidth(label, TYPE.label) + 5;
			}
		}

		if (!input) continue;
		parts.push(drawPin(input, "in", y, options));

		let labelEnd = rightEdge;
		if (input.value) {
			const drawn = drawValue(input.value, rightEdge, y);
			parts.push(drawn.svg);
			labelEnd = drawn.left;
		}

		if (input.name) {
			const labelX = g.rowPadding + g.pinSlot + 5;
			const label = fit(input.name, labelEnd - labelX - 4, TYPE.label);
			if (label !== "") {
				parts.push(text(labelX, y, label, { size: TYPE.label, fill: "var(--fg-muted, #5c636e)" }));
			}
		}
	}

	parts.push(
		`<rect x="0.5" y="0.5" width="${n(width - 1)}" height="${n(height - 1)}" rx="${n(r - 0.5)}" ` +
		`fill="none" stroke="var(--node-border, #b3b9c4)"/>`,
	);
	return parts.join("");
}

/** `.node .head .grow button`: 16px squares, 2px apart, 8px in from the edge. */
const GROW = { size: 16, gap: 2, inset: 8 } as const;

/**
 * The − and + a node that takes a list carries in its header. A button that
 * would take the node past its limit fades to 0.3, which is how the canvas
 * shows it disabled.
 */
function drawGrowth(
	width: number, head: number, growth: { canAdd: boolean; canRemove: boolean },
): string {
	const y = (head - GROW.size) / 2;
	const button = (x: number, glyph: string, live: boolean) =>
		`<g${live ? "" : ` opacity="0.3"`}>` +
		`<rect x="${n(x + 0.5)}" y="${n(y + 0.5)}" width="${GROW.size - 1}" height="${GROW.size - 1}" ` +
		`rx="3" fill="rgba(0,0,0,0.2)" stroke="rgba(255,255,255,0.35)"/>` +
		text(x + GROW.size / 2, y + GROW.size / 2, glyph, { size: 12, fill: "#fff", anchor: "middle" }) +
		`</g>`;
	const plus = width - GROW.inset - GROW.size;
	return button(plus - GROW.gap - GROW.size, "−", growth.canRemove) + button(plus, "+", growth.canAdd);
}

/**
 * The capsule getter: a pill with its name and one output, which is how node
 * editors usually draw a variable getter, and why the shape alone says "value,
 * not a step".
 */
function drawCapsule(preview: NodePreview, options: PreviewOptions): string {
	const g = options.geometry;
	const { width, height } = previewSize(preview, g);
	const output = preview.outputs[0];
	const parts: string[] = [
		`<rect x="0.5" y="0.5" width="${n(width - 1)}" height="${n(height - 1)}" ` +
		`rx="${n(height / 2)}" fill="var(--capsule-bg, #e9ebf0)" ` +
		`stroke="var(--capsule-border, #b3b9c4)"/>`,
	];

	// Padding is `0 10px 0 12px`, and the label takes what the pin leaves.
	const room = width - 12 - 10 - g.pinSlot - 8;
	parts.push(
		text(12, height / 2, fit(previewLabel(preview), room, TYPE.title), {
			size: TYPE.title, weight: 500, fill: "var(--fg, #1c1f24)",
		}),
	);
	if (output) {
		parts.push(pinAt(output, width - 10 - g.pinSlot, height / 2, g.pinSlot, options, "capsule"));
	}
	return parts.join("");
}

/** A knot in a wire: a dot with both pins at its centre and no chrome at all. */
function drawReroute(preview: NodePreview, options: PreviewOptions): string {
	const g = options.geometry;
	const size = g.rerouteSize;
	const pin = preview.inputs[0] ?? preview.outputs[0];
	const parts = [
		`<circle cx="${n(size / 2)}" cy="${n(size / 2)}" r="${n(size / 2 - 0.5)}" ` +
		`fill="var(--capsule-bg, #e9ebf0)" stroke="var(--capsule-border, #b3b9c4)"/>`,
	];
	// A knot's slot shrinks to 12px so the rim stays grabbable; the preview
	// shrinks with it, or the dot would cover the ring that says it is a knot.
	if (pin) parts.push(pinAt(pin, size / 2 - 6, size / 2, 12, options, "capsule"));
	return parts.join("");
}

// ---------------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------------

function drawPin(
	pin: PreviewPin, side: "in" | "out", y: number, options: PreviewOptions,
): string {
	const g = options.geometry;
	const x = side === "in" ? g.rowPadding : g.width - g.rowPadding - g.pinSlot;
	return pinAt(pin, x, y, g.pinSlot, options, "node");
}

/**
 * One pin, drawn hollow.
 *
 * Nothing in a preview is wired, and hollow is how the canvas draws an
 * unconnected pin — an outlined circle for a value, an outlined arrow for
 * execution. The hollow takes the colour of whatever the pin is sitting on,
 * which is why the surface is a parameter: a knot's arrow cut out in the node
 * body colour would show a pale notch against the capsule it is actually on.
 */
function pinAt(
	pin: PreviewPin, x: number, y: number, slot: number,
	options: PreviewOptions, surface: "node" | "capsule",
): string {
	const colour = escapeXml(options.pinColor(pin.type, pin.kind));
	const hollow =
		surface === "node" ? "var(--node-body, #fbfbfd)" : "var(--capsule-bg, #e9ebf0)";

	if (pin.kind === "exec") {
		const top = y - slot / 2;
		const solid = `<path d="${arrow(x, top, slot, slot)}" fill="${colour}"/>`;
		// A wired arrow is solid all the way through; an unwired one keeps its
		// hollow. `inset: 2.5px 4px 2.5px 2.5px` — tighter on the right so the
		// wall stays even where the point narrows.
		return pin.wired
			? solid
			: solid +
				`<path d="${arrow(x + 2.5, top + 2.5, slot - 6.5, slot - 5)}" fill="${hollow}"/>`;
	}

	// A 10px circle centred in the slot: `inset: 3px` with a 2px border, so a
	// radius of 4 with the stroke centred on it spans 3 to 5. Filled when wired,
	// which is how the canvas says a value is arriving from somewhere.
	return (
		`<circle cx="${n(x + slot / 2)}" cy="${n(y)}" r="4" ` +
		`fill="${pin.wired ? colour : hollow}" stroke="${colour}" stroke-width="2"/>`
	);
}

/** `polygon(0 0, 58% 0, 100% 50%, 58% 100%, 0 100%)`, as a path. */
function arrow(x: number, y: number, w: number, h: number): string {
	const notch = x + w * 0.58;
	return (
		`M${n(x)} ${n(y)}H${n(notch)}L${n(x + w)} ${n(y + h / 2)}` +
		`L${n(notch)} ${n(y + h)}H${n(x)}Z`
	);
}

// ---------------------------------------------------------------------------
// Inline values
// ---------------------------------------------------------------------------

/**
 * The inline editor at the right of an input row, returning its left edge so
 * the pin's label knows how much room is left for it.
 */
function drawValue(value: PreviewValue, right: number, y: number): { svg: string; left: number } {
	// `.node .literal.unset`: a dashed box, the word in italics, nothing behind it.
	if (value.shape === "unset") {
		const label = "default";
		const w = Math.round(textWidth(label, TYPE.unset) + 12);
		const x = right - w;
		const box =
			`<rect x="${n(x + 0.5)}" y="${n(y - FIELD.height / 2 + 0.5)}" width="${n(w - 1)}" ` +
			`height="${n(FIELD.height - 1)}" rx="3" fill="none" ` +
			`stroke="var(--border-strong, #9aa2af)" stroke-dasharray="3 2"/>`;
		return {
			svg: box + text(x + 6, y, label, { size: TYPE.unset, fill: "var(--fg-faint, #8b93a0)", italic: true }),
			left: x,
		};
	}

	// A set optional pin: its editor, with the × that unsets it at the right.
	if (value.clearable) {
		const inner = drawValue({ ...value, clearable: false }, right - 12, y);
		return {
			svg: inner.svg + text(right - 5, y, "×", {
				size: 12, fill: "var(--fg-faint, #8b93a0)", anchor: "middle",
			}),
			left: inner.left,
		};
	}

	if (value.shape === "check") {
		const size = FIELD.check;
		const x = right - size;
		const box =
			`<rect x="${n(x + 0.5)}" y="${n(y - size / 2 + 0.5)}" width="${n(size - 1)}" ` +
			`height="${n(size - 1)}" rx="2.5" fill="var(--bg-input, #fff)" ` +
			`stroke="var(--border, #c6cad2)"/>`;
		const tick = value.on
			? `<path d="M${n(x + 3)} ${n(y)}L${n(x + 5.5)} ${n(y + 2.8)}L${n(x + 10)} ${n(y - 3.2)}" ` +
				`fill="none" stroke="var(--accent, #3b6ea5)" stroke-width="2" ` +
				`stroke-linecap="round" stroke-linejoin="round"/>`
			: "";
		return { svg: box + tick, left: x };
	}

	if (value.shape === "constant") {
		// No box: this is text rather than a field, right-aligned and faint,
		// because it is a value you read rather than one you can change here.
		const label = fit(value.text, FIELD.constantMax, TYPE.constant, true);
		return {
			svg: text(right, y, label, {
				size: TYPE.constant, fill: "var(--fg-faint, #8b93a0)", anchor: "end", mono: true,
			}),
			left: right - textWidth(label, TYPE.constant, true),
		};
	}

	const w = value.shape === "choice" ? FIELD.wide : FIELD.width;
	const x = right - w;
	const box =
		`<rect x="${n(x + 0.5)}" y="${n(y - FIELD.height / 2 + 0.5)}" width="${n(w - 1)}" ` +
		`height="${n(FIELD.height - 1)}" rx="3" fill="var(--bg-input, #fff)" ` +
		`stroke="var(--border, #c6cad2)"/>`;
	// A dropdown keeps room for its arrow, so its text stops short of one.
	const room = w - 10 - (value.shape === "choice" ? 10 : 0);
	const inner = text(x + 5, y, fit(value.text, room, TYPE.value), {
		size: TYPE.value, fill: "var(--fg, #1c1f24)",
	});
	const chevron =
		value.shape === "choice"
			? `<path d="M${n(right - 11)} ${n(y - 1.5)}L${n(right - 8)} ${n(y + 1.5)}` +
				`L${n(right - 5)} ${n(y - 1.5)}" fill="none" stroke="var(--fg-muted, #5c636e)" ` +
				`stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`
			: "";
	return { svg: box + inner + chevron, left: x };
}

// ---------------------------------------------------------------------------

interface TextOptions {
	size: number;
	fill: string;
	weight?: number;
	opacity?: number;
	anchor?: "start" | "middle" | "end";
	mono?: boolean;
	italic?: boolean;
}

/**
 * A run of text on its vertical centre.
 *
 * `dominant-baseline` is honoured unevenly once an SVG is printed or opened in
 * an older viewer, so the baseline is worked out here instead: a third of the
 * font size below the centre is close enough to a cap-height midpoint for text
 * this small, and it renders identically everywhere.
 */
function text(x: number, y: number, body: string, options: TextOptions): string {
	if (body === "") return "";
	const attrs = [
		`x="${n(x)}"`,
		`y="${n(y + options.size * 0.34)}"`,
		`font-size="${n(options.size)}"`,
		options.mono
			? `font-family="Cascadia Mono, Consolas, ui-monospace, monospace"`
			: `font-family="inherit"`,
		options.weight ? `font-weight="${options.weight}"` : "",
		options.anchor === "end" || options.anchor === "middle" ? `text-anchor="${options.anchor}"` : "",
		options.italic ? `font-style="italic"` : "",
		options.opacity !== undefined ? `opacity="${options.opacity}"` : "",
		`fill="${options.fill}"`,
	].filter(Boolean);
	return `<text ${attrs.join(" ")}>${escapeXml(body)}</text>`;
}

// ---------------------------------------------------------------------------
// A whole graph
// ---------------------------------------------------------------------------

/**
 * A node as it is drawn *where it was placed*, rather than as it comes out of
 * the palette.
 *
 * `previewOf` shows a definition: minimum arity, nothing split, nothing typed
 * into it. A guide showing a worked example needs the opposite — the node with
 * the config it was given, the values that were typed, and the label it ended
 * up with. The rules for all three are the editor's own: `resolveNodePins` for
 * the pins, `nodeTitle` for the name, and a literal from the node falling back
 * to the pin's default exactly as `NodeView` does.
 */
export function previewOfPlaced(
	node: GraphNode, def: NodeDef, wired?: ReadonlySet<string>,
): NodePreview {
	const config = node.config ?? {};
	const { inputs, outputs } = resolveNodePins(def, node.config);
	const isWired = (side: "in" | "out", pin: string) => wired?.has(`${side}:${node.id}:${pin}`) === true;

	return {
		id: def.id,
		title: nodeTitle(def, node),
		subtitle: def.subtitle?.(config),
		category: def.category,
		role: def.role,
		display: def.display ?? "normal",
		operator: operatorOf(def, inputs),
		latent: def.latent === true,
		inputs: inputs.map((pin) => ({
			id: pin.id,
			name: pin.name,
			kind: pin.kind,
			type: pin.type,
			wired: isWired("in", pin.id),
			// A wired input shows no value: the wire is the value, and drawing a
			// field behind a connected pin is the one thing the canvas never does.
			// Otherwise the graph's own literal wins over the pin's default —
			// a Print in a worked example should show the string it prints.
			value: isWired("in", pin.id) ? undefined : valueOf(pin, node.literals?.[pin.id]),
		})),
		outputs: outputs.map((pin) => ({ ...previewPin(pin, "out"), wired: isWired("out", pin.id) })),
		config: node.config,
	};
}

/** Where a node sits and how big it is, in the graph's own coordinates. */
export interface PlacedPreview {
	node: GraphNode;
	preview: NodePreview;
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * The graph, laid out from the nodes' own coordinates.
 *
 * Nothing is re-positioned. A graph in the documentation was authored on a
 * canvas and its `x`/`y` are what the author saw, so laying it out again here
 * would be this file having an opinion about composition that the author
 * already settled.
 */
export function placeGraph(
	script: NodeScript, registry: Registry, options: PreviewOptions,
): PlacedPreview[] {
	// One pass over the links, so every node can ask "is this pin connected"
	// without walking them again.
	const wired = new Set<string>();
	for (const link of script.links) {
		wired.add(`out:${link.from.node}:${link.from.pin}`);
		wired.add(`in:${link.to.node}:${link.to.pin}`);
	}

	const out: PlacedPreview[] = [];
	for (const node of script.nodes) {
		const def = registry.get(node.def);
		if (!def) continue;
		const preview = previewOfPlaced(node, def, wired);
		const { width, height } = previewSize(preview, options.geometry);
		out.push({ node, preview, x: node.x, y: node.y, width, height });
	}
	return out;
}

/**
 * Where a wire meets a node, in graph coordinates.
 *
 * The mirror of `pinPosition` in `src/app/geometry.ts`, and asserted equal to
 * it by `tests/preview.test.ts` — the same arrangement the node sizes already
 * have. Returns null for a pin the node does not have, which happens when a
 * link outlives the pin it was attached to.
 */
export function placedPinAnchor(
	placed: PlacedPreview, pinId: string, side: "in" | "out", g: PreviewGeometry,
): { x: number; y: number } | null {
	const pins = side === "in" ? placed.preview.inputs : placed.preview.outputs;
	const index = pins.findIndex((pin) => pin.id === pinId);
	if (index === -1) return null;

	// A knot's two pins both sit at its centre, so a wire passes straight
	// through rather than jogging around a box.
	if (placed.preview.display === "reroute") {
		return { x: placed.x + placed.width / 2, y: placed.y + placed.height / 2 };
	}

	// A capsule has one pin and it is on the right, whichever side asked. A
	// getter is a value: nothing wires *into* it.
	if (placed.preview.display === "compact") {
		return { x: placed.x + placed.width, y: placed.y + placed.height / 2 };
	}

	// A pill's inputs run down its left; its result sits level with the middle
	// of the pill rather than with a row.
	if (placed.preview.display === "operator") {
		const layout = operatorLayoutOf(placed.preview, g);
		return side === "in"
			? { x: placed.x, y: placed.y + layout.rowsTop + index * g.rowHeight + g.rowHeight / 2 }
			: { x: placed.x + layout.width, y: placed.y + layout.height / 2 };
	}

	return {
		x: side === "in" ? placed.x : placed.x + placed.width,
		y: placed.y + previewRowY(placed.preview, g, index),
	};
}

/**
 * A whole graph as one SVG, wires and all.
 *
 * The reason this exists rather than a row of separate node pictures: a guide
 * explaining Branch is explaining the *shape* — which pin the false arm leaves
 * from, where the wire goes. Two nodes side by side with no line between them
 * is a picture of two nodes, and the reader has to do the joining that the
 * picture was supposed to do for them.
 *
 * The viewBox is fitted to the drawn content with a small margin, so a graph
 * authored anywhere on an infinite canvas crops to itself.
 */
export function graphSvg(
	script: NodeScript, registry: Registry, options: PreviewOptions,
): string {
	const g = options.geometry;
	const placed = placeGraph(script, registry, options);
	if (placed.length === 0) return "";

	const byId = new Map(placed.map((entry) => [entry.node.id, entry]));
	const MARGIN = 12;

	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const entry of placed) {
		minX = Math.min(minX, entry.x);
		minY = Math.min(minY, entry.y);
		maxX = Math.max(maxX, entry.x + entry.width);
		maxY = Math.max(maxY, entry.y + entry.height);
	}

	// Wires first, so a curve passes behind the nodes it joins rather than over
	// their headers — the same order the canvas stacks them in.
	const wires: string[] = [];
	const key = graphKey(script);
	if (options.wirePath) {
		for (const link of script.links) {
			const from = byId.get(link.from.node);
			const to = byId.get(link.to.node);
			if (!from || !to) continue;
			const a = placedPinAnchor(from, link.from.pin, "out", g);
			const b = placedPinAnchor(to, link.to.pin, "in", g);
			if (!a || !b) continue;

			const pin = from.preview.outputs.find((p) => p.id === link.from.pin);
			const target = to.preview.inputs.find((p) => p.id === link.to.pin);
			const exec = pin?.kind === "exec";
			const fromColour = options.pinColor(pin?.type, "data");
			const toColour = options.pinColor(target?.type, "data");

			// A data wire whose ends are different colours fades from one to the
			// other, with the same stops the canvas uses — a wire that changes type
			// on the way is exactly what a picture of wiring has to show.
			let stroke = exec ? "var(--wire-exec, #d8dbe0)" : fromColour;
			let gradient = "";
			if (!exec && fromColour !== toColour) {
				const id = `wire-${key}-${link.id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
				gradient =
					`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
					`x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}">` +
					`<stop offset="0%" stop-color="${escapeXml(fromColour)}"/>` +
					`<stop offset="18%" stop-color="${escapeXml(fromColour)}"/>` +
					`<stop offset="82%" stop-color="${escapeXml(toColour)}"/>` +
					`<stop offset="100%" stop-color="${escapeXml(toColour)}"/>` +
					`</linearGradient>`;
				stroke = `url(#${id})`;
			}
			wires.push(
				gradient +
				`<path d="${escapeXml(options.wirePath(a, b))}" fill="none" ` +
				`stroke="${escapeXml(stroke)}" ` +
				`stroke-width="${exec ? 2.4 : 1.8}" opacity="${exec ? 0.95 : 0.85}"/>`,
			);
		}
	}

	const bodies = placed.map(
		(entry) => `<g transform="translate(${n(entry.x)} ${n(entry.y)})">${drawBody(entry.preview, options)}</g>`,
	);

	const width = maxX - minX + MARGIN * 2;
	const height = maxY - minY + MARGIN * 2;

	return (
		`<svg class="node-preview graph-preview" width="${n(width)}" height="${n(height)}" ` +
		`viewBox="${n(minX - MARGIN)} ${n(minY - MARGIN)} ${n(width)} ${n(height)}" ` +
		`xmlns="http://www.w3.org/2000/svg" role="img" ` +
		`aria-label="${escapeXml(describeGraph(script, placed))}">` +
		wires.join("") + bodies.join("") +
		`</svg>`
	);
}

/**
 * A short name for a graph, stable across builds, so the gradient ids of two
 * graphs on one page cannot collide. Taken from the graph's contents rather
 * than a counter, which would change with render order.
 */
function graphKey(script: NodeScript): string {
	const text =
		script.nodes.map((node) => `${node.id}:${node.def}`).join(",") + "|" +
		script.links.map((link) => link.id).join(",");
	let hash = 5381;
	for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
	return (hash >>> 0).toString(36);
}

/** The alt text: a screen reader gets the graph in words, not a blank box. */
export function describeGraph(script: NodeScript, placed: PlacedPreview[]): string {
	const names = placed.map((entry) => entry.preview.title);
	const wires = script.links.length;
	const joined =
		names.length === 1
			? names[0]
			: `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
	return (
		`A graph of ${names.length} node${names.length === 1 ? "" : "s"} — ${joined}` +
		`${wires > 0 ? `, joined by ${wires} wire${wires === 1 ? "" : "s"}` : ""}.`
	);
}
