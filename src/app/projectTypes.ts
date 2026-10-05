/**
 * Types the project's modules export, and which of them the open graph can name.
 *
 * Held outside React state because two unrelated panels read it — the type
 * picker in the Inspector and the Types list in the Variables panel — and
 * threading it through every component between them would be props for their
 * own sake. `App` fills it from the daemon; this module only holds it.
 */

import { useSyncExternalStore } from "react";

import { toIdentifier } from "../core/compiler/luau.js";
import { createRegistry } from "../core/nodes/index.js";
import { lastSegment } from "../core/roblox.js";
import type { GraphNode, NodeScript } from "../core/schema.js";
import { SCRIPT_CALLS, syncModuleCalls } from "../core/scriptCalls.js";
import type { TypeField } from "../core/typeFields.js";
import type { ExportedModuleFunction, ExportedType } from "./api.js";

let current: ExportedType[] = [];
const listeners = new Set<() => void>();

export function setProjectTypes(next: ExportedType[]): void {
	current = next;
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useProjectTypes(): ExportedType[] {
	return useSyncExternalStore(
		subscribe,
		() => current,
		() => current,
	);
}

/** For the defaults of Require Module's pins, which are the library's. */
const BUILTINS = createRegistry();

/** A dotted instance path, spelled one way. */
function normalise(path: string): string {
	return path
		.split(".")
		.map((s) => s.trim())
		.filter(Boolean)
		.join(".");
}

/** A pin's text, typed or defaulted. */
function textOf(node: Pick<GraphNode, "def" | "literals">, pin: string): string {
	const literal =
		node.literals?.[pin] ?? BUILTINS.get(node.def)?.inputs.find((p) => p.id === pin)?.default;
	return literal && (literal.t === "string" || literal.t === "raw") ? literal.v.trim() : "";
}

/**
 * The exported types this graph reaches through its Require Module nodes, the
 * way it would write them: `Config.Tuning`.
 *
 * Matched on where a module lands — the root and dotted path Require Module is
 * given against the location a node map puts the graph at — and named after the
 * local the require is hoisted to, which is its As name or the path's last
 * segment. A module this graph does not require is not offered: naming its
 * types would need the require first.
 */
export function requiredTypes(
	script: Pick<NodeScript, "nodes">,
	types: ExportedType[],
): { type: string; graph: string; fields?: TypeField[] }[] {
	const out: { type: string; graph: string; fields?: TypeField[] }[] = [];
	const seen = new Set<string>();

	for (const node of script.nodes) {
		if (node.def !== "module.requirePath") continue;
		const root = textOf(node, "root");
		const path = normalise(textOf(node, "path"));
		if (root === "" || path === "") continue;
		const local = toIdentifier(textOf(node, "as") || lastSegment(path), "module");

		for (const exported of types) {
			const at = exported.location;
			if (!at || at.root !== root || normalise(at.path) !== path) continue;
			const type = `${local}.${exported.name}`;
			if (seen.has(type)) continue;
			seen.add(type);
			out.push({ type, graph: exported.graph, fields: exported.fields });
		}
	}
	return out;
}

let functions: ExportedModuleFunction[] = [];
const functionListeners = new Set<() => void>();

/** The functions the project's modules export, as the daemon last reported them. */
export function setProjectFunctions(next: ExportedModuleFunction[]): void {
	functions = next;
	for (const listener of functionListeners) listener();
}

export function useProjectFunctions(): ExportedModuleFunction[] {
	return useSyncExternalStore(
		(listener) => {
			functionListeners.add(listener);
			return () => functionListeners.delete(listener);
		},
		() => functions,
		() => functions,
	);
}

/** A module this graph requires, the local it is required as, and what it exports. */
export interface RequiredModule {
	/** The Require Module node. */
	node: string;
	/** `Config`: the local the require is hoisted to. */
	local: string;
	functions: ExportedModuleFunction[];
}

/**
 * The functions this graph can call through its Require Module nodes.
 *
 * Matched exactly as `requiredTypes` matches types — the root and dotted path
 * against where a node map puts the module — so a module is offered only once
 * it is required, and only under the name it is required as.
 */
export function requiredModules(
	script: Pick<NodeScript, "nodes">,
	exported: readonly ExportedModuleFunction[] = functions,
): RequiredModule[] {
	const out: RequiredModule[] = [];
	for (const node of script.nodes) {
		if (node.def !== "module.requirePath") continue;
		const root = textOf(node, "root");
		const path = normalise(textOf(node, "path"));
		if (root === "" || path === "") continue;
		const local = toIdentifier(textOf(node, "as") || lastSegment(path), "module");
		const found = exported.filter((fn) => {
			const at = fn.location;
			return at !== null && at.root === root && normalise(at.path) === path;
		});
		if (found.length > 0) out.push({ node: node.id, local, functions: found });
	}
	return out;
}

/**
 * Every call to a required module's function, on what that module exports now.
 *
 * Run beside `syncScriptCalls` after each edit. A module the project has not
 * reported, or a function it no longer exports, leaves the node as it was.
 */
export function syncModuleCallsFor(script: NodeScript): NodeScript {
	if (functions.length === 0) return script;
	const required = requiredModules(script);
	const byNode = new Map(required.map((m) => [m.node, m.functions] as const));
	const synced = syncModuleCalls(script, (requireNode) => byNode.get(requireNode));
	// The header names the module as it is required, and an As name can change.
	const localOf = new Map(required.map((m) => [m.node, m.local] as const));
	let renamed = false;
	const nodes = synced.nodes.map((node) => {
		const module = node.config?.module;
		const local = typeof module === "string" ? localOf.get(module) : undefined;
		if (!SCRIPT_CALLS.has(node.def) || !local || node.config?.moduleName === local) return node;
		renamed = true;
		return { ...node, config: { ...node.config, moduleName: local } };
	});
	return renamed ? { ...synced, nodes } : synced;
}
