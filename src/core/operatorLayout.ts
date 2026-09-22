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

import type { Literal, NodeConfig, NodeDef, PinDef } from "./schema.js";

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
 * Which editor each row shows, from the pins' defaults and the node's own
 * values.
 *
 * Deliberately not from what is *wired*: a node that changed width when a wire
 * arrived would move every pin below it, and the wire that had just been
 * connected with it. Kinds rather than pixels, because a preview is built
 * without geometry and measured with it.
 *
 * ## Why `literals` and not defaults alone
 *
 * A pill's width has to leave room for exactly the editors that get drawn, and
 * what gets drawn is the pin's default *or the value on this node*. For most
 * operators those agree — `math.add`'s pins default to `0`, so the column is
 * there whether or not anybody typed in it.
 *
 * `compare.eq` is the case where they do not. Its pins are `any` with no
 * default, because there is no sensible one to compare against, so this
 * returned nothing and the pill was built with no editor column at all. Type a
 * `0` into one and the field was drawn anyway, in a node with no room for it:
 * it hung off the left-hand side, overlapping the node beside it.
 *
 * Passing the node's literals keeps the width and the drawing answering the
 * same question. It stays stable under wiring, because a literal is not
 * removed when a wire lands on the pin — the field stops being drawn and the
 * column simply stays empty, which is the thing that must not move.
 */
export function operatorFields(
	inputs: PinDef[], literals?: Record<string, Literal | undefined>,
): OperatorField[] {
	const out: OperatorField[] = [];
	for (const pin of inputs) {
		if (pin.kind !== "data" || pin.required === true) continue;
		if (pin.optional === true) {
			out.push("field");
			continue;
		}
		// The default's editor as well as the value's: the column is the widest
		// the pin can show, so typing a value never narrows the pill. It did
		// on a pill of one row, such as Negate, where a `true` on a number pin
		// swapped the field for a narrower checkbox and nothing else held the
		// width.
		const kinds = [pin.default, literals?.[pin.id]]
			.map((literal) => fieldFor(pin, literal))
			.filter((kind): kind is OperatorField => kind !== undefined);
		if (kinds.length === 0) continue;
		out.push(kinds.reduce((a, b) => (FIELD_RANK[b] > FIELD_RANK[a] ? b : a)));
	}
	return out;
}

/** Narrowest first, for choosing the wider of two. */
const FIELD_RANK: Record<OperatorField, number> = { check: 0, field: 1, wide: 2 };

/** The editor one value would draw on this pin, if any. */
function fieldFor(pin: PinDef, literal: Literal | undefined): OperatorField | undefined {
	if (!literal || pin.hideEditor === true) return undefined;
	if (pin.wide === true) return "wide";
	if (literal.t === "boolean") return "check";
	if (literal.t === "number" || literal.t === "raw") return "field";
	if (literal.t === "string") return pin.options && pin.options.length > 0 ? "wide" : "field";
	return undefined;
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
	/**
	 * Get Member writes the access itself: `.throttle`, not "Object" and a
	 * field beside it. One line, one input, one output — the shape the same
	 * read has in Bolt and in Blueprints, and the reason the member is carried
	 * by the node rather than typed into a pin.
	 */
	if (def.id === "value.member") {
		const member = (config as { member?: unknown } | undefined)?.member;
		return `.${typeof member === "string" && member.trim() !== "" ? member.trim() : "…"}`;
	}
	return def.operator ?? def.title;
}
