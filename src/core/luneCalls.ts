/**
 * Calling a function from Lune's standard library.
 *
 * The same shape as `serviceCalls.ts` and for the same reason. One definition
 * per function would put sixty-odd entries in the palette and sixty-odd pages
 * in the reference, and would put a release of Roswaal between a developer and
 * anything Lune shipped last month. So the **catalogue** does the work —
 * `luneApi.ts`, generated from Lune's own type definitions — and two nodes read
 * it: one for a call that *does* something, one for a call that *answers*
 * something.
 *
 * The palette still lists every function by name. Searching for `readFile`
 * finds it; what the menu hands over is a configured node.
 *
 * ## Which of the two a function gets
 *
 * Lune already decided. It tags a function `@tag must_use` when the point of
 * the call is the value it returns, which is exactly the line between a pure
 * node and one on the execution chain — so `fs.readFile` is a value and
 * `fs.writeFile` is a step, and neither is a judgement made here.
 *
 * ## The require is not ours to add
 *
 * A Lune Function node does **not** write its own `require`. `@lune/fs` has to
 * be declared — in the Variables panel or by a Require at Top — and a node
 * whose module is not declared is an error that says so and says how to fix it.
 *
 * That is the rule the whole module design is built on: *a generated file does
 * not grow imports nobody chose*. It would be easy to argue an exception here,
 * since `@lune/fs` is Lune's own and always available. The exception is still
 * wrong — a file that quietly gained `local fs = require("@lune/fs")` because
 * somebody dropped a node is a file whose dependencies are not what its author
 * can see, and that is true whoever wrote the module.
 */

import { LUNE_MODULES, type LuneFunction, type LuneParam } from "./luneApi.js";
import { LUAU_PRIMITIVES } from "./luneTypes.js";
import type { Literal, NodeConfig, PinDef } from "./schema.js";

/** The node ids, named because the emitter and the menu both test for them. */
export const LUNE_CALL = "lune.call";
export const LUNE_VALUE = "lune.value";

const BY_ALIAS = new Map(LUNE_MODULES.map((module) => [module.alias, module]));

/** Every module, in the order the catalogue lists them. */
export const LUNE_ALIASES: string[] = LUNE_MODULES.map((module) => module.alias);

export function functionsOf(alias: string): readonly LuneFunction[] {
	return BY_ALIAS.get(alias)?.functions ?? [];
}

export function luneFunction(
	alias: string | undefined, name: string | undefined,
): LuneFunction | undefined {
	if (!alias || !name) return undefined;
	return functionsOf(alias).find((one) => one.name === name);
}

/** What a module is required as: `@lune/fs`. */
export const specifierFor = (alias: string): string => `@lune/${alias}`;

const config = (c: NodeConfig | undefined, key: string): string | undefined => {
	const value = (c as Record<string, unknown> | undefined)?.[key];
	return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
};

export const moduleOf = (c: NodeConfig | undefined): string => config(c, "module") ?? "fs";
export const callOf = (c: NodeConfig | undefined): string | undefined => config(c, "call");

/**
 * Argument pin ids, positional for the reason the service call's are.
 *
 * A literal typed into argument two stays on argument two when Lune renames a
 * parameter underneath it, which naming the pins after the parameters would
 * lose the day it happened.
 */
export const argPinId = (index: number): string => `a${index}`;

/**
 * A Luau type from the catalogue as a pin type.
 *
 * Roswaal's pin types are single names — they decide what may be wired to what
 * and what colour a wire is drawn. Lune's are Luau's, which is a bigger
 * language: `buffer | string`, `{ string }`, `(...) -> ...`.
 *
 * So a type that *is* a name is kept, and anything else becomes `any` with the
 * real Luau written into the pin's description. Nothing is lost and nothing is
 * claimed: a pin that said `string` for `buffer | string` would refuse a buffer
 * the runtime accepts, which is worse than a pin that admits it takes either.
 */
