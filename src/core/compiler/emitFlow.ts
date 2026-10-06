/**
 * The builtin flow nodes on the execution chain: branches, loops, sequences,
 * declarations made where they sit, handlers and returns.
 *
 * Functions of the `Emitter` they write through; see `emitter.ts`.
 */

import { LUAU_PRIMITIVES } from "../luneTypes.js";
import {
	isMethod,
	loopNamesOf,
	loopTypes,
	RECEIVER,
	signatureOf,
	typeDeclarationOf,
} from "../nodes/flow.js";
import { isConstLocal, localTypeOf, variableRefOf } from "../nodes/variables.js";
import { scriptCallOf } from "../scriptCalls.js";
import { isRobloxTypeName, luneCall, resultNameOf, serviceCall, writeCall } from "./emitCalls.js";
import {
	bodyOf,
	claimTypeName,
	luauSignature,
	luauType,
	typeDefinition,
	typeNameRefused,
} from "./emitDeclarations.js";
import { narrowingsOf } from "./emitNarrowing.js";
import { logicOutputName, Scope, VARIADIC_PIN } from "./emitScope.js";
import { callArguments } from "./emitTemplates.js";
import type { Emitter } from "./emitter.js";
import { scriptCall } from "./emitValues.js";
import type { ResolvedNode } from "./graph.js";
import {
	isFieldName,
	isIdentifier,
	notAName,
	PREC,
	parenAt,
	parenPrefix,
	toIdentifier,
} from "./luau.js";

/**
 * A Branch, and the `elseif` chain it may continue into.
 *
 * ## Why `elseif` is worth machinery
 *
 * A Branch wired into another Branch's False pin is how every node editor
 * spells "otherwise, if". Written as an `else` holding a nested `if` it is
 * the same program and a worse file: each link in the chain costs a level of
 * indentation and an `end`, so five conditions end in five closing keywords
 * and a body pushed a third of the way across the page.
 *
 * ## When the chain has to break
 *
 * `elseif <cond> then` has nowhere to put a statement. An `else` does: its
 * block opens before the nested `if`. So the next condition is resolved with
 * everything it emits **captured** rather than written, and the chain
 * continues only when it emitted nothing. A condition that had to bind a
 * local first falls back to `else` and the nested `if`, with the captured
 * lines put back at the top of the block where they belong.
 *
 * The condition is resolved in the arm's own scope either way, because that
 * is where it is evaluated in both shapes.
 */
function emitBranch(
	e: Emitter,
	r: ResolvedNode,
	scope: Scope,
	keyword: "if" | "elseif",
	condition?: string,
): void {
	const id = r.node.id;
	const cond = condition ?? e.resolveInput(r, e.pin(r, "condition", "in"), scope);
	e.push(`${keyword} ${cond} then`, id);
	e.indent++;
	const trueArm = new Scope(scope);
	// Whatever the condition proved holds here and only here.
	for (const [key, classes] of narrowingsOf(e, r, "condition")) {
		trueArm.narrowings.set(key, classes);
	}
	e.names.within(() => e.walk(e.index.execTarget(id, "true"), trueArm));
	e.indent--;

	const onFalse = e.index.execTarget(id, "false");
	const chained = chainedBranch(e, onFalse);
	if (chained) {
		const arm = new Scope(scope);
		// Resolved at the indentation the else block would be at, so lines
		// that do get captured are already sitting at the right depth.
		e.indent++;
		e.names.push();
		const captured = e.capture(() =>
			e.resolveInput(chained, e.pin(chained, "condition", "in"), arm),
		);
		e.indent--;

		e.execStack.add(chained.node.id);
		if (captured.lines.length === 0) {
			// Nothing was declared, so there is no block for it to belong to:
			// the chain carries on at this level and one `end` closes it all.
			e.names.pop();
			emitBranch(e, chained, arm, "elseif", captured.value);
		} else {
			e.push("else", id);
			e.indent++;
			for (const line of captured.lines) e.out.push(line);
			emitBranch(e, chained, arm, "if", captured.value);
			e.indent--;
			e.names.pop();
			e.push("end", id);
		}
		e.execStack.delete(chained.node.id);
		e.terminated = false;
		return;
	}

	if (onFalse) {
		const mark = e.out.length;
		e.push("else", id);
		e.indent++;
		e.names.within(() => e.walk(onFalse, new Scope(scope)));
		e.indent--;
		// A false arm that produces no statements -- a lone Script End, or a
		// chain of nodes that all compile to nothing -- would leave a bare
		// `else` before the `end`. Valid Luau, but nobody writes it, and the
		// generated file is meant to be read.
		if (e.out.length === mark + 1) e.out.length = mark;
	}
	e.push("end", id);
	e.terminated = false;
}

