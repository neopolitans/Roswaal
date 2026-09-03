/**
 * Graph -> Luau.
 *
 * The emitter walks execution wires depth-first, emitting one statement per
 * impure node, and resolves data wires on demand into expressions. Two rules
 * carry most of the weight:
 *
 *   1. A pure value with exactly one consumer is spliced into its use site;
 *      with two or more it is bound to a local, so the expression is evaluated
 *      exactly once no matter how many wires leave the pin.
 *   2. Bindings are scoped to the block they were emitted in. Reading a value
 *      from a sibling block is a diagnostic, not silently broken code, because
 *      the local genuinely is not in scope there.
 */

import {
	indentBlock, isAtomic, literalToLuau, NameScope, paren, quoteString, toIdentifier,
} from "./luau.js";
import { GraphIndex, type ResolvedNode } from "./graph.js";
import type { Literal, NodeScript, PinDef } from "../schema.js";
import type { Signature } from "../nodes/flow.js";
import type { FunctionRef, VariableRef } from "../nodes/variables.js";
import { isService as isRobloxService, lastSegment, renderPath } from "../roblox.js";
import type { Registry } from "../nodes/index.js";

export interface Diagnostic {
	severity: "error" | "warning";
	message: string;
	node?: string;
	pin?: string;
}

export interface EmitResult {
	code: string;
	diagnostics: Diagnostic[];
	/** 1-based output line -> the node that produced it. Powers error mapping. */
	sourceMap: { line: number; node: string }[];
	/** Hash of the emitted body, so hot reload can spot hand edits. */
	outputHash: string;
}

interface OutLine {
	text: string;
	indent: number;
	node?: string;
}

/** Lexical scope: which node outputs are bound to which locals, and where. */
class Scope {
	bindings = new Map<string, string>();
	constructor(readonly parent?: Scope, readonly loop = false) {}

	lookup(key: string): string | undefined {
		return this.bindings.get(key) ?? this.parent?.lookup(key);
	}

	inLoop(): boolean {
		return this.loop || (this.parent?.inLoop() ?? false);
	}
}

const LUAU_TYPES = new Set([
	"any", "boolean", "number", "string", "thread",
	"Instance", "Vector3", "Vector2", "CFrame", "Color3", "UDim", "UDim2",
	"BrickColor", "EnumItem", "RBXScriptSignal", "RBXScriptConnection",
]);

/** Variadic input pins are numbered: a0, a1, a2. */
export const VARIADIC_PIN = /^a\d+$/;

function luauType(t: string | undefined): string {
	if (!t) return "any";
	if (t === "table") return "{ [any]: any }";
	if (t === "function") return "(...any) -> ...any";
	return LUAU_TYPES.has(t) ? t : "any";
}

export function emit(script: NodeScript, registry: Registry, sourceHash: string): EmitResult {
	return new Emitter(script, registry, sourceHash).run();
}

class Emitter {
	private index: GraphIndex;
	private names = new NameScope();
	private out: OutLine[] = [];
	private indent = 0;
	private diagnostics: Diagnostic[] = [];
	/** Guards against an exec wire looping back and emitting forever. */
	private execStack = new Set<string>();
	/**
	 * Whether the statement just emitted ends its block.
	 *
	 * Luau requires `return`, `break` and `continue` to be the last statement in
	 * a block, so anything that would follow one is not merely unreachable — it
	 * does not parse. Tracked here rather than inferred afterwards, because by
	 * the time the text exists the block structure is gone.
	 */
	private terminated = false;
	/** function.entry node id -> the local it was bound to. */
	private functionNames = new Map<string, string>();
	/** ScriptVariable id -> the file-level local it was declared as. */
	private variableNames = new Map<string, string>();
	/**
	 * Service name -> the local it was hoisted to. Services are discovered
	 * while walking the graph but printed at the very top, which is what the
	 * separate preamble buffer is for.
	 */
	private services = new Map<string, string>();
	/** "root/path" -> the local a required module was hoisted to. */
	private requires = new Map<string, { ident: string; expression: string }>();
	private preamble: OutLine[] = [];

	constructor(
		private script: NodeScript,
		registry: Registry,
		private sourceHash: string,
	) {
		this.index = new GraphIndex(script, registry);
		// Anything Luau itself provides must not be shadowed by a generated name.
		for (const g of ["game", "workspace", "script", "shared", "require", "print", "warn", "table", "math", "string", "task", "Instance", "Vector3", "Color3", "CFrame", "Enum", "tostring", "tonumber", "pairs", "ipairs", "next", "select", "type", "typeof"]) {
			this.names.reserve(g);
		}
	}

