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
 *
 * The shape this shares with the Service Function nodes is in `callNodes.ts`;
 * this file is Lune's catalogue's side of it.
 */

import {
	argumentPin,
	type CallSpelling,
	callLabelOf,
	execPin,
	memberOf,
	ownerOf,
	splitCallText,
} from "./callNodes.js";
import { LUNE_MODULES, type LuneFunction, type LuneParam } from "./luneApi.js";
import type { NodeConfig, PinDef } from "./schema.js";

/** The node ids, named because the emitter and the menu both test for them. */
export const LUNE_CALL = "lune.call";
export const LUNE_VALUE = "lune.value";

const BY_ALIAS = new Map(LUNE_MODULES.map((module) => [module.alias, module]));

function functionsOf(alias: string): readonly LuneFunction[] {
	return BY_ALIAS.get(alias)?.functions ?? [];
}

export function luneFunction(
	alias: string | undefined,
	name: string | undefined,
): LuneFunction | undefined {
	if (!alias || !name) return undefined;
	return functionsOf(alias).find((one) => one.name === name);
}

/** What a module is required as: `@lune/fs`. */
export const specifierFor = (alias: string): string => `@lune/${alias}`;

/** How a Lune Function stores and writes its call: `fs.readFile`. */
const LUNE_SPELLING: CallSpelling = {
	ownerKey: "module",
	memberKey: "call",
	defaultOwner: "fs",
	separator: ".",
};

export function moduleOf(c: NodeConfig | undefined): string {
	return ownerOf(LUNE_SPELLING, c);
}

export function callOf(c: NodeConfig | undefined): string | undefined {
	return memberOf(LUNE_SPELLING, c);
}

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
		return argumentPin({
			index,
			name: variadic ? "Arguments" : param.name,
			type: pinTypeFor(param.type),
			optional: param.optional || variadic,
			description: describe(param),
		});
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

/** The pins of a Lune Function node, for either shape. */
export function lunePins(
	c: NodeConfig | undefined,
	pure: boolean,
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
		inputs: [execPin("in"), ...args],
		outputs: [execPin("then"), ...(result ? [result] : [])],
	};
}

/** `fs.readFile`, for a node's header. */
export function callLabel(c: NodeConfig | undefined): string | undefined {
	return callLabelOf(LUNE_SPELLING, c);
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

/** Every call the catalogue knows, as the picker lists them: `fs.readFile`. */
export const LUNE_CALL_OPTIONS: string[] = LUNE_MODULES.flatMap((module) =>
	module.functions.map((fn) => `${module.alias}.${fn.name}`),
);

/** The two halves of `fs.readFile`. */
export function splitLuneCall(text: string): { module: string; call: string } | undefined {
	const split = splitCallText(LUNE_SPELLING, text);
	return split && { module: split.owner, call: split.member };
}

/**
 * What the picker shows under the highlighted row.
 *
 * The signature, then what it gives back, then whether it is a value or a step
 * — because which of the two nodes you are about to get is the thing a reader
 * cannot see from the name, and `fs.readFile` versus `fs.writeFile` is exactly
 * the pair where it matters.
 */
export function luneCallDetail(text: string): string {
	const split = splitLuneCall(text);
	const fn = split && luneFunction(split.module, split.call);
	if (!fn) return "";
	const params = fn.params
		.map((param) => (param.optional ? `${param.name}?` : param.name))
		.join(", ");
	const gives = fn.returns === "" ? "no result" : fn.returns;
	return `${fn.name}(${params})  ›  ${gives}  ›  ${isValueCall(fn) ? "a value" : "a step"}`;
}

/** The specifier a chosen call needs declared, for the Inspector to offer. */
export function requiredSpecifier(c: NodeConfig | undefined): string {
	return specifierFor(moduleOf(c));
}
