/**
 * Calling a method on a Roblox service.
 *
 * `RunService:IsServer()` is one of the first things a Roblox script does and
 * had no node: the library covers the calls somebody thought to write a node
 * for, which is a list that can never catch up with an engine of six hundred
 * classes. So the *catalogue* does the work — `robloxMembers.ts`, generated from
 * Roblox's own documentation — and two nodes read it.
 *
 * ## Two nodes, not six hundred
 *
 * One definition per method would put three hundred entries in the palette,
 * three hundred pages in the node reference, and a release of Roswaal between a
 * developer and every method Roblox shipped last month. Instead there is one
 * node for a call that *does* something and one for a call that *answers*
 * something, both set to a call you pick — and the palette still lists every
 * method by name, because `serviceMenuItems` puts them there. Searching for
 * "IsServer" finds it; what the menu hands over is a configured node.
 *
 * ## Why the pins are derived rather than variadic
 *
 * Call Method already exists and takes an object, a name and an argument count
 * you set yourself. That is the honest node for a method nothing knows about,
 * and it stays. Knowing the signature is what makes this one worth having: the
 * arguments arrive named and typed, the optional ones are marked optional, and
 * the result pin is the type the method actually returns rather than `any`.
 *
 * A method the catalogue has never heard of still works. The picker commits
 * whatever is typed, and a node whose method is unknown falls back to the
 * argument count in its config, exactly as Call Method does.
 */

import { ROBLOX_SERVICES } from "./roblox.js";
import { SERVICE_METHODS, type ServiceMethod } from "./robloxMembers.js";
import type { Literal, NodeConfig, PinDef } from "./schema.js";

/** The node ids, named because the emitter and the menu both test for them. */
export const SERVICE_CALL = "roblox.serviceCall";
export const SERVICE_VALUE = "roblox.serviceValue";

/** Services with at least one method to offer, in the order Get Service uses. */
export const SERVICES_WITH_METHODS: string[] = ROBLOX_SERVICES.filter(
	(name) => (SERVICE_METHODS[name]?.length ?? 0) > 0,
);

export function methodsOfService(service: string): readonly ServiceMethod[] {
	return SERVICE_METHODS[service] ?? [];
}

export function serviceMethod(
	service: string | undefined, method: string | undefined,
): ServiceMethod | undefined {
	if (!service || !method) return undefined;
	return methodsOfService(service).find((m) => m.name === method);
}

const config = (c: NodeConfig | undefined, key: string): string | undefined => {
	const value = (c as Record<string, unknown> | undefined)?.[key];
	return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
};

export const serviceOf = (c: NodeConfig | undefined): string => config(c, "service") ?? "RunService";
export const methodOf = (c: NodeConfig | undefined): string | undefined => config(c, "method");

/**
 * The argument pin ids, which are positional.
 *
 * `a0`, `a1`, … the same as every other call node, so the emitter's existing
 * rule for folding arguments applies unchanged — and so a literal typed into
 * argument two stays on argument two when a method is renamed underneath it.
 * Naming them after the documented parameter would be prettier and would lose
 * the value the day Roblox renames `userId` to `user`.
 */
export const argPinId = (index: number): string => `a${index}`;

/**
 * A starting value for an argument, where there is an obvious one.
 *
 * Strings, numbers and booleans get one: the pin is then a field you type in,
 * which is what an argument of that kind almost always is. Everything else —
 * an Instance, a table, a Vector3 — gets none, so an unwired one is an error
 * that names the pin rather than a silent `nil` passed to the engine.
 */
function defaultFor(type: string): Literal | undefined {
	if (type === "string") return { t: "string", v: "" };
	if (type === "number") return { t: "number", v: 0 };
	if (type === "boolean") return { t: "boolean", v: false };
	return undefined;
}

const exec = (id: string, name = ""): PinDef => ({ id, name, kind: "exec" });

/** A method's arguments as pins, in order. */
export function argumentPins(method: ServiceMethod): PinDef[] {
	return method.params.map((param, index) => {
		const type = param.enum ? "string" : param.type || "any";
		const pin: PinDef = {
			id: argPinId(index),
			name: param.name,
			kind: "data",
			type,
			default: param.enum ? { t: "string", v: "" } : defaultFor(type),
		};
		if (param.optional) pin.optional = true;
		if (param.enum) {
			pin.description = `An ${param.enum} value, by name — ${param.summary ?? "Enum." + param.enum}`;
		} else if (param.summary) {
			pin.description = param.summary;
		}
		return pin;
	});
}