/**
 * The Branch an `else` arm consists of, when that is all it consists of.
 *
 * Reroutes are stepped through, because a knot is a bend in the wire and
 * emits nothing. A Branch already on the execution stack is refused: that is
 * a loop, and `walk` is the thing that reports it.
 */
function chainedBranch(e: Emitter, target: string | undefined): ResolvedNode | undefined {
	const seen = new Set<string>();
	let current = target;
	while (current !== undefined && !seen.has(current)) {
		seen.add(current);
		const r = e.index.get(current);
		const spec = r?.def.compilesTo;
		if (!r || spec?.kind !== "builtin") return undefined;
		if (spec.handler === "flow.rerouteExec") {
			current = e.index.execTarget(current, "then");
			continue;
		}
		if (spec.handler !== "flow.branch") return undefined;
		return e.execStack.has(r.node.id) ? undefined : r;
	}
	return undefined;
}

/** Writes one builtin flow node and returns the next node in the chain, if any. */
type FlowHandler = (
	e: Emitter,
	r: ResolvedNode,
	scope: Scope,
	handler: string,
) => string | undefined;

/** Script Start, and a knot on an execution wire: nothing is written. */
function passThrough(e: Emitter, r: ResolvedNode): string | undefined {
	const id = r.node.id;
	// A reroute is a bend in the wire, not a step. Nothing is emitted.
	return e.index.execTarget(id, "then");
}

/** Script End: nothing is written, and nothing may follow it in its block. */
function endScript(e: Emitter, _r: ResolvedNode): string | undefined {
	e.terminated = true;
	return undefined;
}

/**
 * Node Inputs: where the walk starts, never a step in it.
 *
 * A custom node's logic. See `runLogic`.
 */
function logicInputs(e: Emitter, r: ResolvedNode): string | undefined {
	const id = r.node.id;
	e.error("Node Inputs is where the logic starts, so nothing can run into it.", id);
	return undefined;
}

/** Node Outputs, in a custom node's logic: assigns each output placeholder. See `runLogic`. */
function logicOutputs(e: Emitter, r: ResolvedNode, scope: Scope): string | undefined {
	const id = r.node.id;
	for (const pin of r.baseInputs) {
		if (pin.kind !== "data") continue;
		e.push(`${logicOutputName(pin.id)} = ${e.resolveInput(r, pin, scope)}`, id);
	}
	return undefined;
}

/** A hoisted Function wired into a chain, which it cannot be. */
function functionInChain(e: Emitter, r: ResolvedNode): string | undefined {
	const id = r.node.id;
	e.error(
		"A Function node cannot be wired into another execution chain; it is its own entry point.",
		id,
	);
	return undefined;
}

/** Return: the function's values, and the end of its block. */
function functionReturn(e: Emitter, r: ResolvedNode, scope: Scope): string | undefined {
	const id = r.node.id;
	const values = r.inputs.filter((p) => p.kind === "data");
	const parts = values.map((p) => e.resolveInput(r, p, scope));
	e.push(parts.length ? `return ${parts.join(", ")}` : "return", id);
	e.terminated = true;
	return undefined;
}

/** Module Exports: written at the end of the file by `emitModuleReturn`, not here. */
function moduleExports(_e: Emitter, _r: ResolvedNode): string | undefined {
	return undefined;
}

