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
import type { ExportedType } from "./api.js";
import type { TypeField } from "../core/typeFields.js";

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
	return useSyncExternalStore(subscribe, () => current, () => current);
}

/** For the defaults of Require Module's pins, which are the library's. */
const BUILTINS = createRegistry();

/** A dotted instance path, spelled one way. */
function normalise(path: string): string {
	return path.split(".").map((s) => s.trim()).filter(Boolean).join(".");
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
	script: Pick<NodeScript, "nodes">, types: ExportedType[],
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
