/**
 * The pure builtin nodes: what a variable, local, parameter, function, module,
 * service or path read resolves to where it is read.
 *
 * Functions of the `Emitter` they write through; see `emitter.ts`.
 */

import { checkSpecifier } from "../modules.js";
import { signatureOf } from "../nodes/flow.js";
import {
	functionRefOf, localRefOf, moduleRefOf, paramRefOf, variableRefOf,
} from "../nodes/variables.js";
import { lastSegment, renderPath } from "../roblox.js";
import { luneCall, serviceCall } from "./emitCalls.js";
import {
	claimModuleName, PROVIDED_GLOBALS, resolveRoot, specifierName,
} from "./emitDeclarations.js";
import type { Scope } from "./emitScope.js";
import type { Emitter } from "./emitter.js";
import type { ResolvedNode } from "./graph.js";
import { quoteString, toIdentifier } from "./luau.js";

/**
 * Pure builtins whose expression is a call: a Service Function (Value) and a
 * Lune Function (Value). Read twice, a call runs twice, so these are bound to
 * a local by the rule every pure expression follows.
 */
export const CALLING_BUILTINS = new Set(["service.call", "lune.value"]);

/**
 * Warns when a client-only node is used somewhere it will be nil.
 *
 * `Players.LocalPlayer` is not an error on the server — it is `nil`, and the
 * failure surfaces later as "attempt to index nil", a long way from the node
 * that caused it. Saying so at compile time is the whole value.
 *
 * A warning rather than an error, because a ModuleScript can legitimately be
 * written for the client and Roswaal cannot tell where it will be required.
 */
export function requireClient(e: Emitter, r: ResolvedNode, title: string): void {
	if (e.script.scriptClass === "LocalScript") return;
	const where =
		e.script.scriptClass === "ModuleScript"
			? "a ModuleScript, so this is only correct if it is required from the client"
			: "a Script, which runs on the server, where it is always nil";
	e.warn(`"${title}" is client-only. This graph is ${where}.`, r.node.id);
}