	run(): EmitResult {
		const root = new Scope();

		this.emitVariables();
		this.emitFunctions(root);
		this.emitMainFlow(root);
		this.emitModuleReturn(root);

		// Services were collected during the walk above; they belong at the top,
		// below the flags, the way a hand-written Roblox file has them.
		this.flushPreamble();

		const lines = [...this.preamble, ...this.out];
		const body = this.render(lines);
		const outputHash = hashString(body);
		const header = this.header(outputHash);
		const headerLines = header.split("\n").length;

		const sourceMap = lines
			.map((l, i) => (l.node ? { line: headerLines + i + 1, node: l.node } : null))
			.filter((x): x is { line: number; node: string } => x !== null);

		return {
			code: header + body,
			diagnostics: this.diagnostics,
			sourceMap,
			outputHash,
		};
	}

	// -- output plumbing ---------------------------------------------------

	private push(text: string, node?: string): void {
		for (const line of text.split("\n")) {
			this.out.push({ text: line, indent: this.indent, node });
		}
	}

	private blank(): void {
		if (this.out.length > 0 && this.out[this.out.length - 1].text !== "") {
			this.out.push({ text: "", indent: 0 });
		}
	}

	private render(lines: OutLine[]): string {
		const body = lines
			.map((l) => (l.text === "" ? "" : "\t".repeat(l.indent) + l.text))
			.join("\n");
		return body.endsWith("\n") ? body : body + "\n";
	}

	/**
	 * Writes the hoisted locals into the preamble, in the order they were first
	 * asked for. That order is deterministic because the walk is.
	 *
	 * Services come before requires, because a required module's path usually
	 * starts at a service and Luau reads a file top to bottom.
	 */
	private flushPreamble(): void {
		if (this.services.size === 0 && this.requires.size === 0) return;

		for (const [service, ident] of this.services) {
			this.preamble.push({
				text: `local ${ident} = game:GetService(${quoteString(service)})`,
				indent: 0,
			});
		}
		if (this.services.size > 0 && this.requires.size > 0) {
			this.preamble.push({ text: "", indent: 0 });
		}
		for (const { ident, expression } of this.requires.values()) {
			this.preamble.push({ text: `local ${ident} = require(${expression})`, indent: 0 });
		}
		this.preamble.push({ text: "", indent: 0 });
	}

	/**
	 * The Luau expression a path node starts from, registering the service if
	 * the root names one. `game`, `script` and `workspace` need no declaration.
	 */
	private resolveRoot(root: string): string {
		if (!isRobloxService(root)) return root;
		const existing = this.services.get(root);
		if (existing) return existing;
		const ident = this.names.unique(root, "service");
		this.services.set(root, ident);
		return ident;
	}

	/** Reads a pin's literal as plain text. Empty when the pin is wired. */
	private literalText(r: ResolvedNode, pinId: string): string {
		if (this.index.sourceOf(r.node.id, pinId)) return "";
		const pin = this.pin(r, pinId, "in");
		const literal = r.node.literals?.[pinId] ?? pin.default;
		if (!literal) return "";
		return literal.t === "string" || literal.t === "raw" ? literal.v.trim() : "";
	}

	private header(outputHash: string): string {
		const lines: string[] = [];
		if (this.script.strict) lines.push("--!strict");
		lines.push("-- Generated by Roswaal. Do not edit this file directly;");
		lines.push(`-- edit ${this.script.name}.nodescript and recompile instead.`);
		lines.push(`-- roswaal-graph: ${this.script.id}`);
		lines.push(`-- roswaal-source: ${this.sourceHash}`);
		lines.push(`-- roswaal-output: ${outputHash}`);
		lines.push("");
		return lines.join("\n") + "\n";
	}

	private error(message: string, node?: string, pin?: string): void {
		this.diagnostics.push({ severity: "error", message, node, pin });
	}

	private warn(message: string, node?: string, pin?: string): void {
		this.diagnostics.push({ severity: "warning", message, node, pin });
	}

	// -- top-level sections ------------------------------------------------

	/**
	 * Script variables become file-level locals, declared before anything else
	 * so that functions and the main flow can both see them. They are emitted in
	 * declaration order rather than sorted, because the order is the author's
	 * and shows up in the generated file.
	 */
	private emitVariables(): void {
		const variables = this.script.variables ?? [];
		if (variables.length === 0) return;

		// Two passes: claim every name before emitting, so a variable declared
		// later cannot be renamed out from under an earlier one.
		for (const variable of variables) {
			this.variableNames.set(
				variable.id,
				this.names.unique(variable.name || "variable", "variable"),
			);
		}
		for (const variable of variables) {
			const ident = this.variableNames.get(variable.id)!;
			const annotation =
				this.script.strict && variable.type && variable.type !== "any"
					? `: ${luauType(variable.type)}`
					: "";
			if (variable.description) this.push(`-- ${variable.description}`);
			this.push(`local ${ident}${annotation} = ${literalToLuau(variable.default)}`);
		}
		this.blank();
	}

