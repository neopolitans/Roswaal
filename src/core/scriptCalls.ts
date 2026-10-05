/**
 * Calling a function the graph already knows: one this script declares, or one
 * a module it requires exports.
 *
 * Call Function and Call For Value take the function on a wire and know nothing
 * about it, so every argument is `Arg 1`, typed `any`, and the count is
 * whatever was last set. That is right for a function that arrives as a value —
 * a parameter, a table field, a callback — and wrong for `need`, whose
 * signature is in the same file: eleven calls to it read as eleven rows of
 * `Arg 1 / Arg 2 / Arg 3`, and nothing stops the count drifting from the
 * declaration.
 *
 * So these two nodes hold the function itself, the way Get Parameter holds a
 * parameter, and their pins are its signature: named, typed, and as many as
 * it has. The same pair the Service and Lune Function nodes are — a step for
 * a call that does something, a value for one that answers something — and
 * built from the same pieces in `callNodes.ts`.
 *
 * ## The signature is copied onto the node
 *
 * Pin derivation sees a node's config and never the rest of the graph, so the
 * signature has to be *on* the node. `syncScriptCalls` keeps that copy current
 * after every edit and again before compiling, the way `classReads.ts` keeps a
 * wired class current — one pass every edit goes through, rather than a list
 * of the edits that can change a signature, which would be wrong the first
 * time somebody added another.
 *
 * A module's function is copied the same way, from what the project reports
 * its modules export; see `syncModuleCalls`. Only this side can read the other
 * graph, so that copy is refreshed in the editor rather than by the compiler.
 *
 * ## Argument pins stay positional
 *
 * `a0`, `a1`, … as on every call node, so the emitter's argument rule applies
 * unchanged. When the signature changes underneath them the wires are moved
 * with their parameter — renamed, reordered or deleted — rather than left on a
 * position that now means a different parameter.
 */

import { argumentPin, execPin } from "./callNodes.js";
import { FUNCTION_NODES, type Signature, signatureOf, signatureText } from "./nodes/flow.js";
import { pinTypeOf } from "./nodes/variables.js";
import type { GraphNode, Link, Literal, NodeConfig, NodeScript, PinDef } from "./schema.js";
import { parseSplitKey, splitKey, splitPinId, splitsOf } from "./structs.js";

/** The node ids, named because the emitter, the menu and the sync test for them. */
export const SCRIPT_CALL = "function.call";
export const SCRIPT_VALUE = "function.callValue";

export const SCRIPT_CALLS: ReadonlySet<string> = new Set([SCRIPT_CALL, SCRIPT_VALUE]);

/** One parameter or return value, as a signature holds it. */
export interface NamedType {
	name: string;
	type?: string;
}

/** What a Script Function node holds. */
export interface ScriptCallRef {
	/** The Function or Declare Function it calls, by node id. */
	function?: string;
	/** Or the Require Module it calls through, by node id, for a module's function. */
	module?: string;
	/** What the module is required as, cached for the header: `Config`. */
	moduleName?: string;
	/** The function's name: `need`, or `read` in `Config.read`. */
	name?: string;
	params: NamedType[];
	returns: NamedType[];
}