export function pinTypeFor(luau: string): string {
	const text = luau.trim();
	if (text === "") return "any";
	if (/^\{\s*[A-Za-z][\w.]*\s*\}$/.test(text)) return "table";
	if (/^\{/.test(text)) return "table";
	if (!/^[A-Za-z][\w.]*$/.test(text)) return "any";
	if (text === "nil" || text === "never" || text === "unknown") return "any";
	return text;
}

/** True when the pin type had to give something up, so the description says it. */
const lossy = (luau: string): boolean => pinTypeFor(luau) === "any" && luau.trim() !== "any";

/**
 * A starting value for an argument, where there is an obvious one.
 *
 * A string, number or boolean pin becomes a field you type into, and everything
 * else stays empty so an unwired one is an error naming the pin rather than a
 * silent `nil`.
 *
 * **Only for a required argument.** A default on an optional one means the call
 * always passes it, and there is then no way to leave it out — `task.wait()`
 * came out as `task.wait(0)`, which is a different call. An optional pin starts
 * empty so that unset means absent, and a developer who wants the zero types
 * one.
 */
function defaultFor(type: string): Literal | undefined {
	if (type === "string") return { t: "string", v: "" };
	if (type === "number") return { t: "number", v: 0 };
	if (type === "boolean") return { t: "boolean", v: false };
	return undefined;
}

/** What a pin should say about itself: Lune's words, and the type when it differs. */
function describe(param: LuneParam): string | undefined {
	const parts: string[] = [];
	if (param.what !== "") parts.push(param.what);
	if (lossy(param.type)) parts.push(`Takes \`${param.type}\`.`);
	return parts.length > 0 ? parts.join(" ") : undefined;
}

/** A function's arguments as pins, in order. */
export function argumentPins(fn: LuneFunction): PinDef[] {
	return fn.params.map((param, index) => {
		// `...` is variadic: one pin for it rather than a guess at how many.
		const variadic = param.name === "...";
		const type = pinTypeFor(param.type);
		const pin: PinDef = {
			id: argPinId(index),
			name: variadic ? "Arguments" : param.name,
			kind: "data",
			type,
			default: param.optional || variadic ? undefined : defaultFor(type),
		};
		if (param.optional || variadic) pin.optional = true;
		const description = describe(param);
		if (description !== undefined) pin.description = description;
		return pin;
	});
}

/** The result pin, or nothing when the call returns nothing. */
export function resultPin(fn: LuneFunction): PinDef | null {
	if (fn.returns === "") return null;
	const pin: PinDef = {
		id: "result",
		name: "Result",
		kind: "data",
		type: pinTypeFor(fn.returns),
	};
	const parts: string[] = [];
	if (fn.returnsWhat !== "") parts.push(fn.returnsWhat);
	if (lossy(fn.returns)) parts.push(`Gives \`${fn.returns}\`.`);
	if (parts.length > 0) pin.description = parts.join(" ");
	return pin;
}

/**
 * Which node a function belongs on.
 *
 * Lune's own `must_use`, and a function that returns nothing can only be a
 * step — there would be no pin for the answer.
 */
export function isValueCall(fn: LuneFunction): boolean {
	return fn.mustUse && fn.returns !== "";
}

const exec = (id: string, name = ""): PinDef => ({ id, name, kind: "exec" });

/** The pins of a Lune Function node, for either shape. */
export function lunePins(
	c: NodeConfig | undefined, pure: boolean,
): { inputs: PinDef[]; outputs: PinDef[] } {
	const fn = luneFunction(moduleOf(c), callOf(c));
	const args = fn ? argumentPins(fn) : [];
	const result = fn ? resultPin(fn) : null;

	if (pure) {
		return {
			inputs: args,
			// A pure node with nothing to give back would be a node that cannot
			// be read, so an unconfigured one still offers a result.
			outputs: [result ?? { id: "result", name: "", kind: "data", type: "any" }],
		};
	}
	return {
		inputs: [exec("in"), ...args],
		outputs: [exec("then"), ...(result ? [result] : [])],
	};
}

/** `fs.readFile`, for a node's header. */
export function callLabel(c: NodeConfig | undefined): string | undefined {
	const call = callOf(c);
	return call ? `${moduleOf(c)}.${call}` : undefined;
}

export interface LuneMenuItem {
	/** The node this places. */
	def: string;
	module: string;
	call: string;
	/** What the menu row reads: `fs.readFile`. */
	label: string;
	summary: string;
}

/**
 * Every function, as a row the node menu can list.
 *
 * The point of the whole arrangement: two nodes, and a palette that still knows
 * every name. Typing `readFile` finds it.
 */
export function luneMenuItems(): LuneMenuItem[] {
	return LUNE_MODULES.flatMap((module) =>
		module.functions.map((fn) => ({
			def: isValueCall(fn) ? LUNE_VALUE : LUNE_CALL,
			module: module.alias,
			call: fn.name,
			label: `${module.alias}.${fn.name}`,
			summary: fn.summary,
		})),
	);
}

/** Primitives a pin type may be, for a test that the mapping stays honest. */
export const PIN_PRIMITIVES = LUAU_PRIMITIVES;