	private emitFunctions(root: Scope): void {
		const entries = this.index
			.all()
			.filter((r) => r.def.id === "function.entry")
			.sort((a, b) => a.node.y - b.node.y || a.node.x - b.node.x || a.node.id.localeCompare(b.node.id));

		// Reserve every function name up front so mutual recursion resolves.
		for (const fn of entries) {
			const sig = (fn.node.config ?? {}) as Signature;
			const name = this.names.unique(sig.name || fn.node.label || "fn", "fn");
			this.functionNames.set(fn.node.id, name);
		}

		for (const fn of entries) {
			const sig = (fn.node.config ?? {}) as Signature;
			const name = this.functionNames.get(fn.node.id)!;
			const scope = new Scope(root);

			const params = (sig.params ?? []).map((p, i) => {
				const ident = this.names.unique(p.name || `arg${i + 1}`, `arg${i + 1}`);
				scope.bindings.set(`${fn.node.id}/p${i}`, ident);
				return `${ident}: ${luauType(p.type)}`;
			});

			const returns = sig.returns ?? [];
			const retType =
				returns.length === 0
					? "()"
					: returns.length === 1
						? luauType(returns[0].type)
						: `(${returns.map((r) => luauType(r.type)).join(", ")})`;

			this.blank();
			this.push(`local function ${name}(${params.join(", ")}): ${retType}`, fn.node.id);
			this.indent++;
			this.walk(this.index.execTarget(fn.node.id, "then"), scope);
			this.indent--;
			this.push("end", fn.node.id);
			this.blank();

			// Bind the function itself so Module Exports and Connect can wire it.
			root.bindings.set(`${fn.node.id}/self`, name);
		}
	}

	private emitMainFlow(root: Scope): void {
		const entries = this.index
			.all()
			.filter((r) => r.def.id === "script.begin")
			.sort((a, b) => a.node.y - b.node.y || a.node.id.localeCompare(b.node.id));

		if (entries.length > 1) {
			this.warn(
				`This graph has ${entries.length} Script Start nodes. They are emitted top to bottom by position.`,
				entries[1].node.id,
			);
		}
		for (const entry of entries) {
			this.walk(this.index.execTarget(entry.node.id, "then"), root);
		}
	}

	private emitModuleReturn(root: Scope): void {
		const exportsNodes = this.index.all().filter((r) => r.def.id === "module.exports");

		if (this.script.scriptClass !== "ModuleScript") {
			if (exportsNodes.length > 0) {
				this.warn(
					"Module Exports only has an effect in a ModuleScript. This graph compiles to a " +
						`${this.script.scriptClass}, so the node was ignored.`,
					exportsNodes[0].node.id,
				);
			}
			return;
		}
		if (exportsNodes.length === 0) {
			this.warn("A ModuleScript needs a Module Exports node; this one returns nothing.");
			return;
		}
		if (exportsNodes.length > 1) {
			this.error("A ModuleScript can only have one Module Exports node.", exportsNodes[1].node.id);
		}

		const node = exportsNodes[0];
		const exports = node.inputs.filter((p) => p.kind === "data");
		this.blank();

		// A single input named "value" (the default) returns that value directly,
		// which is what a module exporting one function or one class wants.
		const single = exports.length === 1 && (exports[0].name === "value" || exports[0].name === "");
		if (single) {
			this.push(`return ${this.resolveInput(node, exports[0], root)}`, node.node.id);
			return;
		}

		const entries = exports.map((pin) => {
			const key = toIdentifier(pin.name || pin.id, pin.id);
			return `${key} = ${this.resolveInput(node, pin, root)},`;
		});
		this.push("return {", node.node.id);
		this.indent++;
		for (const e of entries) this.push(e, node.node.id);
		this.indent--;
		this.push("}", node.node.id);
	}

	// -- execution walk ----------------------------------------------------

	private walk(startId: string | undefined, scope: Scope): boolean {
		// Nodes stay on the stack for the whole chain, not just their own
		// emission, so a wire back into an earlier node is caught rather than
		// emitted forever. Nested walks (branch and loop bodies) see the outer
		// chain too, which is exactly the check we want there as well.
		const entered: string[] = [];
		let current = startId;
		this.terminated = false;

		while (current) {
			if (this.execStack.has(current)) {
				this.error(
					"Execution wires loop back on themselves. Use a loop node instead of wiring exec into an earlier node.",
					current,
				);
				break;
			}
			const resolved = this.index.get(current);
			if (!resolved) {
				this.error(`Unknown node "${current}" in the execution chain.`, current);
				break;
			}
			this.execStack.add(current);
			entered.push(current);
			this.terminated = false;
			current = this.emitNode(resolved, scope);
			// Nothing may follow a return, break or continue in the same block.
			if (this.terminated) break;
		}

		for (const id of entered) this.execStack.delete(id);
		const ended = this.terminated;
		this.terminated = false;
		return ended;
	}