export function pureBuiltin(
	e: Emitter, handler: string, src: ResolvedNode, consumer: ResolvedNode, scope: Scope,
): string {
	switch (handler) {
		case "flow.reroute":
			// Passes its input through untouched, and is deliberately never
			// hoisted: a knot that bound a local would stop being invisible.
			return e.resolveInput(src, e.pin(src, "in", "in"), scope);

		case "variable.get": {
			const ref = variableRefOf(src.node.config);
			const ident = ref.variable ? e.variableNames.get(ref.variable) : undefined;
			// No variable, or one that is gone: `validate` reports it, for every
			// node rather than only those the walk reaches.
			if (!ref.variable || !ident) return "nil";
			// Reading a variable whose declaration has not been emitted yet.
			// Only reachable when an Initialize Variable node owns it, since
			// everything else is declared before the first line of flow — and
			// the usual way in is a function defined above the initialisation
			// that reads it. Luau would take the name for a global and hand
			// back nil for the life of the script.
			if (e.initialisedLater.has(ref.variable) && !e.declaredSoFar.has(ref.variable)) {
				e.error(
					`"${ref.name ?? "That variable"}" is read here, before the Initialize Variable ` +
					"node that declares it. Move the initialisation earlier, or give the " +
					"variable a value in the variables panel and use Set Variable.",
					src.node.id,
				);
				return "nil";
			}
			return ident;
		}

		// Only Make Dictionary can read a pair, from inside `$pairs`. Reaching
		// here means something else was handed one.
		case "table.pair":
			e.error(
				"A Key Value Pair is one entry of a table, so it only goes into Make Dictionary.",
				src.node.id,
			);
			return "nil";

		// A parameter of the function or handler this node sits inside.
		//
		// The same shape as Get Local, against a key three binders already
		// write: `function.entry`, `function.declareHere` and `event.connect`
		// each bind `${id}/p${i}` into the body's own scope before walking it.
		// So "this node has to be inside the body" is not a rule implemented
		// here — it is what the scope chain already means, and a node outside
		// simply finds nothing and is told so.
		//
		// Looked up by name and resolved to an index, because the name is what
		// the node stores: see `ParamRef`. A function that is gone, or no
		// longer has the parameter, is `validate`'s to report.
		case "function.getParam": {
			const ref = paramRefOf(src.node.config);
			const owner = ref.function ? e.index.get(ref.function) : undefined;
			if (!ref.function || !owner) return "nil";

			const signature = signatureOf(owner.node.config);
			const index = (signature.params ?? []).findIndex((p) => p.name === ref.param);
			if (index === -1) return "nil";

			const bound = scope.lookup(`${ref.function}/p${index}`);
			if (bound) return bound;
			const owning = signature.name || owner.node.label || "that function";
			e.error(
				`"${ref.param}" is a parameter of "${owning}", and this node is not inside its ` +
				"body. A parameter exists only where the function runs — wire this into " +
				"something on the function's Body, or use a variable for a value the whole " +
				"script reads.",
				src.node.id,
			);
			return "nil";
		}

		// The local a Declare Local bound, looked up in the reader's scope.
		//
		// The same lookup a wire from Declare Local's output gets, so the two
		// cannot disagree about where a local exists: after its declaration,
		// inside the block that made it and anything nested in that block — a
		// branch, a loop, a function declared further down.
		case "local.get": {
			const ref = localRefOf(src.node.config);
			const declared = ref.local ? e.index.get(ref.local) : undefined;
			if (!ref.local || declared?.def.id !== "local.declare") {
				e.error(
					ref.local
						? "Get Local points at a Declare Local that is no longer in this graph."
						: "Get Local has no local chosen.",
					src.node.id,
				);
				return "nil";
			}
			const bound = scope.lookup(`${ref.local}/ref`);
			if (bound) return bound;
			e.error(
				`"${ref.name ?? "That local"}" is not in scope here. A local exists after its ` +
				"Declare Local runs, and only inside the block that declared it. For a value the " +
				"whole script reads, use a variable.",
				src.node.id,
			);
			return "nil";
		}

		// Both reach the Players service themselves, through the same hoisting
		// as Get Service — so a graph using either still gets exactly one
		// `local Players = game:GetService("Players")` at the top, shared with
		// any Get Service node that also asked for it.
		case "players.localPlayer":
			requireClient(e, src, "Local Player");
			return `${resolveRoot(e, "Players")}.LocalPlayer`;

		case "players.localCharacter":
			requireClient(e, src, "Local Character");
			return `${resolveRoot(e, "Players")}.LocalPlayer.Character`;

		case "service.call":
			return serviceCall(e, src, scope);

		case "service.get": {
			const link = e.index.sourceOf(src.node.id, "service");
			if (link) {
				e.error(
					"Get Service needs the service typed in, not wired: the name becomes a variable in " +
						"the generated file, so it has to be known before the script runs.",
					src.node.id,
					"service",
				);
				return "nil";
			}

			const name = e.literalText(src, "service");
			if (name === "") {
				e.error("Get Service has no service name.", src.node.id, "service");
				return "nil";
			}
			// One local per distinct service, however many nodes ask for it.
			// A name not on the built-in list still works: the list is a
			// dropdown, not a gate.
			if (e.options.inline) return `game:GetService(${quoteString(name)})`;
			const existing = e.services.get(name);
			if (existing) return existing;
			const ident = e.names.uniqueForFile(name, "service");
			e.services.set(name, ident);
			return ident;
		}

		case "instance.path": {
			const root = e.literalText(src, "root");
			const path = e.literalText(src, "path");
			if (root === "") {
				e.error("Instance has no starting point chosen.", src.node.id, "root");
				return "nil";
			}
			// Inline, not hoisted: indexing is cheap, and the ordinary
			// multi-consumer rule already binds it to a local when it is read
			// more than once.
			return renderPath(resolveRoot(e, root), path);
		}

		/**
		 * Require at Top: a literal specifier, hoisted below the services.
		 *
		 * The generalisation of Require Module, which is Roblox-only and
		 * builds an *instance* path. This one writes whatever string you
		 * give it, because the two runtimes resolve different things and
		 * the set is still moving -- `@lune/fs`, `@game/…`, `./sibling`.
		 *
		 * Keyed by the specifier, so requiring the same module from two
		 * nodes gives one local, exactly as Require Module does.
		 */
		case "module.requireTop": {
			const specifier = e.literalText(src, "specifier").trim();
			if (specifier === "") {
				e.error("Require at Top has no module to require.", src.node.id, "specifier");
				return "nil";
			}

			const wrong = checkSpecifier(specifier, e.script.target, e.options.specifiers);
			if (wrong?.severity === "error") {
				e.error(wrong.message, src.node.id, "specifier");
			} else if (wrong) {
				e.warn(wrong.message, src.node.id, "specifier");
			}
			if (e.options.inline) return `require(${quoteString(specifier)})`;

			const key = `top:${specifier}`;
			const existing = e.requires.get(key);
			if (existing) return existing.ident;

			/**
			 * A name typed into `As` is taken verbatim; a derived one is made
			 * unique.
			 *
			 * The two are different claims. Nobody chose the default, so
			 * renaming it to `util2` when something already has `util` costs
			 * nothing — but a name somebody typed is the one they meant, and
			 * quietly handing back a different one leaves the node saying
			 * `util` and the file saying `util2`.
			 */
			const chosen = e.literalText(src, "as").trim();
			const ident = chosen === ""
				? e.names.uniqueForFile(specifierName(specifier) || "module", "module")
				: toIdentifier(chosen);
			if (chosen !== "") {
				const shadows = PROVIDED_GLOBALS.includes(ident);
				if (!shadows && !e.moduleClaims.has(ident) && e.names.isTaken(ident)) {
					e.error(
						`Require at Top binds "${ident}", which already names something else in ` +
							"this file. Give the module another name in As.",
						src.node.id,
						"as",
					);
					return "nil";
				}
				if (!claimModuleName(e, ident, specifier, src.node.id)) return "nil";
				if (shadows) {
					e.warn(
						`Require at Top binds "${ident}", which shadows something Luau provides. ` +
							"Everything below it in this file sees the module rather than the global.",
						src.node.id,
						"as",
					);
				}
			}
			e.requires.set(key, { ident, expression: quoteString(specifier) });
			return ident;
		}

		/**
		 * Get Module: the pill for something the script declares.
		 *
		 * It resolves rather than requires. `declareModules` has already
		 * registered every declaration and bound it to a local, so this is
		 * a lookup -- which is why four uses of one module are four pills
		 * and one require.
		 */
		case "lune.call":
		case "lune.value":
			return luneCall(e, src, scope);

		case "module.get": {
			const { module: id = "", name = "" } = moduleRefOf(src.node.config);
			const ident = e.moduleIdents.get(id);
			if (ident) return ident;
			e.error(
				id === ""
					? "Get Module has no module chosen."
					: `"${name || "That module"}" is not declared by this script any more. ` +
						"Declare it in the Variables panel, or point this at one that is.",
				src.node.id,
			);
			return "nil";
		}

		case "module.requirePath": {
			const root = e.literalText(src, "root");
			const path = e.literalText(src, "path");
			if (root === "" || path === "") {
				e.error(
					"Require Module needs both a starting point and a path.",
					src.node.id,
					path === "" ? "path" : "root",
				);
				return "nil";
			}

			if (e.options.inline) return `require(${renderPath(resolveRoot(e, root), path)})`;
			// One local per distinct module, however many nodes require it.
			const key = `${root}/${path}`;
			const existing = e.requires.get(key);
			if (existing) return existing.ident;

			const hint = e.literalText(src, "as") || lastSegment(path) || "module";
			const ident = e.names.uniqueForFile(hint, "module");
			e.requires.set(key, {
				ident,
				expression: renderPath(resolveRoot(e, root), path),
			});
			return ident;
		}

		case "function.get": {
			const ref = functionRefOf(src.node.config);
			const ident = ref.function ? e.functionNames.get(ref.function) : undefined;
			if (ident) return ident;
			// A hoisted function is named before anything is emitted, so a
			// missing name means the node is gone, which `validate` reports --
			// except for Declare Function, which is named where it sits. Reading
			// one above its own declaration is a real mistake with a different
			// fix, and only the walk can see it.
			const target = ref.function ? e.index.get(ref.function) : undefined;
			if (target?.def.id === "function.declareHere") {
				e.error(
					`"${signatureOf(target.node.config).name || "That function"}" is declared ` +
						"further down the flow than this, so it does not exist yet. Move the " +
						"Declare Function above this, or use the hoisted Function node.",
					src.node.id,
				);
			}
			return "nil";
		}

		default:
			e.error(
				`"${consumer.def.title}" reads "${src.def.title}", which has no value to give.`,
				src.node.id,
			);
			return "nil";
	}
}
