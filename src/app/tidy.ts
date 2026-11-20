/**
 * Tidying a graph's declarations: what in the flow can move to the top of the
 * file without changing what the file does, why the rest stays, and making a
 * global local where that is safe.
 *
 * Nothing here runs by itself. The Variables panel offers each as a choice
 * (Move to top on a row, Tidy declarations… for the file, Make local on a
 * global) and shows the Luau's diff before anything changes. An older file
 * is kept as written unless its author asks.
 *
 * What can move: a Declare Local or a variable's initialiser that runs once on
 * the script's own flow with a plain value typed in (a number, a string, a
 * boolean, nil, or a table of those), and a type that names nothing the flow
 * declares. What stays: requires (moving one changes when its module runs),
 * functions, Code Blocks, values built or read when the flow reaches them,
 * and anything inside a loop, a branch or a handler.
 */

import type { Expr } from "../core/luau/ast.js";
import { parseExpression } from "../core/luau/parser.js";
import { typeDeclarationOf } from "../core/nodes/flow.js";
import { variableRefOf } from "../core/nodes/variables.js";
import type { GraphNode, Link, Literal, NodeScript } from "../core/schema.js";
import type { FlowDeclaration, GlobalName } from "../core/scriptOrder.js";
import { canPromoteLocal, promoteLocal } from "./promote.js";
import { newId } from "./store.js";

/** One row of the plan: whether it can move, and why, in a few words. */
export interface TidyRow {
	node: string;
	name: string;
	kind: FlowDeclaration["kind"];
	can: boolean;
	why: string;
}

/** Exec pins that carry on at the same level: `then`, and a Sequence's steps. */
const SAME_LEVEL = /^(then|s\d+)$/;

/** Whether a node runs once, on the script's own flow, straight from its start. */
function onMainFlow(script: NodeScript, node: GraphNode): boolean {
	if (node.graph) return false;
	const byId = new Map(script.nodes.map((n) => [n.id, n] as const));
	const seen = new Set<string>();
	let at = node.id;
	for (;;) {
		if (seen.has(at)) return false;
		seen.add(at);
		const into = script.links.filter((l) => l.to.node === at && l.to.pin === "in");
		const [link, ...more] = into;
		if (!link || more.length > 0) return false;
		const from = byId.get(link.from.node);
		if (!from) return false;
		if (from.def === "script.begin") return true;
		if (!SAME_LEVEL.test(link.from.pin)) return false;
		at = from.id;
	}
}

/** A constant: a number, a string, a boolean, nil, or a table holding only those. */
function plainExpr(e: Expr): boolean {
	switch (e.kind) {
		case "nil":
		case "boolean":
		case "number":
		case "string":
			return true;
		case "unary":
			return e.op === "-" && e.operand.kind === "number";
		case "paren":
			return plainExpr(e.inner);
		case "table":
			return e.fields.every((f) => plainExpr(f.value) && (f.kind !== "keyed" || plainExpr(f.key)));
		default:
			return false;
	}
}

function plainLiteral(value: Literal | undefined): boolean {
	if (!value || value.t !== "raw") return true;
	const parsed = parseExpression(value.v);
	return parsed.errors.length === 0 && parsed.value !== undefined && plainExpr(parsed.value);
}

/** What a typed-in value is, for the plan's reason. */
function describe(value: Literal | undefined): string {
	if (!value) return "nil";
	switch (value.t) {
		case "nil":
			return "nil";
		case "number":
			return "A number";
		case "string":
			return "A string";
		case "boolean":
			return "A boolean";
		default:
			return value.v.trim().startsWith("{") ? "A table of plain values" : "A plain value";
	}
}

const wired = (script: NodeScript, node: string, pin: string) =>
	script.links.some((l) => l.to.node === node && l.to.pin === pin);

/** A name as a whole word, not a field or a method: what `name` reads as. */
export function namesWord(text: string, name: string): boolean {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return false;
	return new RegExp(`(^|[^A-Za-z0-9_.:])${name}(?![A-Za-z0-9_])`).test(text);
}