/** Call Function and Call Method. */
function callInvoke(e: Emitter, r: ResolvedNode, scope: Scope): string | undefined {
	const id = r.node.id;
	// One handler for both call nodes: the only difference is whether
	// the callee is a wired value or a method name on an object.
	const args = callArguments(
		e,
		r,
		r.inputs.filter((p) => VARIADIC_PIN.test(p.id)),
		(p) => e.resolveInput(r, p, scope),
	);

	let callee: string;
	if (r.def.id === "call.method") {
		const object = parenPrefix(e.resolveInput(r, e.pin(r, "object", "in"), scope));
		const method = toIdentifier(e.literalText(r, "method"), "method");
		if (e.index.sourceOf(id, "method")) {
			e.error(
				"Call Method needs the method name typed in: it becomes part of the generated code.",
				id,
				"method",
			);
			return e.index.execTarget(id, "then");
		}
		callee = `${object}:${method}`;
	} else {
		callee = parenPrefix(e.resolveInput(r, e.pin(r, "fn", "in"), scope));
	}

	return writeCall(e, r, `${callee}(${args.join(", ")})`, "result", scope, { fallback: "result" });
}

/**
 * A Script Function step: the call, and what it gives back bound.
 *
 * One return value goes through `writeCall` like every other call, named for
 * the return value rather than "result". More than one is `local a, b = f()`,
 * written as far as the last value anything reads, with `_` for the ones
 * between that nothing does.
 *
 * A module's return types are named in that module — `Config.Tuning` is
 * `Tuning` there — so its results are annotated only when the type is one
 * every file can name.
 */
function scriptStep(e: Emitter, r: ResolvedNode, scope: Scope): string | undefined {
	const id = r.node.id;
	const rendered = scriptCall(e, r, scope);
	const fromModule = scriptCallOf(r.node.config).module !== undefined;
	const returns = r.baseOutputs.filter((p) => p.kind === "data");

	if (returns.length <= 1) {
		const type = returns[0]?.type ?? "any";
		return writeCall(e, r, rendered, "result", scope, {
			fallback: returns[0]?.name || "result",
			typed: !fromModule || isRobloxTypeName(type),
		});
	}

	const read = returns.map((p) => e.index.readerCount(id, p.id, { parts: true }) > 0);
	// A Result name asks for the first value's local, read or not.
	if (resultNameOf(r.node.config) !== undefined) read[0] = true;
	const last = read.lastIndexOf(true);
	if (last < 0) {
		e.push(rendered, id);
		return e.index.execTarget(id, "then");
	}
	const names = returns.slice(0, last + 1).map((p, i) => {
		if (!read[i]) return "_";
		const hint = i === 0 ? (resultNameOf(r.node.config) ?? p.name) : p.name;
		const ident = e.names.unique(hint || `value${i + 1}`, "value");
		scope.bindings.set(`${id}/${p.id}`, ident);
		return ident;
	});
	e.push(`local ${names.join(", ")} = ${rendered}`, id);
	return e.index.execTarget(id, "then");
}

/**
 * A Lune Function step.
 *
 * A Lune type other than Luau's own belongs to its module — `net.FetchResponse`
 * — and is not a name in scope, so only a primitive result is annotated.
 */
function luneStep(e: Emitter, r: ResolvedNode, scope: Scope): string | undefined {
	const type = e.pin(r, "result", "out").type ?? "any";
	return writeCall(e, r, luneCall(e, r, scope), "result", scope, {
		fallback: "result",
		typed: LUAU_PRIMITIVES.includes(type),
	});
}

/**
 * A Service Function step.
 *
 * The catalogue names some results by an enum's bare name or by an
 * internal type, neither of which Luau can see, so only a type every
 * Roblox file has in scope is annotated.
 */
function serviceStep(e: Emitter, r: ResolvedNode, scope: Scope): string | undefined {
	const type = e.pin(r, "result", "out").type ?? "any";
	return writeCall(e, r, serviceCall(e, r, scope), "result", scope, {
		fallback: "result",
		typed: isRobloxTypeName(type),
	});
}

