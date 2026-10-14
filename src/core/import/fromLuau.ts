/**
 * Luau into a nodescript: the importer's skeleton (0.140.0).
 *
 * Statements become the execution chain, a function becomes a Declare Function
 * with its own graph, and the flow that has a node becomes that node: locals,
 * `if`, the three loops, `return`, `break`, `continue`, and calls. Anything
 * else is kept as its own text, in a Code Block node for a statement or a Luau
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

import { isFieldName } from "../compiler/luau.js";
import { viewOf } from "../functionGraph.js";
import type { Binding, Block, Expr, FunctionBody, Stat } from "../luau/ast.js";
import { lineIndex, tokenize } from "../luau/lexer.js";
import { parseChunk } from "../luau/parser.js";
import { nodeBounds } from "../nodeBox.js";
import { COMPOUND_NODES } from "../nodes/compound.js";
import { FUNCTION_NODES } from "../nodes/flow.js";
import { BUILTIN_NODES, createRegistry, type Registry } from "../nodes/index.js";
import {
	type Comment,
	type CommentStyle,
	emptyScript,
	type GraphNode,
	type Link,
	type Literal,
	type NodeDef,
	type NodeScript,
	type ScriptClass,
	type ScriptVariable,
	type Target,
} from "../schema.js";
import { layoutImport } from "./layout.js";
import {
	applyEdits,
	type Edit,
	type Finding,
	findLikelyBugs,
	type ImportMode,
	modernEdits,
	type TopLevelLocals,
} from "./modes.js";
import { type CallTemplate, callTemplates, matchCall } from "./templates.js";

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
	/**
	 * The file's comments: drawn as a box around what they describe, moved
	 * there from the end of a line, or left out -- one at the end of a block,
	 * with nothing after it to describe.
	 */
	comments: { kept: number; moved: number; dropped: number };
}

/** The lines of the file a node was made from, first and last, counting from 1. */
export type Origins = Record<string, { from: number; to: number }>;

export type ImportResult =
	| { ok: true; script: NodeScript; report: ImportReport; origins: Origins }
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
	typeFunction: "type function",
	do: "do block",
	repeat: "repeat loop",
	const: "const",
};

/** The most statements a row takes in Tidy before it is cut anyway. */
const ROW = 8;