	/** Emits one node and returns the next node in the chain, if any. */
	private emitNode(r: ResolvedNode, scope: Scope): string | undefined {
		if (r.def.targets && !r.def.targets.includes(this.script.target)) {
			this.warn(
				`"${r.def.title}" is not available for the ${this.script.target} target.`,
				r.node.id,
			);
		}
		const spec = r.def.compilesTo;
		switch (spec.kind) {
			case "builtin":
				return this.emitBuiltin(spec.handler, r, scope);
			case "call":
				return this.emitCall(r, spec.template, spec.result, scope);
			case "statement":
				return this.emitStatement(r, spec.template, scope);
			case "expr":
				this.error(
					`"${r.def.title}" is a pure node and cannot be placed in an execution chain.`,
					r.node.id,
				);
				return undefined;
		}
	}

	private emitCall(r: ResolvedNode, template: string, resultPin: string, scope: Scope): string | undefined {
		const pin = r.outputs.find((p) => p.id === resultPin);
		const consumed = this.index.consumerCount(r.node.id, resultPin) > 0;
		const rendered = this.renderTemplate(r, template, scope);

		if (consumed) {
			const hint = r.node.label || pin?.name || r.def.title;
			const ident = this.names.unique(hint, "value");
			const annotation = this.script.strict && pin?.type && pin.type !== "any"
				? `: ${luauType(pin.type)}`
				: "";
			this.push(`local ${ident}${annotation} = ${rendered}`, r.node.id);
			scope.bindings.set(`${r.node.id}/${resultPin}`, ident);
		} else if (isCallStatement(rendered)) {
			this.push(rendered, r.node.id);
		} else {
			// A bare expression is not a statement in Luau, so bind and discard.
			this.push(`local ${this.names.temp()} = ${rendered}`, r.node.id);
		}
		return this.index.execTarget(r.node.id, "then");
	}

	private emitStatement(r: ResolvedNode, template: string, scope: Scope): string | undefined {
		const outs = r.outputs.filter(
			(p) => p.kind === "data" && this.index.consumerCount(r.node.id, p.id) > 0,
		);
		for (const pin of outs) {
			const ident = this.names.unique(pin.name || pin.id, "value");
			scope.bindings.set(`${r.node.id}/${pin.id}`, ident);
		}
		if (outs.length > 0) {
			const idents = outs.map((p) => scope.bindings.get(`${r.node.id}/${p.id}`)!);
			this.push(`local ${idents.join(", ")}`, r.node.id);
		}
		const rendered = this.renderTemplate(r, template, scope);
		if (rendered.trim() !== "") this.push(rendered, r.node.id);
		return this.index.execTarget(r.node.id, "then");
	}

	// -- builtin flow ------------------------------------------------------