/** The Luau above a line, comments left out: what reads a name before it is declared. */
function namedAbove(code: string, line: number, name: string): boolean {
	return code
		.split("\n")
		.slice(0, line - 1)
		.some((l) => namesWord(l.replace(/--.*$/, ""), name));
}

/**
 * Every declaration the flow makes, whether it can move to the top and why.
 * `code` is the compiled Luau the lines in `flow` number.
 */
export function tidyPlan(script: NodeScript, flow: FlowDeclaration[], code: string): TidyRow[] {
	const flowNames = new Set(flow.map((d) => d.name));
	return flow.map((d) => {
		const row = (can: boolean, why: string): TidyRow => ({
			node: d.node,
			name: d.name,
			kind: d.kind,
			can,
			why,
		});
		const node = script.nodes.find((n) => n.id === d.node);
		if (!node) return row(false, "Not on this graph");
		if (d.kind === "require")
			return row(false, "A require runs its module; moving it changes when");
		if (node.def === "code.custom") return row(false, "Kept as code: move it in its Code Block");
		if (d.kind === "function") return row(false, "A function stays where the flow declares it");

		if (node.def === "type.declareHere") {
			const t = typeDeclarationOf(node.def, node.config);
			if (t.shape === "typeof") return row(false, "typeof reads a value the flow makes");
			const text = t.shape === "fields" ? t.fields.map((f) => f.type).join(" ") : t.definition;
			const named = [...flowNames].find((n) => n !== d.name && namesWord(text, n));
			if (named) return row(false, `Names ${named}, which the flow declares`);
			return row(true, "Names nothing the flow declares");
		}

		if (node.def === "local.declare" || node.def === "variable.init") {
			if (node.graph) return row(false, "Inside a function: a fresh one each call");
			if (wired(script, node.id, "value"))
				return row(false, "Its value is built when the flow reaches it");
			if (!onMainFlow(script, node)) return row(false, "Inside a branch, a loop or a handler");
			const value = node.literals?.value;
			if (!plainLiteral(value)) return row(false, "Its value is read when the flow reaches it");
			if (namedAbove(code, d.line, d.name))
				return row(false, "Named above it, where it means a global");
			if (node.def === "local.declare" && !canPromoteLocal(script, node)) {
				return row(false, "Runs more than once");
			}
			return row(true, `${describe(value)}, set once`);
		}
		return row(false, "Stays where the flow declares it");
	});
}

/** Removes a node from the flow, joining what ran before it to what ran after. */
function closeOver(links: Link[], nodeId: string): Link[] {
	const into = links.filter((l) => l.to.node === nodeId && l.to.pin === "in");
	const onward = links.filter((l) => l.from.node === nodeId && l.from.pin === "then");
	const kept = links.filter(
		(l) =>
			!(l.to.node === nodeId && l.to.pin === "in") &&
			!(l.from.node === nodeId && l.from.pin === "then"),
	);
	for (const before of into) {
		for (const after of onward) kept.push({ id: newId(), from: before.from, to: after.to });
	}
	return kept;
}

/**
 * The variable takes the initialiser's value as its own and is declared at
 * the top; the initialiser goes. What read its value reads a Get Variable.
 */
function moveInitialiser(script: NodeScript, nodeId: string): NodeScript {
	const node = script.nodes.find((n) => n.id === nodeId);
	if (!node) return script;
	const ref = variableRefOf(node.config);
	const value: Literal = node.literals?.value ?? { t: "nil" };
	const reads = script.links.filter((l) => l.from.node === nodeId && l.from.pin === "value");
	const getter = reads.length > 0 ? newId() : undefined;
	const links = closeOver(script.links, nodeId)
		.filter((l) => l.from.node !== nodeId && l.to.node !== nodeId)
		.concat(
			getter
				? reads.map((r) => ({ id: newId(), from: { node: getter, pin: "value" }, to: r.to }))
				: [],
		);
	const nodes = script.nodes.flatMap((n): GraphNode[] =>
		n.id !== nodeId
			? [n]
			: getter
				? [{ id: getter, def: "variable.get", x: n.x, y: n.y + 40, config: { ...n.config } }]
				: [],
	);
	return {
		...script,
		nodes,
		links,
		variables: script.variables.map((v) => (v.id === ref.variable ? { ...v, default: value } : v)),
	};
}

