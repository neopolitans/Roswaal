/**
 * The fields a named type has, when they are fixed.
 *
 * **Get Field** reads any key off any value, which is what a table used as a
 * dictionary needs: the keys come and go while the program runs, and no list of
 * them could be right. **Get Member** is the other case — a value whose type
 * says what it holds, declared once and not changing — and this is what makes
 * that knowable: a name like `Input` resolved to `throttle: number`, `steer:
 * number`, `aim: Vector3`.
 *
 * Two sources, because a type is declared two ways. A **Table of Fields** keeps
 * its fields as rows, which need no parsing. **Custom Luau** keeps text, and the
 * text is Luau's own table syntax — so it is read here rather than left out,
 * since `{ throttle: number }` typed into the box is the same type as the same
 * thing entered as rows and should behave like it.
 *
 * What is **not** here: anything that is not a table of named fields. A union, a
 * function type, an index signature such as `{ [string]: number }` — those have
 * no fixed field list, so they give nothing and Get Member has nothing to offer.
 * That is the honest answer rather than a guess, and it is what sends somebody
 * back to Get Field, which is the node for exactly that value.
 */

import type { NodeScript } from "./schema.js";
import { typeShapeOf } from "./nodes/flow.js";

/** One named field of a table type. */
export interface TypeField {
	name: string;
	/** The Luau type as written: `number`, `Vector3`, `{ Player }`, `Model?`. */
	type: string;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Splits a table type's body at the separators that belong to it.
 *
 * Depth-counted rather than split on every comma, because a field's own type
 * can contain them: `{ hits: { [string]: number }, at: Vector3 }` is two fields
 * and five commas' worth of temptation. Luau takes `,` and `;` between fields
 * and allows a trailing one, which is what `filter` drops.
 */
function parts(body: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let start = 0;
	let quote: string | null = null;

	for (let i = 0; i < body.length; i++) {
		const c = body[i];
		if (quote) {
			if (c === "\\") i++;
			else if (c === quote) quote = null;
			continue;
		}
		if (c === '"' || c === "'") quote = c;
		else if (c === "{" || c === "(" || c === "[" || c === "<") depth++;
		else if (c === "}" || c === ")" || c === "]" || c === ">") depth--;
		else if ((c === "," || c === ";") && depth === 0) {
			out.push(body.slice(start, i));
			start = i + 1;
		}
	}
	out.push(body.slice(start));
	return out.map((part) => part.trim()).filter((part) => part !== "");
}

/** Whether the leading `{` is closed by the final `}` and nothing sooner. */
function closesAtEnd(text: string): boolean {
	let depth = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === "{") depth++;
		else if (c === "}") {
			depth--;
			if (depth === 0) return i === text.length - 1;
		}
	}
	return false;
}

/**
 * The named fields of a Luau table type written out, or nothing.
 *
 * Nothing rather than a partial list when any part of it is not a named field:
 * a type that is half understood would offer half its fields and hide the rest,
 * which is worse than offering none and saying the type is not one this knows.
 */
export function fieldsOfTableType(text: string): TypeField[] {
	const trimmed = text.trim();
	if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return [];
	// The opening brace must be the one the last brace closes. `{ a: number } &
	// { b: number }` starts and ends with braces and is two tables, not one, so
	// its fields are not a fixed list of this type's.
	if (!closesAtEnd(trimmed)) return [];
	const body = trimmed.slice(1, -1);
	if (parts(body).length === 0) return [];

	const fields: TypeField[] = [];
	for (const part of parts(body)) {
		const at = part.indexOf(":");
		if (at < 0) return [];
		const name = part.slice(0, at).trim();
		const type = part.slice(at + 1).trim();
		// `[string]: number` is an index signature: a table with any key of that
		// type, which is the dictionary case and has no field list at all.
		if (!NAME.test(name) || type === "") return [];
		fields.push({ name, type });
	}
	return fields;
}

/** The fields one Declare Type node gives, however its type is written. */
export function fieldsOfDeclaration(
	defId: string,
	config: { shape?: string; fields?: { name?: string; type?: string }[]; definition?: string },
): TypeField[] {
	if (typeShapeOf(defId, config) === "fields") {
		const rows = config.fields ?? [];
		const out: TypeField[] = [];
		for (const row of rows) {
			const name = (row.name ?? "").trim();
			const type = (row.type ?? "").trim();
			if (!NAME.test(name) || type === "") continue;
			out.push({ name, type });
		}
		return out;
	}
	return fieldsOfTableType(config.definition ?? "");
}

/**
 * Every type this script declares, by name, with the fields each one has.
 *
 * A type whose fields are not fixed is still listed, with none of them: the
 * name is declared, and "this type has no fields to offer" is a different
 * answer from "there is no such type" — one sends you to Get Field, the other
 * is a mistake in the graph.
 */
export function declaredTypeFields(
	script: Pick<NodeScript, "nodes">,
): Map<string, TypeField[]> {
	const out = new Map<string, TypeField[]>();
	for (const node of script.nodes) {
		if (node.def !== "type.declareTop" && node.def !== "type.declareHere") continue;
		const config = (node.config ?? {}) as {
			name?: string; shape?: string; definition?: string;
			fields?: { name?: string; type?: string }[];
		};
		const name = (config.name ?? "").trim();
		if (!NAME.test(name)) continue;
		out.set(name, fieldsOfDeclaration(node.def, config));
	}
	return out;
}
