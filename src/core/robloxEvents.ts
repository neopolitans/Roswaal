/**
 * An instance's events, from the engine catalogue: what On Event offers for a
 * class, and the parameters its handler receives.
 *
 * A class has its own events and every ancestor's -- a `Part` fires `Touched`
 * because `BasePart` does -- so a class's list walks up its superclasses. The
 * parameter types are written the way the engine's documentation writes them
 * (`int`, `Array`, an enum's bare name), and are turned into the Luau types a
 * handler's parameters are declared with.
 */

import { type MemberLookup, typeInto } from "./members.js";
import { ENGINE, type EngineEvent } from "./robloxEngine.js";

/** One parameter of an event's handler, typed as Luau writes it. */
export interface EventParam {
	name: string;
	type: string;
}

/** An event an instance of some class fires. */
export interface InstanceEvent {
	name: string;
	/** The first sentence of the engine's description. */
	summary: string;
	/** The class that declares it, which may be an ancestor of the one asked about. */
	owner: string;
	params: EventParam[];
}

/**
 * The class and its ancestors, nearest first, as the catalogue records them.
 *
 * Bounded rather than trusting the data: a cycle in a generated file would
 * otherwise hang the editor. Thirty-two is several times the deepest the
 * engine's hierarchy has been.
 */
function ancestry(className: string): string[] {
	const chain: string[] = [];
	let at: string | undefined = className;
	while (
		at !== undefined &&
		ENGINE.classes[at] !== undefined &&
		chain.length < 32 &&
		!chain.includes(at)
	) {
		chain.push(at);
		at = ENGINE.classes[at].superclass;
	}
	return chain;
}

/**
 * Every event an instance of `className` fires, its own first, then its
 * ancestors'. Deprecated events are left out: they still fire, but nothing
 * new should be built on one. An unknown class has none.
 */
export function eventsOf(className: string | undefined): InstanceEvent[] {
	if (!className) return [];
	const out: InstanceEvent[] = [];
	const seen = new Set<string>();
	for (const owner of ancestry(className)) {
		for (const event of ENGINE.classes[owner].events) {
			if (event.deprecated || seen.has(event.name)) continue;
			seen.add(event.name);
			out.push(describe(owner, event));
		}
	}
	return out;
}

/** One event of a class, inherited ones included, or undefined. */
export function eventOf(
	className: string | undefined,
	eventName: string,
): InstanceEvent | undefined {
	if (!className) return undefined;
	for (const owner of ancestry(className)) {
		const event = ENGINE.classes[owner].events.find((e) => e.name === eventName);
		if (event) return describe(owner, event);
	}
	return undefined;
}

/**
 * The class of the instance wired into a node's pin, or undefined when nothing
 * is wired or the wire says no more than `Instance` might be nil.
 */
export function instanceClassInto(
	lookup: MemberLookup,
	nodeId: string,
	pinId: string,
): string | undefined {
	const type = typeInto(lookup, nodeId, pinId)?.replace(/\?$/, "");
	return type !== undefined && ENGINE.classes[type] !== undefined ? type : undefined;
}

/**
 * The event a Connect Event or Connect Once node's signal is, when the signal
 * comes from Get Event on an instance whose class the graph knows. Undefined
 * otherwise: a signal from anywhere else says nothing about its parameters.
 */
export function signalEventOf(lookup: MemberLookup, nodeId: string): InstanceEvent | undefined {
	const link = lookup.script.links.find((l) => l.to.node === nodeId && l.to.pin === "signal");
	const from = link && lookup.script.nodes.find((n) => n.id === link.from.node);
	if (from?.def !== "roblox.getEvent") return undefined;
	const named =
		from.literals?.event ??
		lookup.registry.get(from.def)?.inputs.find((p) => p.id === "event")?.default;
	if (named?.t !== "string") return undefined;
	return eventOf(instanceClassInto(lookup, from.id, "instance"), named.v.trim());
}

function describe(owner: string, event: EngineEvent): InstanceEvent {
	return {
		name: event.name,
		summary: event.summary,
		owner,
		params: event.params.map((p, i) => ({
			name: p.name || `arg${i + 1}`,
			type: luauTypeOf(p.type),
		})),
	};
}

/** The engine documentation's names for a number, a boolean and a string. */
const NUMBERS = new Set(["int", "int64", "float", "double", "number", "User"]);
const STRINGS = new Set(["string", "Content", "ContentId", "BinaryString", "ProtectedString"]);
const LISTS = new Set(["Array", "Objects", "Instances", "List"]);
const MAPS = new Set(["Dictionary", "Map"]);

/**
 * A type as the engine's documentation writes it, as Luau writes it.
 *
 * `int` and its kin are `number`; a list is `{ any }` and a dictionary
 * `{ [any]: any }`, since the documentation does not say what they hold; an
 * enum is `Enum.<name>`. A class or a datatype is itself. Anything else,
 * `Variant` and `Tuple` included, is `any`, which claims nothing it cannot
 * keep. A trailing `?` survives: the value may be nil.
 */
export function luauTypeOf(engineType: string): string {
	const raw = engineType.trim();
	const optional = raw.endsWith("?");
	const name = (optional ? raw.slice(0, -1) : raw).replace(/<.*$/, "").trim();
	const base = baseType(name);
	return optional && base !== "any" ? `${base}?` : base;
}

function baseType(name: string): string {
	if (NUMBERS.has(name)) return "number";
	if (name === "bool" || name === "boolean") return "boolean";
	if (STRINGS.has(name)) return "string";
	if (LISTS.has(name)) return "{ any }";
	if (MAPS.has(name)) return "{ [any]: any }";
	if (ENGINE.enums[name] !== undefined) return `Enum.${name}`;
	if (ENGINE.classes[name] !== undefined || ENGINE.datatypes[name] !== undefined) return name;
	return "any";
}
