/**
 * The Luau that reaches an instance in the place, for code written by hand.
 *
 * Dragging an instance out of the DataModel into Code Block writes this where
 * it is dropped. It starts from the nearest name already in scope that holds
 * part of the way there -- a local the code declared, a local an earlier block
 * left, or a service the graph's Get Service hoists -- so dropping Config under
 * `local Shared = ...Shared` writes `Shared.Config`, not the whole path again.
 * With none of those, a service is reached with `game:GetService`, and the
 * Workspace with `workspace`, which Roblox always provides.
 */

import { quoteString } from "../compiler/quote.js";
import { isService } from "../roblox.js";
import { RESERVED_WORDS } from "./lexer.js";

/** What a drag out of the DataModel or Properties names. */
export interface InstanceReference {
	/** Names from the DataModel down: a service first, then its descendants. */
	path: string[];
	/** A property of the instance, when that is what was dragged. */
	property?: string;
	/** An attribute of the instance, when that is what was dragged. */
	attribute?: string;
}

/** A name in scope where the code goes, and the instance it holds. */
export interface KnownInstance {
	name: string;
	path: readonly string[];
}

/** Roblox's own name for the Workspace: always there, no local needed. */
const GLOBALS: readonly KnownInstance[] = [{ name: "workspace", path: ["Workspace"] }];

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The known name that holds the most of the path, and what is left below it.
 * The first of two that hold as much wins, so callers list nearest first.
 */
function nearest(
	path: readonly string[],
	known: readonly KnownInstance[],
): { name: string; rest: string[] } | undefined {
	let best: KnownInstance | undefined;
	for (const one of [...known, ...GLOBALS]) {
		if (one.path.length === 0 || one.path.length > path.length) continue;
		if (!one.path.every((name, i) => path[i] === name)) continue;
		if (!best || one.path.length > best.path.length) best = one;
	}
	return best && { name: best.name, rest: path.slice(best.path.length) };
}

/** `.Name`, or `["Odd name"]` when the name is not an identifier Luau would take. */
function index(name: string): string {
	return IDENTIFIER.test(name) && !RESERVED_WORDS.has(name) ? `.${name}` : `[${quoteString(name)}]`;
}

/**
 * The expression: `game:GetService("ReplicatedStorage").Tank.Config`, or
 * `Shared.Config` from a local that holds Shared, and its member.
 */
export function referenceExpression(
	ref: InstanceReference,
	known: readonly KnownInstance[] = [],
): string {
	const [first, ...rest] = ref.path;
	if (first === undefined) return "game";
	const near = nearest(ref.path, known);
	const instance = near
		? near.rest.reduce((acc, name) => acc + index(name), near.name)
		: rest.reduce(
				(acc, name) => acc + index(name),
				isService(first) ? `game:GetService(${quoteString(first)})` : `game${index(first)}`,
			);
	if (ref.attribute !== undefined) return `${instance}:GetAttribute(${quoteString(ref.attribute)})`;
	if (ref.property !== undefined) return instance + index(ref.property);
	return instance;
}

/** What the reference is called: the property, the attribute or the instance. */
export function referenceName(ref: InstanceReference): string {
	const raw = ref.attribute ?? ref.property ?? ref.path.at(-1) ?? "instance";
	let name = raw.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
	if (name === "") name = "instance";
	if (/^[0-9]/.test(name)) name = `_${name}`;
	if (RESERVED_WORDS.has(name)) name = `${name}_`;
	return name;
}

/**
 * A whole line: `local Config = game:GetService("ReplicatedStorage").Tank.Config`.
 *
 * Unless a name in scope holds that very instance already, when it is that
 * name: a second local for the same thing would be one more to keep in step.
 */
export function referenceLocal(
	ref: InstanceReference,
	known: readonly KnownInstance[] = [],
): string {
	if (ref.property === undefined && ref.attribute === undefined) {
		const held = known.find(
			(one) => one.path.length === ref.path.length && one.path.every((n, i) => ref.path[i] === n),
		);
		if (held) return held.name;
	}
	return `local ${referenceName(ref)} = ${referenceExpression(ref, known)}`;
}
