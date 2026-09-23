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
import { parseType } from "./luau/parser.js";

/** One named field of a table type. */
export interface TypeField {
	name: string;
	/** The Luau type as written: `number`, `Vector3`, `{ Player }`, `Model?`. */
	type: string;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The named fields of a Luau table type written out, or nothing.
 *
 * Nothing rather than a partial list when any part of it is not a named field:
 * a type that is half understood would offer half its fields and hide the rest,
 * which is worse than offering none and saying the type is not one this knows.
 *
 * Read with the parser. It was a bracket-counting splitter, which took the `>`
 * of a function type's `->` for a closing bracket: `{ onHit: (Part) -> (),
 * damage: number }` came out as one field whose type ran on into the next.
 * The parser also settles what the splitter had to guess: `{ a: number } &
 * { b: number }` is an intersection rather than one table, and
 * `{ [string]: number }` is a dictionary with no field list at all.
 */
export function fieldsOfTableType(text: string): TypeField[] {
	const { value: type, errors } = parseType(text);
	if (!type || errors.length > 0 || type.kind !== "tableType") return [];
	if (type.indexer || type.array || type.props.length === 0) return [];

	const fields: TypeField[] = [];
	for (const prop of type.props) {
		// A quoted name, `["two words"]: T`, is a field Get Member cannot write.
		if (!NAME.test(prop.name)) return [];
		fields.push({ name: prop.name, type: text.slice(prop.type.start, prop.type.end).trim() });
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