/** Argument pins for a method nothing is known about: as many as asked for. */
function unknownArgPins(c: NodeConfig | undefined): PinDef[] {
	const raw = (c as { args?: unknown } | undefined)?.args;
	const count = typeof raw === "number" && raw >= 0 ? Math.min(Math.floor(raw), 12) : 0;
	return Array.from({ length: count }, (_unused, i) => ({
		id: argPinId(i),
		name: `Argument ${i + 1}`,
		kind: "data" as const,
		type: "any",
		default: { t: "nil" } as Literal,
	}));
}

/**
 * The pins of a Service Function node, for the call it is set to.
 *
 * The service and the method are **config rather than pins**, which is the one
 * structural decision here. They have to be, because the arguments are derived
 * from them and `derivePins` is handed a node's config and not its literals —
 * but it is also the right shape: they are two names that decide what the node
 * *is*, and a node whose identity is two of its own input pins reads as a node
 * missing its wires.
 *
 * `pure` is the node rather than the method: a method the catalogue calls
 * read-only still gets an execution wire when it was dropped on the impure
 * node, because which node you placed is a decision you made.
 */
export function servicePins(
	c: NodeConfig | undefined, pure: boolean,
): { inputs: PinDef[]; outputs: PinDef[] } {
	const method = serviceMethod(serviceOf(c), methodOf(c));

	const inputs: PinDef[] = [
		...(pure ? [] : [exec("in")]),
		...(method ? argumentPins(method) : unknownArgPins(c)),
	];

	// A method returning nothing has no result pin at all, rather than one that
	// can only ever be nil. A method nobody has heard of keeps one: `any` is
	// what is honestly known about it.
	const returns = method ? method.returns : "any";
	const outputs: PinDef[] = [
		...(pure ? [] : [exec("then")]),
		...(returns === "" ? [] : [{
			id: "result", name: pure ? "" : "Result", kind: "data" as const, type: returns,
		}]),
	];

	return { inputs, outputs };
}

/**
 * The call, written the way it will appear in the file: `RunService:IsServer`.
 *
 * One string is what the picker offers, what the node's subtitle shows and what
 * a menu entry is named, so it is built in one place.
 */
export function callLabel(c: NodeConfig | undefined): string | undefined {
	const method = methodOf(c);
	return method ? `${serviceOf(c)}:${method}` : undefined;
}

/** Every call the catalogue knows, as the picker lists them. */
export const CALL_OPTIONS: string[] = SERVICES_WITH_METHODS.flatMap((service) =>
	methodsOfService(service).map((method) => `${service}:${method.name}`),
);

/** The service half of a `Service:Method` string; the whole of it is the call. */
export function splitCall(text: string): { service: string; method: string } | undefined {
	const at = text.indexOf(":");
	if (at <= 0) return undefined;
	const service = text.slice(0, at).trim();
	const method = text.slice(at + 1).replace(/\(.*\)$/, "").trim();
	if (service === "" || method === "") return undefined;
	return { service, method };
}

/** What the picker shows under the highlighted row: the method's own summary. */
export function callDetail(text: string): string {
	const split = splitCall(text);
	const method = split && serviceMethod(split.service, split.method);
	if (!method) return "";
	const signature = method.params.map((p) => p.name).join(", ");
	const yields = method.yields ? "  ›  yields" : "";
	return `${method.name}(${signature})  ›  ${method.returns || "no result"}${yields}`;
}

/** The subtitle under the node's title: the call it will write. */
export function serviceSubtitle(c: NodeConfig | undefined): string | undefined {
	const label = callLabel(c);
	return label ? `${label}()` : undefined;
}

/** One menu entry per method, so searching for a method name finds it. */
export interface ServiceMenuItem {
	service: string;
	method: ServiceMethod;
	/** Which of the two nodes to place. */
	defId: string;
	config: NodeConfig;
}

export function serviceMenuItems(): ServiceMenuItem[] {
	const out: ServiceMenuItem[] = [];
	for (const service of SERVICES_WITH_METHODS) {
		for (const method of methodsOfService(service)) {
			out.push({
				service,
				method,
				defId: method.pure ? SERVICE_VALUE : SERVICE_CALL,
				config: { service, method: method.name },
			});
		}
	}
	return out;
}
