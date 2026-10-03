/**
 * Calls on the execution chain: a template call node, Call Function and Call
 * Method, and the Service and Lune Function nodes, with how each binds its
 * result.
 *
 * Functions of the `Emitter` they write through; see `emitter.ts`.
 */

import { argPinId } from "../callNodes.js";
import { callOf, luneFunction, moduleOf, specifierFor } from "../luneCalls.js";
import { LUAU_PRIMITIVES } from "../luneTypes.js";
import { isInstanceClass as isRobloxClass, isSubclassOf } from "../roblox.js";
import { DATATYPES } from "../robloxData.js";
import type { NodeConfig, PinDef } from "../schema.js";
import { methodOf, serviceMethod, serviceOf } from "../serviceCalls.js";
import { luauType, resolveRoot } from "./emitDeclarations.js";
import { VARIADIC_PIN, type Scope } from "./emitScope.js";
import { callArguments, renderTemplate } from "./emitTemplates.js";
import type { Emitter } from "./emitter.js";
import type { ResolvedNode } from "./graph.js";
import { isCallExpression, parenPrefix, toIdentifier } from "./luau.js";

/** Statements that name the value on their `value` pin. See `foldsInto`. */
export const STATEMENT_READERS = new Set(["local.declare", "local.set", "variable.set", "variable.init"]);

/**
 * The call a Service Function node writes: `RunService:IsServer()`.
 *
 * The service goes through `resolveRoot`, so a graph that calls two methods
 * on RunService and also has a Get Service for it ends up with one
 * `local RunService = game:GetService("RunService")` at the top and three
 * readers — which is the file somebody would have written.
 *
 * The service and the method are typed in rather than wired for the reason
 * Get Service's name is: both become text in the generated file, so they have
 * to be known before the script runs.
 */
/**
 * A call into Lune's standard library, as an expression.
 *
 * Shared by both switches for the reason `serviceCall` is: the value node
 * returns it and the step node binds it, and the call itself is written
 * once. Two copies would be two places for the argument rule to drift.
 *
 * The node never writes its own `require`. That is the rule the whole module
 * design rests on, and `@lune/fs` being Lune's own and always available is
 * not an exception to it — a file that quietly gained a require because
 * somebody dropped a node is a file whose dependencies are not what its
 * author can see.
 */
export function luneCall(e: Emitter, src: ResolvedNode, scope: Scope): string {
	const alias = moduleOf(src.node.config);
	const call = callOf(src.node.config);
	if (call === undefined) {
		e.error("This Lune Function has no call chosen.", src.node.id);
		return "nil";
	}

	const specifier = specifierFor(alias);
	const ident = e.moduleBySpecifier.get(specifier.toLowerCase());
	if (ident === undefined) {
		// The specifier, not a description of the problem: it is what gets
		// typed into the panel to fix e.
		e.error(
			`This calls \`${alias}.${call}\`, and nothing in this script requires ` +
			`\`${specifier}\`. Declare it in the Variables panel — Roswaal will not add a ` +
			"require you did not ask for.",
			src.node.id,
		);
		return "nil";
	}

	const fn = luneFunction(alias, call);
	const pins = Array.from({ length: fn?.params.length ?? 0 }, (_unused, i) => e.pin(src, argPinId(i), "in"));
	const args = callArguments(e, src, pins, (pin) => e.resolveInput(src, pin, scope));
	return `${ident}.${call}(${args.join(", ")})`;
}

export function serviceCall(e: Emitter, r: ResolvedNode, scope: Scope): string {
	const id = r.node.id;
	const service = serviceOf(r.node.config);
	const name = methodOf(r.node.config) ?? "";
	if (name === "") {
		e.error(
			`"${r.def.title}" has no call chosen. Pick one in the Inspector — the service and ` +
				"the method become text in the generated file, so they are set on the node " +
				"rather than wired into it.",
			id,
		);
		return "nil";
	}

	const known = serviceMethod(service, name);
	const pins = r.inputs.filter((p) => VARIADIC_PIN.test(p.id));
	const args = callArguments(e, r, pins, (pin, index) =>
		serviceArgument(e, r, pin, scope, known?.params[index]?.enum));
	return `${serviceReceiver(e, r, service, scope)}:${toIdentifier(name, "method")}(${args.join(", ")})`;
}

/**
 * What the call is made on: the wire if there is one, the service if not.
 *
 * Unwired is the ordinary case and reads as the hand-written line does —
 * `RunService:IsServer()`, with the service hoisted. A wire is for the
 * gesture that drags a service out and asks it for a method, and it wins
 * outright: the value on the pin is the object being called.
 *
 * A wire of a class that is not the service being called is worth saying out
 * loud — a Humanoid on a `Debris:AddItem` is a runtime error with a node's
 * name on it — but only as a warning, because the pin is typed `Instance`
 * and a value narrowed elsewhere may be exactly right.
 */