/** Declare Function: a function written where it sits. */
function declareFunction(e: Emitter, r: ResolvedNode, scope: Scope): string | undefined {
	const id = r.node.id;
	const sig = signatureOf(r.node.config);
	const name = (sig.name || r.node.label || "").trim();
	if (name === "") {
		e.error("Declare Function needs a name before it can be written.", id);
		return e.index.execTarget(id, "then");
	}
	// A field name at least, since `T.type` is a fine method. One that
	// is not owned is a local, and is held to a local's rule below.
	if (!isFieldName(name)) {
		e.error(notAName(name, "a function"), id);
		return e.index.execTarget(id, "then");
	}

	// The table it hangs off, if any.
	//
	// `function T.name()` needs `T` to be a name -- Luau has no syntax
	// for attaching a function to an expression, and `(expr).name = ...`
	// is a different statement with different semantics. A variable or a
	// local resolves to a bare identifier (or a path of field names)
	// and works; anything else is refused rather than half-written.
	let owner: string | undefined;
	if (e.index.sourceOf(id, "owner")) {
		const resolved = e.resolveInput(r, e.pin(r, "owner", "in"), scope);
		if (!resolved.split(".").every(isFieldName)) {
			e.error(
				"On Table has to be a name Luau can attach a function to — a variable or " +
					`a local, not an expression. This one came out as \`${resolved}\`.`,
				id,
			);
			return e.index.execTarget(id, "then");
		}
		owner = resolved;
	}
	if (owner === undefined && !isIdentifier(name)) {
		e.error(notAName(name, "a local function"), id);
		return e.index.execTarget(id, "then");
	}
	const method = isMethod(r.node.config);
	if (method && (owner === undefined || !isIdentifier(name))) {
		e.error(
			owner === undefined
				? "A method belongs to a table. Wire one into On Table, or turn Method off."
				: notAName(name, "a method"),
			id,
		);
		return e.index.execTarget(id, "then");
	}

	// An owned function is a field, not a local, so it takes no name of
	// its own and cannot collide with one. A method is still reached as a
	// field when it is read as a value; only its declaration and its calls
	// write the colon.
	const ident = owner ? `${owner}.${name}` : e.names.unique(name, "fn");
	// Set before the body is walked, so the function can call itself and
	// so a Get Function inside it resolves.
	e.functionNames.set(id, ident);

	const body = new Scope(scope, "function");
	// As for a hoisted function: the parameters and the body's locals
	// are this function's, and go out of scope with its `end`.
	e.names.push();
	// Luau names a method's receiver, so it is taken before the parameters
	// are named: one called `self` as well becomes `self2`.
	if (method) {
		e.names.take(RECEIVER);
		body.bindings.set(`${id}/receiver`, RECEIVER);
	}
	const { params, returns } = luauSignature(e, sig, id, body);

	// A blank line either side, the same as a hoisted function gets. A
	// declaration is a change of subject, and two of them run together read
	// as one long block with an `end` somewhere in the middle of it.
	// `blank` will not double up, so a run of them gets one line each.
	e.blank();
	const header = method ? `${owner}:${name}` : ident;
	e.push(`${owner ? "" : "local "}function ${header}(${params})${returns}`, id);
	e.indent++;
	e.walk(bodyOf(e, r), body);
	e.indent--;
	e.names.pop();
	e.push("end", id);
	e.blank();
	e.terminated = false;
	return e.index.execTarget(id, "then");
}

