/**
 * A cast on a call's result: `need(hullModel, "Hull", "BasePart") :: BasePart`.
 *
 * A Cast node after the call says the same thing, but it says it where the
 * value is read, so a named result was declared as the call's own type and cast
 * again at every reader. Held on the call, the claim is made once, where the
 * value comes from, which is where hand-written Luau makes it: the local is
 * declared with the cast type, and every reader sees that.
 *
 * Only a call's single result. `::` takes one value, so a call returning two
 * would be cut to its first by the cast; the Inspector does not offer it there.
 */

import type { NodeConfig, NodeDef, PinDef } from "../schema.js";
import { pinTypeOf } from "./variables.js";

/** The node config key holding the cast's type, as written. */
export const RESULT_CAST = "resultCast";

/** The type a call's result is cast to, or undefined when it is not. */
export function resultCastOf(config: NodeConfig | undefined): string | undefined {
	const value = config?.[RESULT_CAST];
	return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Builtins that call something and hand back what it returns. */
const CALL_HANDLERS: ReadonlySet<string> = new Set([
	"call.invoke",
	"function.call",
	"service.call",
	"lune.call",
	"lune.value",
]);

/**
 * Whether a node's `result` is what a function returned, so a cast on it is a
 * cast on a call.
 *
 * A template counts when its result is a call written last: `math.clamp(...)`,
 * `$in.parent:FindFirstChild(...)`. One that opens with a bracket is an
 * operator or a cast already, and is left alone.
 */
export function castsResult(def: NodeDef): boolean {
	const spec = def.compilesTo;
	if (spec.kind === "call") return spec.result === "result";
	if (spec.kind === "builtin") return CALL_HANDLERS.has(spec.handler);
	if (spec.kind === "expr") {
		const template = spec.outputs.result?.trim();
		return template !== undefined && endsInCall(template);
	}
	return false;
}

/**
 * Whether a template's last thing is a call: the bracket closing it opens on a
 * name, a field or another call, and not on a placeholder such as `$args(`.
 */
function endsInCall(template: string): boolean {
	if (!template.endsWith(")")) return false;
	let depth = 0;
	for (let i = template.length - 1; i >= 0; i--) {
		const ch = template[i];
		if (ch === ")") depth++;
		else if (ch === "(" && --depth === 0) {
			const callee = /([$\w.:\]]+)$/.exec(template.slice(0, i))?.[1];
			return callee !== undefined && !/\$\w+$/.test(callee);
		}
	}
	return false;
}

/** The outputs with a cast result typed as the cast says. */
export function retypedResult(outputs: PinDef[], config: NodeConfig | undefined): PinDef[] {
	const cast = resultCastOf(config);
	if (cast === undefined) return outputs;
	return outputs.map((pin) =>
		pin.id === "result" && pin.kind === "data" ? { ...pin, type: pinTypeOf(cast) } : pin,
	);
}

/** `rendered :: Type`, for a call whose result is cast. */
export function castCall(rendered: string, config: NodeConfig | undefined): string {
	const cast = resultCastOf(config);
	return cast === undefined ? rendered : `${rendered} :: ${cast}`;
}
