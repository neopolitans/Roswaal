/**
 * What a Make Array holds, worked out from what goes into it.
 *
 * Its output is a table, and a table says nothing about what is in it: a
 * function returning `{ rig.model }` was annotated `{ [any]: any }` where the
 * same function written by hand says `{ Instance }`. So the values are looked
 * at -- each wire's source pin, each value typed in -- and when they agree the
 * list is `{ T }` of that type. Instances of different classes agree on the
 * class the rest derive from when one of them is it, and on `Instance` when
 * none is. Anything unknown, or values of different kinds, leave it
 * a plain table, which claims nothing.
 *
 * The answer is written into the node's config as `element`, as `reroutes.ts`
 * writes a knot's type and `classReads.ts` a wired class: pin derivation sees
 * a node's config and nothing else. Run after any edit and again before
 * compiling, so a file edited by hand cannot carry a stale answer into the
 * build. Returns the script unchanged and identical when there is nothing to do.
 */

import type { Registry } from "./nodes/index.js";
import { resolveNodePins } from "./nodes/index.js";
import { isInstanceClass, isSubclassOf } from "./roblox.js";
import type { Literal, NodeScript } from "./schema.js";

const ARRAY = "table.array";
const UNKNOWN = new Set(["any", "wildcard", "luau", "code", "table", "nil"]);

/** A typed-in value's type, when it has one a list can be made of. */
function literalType(literal: Literal | undefined): string | undefined {
	switch (literal?.t) {
		case "string":
			return "string";
		case "number":
			return "number";
		case "boolean":
			return "boolean";
		default:
			return undefined;
	}
}

/**
 * The one type a list of these is, or nothing. Instance classes meet at one of
 * themselves when the rest derive from it, and at `Instance` when none does.
 */
export function elementOf(types: readonly (string | undefined)[]): string | undefined {
	if (types.length === 0) return undefined;
	if (types.some((t) => t === undefined || UNKNOWN.has(t.trim()))) return undefined;
	const known = types as string[];
	if (known.every((t) => t === known[0])) return known[0];
	if (!known.every((t) => isInstanceClass(t))) return undefined;
	return (
		known.find((candidate) => known.every((t) => t === candidate || isSubclassOf(t, candidate))) ??
		"Instance"
	);
}

export function retypeArrays(script: NodeScript, registry: Registry): NodeScript {
	const def = registry.get(ARRAY);
	if (!def || !script.nodes.some((n) => n.def === ARRAY)) return script;

	let current = script;
	// A list of lists is typed from the inner one, so passes go on until no
	// answer changes: as many as there are lists, at most.
	const lists = script.nodes.filter((n) => n.def === ARRAY).length;
	for (let pass = 0; pass <= lists; pass++) {
		let changed = false;
		const nodes = current.nodes.map((node) => {
			if (node.def !== ARRAY) return node;
			const inputs = resolveNodePins(def, node.config, node.literals).inputs;
			const types = inputs.map((pin) => {
				const link = current.links.find((l) => l.to.node === node.id && l.to.pin === pin.id);
				if (!link) return literalType(node.literals?.[pin.id] ?? pin.default);
				const source = current.nodes.find((n) => n.id === link.from.node);
				const sourceDef = source && registry.get(source.def);
				return sourceDef
					? resolveNodePins(sourceDef, source.config, source.literals).outputs.find(
							(p) => p.id === link.from.pin,
						)?.type
					: undefined;
			});
			const element = elementOf(types);
			const config = node.config ?? {};
			if (config.element === element) return node;
			changed = true;
			if (element === undefined) {
				const { element: _, ...rest } = config;
				return { ...node, config: rest };
			}
			return { ...node, config: { ...config, element } };
		});
		if (!changed) return current;
		current = { ...current, nodes };
	}
	return current;
}