/** Declare Type: a type written where it sits. */
function declareType(e: Emitter, r: ResolvedNode, scope: Scope): string | undefined {
	const id = r.node.id;
	const declaration = typeDeclarationOf(r.def.id, r.node.config);
	const name = declaration.name;

	let definition: string;
	if (declaration.shape === "typeof") {
		const value = e.resolveInput(r, e.pin(r, "value", "in"), scope);
		// The node writes `typeof(...)` itself, so a Type Of on the way in
		// makes `typeof(typeof(x))`. That is not a mistake Luau catches:
		// the inner call is an expression giving a string, so the type
		// quietly becomes `string`. Wiring one in is the obvious reading
		// of the native code this mirrors, so it is worth saying rather
		// than fixing silently.
		if (e.feederOf(id, "value")?.def.id === "value.typeof") {
			e.error(
				"Declare Type already takes the type of what you wire in, so the Type Of " +
					"node makes it the type of a string. Wire the value in directly.",
				id,
			);
			return e.index.execTarget(id, "then");
		}
		definition = `typeof(${value})`;
	} else {
		const before = e.diagnostics.length;
		definition = typeDefinition(e, declaration, id);
		if (definition === "") {
			// A field with no type has already said what is wrong.
			if (e.diagnostics.length === before) {
				e.error("Declare Type needs a definition before it can be written.", id);
			}
			return e.index.execTarget(id, "then");
		}
	}
	if (name === "") {
		e.error("Declare Type needs a name before it can be written.", id);
		return e.index.execTarget(id, "then");
	}
	if (typeNameRefused(e, name, id)) return e.index.execTarget(id, "then");
	// `export type` is only legal at the top level of a module. A plain
	// `type` inside a block is fine and stays scoped to it, so only the
	// export is refused rather than the whole node.
	if (declaration.exported && scope.parent !== undefined) {
		e.error(
			`"${name}" is exported, and Luau only allows that at the top level of a ` +
				"module. Move it out of the branch, loop or function, or untick Export.",
			id,
		);
		return e.index.execTarget(id, "then");
	}
	claimTypeName(e, name);
	e.push(`${declaration.exported ? "export type" : "type"} ${name} = ${definition}`, id);
	return e.index.execTarget(id, "then");
}

/** Declare Local. */
function declareLocal(e: Emitter, r: ResolvedNode, scope: Scope): string | undefined {
	const id = r.node.id;
	const value = e.resolveInput(r, e.pin(r, "value", "in"), scope);
	// A name is an identifier, decided when the file is written, so it
	// cannot come down a wire — the wire carries a runtime value and
	// there is nothing sensible to do with one here. Said rather than
	// ignored, because a wired Name that quietly did nothing would be
	// a name you had to test to discover was not being used.
	if (e.index.sourceOf(id, "name")) {
		e.error(
			"Declare Local's Name is written into the generated Luau, so it has to be " +
				"typed in rather than wired. Leave it blank for an automatic one.",
			id,
		);
	}
	const wanted = e.literalText(r, "name") || r.node.label || "local";
	const ident = e.names.unique(wanted, "local");
	// The type, when one was given, on the terms every other annotation
	// has: written when the mode line asks for annotations.
	const declared = localTypeOf(r.node.config);
	let annotation = "";
	if (e.annotates && declared !== "" && declared !== "any") {
		const written = luauType(declared);
		if (written === "any") {
			e.error(`"${declared}" is not a type Roswaal can write. Check its brackets are closed.`, id);
		} else {
			annotation = `: ${written}`;
		}
	}
	// `const` is Luau's, from 2026: the same binding, and reassigning it
	// is an error the language raises rather than one Roswaal has to.
	// Only the keyword changes; everything downstream reads a local.
	const keyword = isConstLocal(r.node.config) ? "const" : "local";
	e.push(`${keyword} ${ident}${annotation} = ${value}`, id);
	scope.bindings.set(`${id}/ref`, ident);
	return e.index.execTarget(id, "then");
}

/** Initialize Variable: a script variable's declaration, where it sits. */
function initialiseVariable(e: Emitter, r: ResolvedNode, scope: Scope): string | undefined {
	const id = r.node.id;
	const ref = variableRefOf(r.node.config);
	const ident = ref.variable ? e.variableNames.get(ref.variable) : undefined;
	const value = e.resolveInput(r, e.pin(r, "value", "in"), scope);
	if (!ident || !ref.variable) {
		e.error(
			ref.variable
				? "Initialize Variable points at a variable that no longer exists."
				: "Initialize Variable has no variable chosen.",
			id,
		);
		return e.index.execTarget(id, "then");
	}
	// The whole point of this node is that the declaration lands here
	// rather than at the top of the file — so it has to land somewhere
	// the rest of the script can still see. A `local` inside a branch,
	// a loop or a function body is gone by the time anything else
	// looks for it, and Luau would read the name as a nil global.
	if (scope.parent !== undefined) {
		e.error(
			`Initialize Variable declares "${ref.name ?? "the variable"}", so it has to sit ` +
				"in the main flow. Inside a branch, a loop or a function the declaration " +
				"would go out of scope. Use Set Variable there instead.",
			id,
		);
		return e.index.execTarget(id, "then");
	}
	if (e.declaredSoFar.has(ref.variable)) {
		e.error(
			`"${ref.name ?? "That variable"}" is initialised more than once. A variable is ` +
				"declared once; the later ones should be Set Variable.",
			id,
		);
		return e.index.execTarget(id, "then");
	}
	const variable = (e.script.variables ?? []).find((v) => v.id === ref.variable);
	const annotation =
		e.annotates && variable?.type && variable.type !== "any" ? `: ${luauType(variable.type)}` : "";
	e.push(`local ${ident}${annotation} = ${value}`, id);
	e.declaredSoFar.add(ref.variable);
	scope.bindings.set(`${id}/value`, ident);
	return e.index.execTarget(id, "then");
}

