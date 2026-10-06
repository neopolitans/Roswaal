/**
 * Luau into a nodescript: the importer's skeleton (0.140.0).
 *
 * Statements become the execution chain, a function becomes a Declare Function
 * with its own graph, and the flow that has a node becomes that node: locals,
 * `if`, the three loops, `return`, `break`, `continue`, and calls. Anything
 * else is kept as its own text, in a Custom Code node for a statement or a Luau
 * Expression for a value, so every file that parses imports and compiles.
 * Matching the library's template nodes, scopes beyond the obvious, layout and
 * comments come in the phases after this one; see the importer proposal.
 *
 * Faithful rather than tidy. A top-level `local` is a Declare Local, as it is
 * written, rather than a script variable; `function T:m()` stays as code until
 * Declare Function can write a method.
 *
 * Nothing here touches a file. It returns the graph and a report, and the
 * caller decides where the graph goes and whether one is already there.
 */

import type { Binding, Block, Expr, FunctionBody, Stat } from "../luau/ast.js";
import { parseChunk } from "../luau/parser.js";
import {
	emptyScript,
	type GraphNode,
	type Link,
	type Literal,
	type NodeScript,
	type ScriptClass,
	type ScriptVariable,
	type Target,
} from "../schema.js";
import {
	applyEdits,
	type Edit,
	type Finding,
	findLikelyBugs,
	type ImportMode,
	modernEdits,
	type TopLevelLocals,
} from "./modes.js";

export interface ImportOptions {
	/** The graph's name: the file's, without `.server`, `.client` or `.luau`. */
	name: string;
	scriptClass: ScriptClass;
	target: Target;
	/** Prefix for node ids, so two imports never share one. Random when absent. */
	idPrefix?: string;
	/** What a file-level `local` becomes: a script variable unless asked otherwise. */
	locals?: TopLevelLocals;
	/** How the graph reads; every mode behaves the same. See `modes.ts`. */
	mode?: ImportMode;
}

export interface ImportReport {
	/** Statements, counted where they are written, nested ones included. */
	statements: number;
	/** Of those, how many became nodes rather than code. */
	asNodes: number;
	/** What became code, by the construct that did, most first. */
	asCode: { construct: string; count: number }[];
	/** Likely bugs in the original, left as they are. */
	findings: Finding[];
	/** How many places Modern wrote in newer syntax. */
	rewrites: number;
}

export type ImportResult =
	| { ok: true; script: NodeScript; report: ImportReport }
	| { ok: false; error: string };

/** What a name means where it is read. */
type Ref =
	| { kind: "local"; node: string; name: string; type?: string }
	| { kind: "param"; fn: string; name: string; type?: string }
	| { kind: "pin"; node: string; pin: string }
	| { kind: "function"; node: string; name: string; params: Sig[]; returns: Sig[] }
	| { kind: "variable"; id: string; name: string; type?: string }
	/** Declared by a statement kept as code: read back as its text. */
	| { kind: "text" };

interface Sig {
	name: string;
	type?: string;
}

/** A value for an input: typed in, or wired from a pin. */
type Value = { kind: "literal"; literal: Literal } | { kind: "wire"; node: string; pin: string };

class Scope {
	private names = new Map<string, Ref>();
	constructor(readonly parent?: Scope) {}
	set(name: string, ref: Ref): void {
		this.names.set(name, ref);
	}
	get(name: string): Ref | undefined {
		return this.names.get(name) ?? this.parent?.get(name);
	}
}

/** Where a chain of statements stands: the exec output the next one hangs off. */
interface Tail {
	node: string;
	pin: string;
}

/** The function a body belongs to, for Return; absent at the top of the file. */
interface FunctionContext {
	node: string;
	returns: Sig[];
}

/** What the report calls a statement with no node yet. */
const KEPT_AS: Partial<Record<Stat["kind"], string>> = {
	typeAlias: "type",
	typeFunction: "type function",
	compoundAssign: "compound assignment",
	do: "do block",
	repeat: "repeat loop",
	const: "const",
};

