/**
 * Typed reads of a node's config, for the editor.
 *
 * `NodeConfig` is a loose record on purpose: every kind of node keeps its own
 * fields there and the schema does not list them. Reading it with an inline
 * `node.config as { name?: string }` writes the shape down at every call site
 * and trusts the file to match; these read a field once, check it is what it
 * claims to be, and answer undefined when it is not, so a hand-edited graph
 * with a number where a name should be is a missing name rather than a crash.
 *
 * Reads only. Writes go through `setConfig` in `edits.ts`.
 */

import type { NodeConfig } from "../core/schema.js";

/** Anything carrying a config: a graph node, a pick of one, or nothing. */
type Configured = { config?: NodeConfig } | undefined;

/** One entry of a parameter, return or export list. */
export interface NamedEntry {
	name: string;
	type?: string;
}

/** A string field of the node's config, or undefined when absent or not a string. */
export function configText(node: Configured, key: string): string | undefined {
	const value = node?.config?.[key];
	return typeof value === "string" ? value : undefined;
}

/** Whether a field of the node's config is exactly `true`. */
export function configFlag(node: Configured, key: string): boolean {
	return node?.config?.[key] === true;
}

/**
 * A list field of the config -- `params`, `returns`, `exports`, a type's
 * `fields` -- keeping only the entries that have a name.
 */
export function configEntries(node: Configured, key: string): NamedEntry[] {
	const value = node?.config?.[key];
	if (!Array.isArray(value)) return [];
	return value.filter(isNamedEntry);
}

/** A function's or handler's parameters. */
export function paramsOf(node: Configured): NamedEntry[] {
	const params = configEntries(node, "params");
	// A method's receiver is read like a parameter, and listed first, where
	// Luau puts it.
	return configFlag(node, "method") ? [{ name: "self" }, ...params] : params;
}

/**
 * What a function is called on screen: its name, or "function" when it has
 * none yet. For display -- a tab, a watermark, a menu entry -- never for the
 * file, which writes what the node actually holds.
 */
export function functionNameOf(node: Configured): string {
	return configText(node, "name")?.trim() || "function";
}

/**
 * An entry with a name. The entry itself is kept, not rebuilt, so any field
 * a pack or a later version adds survives an edit that writes the list back.
 */
function isNamedEntry(value: unknown): value is NamedEntry {
	if (typeof value !== "object" || value === null) return false;
	const { name } = value as { name?: unknown }; // An object; its name is checked next.
	return typeof name === "string";
}
