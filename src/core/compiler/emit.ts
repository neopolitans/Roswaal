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
import { FUNCTION_NODES } from "../nodes/flow.js";
import type { Literal, NodeScript, PinDef } from "../schema.js";
import type { Signature } from "../nodes/flow.js";
import type { FunctionRef, VariableRef } from "../nodes/variables.js";
import { isService as isRobloxService, lastSegment, renderPath } from "../roblox.js";
import { nodeTitle, type Registry } from "../nodes/index.js";
import {
	modeOf, partPinId, splitKey, splitPinId, splitsOf, STRUCTS, type StructMode,
} from "../structs.js";

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

/**
 * Lua's reserved words, which cannot be a field name written plainly.
 *
 * `continue` is in here and is not actually reserved in Luau — it is
 * contextual, and `t.continue` compiles. Bracketing it anyway costs three
 * characters in a file nobody will notice, and the alternative is being subtly
 * wrong about a keyword list if Luau ever tightens one.
 */
const LUAU_RESERVED = new Set([
	"and", "break", "do", "else", "elseif", "end", "false", "for", "function",
	"if", "in", "local", "nil", "not", "or", "repeat", "return", "then", "true",
	"until", "while", "continue",
]);

/**
 * The name inside a rendered key, when the key can be written without brackets.
 *
 * `t["tuning"]` and `t.tuning` are the same table access, and Luau accepts
 * both — but only one of them is what anybody writes, and the generated file is
 * meant to be read beside hand-written Luau. Returns null whenever the short
 * form would change the meaning or not compile: a computed key, a key with a
 * space in it, a number, a reserved word.
 */