	private emitBuiltin(handler: string, r: ResolvedNode, scope: Scope): string | undefined {
		const id = r.node.id;
		switch (handler) {
			case "script.begin":
			case "flow.rerouteExec":
				// A reroute is a bend in the wire, not a step. Nothing is emitted.
				return this.index.execTarget(id, "then");

			case "script.end":
				this.terminated = true;
				return undefined;

			case "function.entry":
				this.error(
					"A Function node cannot be wired into another execution chain; it is its own entry point.",
					id,
				);
				return undefined;

			case "function.return": {
				const values = r.inputs.filter((p) => p.kind === "data");
				const parts = values.map((p) => this.resolveInput(r, p, scope));
				this.push(parts.length ? `return ${parts.join(", ")}` : "return", id);
				this.terminated = true;
				return undefined;
			}

			case "module.exports":
				return undefined;

			case "call.invoke": {
				// One handler for both call nodes: the only difference is whether
				// the callee is a wired value or a method name on an object.
				const args = r.inputs
					.filter((p) => VARIADIC_PIN.test(p.id))
					.map((p) => this.resolveInput(r, p, scope));

				let callee: string;
				if (r.def.id === "call.method") {
					const object = paren(this.resolveInput(r, this.pin(r, "object", "in"), scope));
					const method = toIdentifier(this.literalText(r, "method"), "method");
					if (this.index.sourceOf(id, "method")) {
						this.error(
							"Call Method needs the method name typed in: it becomes part of the generated code.",
							id,
							"method",
						);
						return this.index.execTarget(id, "then");
					}
					callee = `${object}:${method}`;
				} else {
					callee = paren(this.resolveInput(r, this.pin(r, "fn", "in"), scope));
				}

				const expression = `${callee}(${args.join(", ")})`;
				if (this.index.consumerCount(id, "result") > 0) {
					const ident = this.names.unique(r.node.label || "result", "result");
					this.push(`local ${ident} = ${expression}`, id);
					scope.bindings.set(`${id}/result`, ident);
				} else {
					this.push(expression, id);
				}
				return this.index.execTarget(id, "then");
			}

			case "variable.set": {
				const ref = (r.node.config ?? {}) as VariableRef;
				const ident = ref.variable ? this.variableNames.get(ref.variable) : undefined;
				const value = this.resolveInput(r, this.pin(r, "value", "in"), scope);
				if (!ident) {
					this.error(
						ref.variable
							? `Set Variable points at a variable that no longer exists.`
							: `Set Variable has no variable chosen.`,
						id,
					);
					return this.index.execTarget(id, "then");
				}
				this.push(`${ident} = ${value}`, id);
				// The pass-through output is the variable itself, so a Set can sit
				// mid-chain and feed the value onwards without a second read.
				scope.bindings.set(`${id}/value`, ident);
				return this.index.execTarget(id, "then");
			}

			case "variable.get":
			case "function.get":
			case "service.get":
			case "instance.path":
			case "module.requirePath":
				this.error(
					`"${r.def.title}" is a pure node and cannot be placed in an execution chain.`,
					id,
				);
				return undefined;

			case "flow.branch": {
				const cond = this.resolveInput(r, this.pin(r, "condition", "in"), scope);
				const onTrue = this.index.execTarget(id, "true");
				const onFalse = this.index.execTarget(id, "false");
				this.push(`if ${cond} then`, id);
				this.indent++;
				this.walk(onTrue, new Scope(scope));
				this.indent--;
				if (onFalse) {
					this.push("else", id);
					this.indent++;
					this.walk(onFalse, new Scope(scope));
					this.indent--;
				}
				this.push("end", id);
				// The if-statement is closed, so the enclosing block continues
				// regardless of what happened inside it.
				this.terminated = false;
				return undefined;
			}

			case "flow.sequence": {
				// Every output runs in this same block, one after another, so a
				// branch that returns really does end the block — and Luau will
				// not accept anything after it.
				const pins = r.outputs.filter((p) => p.kind === "exec");
				for (let i = 0; i < pins.length; i++) {
					const ended = this.walk(this.index.execTarget(id, pins[i].id), scope);
					if (!ended) continue;

					const remaining = pins
						.slice(i + 1)
						.filter((pin) => this.index.execTarget(id, pin.id) !== undefined);
					if (remaining.length > 0) {
						this.error(
							`"${pins[i].name || pins[i].id}" ends the block, so the ${remaining.length} ` +
								"output(s) after it could never run. Move them above it, or put the " +
								"return inside a Branch.",
							id,
							pins[i].id,
						);
					}
					this.terminated = true;
					return undefined;
				}
				return undefined;
			}

			case "flow.forRange": {
				const first = this.resolveInput(r, this.pin(r, "first", "in"), scope);
				const last = this.resolveInput(r, this.pin(r, "last", "in"), scope);
				const step = this.resolveInput(r, this.pin(r, "step", "in"), scope);
				const body = new Scope(scope, true);
				const idx = this.names.unique(r.node.label || "i", "i");
				body.bindings.set(`${id}/index`, idx);
				const stepPart = step === "1" ? "" : `, ${step}`;
				this.push(`for ${idx} = ${first}, ${last}${stepPart} do`, id);
				this.indent++;
				this.walk(this.index.execTarget(id, "body"), body);
				this.indent--;
				this.push("end", id);
				this.terminated = false;
				return this.index.execTarget(id, "completed");
			}

			case "flow.forEach":
			case "flow.forIndex": {
				const isArray = handler === "flow.forIndex";
				const source = this.resolveInput(r, this.pin(r, "table", "in"), scope);
				const body = new Scope(scope, true);
				const keyPin = isArray ? "index" : "key";
				const k = this.names.unique(isArray ? "i" : "key", "key");
				const v = this.names.unique("value", "value");
				body.bindings.set(`${id}/${keyPin}`, k);
				body.bindings.set(`${id}/value`, v);
				this.push(`for ${k}, ${v} in ${isArray ? "ipairs" : "pairs"}(${source}) do`, id);
				this.indent++;
				this.walk(this.index.execTarget(id, "body"), body);
				this.indent--;
				this.push("end", id);
				this.terminated = false;
				return this.index.execTarget(id, "completed");
			}

			case "flow.while": {
				const condPin = this.pin(r, "condition", "in");
				const link = this.index.sourceOf(id, "condition");
				const src = link ? this.index.get(link.from.node) : undefined;
				if (src && !src.def.pure) {
					this.warn(
						"The While condition is produced by a node with side effects, so it is evaluated once " +
							"before the loop rather than on each iteration. Feed it a pure comparison instead.",
						id,
						"condition",
					);
				}
				const cond = this.resolveInput(r, condPin, scope);
				this.push(`while ${cond} do`, id);
				this.indent++;
				this.walk(this.index.execTarget(id, "body"), new Scope(scope, true));
				this.indent--;
				this.push("end", id);
				this.terminated = false;
				return this.index.execTarget(id, "completed");
			}

			case "flow.break":
			case "flow.continue": {
				const keyword = handler === "flow.break" ? "break" : "continue";
				if (!scope.inLoop()) {
					this.error(`"${keyword}" is only valid inside a loop body.`, id);
					return undefined;
				}
				this.push(keyword, id);
				this.terminated = true;
				return undefined;
			}

			case "event.connect": {
				const signal = this.resolveInput(r, this.pin(r, "signal", "in"), scope);
				const sig = (r.node.config ?? {}) as Signature;
				const body = new Scope(scope);
				const params = (sig.params ?? []).map((p, i) => {
					const ident = this.names.unique(p.name || `arg${i + 1}`, `arg${i + 1}`);
					body.bindings.set(`${id}/p${i}`, ident);
					return this.script.strict ? `${ident}: ${luauType(p.type)}` : ident;
				});
				const wantsConnection = this.index.consumerCount(id, "connection") > 0;
				let prefix = "";
				if (wantsConnection) {
					const ident = this.names.unique(r.node.label || "connection", "connection");
					scope.bindings.set(`${id}/connection`, ident);
					prefix = `local ${ident} = `;
				}
				this.push(`${prefix}${signal}:Connect(function(${params.join(", ")})`, id);
				this.indent++;
				this.walk(this.index.execTarget(id, "body"), body);
				this.indent--;
				this.push("end)", id);
				this.terminated = false;
				return this.index.execTarget(id, "then");
			}

			default:
				this.error(`Unimplemented builtin handler "${handler}".`, id);
				return undefined;
		}
	}