/** The type is declared at the top, with the others, rather than in the flow. */
function moveType(script: NodeScript, nodeId: string): NodeScript {
	return {
		...script,
		links: closeOver(script.links, nodeId).filter(
			(l) => l.from.node !== nodeId && l.to.node !== nodeId,
		),
		nodes: script.nodes.map((n) => (n.id === nodeId ? { ...n, def: "type.declareTop" } : n)),
	};
}

/** One row moved to the top. Unchanged when it cannot move. */
export function moveToTop(script: NodeScript, nodeId: string): NodeScript {
	const node = script.nodes.find((n) => n.id === nodeId);
	if (!node) return script;
	if (node.def === "local.declare") return promoteLocal(script, nodeId);
	if (node.def === "variable.init") return moveInitialiser(script, nodeId);
	if (node.def === "type.declareHere") return moveType(script, nodeId);
	return script;
}

/** Every row the plan says can move, moved. */
export function tidyAll(script: NodeScript, plan: TidyRow[]): NodeScript {
	return plan.filter((r) => r.can).reduce((s, r) => moveToTop(s, r.node), script);
}

/** Whether a global can be made local, and why not when it cannot. */
export interface MakeLocal {
	ok: boolean;
	why: string;
	run?: (script: NodeScript) => NodeScript;
}

/** `getfenv`, `setfenv`, `loadstring` or `_G`: a file that can read a global by a name it builds. */
const ENVIRONMENT = /(^|[^A-Za-z0-9_.:])(getfenv|setfenv|loadstring|_G)(?![A-Za-z0-9_])/m;

/**
 * Whether a name the file sets without `local` can become a local where it is
 * first set: in a Code Block, as a single target, or a function written
 * `function f()`; named nowhere above that; in a file that never reaches
 * its environment by name.
 */
export function makeLocalPlan(script: NodeScript, code: string, global: GlobalName): MakeLocal {
	const no = (why: string): MakeLocal => ({ ok: false, why });
	if (ENVIRONMENT.test(code.replace(/--[^\n]*/g, ""))) {
		return no("The file reaches its environment (getfenv, _G), so a global may be read by name");
	}
	const node = script.nodes.find((n) => n.id === global.node);
	if (!node) return no("Not set on this graph");
	if (namedAbove(code, global.line, global.name)) return no("Named above where it is first set");

	if (node.def === "function.declareHere" && node.config?.global === true) {
		return {
			ok: true,
			why: "Written local function",
			run: (s) => ({
				...s,
				nodes: s.nodes.map((n) => {
					if (n.id !== node.id) return n;
					const { global: _gone, ...config } = n.config ?? {};
					return { ...n, config };
				}),
			}),
		};
	}
	const literal = node.literals?.code;
	if (node.def !== "code.custom" || literal?.t !== "raw") return no("Not set in a Code Block");
	const first = new RegExp(`^([ \\t]*)${global.name}([ \\t]*)=(?!=)`, "m");
	if (!first.test(literal.v)) return no("Set alongside other names, or inside a block");
	return {
		ok: true,
		why: "Becomes local where it is first set",
		run: (s) => ({
			...s,
			nodes: s.nodes.map((n) => {
				const c = n.literals?.code;
				if (n.id !== node.id || c?.t !== "raw") return n;
				return {
					...n,
					literals: {
						...n.literals,
						code: { t: "raw", v: c.v.replace(first, `$1local ${global.name}$2=`) },
					},
				};
			}),
		}),
	};
}