function text(config: NodeConfig | undefined, key: string): string | undefined {
	const value = config?.[key];
	return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export function scriptCallOf(config: NodeConfig | undefined): ScriptCallRef {
	const sig = signatureOf(config);
	return {
		function: text(config, "function"),
		module: text(config, "module"),
		moduleName: text(config, "moduleName"),
		name: sig.name?.trim() || undefined,
		params: sig.params ?? [],
		returns: sig.returns ?? [],
	};
}

/** `need`, or `Config.read`: the call as it is written. */
export function scriptCallLabel(config: NodeConfig | undefined): string | undefined {
	const ref = scriptCallOf(config);
	if (!ref.name) return undefined;
	return ref.module ? `${ref.moduleName ?? "module"}.${ref.name}` : ref.name;
}

/** The signature under the header: `(parent: Instance, name: string) → Instance`. */
export function scriptCallSubtitle(config: NodeConfig | undefined): string | undefined {
	const ref = scriptCallOf(config);
	if (!ref.name) return undefined;
	return signatureText({ params: ref.params, returns: ref.returns });
}

/** A trailing `?` is a parameter that can be left off. */
const isOptional = (type: string | undefined): boolean => (type ?? "").trim().endsWith("?");

/** Whether `pinTypeOf` had to give something up, so the pin says what it takes. */
function lossy(type: string | undefined): boolean {
	const t = (type ?? "").trim();
	return t !== "" && t !== "any" && pinTypeOf(t) === "any";
}

/** The argument pins, in order. */
export function scriptArgumentPins(params: readonly NamedType[]): PinDef[] {
	return params.map((param, index) =>
		argumentPin({
			index,
			name: param.name || `arg${index + 1}`,
			type: pinTypeOf(param.type),
			optional: isOptional(param.type),
			description: lossy(param.type) ? `Takes \`${param.type}\`.` : undefined,
		}),
	);
}

/** The id of the pin a return value comes out of: `result`, then `r1`, `r2`. */
export function returnPinId(index: number): string {
	return index === 0 ? "result" : `r${index}`;
}

function returnPin(value: NamedType, index: number): PinDef {
	const pin: PinDef = {
		id: returnPinId(index),
		name: value.name || (index === 0 ? "Result" : `Value ${index + 1}`),
		kind: "data",
		type: pinTypeOf(value.type),
	};
	if (isOptional(value.type) && pin.type !== "any") pin.nilable = true;
	if (lossy(value.type)) pin.description = `Gives \`${value.type}\`.`;
	return pin;
}

/**
 * The pins of either node.
 *
 * The value node gives the first return value only, because it is one
 * expression and an expression is one value. The step binds them all.
 */
export function scriptCallPins(
	config: NodeConfig | undefined,
	pure: boolean,
): { inputs: PinDef[]; outputs: PinDef[] } {
	const ref = scriptCallOf(config);
	const args = scriptArgumentPins(ref.params);
	if (pure) {
		const first = ref.returns[0];
		return {
			inputs: args,
			// A value node with nothing to give back still offers a result,
			// so a node that is not pointed at anything yet can be read.
			outputs: [
				first ? returnPin(first, 0) : { id: "result", name: "", kind: "data", type: "any" },
			],
		};
	}
	return {
		inputs: [execPin("in"), ...args],
		outputs: [execPin("then"), ...ref.returns.map(returnPin)],
	};
}

/** The signature a call node copies from its declaration. */
export function callSignature(sig: Signature): Pick<ScriptCallRef, "name" | "params" | "returns"> {
	return {
		name: sig.name?.trim() || "function",
		params: (sig.params ?? []).map((p) => ({ name: p.name, ...(p.type ? { type: p.type } : {}) })),
		returns: (sig.returns ?? []).map((r) => ({
			name: r.name,
			...(r.type ? { type: r.type } : {}),
		})),
	};
}

/**
 * Where each old parameter went: its new index, or undefined when it is gone.
 *
 * The rule `syncParamRefs` uses, for the reason it gives. A signature edit is
 * only ever a before and an after, so a rename has to be told from a reorder
 * and a deletion by what became of the names:
 *
 * - still in the list somewhere: **moved**, follow it by name;
 * - gone, and its position holds a name the old list did not have: **renamed**;
 * - gone, and its position holds a name that already existed: **deleted**.
 */
export function paramMoves(
	before: readonly NamedType[],
	after: readonly NamedType[],
): (number | undefined)[] {
	const wasNamed = new Set(before.map((p) => p.name));
	return before.map((param, i) => {
		const at = after.findIndex((p) => p.name === param.name);
		if (at >= 0) return at;
		const now = after[i];
		if (now !== undefined && !wasNamed.has(now.name)) return i;
		return undefined;
	});
}

/** `a2` or `a2.x` with its argument moved, or null when it is not an argument. */
function movedPin(
	pinId: string,
	moves: readonly (number | undefined)[],
): string | null | undefined {
	const split = splitPinId(pinId);
	const base = split ? split.parent : pinId;
	const match = /^a(\d+)$/.exec(base);
	if (!match) return null;
	const to = moves[Number(match[1])];
	if (to === undefined) return undefined;
	const moved = `a${to}`;
	return split ? `${moved}.${split.part}` : moved;
}

/**
 * A call node moved onto a new signature: its config, and the wires, typed
 * values and splits on its argument pins carried to where their parameter is
 * now. Wires into a deleted parameter are dropped with it; left on, they would
 * land on whatever parameter is added at that position next.
 */
function moveArguments(
	node: GraphNode,
	links: Link[],
	moves: readonly (number | undefined)[],
	signature: Pick<ScriptCallRef, "name" | "params" | "returns">,
): { node: GraphNode; links: Link[] } {
	const identity = moves.every((to, i) => to === i);

	const config: NodeConfig = { ...node.config, ...signature };
	let literals = node.literals;
	if (!identity) {
		const splits = splitsOf(node.config);
		if (Object.keys(splits).length > 0) {
			const next: Record<string, string> = {};
			for (const [key, mode] of Object.entries(splits)) {
				const parsed = parseSplitKey(key);
				const moved = parsed?.side === "in" ? movedPin(parsed.pin, moves) : null;
				if (moved === undefined) continue;
				next[moved === null ? key : splitKey("in", moved)] = mode;
			}
			config.split = next;
		}
		if (literals) {
			const next: Record<string, Literal> = {};
			for (const [pin, value] of Object.entries(literals)) {
				const moved = movedPin(pin, moves);
				if (moved === undefined) continue;
				next[moved ?? pin] = value;
			}
			literals = next;
		}
		links = links.flatMap((link) => {
			if (link.to.node !== node.id) return [link];
			const moved = movedPin(link.to.pin, moves);
			if (moved === null) return [link];
			if (moved === undefined) return [];
			return [{ ...link, to: { ...link.to, pin: moved } }];
		});
	}
	return { node: { ...node, config, ...(literals ? { literals } : {}) }, links };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Brings every call node's copy of a signature up to date.
 *
 * `lookup` answers what a node's function is now, or undefined when it cannot
 * say — a function that has gone, a module the project has not reported —
 * and such a node is left as it was for `validate` to name.
 */
function syncCalls(
	script: NodeScript,
	lookup: (ref: ScriptCallRef) => Pick<ScriptCallRef, "name" | "params" | "returns"> | undefined,
): NodeScript {
	let links = script.links;
	let changed = false;
	const nodes = script.nodes.map((node) => {
		if (!SCRIPT_CALLS.has(node.def)) return node;
		const ref = scriptCallOf(node.config);
		const now = lookup(ref);
		if (!now) return node;
		const was = { name: ref.name ?? "function", params: ref.params, returns: ref.returns };
		if (same(was, now)) return node;
		changed = true;
		const moved = moveArguments(node, links, paramMoves(ref.params, now.params), now);
		links = moved.links;
		return moved.node;
	});
	return changed ? { ...script, nodes, links } : script;
}

/**
 * Every call to a function this script declares, brought up to date with it.
 *
 * Run after any edit and before compiling. Returns the script it was handed,
 * identical, when nothing needed doing — which is every edit that did not
 * touch a signature.
 */
export function syncScriptCalls(script: NodeScript): NodeScript {
	if (!script.nodes.some((n) => SCRIPT_CALLS.has(n.def))) return script;
	const declared = new Map(
		script.nodes.filter((n) => FUNCTION_NODES.has(n.def)).map((n) => [n.id, n] as const),
	);
	return syncCalls(script, (ref) => {
		if (ref.module || !ref.function) return undefined;
		const target = declared.get(ref.function);
		return target ? callSignature(signatureOf(target.config)) : undefined;
	});
}

/** A function a module exports, as the project reports it. */
export interface ExportedFunction {
	/** The module graph declaring it. */
	graph: string;
	name: string;
	params: NamedType[];
	returns: NamedType[];
}

/**
 * Every call to a required module's function, brought up to date with what the
 * project says the module exports now.
 *
 * `exportsOf` maps a Require Module node to that module's functions, or
 * undefined when the project cannot say which module it is.
 */
export function syncModuleCalls(
	script: NodeScript,
	exportsOf: (requireNode: string) => readonly ExportedFunction[] | undefined,
): NodeScript {
	if (!script.nodes.some((n) => SCRIPT_CALLS.has(n.def) && text(n.config, "module"))) return script;
	return syncCalls(script, (ref) => {
		if (!ref.module || !ref.name) return undefined;
		const fn = exportsOf(ref.module)?.find((f) => f.name === ref.name);
		return fn ? { name: fn.name, params: fn.params, returns: fn.returns } : undefined;
	});
}

/**
 * What a module returns: the functions declared onto its table, and the named
 * exports wired straight from a function.
 *
 * Read from the graph's own nodes, which is all the daemon has of another
 * module. Two shapes, because Module Exports has two:
 *
 * - **One unnamed value** returns that value — `return Rig` — so the module's
 *   functions are the ones a Declare Function puts **On Table** onto the same
 *   variable or local.
 * - **Named entries** build the table there — `return { read = read }` — so a
 *   function is an entry wired from a Get Function or a declaration's own
 *   Function output.
 *
 * Anything cleverer — a table assembled in a loop, a function stored with Set
 * Key — is not found, and a call to it is still made with Call Function.
 */
export function exportedFunctions(
	script: Pick<NodeScript, "nodes" | "links">,
	graph: string,
): ExportedFunction[] {
	const byId = new Map(script.nodes.map((n) => [n.id, n] as const));
	const into = (nodeId: string, pin: string) => {
		const seen = new Set<string>();
		let link = script.links.find((l) => l.to.node === nodeId && l.to.pin === pin);
		// Through reroute knots, which carry a value without being one.
		while (link) {
			const from = byId.get(link.from.node);
			if (!from || seen.has(from.id)) return undefined;
			seen.add(from.id);
			if (from.def !== "flow.reroute") return { node: from, pin: link.from.pin };
			const next = from.id;
			link = script.links.find((l) => l.to.node === next && l.to.pin === "in");
		}
		return undefined;
	};
	/** What a value reads, as something two nodes can be compared on. */
	const identity = (node: GraphNode, pin: string): string | undefined => {
		if (node.def === "variable.get") return `variable:${text(node.config, "variable") ?? ""}`;
		if (node.def === "local.get") return `local:${text(node.config, "local") ?? ""}`;
		if (node.def === "local.declare") return `local:${node.id}`;
		return `node:${node.id}/${pin}`;
	};
	const functionAt = (node: GraphNode): GraphNode | undefined => {
		if (FUNCTION_NODES.has(node.def)) return node;
		if (node.def !== "function.get") return undefined;
		const target = byId.get(text(node.config, "function") ?? "");
		return target && FUNCTION_NODES.has(target.def) ? target : undefined;
	};
	const entry = (name: string, fn: GraphNode): ExportedFunction => {
		const sig = callSignature(signatureOf(fn.config));
		return { graph, name, params: sig.params, returns: sig.returns };
	};

	const out: ExportedFunction[] = [];
	for (const exports of script.nodes.filter((n) => n.def === "module.exports")) {
		const list = Array.isArray(exports.config?.exports)
			? (exports.config.exports as { name?: string }[])
			: [{ name: "" }];
		const single = list.length === 1;
		list.forEach((item, i) => {
			const name = (item?.name ?? "").trim();
			const source = into(exports.id, `e${i}`);
			if (!source) return;
			// Named: the entry itself is the function.
			if (!single || (name !== "" && name !== "value")) {
				const fn = functionAt(source.node);
				if (fn && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) out.push(entry(name, fn));
				if (!single) return;
			}
			// One value returned whole: the functions declared onto it.
			const returned = identity(source.node, source.pin);
			for (const decl of script.nodes) {
				if (decl.def !== "function.declareHere") continue;
				const owner = into(decl.id, "owner");
				if (!owner || identity(owner.node, owner.pin) !== returned) continue;
				const fnName = signatureOf(decl.config).name?.trim();
				if (fnName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(fnName)) out.push(entry(fnName, decl));
			}
		});
	}
	const seen = new Set<string>();
	return out.filter((fn) => !seen.has(fn.name) && seen.add(fn.name));
}