	/**
	 * How many places actually read this output, seeing through reroute knots.
	 *
	 * A knot is meant to be invisible, and it would not be if inserting one
	 * turned a value that was bound once into one evaluated twice. Counting
	 * through it keeps the generated code identical either way.
	 */
	private effectiveConsumers(nodeId: string, pinId: string, depth = 0): number {
		// A knot wired into itself is a graph error, not a reason to recurse
		// forever; the cap is generous enough that no real chain reaches it.
		if (depth > 64) return 2;

		let total = 0;
		for (const link of this.index.targetsOf(nodeId, pinId)) {
			const target = this.index.get(link.to.node);
			if (target?.def.id === "flow.reroute") {
				total += this.effectiveConsumers(link.to.node, "out", depth + 1);
			} else {
				total += 1;
			}
		}
		return total;
	}

	/**
	 * A pure builtin's expression. These always resolve to a plain identifier,
	 * which is why they bypass the hoisting rule entirely.
	 */
	private pureBuiltin(
		handler: string, src: ResolvedNode, consumer: ResolvedNode, scope: Scope,
	): string {
		switch (handler) {
			case "flow.reroute":
				// Passes its input through untouched, and is deliberately never
				// hoisted: a knot that bound a local would stop being invisible.
				return this.resolveInput(src, this.pin(src, "in", "in"), scope);

			case "variable.get": {
				const ref = (src.node.config ?? {}) as VariableRef;
				const ident = ref.variable ? this.variableNames.get(ref.variable) : undefined;
				if (!ident) {
					this.error(
						ref.variable
							? "Get Variable points at a variable that no longer exists."
							: "Get Variable has no variable chosen.",
						src.node.id,
					);
					return "nil";
				}
				return ident;
			}

			case "service.get": {
				const link = this.index.sourceOf(src.node.id, "service");
				if (link) {
					this.error(
						"Get Service needs the service typed in, not wired: the name becomes a variable in " +
							"the generated file, so it has to be known before the script runs.",
						src.node.id,
						"service",
					);
					return "nil";
				}

				const name = this.literalText(src, "service");
				if (name === "") {
					this.error("Get Service has no service name.", src.node.id, "service");
					return "nil";
				}
				// One local per distinct service, however many nodes ask for it.
				// A name not on the built-in list still works: the list is a
				// dropdown, not a gate.
				const existing = this.services.get(name);
				if (existing) return existing;
				const ident = this.names.unique(name, "service");
				this.services.set(name, ident);
				return ident;
			}

			case "instance.path": {
				const root = this.literalText(src, "root");
				const path = this.literalText(src, "path");
				if (root === "") {
					this.error("Instance has no starting point chosen.", src.node.id, "root");
					return "nil";
				}
				// Inline, not hoisted: indexing is cheap, and the ordinary
				// multi-consumer rule already binds it to a local when it is read
				// more than once.
				return renderPath(this.resolveRoot(root), path);
			}

			case "module.requirePath": {
				const root = this.literalText(src, "root");
				const path = this.literalText(src, "path");
				if (root === "" || path === "") {
					this.error(
						"Require Module needs both a starting point and a path.",
						src.node.id,
						path === "" ? "path" : "root",
					);
					return "nil";
				}

				// One local per distinct module, however many nodes require it.
				const key = `${root}/${path}`;
				const existing = this.requires.get(key);
				if (existing) return existing.ident;

				const hint = this.literalText(src, "as") || lastSegment(path) || "module";
				const ident = this.names.unique(hint, "module");
				this.requires.set(key, {
					ident,
					expression: renderPath(this.resolveRoot(root), path),
				});
				return ident;
			}

			case "function.get": {
				const ref = (src.node.config ?? {}) as FunctionRef;
				const ident = ref.function ? this.functionNames.get(ref.function) : undefined;
				if (!ident) {
					this.error(
						ref.function
							? "Get Function points at a function that is no longer in this graph."
							: "Get Function has no function chosen.",
						src.node.id,
					);
					return "nil";
				}
				return ident;
			}

			default:
				this.error(
					`"${consumer.def.title}" reads "${src.def.title}", which has no value to give.`,
					src.node.id,
				);
				return "nil";
		}
	}