const SIMPLE_STRING = /^(["'])((?:(?!\1)[^\\\n])*)\1$/;
/** How many rows Make Dictionary has room for. */
const MAX_DICTIONARY_ROWS = 24;
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
		/**
		 * Tidy and Modern: a blank line in the file starts a new row, and a
		 * table written out is built with Make Dictionary. Verbatim keeps both
		 * as the file has them.
		 */
		private readonly paragraphs = false,
		/** What the graph runs on, so only nodes that run there are matched. */
		private readonly target: Target = "roblox",
	) {}

	private id(): string {
		this.count += 1;
		return `${this.prefix}-${this.count}`;
	}

	private text(span: { start: number; end: number }): string {
		this.keptSpans.push(span);
		return this.src.slice(span.start, span.end);
	}

	/**
	 * A span as code to keep, with its later lines brought back by the
	 * indentation of the line it starts on. The compiler indents what it writes,
	 * so text that kept its own indentation would be indented twice.
	 */
	private kept(span: { start: number; end: number }): string {
		this.keptSpans.push(span);
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
		if (this.origin) this.origins.set(id, this.origin);
		return id;
	}

	/** The span of source the nodes being made now come from. */
	private origin: { start: number; end: number } | undefined;
	/** Every node's span of source, for `Origins`. */
	readonly origins = new Map<string, { start: number; end: number }>();

	/**
	 * What of a statement its own nodes stand for: all of a simple one, and
	 * the first line of one that holds a block, whose body has nodes of its own.
	 */
	private head(stat: Stat): { start: number; end: number } {
		const holds = [
			"if",
			"while",
			"repeat",
			"do",
			"numericFor",
			"genericFor",
			"localFunction",
			"functionStat",
		];
		const handler =
			(stat.kind === "callStat" && stat.call.args.some((a) => a.kind === "function")) ||
			(stat.kind === "local" &&
				stat.values.some(
					(v) =>
						(v.kind === "methodCall" || v.kind === "call") &&
						v.args.some((a) => a.kind === "function"),
				));
		if (!holds.includes(stat.kind) && !handler) return { start: stat.start, end: stat.end };
		const eol = this.src.indexOf("\n", stat.start);
		return { start: stat.start, end: eol === -1 ? stat.end : eol };
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

	report(): Omit<ImportReport, "findings" | "rewrites" | "comments"> {
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
		return binding.type ? this.typeOf(binding.type) : undefined;
	}

	/**
	 * A type as written, on one line: an annotation is written mid-line, so
	 * a table type set out over several, or with comments in it, is the same
	 * type said on one.
	 */
	private typeOf(span: { start: number; end: number }): string {
		const text = this.text(span).trim();
		if (!text.includes("\n") && !text.includes("--")) return text;
		return tokenize(text)
			.filter((t) => t.kind !== "comment" && t.kind !== "eof")
			.map((t) => (t.kind === "whitespace" ? " " : t.text))
			.join("")
			.replace(/ +/g, " ")
			.replace(/,\s*([})\]])/g, " $1")
			.replace(/([([]) /g, "$1")
			.replace(/ ([)\]])/g, "$1")
			.trim();
	}

	private signature(
		func: FunctionBody,
	): { params: Sig[]; returns: Sig[]; returnsWritten?: false } | undefined {
		if (func.varargs || func.generics.length > 0) return undefined;
		const params = func.params.map((p) => ({
			name: p.name,
			...(this.typeText(p) ? { type: this.typeText(p) } : {}),
		}));
		const returns = (func.returns?.types ?? []).map((t, i) => ({
			name: i === 0 ? "result" : `value${i + 1}`,
			type: this.typeOf(t),
		}));
		if (func.returns?.tail) return undefined;
		// Declare Function writes `: ()` for no returns, which is a promise.
		// A function that returns values without saying what they are cannot
		// make it, so it stays as code until the importer can infer them.
		if (!func.returns && returnsValues(func.body)) return undefined;
		return { params, returns, ...(func.returns ? {} : { returnsWritten: false as const }) };
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
				// As written: `0.10` and `2.0` stay so, not `0.1` and `2`.
				return /^-?\d+(\.\d+)?$/.test(e.raw) && Number.isFinite(v) && String(v) === e.raw
					? { kind: "literal", literal: { t: "number", v } }
					: { kind: "literal", literal: { t: "raw", v: e.raw } };
			}
			case "string": {
				const simple = SIMPLE_STRING.exec(e.raw);
				return simple
					? { kind: "literal", literal: { t: "string", v: simple[2] } }
					: { kind: "literal", literal: { t: "raw", v: e.raw } };
			}
			case "table":
				return (
					(this.paragraphs && this.dictionary(e, scope, graph, near)) ||
					this.luau(e, graph, below(0))
				);
			case "paren": {
				// Brackets around a call or `...` keep only its first value:
				// `print((pick()))` passes one. Without them it would pass all.
				const inner = e.inner.kind;
				if (inner === "call" || inner === "methodCall" || inner === "varargs")
					return this.luau(e, graph, below(0));
				return this.expr(e.inner, scope, graph, near);
			}
			case "name": {
				const ref = scope.get(e.name);
				if (ref?.kind === "pin") {
					// A loop's variable or a handler's parameter read inside a function
					// declared there: a wire cannot cross into the function's own graph,
					// so it is read by name, as the file reads it. The name is kept as
					// written, so it is the variable's.
					if (this.nodeById(ref.node).graph === graph) {
						return { kind: "wire", node: ref.node, pin: ref.pin };
					}
					return this.luau(e, graph, below(0));
				}
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
				const pure = this.libraryCall(e, scope, ["expr"]);
				if (pure) {
					const id = this.libraryNode(pure, e, scope, graph, below(0));
					const result =
						(pure.def.compilesTo as { result?: string }).result ?? firstOutput(pure.def);
					return { kind: "wire", node: id, pin: result };
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
		const segments = this.segments(body);
		const lastStat = body[body.length - 1];
		const run = (stats: Stat[], from: Tail | null): Tail | null => {
			let at = from;
			for (const stat of stats) {
				if (at === null) break;
				const before = at;
				at = this.stat(stat, at, scope, graph, row, fn, module && stat === lastStat && !fn);
				if (this.blankBefore(body, stat)) this.markBlank(before);
			}
			return at;
		};
		if (segments.length < 2 || tail === null) return run(body, tail);
		// Several runs: one Sequence, a run on each output, in order. Each is
		// a row of its own on the canvas.
		const id = this.node("flow.sequence", graph, this.place(graph, row), {
			config: { count: segments.length },
		});
		this.chain(tail, id);
		let at: Tail | null = null;
		for (const [i, seg] of segments.entries()) at = run(seg, { node: id, pin: `s${i}` });
		return at;
	}

	/** Whether the file has a blank line between `stat` and the statement before it. */
	private blankBefore(body: Block, stat: Stat): boolean {
		const i = body.indexOf(stat);
		const previous = body[i - 1];
		return previous !== undefined && /\n[ \t]*\n/.test(this.src.slice(previous.end, stat.start));
	}

	/** Keeps a blank line before the statement chained from `tail`. */
	private markBlank(tail: Tail): void {
		const link = this.links.find((l) => l.from.node === tail.node && l.from.pin === tail.pin);
		if (!link) return;
		const node = this.nodeById(link.to.node);
		node.config = { ...node.config, blankBefore: true };
	}

	/**
	 * A block cut into runs of statements, each a row on the canvas.
	 *
	 * An if-statement always ends one: what follows it in Luau runs after its
	 * `end`, which in a graph is the next output of a Sequence, never the last
	 * arm's False. Tidy and Modern also keep a row to `ROW` statements, cut
	 * where the file has a blank line when it can be, so a long function reads
	 * down the canvas in paragraphs rather than off its edge.
	 */
	private segments(body: Block): Stat[][] {
		// Runs an if-statement ends: these must be cut.
		const hard: Stat[][] = [[]];
		for (const stat of body) {
			hard[hard.length - 1].push(stat);
			if (stat.kind === "if") hard.push([]);
		}
		if (hard[hard.length - 1].length === 0) hard.pop();
		if (!this.paragraphs) return hard;
		const out: Stat[][] = [];
		for (const run of hard) {
			if (run.length <= ROW) {
				out.push(run);
				continue;
			}
			// Paragraphs, packed into rows of up to ROW; a longer one is cut at ROW.
			const paragraphs: Stat[][] = [];
			for (const stat of run) {
				const last = paragraphs[paragraphs.length - 1];
				if (!last || this.blankBefore(body, stat) || last.length >= ROW) paragraphs.push([stat]);
				else last.push(stat);
			}
			let row: Stat[] = [];
			for (const paragraph of paragraphs) {
				if (row.length > 0 && row.length + paragraph.length > ROW) {
					out.push(row);
					row = [];
				}
				row.push(...paragraph);
			}
			if (row.length > 0) out.push(row);
		}
		return out;
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
		const outer = this.origin;
		this.origin = this.head(stat);
		const comment = this.commentsOf(stat);
		const first = this.nodes.length;
		const links = this.links.length;
		this.inner.push(new Set());
		try {
			return this.statement(stat, tail, scope, graph, row, fn, moduleReturn);
		} finally {
			this.origin = outer;
			const inner = this.inner.pop() ?? new Set<string>();
			const all = this.nodes.slice(first);
			for (const n of all) this.inner.at(-1)?.add(n.id);
			if (comment) {
				// Its own nodes: not those of the statements in its body, which
				// run on below the row and under the statements after it.
				const made = all.filter((n) => (n.graph ?? undefined) === graph && !inner.has(n.id));
				const chained = this.links
					.slice(links)
					.find((l) => l.from.node === tail.node && l.from.pin === tail.pin);
				if (made.length > 0) {
					this.boxes.push({
						...comment,
						graph,
						nodes: made.map((n) => n.id),
						head: chained?.to.node ?? made[0].id,
					});
				} else {
					this.commentCount.dropped += comment.count;
				}
			}
		}
	}

	/** The nodes each statement being imported has had made by those in its body. */
	private inner: Set<string>[] = [];
	/** Spans of the file kept as code, whose comments go with them. */
	private keptSpans: { start: number; end: number }[] = [];

	/**
	 * `{ Speed = 16, Name = "Scout" }` as Make Dictionary: a row for each
	 * entry, its key typed in and its value typed in or wired. A table written
	 * over several lines is set to write a key to a line.
	 *
	 * Only where the keys come back as written: every entry `name = value`, or
	 * every one in brackets (`["name"] = value`, `[1] = value`), which the node
	 * is then set to keep. A list (`{ a, b }`), a mix of the two forms, more
	 * entries than the node has rows, and a table with a comment inside it stay
	 * as code.
	 */
	private dictionary(
		e: Extract<Expr, { kind: "table" }>,
		scope: Scope,
		graph: string | undefined,
		near: { x: number; y: number },
	): Value | undefined {
		const fields = e.fields;
		if (fields.length === 0 || fields.length > MAX_DICTIONARY_ROWS) return undefined;
		if (fields.some((f) => f.kind === "positional")) return undefined;
		const named = fields.some((f) => f.kind === "named");
		const bracketedName = fields.some(
			(f) =>
				f.kind === "keyed" &&
				f.key.kind === "string" &&
				isFieldName(SIMPLE_STRING.exec(f.key.raw)?.[2] ?? ""),
		);
		if (named && bracketedName) return undefined;
		if (this.comments.some((c) => c.start >= e.start && c.end <= e.end)) return undefined;

		const lines = this.src.slice(e.start, e.end).includes("\n");
		// A separator after the last entry, or none: as the file wrote it.
		const ended = /^\s*[,;]/.test(this.src.slice(fields[fields.length - 1].end, e.end));
		const trailing = lines ? (ended ? undefined : "none") : ended ? "comma" : undefined;
		const split = Object.fromEntries(fields.map((_, i) => [`in:p${i}`, "keyValue"]));
		const at = { x: near.x - 240, y: near.y + 90 };
		const id = this.node("table.dictionary", graph, at, {
			config: {
				args: fields.length,
				split,
				...(lines ? { layout: "lines" } : {}),
				...(bracketedName ? { keys: "brackets" } : {}),
				...(trailing ? { trailing } : {}),
			},
		});
		fields.forEach((field, i) => {
			const row = { x: at.x, y: at.y + 70 * (i + 1) };
			if (field.kind === "named") {
				this.literal(id, `p${i}.key`, { t: "string", v: field.name.name });
			} else if (field.kind === "keyed") {
				this.feed(this.expr(field.key, scope, graph, row), { node: id, pin: `p${i}.key` });
			}
			this.feed(this.expr(field.value, scope, graph, row), { node: id, pin: `p${i}.value` });
		});
		return { kind: "wire", node: id, pin: "result" };
	}

	/** The file's comments, in order, and which have been taken. */
	private comments: { start: number; end: number; text: string; line: number }[] = [];
	private taken = new Set<number>();
	/** What each commented statement became: its nodes, and the text over them. */
	readonly boxes: {
		text: string;
		style?: CommentStyle;
		graph: string | undefined;
		nodes: string[];
		head: string;
	}[] = [];
	readonly commentCount = { kept: 0, moved: 0, dropped: 0 };

	/** Reads the file's comments once, before any statement asks for them. */
	collectComments(): void {
		const lineOf = lineIndex(this.src);
		for (const token of tokenize(this.src)) {
			if (token.kind !== "comment" || token.text.startsWith("--!")) continue;
			this.comments.push({
				start: token.start,
				end: token.end,
				text: token.text,
				line: lineOf(token.start).line,
			});
		}
		this.lineOf = (offset) => lineOf(offset).line;
	}
	private lineOf: (offset: number) => number = () => 0;

	/**
	 * The comment a statement is drawn with: the comment lines directly above
	 * it, back to the code before them, and one at the end of its own last
	 * line. Undefined when it has none.
	 */
	private commentsOf(
		stat: Stat,
	): { text: string; style?: CommentStyle; count: number } | undefined {
		if (this.comments.length === 0) return undefined;
		const endLine = this.lineOf(Math.max(stat.start, stat.end - 1));
		// Above: the comments between this statement and the code before it,
		// leaving out one on that code's own line, which belongs to it.
		const above: typeof this.comments = [];
		for (let i = this.comments.length - 1; i >= 0; i--) {
			const c = this.comments[i];
			if (c.end > stat.start || this.taken.has(i)) continue;
			const next = above.length === 0 ? stat.start : above[0].start;
			if (/\S/.test(this.src.slice(c.end, next))) break;
			const before = this.src.slice(0, c.start).replace(/[ \t]+$/, "");
			if (before !== "" && !before.endsWith("\n")) break;
			above.unshift(c);
			this.taken.add(i);
		}
		// After: one on the statement's own last line.
		const after = this.comments.findIndex(
			(c, i) =>
				!this.taken.has(i) &&
				c.start >= stat.end &&
				c.line === endLine &&
				!/\S/.test(this.src.slice(stat.end, c.start)),
		);
		const trailing = after === -1 ? undefined : this.comments[after];
		if (trailing) this.taken.add(after);
		if (above.length === 0 && !trailing) return undefined;

		const parts = above.map((c) => readComment(c.text));
		const doc = parts.find((p) => p.style === "doc" || p.style === "docBlock")?.style;
		const lines = parts.flatMap((p) => p.lines);
		if (trailing) lines.push(...readComment(trailing.text).lines);
		this.commentCount.kept += above.length;
		if (trailing) this.commentCount.moved += 1;
		const style: CommentStyle | undefined =
			doc ?? (above.length > 1 || (trailing && above.length > 0) ? "lines" : undefined);
		return {
			text: lines.join("\n"),
			...(style ? { style } : {}),
			count: above.length + (trailing ? 1 : 0),
		};
	}

	/** Comments no statement took: at the end of a block, with nothing after them. */
	untakenComments(): number {
		return this.comments.filter(
			(c, i) =>
				!this.taken.has(i) && !this.keptSpans.some((s) => s.start <= c.start && c.end <= s.end),
		).length;
	}

	private statement(
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
				const several = this.severalFromOneCall(stat, tail, scope, graph, row);
				if (several) return counted(several);
				if (stat.names.length !== 1 || stat.values.length > 1 || stat.attributes.length > 0) {
					for (const n of stat.names) scope.set(n.name, { kind: "text" });
					return this.custom(stat, tail, graph, row, "local with several names");
				}
				const binding = stat.names[0];
				// `local conn = signal:Connect(function ... end)`: the node is the
				// declaration, and `conn` is its Connection.
				if (stat.values[0] && !binding.type) {
					const value = stat.values[0];
					const connected = this.connectCall(value, tail, scope, graph, row, binding.name);
					const handled =
						connected ?? this.threadCall(value, tail, scope, graph, row, binding.name);
					if (handled) {
						scope.set(binding.name, {
							kind: "pin",
							node: handled,
							pin: connected ? "connection" : "thread",
						});
						return counted({ node: handled, pin: "then" });
					}
				}
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
					// No value is left unset: `local conn: RBXScriptConnection`.
					const step = this.valueStep(stat.values[0], tail, scope, graph, at);
					if (step) this.feed(step.value, { node: id, pin: "value" });
					else if (stat.values[0])
						this.feed(this.expr(stat.values[0], scope, graph, at), { node: id, pin: "value" });
					this.chain(step?.tail ?? tail, id);
					scope.set(binding.name, { kind: "variable", id: variable, name: binding.name, type });
					return counted({ node: id, pin: "then" });
				}
				const id = this.node("local.declare", graph, at, type ? { config: { type } } : {});
				this.literal(id, "name", { t: "string", v: binding.name });
				const step = this.valueStep(stat.values[0], tail, scope, graph, at);
				if (step) this.feed(step.value, { node: id, pin: "value" });
				else if (stat.values[0])
					this.feed(this.expr(stat.values[0], scope, graph, at), { node: id, pin: "value" });
				this.chain(step?.tail ?? tail, id);
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
					// An `elseif` is its own line, and its Branch stands for that line.
					const eol = this.src.indexOf("\n", clause.condition.start);
					const lineStart = this.src.lastIndexOf("\n", clause.condition.start - 1) + 1;
					this.origin = { start: lineStart, end: eol === -1 ? clause.condition.end : eol };
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
						// `return table.freeze(M)`: the step, then what it hands on.
						const step = this.valueStep(stat.values[0], tail, scope, graph, at);
						this.feed(step?.value ?? this.expr(stat.values[0], scope, graph, at), {
							node: id,
							pin: "e0",
						});
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

			case "typeAlias": {
				// Declare Type where the file declares it, written out as the file
				// wrote it. A generic alias has nowhere to put its parameters yet.
				if (stat.generics.length > 0) return this.custom(stat, tail, graph, row, "generic type");
				const id = this.node("type.declareHere", graph, this.place(graph, row), {
					config: {
						name: stat.name.name,
						shape: "written",
						definition: this.kept(stat.type),
						...(stat.exported ? {} : { export: false }),
					},
				});
				this.chain(tail, id);
				return counted({ node: id, pin: "then" });
			}

			case "compoundAssign": {
				// `x += v` as `x = v` would be drawn, with the operator on the setter.
				// A target that has no setter stays as code, under its own name.
				const before = this.links.length;
				this.stats -= 1;
				const plain: Stat = {
					kind: "assign",
					targets: [stat.target],
					values: [stat.value],
					start: stat.start,
					end: stat.end,
				};
				const result = this.statement(plain, tail, scope, graph, row, fn, false);
				const link = this.links
					.slice(before)
					.find((l) => l.from.node === tail.node && l.from.pin === tail.pin);
				const node = link ? this.nodeById(link.to.node) : undefined;
				if (node && COMPOUND_NODES.has(node.def)) {
					node.config = { ...node.config, op: stat.op };
				} else if (node?.def === "code.custom") {
					// Reported as what it is.
					this.codeKinds.set("assignment", (this.codeKinds.get("assignment") ?? 1) - 1);
					if (this.codeKinds.get("assignment") === 0) this.codeKinds.delete("assignment");
					this.code("compound assignment");
				}
				return result;
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
		// `t["name"] = v` keeps its brackets: Set Key writes `t.name` unless told.
		const bracketed = target.kind === "indexExpr" && target.key.kind === "string";
		const id = this.node(
			property ? "roblox.setProperty" : "table.setKey",
			graph,
			at,
			bracketed ? { config: { keys: "brackets" } } : {},
		);
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
				config: {
					keyName: k?.name,
					...(v ? { valueName: v.name } : {}),
					...(plan.direct ? { iterate: "direct" } : {}),
					...(k?.type ? { keyType: this.typeOf(k.type) } : {}),
					...(v?.type ? { valueType: this.typeOf(v.type) } : {}),
				},
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
	): { def: string; key: string; table: Expr; direct?: true } | undefined {
		if (stat.values.length !== 1 || stat.variables.length > 2) return undefined;
		const value = stat.values[0];
		if (value.kind === "call" && value.callee.kind === "name" && value.args.length === 1) {
			if (value.callee.name === "ipairs")
				return { def: "flow.forIndex", key: "index", table: value.args[0] };
			if (value.callee.name === "pairs")
				return { def: "flow.forEach", key: "key", table: value.args[0] };
		}
		// Anything else is iterated as it is written: a table, or what a call
		// hands back, `x:GetChildren()` or the iterator `s:gmatch("%a+")` gives.
		return { def: "flow.forEach", key: "key", table: value, direct: true };
	}

	private callStat(
		stat: Extract<Stat, { kind: "callStat" }>,
		tail: Tail,
		scope: Scope,
		graph: string | undefined,
		row: number,
	): Tail | undefined {
		const call = stat.call;
		const handled =
			this.connectCall(call, tail, scope, graph, row) ??
			this.threadCall(call, tail, scope, graph, row);
		if (handled) {
			this.asNodes += 1;
			return { node: handled, pin: "then" };
		}
		// A function written inline as an argument has a body of its own, which
		// a value pin cannot hold well. The whole statement stays as code.
		if (call.args.some((a) => a.kind === "function") || call.args.length > 8) return undefined;
		const at = this.place(graph, row);
		const library = this.libraryCall(call, scope, ["statement", "call"]);
		if (library) {
			const id = this.libraryNode(library, call, scope, graph, at);
			this.chain(tail, id);
			this.asNodes += 1;
			return { node: id, pin: "then" };
		}
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

	/**
	 * `signal:Connect(function(player) ... end)` and `:Once`: Connect Event or
	 * Connect Once, the handler's parameters its pins and its body on Body, as
	 * the node writes it back. Returns the node, chained from `tail`, or
	 * undefined for a call that is not one: a handler with `...`, generics, a
	 * return type or attributes stays as code, as does one on Lune, where the
	 * nodes do not run.
	 *
	 * `name`, for `local conn = signal:Connect(...)`, is the node's label: the
	 * connection is its output, and the node writes the `local` itself. The
	 * name is set in scope only after the body, so the handler reads `conn` as
	 * the file did: in `local c = s:Connect(function() c:Disconnect() end)` the
	 * `c` inside is not yet the local.
	 */
	private connectCall(
		call: Expr,
		tail: Tail,
		scope: Scope,
		graph: string | undefined,
		row: number,
		name?: string,
	): string | undefined {
		if (this.target !== "roblox" || call.kind !== "methodCall" || call.args.length !== 1)
			return undefined;
		const method = call.method.name;
		if (method !== "Connect" && method !== "Once") return undefined;
		const literal = call.args[0];
		if (literal.kind !== "function" || literal.attributes.length > 0) return undefined;
		const func = literal.func;
		if (func.varargs || func.generics.length > 0 || func.returns || returnsValues(func.body)) {
			return undefined;
		}
		const params = func.params.map((p) => ({
			name: p.name,
			...(this.typeText(p) ? { type: this.typeText(p) } : {}),
		}));
		const at = this.place(graph, row);
		const id = this.node(method === "Once" ? "event.once" : "event.connect", graph, at, {
			config: { params },
			...(name ? { label: name } : {}),
		});
		this.feed(this.expr(call.object, scope, graph, at), { node: id, pin: "signal" });
		this.chain(tail, id);
		const inner = new Scope(scope);
		params.forEach((p, i) => inner.set(p.name, { kind: "pin", node: id, pin: `p${i}` }));
		this.block(
			func.body,
			{ node: id, pin: "body" },
			inner,
			graph,
			row + 1,
			{ node: id, returns: [] },
			false,
		);
		return id;
	}

	/**
	 * `task.spawn(function() ... end)`, `task.defer(...)` and
	 * `task.delay(seconds, function() ... end)`: New Thread, its Body the
	 * function's. Only a function that takes nothing and is handed nothing
	 * more; one passed arguments stays as code. `name` is as for `connectCall`.
	 */
	private threadCall(
		call: Expr,
		tail: Tail,
		scope: Scope,
		graph: string | undefined,
		row: number,
		name?: string,
	): string | undefined {
		if (this.target !== "roblox" || call.kind !== "call") return undefined;
		const callee = dottedName(call.callee);
		const when = callee?.startsWith("task.") ? callee.slice("task.".length) : undefined;
		if ((when !== "spawn" && when !== "defer" && when !== "delay") || scope.get("task"))
			return undefined;
		const literal = call.args[when === "delay" ? 1 : 0];
		if (call.args.length !== (when === "delay" ? 2 : 1) || literal?.kind !== "function")
			return undefined;
		const func = literal.func;
		if (
			literal.attributes.length > 0 ||
			func.params.length > 0 ||
			func.varargs ||
			func.generics.length > 0 ||
			func.returns ||
			returnsValues(func.body)
		) {
			return undefined;
		}
		const at = this.place(graph, row);
		const id = this.node("task.thread", graph, at, {
			...(when === "spawn" ? {} : { config: { when } }),
			...(name ? { label: name } : {}),
		});
		if (when === "delay")
			this.feed(this.expr(call.args[0], scope, graph, at), { node: id, pin: "seconds" });
		this.chain(tail, id);
		this.block(
			func.body,
			{ node: id, pin: "body" },
			new Scope(scope),
			graph,
			row + 1,
			{ node: id, returns: [] },
			false,
		);
		return id;
	}

	/**
	 * `local ok, err = pcall(f, x)` and `local a, b = obj:Get()`: Call Function
	 * or Call Method with a result for each name, named as the file named them,
	 * and every later read of a name wired to its result. A typed name, an
	 * attribute or a function written in the call keeps the line as code.
	 */
	private severalFromOneCall(
		stat: Extract<Stat, { kind: "local" }>,
		tail: Tail,
		scope: Scope,
		graph: string | undefined,
		row: number,
	): Tail | undefined {
		const call = stat.values[0];
		if (
			stat.names.length < 2 ||
			stat.values.length !== 1 ||
			stat.attributes.length > 0 ||
			stat.names.some((n) => n.type) ||
			(call.kind !== "call" && call.kind !== "methodCall") ||
			call.args.length > 8 ||
			call.args.some((a) => a.kind === "function" || a.kind === "varargs")
		) {
			return undefined;
		}
		const names = stat.names.map((n) => n.name);
		const config = { args: call.args.length, results: names.length, resultNames: names };
		const at = this.place(graph, row);
		let id: string;
		if (call.kind === "methodCall") {
			id = this.node("call.method", graph, at, { config });
			this.feed(this.expr(call.object, scope, graph, at), { node: id, pin: "object" });
			this.literal(id, "method", { t: "string", v: call.method.name });
		} else {
			id = this.node("call.function", graph, at, { config });
			this.feed(this.expr(call.callee, scope, graph, at), { node: id, pin: "fn" });
		}
		call.args.forEach((arg, i) => {
			this.feed(this.expr(arg, scope, graph, { x: at.x, y: at.y + 70 * (i + 1) }), {
				node: id,
				pin: `a${i}`,
			});
		});
		this.chain(tail, id);
		names.forEach((name, i) => {
			scope.set(name, { kind: "pin", node: id, pin: i === 0 ? "result" : `result${i + 1}` });
		});
		return { node: id, pin: "then" };
	}

	/** The library node that writes this call, if one does and nothing in the file hides its name. */
	private libraryCall(
		call: Expr,
		scope: Scope,
		kinds: readonly CallTemplate["kind"][],
	): CallTemplate | undefined {
		if (
			call.kind !== "call" ||
			call.args.some((a) => a.kind === "function" || a.kind === "varargs")
		)
			return undefined;
		const callee = dottedName(call.callee);
		if (!callee || scope.get(callee.split(".")[0]) !== undefined) return undefined;
		return matchCall(libraryTemplates(), callee, call.args.length, kinds, this.target);
	}

	/** A library node for a matched call, its arguments on the template's pins. */
	private libraryNode(
		template: CallTemplate,
		call: Expr,
		scope: Scope,
		graph: string | undefined,
		at: { x: number; y: number },
	): string {
		if (call.kind !== "call")
			throw new Error("The importer matched a template to something not a call.");
		const extra = call.args.length - template.pins.length;
		const id = this.node(
			template.def.id,
			graph,
			at,
			extra > 0 && template.variadic ? { config: { args: extra } } : {},
		);
		call.args.forEach((arg, i) => {
			const after = i - template.pins.length;
			const pin =
				after < 0 ? template.pins[i] : template.variadic ? `a${after}` : template.optional[after];
			this.feed(this.expr(arg, scope, graph, { x: at.x, y: at.y + 70 * (i + 1) }), {
				node: id,
				pin,
			});
		});
		return id;
	}

	/**
	 * `local part = Instance.new("Part")`: a library call made for its value,
	 * as the step it is, ahead of the declaration that reads it. The compiler
	 * writes the two back as the one line they were.
	 */
	private valueStep(
		value: Expr | undefined,
		tail: Tail,
		scope: Scope,
		graph: string | undefined,
		at: { x: number; y: number },
	): { tail: Tail; value: Value } | undefined {
		if (!value) return undefined;
		const template = this.libraryCall(value, scope, ["call"]);
		if (!template) return undefined;
		const id = this.libraryNode(template, value, scope, graph, { x: at.x - 260, y: at.y });
		this.chain(tail, id);
		const result = (template.def.compilesTo as { result?: string }).result ?? "result";
		return { tail: { node: id, pin: "then" }, value: { kind: "wire", node: id, pin: result } };
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
			} else {
				// `function f()` assigns to `f`: a global, or a local declared
				// earlier (`local f` above it, so that what comes first can call
				// it). Declare Function would write `local function f`, a new local
				// that whatever captured the first never sees; kept as code.
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
				...(sig.returnsWritten === false ? { returnsWritten: false } : {}),
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

/** The library's templates, read once. */
let templates: Map<string, CallTemplate[]> | undefined;
function libraryTemplates(): Map<string, CallTemplate[]> {
	templates ??= callTemplates(BUILTIN_NODES);
	return templates;
}

/** `print`, `task.wait`, `Instance.new`: a callee written as a name and fields. */
function dottedName(e: Expr): string | undefined {
	if (e.kind === "name") return e.name;
	if (e.kind === "index") {
		const object = dottedName(e.object);
		return object ? `${object}.${e.name.name}` : undefined;
	}
	return undefined;
}

/** A pure node's value: its first data output. */
function firstOutput(def: NodeDef): string {
	return def.outputs.find((p) => p.kind !== "exec")?.id ?? "result";
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

/** The built-in nodes an import is made of, made once. */
let builtIn: Registry | undefined;
function registry(): Registry {
	builtIn ??= createRegistry();
	return builtIn;
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
	const importer: Importer = new Importer(
		src,
		prefix,
		options.locals ?? "variable",
		edits,
		mode !== "verbatim",
		options.target,
	);
	importer.collectComments();
	const script: NodeScript = {
		...emptyScript(options.name, `${prefix}-graph`),
		scriptClass: options.scriptClass,
		target: options.target,
		typecheck: typecheckOf(src),
		asWritten: true,
		importedAs: { mode, locals: options.locals ?? "variable" },
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
	const built = { ...script, variables: importer.variables, nodes: [begin, ...nodes], links };
	// Laid out twice when there are comments: once to learn how wide each box
	// is, and so how tall its title wraps, then with that room above each row.
	const first = layoutImport(built, registry());
	const rooms = new Map<string, number>();
	if (importer.boxes.length > 0) {
		for (const [i, box] of commentBoxes(first, importer.boxes, prefix, new Map()).entries())
			rooms.set(
				importer.boxes[i].head,
				Math.max(rooms.get(importer.boxes[i].head) ?? 0, titleHeight(box.text, box.w) + BOX_GAP),
			);
	}
	const laid = rooms.size > 0 ? layoutImport(built, registry(), rooms) : first;
	const commented = { ...laid, comments: commentBoxes(laid, importer.boxes, prefix, rooms) };
	const lineOf = lineIndex(src);
	const origins: Origins = {};
	for (const [id, span] of importer.origins) {
		origins[id] = {
			from: lineOf(span.start).line,
			to: lineOf(Math.max(span.start, span.end - 1)).line,
		};
	}
	return {
		ok: true,
		origins,
		script: commented,
		report: {
			...importer.report(),
			findings: findLikelyBugs(parsed.value, src),
			rewrites: edits.length,
			comments: {
				...importer.commentCount,
				dropped: importer.commentCount.dropped + importer.untakenComments(),
			},
		},
	};
}

/** A comment token's words, without its marks, and the form it was written in. */
function readComment(text: string): { lines: string[]; style?: CommentStyle } {
	const block = /^--\[(=*)\[([\s\S]*)\]\1\]$/.exec(text);
	if (block) {
		const body = block[2].replace(/^\n/, "").replace(/\n[ \t]*$/, "");
		const lines = body.split("\n");
		const indent = Math.min(
			...lines.filter((l) => l.trim() !== "").map((l) => /^[ \t]*/.exec(l)?.[0].length ?? 0),
		);
		const trimmed = lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0).trimEnd());
		return { lines: trimmed, ...(block[1].length > 0 ? { style: "docBlock" as const } : {}) };
	}
	if (text.startsWith("---")) return { lines: [text.slice(3).replace(/^ /, "")], style: "doc" };
	return { lines: [text.slice(2).replace(/^ /, "")] };
}

/** Room around a box's nodes, and between its title and the row above. */
const BOX_PAD = 18;
const BOX_GAP = 12;

/**
 * How tall a comment's title draws at a box's width: the editor's header
 * wraps it at 16px a line inside 5px of padding. Characters are taken a
 * little wide, so a title is given a line too many rather than one too few.
 */
export function titleHeight(text: string, width: number): number {
	const perLine = Math.max(8, Math.floor((width - 16) / 7.4));
	const lines = text
		.split("\n")
		.reduce((n, line) => n + Math.max(1, Math.ceil(line.length / perLine)), 0);
	return 10 + 16 * lines + BOX_PAD;
}

/**
 * A comment box around each commented statement's nodes, as they were laid
 * out: the compiler writes a box's text above the first of them, which is
 * where the file had it.
 */
function commentBoxes(
	script: NodeScript,
	boxes: Importer["boxes"],
	prefix: string,
	/** The room each row was lowered by, for a box's title; one line where not given. */
	rooms: ReadonlyMap<string, number>,
): Comment[] {
	const reg = registry();
	const byId = new Map<string, GraphNode>();
	for (const graph of [
		null,
		...script.nodes.filter((n) => FUNCTION_NODES.has(n.def)).map((n) => n.id),
	]) {
		for (const node of viewOf(script, graph).nodes)
			if (!byId.has(`${graph}/${node.id}`)) byId.set(`${graph}/${node.id}`, node);
	}
	return boxes.flatMap((box, i) => {
		// The box holds the statement's row: its first node, what runs on from
		// it along the same row, and what feeds them. Not an `elseif`'s test or
		// the like, drawn down by the lane it starts.
		const nodeOf = (id: string) => byId.get(`${box.graph ?? null}/${id}`);
		const own = new Set(box.nodes);
		const rowY = nodeOf(box.head)?.y;
		const held = new Set([box.head]);
		for (let grew = true; grew; ) {
			grew = false;
			for (const link of script.links) {
				const { node: from } = link.from;
				const { node: to } = link.to;
				if (held.has(to) && own.has(from) && !held.has(from)) held.add(from);
				else if (held.has(from) && own.has(to) && !held.has(to) && nodeOf(to)?.y === rowY)
					held.add(to);
				else continue;
				grew = true;
			}
		}
		const rects = [...held]
			.map(nodeOf)
			.filter((n): n is GraphNode => n !== undefined)
			.map((n) => nodeBounds(n, reg, true));
		if (rects.length === 0) return [];
		const left = Math.min(...rects.map((r) => r.x)) - BOX_PAD;
		const top =
			Math.min(...rects.map((r) => r.y)) -
			((rooms.get(box.head) ?? 26 + BOX_PAD + BOX_GAP) - BOX_GAP);
		const right = Math.max(...rects.map((r) => r.x + r.w)) + BOX_PAD;
		const bottom = Math.max(...rects.map((r) => r.y + r.h)) + BOX_PAD;
		return [
			{
				id: `${prefix}-comment${i + 1}`,
				x: Math.round(left),
				y: Math.round(top),
				w: Math.round(right - left),
				h: Math.round(bottom - top),
				text: box.text,
				...(box.style ? { style: box.style } : {}),
				...(box.graph ? { graph: box.graph } : {}),
			},
		];
	});
}