/** Set Variable. */
function setVariable(e: Emitter, r: ResolvedNode, scope: Scope): string | undefined {
	const id = r.node.id;
	const ref = variableRefOf(r.node.config);
	const ident = ref.variable ? e.variableNames.get(ref.variable) : undefined;
	const value = e.resolveInput(r, e.pin(r, "value", "in"), scope);
	// No variable, or one that is gone: `validate` reports it, for every
	// node rather than only those the walk reaches.
	if (!ident) return e.index.execTarget(id, "then");
	e.push(`${ident} = ${value}`, id);
	// The pass-through output is the variable itself, so a Set can sit
	// mid-chain and feed the value onwards without a second read.
	scope.bindings.set(`${id}/value`, ident);
	return e.index.execTarget(id, "then");
}

/** A pure node wired into a chain, which it cannot be. */
function pureInChain(e: Emitter, r: ResolvedNode): string | undefined {
	const id = r.node.id;
	e.error(`"${r.def.title}" is a pure node and cannot be placed in an execution chain.`, id);
	return undefined;
}

/** Branch. See `emitBranch`. */
function branch(e: Emitter, r: ResolvedNode, scope: Scope): string | undefined {
	emitBranch(e, r, scope, "if");
	// The if-statement is closed, so the enclosing block continues
	// regardless of what happened inside it.
	e.terminated = false;
	return undefined;
}

/** Sequence. */
function sequence(e: Emitter, r: ResolvedNode, scope: Scope): string | undefined {
	const id = r.node.id;
	// Every output runs in this same block, one after another, so a
	// branch that returns really does end the block — and Luau will
	// not accept anything after it.
	const pins = r.outputs.filter((p) => p.kind === "exec");
	for (let i = 0; i < pins.length; i++) {
		const ended = e.walk(e.index.execTarget(id, pins[i].id), scope);
		if (!ended) continue;

		const remaining = pins
			.slice(i + 1)
			.filter((pin) => e.index.execTarget(id, pin.id) !== undefined);
		if (remaining.length > 0) {
			e.error(
				`"${pins[i].name || pins[i].id}" ends the block, so the ${remaining.length} ` +
					"output(s) after it could never run. Move them above it, or put the " +
					"return inside a Branch.",
				id,
				pins[i].id,
			);
		}
		e.terminated = true;
		return undefined;
	}
	return undefined;
}

/** For Range: a numeric `for`. */
function forRange(e: Emitter, r: ResolvedNode, scope: Scope): string | undefined {
	const id = r.node.id;
	const first = e.resolveInput(r, e.pin(r, "first", "in"), scope);
	const last = e.resolveInput(r, e.pin(r, "last", "in"), scope);
	const step = e.resolveInput(r, e.pin(r, "step", "in"), scope);
	const body = new Scope(scope, "loop");
	// The loop variable belongs to the body, so the next loop in the
	// same block may call its own counter `i` as well.
	e.names.push();
	const idx = e.names.unique(r.node.label || "i", "i");
	body.bindings.set(`${id}/index`, idx);
	const stepPart = step === "1" ? "" : `, ${step}`;
	e.push(`for ${idx} = ${first}, ${last}${stepPart} do`, id);
	e.indent++;
	e.walk(e.index.execTarget(id, "body"), body);
	e.indent--;
	e.names.pop();
	e.push("end", id);
	e.terminated = false;
	return e.index.execTarget(id, "completed");
}