	// -- data resolution ---------------------------------------------------

	private pin(r: ResolvedNode, pinId: string, dir: "in" | "out"): PinDef {
		const list = dir === "in" ? r.inputs : r.outputs;
		const found = list.find((p) => p.id === pinId);
		if (found) return found;
		return { id: pinId, name: pinId, kind: "data", type: "any" };
	}

	/**
	 * The Luau expression for a data input: the upstream value if the pin is
	 * wired, otherwise the literal typed into it.
	 */
	private resolveInput(r: ResolvedNode, pin: PinDef, scope: Scope): string {
		const link = this.index.sourceOf(r.node.id, pin.id);
		if (!link) {
			const lit = r.node.literals?.[pin.id] ?? pin.default;
			if (lit === undefined) {
				if (pin.required !== false) {
					this.error(
						`"${r.def.title}" needs a value on "${pin.name || pin.id}".`,
						r.node.id,
						pin.id,
					);
				}
				return "nil";
			}
			return literalToLuau(lit);
		}
		return this.resolveOutput(link.from.node, link.from.pin, scope, r);
	}

	private resolveOutput(
		nodeId: string, pinId: string, scope: Scope, consumer: ResolvedNode,
	): string {
		const bound = scope.lookup(`${nodeId}/${pinId}`);
		if (bound) return bound;

		const src = this.index.get(nodeId);
		if (!src) {
			this.error(`"${consumer.def.title}" reads from a node that no longer exists.`, consumer.node.id);
			return "nil";
		}

		// A function entry's own name, so a function can be passed as a value.
		if (src.def.id === "function.entry" && pinId === "self") {
			return this.functionNames.get(nodeId) ?? "nil";
		}

		if (!src.def.pure) {
			this.error(
				`"${consumer.def.title}" reads "${src.def.title}", but that value is not in scope here. ` +
					"Impure values only exist inside the block that produced them; move the node, or " +
					"declare a variable in an outer block.",
				consumer.node.id,
			);
			return "nil";
		}

		const spec = src.def.compilesTo;

		// Pure builtins resolve to a bare identifier. They are deliberately never
		// hoisted: a variable read has to happen at its use site, or a Set
		// between two Gets would be invisible to the second one.
		if (spec.kind === "builtin") {
			return this.pureBuiltin(spec.handler, src, consumer, scope);
		}

		if (spec.kind !== "expr") {
			this.error(`"${src.def.title}" is marked pure but has no expression template.`, nodeId);
			return "nil";
		}
		const template = spec.outputs[pinId];
		if (template === undefined) {
			this.error(`"${src.def.title}" has no expression for output "${pinId}".`, nodeId);
			return "nil";
		}

		// Guard against a cycle among pure nodes, which would recurse forever.
		if (this.execStack.has(`pure:${nodeId}`)) {
			this.error(
				`"${src.def.title}" feeds itself through a loop of data wires.`,
				nodeId,
			);
			return "nil";
		}
		this.execStack.add(`pure:${nodeId}`);
		const expr = this.renderTemplate(src, template, scope);
		this.execStack.delete(`pure:${nodeId}`);

		// One consumer: splice it in. More: bind it once, so a side-effecting or
		// merely expensive expression is not evaluated twice.
		if (this.effectiveConsumers(nodeId, pinId) <= 1) return expr;

		const outPin = src.outputs.find((p) => p.id === pinId);
		const ident = this.names.unique(src.node.label || outPin?.name || src.def.title, "value");
		this.push(`local ${ident} = ${expr}`, nodeId);
		scope.bindings.set(`${nodeId}/${pinId}`, ident);
		return ident;
	}

