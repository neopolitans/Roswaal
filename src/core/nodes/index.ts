/** Node registry: built-ins plus any custom packs loaded from disk. */

import type { Literal, NodeConfig, NodeDef, PinDef } from "../schema.js";
import {
	modeOf, partPinId, splitKey, splitsOf, STRUCTS,
	type SplitMap, type StructRegistry,
} from "../structs.js";
import { FLOW_NODES } from "./flow.js";
import { LIBRARY_NODES } from "./library.js";
import { VARIABLE_NODES } from "./variables.js";

export { FLOW_NODES, continuesEnclosingBlock, signatureText } from "./flow.js";
export { LIBRARY_NODES } from "./library.js";
export { VARIABLE_NODES } from "./variables.js";
export type { Signature } from "./flow.js";
export type { FunctionRef, VariableRef } from "./variables.js";

export const BUILTIN_NODES: NodeDef[] = [...FLOW_NODES, ...VARIABLE_NODES, ...LIBRARY_NODES];

/**
 * Node ids that have been renamed. Applied when a graph is read, so a file
 * written by an earlier build still opens instead of showing a wall of
 * "unknown node type".
 */
export const RENAMED_NODES: Record<string, string> = {
	"var.declare": "local.declare",
	"var.set": "local.set",
};

export type Registry = Map<string, NodeDef>;

export function createRegistry(extra: NodeDef[] = []): Registry {
	const map: Registry = new Map();
	for (const def of BUILTIN_NODES) map.set(def.id, def);
	// Packs load last so a project can shadow a built-in deliberately.
	for (const def of extra) map.set(def.id, def);
	return map;
}

/**
 * The pins a node actually shows, for one node instance.
 *
 * Two passes, in this order:
 *
 * 1. `derivePins`, for builtins whose shape follows their config — a function's
 *    signature, a Sequence's arity.
 * 2. **splitting**, which replaces a struct pin with one pin per component.
 *
 * Splitting has to be the second pass and it has to live *here* rather than on
 * `NodeDef`. `derivePins` is documented as builtin-only, and deliberately so:
 * it is a function, and a node pack is data that never executes. But a pack's
 * node has a `Vector3` input like anything else and must be splittable too. So
 * splitting is applied by the registry to every node, after whatever the def
 * itself had to say.
 *
 * This is the one place pins are resolved. Every caller — the canvas, the wire
 * validator, the compiler's index, completions — goes through it, because six
 * copies of `def.derivePins?.() ?? def.inputs` is six places to forget.
 */
export function resolveNodePins(
	def: NodeDef,
	config: NodeConfig | undefined,
	structs: StructRegistry = STRUCTS,
): { inputs: PinDef[]; outputs: PinDef[]; baseInputs: PinDef[]; baseOutputs: PinDef[] } {
	const derived = def.derivePins?.(config ?? {});
	const baseInputs = derived?.inputs ?? def.inputs;
	const baseOutputs = derived?.outputs ?? def.outputs;

	const splits = splitsOf(config);
	if (Object.keys(splits).length === 0) {
		return { inputs: baseInputs, outputs: baseOutputs, baseInputs, baseOutputs };
	}

	return {
		inputs: applySplits(baseInputs, "in", splits, structs),
		outputs: applySplits(baseOutputs, "out", splits, structs),
		baseInputs,
		baseOutputs,
	};
}

function applySplits(
	pins: PinDef[], side: "in" | "out", splits: SplitMap, structs: StructRegistry,
): PinDef[] {
	const out: PinDef[] = [];
	for (const pin of pins) {
		const mode = splits[splitKey(side, pin.id)];
		const struct = mode === undefined ? undefined : modeOf(structs, pin.type, mode);
		if (!struct) {
			out.push(pin);
			continue;
		}
		for (const part of struct.parts) {
			out.push({
				id: partPinId(pin.id, part.id),
				// Prefixed with the parent, the way Unreal names a split struct
				// pin's children. Look At takes two Vector3s; without this the
				// node reads "X Y Z X Y Z" and you have to count rows to find out
				// which three are the target. An unnamed parent — a pure node's
				// lone `result` — adds nothing, so it is left off.
				name: pin.name ? `${pin.name} ${part.name}` : part.name,
				kind: "data",
				type: part.type,
				// An input part keeps an editable literal; an output part has no
				// value of its own to type in.
				default: side === "in" ? part.default : undefined,
				description: `${pin.name || pin.id} · ${part.name}`,
				part: { parent: pin.id, mode, id: part.id },
			});
		}
	}
	return out;
}

/**
 * Input pins whose value is baked into the generated source rather than read at
 * runtime — the `!ident` and `!raw` template modifiers.
 *
 * A pin like this cannot be wired. There is no expression to substitute, only
 * text to paste, and `emit.ts` reports one that has been wired as an error.
 * Anything that offers to connect a pin — a wire drag, the pin menu — should
 * ask here first, so the offer is never made rather than made and then
 * rejected at compile time.
 */
export function literalOnlyPins(def: NodeDef): Set<string> {
	const spec = def.compilesTo;
	const templates =
		spec.kind === "expr"
			? Object.values(spec.outputs)
			: spec.kind === "call" || spec.kind === "statement"
				? [spec.template]
				: [];

	const out = new Set<string>();
	for (const template of templates) {
		for (const match of template.matchAll(/\$in\.([A-Za-z_][A-Za-z0-9_]*)!(?:ident|raw)/g)) {
			out.add(match[1]);
		}
	}
	return out;
}

