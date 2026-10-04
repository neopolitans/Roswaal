/**
 * The Luau that reaches an instance in the place, for code written by hand.
 *
 * Dragging an instance out of the DataModel into Custom Code writes this where
 * it is dropped. Code typed into a node cannot lean on the locals the compiler
 * hoists for services -- they exist only when some node asked for one -- so a
 * service is reached with `game:GetService`, every time.
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

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** `.Name`, or `["Odd name"]` when the name is not an identifier Luau would take. */
function index(name: string): string {
	return IDENTIFIER.test(name) && !RESERVED_WORDS.has(name) ? `.${name}` : `[${quoteString(name)}]`;
}

/** The expression: `game:GetService("ReplicatedStorage").Tank.Config`, and its member. */
export function referenceExpression(ref: InstanceReference): string {
	const [first, ...rest] = ref.path;
	if (first === undefined) return "game";
	const base = isService(first) ? `game:GetService(${quoteString(first)})` : `game${index(first)}`;
	const instance = rest.reduce((acc, name) => acc + index(name), base);
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

/** A whole line: `local Config = game:GetService("ReplicatedStorage").Tank.Config`. */
export function referenceLocal(ref: InstanceReference): string {
	return `local ${referenceName(ref)} = ${referenceExpression(ref)}`;
}