const SIMPLE_STRING = /^(["'])((?:(?!\1)[^\\\n])*)\1$/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

class Importer {
	private nodes: GraphNode[] = [];
	private links: Link[] = [];
	private count = 0;
	private stats = 0;
	private asNodes = 0;
	private codeKinds = new Map<string, number>();
	/** Columns used per graph, so each statement goes to the right of the last. */
	private column = new Map<string, number>();
	/** The script variables file-level locals became. */
	readonly variables: ScriptVariable[] = [];

	constructor(
		private readonly src: string,
		private readonly prefix: string,
		private readonly locals: TopLevelLocals = "variable",
		private readonly edits: readonly Edit[] = [],
	) {}

	private id(): string {
		this.count += 1;
		return `${this.prefix}-${this.count}`;
	}

	private text(span: { start: number; end: number }): string {
		return this.src.slice(span.start, span.end);
	}

	/**
	 * A span as code to keep, with its later lines brought back by the
	 * indentation of the line it starts on. The compiler indents what it writes,
	 * so text that kept its own indentation would be indented twice.
	 */
	private kept(span: { start: number; end: number }): string {
		const lineStart = this.src.lastIndexOf("\n", span.start - 1) + 1;
		const indent = /^[ \t]*/.exec(this.src.slice(lineStart, span.start))?.[0] ?? "";
		const text = applyEdits(this.src, span, this.edits);
		if (!indent) return text;
		return text
			.split("\n")
			.map((line, i) => (i > 0 && line.startsWith(indent) ? line.slice(indent.length) : line))
			.join("\n");
	}

	private place(graph: string | undefined, row: number): { x: number; y: number } {
		const key = graph ?? "";
		const col = this.column.get(key) ?? 0;
		this.column.set(key, col + 1);
		return { x: 600 + col * 320, y: 120 + row * 380 };
	}

	private node(
		def: string,
		graph: string | undefined,
		at: { x: number; y: number },
		extra: Partial<GraphNode> = {},
	): string {
		const id = this.id();
		this.nodes.push({ id, def, x: at.x, y: at.y, ...(graph ? { graph } : {}), ...extra });
		return id;
	}

	private link(from: { node: string; pin: string }, to: { node: string; pin: string }): void {
		this.links.push({ id: this.id(), from, to });
	}

	private nodeById(id: string): GraphNode {
		const node = this.nodes.find((n) => n.id === id);
		if (!node) throw new Error(`The importer lost node ${id}`);
		return node;
	}

	private literal(nodeId: string, pin: string, literal: Literal): void {
		const node = this.nodeById(nodeId);
		node.literals = { ...(node.literals ?? {}), [pin]: literal };
	}

	/** Puts a value on an input: a literal typed in, or a wire. */
	private feed(value: Value, to: { node: string; pin: string }): void {
		if (value.kind === "literal") this.literal(to.node, to.pin, value.literal);
		else this.link({ node: value.node, pin: value.pin }, to);
	}

	private code(kind: string): void {
		this.codeKinds.set(kind, (this.codeKinds.get(kind) ?? 0) + 1);
	}

	report(): Omit<ImportReport, "findings" | "rewrites"> {
		return {
			statements: this.stats,
			asNodes: this.asNodes,
			asCode: [...this.codeKinds.entries()]
				.map(([construct, count]) => ({ construct, count }))
				.sort((a, b) => b.count - a.count),
		};
	}

	result(): { nodes: GraphNode[]; links: Link[] } {
		return { nodes: this.nodes, links: this.links };
	}

	// -- types --------------------------------------------------------------

	private typeText(binding: Binding): string | undefined {
		return binding.type ? this.text(binding.type).trim() : undefined;
	}

	private signature(func: FunctionBody): { params: Sig[]; returns: Sig[] } | undefined {
		if (func.varargs || func.generics.length > 0) return undefined;
		const params = func.params.map((p) => ({
			name: p.name,
			...(this.typeText(p) ? { type: this.typeText(p) } : {}),
		}));
		const returns = (func.returns?.types ?? []).map((t, i) => ({
			name: i === 0 ? "result" : `value${i + 1}`,
			type: this.text(t).trim(),
		}));
		if (func.returns?.tail) return undefined;
		// Declare Function writes `: ()` for no returns, which is a promise.
		// A function that returns values without saying what they are cannot
		// make it, so it stays as code until the importer can infer them.
		if (!func.returns && returnsValues(func.body)) return undefined;
		return { params, returns };
	}

	// -- expressions --------------------------------------------------------

	/** An expression as a value an input can take, placed near `near`. */
	expr(e: Expr, scope: Scope, graph: string | undefined, near: { x: number; y: number }): Value {
		const below = (k: number) => ({ x: near.x - 240, y: near.y + 90 + k * 70 });
		switch (e.kind) {
			case "nil":
				return { kind: "literal", literal: { t: "nil" } };
			case "boolean":
				return { kind: "literal", literal: { t: "boolean", v: e.value } };
			case "number": {
				const v = Number(e.raw);
				return /^-?\d+(\.\d+)?$/.test(e.raw) && Number.isFinite(v)
					? { kind: "literal", literal: { t: "number", v } }
					: { kind: "literal", literal: { t: "raw", v: e.raw } };
			}
			case "string": {
				const simple = SIMPLE_STRING.exec(e.raw);
				return simple
					? { kind: "literal", literal: { t: "string", v: simple[2] } }
					: { kind: "literal", literal: { t: "raw", v: e.raw } };
			}
			case "paren":
				return this.expr(e.inner, scope, graph, near);
			case "name": {
				const ref = scope.get(e.name);
				if (ref?.kind === "pin") return { kind: "wire", node: ref.node, pin: ref.pin };
				if (ref?.kind === "local") {
					const id = this.node("local.get", graph, below(0), {
						config: { local: ref.node, name: ref.name, ...(ref.type ? { type: ref.type } : {}) },
					});
					return { kind: "wire", node: id, pin: "value" };
				}
				if (ref?.kind === "variable") {
					const id = this.node("variable.get", graph, below(0), {
						config: { variable: ref.id, name: ref.name, ...(ref.type ? { type: ref.type } : {}) },
					});
					return { kind: "wire", node: id, pin: "value" };
				}
				if (ref?.kind === "param") {
					const id = this.node("function.getParam", graph, below(0), {
						config: { function: ref.fn, param: ref.name, ...(ref.type ? { type: ref.type } : {}) },
					});
					return { kind: "wire", node: id, pin: "value" };
				}
				if (ref?.kind === "function") {
					const id = this.node("function.get", graph, below(0), {
						config: { function: ref.node, name: ref.name },
					});
					return { kind: "wire", node: id, pin: "fn" };
				}
				return this.luau(e, graph, below(0));
			}
			case "call": {
				const fn = e.callee.kind === "name" ? scope.get(e.callee.name) : undefined;
				if (fn?.kind === "function" && e.args.length <= fn.params.length) {
					const id = this.node("function.callValue", graph, below(0), {
						config: { function: fn.node, name: fn.name, params: fn.params, returns: fn.returns },
					});
					e.args.forEach((arg, i) => {
						this.feed(this.expr(arg, scope, graph, below(i + 1)), { node: id, pin: `a${i}` });
					});
					return { kind: "wire", node: id, pin: "result" };
				}
				return this.luau(e, graph, below(0));
			}
			case "cast": {
				// `need(...) :: BasePart`: the call, with its result cast on it.
				const callee =
					e.value.kind === "call" && e.value.callee.kind === "name"
						? e.value.callee.name
						: undefined;
				if (e.value.kind === "call" && callee && scope.get(callee)?.kind === "function") {
					const value = this.expr(e.value, scope, graph, near);
					const node = value.kind === "wire" ? this.nodeById(value.node) : undefined;
					if (node?.def === "function.callValue") {
						node.config = { ...node.config, resultCast: this.text(e.type).trim() };
						return value;
					}
				}
				return this.luau(e, graph, below(0));
			}
			default:
				return this.luau(e, graph, below(0));
		}
	}

	/** An expression kept as its text. */
	private luau(e: Expr, graph: string | undefined, at: { x: number; y: number }): Value {
		const id = this.node("value.expression", graph, at);
		this.literal(id, "code", { t: "raw", v: this.kept(e) });
		return { kind: "wire", node: id, pin: "result" };
	}

	// -- statements ---------------------------------------------------------

	/** A block as a chain hanging off `tail`. Returns where the chain ends, or null once it cannot go on. */
	block(
		body: Block,
		tail: Tail | null,
		scope: Scope,
		graph: string | undefined,
		row: number,
		fn: FunctionContext | undefined,
		module: boolean,
	): Tail | null {
		let at = tail;
		// An if-statement ends its chain: what follows it in Luau runs after the
		// `end`, which in a graph is the next output of a Sequence. One Sequence
		// takes a run of them, each `if` on its own Then and the rest on the last.
		let sequence: { id: string; count: number } | undefined;
		for (const [i, stat] of body.entries()) {
			if (at === null) break;
			const last = i === body.length - 1;
			if (stat.kind === "if" && !last) {
				const open = sequence && at.node === sequence.id && at.pin === `s${sequence.count - 1}`;
				if (!sequence || !open) {
					const id = this.node("flow.sequence", graph, this.place(graph, row), {
						config: { count: 2 },
					});
					this.chain(at, id);
					sequence = { id, count: 2 };
					at = { node: id, pin: "s0" };
				} else {
					sequence.count += 1;
					const node = this.nodeById(sequence.id);
					node.config = { ...node.config, count: sequence.count };
				}
				this.stat(stat, at, scope, graph, row, fn, false);
				at = { node: sequence.id, pin: `s${sequence.count - 1}` };
				continue;
			}
			at = this.stat(stat, at, scope, graph, row, fn, module && last && !fn);
		}
		return at;
	}

	private chain(tail: Tail, nodeId: string, pin = "in"): void {
		this.link(tail, { node: nodeId, pin });
	}

	/** A statement kept as its text. */
	private custom(
		stat: Stat,
		tail: Tail,
		graph: string | undefined,
		row: number,
		kind: string,
	): Tail {
		this.code(kind);
		const id = this.node("code.custom", graph, this.place(graph, row));
		this.literal(id, "code", { t: "raw", v: this.kept(stat) });
		this.chain(tail, id);
		return { node: id, pin: "then" };
	}

	private stat(
		stat: Stat,
		tail: Tail,
		scope: Scope,
		graph: string | undefined,
		row: number,
		fn: FunctionContext | undefined,
		moduleReturn: boolean,
	): Tail | null {
		this.stats += 1;
		const counted = <T>(v: T): T => {
			this.asNodes += 1;
			return v;
		};

		switch (stat.kind) {
			case "local": {
				if (stat.names.length !== 1 || stat.values.length > 1 || stat.attributes.length > 0) {
					for (const n of stat.names) scope.set(n.name, { kind: "text" });
					return this.custom(stat, tail, graph, row, "local with several names");
				}
				const binding = stat.names[0];
				const at = this.place(graph, row);
				const type = this.typeText(binding);
				// A file-level local is a script variable, declared where it was by
				// Initialize Variable. A name declared twice at that level is two
				// locals, which one variable cannot be, so the second stays local.
				const fileLevel = !scope.parent && this.locals === "variable";
				if (fileLevel && !this.variables.some((v) => v.name === binding.name)) {
					const variable = `${this.prefix}-var${this.variables.length + 1}`;
					this.variables.push({
						id: variable,
						name: binding.name,
						type: type ?? "any",
						default: { t: "nil" },
					});
					const id = this.node("variable.init", graph, at, {
						config: { variable, name: binding.name, ...(type ? { type } : {}) },
					});
					this.feed(
						stat.values[0]
							? this.expr(stat.values[0], scope, graph, at)
							: { kind: "literal", literal: { t: "nil" } },
						{ node: id, pin: "value" },
					);
					this.chain(tail, id);
					scope.set(binding.name, { kind: "variable", id: variable, name: binding.name, type });
					return counted({ node: id, pin: "then" });
				}
				const id = this.node("local.declare", graph, at, type ? { config: { type } } : {});
				this.literal(id, "name", { t: "string", v: binding.name });
				if (stat.values[0])
					this.feed(this.expr(stat.values[0], scope, graph, at), { node: id, pin: "value" });
				this.chain(tail, id);
				scope.set(binding.name, { kind: "local", node: id, name: binding.name, type });
				return counted({ node: id, pin: "then" });
			}

			case "callStat":
				return (
					this.callStat(stat, tail, scope, graph, row) ??
					this.custom(stat, tail, graph, row, "call")
				);

			case "assign": {
				const target = stat.targets[0];
				if (stat.targets.length !== 1 || stat.values.length !== 1) {
					return this.custom(stat, tail, graph, row, "assignment to several targets");
				}
				if (target.kind === "index" || target.kind === "indexExpr") {
					return counted(this.setField(target, stat.values[0], tail, scope, graph, row));
				}
				const ref = target.kind === "name" ? scope.get(target.name) : undefined;
				if (ref?.kind === "variable") {
					const at = this.place(graph, row);
					const id = this.node("variable.set", graph, at, {
						config: { variable: ref.id, name: ref.name, ...(ref.type ? { type: ref.type } : {}) },
					});
					this.feed(this.expr(stat.values[0], scope, graph, at), { node: id, pin: "value" });
					this.chain(tail, id);
					return counted({ node: id, pin: "then" });
				}
				if (ref?.kind !== "local") {
					return this.custom(stat, tail, graph, row, "assignment");
				}
				const at = this.place(graph, row);
				const id = this.node("local.set", graph, at);
				const get = this.node(
					"local.get",
					graph,
					{ x: at.x - 240, y: at.y + 90 },
					{
						config: { local: ref.node, name: ref.name, ...(ref.type ? { type: ref.type } : {}) },
					},
				);
				this.link({ node: get, pin: "value" }, { node: id, pin: "variable" });
				this.feed(this.expr(stat.values[0], scope, graph, { x: at.x, y: at.y + 70 }), {
					node: id,
					pin: "value",
				});
				this.chain(tail, id);
				return counted({ node: id, pin: "then" });
			}

			case "if": {
				let entry = tail;
				let falseTail: Tail | null = null;
				let first = true;
				for (const clause of stat.clauses) {
					const at = this.place(graph, row);
					const id = this.node("flow.branch", graph, at);
					this.feed(this.expr(clause.condition, scope, graph, at), { node: id, pin: "condition" });
					if (first) this.chain(entry, id);
					else this.link(entry, { node: id, pin: "in" });
					this.block(
						clause.body,
						{ node: id, pin: "true" },
						new Scope(scope),
						graph,
						row + 1,
						fn,
						false,
					);
					entry = { node: id, pin: "false" };
					falseTail = entry;
					first = false;
				}
				if (stat.orElse && falseTail) {
					this.block(stat.orElse, falseTail, new Scope(scope), graph, row + 2, fn, false);
				}
				// Nothing follows an if-statement on its own pins; `block` hangs
				// what comes after it on a Sequence.
				this.asNodes += 1;
				return null;
			}

			case "numericFor":
			case "genericFor":
			case "while":
				return this.loop(stat, tail, scope, graph, row, fn);

			case "break":
			case "continue": {
				const id = this.node(`flow.${stat.kind}`, graph, this.place(graph, row));
				this.chain(tail, id);
				this.asNodes += 1;
				return null;
			}

			case "return": {
				if (!fn) {
					if (moduleReturn && stat.values.length === 1) {
						const at = this.place(graph, row);
						const id = this.node("module.exports", graph, at);
						this.feed(this.expr(stat.values[0], scope, graph, at), { node: id, pin: "e0" });
						this.asNodes += 1;
						return null;
					}
					return this.custom(stat, tail, graph, row, "return outside a function");
				}
				if (stat.values.length !== fn.returns.length) {
					return this.custom(stat, tail, graph, row, "return of an untyped count");
				}
				const at = this.place(graph, row);
				const id = this.node("function.return", graph, at, { config: { returns: fn.returns } });
				stat.values.forEach((v, i) => {
					this.feed(this.expr(v, scope, graph, { x: at.x, y: at.y + i * 70 }), {
						node: id,
						pin: `r${i}`,
					});
				});
				this.chain(tail, id);
				this.asNodes += 1;
				return null;
			}

			case "localFunction":
			case "functionStat": {
				const declared = this.functionStat(stat, tail, scope, graph, row);
				if (declared) return declared;
				if (stat.kind === "localFunction") scope.set(stat.name.name, { kind: "text" });
				return this.custom(stat, tail, graph, row, "function");
			}

			default:
				return this.custom(stat, tail, graph, row, KEPT_AS[stat.kind] ?? stat.kind);
		}
	}

	/**
	 * `t.k = v` and `t[k] = v`. Both nodes write the same Luau; a PascalCase
	 * name reads as a Roblox property, so it gets Set Property, and anything
	 * else Set Key, until the importer knows what `t` is.
	 */
	private setField(
		target: Extract<Expr, { kind: "index" | "indexExpr" }>,
		value: Expr,
		tail: Tail,
		scope: Scope,
		graph: string | undefined,
		row: number,
	): Tail {
		const at = this.place(graph, row);
		const near = { x: at.x, y: at.y + 70 };
		const property = target.kind === "index" && /^[A-Z][a-z0-9]/.test(target.name.name);
		const id = this.node(property ? "roblox.setProperty" : "table.setKey", graph, at);
		this.feed(this.expr(target.object, scope, graph, at), {
			node: id,
			pin: property ? "instance" : "table",
		});
		if (target.kind === "index") {
			this.literal(id, property ? "property" : "key", { t: "string", v: target.name.name });
		} else {
			this.feed(this.expr(target.key, scope, graph, near), { node: id, pin: "key" });
		}
		this.feed(this.expr(value, scope, graph, near), { node: id, pin: "value" });
		this.chain(tail, id);
		return { node: id, pin: "then" };
	}

	/** The three loops: the body on Body, and what follows on Completed. */
	private loop(
		stat: Extract<Stat, { kind: "numericFor" | "genericFor" | "while" }>,
		tail: Tail,
		scope: Scope,
		graph: string | undefined,
		row: number,
		fn: FunctionContext | undefined,
	): Tail {
		const at = this.place(graph, row);
		const inner = new Scope(scope);
		let id: string;
		if (stat.kind === "numericFor") {
			id = this.node("flow.forRange", graph, at, { label: stat.variable.name });
			this.feed(this.expr(stat.from, scope, graph, at), { node: id, pin: "first" });
			this.feed(this.expr(stat.to, scope, graph, at), { node: id, pin: "last" });
			if (stat.step) this.feed(this.expr(stat.step, scope, graph, at), { node: id, pin: "step" });
			inner.set(stat.variable.name, { kind: "pin", node: id, pin: "index" });
		} else if (stat.kind === "genericFor") {
			const plan = this.iteration(stat);
			if (!plan) {
				// `place` took a column the code node now takes instead.
				this.column.set(graph ?? "", (this.column.get(graph ?? "") ?? 1) - 1);
				return this.custom(stat, tail, graph, row, "for … in");
			}
			const [k, v] = stat.variables;
			id = this.node(plan.def, graph, at, {
				config: { keyName: k?.name, ...(v ? { valueName: v.name } : {}) },
			});
			this.feed(this.expr(plan.table, scope, graph, at), { node: id, pin: "table" });
			if (k) inner.set(k.name, { kind: "pin", node: id, pin: plan.key });
			if (v) inner.set(v.name, { kind: "pin", node: id, pin: "value" });
		} else {
			id = this.node("flow.while", graph, at);
			this.feed(this.expr(stat.condition, scope, graph, at), { node: id, pin: "condition" });
		}
		this.chain(tail, id);
		this.block(stat.body, { node: id, pin: "body" }, inner, graph, row + 1, fn, false);
		this.asNodes += 1;
		return { node: id, pin: "completed" };
	}

	/** `pairs(t)`, `ipairs(t)` or a bare `t`, as the loop node and its key pin. */
	private iteration(
		stat: Extract<Stat, { kind: "genericFor" }>,
	): { def: string; key: string; table: Expr } | undefined {
		if (stat.values.length !== 1 || stat.variables.length > 2) return undefined;
		const value = stat.values[0];
		if (value.kind === "call" && value.callee.kind === "name" && value.args.length === 1) {
			if (value.callee.name === "ipairs")
				return { def: "flow.forIndex", key: "index", table: value.args[0] };
			if (value.callee.name === "pairs")
				return { def: "flow.forEach", key: "key", table: value.args[0] };
			return undefined;
		}
		if (value.kind === "call" || value.kind === "methodCall") return undefined;
		return { def: "flow.forEach", key: "key", table: value };
	}

	private callStat(
		stat: Extract<Stat, { kind: "callStat" }>,
		tail: Tail,
		scope: Scope,
		graph: string | undefined,
		row: number,
	): Tail | undefined {
		const call = stat.call;
		// A function written inline as an argument has a body of its own, which
		// a value pin cannot hold well. The whole statement stays as code.
		if (call.args.some((a) => a.kind === "function") || call.args.length > 8) return undefined;
		const at = this.place(graph, row);
		let id: string;
		if (call.kind === "methodCall") {
			id = this.node("call.method", graph, at, { config: { args: call.args.length } });
			this.feed(this.expr(call.object, scope, graph, at), { node: id, pin: "object" });
			this.literal(id, "method", { t: "string", v: call.method.name });
		} else {
			const fn = call.callee.kind === "name" ? scope.get(call.callee.name) : undefined;
			if (fn?.kind === "function" && call.args.length <= fn.params.length) {
				id = this.node("function.call", graph, at, {
					config: { function: fn.node, name: fn.name, params: fn.params, returns: fn.returns },
				});
			} else {
				id = this.node("call.function", graph, at, { config: { args: call.args.length } });
				this.feed(this.expr(call.callee, scope, graph, at), { node: id, pin: "fn" });
			}
		}
		call.args.forEach((arg, i) => {
			this.feed(this.expr(arg, scope, graph, { x: at.x, y: at.y + 70 * (i + 1) }), {
				node: id,
				pin: `a${i}`,
			});
		});
		this.chain(tail, id);
		this.asNodes += 1;
		return { node: id, pin: "then" };
	}

	private functionStat(
		stat: Extract<Stat, { kind: "localFunction" | "functionStat" }>,
		tail: Tail,
		scope: Scope,
		graph: string | undefined,
		row: number,
	): Tail | undefined {
		const sig = this.signature(stat.func);
		if (!sig) return undefined;
		let name: string;
		let owner: Value | undefined;
		const at = this.place(graph, row);
		if (stat.kind === "localFunction") {
			name = stat.name.name;
		} else {
			// `function T.f()` and `function T:m()`: one table, then the name.
			const tables = stat.method ? stat.path : stat.path.slice(0, -1);
			if (tables.length > 1 || stat.attributes.length > 0) return undefined;
			name = stat.method ? stat.method.name : stat.path[stat.path.length - 1].name;
			if (tables.length === 1) {
				owner = this.expr(
					{ kind: "name", name: tables[0].name, start: tables[0].start, end: tables[0].end },
					scope,
					graph,
					at,
				);
			} else if (scope.get(name) === undefined) {
				// `function f()` with no local `f`: a global. Faithful would need a
				// global declaration Roswaal does not write; kept as code.
				return undefined;
			}
		}
		if (!IDENT.test(name)) return undefined;
		const method = stat.kind === "functionStat" && stat.method !== undefined;
		const id = this.node("function.declareHere", graph, at, {
			config: {
				name,
				params: sig.params,
				returns: sig.returns,
				...(method ? { method: true } : {}),
			},
		});
		if (owner) this.feed(owner, { node: id, pin: "owner" });
		this.chain(tail, id);
		const ref: Ref = { kind: "function", node: id, name, params: sig.params, returns: sig.returns };
		// A local function can call itself; register it before its body.
		if (stat.kind === "localFunction") scope.set(name, ref);

		const inner = new Scope(scope);
		if (method) inner.set("self", { kind: "param", fn: id, name: "self" });
		for (const p of sig.params)
			inner.set(p.name, { kind: "param", fn: id, name: p.name, type: p.type });
		this.block(
			stat.func.body,
			{ node: id, pin: "body" },
			inner,
			id,
			0,
			{ node: id, returns: sig.returns },
			false,
		);
		this.asNodes += 1;
		return { node: id, pin: "then" };
	}
}

/** Whether a function's own body returns a value anywhere; functions inside it are their own. */
function returnsValues(body: Block): boolean {
	return body.some((stat) => {
		switch (stat.kind) {
			case "return":
				return stat.values.length > 0;
			case "if":
				return (
					stat.clauses.some((c) => returnsValues(c.body)) ||
					(!!stat.orElse && returnsValues(stat.orElse))
				);
			case "do":
			case "while":
			case "repeat":
			case "numericFor":
			case "genericFor":
				return returnsValues(stat.body);
			default:
				return false;
		}
	});
}

/** The graph's name and script class, from a `.luau` file's name. */
export function graphNameOf(fileName: string): { name: string; scriptClass: ScriptClass } {
	const base = fileName.replace(/\.luau?$/i, "");
	if (/\.server$/i.test(base))
		return { name: base.replace(/\.server$/i, ""), scriptClass: "Script" };
	if (/\.client$/i.test(base))
		return { name: base.replace(/\.client$/i, ""), scriptClass: "LocalScript" };
	return { name: base, scriptClass: "ModuleScript" };
}

/** The file's `--!strict` or `--!nonstrict`, as the graph's type checking; anything else is the default. */
function typecheckOf(src: string): NodeScript["typecheck"] {
	const mode = /^\s*--!(strict|nonstrict)\b/m.exec(src)?.[1];
	return mode === "strict" || mode === "nonstrict" ? mode : "default";
}

export function importLuau(file: string, options: ImportOptions): ImportResult {
	// Code kept as text goes into the graph as written, and a checkout on
	// Windows writes it with CRLF; the compiler writes LF.
	const src = file.replace(/\r\n?/g, "\n");
	const parsed = parseChunk(src);
	if (parsed.errors.length > 0) {
		const first = parsed.errors[0];
		const line = src.slice(0, first.start).split("\n").length;
		return { ok: false, error: `Line ${line}: ${first.message}` };
	}
	const prefix = options.idPrefix ?? `imp${Math.random().toString(36).slice(2, 8)}`;
	const mode = options.mode ?? "tidy";
	const edits = mode === "modern" ? modernEdits(parsed.value, src) : [];
	const importer = new Importer(src, prefix, options.locals ?? "variable", edits);
	const script: NodeScript = {
		...emptyScript(options.name, `${prefix}-graph`),
		scriptClass: options.scriptClass,
		target: options.target,
		typecheck: typecheckOf(src),
	};
	const beginId = `${prefix}-begin`;
	const begin: GraphNode = { id: beginId, def: "script.begin", x: 0, y: 120 };
	importer.block(
		parsed.value,
		{ node: beginId, pin: "then" },
		new Scope(),
		undefined,
		0,
		undefined,
		options.scriptClass === "ModuleScript",
	);
	const { nodes, links } = importer.result();
	return {
		ok: true,
		script: { ...script, variables: importer.variables, nodes: [begin, ...nodes], links },
		report: {
			...importer.report(),
			findings: findLikelyBugs(parsed.value, src),
			rewrites: edits.length,
		},
	};
}
