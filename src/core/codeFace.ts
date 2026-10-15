/**
 * The code on a node that holds code: Code Block, Luau Expression and the two
 * Declare Types show their Luau on their face rather than one clipped line
 * behind a label (0.170.0).
 *
 * One place works out what the face says and how big it is, because three
 * things have to agree on it: the canvas that draws it, the wire router that
 * finds the pins beside it, and the documentation's drawings of it. A face is
 * up to `CODE_FACE.lines` lines of the code, then "+N lines"; the node widens
 * to the longest line it shows, up to `CODE_FACE.maxWidth`.
 *
 * Its pins sit level with its first line: a Code Block's Code on the left, a
 * Luau Expression's value on the right. A node with more than one body pin a
 * side is not given a face, so a pin never has nowhere to go.
 */

import { CODE_MARKS } from "./nodeGlyphs.js";
import { NODE } from "./nodeMetrics.js";
import { typeDeclarationOf } from "./nodes/flow.js";
import { onHeader } from "./pinLayout.js";
import { type GraphNode, type Literal, literalFits, type NodeDef, type PinDef } from "./schema.js";

/** The face's numbers, which `theme.css` repeats as `.code-face`. Change both. */
export const CODE_FACE = {
	/** Lines shown before "+N lines". */
	lines: 6,
	lineHeight: 16,
	/** 11px Cascadia Mono, a character. */
	charWidth: 6.7,
	/** The face's inner padding, across and down. */
	padX: 8,
	padY: 5,
	/** Between the face and the node's edges, and below the header. */
	inset: 10,
	insetTop: 8,
	/** The "+N lines" chip's own line. */
	moreHeight: 14,
	/** The face's border. */
	border: 1,
	maxWidth: 340,
} as const;

export interface CodeFace {
	/** The lines shown, tabs as two spaces. Empty when `empty` says what is missing. */
	lines: string[];
	/** How many more lines the code has than are shown. */
	more: number;
	/** What is missing, said in the face instead of code. */
	empty?: string;
	/** The pin whose literal is the code, when the code is a pin's. */
	pin?: string;
	/** What the code parses as, for colouring and for the Code panel. */
	kind: "block" | "expression" | "type";
	/** Whether a click opens the code: false when the Inspector edits it instead. */
	editable: boolean;
}

/** The text a code pin holds, typed in or its default. */
function codeText(pin: PinDef, literals: Record<string, Literal> | undefined): string {
	const literal = literals?.[pin.id] ?? pin.default;
	// What the compiler writes for a code pin, and nothing else, so the face
	// never shows a box empty while the file gets code.
	return literal && (literal.t === "raw" || literal.t === "string") && literalFits(literal)
		? literal.v
		: "";
}

/** Code as the face shows it: blank lines at either end dropped, tabs as two spaces. */
function faceLines(text: string): string[] {
	const lines = text.replace(/\r\n?/g, "\n").replace(/\t/g, "  ").split("\n");
	while (lines.length > 0 && lines[0].trim() === "") lines.shift();
	while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
	return lines;
}

/** A Declare Type's declaration, as the compiler writes it. */
function typeText(
	def: NodeDef,
	node: GraphNode,
): { text: string; empty?: string; editable: boolean } {
	const d = typeDeclarationOf(def.id, node.config);
	const prefix = d.exported ? "export type" : "type";
	if (d.shape === "typeof") {
		return d.name
			? { text: `${prefix} ${d.name} = typeof(…)`, editable: false }
			: { text: "", empty: "Name the type", editable: false };
	}
	const written = d.shape === "written" || d.fields.length === 0;
	const definition = written
		? d.definition
		: d.lines
			? `{\n${d.fields.map((f) => `\t${f.name}: ${f.type},`).join("\n")}\n}`
			: `{ ${d.fields.map((f) => `${f.name}: ${f.type}`).join(", ")} }`;
	const missing =
		!d.name && !definition
			? "Name it, and write the type"
			: !d.name
				? "Name the type"
				: !definition
					? written
						? "Write the type"
						: "Add a field"
					: undefined;
	if (missing) return { text: "", empty: missing, editable: written };
	return { text: `${prefix} ${d.name} = ${definition}`, editable: written };
}

/**
 * The face a node shows, or undefined for a node drawn with rows. `inputs` and
 * `outputs` are the node's resolved pins.
 */
export function codeFaceOf(
	def: NodeDef | undefined,
	node: Pick<GraphNode, "def" | "config" | "literals">,
	inputs: readonly PinDef[],
	outputs: readonly PinDef[],
): CodeFace | undefined {
	const mark = def ? CODE_MARKS[def.id] : undefined;
	if (!def || !mark) return undefined;
	const bodyIn = onHeader(inputs) ? inputs.slice(1) : inputs;
	const bodyOut = onHeader(outputs) ? outputs.slice(1) : outputs;
	if (bodyIn.length > 1 || bodyOut.length > 1) return undefined;

	if (mark.kind === "type") {
		const { text, empty, editable } = typeText(def, node as GraphNode);
		return shown(text, { kind: "type", editable, ...(empty ? { empty } : {}) });
	}
	const pin = bodyIn.find((p) => p.code);
	if (!pin) return undefined;
	const text = codeText(pin, node.literals);
	return shown(text, {
		kind: mark.kind,
		pin: pin.id,
		editable: true,
		...(text.trim() === "" ? { empty: "Write the Luau" } : {}),
	});
}

function shown(text: string, rest: Omit<CodeFace, "lines" | "more">): CodeFace {
	if (rest.empty) return { lines: [], more: 0, ...rest };
	const all = faceLines(text);
	const lines = all.slice(0, CODE_FACE.lines);
	return { lines, more: all.length - lines.length, ...rest };
}

/** The face's own height, border included. */
export function codeFaceBoxHeight(face: CodeFace): number {
	const lines = face.empty ? 1 : Math.max(1, face.lines.length);
	const lineHeight = face.empty ? 18 : CODE_FACE.lineHeight;
	return (
		CODE_FACE.border * 2 +
		CODE_FACE.padY * 2 +
		lines * lineHeight +
		(face.more > 0 ? CODE_FACE.moreHeight : 0)
	);
}

/** What the face adds below the header. */
export function codeFaceHeight(face: CodeFace): number {
	return CODE_FACE.insetTop + codeFaceBoxHeight(face) + CODE_FACE.inset;
}

/** The node's width for its face: wide enough for the longest line shown, within bounds. */
export function codeFaceWidth(face: CodeFace): number {
	const longest = Math.max(0, ...face.lines.map((l) => l.length));
	const wanted =
		longest * CODE_FACE.charWidth + (CODE_FACE.padX + CODE_FACE.border + CODE_FACE.inset) * 2;
	return Math.round(Math.min(CODE_FACE.maxWidth, Math.max(NODE.width, wanted)));
}

/** Where a face node's body pins sit, from the node's top: level with the first line. */
export function codeFacePinY(header: number, face: CodeFace): number {
	const lineHeight = face.empty ? 18 : CODE_FACE.lineHeight;
	return header + CODE_FACE.insetTop + CODE_FACE.border + CODE_FACE.padY + lineHeight / 2;
}
