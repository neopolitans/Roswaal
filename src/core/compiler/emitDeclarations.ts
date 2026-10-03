/**
 * What a generated file declares before and around its flow: the modules it
 * requires and the services it reaches, its types, its script variables, its
 * hoisted functions and the value a ModuleScript returns.
 *
 * Functions of the `Emitter` they write through; see `emitter.ts`.
 */

import { bodyPinOf } from "../functionBody.js";
import { checkLuau } from "../luau/check.js";
import { checkSpecifier } from "../modules.js";
import {
	signatureOf, typeDeclarationOf, type Signature, type TypeDeclaration,
} from "../nodes/flow.js";
import { variableRefOf } from "../nodes/variables.js";
import { isService as isRobloxService } from "../roblox.js";
import { isModuleScript } from "../schema.js";
import { Scope } from "./emitScope.js";
import type { Emitter } from "./emitter.js";
import type { ResolvedNode } from "./graph.js";
import {
	isFieldName, isIdentifier, literalToLuau, notAName, quoteString, toIdentifier,
} from "./luau.js";

/**
 * Names the runtime provides, which a *generated* name must not shadow.
 *
 * "Generated" is the load-bearing word. A name somebody typed is allowed to
 * shadow one of these — binding `Vector3` off `@lune/roblox` is the whole point
 * of that mechanism — but it is worth warning about, because shadowing `table`
 * breaks `table.insert` for the rest of the file.
 */
export const PROVIDED_GLOBALS = [
	"game", "workspace", "script", "shared", "require", "print", "warn", "table", "math",
	"string", "task", "Instance", "Vector3", "Color3", "CFrame", "Enum", "tostring",
	"tonumber", "pairs", "ipairs", "next", "select", "type", "typeof",
];

/**
 * The local a module specifier would be called if nobody said.
 *
 * Its last segment, split on slashes: `@lune/fs` is `fs`. Not `lastSegment`,
 * which splits on dots for instance paths and would make it `lune_fs`.
 */
export function specifierName(specifier: string): string {
	const parts = specifier.replace(/^@/, "").split(/[\\/]+/).filter((part) => part !== "");
	// `./util/config.luau` is called config, not luau.
	return (parts[parts.length - 1] ?? "").replace(/\.(luau|lua)$/, "");
}

/**
 * Pin types that describe the editor rather than the program.
 *
 * `wildcard` is "adopts whatever it is wired to" and `luau` is "hand-written
 * source", neither of which is a type Luau has ever heard of.
 */
const EDITOR_ONLY_TYPES = new Set(["any", "wildcard", "luau", "code"]);

/** A name Luau will accept in a type position, including `a.B` for a module's. */
const TYPE_NAME = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

/**
 * The Luau a pin's type is written as.
 *
 * Anything shaped like a type name is written as itself, whether Roblox's
 * (`Model`) or one the file declares (`Config`). A name Luau does not know is
 * an error it reports, naming the line, which is a better answer than
 * silently writing `any` and leaving the graph and the file disagreeing.
 */
export function luauType(t: string | undefined): string {
	if (!t) return "any";
	if (t === "table") return "{ [any]: any }";
	if (t === "function") return "(...any) -> ...any";
	if (EDITOR_ONLY_TYPES.has(t)) return "any";
	if (TYPE_NAME.test(t)) return t;
	return isTypeExpression(t) ? t.trim() : "any";
}

/**
 * Whether text reads as a Luau type rather than as anything else.
 *
 * The same argument as for names, one step further: a type made of types —
 * `{ [Model]: Restore }`, with braces, brackets, `?`, `|`, `->` and names with
 * dots — is written as it was typed, and a mistake in it is Luau's to report,
 * with a line number.
 *
 * What is refused is text that is not a type, which the parser decides:
 * unclosed brackets, an assignment, two words side by side (`2 bad`). One line
 * and no comments, still: this is written into an annotation mid-line.
 */
function isTypeExpression(t: string): boolean {
	const text = t.trim();
	if (text === "" || text.includes("\n") || text.includes("--")) return false;
	return checkLuau(text, "type").length === 0;
}

