/**
 * A custom node's logic, built from nodes, compiled to the node's template.
 *
 * ## Compiled when it is authored, never when it is loaded
 *
 * A pack stays data: loading one runs nothing. So the logic graph is compiled
 * here, in the designer, and the pack stores the graph *and* the template it
 * compiled to. The loader reads `compilesTo` exactly as it always has and never
 * looks at the graph; only the designer reads the graph back.
 *
 * A consequence worth knowing: a node built from another pack's node has that
 * node's template **inlined** into its own. The other pack is needed to edit and
 * recompile this node, not to use it.
 *
 * ## How it compiles
 *
 * With the emitter, not a second one. The graph becomes a script; Node Inputs'
 * pins are bound to placeholder identifiers the way a function binds its
 * parameters; the emitter walks from Node Inputs to Node Outputs; and the
 * placeholders are put back as `$in.pin` and `$out.pin`. Two emitter switches
 * make that fit a template rather than a file — services and requires written
 * inline, and a pure node's values never bound to a local. See `EmitOptions`.
 *
 * ## What it guards
 *
 * - **An input read more than once**, in a step's logic, is bound to a local
 *   once. A template expands `$in.pin` at every use, so otherwise a wired
 *   expression — a call, say — would run as many times as it is read. A pure
 *   node has nowhere to put the local, so there it is a warning.
 * - **Locals the logic declares** are wrapped in `do … end`, so they end with
 *   the node rather than shadowing a name in the script it is placed in.
 */

import { emitLogic, logicInputName, logicOutputName } from "./emit.js";
import { LOGIC_DENIED, LOGIC_INPUTS, LOGIC_OUTPUTS, shapeConfig, type LogicShape } from "../nodes/logic.js";
import { nodeTitle, resolveNodePins, type Registry } from "../nodes/index.js";
import { packTargets } from "../packs.js";
import {
	emptyScript,
	type Comment, type GraphNode, type Link, type NodeDef, type NodeScript, type Target,
} from "../schema.js";

/** A node's logic as a pack stores it. */
export interface LogicGraph {
	nodes: GraphNode[];
	links: Link[];
	comments?: Comment[];
}

export interface LogicCompile {
	/** What the node compiles to, or null while there are errors. */
	compilesTo: NodeDef["compilesTo"] | null;
	errors: string[];
	warnings: string[];
	/** True when anything in the logic yields, which makes the node latent. */
	latent: boolean;
	/** The targets every node in the logic runs on, or null for both. */
	targets: Target[] | null;
}

const INPUTS_ID = "logic-inputs";
const OUTPUTS_ID = "logic-outputs";

/** A new logic graph: its two ends, joined by the flow when the node is impure. */
export function defaultLogic(shape: LogicShape): LogicGraph {
	const config = shapeConfig(shape);
	return {
		nodes: [
			{ id: INPUTS_ID, def: LOGIC_INPUTS, x: 80, y: 120, config },
			{ id: OUTPUTS_ID, def: LOGIC_OUTPUTS, x: 640, y: 120, config },
		],
		links: shape.pure ? [] : [{ id: "logic-flow", from: { node: INPUTS_ID, pin: "then" }, to: { node: OUTPUTS_ID, pin: "in" } }],
		comments: [],
	};
}

/**
 * The logic graph as a script: its two ends carrying the node's pins as they
 * are now, and wires to pins that have since gone dropped.
 *
 * A wire on a node the registry does not know is kept — that node is reported
 * by `compileLogic`, and quietly losing its wires would make adding the missing
 * pack back not bring the graph back.
 */
export function logicScript(graph: LogicGraph, shape: LogicShape, registry: Registry): NodeScript {
	const config = shapeConfig(shape);
	const nodes = graph.nodes.map((node) =>
		node.def === LOGIC_INPUTS || node.def === LOGIC_OUTPUTS ? { ...node, config: { ...node.config, ...config } } : node,
	);
	const pins = new Map(
		nodes.map((node) => {
			const def = registry.get(node.def);
			return [node.id, def ? resolveNodePins(def, node.config) : null] as const;
		}),
	);
	const links = graph.links.filter((link) => {
		const from = pins.get(link.from.node);
		const to = pins.get(link.to.node);
		if (from === undefined || to === undefined) return false;
		return (from === null || from.outputs.some((p) => p.id === link.from.pin))
			&& (to === null || to.inputs.some((p) => p.id === link.to.pin));
	});
	return { ...emptyScript("logic", "logic"), nodes, links, comments: graph.comments ?? [] };
}

const IN_PLACEHOLDER = /\b__rsw_in_([A-Za-z_][A-Za-z0-9_]*)\b/g;
const OUT_PLACEHOLDER = /\b__rsw_out_([A-Za-z_][A-Za-z0-9_]*)\b/g;

/** Puts `$in.pin` and `$out.pin` back where the placeholders stood. */
function restore(text: string): string {
	return text
		.replace(IN_PLACEHOLDER, (_m, id: string) => `$in.${id}`)
		.replace(OUT_PLACEHOLDER, (_m, id: string) => `$out.${id}`);
}

