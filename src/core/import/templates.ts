/**
 * The library's nodes, read backwards: from a call in a file to the node that
 * writes it.
 *
 * A library node says what it compiles to as a template -- `print($in.value)`,
 * `task.wait($in.seconds)`, `math.floor($in.x)` -- so a call whose callee and
 * argument count fit a template is that node, with each argument on the pin
 * the template puts it in. Only the plain shapes are read: a dotted callee and
 * a list of pins, with variadic arguments after them (`$more`, `$args`) or
 * the node's optional pins (`$opt`), which a call may leave off from the end.
 * Method templates (`$in.instance:Destroy()`) are keyed `:Destroy` and match
 * only an object whose type the importer knows and the receiver pin takes
 * (0.185.0): a method of that name on a table that is not an Instance would
 * otherwise become a node that says it is one.
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
	/** The optional pins that may follow the fixed ones, in order. */
	optional: string[];
	/** A method's: the pin the object it is called on goes to. */
	receiver?: string;
}

const CALL = /^([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*)\((.*)\)$/;
const METHOD = /^\$in\.([A-Za-z_]\w*):([A-Za-z_]\w*)\((.*)\)$/;
const PIN = /^\$in\.([A-Za-z_]\w*)$/;
const PIN_THEN_MORE = /^\$in\.([A-Za-z_]\w*)\$more$/;
const PIN_THEN_OPT = /^\$in\.([A-Za-z_]\w*)\$opt$/;

/** The callee and argument pattern of a template, when it has the plain shape. */
function readTemplate(
	template: string,
	def: NodeDef,
): {
	callee: string;
	pins: string[];
	variadic: boolean;
	optional: string[];
	receiver?: string;
} | null {
	// The variadic markers carry a separator in brackets; read as one word
	// each, so the arguments split on their commas alone.
	const text = template
		.trim()
		.replaceAll("$more(, )", "$more")
		.replaceAll("$args(, )", "$args")
		.replaceAll("$opt(, )", "$opt");
	const method = METHOD.exec(text);
	if (method) {
		const [, receiver, name, inside] = method;
		const args = readArgs(`:${name}`, inside, def);
		return args && { ...args, receiver };
	}
	const call = CALL.exec(text);
	if (!call) return null;
	return readArgs(call[1], call[2], def);
}

/** The pins a template's arguments go to. */
function readArgs(
	callee: string,
	inside: string,
	def: NodeDef,
): { callee: string; pins: string[]; variadic: boolean; optional: string[] } | null {
	if (inside.trim() === "") return { callee, pins: [], variadic: false, optional: [] };
	if (inside.trim() === "$args") return { callee, pins: [], variadic: true, optional: [] };
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
		const opt = last ? PIN_THEN_OPT.exec(part) : null;
		if (opt) {
			pins.push(opt[1]);
			const optional = def.inputs.filter((pin) => pin.optional === true).map((pin) => pin.id);
			return { callee, pins, variadic: false, optional };
		}
		const more = last ? PIN_THEN_MORE.exec(part) : null;
		if (!more) return null;
		pins.push(more[1]);
		variadic = true;
	}
	return { callee, pins, variadic, optional: [] };
}

/** Every template the library offers, by callee. */
export function callTemplates(defs: readonly NodeDef[]): Map<string, CallTemplate[]> {
	const out = new Map<string, CallTemplate[]>();
	for (const def of defs) {
		const compiles = def.compilesTo as
			| { kind?: string; template?: string; outputs?: Record<string, string> }
			| undefined;
		const kind = compiles?.kind;
		if (kind !== "statement" && kind !== "call" && kind !== "expr") continue;
		// A value node says what it writes per output; one with a single
		// output is a call like any other.
		const outputs = Object.values(compiles?.outputs ?? {});
		const template = compiles?.template ?? (outputs.length === 1 ? outputs[0] : undefined);
		if (!template) continue;
		const read = readTemplate(template, def);
		if (!read) continue;
		const list = out.get(read.callee) ?? [];
		list.push({
			def,
			kind,
			pins: read.pins,
			variadic: read.variadic,
			optional: read.optional,
			...(read.receiver ? { receiver: read.receiver } : {}),
		});
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
			(t.variadic
				? args >= t.pins.length
				: args >= t.pins.length && args <= t.pins.length + t.optional.length),
	);
	return fits.sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind))[0];
}

/**
 * The template a method call with `args` arguments matches, as `matchCall`,
 * among those whose receiver pin takes an object of the type `takes` is
 * asked about: the type the receiver pin is declared with.
 */
export function matchMethod(
	templates: Map<string, CallTemplate[]>,
	method: string,
	args: number,
	kinds: readonly CallTemplate["kind"][],
	target: Target,
	takes: (pinType: string) => boolean,
): CallTemplate | undefined {
	const typed = new Map([
		[
			`:${method}`,
			(templates.get(`:${method}`) ?? []).filter((t) => {
				const pin = t.def.inputs.find((p) => p.id === t.receiver);
				return pin?.type !== undefined && takes(pin.type);
			}),
		],
	]);
	return matchCall(typed, `:${method}`, args, kinds, target);
}
