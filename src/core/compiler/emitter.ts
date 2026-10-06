/**
 * The emitter's state and core: output, the execution walk, and resolving data
 * wires into expressions.
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
 *
 * What each kind of node writes lives beside this file, one module to a job:
 * `emitDeclarations`, `emitCalls`, `emitTemplates`, `emitNarrowing`,
 * `emitFlow` and `emitValues`. Their functions take the `Emitter` as their
 * first argument and share its state, which is why its members are not
 * private. Nothing outside the compiler reaches it: `emit.ts` is the way in.
 */

import { commentLines, headersByNode, oneLine } from "../comments.js";
import { FUNCTION_NODES } from "../nodes/flow.js";
import { nodeTitle, type Registry } from "../nodes/index.js";
import { CAST_NODES, type CastMode, castModeOf, NILABLE_CLASS_READS } from "../nodes/library.js";
import { castCall, castsResult } from "../nodes/resultCast.js";
import { type Comment, type NodeScript, PAIR, type PinDef } from "../schema.js";
import {
	modeOf,
	partPinId,
	STRUCTS,
	type StructMode,
	splitKey,
	splitPinId,
	splitsOf,
} from "../structs.js";
import type { Diagnostic, EmitOptions, EmitResult, LogicEmit, LogicEnds } from "./emit.js";
import { emitCall, resultHint, resultNameOf, STATEMENT_READERS } from "./emitCalls.js";
import {
	declareModules,
	emitFunctions,
	emitModuleReturn,
	emitTypes,
	emitVariables,
	flushPreamble,
	PROVIDED_GLOBALS,
} from "./emitDeclarations.js";
import { emitBuiltin } from "./emitFlow.js";
import { alreadyNarrowed } from "./emitNarrowing.js";
import { logicInputName, logicOutputName, type OutLine, Scope } from "./emitScope.js";
import { emitStatement, interpolated, isInterpolated, renderTemplate } from "./emitTemplates.js";
import { CALLING_BUILTINS, pureBuiltin } from "./emitValues.js";
import { GraphIndex, type ResolvedNode } from "./graph.js";
import { hashString } from "./hash.js";
import { isAccessPath, isIdentifier, literalToLuau, NameScope, paren } from "./luau.js";

export class Emitter {
	index: GraphIndex;
	names = new NameScope();
	out: OutLine[] = [];
	indent = 0;
	diagnostics: Diagnostic[] = [];
	/** Guards against an exec wire looping back and emitting forever. */
	execStack = new Set<string>();
	/**
	 * Whether the statement just emitted ends its block.
	 *
	 * Luau requires `return`, `break` and `continue` to be the last statement in
	 * a block, so anything that would follow one is not merely unreachable — it
	 * does not parse. Tracked here rather than inferred afterwards, because by
	 * the time the text exists the block structure is gone.
	 */
	terminated = false;
	/** function.entry node id -> the local it was bound to. */
	functionNames = new Map<string, string>();
	/** ScriptVariable id -> the file-level local it was declared as. */
	variableNames = new Map<string, string>();
	/** Type names already written, from either kind of declaration node. */
	declaredTypes = new Set<string>();
	/**
	 * Variables whose declaration is an `Initialize Variable` node rather than
	 * the block at the top of the file.
	 *
	 * Two sets rather than one, because "will be declared later" and "has been
	 * declared by now" are different questions and both get asked. This one
	 * decides whether to skip the top-of-file line; `declaredSoFar` catches a
	 * read that happens before the declaration it depends on, which Luau would
	 * otherwise compile into a reference to a global that is always nil.
	 */
	initialisedLater = new Set<string>();
	/** Variables declared by this point in the walk. See `initialisedLater`. */
	declaredSoFar = new Set<string>();
	/**
	 * Service name -> the local it was hoisted to. Services are discovered
	 * while walking the graph but printed at the very top, which is what the
	 * separate preamble buffer is for.
	 */
	services = new Map<string, string>();
	/**
	 * What gets required at the top, keyed by what asked for it: `"root/path"`
	 * for a Require Module node, `"module:<id>"` for a declared one.
	 */
	requires = new Map<
		string,
		{
			ident: string;
			expression: string;
			/** Names pulled off it into locals of their own, for a declared module. */
			members?: { member: string; ident: string }[];
		}
	>();
	/** Declared module id -> the local it was bound to, for Get Module. */
	moduleIdents = new Map<string, string>();
	/**
	 * Specifier -> the local it was bound to, for a node that knows what it
	 * needs but not which declaration provides it.
	 *
	 * A Lune Function node knows it calls `@lune/fs`; which module in the panel
	 * that is, and what somebody named it, is the graph's business. Keyed
	 * lowercase because a specifier is a path and the alias in it is
	 * case-insensitive.
	 */
	moduleBySpecifier = new Map<string, string>();
	/**
	 * Local name -> the specifier that chose it, for every module whose name
	 * was typed rather than derived: a declaration or a Require at Top's `As`.
	 * See `claimModuleName`.
	 */
	moduleClaims = new Map<string, string>();
	preamble: OutLine[] = [];
	/** Node id -> the comment whose header goes above its code. */
	private headers = new Map<string, Comment>();
	/** Comments already written, so a header is printed once per block. */
	private headed = new Set<string>();