/**
 * The modules this script declares, registered before the walk begins.
 *
 * `NodeScript.modules` is the only place a require can come from -- the
 * whole rule the Lune work is built on is that a generated file does not
 * grow imports nobody chose, and it is kept by there being one source.
 *
 * Registered into the same map `module.requirePath` uses, so a declared
 * module and a path-required one share the hoisting, the ordering and the
 * naming rather than arriving by two routes that have to agree.
 *
 * Ahead of the walk because names are first come, first served: a module
 * called `fs` should get `fs`, and a local that wants the same name later is
 * the one that gets `fs2`.
 */
export function declareModules(e: Emitter): void {
	// A template has no top of the file to hoist to; it is one expression.
	if (e.options.inline) return;

	for (const module of e.script.modules ?? []) {
		const specifier = module.specifier.trim();
		if (specifier === "") continue;

		// Whether this target resolves it at all. The declaration still
		// compiles either way: a require that will not resolve is worth
		// saying loudly and is not worth silently dropping, because the
		// generated file is the thing the developer is about to read.
		const wrong = checkSpecifier(specifier, e.script.target, e.options.specifiers);
		if (wrong) {
			const said = `Module "${module.name || specifier}": ${wrong.message}`;
			if (wrong.severity === "error") e.error(said);
			else e.warn(said);
		}

		// A declared name is taken **verbatim**, not made unique.
		//
		// The panel makes you type one, so it is always a choice — and
		// `uniqueForFile` answers a different question. Asked for `util`
		// twice it hands back `util` and `util2`; asked for `table` it hands
		// back `table2`. Both are silent, and both leave the graph saying
		// one name while the file says another, which is the kind of
		// mismatch that costs an afternoon.
		//
		// Two modules genuinely can want one name — `./combat/util` and
		// `./inventory/util` is a shape real projects have — and the answer
		// to that is for the author to rename one, which they can only do
		// if we tell them.
		const wanted = toIdentifier(module.name.trim() || specifierName(specifier) || "module");
		if (!claimModuleName(e, wanted, specifier)) continue;
		if (PROVIDED_GLOBALS.includes(wanted)) {
			e.warn(
				`The module "${wanted}" shadows something Luau provides. That is allowed and is ` +
					"sometimes the point, but everything below it in this file sees the module " +
					"rather than the global.",
			);
		}

		const ident = wanted;
		e.moduleIdents.set(module.id, ident);
		// First declaration of a specifier wins, which is the one whose
		// require is written first and so the one already in scope.
		if (!e.moduleBySpecifier.has(specifier.toLowerCase())) {
			e.moduleBySpecifier.set(specifier.toLowerCase(), ident);
		}
		e.requires.set(`module:${module.id}`, {
			ident,
			expression: quoteString(specifier),
			// A member takes the name it asks for, verbatim.
			//
			// `uniqueForFile` would not give it one: the emitter reserves the
			// Roblox globals so a generated local cannot shadow them, and
			// `Vector3` bound off `@lune/roblox` would come out as `Vector32`.
			// But shadowing is the entire point here -- binding `Vector3` is what
			// lets `Vector3.new(1, 2, 3)` compile unchanged under Lune, and a
			// binding the author wrote down is not the accident that rule
			// guards against. Reserved afterwards so a later generated name
			// avoids it rather than the other way round.
			members: (module.members ?? [])
				.map((member) => member.trim())
				.filter((member) => member !== "")
				.map((member) => {
					const ident = toIdentifier(member);
					e.names.reserve(ident);
					return { member, ident };
				}),
		});
	}
}

/**
 * Claims a module's chosen name for the whole file, or says why it cannot.
 *
 * Shared by a declaration and Require at Top's `As`, because both take the
 * name verbatim and so both can collide: two modules that want `util`, or a
 * module named after a variable the file already declares. Either way the
 * second `local` would shadow the first, and the graph would say one thing
 * while the file did another. A name Luau provides is left to the caller,
 * which warns rather than refuses.
 */
