/** Node registry: built-ins plus any custom packs loaded from disk. */

import type { NodeDef, PinDef } from "../schema.js";
import { FLOW_NODES } from "./flow.js";
import { LIBRARY_NODES } from "./library.js";

export { FLOW_NODES } from "./flow.js";
export { LIBRARY_NODES } from "./library.js";
export type { Signature } from "./flow.js";

export const BUILTIN_NODES: NodeDef[] = [...FLOW_NODES, ...LIBRARY_NODES];

export type Registry = Map<string, NodeDef>;

export function createRegistry(extra: NodeDef[] = []): Registry {
	const map: Registry = new Map();
	for (const def of BUILTIN_NODES) map.set(def.id, def);
	// Packs load last so a project can shadow a built-in deliberately.
	for (const def of extra) map.set(def.id, def);
	return map;
}

/** Every distinct category present in a registry, in display order. */
export function categories(registry: Registry): string[] {
	const order = ["Flow", "Events", "Variables", "Values", "Math", "Logic", "Strings", "Tables", "Roblox", "Modules", "Time", "Debug"];
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
		out.push({
			id: p.id,
			name: typeof p.name === "string" ? p.name : p.id,
			kind: p.kind === "exec" ? "exec" : "data",
			type: typeof p.type === "string" ? p.type : "any",
			default: p.default,
			required: p.required === true,
			description: typeof p.description === "string" ? p.description : undefined,
		});
	}
	return out;
}