function plainKey(rendered: string): string | null {
	const match = /^"([A-Za-z_][A-Za-z0-9_]*)"$/.exec(rendered);
	if (!match) return null;
	return LUAU_RESERVED.has(match[1]) ? null : match[1];
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

/** Variadic input pins are numbered: a0, a1, a2. */
export const VARIADIC_PIN = /^a\d+$/;

/**
 * The Luau a pin's type is written as.
 *
 * This used to check the name against a list of fifteen and write `any` for
 * everything else, which meant a parameter typed `Model` came out `any` and so
 * did one typed `Config` -- a type the same file had just declared. Neither was
 * a mistake anybody could see: the graph said `Model`, the file said `any`, and
 * nothing said why.
 *
 * Now anything shaped like a type name is written as itself. A name Luau does
 * not know is an error it reports, naming the line, which is a better answer
 * than silently having no type at all.
 */
function luauType(t: string | undefined): string {
	if (!t) return "any";
	if (t === "table") return "{ [any]: any }";
	if (t === "function") return "(...any) -> ...any";
	if (EDITOR_ONLY_TYPES.has(t)) return "any";
	return TYPE_NAME.test(t) ? t : "any";
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
	 * Variables whose declaration is an `Initialize Variable` node rather than
	 * the block at the top of the file.
	 *
	 * Two sets rather than one, because "will be declared later" and "has been
	 * declared by now" are different questions and both get asked. The first
	 * decides whether to skip the top-of-file line; the second catches a read
	 * that happens before the declaration it depends on, which Luau would
	 * otherwise compile into a reference to a global that is always nil.
	 */
	/** Type names already written, from either kind of declaration node. */
	private declaredTypes = new Set<string>();
	private initialisedLater = new Set<string>();
	private declaredSoFar = new Set<string>();
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

		this.emitTypes();
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
		/**
		 * How many lines the header occupies.
		 *
		 * `split("\n").length` is one too many: the header ends with a newline,
		 * so splitting leaves a trailing empty string that is not a line. That
		 * off-by-one put every entry in the source map one line late — the first
		 * statement was attributed to the line below it, and the last node to the
		 * blank line at the end of the file.
		 *
		 * It survived from the day the map was written until the day something
		 * finally read it, which is the argument for building a consumer rather
		 * than trusting a mapping nothing exercises.
		 */
		const headerLines = header.split("\n").length - 1;

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

	/**
	 * One statement, which may run to several lines.
	 *
	 * Leading tabs in the text are **relative** indentation, added to the
	 * statement's own rather than left in the line to be indented again. A
	 * multi-line expression — a table written one key to a line — can then
	 * indent its own body without knowing how deep the statement it lands in
	 * happens to be.
	 */
	private push(text: string, node?: string): void {
		for (const line of text.split("\n")) {
			const inner = line.length - line.replace(/^\t+/, "").length;
			this.out.push({ text: line.slice(inner), indent: this.indent + inner, node });
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
	private requireClient(r: ResolvedNode, title: string): void {
		if (this.script.scriptClass === "LocalScript") return;
		const where =
			this.script.scriptClass === "ModuleScript"
				? "a ModuleScript, so this is only correct if it is required from the client"
				: "a Script, which runs on the server, where it is always nil";
		this.warn(`"${title}" is client-only. This graph is ${where}.`, r.node.id);
	}

	/** Reads a pin's literal as plain text. Empty when the pin is wired. */
	private literalText(r: ResolvedNode, pinId: string): string {
		if (this.index.sourceOf(r.node.id, pinId)) return "";
		const pin = this.pin(r, pinId, "in");
		const literal = r.node.literals?.[pinId] ?? pin.default;
		if (!literal) return "";
		return literal.t === "string" || literal.t === "raw" ? literal.v.trim() : "";
	}

	/**
	 * Whether generated locals and parameters carry type annotations.
	 *
	 * Tied to the mode line rather than to `strict` alone: on Roblox nonstrict is
	 * already what an unmarked file gets, so `--!nonstrict` with no annotations
	 * would be a setting that changes one comment and nothing else.
	 */
	/**
	 * Whether this node was told to write every key in brackets.
	 *
	 * A setting rather than a rule, because both forms are ordinary Luau and
	 * which one reads better depends on the table: a settings table wants
	 * `tuning.turnRate`, and a table keyed by names that only happen to be
	 * identifiers today wants the brackets it will still need tomorrow.
	 */
	private bracketsOnly(r: ResolvedNode): boolean {
		return (r.node.config as { keys?: string } | undefined)?.keys === "brackets";
	}

	private get annotates(): boolean {
		return this.script.typecheck !== "default";
	}

	private header(outputHash: string): string {
		const lines: string[] = [];
		if (this.script.typecheck === "strict") lines.push("--!strict");
		else if (this.script.typecheck === "nonstrict") lines.push("--!nonstrict");
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
	/**
	 * The Luau on the right of a type declaration.
	 *
	 * Two shapes rather than one. A table of fields is a list of pairs, which is
	 * what the editor can lay out and check — and it is what most exported types
	 * in a Roblox module actually are. Everything else Luau can say about a type
	 * is written out, because building a grammar for unions, generics and
	 * function types would be building a second language inside the first.
	 */
	private typeDefinition(
		config: { definition?: string; shape?: string; fields?: { name?: string; type?: string }[] },
		nodeId: string,
	): string {
		if (config.shape === "written") return (config.definition ?? "").trim();

		const fields = config.fields ?? [];
		// No shape recorded and no fields is a node that was made before the
		// field list existed, or one somebody typed into and then switched away
		// from; either way its written definition is what it means.
		if (fields.length === 0) return (config.definition ?? "").trim();

		const parts: string[] = [];
		for (const field of fields) {
			const fieldName = (field.name ?? "").trim();
			const fieldType = (field.type ?? "").trim();
			if (fieldName === "" || fieldType === "") {
				this.error("A field in this type has no name or no type.", nodeId);
				return "";
			}
			if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(fieldName)) {
				this.error(
					`"${fieldName}" is not a name Luau will take for a field. Letters, digits and ` +
					"underscores, not starting with a digit.",
					nodeId,
				);
				return "";
			}
			parts.push(`${fieldName}: ${fieldType}`);
		}
		return `{ ${parts.join(", ")} }`;
	}

	private emitTypes(): void {
		const nodes = this.index.all().filter((r) => r.def.id === "type.declareTop");
		if (nodes.length === 0) return;

		let written = 0;
		for (const r of nodes) {
			const config = (r.node.config ?? {}) as {
				name?: string; definition?: string; export?: boolean;
				shape?: string; fields?: { name?: string; type?: string }[];
			};
			const name = (config.name ?? "").trim();
			const definition = this.typeDefinition(config, r.node.id);
			if (name === "" || definition === "") {
				this.error(
					"Declare Type at Top needs both a name and a definition before it can be written.",
					r.node.id,
				);
				continue;
			}
			if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
				this.error(
					`"${name}" is not a name Luau will take for a type. Letters, digits and ` +
					"underscores, not starting with a digit.",
					r.node.id,
				);
				continue;
			}
			if (this.declaredTypes.has(name)) {
				this.error(`The type "${name}" is declared more than once.`, r.node.id);
				continue;
			}
			this.declaredTypes.add(name);
			// Reserved so a variable or local can never be given the same
			// identifier: Luau keeps types and values apart, but a reader does not.
			this.names.reserve(name);
			const prefix = config.export === false ? "type" : "export type";
			this.push(`${prefix} ${name} = ${definition}`, r.node.id);
			written++;
		}
		if (written > 0) this.blank();
	}

	private emitVariables(): void {
		const variables = this.script.variables ?? [];
		if (variables.length === 0) return;

		// Which variables an Initialize node is going to declare. Collected
		// before anything is written, because the decision is whether to write
		// the line at all.
		for (const r of this.index.all()) {
			if (r.def.id !== "variable.init") continue;
			const ref = (r.node.config ?? {}) as { variable?: string };
			if (ref.variable) this.initialisedLater.add(ref.variable);
		}

		// Two passes: claim every name before emitting, so a variable declared
		// later cannot be renamed out from under an earlier one.
		for (const variable of variables) {
			this.variableNames.set(
				variable.id,
				this.names.unique(variable.name || "variable", "variable"),
			);
		}
		let written = 0;
		for (const variable of variables) {
			if (this.initialisedLater.has(variable.id)) continue;
			const ident = this.variableNames.get(variable.id)!;
			const annotation =
				this.annotates && variable.type && variable.type !== "any"
					? `: ${luauType(variable.type)}`
					: "";
			if (variable.description) this.push(`-- ${variable.description}`);
			this.push(`local ${ident}${annotation} = ${literalToLuau(variable.default)}`);
			this.declaredSoFar.add(variable.id);
			written++;
		}
		if (written > 0) this.blank();
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
		const pin = r.baseOutputs.find((p) => p.id === resultPin);
		const consumed = this.index.consumerCount(r.node.id, resultPin) > 0;
		const rendered = this.renderTemplate(r, template, scope);

		if (consumed) {
			/**
			 * What to call the local this result lands in.
			 *
			 * `resultName` first, which is the field that says so. The label is
			 * still honoured behind it: it named results before there was a field
			 * for it, and a graph built that way should go on emitting what it
			 * always did.
			 */
			const named = (r.node.config as { resultName?: string } | undefined)?.resultName;
			const hint = named || r.node.label || pin?.name || r.def.title;
			const ident = this.names.unique(hint, "value");
			const annotation = this.annotates && pin?.type && pin.type !== "any"
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

	/**
	 * A statement node, whose data outputs are locals the template assigns to.
	 *
	 * ## Why every *referenced* output is declared, not every consumed one
	 *
	 * A node returning several values assigns to all of them at once —
	 * `$out.h, $out.s, $out.v = $in.color:ToHSV()` — whether or not anything is
	 * wired to each. Declaring only the consumed ones left the rest as bare
	 * names on the left of an assignment, which in Luau creates **globals**:
	 * silent, and the sort of bug that turns up as one script writing over
	 * another's state weeks later.
	 *
	 * So the template is scanned, and an output it mentions is declared even
	 * when nothing reads it. An unread one binds to `_`, which is the Lua idiom
	 * for a value being deliberately dropped and keeps the positions lined up —
	 * `local value, _, _` is exactly as long as the assignment needs to be.
	 *
	 * Nothing in the built-in library relies on this yet: the datatype nodes
	 * that return several values are pure and use `select`, because a colour
	 * conversion should not be an execution step. It is here so that the next
	 * node that does need it finds working machinery rather than a trap.
	 */
	private emitStatement(r: ResolvedNode, template: string, scope: Scope): string | undefined {
		const referenced = new Set(
			[...template.matchAll(/\$out\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]),
		);
		const outs = r.baseOutputs.filter(
			(p) =>
				p.kind === "data" &&
				(this.index.consumerCount(r.node.id, p.id) > 0 || referenced.has(p.id)),
		);

		const idents: string[] = [];
		for (const pin of outs) {
			const consumed = this.index.consumerCount(r.node.id, pin.id) > 0;
			const ident = consumed ? this.names.unique(pin.name || pin.id, "value") : "_";
			// Bound either way. An unconsumed one still has to resolve to
			// something the template can assign to, and leaving it unbound is
			// what sent it to a global in the first place.
			scope.bindings.set(`${r.node.id}/${pin.id}`, ident);
			idents.push(ident);
		}
		if (idents.length > 0) this.push(`local ${idents.join(", ")}`, r.node.id);

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

			case "function.declareHere": {
				const sig = (r.node.config ?? {}) as Signature;
				const name = (sig.name || r.node.label || "").trim();
				if (name === "") {
					this.error("Declare Function needs a name before it can be written.", id);
					return this.index.execTarget(id, "then");
				}
				if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
					this.error(
						`"${name}" is not a name Luau will take for a function. Letters, digits and ` +
						"underscores, not starting with a digit.",
						id,
					);
					return this.index.execTarget(id, "then");
				}

				/**
				 * The table it hangs off, if any.
				 *
				 * `function T.name()` needs `T` to be a name -- Luau has no syntax
				 * for attaching a function to an expression, and `(expr).name = ...`
				 * is a different statement with different semantics. A variable or a
				 * local resolves to a bare identifier and works; anything else is
				 * refused rather than half-written.
				 */
				let owner: string | undefined;
				if (this.index.sourceOf(id, "owner")) {
					const resolved = this.resolveInput(r, this.pin(r, "owner", "in"), scope);
					if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(resolved)) {
						this.error(
							"On Table has to be a name Luau can attach a function to — a variable or " +
							`a local, not an expression. This one came out as \`${resolved}\`.`,
							id,
						);
						return this.index.execTarget(id, "then");
					}
					owner = resolved;
				}

				// An owned function is a field, not a local, so it takes no name of
				// its own and cannot collide with one.
				const ident = owner ? `${owner}.${name}` : this.names.unique(name, "fn");
				// Set before the body is walked, so the function can call itself and
				// so a Get Function inside it resolves.
				this.functionNames.set(id, ident);

				const body = new Scope(scope);
				const params = (sig.params ?? []).map((p, i) => {
					const arg = this.names.unique(p.name || `arg${i + 1}`, `arg${i + 1}`);
					body.bindings.set(`${id}/p${i}`, arg);
					return this.annotates ? `${arg}: ${luauType(p.type)}` : arg;
				});

				const returns = sig.returns ?? [];
				const retType =
					returns.length === 0
						? "()"
						: returns.length === 1
							? luauType(returns[0].type)
							: `(${returns.map((x) => luauType(x.type)).join(", ")})`;
				const signature = this.annotates ? `: ${retType}` : "";

				this.push(`${owner ? "" : "local "}function ${ident}(${params.join(", ")})${signature}`, id);
				this.indent++;
				this.walk(this.index.execTarget(id, "body"), body);
				this.indent--;
				this.push("end", id);
				this.terminated = false;
				return this.index.execTarget(id, "then");
			}

			case "type.declareHere": {
				const config = (r.node.config ?? {}) as {
					name?: string; export?: boolean;
				};
				const name = (config.name ?? "").trim();
				const value = this.resolveInput(r, this.pin(r, "value", "in"), scope);
				// The node writes `typeof(...)` itself, so a Type Of on the way in
				// makes `typeof(typeof(x))`. That is not a mistake Luau catches: the
				// inner call is an expression giving a string, so the type quietly
				// becomes `string`. Wiring one in is the obvious reading of the
				// native code this mirrors, so it is worth saying rather than fixing
				// silently.
				if (this.feederOf(id, "value")?.def.id === "value.typeof") {
					this.error(
						"Declare Type already takes the type of what you wire in, so the Type Of " +
						"node makes it the type of a string. Wire the value in directly.",
						id,
					);
					return this.index.execTarget(id, "then");
				}
				if (name === "") {
					this.error("Declare Type needs a name before it can be written.", id);
					return this.index.execTarget(id, "then");
				}
				if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
					this.error(
						`"${name}" is not a name Luau will take for a type. Letters, digits and ` +
						"underscores, not starting with a digit.",
						id,
					);
					return this.index.execTarget(id, "then");
				}
				if (this.declaredTypes.has(name)) {
					this.error(`The type "${name}" is declared more than once.`, id);
					return this.index.execTarget(id, "then");
				}
				// `export type` is only legal at the top level of a module. A plain
				// `type` inside a block is fine and stays scoped to it, so only the
				// export is refused rather than the whole node.
				const exported = config.export !== false;
				if (exported && scope.parent !== undefined) {
					this.error(
						`"${name}" is exported, and Luau only allows that at the top level of a ` +
						"module. Move it out of the branch, loop or function, or untick Export.",
						id,
					);
					return this.index.execTarget(id, "then");
				}
				this.declaredTypes.add(name);
				this.names.reserve(name);
				this.push(`${exported ? "export type" : "type"} ${name} = typeof(${value})`, id);
				return this.index.execTarget(id, "then");
			}

			case "local.declare": {
				const value = this.resolveInput(r, this.pin(r, "value", "in"), scope);
				// A name is an identifier, decided when the file is written, so it
				// cannot come down a wire — the wire carries a runtime value and
				// there is nothing sensible to do with one here. Said rather than
				// ignored, because a wired Name that quietly did nothing would be
				// a name you had to test to discover was not being used.
				if (this.index.sourceOf(id, "name")) {
					this.error(
						"Declare Local's Name is written into the generated Luau, so it has to be " +
						"typed in rather than wired. Leave it blank for an automatic one.",
						id,
					);
				}
				const wanted = this.literalText(r, "name") || r.node.label || "local";
				const ident = this.names.unique(wanted, "local");
				this.push(`local ${ident} = ${value}`, id);
				scope.bindings.set(`${id}/ref`, ident);
				return this.index.execTarget(id, "then");
			}

			case "variable.init": {
				const ref = (r.node.config ?? {}) as VariableRef;
				const ident = ref.variable ? this.variableNames.get(ref.variable) : undefined;
				const value = this.resolveInput(r, this.pin(r, "value", "in"), scope);
				if (!ident || !ref.variable) {
					this.error(
						ref.variable
							? "Initialize Variable points at a variable that no longer exists."
							: "Initialize Variable has no variable chosen.",
						id,
					);
					return this.index.execTarget(id, "then");
				}
				// The whole point of this node is that the declaration lands here
				// rather than at the top of the file — so it has to land somewhere
				// the rest of the script can still see. A `local` inside a branch,
				// a loop or a function body is gone by the time anything else
				// looks for it, and Luau would read the name as a nil global.
				if (scope.parent !== undefined) {
					this.error(
						`Initialize Variable declares "${ref.name ?? "the variable"}", so it has to sit ` +
						"in the main flow. Inside a branch, a loop or a function the declaration " +
						"would go out of scope. Use Set Variable there instead.",
						id,
					);
					return this.index.execTarget(id, "then");
				}
				if (this.declaredSoFar.has(ref.variable)) {
					this.error(
						`"${ref.name ?? "That variable"}" is initialised more than once. A variable is ` +
						"declared once; the later ones should be Set Variable.",
						id,
					);
					return this.index.execTarget(id, "then");
				}
				const variable = (this.script.variables ?? []).find((v) => v.id === ref.variable);
				const annotation =
					this.annotates && variable?.type && variable.type !== "any"
						? `: ${luauType(variable.type)}`
						: "";
				this.push(`local ${ident}${annotation} = ${value}`, id);
				this.declaredSoFar.add(ref.variable);
				scope.bindings.set(`${id}/value`, ident);
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
					const mark = this.out.length;
					this.push("else", id);
					this.indent++;
					this.walk(onFalse, new Scope(scope));
					this.indent--;
					// A false arm that produces no statements — a lone Script End,
					// or a chain of nodes that all compile to nothing — would leave
					// a bare `else` before the `end`. Valid Luau, but nobody writes
					// it, and the generated file is meant to be read.
					if (this.out.length === mark + 1) this.out.length = mark;
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

			case "event.connect":
			case "event.once": {
				// Once is Connect that unbinds itself after one fire. Identical in
				// every other respect, so it is the same handler with a different
				// method name rather than a copy that can drift.
				const method = handler === "event.once" ? "Once" : "Connect";
				const signal = this.resolveInput(r, this.pin(r, "signal", "in"), scope);
				const sig = (r.node.config ?? {}) as Signature;
				const body = new Scope(scope);
				const params = (sig.params ?? []).map((p, i) => {
					const ident = this.names.unique(p.name || `arg${i + 1}`, `arg${i + 1}`);
					body.bindings.set(`${id}/p${i}`, ident);
					return this.annotates ? `${ident}: ${luauType(p.type)}` : ident;
				});
				const wantsConnection = this.index.consumerCount(id, "connection") > 0;
				let prefix = "";
				if (wantsConnection) {
					const ident = this.names.unique(r.node.label || "connection", "connection");
					scope.bindings.set(`${id}/connection`, ident);
					prefix = `local ${ident} = `;
				}
				this.push(`${prefix}${signal}:${method}(function(${params.join(", ")})`, id);
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
	/**
	 * The node actually feeding an input, seeing through reroute knots.
	 *
	 * A knot is a bend in the wire and never changes what travels down it, so
	 * asking "what is on the other end of this" has to walk past one.
	 */
	private feederOf(nodeId: string, pinId: string): ResolvedNode | undefined {
		let at = { node: nodeId, pin: pinId };
		for (let hops = 0; hops < 64; hops++) {
			const link = this.index.sourceOf(at.node, at.pin);
			if (!link) return undefined;
			const from = this.index.get(link.from.node);
			if (from?.def.id !== "flow.reroute") return from;
			at = { node: from.node.id, pin: "in" };
		}
		return undefined;
	}

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
				// Reading a variable whose declaration has not been emitted yet.
				// Only reachable when an Initialize Variable node owns it, since
				// everything else is declared before the first line of flow — and
				// the usual way in is a function defined above the initialisation
				// that reads it. Luau would take the name for a global and hand
				// back nil for the life of the script.
				if (this.initialisedLater.has(ref.variable!) && !this.declaredSoFar.has(ref.variable!)) {
					this.error(
						`"${ref.name ?? "That variable"}" is read here, before the Initialize Variable ` +
						"node that declares it. Move the initialisation earlier, or give the " +
						"variable a value in the variables panel and use Set Variable.",
						src.node.id,
					);
					return "nil";
				}
				return ident;
			}

			// Both reach the Players service themselves, through the same hoisting
			// as Get Service — so a graph using either still gets exactly one
			// `local Players = game:GetService("Players")` at the top, shared with
			// any Get Service node that also asked for it.
			case "players.localPlayer":
				this.requireClient(src, "Local Player");
				return `${this.resolveRoot("Players")}.LocalPlayer`;

			case "players.localCharacter":
				this.requireClient(src, "Local Character");
				return `${this.resolveRoot("Players")}.LocalPlayer.Character`;

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
					// A hoisted function is named before anything is emitted, so a
					// missing name means the node is gone -- except for Declare
					// Function, which is named where it sits. Reading one above its
					// own declaration is a real mistake with a different fix, and
					// saying "no longer in this graph" about a node plainly on the
					// canvas sends you looking for the wrong thing.
					const target = ref.function ? this.index.get(ref.function) : undefined;
					this.error(
						!ref.function
							? "Get Function has no function chosen."
							: target?.def.id === "function.declareHere"
								? `"${(target.node.config as Signature)?.name || "That function"}" is declared ` +
									"further down the flow than this, so it does not exist yet. Move the " +
									"Declare Function above this, or use the hoisted Function node."
								: "Get Function points at a function that is no longer in this graph.",
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

	/**
	 * A pin as the node's own templates name it — the shape before splitting.
	 * `$in.position` still means the whole Vector3 even when the instance has
	 * broken it into three wireable component pins.
	 */
	private pin(r: ResolvedNode, pinId: string, dir: "in" | "out"): PinDef {
		const list = dir === "in" ? r.baseInputs : r.baseOutputs;
		const found = list.find((p) => p.id === pinId);
		if (found) return found;
		return { id: pinId, name: pinId, kind: "data", type: "any" };
	}

	/** The split mode applied to one of a node's pins, if any. */
	private splitOf(r: ResolvedNode, pinId: string, dir: "in" | "out"): StructMode | undefined {
		const mode = splitsOf(r.node.config)[splitKey(dir, pinId)];
		if (mode === undefined) return undefined;
		return modeOf(STRUCTS, this.pin(r, pinId, dir).type, mode);
	}

	/**
	 * Rebuilds a split input from its components.
	 *
	 * Total by construction: a part left unwired contributes its literal, so
	 * there is no way to ask for half a Vector3. That is what lets splitting be
	 * purely presentational as far as the rest of the emitter is concerned —
	 * the template still gets one expression for `$in.position`.
	 */
	private buildSplitInput(
		r: ResolvedNode, parent: PinDef, mode: StructMode, scope: Scope,
	): string {
		const values = new Map<string, string>();
		for (const part of mode.parts) {
			const id = partPinId(parent.id, part.id);
			const child =
				r.inputs.find((p) => p.id === id) ??
				({ id, name: part.name, kind: "data", type: part.type, default: part.default } as PinDef);
			values.set(part.id, paren(this.resolveInput(r, child, scope)));
		}
		return mode.make.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, id: string) =>
			values.get(id) ?? match,
		);
	}

	/**
	 * The whole value behind a split output, guaranteed to be an identifier.
	 *
	 * Always bound to a local, never inlined. A split output exists to have its
	 * parts read separately, so inlining would rebuild the value once per part —
	 * and it is the invariant every `get` template relies on, which is why `$v.X`
	 * needs no defensive parentheses.
	 */
	private bindWhole(
		src: ResolvedNode, parentPin: string, scope: Scope, consumer: ResolvedNode,
	): string {
		const existing = scope.lookup(`${src.node.id}/${parentPin}`);
		if (existing) return existing;

		const expr = this.resolveOutput(src.node.id, parentPin, scope, consumer);
		if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(expr)) return expr;

		// Named after the node, not the pin. A split output's pin is usually
		// named for its type ("CFrame"), which both reads poorly as a local and
		// collides with the global of that name — `local CFrame2 = ...`.
		const ident = this.names.unique(src.node.label || src.def.title, "value");
		this.push(`local ${ident} = ${expr}`, src.node.id);
		scope.bindings.set(`${src.node.id}/${parentPin}`, ident);
		return ident;
	}

	/**
	 * The Luau expression for a data input: the upstream value if the pin is
	 * wired, otherwise the literal typed into it.
	 */
	/**
	 * Has this pin been given a value, as opposed to merely having a default?
	 *
	 * Only `$opt` asks, and the distinction is the whole point of an optional
	 * pin: a literal the developer typed counts, a wire counts, a split counts,
	 * and the definition's own `default` does not. A default is what the *call*
	 * would have used anyway, so passing it explicitly is the thing an optional
	 * pin exists to avoid.
	 */
	private isSet(r: ResolvedNode, pin: PinDef): boolean {
		if (this.index.sourceOf(r.node.id, pin.id)) return true;
		if (this.splitOf(r, pin.id, "in")) return true;
		return r.node.literals?.[pin.id] !== undefined;
	}

	private resolveInput(r: ResolvedNode, pin: PinDef, scope: Scope): string {
		// Split into components: there is no wire and no literal on the pin
		// itself any more, so the value is assembled from the parts.
		const split = this.splitOf(r, pin.id, "in");
		if (split) return this.buildSplitInput(r, pin, split, scope);

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

		// Reading one component of a split output: bind the whole value once,
		// then take the part off it.
		const ref = splitPinId(pinId);
		if (ref) {
			const mode = this.splitOf(src, ref.parent, "out");
			const part = mode?.parts.find((p) => p.id === ref.part);
			if (part) {
				const whole = this.bindWhole(src, ref.parent, scope, consumer);
				return part.get.replace(/\$v\b/g, whole);
			}
		}

		/**
		 * A function's own name, so it can be passed as a value.
		 *
		 * Both nodes that declare one, not just the hoisted node this was
		 * written for. Declare Function fell through to the check below and was
		 * reported as out of scope -- which is what an impure node's output *is*
		 * outside its block, and is not what a function's name is anywhere.
		 */
		if (FUNCTION_NODES.has(src.def.id) && pinId === "self") {
			const named = this.functionNames.get(nodeId);
			if (named) return named;
			// Only Declare Function can get here: a hoisted function is named
			// before anything is emitted. Reading one above its own declaration
			// is a real mistake, and a different one from "not in the graph".
			this.error(
				`"${nodeTitle(src.def, src.node)}" is declared further down the flow than this, ` +
				"so it does not exist yet. Move the Declare Function above this, or use the " +
				"hoisted Function node.",
				consumer.node.id,
			);
			return "nil";
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

		// `$more(<sep>)` is `$args` with a leading separator when there is anything
		// to separate. It is what lets `Fire(player, a, b)` and `Fire(player)` come
		// from one template instead of forcing a payload nobody asked for.
		template = template.replace(/\$more\(([^)]*)\)/g, (_match, separator: string) => {
			const args = r.inputs.filter((p) => VARIADIC_PIN.test(p.id));
			if (args.length === 0) return "";
			return separator + args.map((p) => paren(this.resolveInput(r, p, scope))).join(separator);
		});

		/**
		 * `$opt(<sep>)` folds the optional trailing arguments of a call.
		 *
		 * An optional pin the developer has not touched is *not passed*, rather
		 * than passed as its default or as `nil` — because plenty of Roblox
		 * constructors reject an explicit `nil` where they accept a missing
		 * argument, so the two are different calls and only one works.
		 *
		 * Trailing unset pins therefore disappear entirely. An unset pin with a
		 * set one *after* it cannot disappear — the positions would shift and
		 * argument four would arrive as argument three — so it is passed as
		 * `nil`, which is the only honest thing left and is what a hand-written
		 * call would do in the same spot.
		 *
		 *     TweenInfo.new(1, style, dir)                     nothing set
		 *     TweenInfo.new(1, style, dir, 2)                   repeat set
		 *     TweenInfo.new(1, style, dir, nil, nil, 0.5)       only delay set
		 *
		 * The leading separator comes from the group, as `$more` does, so a
		 * call with no optional arguments does not end in a stray comma.
		 */
		template = template.replace(/\$opt\(([^)]*)\)/g, (_match, separator: string) => {
			const optional = r.inputs.filter((pin) => pin.optional === true);
			const set = optional.map((pin) => this.isSet(r, pin));
			const last = set.lastIndexOf(true);
			if (last === -1) return "";
			const args = optional
				.slice(0, last + 1)
				.map((pin, i) => (set[i] ? this.resolveInput(r, pin, scope) : "nil"));
			return separator + args.join(separator);
		});

		/**
		 * `$pairs(<sep>)` folds `k0`/`a0`, `k1`/`a1`, … into `[key] = value`.
		 *
		 * `$args` cannot do this: variadic pins are all one type, and a
		 * dictionary entry is two pins that mean different things. A node
		 * wanting pairs derives them itself and folds them here, which keeps
		 * "how many" in the node's own config exactly as `$args` does.
		 *
		 * A pair whose key is left empty is skipped rather than emitted as
		 * `[""] = v`. Growing the node gives you a blank row, and a blank row
		 * you have not filled in yet should not be a table entry.
		 *
		 * The fold carries its own surrounding spaces, so the template writes
		 * `{$pairs(, )}` and an empty one comes out as `{}` rather than `{  }`.
		 * That is a formatting decision living slightly further from the
		 * template than it might, and the alternative is a stray double space in
		 * generated code that a reader is meant to be able to read — and that
		 * only stylua would tidy, which is optional.
		 */
		template = template.replace(/\$pairs\(([^)]*)\)/g, (_match, separator: string) => {
			const entries: string[] = [];
			for (const pin of r.inputs) {
				const match = /^k(\d+)$/.exec(pin.id);
				if (!match) continue;
				const value = r.inputs.find((v) => v.id === `a${match[1]}`);
				if (!value) continue;
				const key = this.resolveInput(r, pin, scope);
				if (key === '""' || key === "nil") continue;
				const plain = this.bracketsOnly(r) ? null : plainKey(key);
				const written = plain ?? `[${key}]`;
				entries.push(`${written} = ${this.resolveInput(r, value, scope)}`);
			}
			if (entries.length === 0) return "";
			/**
			 * One key to a line, when the node asks for it.
			 *
			 * A trailing comma on the last entry, which is what Luau takes and
			 * what stylua writes — it makes adding a key a one-line diff rather
			 * than a two-line one. The leading tab is relative: `push` adds it to
			 * whatever indentation the statement itself is at.
			 */
			if ((r.node.config as { layout?: string } | undefined)?.layout === "lines") {
				return `\n${entries.map((entry) => `\t${entry},`).join("\n")}\n`;
			}
			return ` ${entries.join(separator)} `;
		});

		/**
		 * `$index(<table pin>, <key pin>)` — `t.name` or `t[expr]`.
		 *
		 * A placeholder rather than two templates on each node, because Get Index
		 * and Set Index differ only in what surrounds the access and both have to
		 * make the same decision about the key.
		 */
		template = template.replace(
			/\$index\(([A-Za-z_][A-Za-z0-9_]*),\s*([A-Za-z_][A-Za-z0-9_]*)\)/g,
			(_match, tablePin: string, keyPin: string) => {
				const table = this.resolveInput(r, this.pin(r, tablePin, "in"), scope);
				const key = this.resolveInput(r, this.pin(r, keyPin, "in"), scope);
				const plain = this.bracketsOnly(r) ? null : plainKey(key);
				return plain ? `${table}.${plain}` : `${table}[${key}]`;
			},
		);

		const re = /\$(in|out)\.([A-Za-z_][A-Za-z0-9_]*)(?:!(ident|raw))?/g;
		return template.replace(re, (match: string, side: string, pinId: string, modifier: string | undefined, offset: number) => {
			if (side === "out") {
				const bound = scope.lookup(`${r.node.id}/${pinId}`);
				if (bound) return bound;
				/**
				 * Nothing bound it. `_` rather than a fresh unique name, because
				 * a unique name here is *undeclared* — on the left of an
				 * assignment that makes a global, which is the failure
				 * `emitStatement` now declares its referenced outputs to avoid.
				 * This is the last line of defence for a spec that reaches here
				 * some other way, and it should discard rather than leak.
				 */
				return "_";
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