export function claimModuleName(e: Emitter, name: string, specifier: string, node?: string): boolean {
	const already = e.moduleClaims.get(name);
	if (already !== undefined) {
		e.error(
			`Two modules are both called "${name}" — ${already} and ${specifier}. ` +
				"Rename one of them: a generated file can only bind the name once.",
			node,
		);
		return false;
	}
	e.moduleClaims.set(name, specifier);
	e.names.reserve(name);
	return true;
}

/**
 * Writes the hoisted locals into the preamble, in the order they were first
 * asked for. That order is deterministic because the walk is.
 *
 * Services come before requires, because a required module's path usually
 * starts at a service and Luau reads a file top to bottom.
 */
export function flushPreamble(e: Emitter): void {
	if (e.services.size === 0 && e.requires.size === 0) return;

	for (const [service, ident] of e.services) {
		e.preamble.push({
			text: `local ${ident} = game:GetService(${quoteString(service)})`,
			indent: 0,
		});
	}
	if (e.services.size > 0 && e.requires.size > 0) {
		e.preamble.push({ text: "", indent: 0 });
	}
	for (const { ident, expression, members } of e.requires.values()) {
		e.preamble.push({ text: `local ${ident} = require(${expression})`, indent: 0 });
		// What the module was asked to hand out, bound beneath it. Lune's own
		// idiom, and what lets `Vector3.new(...)` compile unchanged there.
		for (const bound of members ?? []) {
			e.preamble.push({
				text: `local ${bound.ident} = ${ident}.${bound.member}`,
				indent: 0,
			});
		}
	}
	e.preamble.push({ text: "", indent: 0 });
}

/**
 * The Luau expression a path node starts from, registering the service if
 * the root names one. `game`, `script` and `workspace` need no declaration.
 */
export function resolveRoot(e: Emitter, root: string): string {
	if (!isRobloxService(root)) return root;
	// A template has no top of the file to hoist a service to.
	if (e.options.inline) return `game:GetService(${quoteString(root)})`;
	const existing = e.services.get(root);
	if (existing) return existing;
	const ident = e.names.uniqueForFile(root, "service");
	e.services.set(root, ident);
	return ident;
}

/**
 * The Luau on the right of a type declaration.
 *
 * Two shapes rather than one. A table of fields is a list of pairs, which is
 * what the editor can lay out and check — and it is what most exported types
 * in a Roblox module actually are. Everything else Luau can say about a type
 * is written out, because building a grammar for unions, generics and
 * function types would be building a second language inside the first.
 *
 * Empty when there is nothing to write, or when something is wrong with it
 * and has been said against the node.
 */
export function typeDefinition(e: Emitter, declaration: TypeDeclaration, nodeId: string): string {
	// Written out is pasted in as it stands, so an unclosed brace here breaks
	// the file somewhere after it. Said against the node, like Custom Code.
	if (declaration.shape === "written") {
		const problem = checkLuau(declaration.definition, "type")[0];
		if (problem) {
			e.error(`${problem.message} (line ${problem.line} of this type's definition)`, nodeId);
			return "";
		}
		return declaration.definition;
	}

	// No fields is a node that was made before the field list existed, or one
	// somebody typed into and then switched away from; either way its
	// written definition is what it means.
	if (declaration.fields.length === 0) return declaration.definition;

	const parts: string[] = [];
	for (const field of declaration.fields) {
		if (field.name === "" || field.type === "") {
			e.error("A field in this type has no name or no type.", nodeId);
			return "";
		}
		if (!isFieldName(field.name)) {
			e.error(notAName(field.name, "a field"), nodeId);
			return "";
		}
		parts.push(`${field.name}: ${field.type}`);
	}
	// One field to a line, the way Make Dictionary lays out one key to a
	// line: trailing comma on the last, leading tab relative to wherever the
	// declaration itself is indented.
	if (declaration.lines) return `{\n${parts.map((part) => `\t${part},`).join("\n")}\n}`;
	return `{ ${parts.join(", ")} }`;
}

