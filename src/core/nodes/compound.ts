/**
 * Compound assignment: a setter that writes `x += v` rather than `x = v`.
 *
 * Luau's `x += 1` is `x = x + 1` with `x` worked out once. That once matters
 * for `t[nextSlot()] += 1`, and the spelling matters to a graph imported from a
 * file, which should write back what the file said. So a setter carries the
 * operator in its config and writes it in place of `=`; its Value pin is then
 * what is added, subtracted or joined, and is labelled so.
 */

import type { NodeConfig, PinDef } from "../schema.js";

/** Luau's compound operators, as written. */
export const COMPOUND_OPS = ["+=", "-=", "*=", "/=", "//=", "%=", "^=", "..="] as const;
export type CompoundOp = (typeof COMPOUND_OPS)[number];

/** The setters that can assign with one: each writes `<target> = <value>`. */
export const COMPOUND_NODES: ReadonlySet<string> = new Set([
	"local.set",
	"variable.set",
	"roblox.setProperty",
	"table.setKey",
	"table.set",
]);

/** The operator a setter assigns with, or undefined for a plain `=`. */
export function compoundOf(defId: string, config: NodeConfig | undefined): CompoundOp | undefined {
	if (!COMPOUND_NODES.has(defId)) return undefined;
	const op = config?.op;
	return typeof op === "string" && (COMPOUND_OPS as readonly string[]).includes(op)
		? (op as CompoundOp)
		: undefined;
}

/** What each operator does to the target, for the Value pin's label. */
const VERB: Record<CompoundOp, string> = {
	"+=": "Add",
	"-=": "Subtract",
	"*=": "Multiply by",
	"/=": "Divide by",
	"//=": "Floor divide by",
	"%=": "Modulo",
	"^=": "Raise to",
	"..=": "Append",
};

/** A setter's pins with its Value labelled for what an operator does with it. */
export function compoundPins(
	defId: string,
	config: NodeConfig | undefined,
	inputs: PinDef[],
): PinDef[] {
	const op = compoundOf(defId, config);
	if (!op) return inputs;
	return inputs.map((pin) => (pin.id === "value" ? { ...pin, name: `${VERB[op]} (${op})` } : pin));
}

/** A setter's template with its `=` replaced by the operator. */
export function compoundTemplate(
	defId: string,
	config: NodeConfig | undefined,
	template: string,
): string {
	const op = compoundOf(defId, config);
	return op ? template.replace(" = $in.value", ` ${op} $in.value`) : template;
}