/** For Each and For Index: `pairs` and `ipairs`. */
function forPairs(e: Emitter, r: ResolvedNode, scope: Scope, handler: string): string | undefined {
	const id = r.node.id;
	const isArray = handler === "flow.forIndex";
	const source = e.resolveInput(r, e.pin(r, "table", "in"), scope);
	const body = new Scope(scope, "loop");
	const keyPin = isArray ? "index" : "key";
	// What the two loop variables are called.
	//
	// `key` and `value` are a placeholder, not a name: a loop over
	// parts reads `for key, value in` and every line under it talks
	// about `value`, which is the one word in the block that says
	// nothing. Naming them is what a hand-written loop does first.
	//
	// Held to identifiers here rather than refused, because the field
	// is typed into and a half-typed name should not fail a compile.
	const names = loopNamesOf(r.node.config);
	// Both belong to the body, for the same reason a numeric loop's
	// counter does.
	e.names.push();
	const k = e.names.unique(names.key ?? (isArray ? "i" : "key"), "key");
	const v = e.names.unique(names.value ?? "value", "value");
	body.bindings.set(`${id}/${keyPin}`, k);
	body.bindings.set(`${id}/value`, v);
	// Luau takes an annotation on a `for` binding, so a typed loop
	// variable is said where it is introduced rather than cast on the
	// first line of the body.
	//
	// An array's index is not offered one: `ipairs` hands back a
	// number and writing `i: number` is saying what the loop already
	// said. On the terms every other annotation has -- written only
	// when the mode line asks for them.
	const types = loopTypes(r.node.config ?? {});
	const bind = (ident: string, type: string | undefined) =>
		e.annotates && type ? `${ident}: ${luauType(type)}` : ident;
	const keyBinding = isArray ? k : bind(k, types.key);
	e.push(
		`for ${keyBinding}, ${bind(v, types.value)} in ${isArray ? "ipairs" : "pairs"}(${source}) do`,
		id,
	);
	e.indent++;
	e.walk(e.index.execTarget(id, "body"), body);
	e.indent--;
	e.names.pop();
	e.push("end", id);
	e.terminated = false;
	return e.index.execTarget(id, "completed");
}

/** While. */
function whileLoop(e: Emitter, r: ResolvedNode, scope: Scope): string | undefined {
	const id = r.node.id;
	const condPin = e.pin(r, "condition", "in");
	const link = e.index.sourceOf(id, "condition");
	const src = link ? e.index.get(link.from.node) : undefined;
	if (src && !src.def.pure) {
		e.warn(
			"The While condition is produced by a node with side effects, so it is evaluated once " +
				"before the loop rather than on each iteration. Feed it a pure comparison instead.",
			id,
			"condition",
		);
	}
	// The condition is worked out inside the loop, so that it is read
	// again on every pass. Resolved before the loop, a condition with
	// two readers was bound to a local once and never changed.
	const loop = new Scope(scope, "loop");
	e.indent++;
	e.names.push();
	const captured = e.capture(() => e.resolveInput(r, condPin, loop));
	e.indent--;
	if (captured.lines.length === 0) {
		e.push(`while ${captured.value} do`, id);
	} else {
		e.push("while true do", id);
		for (const line of captured.lines) e.out.push(line);
		e.push(`	if not ${parenAt(captured.value, PREC.unary)} then break end`, id);
	}
	e.indent++;
	e.walk(e.index.execTarget(id, "body"), loop);
	e.indent--;
	e.names.pop();
	e.push("end", id);
	e.terminated = false;
	return e.index.execTarget(id, "completed");
}

/** Break and Continue. */
function breakOrContinue(
	e: Emitter,
	r: ResolvedNode,
	scope: Scope,
	handler: string,
): string | undefined {
	const id = r.node.id;
	const keyword = handler === "flow.break" ? "break" : "continue";
	if (!scope.inLoop()) {
		e.error(`"${keyword}" is only valid inside a loop body.`, id);
		return undefined;
	}
	e.push(keyword, id);
	e.terminated = true;
	return undefined;
}