/** How many times each input placeholder is read. */
function inputReads(text: string): Map<string, number> {
	const counts = new Map<string, number>();
	for (const match of text.matchAll(IN_PLACEHOLDER)) counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
	return counts;
}

export function compileLogic(graph: LogicGraph, shape: LogicShape, registry: Registry): LogicCompile {
	const script = logicScript(graph, shape, registry);
	const errors: string[] = [];
	const warnings: string[] = [];
	const titleOf = (node: GraphNode) => nodeTitle(registry.get(node.def), node);
	const nameOf = (list: LogicShape["inputs"], id: string) => list.find((p) => p.id === id)?.name || id;

	const starts = script.nodes.filter((n) => n.def === LOGIC_INPUTS);
	const ends = script.nodes.filter((n) => n.def === LOGIC_OUTPUTS);
	if (starts.length !== 1) errors.push(starts.length === 0 ? "The logic needs its Node Inputs back." : "The logic has more than one Node Inputs.");
	if (ends.length !== 1) errors.push(ends.length === 0 ? "The logic needs its Node Outputs back." : "The logic has more than one Node Outputs.");

	const used: NodeDef[] = [];
	for (const node of script.nodes) {
		if (node.def === LOGIC_INPUTS || node.def === LOGIC_OUTPUTS) continue;
		const def = registry.get(node.def);
		if (!def) {
			errors.push(`${node.def} is not a node this pack can use. Add the pack it comes from to the pack's requires.`);
			continue;
		}
		const denied = LOGIC_DENIED.get(def.id);
		if (denied) {
			errors.push(`${titleOf(node)} cannot be in a node's logic: ${denied}`);
			continue;
		}
		if (shape.pure && !def.pure && def.id !== "flow.reroute") {
			errors.push(`${titleOf(node)} is a step, and a pure node's logic has to be values.`);
			continue;
		}
		used.push(def);
	}
	const latent = used.some((def) => def.latent === true);
	const targets = packTargets(used);
	if (errors.length > 0) return { compilesTo: null, errors, warnings, latent, targets };

	const emitted = emitLogic(script, registry, {
		inputsId: starts[0].id,
		outputsId: ends[0].id,
		pure: shape.pure,
		inputs: shape.inputs.map((p) => p.id),
		outputs: shape.outputs.map((p) => p.id),
	});
	for (const d of emitted.diagnostics) {
		const where = d.node ? script.nodes.find((n) => n.id === d.node) : undefined;
		const message = where ? `${titleOf(where)}: ${d.message}` : d.message;
		const into = d.severity === "error" ? errors : warnings;
		if (!into.includes(message)) into.push(message);
	}

	const wired = (pinId: string) =>
		script.links.some((l) => l.to.node === ends[0].id && (l.to.pin === pinId || l.to.pin.startsWith(`${pinId}.`)));
	for (const out of shape.outputs) {
		if (!wired(out.id)) warnings.push(`${out.name || out.id} is never given a value, so it is nil.`);
	}

	if (shape.pure) {
		const outputs: Record<string, string> = {};
		for (const out of shape.outputs) {
			const text = emitted.expressions[out.id] ?? "nil";
			for (const [id, count] of inputReads(text)) {
				if (count > 1) {
					warnings.push(
						`${nameOf(shape.inputs, id)} is read ${count} times in ${out.name || out.id}, so a wired value ` +
						`is worked out ${count} times. A pure node has nowhere to keep it.`,
					);
				}
			}
			outputs[out.id] = restore(text);
		}
		return { compilesTo: errors.length > 0 ? null : { kind: "expr", outputs }, errors, warnings, latent, targets };
	}

	let body = emitted.body.replace(/\n+$/, "");
	const taken = new Set(body.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) ?? []);
	const prelude: string[] = [];
	for (const [id, count] of inputReads(body)) {
		if (count < 2) continue;
		let local = id;
		for (let n = 2; taken.has(local); n++) local = `${id}${n}`;
		taken.add(local);
		prelude.push(`local ${local} = ${logicInputName(id)}`);
		body = body.replace(new RegExp(`\\b${logicInputName(id)}\\b`, "g"), local);
	}

	const lines = [...prelude, ...(body === "" ? [] : body.split("\n"))];
	if (shape.outputs.length > 0 && !lines.some((line) => shape.outputs.some((o) => line.includes(logicOutputName(o.id))))) {
		warnings.push("Node Outputs is never reached, so the node's outputs stay nil.");
	}
	const declares = lines.some((line) => /^local\s/.test(line));
	const text = declares ? ["do", ...lines.map((line) => (line === "" ? "" : `\t${line}`)), "end"].join("\n") : lines.join("\n");

	return {
		compilesTo: errors.length > 0 ? null : { kind: "statement", template: restore(text) },
		errors,
		warnings,
		latent,
		targets,
	};
}