/** Every distinct category present in a registry, in display order. */
export function categories(registry: Registry): string[] {
	const order = ["Flow", "Events", "Variables", "Values", "Math", "Vectors", "CFrames", "Logic", "Strings", "Tables", "Roblox", "Instances", "Players", "Networking", "Modules", "Time", "Debug"];
	const seen = new Set<string>();
	for (const def of registry.values()) seen.add(def.category);
	const known = order.filter((c) => seen.has(c));
	const rest = [...seen].filter((c) => !order.includes(c)).sort();
	return [...known, ...rest];
}

// ---------------------------------------------------------------------------
// Custom node packs
// ---------------------------------------------------------------------------

export interface PackParseResult {
	defs: NodeDef[];
	errors: string[];
}

/**
 * Parses a `.nodedef.json` pack.
 *
 * Packs are data only. `builtin` compile specs are rejected outright, so
 * loading a third-party pack can never execute third-party code or open a
 * block the emitter did not intend to open.
 */
export function parseNodePack(source: unknown, origin: string): PackParseResult {
	const errors: string[] = [];
	const defs: NodeDef[] = [];

	const raw = source as { nodes?: unknown };
	const list = Array.isArray(source) ? source : Array.isArray(raw?.nodes) ? raw.nodes : null;
	if (!list) {
		return { defs, errors: [`${origin}: expected an array of nodes, or an object with a "nodes" array.`] };
	}

	list.forEach((entry, i) => {
		const where = `${origin}[${i}]`;
		const n = entry as Partial<NodeDef>;
		if (typeof n.id !== "string" || n.id === "") {
			errors.push(`${where}: missing "id".`);
			return;
		}
		if (typeof n.title !== "string" || n.title === "") {
			errors.push(`${where} (${n.id}): missing "title".`);
			return;
		}
		const spec = n.compilesTo as NodeDef["compilesTo"] | undefined;
		if (!spec || typeof spec !== "object") {
			errors.push(`${where} (${n.id}): missing "compilesTo".`);
			return;
		}
		if (spec.kind === "builtin") {
			errors.push(`${where} (${n.id}): "builtin" is reserved for Roswaal's own flow nodes.`);
			return;
		}
		if (spec.kind !== "expr" && spec.kind !== "call" && spec.kind !== "statement") {
			errors.push(`${where} (${n.id}): unknown compilesTo.kind "${(spec as { kind: string }).kind}".`);
			return;
		}
		const inputs = normalisePins(n.inputs, where, n.id, errors);
		const outputs = normalisePins(n.outputs, where, n.id, errors);

		const isPure = spec.kind === "expr";
		if (isPure && [...inputs, ...outputs].some((p) => p.kind === "exec")) {
			errors.push(`${where} (${n.id}): an "expr" node is pure and cannot have exec pins.`);
			return;
		}
		if (spec.kind === "call" && !outputs.some((p) => p.id === spec.result)) {
			errors.push(`${where} (${n.id}): compilesTo.result "${spec.result}" is not an output pin.`);
			return;
		}
		if (spec.kind === "expr") {
			for (const pinId of Object.keys(spec.outputs ?? {})) {
				if (!outputs.some((p) => p.id === pinId)) {
					errors.push(`${where} (${n.id}): compilesTo.outputs has no matching pin "${pinId}".`);
				}
			}
		}

		defs.push({
			id: n.id,
			title: n.title,
			category: typeof n.category === "string" && n.category ? n.category : "Custom",
			summary: typeof n.summary === "string" ? n.summary : undefined,
			role: n.role === "flow" ? "flow" : "normal",
			pure: isPure,
			latent: n.latent === true,
			targets: Array.isArray(n.targets) ? n.targets : undefined,
			inputs,
			outputs,
			compilesTo: spec,
		});
	});

	return { defs, errors };
}

/**
 * Accepts a pin default written the short way.
 *
 *     "default": 5          instead of   { "t": "number", "v": 5 }
 *     "default": "Part"     instead of   { "t": "string", "v": "Part" }
 *
 * The tagged form stays available and is the only way to write a `raw`
 * default, which is emitted verbatim rather than quoted. Everything else is a
 * value, and making a pack author spell out its type was ceremony.
 */
function coerceLiteral(value: unknown): Literal | undefined {
	if (value === undefined) return undefined;
	if (value === null) return { t: "nil" };
	if (typeof value === "number") return { t: "number", v: value };
	if (typeof value === "string") return { t: "string", v: value };
	if (typeof value === "boolean") return { t: "boolean", v: value };

	const tagged = value as Partial<Literal>;
	if (typeof tagged.t === "string") return value as Literal;
	return undefined;
}

function normalisePins(
	value: unknown, where: string, nodeId: string, errors: string[],
): PinDef[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		errors.push(`${where} (${nodeId}): pins must be an array.`);
		return [];
	}
	const out: PinDef[] = [];
	const seen = new Set<string>();
	for (const item of value) {
		const p = item as Partial<PinDef>;
		if (typeof p.id !== "string" || p.id === "") {
			errors.push(`${where} (${nodeId}): a pin is missing "id".`);
			continue;
		}
		if (seen.has(p.id)) {
			errors.push(`${where} (${nodeId}): duplicate pin id "${p.id}".`);
			continue;
		}
		seen.add(p.id);
		const kind = p.kind === "exec" ? "exec" : "data";
		out.push({
			id: p.id,
			// Exec pins read better unlabelled; a data pin falls back to its id.
			name: typeof p.name === "string" ? p.name : kind === "exec" ? "" : p.id,
			kind,
			type: typeof p.type === "string" ? p.type : "any",
			default: coerceLiteral(p.default),
			required: p.required === true,
			description: typeof p.description === "string" ? p.description : undefined,
		});
	}
	return out;
}