	constructor(
		readonly script: NodeScript,
		registry: Registry,
		private sourceHash: string,
		readonly options: EmitOptions = {},
	) {
		this.index = new GraphIndex(script, registry);
		// Worked out once: it is a pass over every comment against every node,
		// and the answer cannot change while one file is being written.
		if (this.options.comments) this.headers = headersByNode(script, registry);
		// Anything Luau itself provides must not be shadowed by a generated name.
		for (const g of PROVIDED_GLOBALS) this.names.reserve(g);
	}

	run(): EmitResult {
		const root = new Scope();

		// Before anything walks the graph, so a declared module gets the plain
		// name its author chose and a later collision is the one that renames.
		declareModules(this);

		emitTypes(this);
		emitVariables(this);
		emitFunctions(this, root);
		this.emitMainFlow(root);
		emitModuleReturn(this, root);

		// Services were collected during the walk above; they belong at the top,
		// below the flags, the way a hand-written Roblox file has them.
		flushPreamble(this);

		const lines = [...this.preamble, ...this.out];
		const body = this.render(lines);
		const outputHash = hashString(body);
		const header = this.header(outputHash);
		// How many lines the header occupies. `split("\n").length` is one too
		// many: the header ends with a newline, so splitting leaves a trailing
		// empty string that is not a line, and every entry in the source map
		// would land one line late.
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

	/**
	 * A node's logic rather than a file: no header, no types, no module return.
	 *
	 * Each input pin is bound in the root scope to a placeholder identifier, the
	 * same way a function binds its parameters, so every read of Node Inputs
	 * resolves to it — `resolveOutput` asks the scope before anything else. An
	 * impure node walks from Node Inputs' execution pin and Node Outputs assigns
	 * the output placeholders; a pure node resolves each of Node Outputs' inputs
	 * to one expression, and anything that needed a line of its own is an error.
	 */
	runLogic(shape: LogicEnds): LogicEmit {
		const root = new Scope();
		for (const id of shape.inputs) {
			this.names.reserve(logicInputName(id));
			root.bindings.set(`${shape.inputsId}/${id}`, logicInputName(id));
		}
		for (const id of shape.outputs) this.names.reserve(logicOutputName(id));

		const expressions: Record<string, string> = {};
		if (shape.pure) {
			const outputs = this.index.get(shape.outputsId);
			if (outputs) {
				for (const id of shape.outputs) {
					const pin = outputs.baseInputs.find((p) => p.id === id);
					if (pin) expressions[id] = this.resolveInput(outputs, pin, root);
				}
			}
			if (this.out.length > 0) {
				this.error(
					"A pure node's logic is one expression per output, and something here needs a line of its own.",
					this.out.find((l) => l.node)?.node,
				);
			}
			return { body: "", expressions, diagnostics: this.diagnostics };
		}

		this.walk(this.index.execTarget(shape.inputsId, "then"), root);
		return {
			body: this.out.length > 0 ? this.render(this.out) : "",
			expressions,
			diagnostics: this.diagnostics,
		};
	}

	// -- output plumbing ---------------------------------------------------

	/**
	 * The comment header owed before this node's first line, if any.
	 *
	 * Asked once per node and struck off, so a comment holding six nodes prints
	 * its header above the first of them rather than above all six. A node that
	 * emits nothing never asks, so a comment around only such nodes prints
	 * nothing -- which is right: there is no block for it to head.
	 */
	private headerFor(nodeId: string | undefined): void {
		if (nodeId === undefined || !this.options.comments) return;
		const comment = this.headers.get(nodeId);
		if (!comment || this.headed.has(comment.id)) return;
		this.headed.add(comment.id);

		// A blank line before it, but only between blocks.
		//
		// A heading with the previous block still against it reads as part of
		// that block. A heading on the *first* line of a block does not -- the
		// `if` above it already separates them -- and a blank there is a gap
		// nobody writes by hand. The test is the previous line's depth: a block
		// opener sits one level shallower than what it opens.
		const previous = [...this.out].reverse().find((line) => line.text !== "");
		if (previous && previous.indent >= this.indent) this.blank();
		this.write(commentLines(comment.text).join("\n"), nodeId);
	}

	/**
	 * One statement, which may run to several lines, with the comment header
	 * owed above it.
	 *
	 * Leading tabs in the text are **relative** indentation, added to the
	 * statement's own rather than left in the line to be indented again. A
	 * multi-line expression — a table written one key to a line — can then
	 * indent its own body without knowing how deep the statement it lands in
	 * happens to be.
	 */
	push(text: string, node?: string): void {
		this.headerFor(node);
		this.write(text, node);
	}

	/**
	 * Lines out, with leading tabs read as relative indentation.
	 *
	 * Apart from `push` so that a comment header can use it without asking for a
	 * comment header. That matters for more than the recursion: a block comment
	 * indents its own body with a tab, and it is this that turns the tab into a
	 * level — so the body follows the project's indent setting rather than being
	 * a tab sitting inside four spaces.
	 */
	private write(text: string, node?: string): void {
		for (const line of text.split("\n")) {
			const inner = line.length - line.replace(/^\t+/, "").length;
			this.out.push({ text: line.slice(inner), indent: this.indent + inner, node });
		}
	}

	blank(): void {
		if (this.out.length > 0 && this.out[this.out.length - 1].text !== "") {
			this.out.push({ text: "", indent: 0 });
		}
	}

	private render(lines: OutLine[]): string {
		const unit = this.options.indent ?? "\t";
		const body = lines.map((l) => (l.text === "" ? "" : unit.repeat(l.indent) + l.text)).join("\n");
		return body.endsWith("\n") ? body : body + "\n";
	}

	/** Reads a pin's literal as plain text. Empty when the pin is wired. */
	literalText(r: ResolvedNode, pinId: string): string {
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
	get annotates(): boolean {
		return this.script.typecheck !== "default";
	}

	private header(outputHash: string): string {
		const lines: string[] = [];
		if (this.script.typecheck === "strict") lines.push("--!strict");
		else if (this.script.typecheck === "nonstrict") lines.push("--!nonstrict");
		lines.push("-- Generated by Roswaal. Do not edit this file directly;");
		// Read from the graph file, which is anybody's JSON: kept to their line.
		lines.push(`-- edit ${oneLine(this.script.name)}.nodescript and recompile instead.`);
		lines.push(`-- roswaal-graph: ${oneLine(this.script.id)}`);
		lines.push(`-- roswaal-source: ${this.sourceHash}`);
		lines.push(`-- roswaal-output: ${outputHash}`);
		lines.push("");
		return lines.join("\n") + "\n";
	}

	error(message: string, node?: string, pin?: string): void {
		this.diagnostics.push({ severity: "error", message, node, pin });
	}

	warn(message: string, node?: string, pin?: string): void {
		this.diagnostics.push({ severity: "warning", message, node, pin });
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

	// -- execution walk ----------------------------------------------------

	walk(startId: string | undefined, scope: Scope): boolean {
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
		// A node for the other target is an error, reported by `validate` for
		// every node rather than here, where only the execution chain passes.
		const spec = r.def.compilesTo;
		switch (spec.kind) {
			case "builtin":
				return emitBuiltin(this, spec.handler, r, scope);
			case "call":
				return emitCall(this, r, spec.template, spec.result, scope);
			case "statement":
				return emitStatement(this, r, spec.template, scope);
			case "expr":
				this.error(
					`"${r.def.title}" is a pure node and cannot be placed in an execution chain.`,
					r.node.id,
				);
				return undefined;
		}
	}

	/**
	 * The one reader an output is written straight into, when there is one.
	 *
	 * A result wired only into a Declare Local, a setter or a table field was
	 * given a local of its own and then copied: `local child = ...` and then
	 * `local named = child`. Two names for one value, and the first says nothing
	 * the second does not. Those readers name the value themselves, so it goes
	 * straight into them.
	 *
	 * One reader only, of the whole value. A second reader needs the local, and
	 * so does a split output, whose parts are read off a local. A knot on the
	 * way is seen through, as it is everywhere: inserting one changes nothing.
	 */
	foldsInto(nodeId: string, pinId: string): ResolvedNode | undefined {
		if (this.index.readerCount(nodeId, pinId, { parts: true }) !== 1) return undefined;
		const links = this.index.readersOf(nodeId, pinId);
		if (links.length !== 1) return undefined;
		const to = links[0].to;
		const reader = this.index.get(to.node);
		if (!reader) return undefined;
		const id = reader.def.id;
		if (to.pin === "value" && STATEMENT_READERS.has(id)) return reader;
		if (id === "table.pair" && to.pin === "value") return reader;
		if (id === "table.dictionary") return reader;
		return undefined;
	}

	/**
	 * Runs `fn` with whatever it emits collected instead of written.
	 *
	 * The lines come back at the indentation they were produced at, so a caller
	 * that decides to keep them puts them back verbatim.
	 */
	capture<T>(fn: () => T): { value: T; lines: OutLine[] } {
		const outer = this.out;
		this.out = [];
		try {
			return { value: fn(), lines: this.out };
		} finally {
			this.out = outer;
		}
	}

	/**
	 * The node actually feeding an input, seeing through reroute knots.
	 *
	 * A knot is a bend in the wire and never changes what travels down it, so
	 * asking "what is on the other end of this" has to walk past one.
	 */
	feederOf(nodeId: string, pinId: string): ResolvedNode | undefined {
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

	// -- data resolution ---------------------------------------------------

	/**
	 * A pin as the node's own templates name it — the shape before splitting.
	 * `$in.position` still means the whole Vector3 even when the instance has
	 * broken it into three wireable component pins.
	 */
	pin(r: ResolvedNode, pinId: string, dir: "in" | "out"): PinDef {
		const list = dir === "in" ? r.baseInputs : r.baseOutputs;
		const found = list.find((p) => p.id === pinId);
		if (found) return found;
		return { id: pinId, name: pinId, kind: "data", type: "any" };
	}

	/** The split mode applied to one of a node's pins, if any. */
	splitOf(r: ResolvedNode, pinId: string, dir: "in" | "out"): StructMode | undefined {
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
	private buildSplitInput(r: ResolvedNode, parent: PinDef, mode: StructMode, scope: Scope): string {
		// A pair splits into a key and a value, and there is nothing to rebuild
		// those into: `{ walkSpeed = 16 }` is syntax, not a value. Make
		// Dictionary's fold reads the parts where there is a table for them to
		// be an entry of; reaching here means something else was handed one.
		if (parent.type === PAIR) {
			this.error(
				"A Key Value Pair is one entry of a table, so it only goes into Make Dictionary.",
				r.node.id,
				parent.id,
			);
			return "nil";
		}

		const values = new Map<string, string>();
		for (const part of mode.parts) {
			const id = partPinId(parent.id, part.id);
			const child =
				r.inputs.find((p) => p.id === id) ??
				({ id, name: part.name, kind: "data", type: part.type, default: part.default } as PinDef);
			values.set(part.id, paren(this.resolveInput(r, child, scope)));
		}
		return mode.make.replace(
			/\$([A-Za-z_][A-Za-z0-9_]*)/g,
			(match, id: string) => values.get(id) ?? match,
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
		src: ResolvedNode,
		parentPin: string,
		scope: Scope,
		consumer: ResolvedNode,
	): string {
		const existing = scope.lookup(`${src.node.id}/${parentPin}`);
		if (existing) return existing;

		const expr = this.resolveOutput(src.node.id, parentPin, scope, consumer);
		if (isIdentifier(expr)) return expr;

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
	 * wired, otherwise the literal typed into it, otherwise its default.
	 */
	resolveInput(r: ResolvedNode, pin: PinDef, scope: Scope): string {
		// Split into components: there is no wire and no literal on the pin
		// itself any more, so the value is assembled from the parts.
		const split = this.splitOf(r, pin.id, "in");
		if (split) return this.buildSplitInput(r, pin, split, scope);

		const link = this.index.sourceOf(r.node.id, pin.id);
		if (!link) {
			const lit = r.node.literals?.[pin.id] ?? pin.default;
			if (lit === undefined) {
				if (pin.required !== false && pin.optional !== true) {
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
		nodeId: string,
		pinId: string,
		scope: Scope,
		consumer: ResolvedNode,
	): string {
		const bound = scope.lookup(`${nodeId}/${pinId}`);
		if (bound) return bound;

		const src = this.index.get(nodeId);
		if (!src) {
			this.error(
				`"${consumer.def.title}" reads from a node that no longer exists.`,
				consumer.node.id,
			);
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

		// A function's own name, so it can be passed as a value.
		//
		// Both nodes that declare one. Checked before the scope rule below,
		// because Declare Function is impure and its name would otherwise be
		// reported as out of scope -- which is what an impure node's output
		// *is* outside its block, and is not what a function's name is anywhere.
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

		// Most pure builtins resolve to a name and are read where they are used:
		// a variable read has to happen at its use site, or a Set between two
		// Gets would be invisible to the second one. A call is the exception. It
		// answers once, so two readers share one local as an expression's do.
		if (spec.kind === "builtin") {
			const expr = this.castResult(
				src,
				pinId,
				pureBuiltin(this, spec.handler, src, consumer, scope),
			);
			return CALLING_BUILTINS.has(spec.handler)
				? this.bindForReaders(src, pinId, expr, scope, { fallback: "result" })
				: expr;
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

		const cast = CAST_NODES.has(src.def.id) ? castModeOf(src.node.config) : undefined;
		// An implicit Cast standing inside the arm that already proved its
		// claim has nothing left to say, so it says nothing and hands the value
		// through. This is the line hand-written Luau does not write either.
		if (cast === "implicit" && src.def.id === "cast.as" && alreadyNarrowed(this, src, scope)) {
			return this.resolveInput(src, this.pin(src, "value", "in"), scope);
		}

		// Guard against a cycle among pure nodes, which would recurse forever.
		if (this.execStack.has(`pure:${nodeId}`)) {
			this.error(`"${src.def.title}" feeds itself through a loop of data wires.`, nodeId);
			return "nil";
		}
		this.execStack.add(`pure:${nodeId}`);
		// Concatenate writes the interpolated form when the node says so.
		let expr =
			src.def.id === "string.concat" && isInterpolated(src.node.config)
				? interpolated(this, src, scope)
				: renderTemplate(this, src, template, scope);
		this.execStack.delete(`pure:${nodeId}`);

		// An operator pill asked to bracket what it works out.
		//
		// Only the pills, because only they are one operator wearing its symbol
		// on its face -- and only they have the readable-either-way property that
		// makes this a choice rather than a bug. Everywhere else the emitter
		// brackets exactly what Luau's precedence requires and no more, which is
		// what `parenAt` is for.
		//
		// Wrapping here rather than at the use site means the brackets travel
		// with the value: read twice, bound to a local, spliced into a template,
		// it is the same expression each time. And a wrapped expression is
		// already an atom, so nothing downstream adds a second pair.
		if (src.def.display === "operator" && src.node.config?.parens === true) {
			expr = `(${expr})`;
		}

		// A Find First node that names a class hands back that class or `nil`,
		// and Luau's own signature says only `Instance?`. The pin says the class;
		// the file says so too, as `Class?`, so a typechecked file and the graph
		// agree about what the value is. Only where annotations are written at
		// all: Default writes none, and a cast would be the one annotation in it.
		const typed = src.outputs.find((p) => p.id === pinId)?.type;
		if (
			this.annotates &&
			NILABLE_CLASS_READS.has(src.def.id) &&
			typed !== undefined &&
			typed !== "Instance" &&
			typed !== "any"
		) {
			expr = `(${expr} :: ${typed}?)`;
		}

		return this.bindForReaders(src, pinId, this.castResult(src, pinId, expr), scope, { cast });
	}

	/** A pure call's result, with the cast its node asks for. See `resultCast.ts`. */
	private castResult(src: ResolvedNode, pinId: string, expr: string): string {
		if (pinId !== "result" || !castsResult(src.def)) return expr;
		return castCall(expr, src.node.config);
	}

	/**
	 * A pure value as its readers see it: spliced in, or bound to a local first.
	 *
	 * `resultName` names the local, exactly as the impure path reads it. A node
	 * that bound its result under a name you typed has to go on doing so when
	 * the binding happens here — otherwise making a node pure silently orphans
	 * the name already sitting in the file, and the local comes back as the
	 * pin's name with a number stuck on it. `fallback` names it when nothing
	 * else does, ahead of the pin's own name.
	 */
	private bindForReaders(
		src: ResolvedNode,
		pinId: string,
		expr: string,
		scope: Scope,
		how: { cast?: CastMode; fallback?: string } = {},
	): string {
		const nodeId = src.node.id;
		const cast = how.cast;
		const named = resultNameOf(src.node.config);

		// One consumer: splice it in. More: bind it once, so a side-effecting or
		// merely expensive expression is not worked out twice.
		//
		// An access path is the exception, and reading it again is not a
		// concession — it is the more faithful answer. `restore.weld` read twice
		// is what the hand-written module writes, hoisting it costs a line and a
		// name that says nothing, and the local is a snapshot: a Set Index
		// between the two reads would never reach it, so the graph would say
		// "read this field here" and the file would not. See `isAccessPath` for
		// how narrow the test is.
		//
		// A name you typed is the other exception, in the other direction.
		// Naming the result is a request for the local, not a suggestion about
		// what to call one if it happens to appear — and a field that does
		// nothing until some second reader shows up is a field you have to
		// experiment on to understand.
		//
		// A pure node's logic is one expression, with nowhere to put the local.
		if (this.options.expressionsOnly) return expr;
		// A cast that has been told which it is overrides the ordinary rule.
		// Implicit never takes a line; explicit always does, even for one reader.
		if (cast === "implicit") return expr;
		// A result read only by something that names it — a Declare Local, a
		// setter, a table field — is written straight into it. The Result name
		// would only make a second local holding the same value.
		if (cast !== "explicit" && (!named || this.foldsInto(nodeId, pinId) !== undefined)) {
			if (this.index.readerCount(nodeId, pinId) <= 1) return expr;
			if (isAccessPath(expr)) return expr;
		}

		const outPin = src.outputs.find((p) => p.id === pinId);
		const ident = this.names.unique(resultHint(src, outPin, how.fallback), "value");
		this.push(`local ${ident} = ${expr}`, nodeId);
		scope.bindings.set(`${nodeId}/${pinId}`, ident);
		return ident;
	}
}