/** Whether a type cannot be called `name`, said against the node when so. */
export function typeNameRefused(e: Emitter, name: string, nodeId: string): boolean {
	if (!isIdentifier(name)) {
		e.error(notAName(name, "a type"), nodeId);
		return true;
	}
	if (e.declaredTypes.has(name)) {
		e.error(`The type "${name}" is declared more than once.`, nodeId);
		return true;
	}
	return false;
}

/**
 * Takes a type's name for the file, once `typeNameRefused` has passed it.
 *
 * Reserved as a value name too, so a variable or local can never be given
 * the same identifier: Luau keeps types and values apart, but a reader does
 * not.
 */
export function claimTypeName(e: Emitter, name: string): void {
	e.declaredTypes.add(name);
	e.names.reserve(name);
}

/**
 * `type` and `export type` declarations, at the very top.
 *
 * Before the variables, because a variable may well be annotated with one
 * and Luau reads a file in order. They are not part of any flow — a type
 * declares nothing that runs — so they are collected from the graph rather
 * than reached by walking it, the same way Module Exports is.
 *
 * The definition is written as Luau. A type is not built out of values, so
 * there is nothing for a node to be: `{ speed: number }` has no runtime
 * meaning to wire up. This is the same escape hatch Custom Code is, and it
 * is the honest one here rather than a shortcut.
 */
export function emitTypes(e: Emitter): void {
	const nodes = e.index.all().filter((r) => r.def.id === "type.declareTop");
	if (nodes.length === 0) return;

	let written = 0;
	for (const r of nodes) {
		const declaration = typeDeclarationOf(r.def.id, r.node.config);
		const definition = typeDefinition(e, declaration, r.node.id);
		if (declaration.name === "" || definition === "") {
			e.error(
				"Declare Type at Top needs both a name and a definition before it can be written.",
				r.node.id,
			);
			continue;
		}
		if (typeNameRefused(e, declaration.name, r.node.id)) continue;
		claimTypeName(e, declaration.name);
		const prefix = declaration.exported ? "export type" : "type";
		e.push(`${prefix} ${declaration.name} = ${definition}`, r.node.id);
		written++;
	}
	if (written > 0) e.blank();
}

/**
 * Script variables become file-level locals, declared before anything else
 * so that functions and the main flow can both see them. They are emitted in
 * declaration order rather than sorted, because the order is the author's
 * and shows up in the generated file.
 */
export function emitVariables(e: Emitter): void {
	const variables = e.script.variables ?? [];
	if (variables.length === 0) return;

	// Which variables an Initialize node is going to declare. Collected
	// before anything is written, because the decision is whether to write
	// the line at all.
	for (const r of e.index.all()) {
		if (r.def.id !== "variable.init") continue;
		const variable = variableRefOf(r.node.config).variable;
		if (variable) e.initialisedLater.add(variable);
	}

	// Two passes: claim every name before emitting, so a variable declared
	// later cannot be renamed out from under an earlier one.
	for (const variable of variables) {
		e.variableNames.set(
			variable.id,
			e.names.unique(variable.name || "variable", "variable"),
		);
	}
	let written = 0;
	for (const variable of variables) {
		if (e.initialisedLater.has(variable.id)) continue;
		const ident = e.variableNames.get(variable.id)!;
		const annotation =
			e.annotates && variable.type && variable.type !== "any"
				? `: ${luauType(variable.type)}`
				: "";
		if (variable.description) e.push(`-- ${variable.description}`);
		const keyword = variable.const === true ? "const" : "local";
		e.push(`${keyword} ${ident}${annotation} = ${literalToLuau(variable.default)}`);
		e.declaredSoFar.add(variable.id);
		written++;
	}
	if (written > 0) e.blank();
}

