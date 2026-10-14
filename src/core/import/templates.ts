/**
 * The library's nodes, read backwards: from a call in a file to the node that
 * writes it.
 *
 * A library node says what it compiles to as a template -- `print($in.value)`,
 * `task.wait($in.seconds)`, `math.floor($in.x)` -- so a call whose callee and
 * argument count fit a template is that node, with each argument on the pin
 * the template puts it in. Only the plain shapes are read: a dotted callee and
 * a list of pins, with variadic arguments after them (`$more`, `$args`).
 * Method templates (`$in.instance:Destroy()`) are left alone, because a method
 * of that name on a table that is not an Instance would become a node that
 * says it is one.
 *
 * A callee is matched only when the file has no local of that name: a script
 * that declares its own `print` calls that, not the global.
 */

import type { NodeDef, Target } from "../schema.js";

/** A template a call can be matched against. */
export interface CallTemplate {
	def: NodeDef;
	/** `statement` and `call` run in the flow; `expr` is a value. */
	kind: "statement" | "call" | "expr";
	/** The pins the fixed arguments go to, in order. */
	pins: string[];
	/** Whether any number of arguments may follow, on `a0`, `a1`, ... */
	variadic: boolean;
}

const CALL = /^([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*)\((.*)\)$/;
const PIN = /^\$in\.([A-Za-z_]\w*)$/;
const PIN_THEN_MORE = /^\$in\.([A-Za-z_]\w*)\$more$/;

/** The callee and argument pattern of a template, when it has the plain shape. */
function readTemplate(template: string): { callee: string; pins: string[]; variadic: boolean } | null {
	// The variadic markers carry a separator in brackets; read as one word
	// each, so the arguments split on their commas alone.
	const call = CALL.exec(template.trim().replaceAll("$more(, )", "$more").replaceAll("$args(, )", "$args"));
	if (!call) return null;
	const [, callee, inside] = call;
	if (inside.trim() === "") return { callee, pins: [], variadic: false };
	if (inside.trim() === "$args") return { callee, pins: [], variadic: true };
	const parts = inside.split(", ");
	const pins: string[] = [];
	let variadic = false;
	for (const [i, part] of parts.entries()) {
		const last = i === parts.length - 1;
		const plain = PIN.exec(part);
		if (plain) {
			pins.push(plain[1]);
			continue;
		}
		const more = last ? PIN_THEN_MORE.exec(part) : null;
		if (!more) return null;
		pins.push(more[1]);
		variadic = true;
	}
	return { callee, pins, variadic };
}

/** Every template the library offers, by callee. */
export function callTemplates(defs: readonly NodeDef[]): Map<string, CallTemplate[]> {
	const out = new Map<string, CallTemplate[]>();
	for (const def of defs) {
		const compiles = def.compilesTo as { kind?: string; template?: string } | undefined;
		const kind = compiles?.kind;
		if (!compiles?.template || (kind !== "statement" && kind !== "call" && kind !== "expr")) continue;
		const read = readTemplate(compiles.template);
		if (!read) continue;
		const list = out.get(read.callee) ?? [];
		list.push({ def, kind, pins: read.pins, variadic: read.variadic });
		out.set(read.callee, list);
	}
	return out;
}

/**
 * The template a call with `args` arguments matches, among those of `kinds`,
 * for a graph that runs on `target`. A statement is preferred to a call, as a
 * call made for its effect reads as the statement it is.
 */
export function matchCall(
	templates: Map<string, CallTemplate[]>,
	callee: string,
	args: number,
	kinds: readonly CallTemplate["kind"][],
	target: Target,
): CallTemplate | undefined {
	const fits = (templates.get(callee) ?? []).filter(
		(t) =>
			kinds.includes(t.kind) &&
			(!t.def.targets || t.def.targets.includes(target)) &&
			(t.variadic ? args >= t.pins.length : args === t.pins.length),
	);
	return fits.sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind))[0];
}
