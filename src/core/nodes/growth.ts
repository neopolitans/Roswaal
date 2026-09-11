/**
 * How a node gains and loses pins -- the rule behind the − and + in its header.
 *
 * In core rather than beside the edits that apply it, because the documentation
 * draws those buttons too, and the static docs build cannot import the editor.
 */

import type { GraphNode, NodeDef } from "../schema.js";

/**
 * How a node gains and loses input pins.
 *
 * Three shapes end up in the same place — an operator's arity, a call's
 * argument count, and a signature's list of entries — so they share one
 * description rather than three special cases scattered through the UI.
 */
export interface GrowthRule {
	/** Config key holding the count, or the list. */
	field: string;
	kind: "count" | "list";
	min: number;
	max: number;
	/** Pin id prefix, used to find the newest pin after growing. */
	prefix: string;
	label: string;
}

export function growthRule(def: NodeDef | undefined): GrowthRule | null {
	if (!def) return null;
	if (def.variadic) {
		return {
			field: "args", kind: "count", prefix: "a", label: "operands",
			min: def.variadic.min, max: def.variadic.max,
		};
	}
	switch (def.id) {
		case "call.function":
		case "call.method":
			return { field: "args", kind: "count", min: 0, max: 8, prefix: "a", label: "arguments" };
		case "flow.sequence":
			return { field: "count", kind: "count", min: 2, max: 12, prefix: "s", label: "outputs" };
		case "function.return":
			return { field: "returns", kind: "list", min: 0, max: 8, prefix: "r", label: "returns" };
		case "module.exports":
			return { field: "exports", kind: "list", min: 1, max: 16, prefix: "e", label: "exports" };
		case "function.entry":
		case "function.declareHere":
			return { field: "params", kind: "list", min: 0, max: 8, prefix: "p", label: "parameters" };
		default:
			return null;
	}
}

export function currentArity(
	node: Pick<GraphNode, "config">, def: NodeDef | undefined, rule: GrowthRule,
): number {
	const config = (node.config ?? {}) as Record<string, unknown>;
	if (rule.kind === "list") return (config[rule.field] as unknown[] | undefined)?.length ?? 0;
	const fallback = def?.variadic?.min ?? rule.min;
	return Math.max(rule.min, Math.min(rule.max, Number(config[rule.field] ?? fallback)));
}

/** Which of a node's header buttons are live, or null for a node that cannot grow. */
export function growthState(
	def: NodeDef | undefined, config: GraphNode["config"],
): { canAdd: boolean; canRemove: boolean } | null {
	const rule = growthRule(def);
	if (!rule) return null;
	const arity = currentArity({ config }, def, rule);
	return { canAdd: arity < rule.max, canRemove: arity > rule.min };
}
