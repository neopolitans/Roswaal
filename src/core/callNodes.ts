/**
 * The shape two catalogue-driven call nodes share.
 *
 * A Service Function calls a method the Roblox catalogue knows; a Lune Function
 * calls a function Lune's does. Each is two nodes (a step and a value), set to a
 * call by two names in its config, with argument pins derived from the call's
 * signature. Everything about that shape is here, once: reading the two names,
 * the positional pin ids, the starting value an argument gets, the label the
 * call is written as, and splitting a typed label back into its halves.
 *
 * What differs is the catalogue and its spelling, and that is the adapter: a
 * `CallSpelling` says which config keys hold the two names and what separates
 * them. `serviceCalls.ts` and `luneCalls.ts` each hold one, along with what is
 * genuinely theirs — the catalogue lookups, the pins a call has besides its
 * arguments, and the picker's detail line.
 *
 * Not for Call Method or Call Function, which take an object or a function on a
 * wire and know nothing about what they call.
 */

import type { Literal, NodeConfig, PinDef } from "./schema.js";

/** How one catalogue's calls are stored on a node and written as text. */
export interface CallSpelling {
	/** The config key naming what is called on: `service`, `module`. */
	ownerKey: string;
	/** The config key naming the call itself: `method`, `call`. */
	memberKey: string;
	/** What an unset owner means: the one a fresh node starts on. */
	defaultOwner: string;
	/** Between the two halves of a call as written: `RunService:IsServer`. */
	separator: ":" | ".";
}

/** A config value as trimmed text, or undefined when it is missing or blank. */
function configText(config: NodeConfig | undefined, key: string): string | undefined {
	const value = config?.[key];
	return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** What the call is made on: a service, a module. */
export function ownerOf(spelling: CallSpelling, config: NodeConfig | undefined): string {
	return configText(config, spelling.ownerKey) ?? spelling.defaultOwner;
}

/** The call chosen on the node, or undefined before one is picked. */
export function memberOf(
	spelling: CallSpelling,
	config: NodeConfig | undefined,
): string | undefined {
	return configText(config, spelling.memberKey);
}

/**
 * The call as it is written: `RunService:IsServer`, `fs.readFile`.
 *
 * One string is what the picker offers, what the node's subtitle shows and what
 * a menu entry is named, so it is built in one place.
 */
export function callLabelOf(
	spelling: CallSpelling,
	config: NodeConfig | undefined,
): string | undefined {
	const member = memberOf(spelling, config);
	return member ? `${ownerOf(spelling, config)}${spelling.separator}${member}` : undefined;
}

/** The two halves of a written call, ignoring a trailing argument list. */
export function splitCallText(
	spelling: CallSpelling,
	text: string,
): { owner: string; member: string } | undefined {
	const at = text.indexOf(spelling.separator);
	if (at <= 0) return undefined;
	const owner = text.slice(0, at).trim();
	const member = text
		.slice(at + 1)
		.replace(/\(.*\)$/, "")
		.trim();
	if (owner === "" || member === "") return undefined;
	return { owner, member };
}

/**
 * The argument pin ids, which are positional.
 *
 * `a0`, `a1`, … the same as every other call node, so the emitter's rule for
 * folding arguments applies unchanged — and so a literal typed into argument
 * two stays on argument two when the catalogue renames a parameter underneath
 * it. Naming the pins after the parameters would lose the value that day.
 */
export function argPinId(index: number): string {
	return `a${index}`;
}

/**
 * A starting value for an argument, where there is an obvious one.
 *
 * A string, number or boolean pin becomes a field you type into, and everything
 * else stays empty so an unwired one is an error naming the pin rather than a
 * silent `nil`.
 *
 * Only for a required argument. An optional one starts empty so that unset
 * means absent: the call leaves it off, and a developer who wants the zero
 * types one.
 */
function startingValue(type: string, optional: boolean): Literal | undefined {
	if (optional) return undefined;
	if (type === "string") return { t: "string", v: "" };
	if (type === "number") return { t: "number", v: 0 };
	if (type === "boolean") return { t: "boolean", v: false };
	return undefined;
}

/** One argument of a call, as a pin. */
export function argumentPin(argument: {
	index: number;
	name: string;
	type: string;
	optional: boolean;
	description?: string;
}): PinDef {
	const pin: PinDef = {
		id: argPinId(argument.index),
		name: argument.name,
		kind: "data",
		type: argument.type,
		default: startingValue(argument.type, argument.optional),
	};
	if (argument.optional) pin.optional = true;
	if (argument.description !== undefined) pin.description = argument.description;
	return pin;
}

/** An execution pin, unnamed as every call node's are. */
export function execPin(id: string): PinDef {
	return { id, name: "", kind: "exec" };
}
