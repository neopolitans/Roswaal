/**
 * The operator pill's layout.
 *
 * A comparison is `a == b` and a full node says it in three rows with a header
 * over them: a title that repeats what the symbol already says, and two pins
 * called A and B. The pill is the same node drawn as the expression — inputs
 * down the left, the Luau operator in the middle, the result on the right — and
 * it is the shape a graph full of conditions reads best in.
 *
 * In core, and taking its numbers as an argument, for the reason the previews
 * do: the canvas draws these and so does the documentation, and a second
 * opinion about the width would put the picture and the node a few pixels
 * apart with nothing to say which was right.
 */

import type { NodeConfig, NodeDef, PinDef } from "./schema.js";

/** Canvas geometry this needs, structurally satisfied by `NODE`. */
export interface OperatorGeometry {
	rowHeight: number;
	compactHeight: number;
	pinSlot: number;
	rowPadding: number;
	/** Space above and below the rows, which is what makes it a pill. */
	operatorPad: number;
	/** Roughly one bold monospace character of the symbol. */
	operatorCharWidth: number;
	/** The symbol column never narrows past this, so a `<` is not a sliver. */
	operatorMinSymbol: number;
	/** `.node .literal`'s widths, and a checkbox. */
	fieldWidth: number;
	fieldWide: number;
	checkWidth: number;
	/** One of the − / + buttons a variadic pill carries. */
	growButton: number;
}

export interface OperatorShape {
	symbol: string;
	/** Width of the widest inline editor on a row, or 0 when there are none. */
	editor: number;
	rows: number;
	growable: boolean;
}

export interface OperatorLayout {
	width: number;
	height: number;
	/** Top of the first pin row, relative to the node. */
	rowsTop: number;
	symbolLeft: number;
	symbolWidth: number;
	/** Left of the − / + column, meaningless when the node cannot grow. */
	growLeft: number;
}

/** The inline editor a row carries: a field, a wider dropdown, or a checkbox. */
export type OperatorField = "field" | "wide" | "check";

/**
 * Which editor each row shows, from the pins' own defaults.
 *
 * Deliberately not from what is wired: a node that changed width when a wire
 * arrived would move every pin below it, and the wire that had just been
 * connected with it. Kinds rather than pixels, because a preview is built
 * without geometry and measured with it.
 */
export function operatorFields(inputs: PinDef[]): OperatorField[] {
	const out: OperatorField[] = [];
	for (const pin of inputs) {
		if (pin.kind !== "data" || pin.required === true) continue;
		if (pin.optional === true) {
			out.push("field");
			continue;
		}
		const literal = pin.default;
		if (!literal) continue;
		if (literal.t === "boolean") out.push("check");
		else if (literal.t === "number" || literal.t === "raw") out.push("field");
		else if (literal.t === "string") out.push(pin.options && pin.options.length > 0 ? "wide" : "field");
	}
	return out;
}

/** The widest of those, which is the column every row's editor sits in. */
export function operatorEditorWidth(fields: OperatorField[], g: OperatorGeometry): number {
	let width = 0;
	for (const field of fields) {
		const size = field === "check" ? g.checkWidth : field === "wide" ? g.fieldWide : g.fieldWidth;
		width = Math.max(width, size);
	}
	return width;
}

export function operatorLayout(shape: OperatorShape, g: OperatorGeometry): OperatorLayout {
	const rows = Math.max(shape.rows, 1);
	// A one-row pill is a capsule's height, so a Nil sits level with a getter.
	const height = Math.max(g.compactHeight, rows * g.rowHeight + g.operatorPad * 2);
	const rowsTop = (height - rows * g.rowHeight) / 2;

	// Nil has no inputs and no column for them: just the padding before its word.
	const left =
		shape.rows === 0
			? g.rowPadding + 6
			: g.rowPadding + g.pinSlot + (shape.editor > 0 ? 5 + shape.editor : 0);

	const symbolWidth = Math.max(
		g.operatorMinSymbol,
		Math.round(shape.symbol.length * g.operatorCharWidth) + 12,
	);
	const growWidth = shape.growable ? g.growButton + 6 : 0;

	return {
		width: Math.round(left + symbolWidth + growWidth + g.pinSlot + g.rowPadding),
		height,
		rowsTop,
		symbolLeft: left,
		symbolWidth,
		growLeft: left + symbolWidth,
	};
}

/**
 * The nodes that can show their name instead of their symbol.
 *
 * The casts, and only them. `==` is `==` to anybody who has read a line of code
 * in any language; `::` is Luau's own and is the one symbol here that somebody
 * arriving from Blueprints has no reason to recognise — so a cast can say
 * "Cast" on its face instead, and go on being a pill.
 */
const NAMEABLE = new Set(["cast.as", "cast.array", "cast.any"]);

export const canShowName = (id: string): boolean => NAMEABLE.has(id);

/**
 * What a pill writes in its middle.
 *
 * Read from the node's **config**, not from a preference, for the reason the
 * brackets are: the symbol sets the pill's width, the width decides where the
 * result pin is and which comments hold the node — so a graph that looked
 * different on two machines would compile differently on two machines. A
 * setting decides what a *new* cast starts as; the node carries it after that.
 */
export function operatorSymbol(def: NodeDef, config?: NodeConfig): string {
	const named = (config as { castLabel?: unknown } | undefined)?.castLabel === "name";
	if (named && canShowName(def.id)) return def.title;
	return def.operator ?? def.title;
}