	// -- templates ---------------------------------------------------------

	private renderTemplate(r: ResolvedNode, template: string, scope: Scope): string {
		// `$args(<separator>)` folds every variadic input pin into one list, so a
		// node whose arity is chosen per instance still compiles from a static
		// template. Each operand is parenthesised, because the separator is
		// usually an operator and precedence has to survive.
		template = template.replace(/\$args\(([^)]*)\)/g, (_match, separator: string) => {
			const args = r.inputs.filter((p) => VARIADIC_PIN.test(p.id));
			if (args.length === 0) return "";
			return args.map((p) => paren(this.resolveInput(r, p, scope))).join(separator);
		});

		const re = /\$(in|out)\.([A-Za-z_][A-Za-z0-9_]*)(?:!(ident|raw))?/g;
		return template.replace(re, (match: string, side: string, pinId: string, modifier: string | undefined, offset: number) => {
			if (side === "out") {
				const bound = scope.lookup(`${r.node.id}/${pinId}`);
				if (bound) return bound;
				// Not consumed by anything, so nothing was bound. Discard safely.
				return this.names.temp();
			}
			const pin = this.pin(r, pinId, "in");

			if (modifier) {
				const link = this.index.sourceOf(r.node.id, pinId);
				if (link) {
					this.error(
						`"${pin.name || pinId}" on "${r.def.title}" must be typed in directly; ` +
							"it becomes part of the generated code, not a runtime value.",
						r.node.id,
						pinId,
					);
					return modifier === "ident" ? "_invalid" : "";
				}
				const lit: Literal | undefined = r.node.literals?.[pinId] ?? pin.default;
				const text =
					lit === undefined ? "" : lit.t === "string" || lit.t === "raw" ? lit.v : String((lit as { v?: unknown }).v ?? "");
				return modifier === "ident" ? toIdentifier(text, "field") : text;
			}

			const expr = this.resolveInput(r, pin, scope);
			// Only guard precedence where the template actually places the value
			// next to an operator. Wrapping every argument would be correct but
			// would make print((x)) of everything.
			return needsParens(template, offset, offset + match.length) ? paren(expr) : expr;
		});
	}
}

/**
 * Whether a value spliced at this position in a template needs parentheses.
 *
 * The test is purely lexical: what sits immediately either side of the
 * placeholder in the template. That is enough because templates are short and
 * hand-written, and erring towards a redundant pair of parentheses is cheap
 * while erring the other way silently reassociates the expression.
 */
function needsParens(template: string, start: number, end: number): boolean {
	const before = template.slice(0, start).trimEnd();
	const after = template.slice(end).trimStart();
	return forcedByFollowing(after) || forcedByPreceding(before);
}

const PREFIX_OPERATORS = "+-*/%^#<>.:";
const SUFFIX_OPERATORS = "+-*/%^<>.:[(";
const COMPARISONS = ["==", "~=", "<=", ">="];

function forcedByPreceding(before: string): boolean {
	if (before === "") return false;
	const word = /[A-Za-z_][A-Za-z0-9_]*$/.exec(before)?.[0];
	if (word) return word === "not" || word === "and" || word === "or";
	if (COMPARISONS.some((op) => before.endsWith(op)) || before.endsWith("..")) return true;
	const last = before[before.length - 1];
	// A lone "=" is an assignment or a comparison's right-hand side; both are
	// already at the lowest precedence, so nothing needs wrapping.
	if (last === "=") return false;
	return PREFIX_OPERATORS.includes(last);
}

function forcedByFollowing(after: string): boolean {
	if (after === "") return false;
	if (COMPARISONS.some((op) => after.startsWith(op))) return true;
	// A lone "=" means this placeholder is the assignment target, and Luau will
	// not accept a parenthesised one in every position.
	if (after.startsWith("=")) return false;
	const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(after)?.[0];
	if (word) return word === "and" || word === "or";
	return SUFFIX_OPERATORS.includes(after[0]);
}

/** True when the expression is also a valid Luau statement (a function call). */
function isCallStatement(expr: string): boolean {
	const e = expr.trim();
	if (!e.endsWith(")")) return false;
	if (!/^[A-Za-z_(]/.test(e)) return false;
	return isAtomic(e) && /[.:\w]\s*\(/.test(e);
}

/**
 * FNV-1a, widened to 64 bits. Dependency-free so the browser and the server
 * compute identical hashes, which is what makes stale-output detection work.
 */
export function hashString(input: string): string {
	let h1 = 0x811c9dc5;
	let h2 = 0x01000193;
	for (let i = 0; i < input.length; i++) {
		const c = input.charCodeAt(i);
		h1 ^= c;
		h1 = Math.imul(h1, 0x01000193) >>> 0;
		h2 ^= c + i;
		h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
	}
	return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export { indentBlock };