export function emitFunctions(e: Emitter, root: Scope): void {
	const entries = e.index
		.all()
		.filter((r) => r.def.id === "function.entry")
		.sort((a, b) => a.node.y - b.node.y || a.node.x - b.node.x || a.node.id.localeCompare(b.node.id));

	// Reserve every function name up front so mutual recursion resolves.
	for (const fn of entries) {
		const sig = signatureOf(fn.node.config);
		const name = e.names.unique(sig.name || fn.node.label || "fn", "fn");
		e.functionNames.set(fn.node.id, name);
	}

	for (const fn of entries) {
		const sig = signatureOf(fn.node.config);
		const name = e.functionNames.get(fn.node.id)!;
		const scope = new Scope(root, "function");

		// The parameters and everything the body declares belong to this
		// function, and are released with it -- so the next function may call
		// its own parameter `character` too. Closed by `pop` below.
		e.names.push();
		const { params, returns } = luauSignature(e, sig, fn.node.id, scope);

		e.blank();
		e.push(`local function ${name}(${params})${returns}`, fn.node.id);
		e.indent++;
		e.walk(bodyOf(e, fn), scope);
		e.indent--;
		e.names.pop();
		e.push("end", fn.node.id);
		e.blank();

		// Bind the function itself so Module Exports and Connect can wire it.
		root.bindings.set(`${fn.node.id}/self`, name);
	}
}

/**
 * A function's parameter list and return annotation, as Luau writes them.
 *
 * Each parameter is named here and bound into `body` under the key Get
 * Parameter reads, `<owner>/p<i>`. Types are written only when the mode line
 * asks for annotations, the same rule every other annotation follows; the
 * return annotation comes back with its colon, or empty.
 */
export function luauSignature(e: Emitter, sig: Signature, ownerId: string, body: Scope): { params: string; returns: string } {
	const params = (sig.params ?? []).map((p, i) => {
		const ident = e.names.unique(p.name || `arg${i + 1}`, `arg${i + 1}`);
		body.bindings.set(`${ownerId}/p${i}`, ident);
		return e.annotates ? `${ident}: ${luauType(p.type)}` : ident;
	});
	if (!e.annotates) return { params: params.join(", "), returns: "" };

	const returns = sig.returns ?? [];
	const written =
		returns.length === 0
			? "()"
			: returns.length === 1
				? luauType(returns[0].type)
				: `(${returns.map((r) => luauType(r.type)).join(", ")})`;
	return { params: params.join(", "), returns: `: ${written}` };
}

/** The first node of a function's body. See `bodyPinOf` for which pin that is. */
export function bodyOf(e: Emitter, fn: ResolvedNode): string | undefined {
	const pin = bodyPinOf(fn.def.id);
	return pin === undefined ? undefined : e.index.execTarget(fn.node.id, pin);
}

export function emitModuleReturn(e: Emitter, root: Scope): void {
	const exportsNodes = e.index.all().filter((r) => r.def.id === "module.exports");

	if (!isModuleScript(e.script)) {
		if (exportsNodes.length > 0) {
			e.warn(
				"Module Exports only has an effect in a ModuleScript. This graph compiles to a " +
					`${e.script.scriptClass}, so the node was ignored.`,
				exportsNodes[0].node.id,
			);
		}
		return;
	}
	if (exportsNodes.length === 0) {
		e.warn("A ModuleScript needs a Module Exports node; this one returns nothing.");
		return;
	}
	if (exportsNodes.length > 1) {
		e.error("A ModuleScript can only have one Module Exports node.", exportsNodes[1].node.id);
	}

	const node = exportsNodes[0];
	const exports = node.inputs.filter((p) => p.kind === "data");
	e.blank();

	// A single input named "value" (the default) returns that value directly,
	// which is what a module exporting one function or one class wants.
	const single = exports.length === 1 && (exports[0].name === "value" || exports[0].name === "");
	if (single) {
		e.push(`return ${e.resolveInput(node, exports[0], root)}`, node.node.id);
		return;
	}

	const entries = exports.map((pin) => {
		const key = toIdentifier(pin.name || pin.id, pin.id);
		return `${key} = ${e.resolveInput(node, pin, root)},`;
	});
	e.push("return {", node.node.id);
	e.indent++;
	for (const entry of entries) e.push(entry, node.node.id);
	e.indent--;
	e.push("}", node.node.id);
}