function serviceReceiver(e: Emitter, r: ResolvedNode, service: string, scope: Scope): string {
	const link = e.index.sourceOf(r.node.id, "service");
	if (!link) return resolveRoot(e, service);

	const from = e.index.get(link.from.node);
	const type = from?.outputs.find((p) => p.id === link.from.pin)?.type;
	if (type && type !== "Instance" && isRobloxClass(type) && !isSubclassOf(type, service)) {
		e.warn(
			`This wire carries a ${type}, and the call is a ${service} method. It will run on ` +
				"whatever is wired, so this is only right if the value really is that service.",
			r.node.id,
			"service",
		);
	}
	return parenPrefix(e.resolveInput(r, e.pin(r, "service", "in"), scope));
}

/**
 * One argument, with the enum ones written out.
 *
 * An enum argument is typed as its member name — `E`, `Begin` — because that
 * is what somebody has in mind, and `Enum.KeyCode.E` is what Luau wants. A
 * wire wins over the name: the value then comes from the graph and is already
 * whatever it is.
 */
function serviceArgument(
	e: Emitter, r: ResolvedNode, pin: PinDef, scope: Scope, enumName: string | undefined,
): string {
	if (!enumName || e.index.sourceOf(r.node.id, pin.id)) {
		return e.resolveInput(r, pin, scope);
	}
	const member = e.literalText(r, pin.id);
	if (member === "") {
		e.error(
			`"${pin.name || pin.id}" needs an Enum.${enumName} value, by name.`,
			r.node.id,
			pin.id,
		);
		return "nil";
	}
	return `Enum.${enumName}.${toIdentifier(member, "value")}`;
}

export function emitCall(e: Emitter, r: ResolvedNode, template: string, resultPin: string, scope: Scope): string | undefined {
	return writeCall(e, r, renderTemplate(e, r, template, scope), resultPin, scope);
}

/**
 * A call on the execution chain, with its result bound for whoever reads it.
 *
 * Every step that returns a value comes through here: a template call node,
 * Call Function and Call Method, and the Service and Lune Function steps. So
 * all of them name the local the same way, annotate it the same way and fold
 * into the next statement the same way. `fallback` names the local when
 * nothing on the node does, ahead of the pin's own name. `typed: false`
 * leaves the annotation off, for a result whose type is not a name in scope.
 */
export function writeCall(
	e: Emitter, r: ResolvedNode, rendered: string, resultPin: string, scope: Scope,
	how: { fallback?: string; typed?: boolean } = {},
): string | undefined {
	const fallback = how.fallback;
	const pin = r.baseOutputs.find((p) => p.id === resultPin);
	const consumed = e.index.readerCount(r.node.id, resultPin, { parts: true }) > 0;
	const next = e.index.execTarget(r.node.id, "then");

	// A step whose one reader is the very next statement is written into it:
	// `local copy = model:Clone()`, not a local and then a copy of it. Only
	// the next statement, and only a Declare Local or a setter, so the call
	// still runs exactly where it did — nothing else happens in between.
	const reader = consumed ? e.foldsInto(r.node.id, resultPin) : undefined;
	if (reader && reader.node.id === next && STATEMENT_READERS.has(reader.def.id)) {
		scope.bindings.set(`${r.node.id}/${resultPin}`, rendered);
		return next;
	}

	if (consumed) {
		const ident = e.names.unique(resultHint(r, pin, fallback), fallback ?? "value");
		const annotation = e.annotates && how.typed !== false && pin?.type && pin.type !== "any"
			? `: ${luauType(pin.type)}${pin.nilable ? "?" : ""}`
			: "";
		e.push(`local ${ident}${annotation} = ${rendered}`, r.node.id);
		scope.bindings.set(`${r.node.id}/${resultPin}`, ident);
	} else if (isCallExpression(rendered)) {
		e.push(rendered, r.node.id);
	} else {
		// A bare expression is not a statement in Luau, so bind and discard.
		e.push(`local ${e.names.temp()} = ${rendered}`, r.node.id);
	}
	return next;
}

/** Whether a type is a name Luau knows in every Roblox file. */
export function isRobloxTypeName(type: string): boolean {
	return LUAU_PRIMITIVES.includes(type) || isRobloxClass(type) || DATATYPES.includes(type);
}

/** The name typed for a node's result, if one was. */
export function resultNameOf(config: NodeConfig | undefined): string | undefined {
	const named = config?.resultName;
	return typeof named === "string" && named !== "" ? named : undefined;
}

/**
 * What to call the local a node's result lands in.
 *
 * `resultName` first, which is the field that says so. The label is still
 * honoured behind it: it named results before there was a field for it, and a
 * graph built that way should go on emitting what it always did. Then the
 * caller's fallback, the pin's own name and the node's title.
 */
export function resultHint(r: ResolvedNode, pin: PinDef | undefined, fallback?: string): string {
	return resultNameOf(r.node.config) || r.node.label || fallback || pin?.name || r.def.title;
}