/**
 * The signal On Event connects to: the instance's event, by the name the
 * Inspector chose. Undefined, with an error, when there is no name to write.
 */
function instanceSignal(e: Emitter, r: ResolvedNode, scope: Scope): string | undefined {
	const id = r.node.id;
	const event = typeof r.node.config?.event === "string" ? r.node.config.event.trim() : "";
	if (event === "") {
		e.error("On Event needs an event before it can be written. Pick one in the Inspector.", id);
		return undefined;
	}
	if (!isFieldName(event)) {
		e.error(notAName(event, "an event"), id);
		return undefined;
	}
	return `${parenPrefix(e.resolveInput(r, e.pin(r, "instance", "in"), scope))}.${event}`;
}

/** Connect, Once and On Event. */
function connectHandler(
	e: Emitter,
	r: ResolvedNode,
	scope: Scope,
	handler: string,
): string | undefined {
	const id = r.node.id;
	// Once is Connect that unbinds itself after one fire, and On Event is
	// Connect on an instance's event by name. Identical in every other
	// respect, so they are one handler rather than copies that can drift.
	const method = handler === "event.once" ? "Once" : "Connect";
	const signal =
		handler === "event.on"
			? instanceSignal(e, r, scope)
			: e.resolveInput(r, e.pin(r, "signal", "in"), scope);
	if (signal === undefined) return e.index.execTarget(id, "then");
	const sig = signatureOf(r.node.config);
	const body = new Scope(scope, "function");

	// The connection is a local in the *enclosing* block, so it is
	// named before the handler's own frame is opened.
	let prefix = "";
	if (e.index.readerCount(id, "connection") > 0) {
		const ident = e.names.unique(r.node.label || "connection", "connection");
		scope.bindings.set(`${id}/connection`, ident);
		prefix = `local ${ident} = `;
	}

	// The handler is a function literal, so its parameters and its
	// locals are its own. Closed after the walk, below.
	e.names.push();
	const { params } = luauSignature(e, sig, id, body);
	e.push(`${prefix}${signal}:${method}(function(${params})`, id);
	e.indent++;
	e.walk(e.index.execTarget(id, "body"), body);
	e.indent--;
	e.names.pop();
	e.push("end)", id);
	e.terminated = false;
	return e.index.execTarget(id, "then");
}

/** What each builtin flow node writes, by the handler its `compilesTo` names. */
const FLOW_HANDLERS = new Map<string, FlowHandler>([
	["script.begin", passThrough],
	["flow.rerouteExec", passThrough],
	["script.end", endScript],
	["logic.inputs", logicInputs],
	["logic.outputs", logicOutputs],
	["function.entry", functionInChain],
	["function.return", functionReturn],
	["module.exports", moduleExports],
	["call.invoke", callInvoke],
	["lune.call", luneStep],
	["function.call", scriptStep],
	["service.call", serviceStep],
	["function.declareHere", declareFunction],
	["type.declareHere", declareType],
	["local.declare", declareLocal],
	["variable.init", initialiseVariable],
	["variable.set", setVariable],
	["variable.get", pureInChain],
	["function.get", pureInChain],
	["service.get", pureInChain],
	["instance.path", pureInChain],
	["module.requirePath", pureInChain],
	["flow.branch", branch],
	["flow.sequence", sequence],
	["flow.forRange", forRange],
	["flow.forEach", forPairs],
	["flow.forIndex", forPairs],
	["flow.while", whileLoop],
	["flow.break", breakOrContinue],
	["flow.continue", breakOrContinue],
	["event.connect", connectHandler],
	["event.once", connectHandler],
	["event.on", connectHandler],
]);

/** Writes a builtin node on the execution chain and returns the next node, if any. */
export function emitBuiltin(
	e: Emitter,
	handler: string,
	r: ResolvedNode,
	scope: Scope,
): string | undefined {
	const emitHandler = FLOW_HANDLERS.get(handler);
	if (emitHandler) return emitHandler(e, r, scope, handler);
	e.error(`Unimplemented builtin handler "${handler}".`, r.node.id);
	return undefined;
}
