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
	foldPrecedence, indentBlock, isAccessPath, isAtomic, literalToLuau, NameScope, paren, parenAt,
	quoteString, templatePrecedence, toIdentifier,
} from "./luau.js";
import { GraphIndex, type ResolvedNode } from "./graph.js";
import { FUNCTION_NODES, loopTypes, typeShapeOf } from "../nodes/flow.js";
import { CAST_NODES, castModeOf } from "../nodes/library.js";
import { checkLuauBalance } from "../luauCheck.js";
import { isModuleScript, PAIR } from "../schema.js";
import { checkSpecifier, type SpecifierContext } from "../modules.js";
import { argPinId, callOf, luneFunction, moduleOf, specifierFor } from "../luneCalls.js";
import { commentLines, headersByNode } from "../comments.js";
import type { Comment, Literal, NodeConfig, NodeScript, PinDef } from "../schema.js";
import type { Signature } from "../nodes/flow.js";
import type { FunctionRef, LocalRef, ParamRef, VariableRef } from "../nodes/variables.js";
import { isConstLocal } from "../nodes/variables.js";
import {
	isInstanceClass as isRobloxClass, isService as isRobloxService, isSubclassOf, lastSegment,
	renderPath,
} from "../roblox.js";
import { methodOf, serviceMethod, serviceOf } from "../serviceCalls.js";
import { nodeTitle, type Registry } from "../nodes/index.js";
import {
	modeOf, partPinId, splitKey, splitPinId, splitsOf, STRUCTS, type StructMode,
} from "../structs.js";

/**
 * Names the runtime provides, which a *generated* name must not shadow.
 *
 * "Generated" is the load-bearing word. A name somebody typed is allowed to
 * shadow one of these — binding `Vector3` off `@lune/roblox` is the whole point
 * of that mechanism — but it is worth warning about, because shadowing `table`
 * breaks `table.insert` for the rest of the file.
 */
const PROVIDED_GLOBALS = [
	"game", "workspace", "script", "shared", "require", "print", "warn", "table", "math",
	"string", "task", "Instance", "Vector3", "Color3", "CFrame", "Enum", "tostring",
	"tonumber", "pairs", "ipairs", "next", "select", "type", "typeof",
];

/**
 * The local a module specifier would be called if nobody said.
 *
 * Its last segment. `lastSegment` splits on dots because it was written for
 * instance paths, so `@lune/fs` came out as `lune_fs` — readable, and not what
 * anybody would have typed. A specifier is separated by slashes.
 */
export function specifierName(specifier: string): string {
	const parts = specifier.replace(/^@/, "").split(/[\\/]+/).filter((part) => part !== "");
	// `./util/config.luau` is called config, not luau.
	return (parts[parts.length - 1] ?? "").replace(/\.(luau|lua)$/, "");
}

export interface Diagnostic {
	severity: "error" | "warning";
	message: string;
	node?: string;
	pin?: string;
	/**
	 * This warning is about the node itself, and the node can be marked for it.
	 *
	 * Errors are always marked — a count in the node's corner — and warnings are
	 * not, because most of them are about *where a node sits* rather than what
	 * it is. "Not connected to anything that runs" is true of every node the
	 * moment it is dropped, and marking those would put a pip on each one while
	 * a graph is being built, which is a warning about being halfway through.
	 *
	 * So a warning opts in. The ones that do are the ones a developer can act
	 * on by selecting the node and reading the Inspector — a Lune call whose
	 * module nothing requires, where the Inspector has the button that fixes it.
	 */
	attention?: boolean;
}

export interface EmitResult {
	code: string;
	diagnostics: Diagnostic[];
	/** 1-based output line -> the node that produced it. Powers error mapping. */
	sourceMap: { line: number; node: string }[];
	/** Hash of the emitted body, so dynamic compiling can spot hand edits. */
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
	/**
	 * Values Luau already knows more about here than their declared type says,
	 * and the classes it knows them to be.
	 *
	 * Written by a Branch on Is A, and read by an implicit Cast. Keyed by where
	 * the value came *from* — a node and a pin — rather than by the text it
	 * compiles to, because the text can be a local in one place and an inlined
	 * expression in another and it is the same value either way.
	 *
	 * Scoped exactly as bindings are, which is the whole point: a narrowing
	 * holds inside the arm that tested for it and nowhere else. The False arm of
	 * the same Branch gets a fresh scope and knows nothing.
	 */
	narrowings = new Map<string, Set<string>>();
	constructor(readonly parent?: Scope, readonly loop = false) {}

	lookup(key: string): string | undefined {
		return this.bindings.get(key) ?? this.parent?.lookup(key);
	}

	/** The classes this value is known to be here, innermost test first. */
	narrowedTo(key: string): Set<string> | undefined {
		return this.narrowings.get(key) ?? this.parent?.narrowedTo(key);
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
	if (TYPE_NAME.test(t)) return t;
	return isTypeExpression(t) ? t.trim() : "any";
}

/**
 * Whether text reads as a Luau type rather than as anything else.
 *
 * The same argument as for names, one step further: `{ [Model]: Restore }` typed
 * for a local or a parameter was written `any`, and nothing said so. So a type
 * made of types — braces, brackets, `?`, `|`, `->`, names with dots — is written
 * as it was typed, and a mistake in it is Luau's to report, with a line number.
 *
 * What is refused is text that is plainly not a type: unclosed brackets, more
 * than one line, a comment, an assignment, or two words side by side, which no
 * type has and `2 bad` does.
 */
function isTypeExpression(t: string): boolean {
	const text = t.trim();
	if (text === "" || text.includes("\n") || text.includes("--")) return false;
	if (!/^[A-Za-z_{("']/.test(text)) return false;
	if (/=(?!>)/.test(text.replace(/->/g, ""))) return false;
	if (/[A-Za-z0-9_]\s+[A-Za-z0-9_]/.test(text)) return false;
	return checkLuauBalance(text).length === 0;
}

export function emit(
	script: NodeScript, registry: Registry, sourceHash: string, options: EmitOptions = {},
): EmitResult {
	return new Emitter(script, registry, sourceHash, options).run();
}

/**
 * How the emitter is asked to write, when what it writes is not a file.
 *
 * A custom node's logic built from nodes compiles to that node's **template**,
 * and a template is spliced into somebody else's file — so it has no top of the
 * file to hoist to, and a pure node's template is one expression with nowhere to
 * put a local. These two switches are those two facts.
 */
export interface EmitOptions {
	/**
	 * What the project's `.luaurc` files say, for checking an alias.
	 *
	 * Optional, and absent it changes nothing: without it the specifier check
	 * says what a specifier *is* and has no opinion about whether the alias
	 * exists. A custom node's template compiles with no project behind it at
	 * all, and so does a test.
	 */
	specifiers?: SpecifierContext;
	/** Write Get Service and Require Module where they are used, not at the top. */
	inline?: boolean;
	/**
	 * Never bind a pure value to a local, however many places read it. For a
	 * pure node's logic, which is one expression per output.
	 */
	expressionsOnly?: boolean;
	/**
	 * What one level of indentation is written as. A tab unless the project says
	 * otherwise; see `indentUnit` in the schema.
	 *
	 * Only the *rendering* uses it. Depth is counted in levels everywhere else,
	 * and a template that indents its own body writes tabs, which `push` reads
	 * as levels rather than leaving in the line — so nothing in the emitter has
	 * to know how wide a level happens to be.
	 */
	indent?: string;
	/**
	 * Write each comment's header into the file, above the code of the nodes it
	 * is drawn around.
	 *
	 * A project setting rather than a graph one: it changes every generated file
	 * and everyone on a repository has to agree. Default on -- a comment is
	 * written to be read, and a visual language that throws it away at the door
	 * makes you write it twice.
	 */
	comments?: boolean;
}

/** What a node's logic compiles to, before the placeholders are put back. */
export interface LogicEmit {
	/** An impure node's body, one statement to a line. */
	body: string;
	/** A pure node's expression per output pin. */
	expressions: Record<string, string>;
	diagnostics: Diagnostic[];
}

/** The identifier an input pin is bound to while its logic compiles. */
export const logicInputName = (pinId: string) => `__rsw_in_${pinId}`;
/** The identifier an output pin is assigned to while its logic compiles. */
export const logicOutputName = (pinId: string) => `__rsw_out_${pinId}`;

/**
 * Emits a node's logic graph: from its Node Inputs to its Node Outputs.
 *
 * See `compileLogic` in `logic.ts`, which is the only caller and the place the
 * rules about what a logic graph may hold are kept.
 */
export function emitLogic(
	script: NodeScript,
	registry: Registry,
	shape: { inputsId: string; outputsId: string; pure: boolean; inputs: string[]; outputs: string[] },
): LogicEmit {
	return new Emitter(script, registry, "", { inline: true, expressionsOnly: shape.pure }).runLogic(shape);
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
	/**
	 * What gets required at the top, keyed by what asked for it: `"root/path"`
	 * for a Require Module node, `"module:<id>"` for a declared one.
	 */
	private requires = new Map<string, {
		ident: string;
		expression: string;
		/** Names pulled off it into locals of their own, for a declared module. */
		members?: { member: string; ident: string }[];
	}>();
	/** Declared module id -> the local it was bound to, for Get Module. */
	private moduleIdents = new Map<string, string>();
	/**
	 * Specifier -> the local it was bound to, for a node that knows what it
	 * needs but not which declaration provides it.
	 *
	 * A Lune Function node knows it calls `@lune/fs`; which module in the panel
	 * that is, and what somebody named it, is the graph's business. Keyed
	 * lowercase because a specifier is a path and the alias in it is
	 * case-insensitive.
	 */
	private moduleBySpecifier = new Map<string, string>();
	private preamble: OutLine[] = [];
	/** Node id -> the comment whose header goes above its code. */
	private headers = new Map<string, Comment>();
	/** Comments already written, so a header is printed once per block. */
	private headed = new Set<string>();

	constructor(
		private script: NodeScript,
		registry: Registry,
		private sourceHash: string,
		private options: EmitOptions = {},
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
		this.declareModules();

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
	runLogic(shape: { inputsId: string; outputsId: string; pure: boolean; inputs: string[]; outputs: string[] }): LogicEmit {
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
		return { body: this.out.length > 0 ? this.render(this.out) : "", expressions, diagnostics: this.diagnostics };
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

		/**
		 * A blank line before it, but only between blocks.
		 *
		 * A heading with the previous block still against it reads as part of
		 * that block. A heading on the *first* line of a block does not -- the
		 * `if` above it already separates them -- and a blank there is a gap
		 * nobody writes by hand. The test is the previous line's depth: a block
		 * opener sits one level shallower than what it opens.
		 */
		const previous = [...this.out].reverse().find((line) => line.text !== "");
		if (previous && previous.indent >= this.indent) this.blank();
		this.write(commentLines(comment.text).join("\n"), nodeId);
	}

	private push(text: string, node?: string): void {
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

	private blank(): void {
		if (this.out.length > 0 && this.out[this.out.length - 1].text !== "") {
			this.out.push({ text: "", indent: 0 });
		}
	}

	private render(lines: OutLine[]): string {
		const unit = this.options.indent ?? "\t";
		const body = lines
			.map((l) => (l.text === "" ? "" : unit.repeat(l.indent) + l.text))
			.join("\n");
		return body.endsWith("\n") ? body : body + "\n";
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
	private declareModules(): void {
		// A template has no top of the file to hoist to; it is one expression.
		if (this.options.inline) return;
		/** Local name -> the module that asked for it, for the clash below. */
		const claimed = new Map<string, string>();

		for (const module of this.script.modules ?? []) {
			const specifier = module.specifier.trim();
			if (specifier === "") continue;

			// Whether this target resolves it at all. The declaration still
			// compiles either way: a require that will not resolve is worth
			// saying loudly and is not worth silently dropping, because the
			// generated file is the thing the developer is about to read.
			const wrong = checkSpecifier(specifier, this.script.target, this.options.specifiers);
			if (wrong) {
				const said = `Module "${module.name || specifier}": ${wrong.message}`;
				if (wrong.severity === "error") this.error(said);
				else this.warn(said);
			}

			/**
			 * A declared name is taken **verbatim**, not made unique.
			 *
			 * The panel makes you type one, so it is always a choice — and
			 * `uniqueForFile` answers a different question. Asked for `util`
			 * twice it hands back `util` and `util2`; asked for `table` it hands
			 * back `table2`. Both are silent, and both leave the graph saying
			 * one name while the file says another, which is the kind of
			 * mismatch that costs an afternoon.
			 *
			 * Two modules genuinely can want one name — `./combat/util` and
			 * `./inventory/util` is a shape real projects have — and the answer
			 * to that is for the author to rename one, which they can only do
			 * if we tell them.
			 */
			const wanted = toIdentifier(module.name.trim() || specifierName(specifier) || "module");

			const already = claimed.get(wanted);
			if (already !== undefined) {
				this.error(
					`Two modules are both called "${wanted}" — ${already} and ${specifier}. ` +
						"Rename one of them: a generated file can only bind the name once.",
				);
				continue;
			}
			if (PROVIDED_GLOBALS.includes(wanted)) {
				this.warn(
					`The module "${wanted}" shadows something Luau provides. That is allowed and is ` +
						"sometimes the point, but everything below it in this file sees the module " +
						"rather than the global.",
				);
			}
			claimed.set(wanted, specifier);
			this.names.reserve(wanted);

			const ident = wanted;
			this.moduleIdents.set(module.id, ident);
			// First declaration of a specifier wins, which is the one whose
			// require is written first and so the one already in scope.
			if (!this.moduleBySpecifier.has(specifier.toLowerCase())) {
				this.moduleBySpecifier.set(specifier.toLowerCase(), ident);
			}
			this.requires.set(`module:${module.id}`, {
				ident,
				expression: quoteString(specifier),
				// A member takes the name it asks for, verbatim.
				//
				// `uniqueForFile` would not give it one: the emitter reserves the
				// Roblox globals so a generated local cannot shadow them, and
				// `Vector3` bound off `@lune/roblox` came out as `Vector32`. But
				// shadowing is the entire point here -- binding `Vector3` is what
				// lets `Vector3.new(1, 2, 3)` compile unchanged under Lune, and a
				// binding the author wrote down is not the accident that rule
				// guards against. Reserved afterwards so a later generated name
				// avoids it rather than the other way round.
				members: (module.members ?? [])
					.map((member) => member.trim())
					.filter((member) => member !== "")
					.map((member) => {
						const ident = toIdentifier(member);
						this.names.reserve(ident);
						return { member, ident };
					}),
			});
		}
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
		for (const { ident, expression, members } of this.requires.values()) {
			this.preamble.push({ text: `local ${ident} = require(${expression})`, indent: 0 });
			// What the module was asked to hand out, bound beneath it. Lune's own
			// idiom, and what lets `Vector3.new(...)` compile unchanged there.
			for (const bound of members ?? []) {
				this.preamble.push({
					text: `local ${bound.ident} = ${ident}.${bound.member}`,
					indent: 0,
				});
			}
		}
		this.preamble.push({ text: "", indent: 0 });
	}

	/**
	 * The Luau expression a path node starts from, registering the service if
	 * the root names one. `game`, `script` and `workspace` need no declaration.
	 */
	private resolveRoot(root: string): string {
		if (!isRobloxService(root)) return root;
		// A template has no top of the file to hoist a service to.
		if (this.options.inline) return `game:GetService(${quoteString(root)})`;
		const existing = this.services.get(root);
		if (existing) return existing;
		const ident = this.names.uniqueForFile(root, "service");
		this.services.set(root, ident);
		return ident;
	}

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
	private luneCall(src: ResolvedNode, scope: Scope): string {
		const alias = moduleOf(src.node.config);
		const call = callOf(src.node.config);
		if (call === undefined) {
			this.error("This Lune Function has no call chosen.", src.node.id);
			return "nil";
		}

		const specifier = specifierFor(alias);
		const ident = this.moduleBySpecifier.get(specifier.toLowerCase());
		if (ident === undefined) {
			// The specifier, not a description of the problem: it is what gets
			// typed into the panel to fix this.
			this.error(
				`This calls \`${alias}.${call}\`, and nothing in this script requires ` +
				`\`${specifier}\`. Declare it in the Variables panel — Roswaal will not add a ` +
				"require you did not ask for.",
				src.node.id,
			);
			return "nil";
		}

		const fn = luneFunction(alias, call);
		const args = Array.from({ length: fn?.params.length ?? 0 }, (_unused, i) =>
			this.resolveInput(src, this.pin(src, argPinId(i), "in"), scope));
		// A trailing optional nobody filled in is left off rather than passed as
		// nil, which is the difference between a call the runtime accepts and
		// one it rejects.
		while (args.length > 0 && fn?.params[args.length - 1]?.optional && args.at(-1) === "nil") {
			args.pop();
		}
		return `${ident}.${call}(${args.join(", ")})`;
	}

	private serviceCall(r: ResolvedNode, scope: Scope): string {
		const id = r.node.id;
		const service = serviceOf(r.node.config);
		const name = methodOf(r.node.config) ?? "";
		if (name === "") {
			this.error(
				`"${r.def.title}" has no call chosen. Pick one in the Inspector — the service and ` +
					"the method become text in the generated file, so they are set on the node " +
					"rather than wired into it.",
				id,
			);
			return "nil";
		}

		const known = serviceMethod(service, name);
		const pins = r.inputs.filter((p) => VARIADIC_PIN.test(p.id));
		const set = pins.map((pin) => this.isSet(r, pin));
		// Trailing optional arguments nobody has touched are not passed at all,
		// on the rule `$opt` follows and for the same reason: the engine rejects
		// an explicit nil in places where it is happy with a missing argument.
		let last = pins.length - 1;
		while (last >= 0 && pins[last].optional === true && !set[last]) last -= 1;

		const args = pins.slice(0, last + 1).map((pin, index) => {
			if (pin.optional === true && !set[index]) return "nil";
			return this.serviceArgument(r, pin, scope, known?.params[index]?.enum);
		});
		return `${this.serviceReceiver(r, service, scope)}:${toIdentifier(name, "method")}(${args.join(", ")})`;
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
	private serviceReceiver(r: ResolvedNode, service: string, scope: Scope): string {
		const link = this.index.sourceOf(r.node.id, "service");
		if (!link) return this.resolveRoot(service);

		const from = this.index.get(link.from.node);
		const type = from?.outputs.find((p) => p.id === link.from.pin)?.type;
		if (type && type !== "Instance" && isRobloxClass(type) && !isSubclassOf(type, service)) {
			this.warn(
				`This wire carries a ${type}, and the call is a ${service} method. It will run on ` +
					"whatever is wired, so this is only right if the value really is that service.",
				r.node.id,
				"service",
			);
		}
		return paren(this.resolveInput(r, this.pin(r, "service", "in"), scope));
	}

	/**
	 * One argument, with the enum ones written out.
	 *
	 * An enum argument is typed as its member name — `E`, `Begin` — because that
	 * is what somebody has in mind, and `Enum.KeyCode.E` is what Luau wants. A
	 * wire wins over the name: the value then comes from the graph and is already
	 * whatever it is.
	 */
	private serviceArgument(
		r: ResolvedNode, pin: PinDef, scope: Scope, enumName: string | undefined,
	): string {
		if (!enumName || this.index.sourceOf(r.node.id, pin.id)) {
			return this.resolveInput(r, pin, scope);
		}
		const member = this.literalText(r, pin.id);
		if (member === "") {
			this.error(
				`"${pin.name || pin.id}" needs an Enum.${enumName} value, by name.`,
				r.node.id,
				pin.id,
			);
			return "nil";
		}
		return `Enum.${enumName}.${toIdentifier(member, "value")}`;
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
		config: {
			definition?: string; shape?: string; layout?: string;
			fields?: { name?: string; type?: string }[];
		},
		nodeId: string,
	): string {
		// Written out is pasted in as it stands, so an unclosed brace here breaks
		// the file somewhere after it. Said against the node, like Custom Code.
		if (config.shape === "written") {
			const text = (config.definition ?? "").trim();
			const problem = checkLuauBalance(text)[0];
			if (problem) {
				this.error(`${problem.message} (line ${problem.line} of this type's definition)`, nodeId);
				return "";
			}
			return text;
		}

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
		// One field to a line, the way Make Dictionary lays out one key to a
		// line: trailing comma on the last, leading tab relative to wherever the
		// declaration itself is indented.
		if (config.layout === "lines") return `{\n${parts.map((part) => `\t${part},`).join("\n")}\n}`;
		return `{ ${parts.join(", ")} }`;
	}

	private emitTypes(): void {
		const nodes = this.index.all().filter((r) => r.def.id === "type.declareTop");
		if (nodes.length === 0) return;

		let written = 0;
		for (const r of nodes) {
			const config = (r.node.config ?? {}) as {
				name?: string; definition?: string; export?: boolean;
				shape?: string; layout?: string; fields?: { name?: string; type?: string }[];
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
			const keyword = variable.const === true ? "const" : "local";
			this.push(`${keyword} ${ident}${annotation} = ${literalToLuau(variable.default)}`);
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

			// The parameters and everything the body declares belong to this
			// function, and are released with it -- so the next function may call
			// its own parameter `character` too. Closed by `pop` below.
			this.names.push();
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
			this.names.pop();
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

		if (!isModuleScript(this.script)) {
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
		// A node for the other target is an error, reported by `validate` for
		// every node rather than here, where only the execution chain passes.
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

	/**
	 * A Branch, and the `elseif` chain it may continue into.
	 *
	 * ## Why `elseif` is worth machinery
	 *
	 * A Branch wired into another Branch's False pin is how every node editor
	 * spells "otherwise, if". It used to come out as an `else` holding a nested
	 * `if`, which is the same program and a worse file: each link in the chain
	 * cost a level of indentation and an `end`, so five conditions ended in five
	 * closing keywords and a body pushed a third of the way across the page.
	 * That is the "extra indents" people report, and it is not a formatting bug
	 * -- it is the block structure being written out longhand.
	 *
	 * ## When the chain has to break
	 *
	 * `elseif <cond> then` has nowhere to put a statement. An `else` does: its
	 * block opens before the nested `if`. So the next condition is resolved with
	 * everything it emits **captured** rather than written, and the chain
	 * continues only when it emitted nothing. A condition that had to bind a
	 * local first falls back to `else` and the nested `if`, with the captured
	 * lines put back at the top of the block where they belong -- which is
	 * exactly the code this used to write every time.
	 *
	 * The condition is resolved in the arm's own scope either way, because that
	 * is where it is evaluated in both shapes.
	 */
	private emitBranch(r: ResolvedNode, scope: Scope, keyword: "if" | "elseif", condition?: string): void {
		const id = r.node.id;
		const cond = condition ?? this.resolveInput(r, this.pin(r, "condition", "in"), scope);
		this.push(`${keyword} ${cond} then`, id);
		this.indent++;
		const trueArm = new Scope(scope);
		// Whatever the condition proved holds here and only here.
		for (const [key, classes] of this.narrowingsOf(r, "condition")) {
			trueArm.narrowings.set(key, classes);
		}
		this.names.within(() => this.walk(this.index.execTarget(id, "true"), trueArm));
		this.indent--;

		const onFalse = this.index.execTarget(id, "false");
		const chained = this.chainedBranch(onFalse);
		if (chained) {
			const arm = new Scope(scope);
			// Resolved at the indentation the else block would be at, so lines
			// that do get captured are already sitting at the right depth.
			this.indent++;
			this.names.push();
			const captured = this.capture(() =>
				this.resolveInput(chained, this.pin(chained, "condition", "in"), arm),
			);
			this.indent--;

			this.execStack.add(chained.node.id);
			if (captured.lines.length === 0) {
				// Nothing was declared, so there is no block for it to belong to:
				// the chain carries on at this level and one `end` closes it all.
				this.names.pop();
				this.emitBranch(chained, arm, "elseif", captured.value);
			} else {
				this.push("else", id);
				this.indent++;
				for (const line of captured.lines) this.out.push(line);
				this.emitBranch(chained, arm, "if", captured.value);
				this.indent--;
				this.names.pop();
				this.push("end", id);
			}
			this.execStack.delete(chained.node.id);
			this.terminated = false;
			return;
		}

		if (onFalse) {
			const mark = this.out.length;
			this.push("else", id);
			this.indent++;
			this.names.within(() => this.walk(onFalse, new Scope(scope)));
			this.indent--;
			// A false arm that produces no statements -- a lone Script End, or a
			// chain of nodes that all compile to nothing -- would leave a bare
			// `else` before the `end`. Valid Luau, but nobody writes it, and the
			// generated file is meant to be read.
			if (this.out.length === mark + 1) this.out.length = mark;
		}
		this.push("end", id);
		this.terminated = false;
	}

	/**
	 * The Branch an `else` arm consists of, when that is all it consists of.
	 *
	 * Reroutes are stepped through, because a knot is a bend in the wire and
	 * emits nothing. A Branch already on the execution stack is refused: that is
	 * a loop, and `walk` is the thing that reports it.
	 */
	private chainedBranch(target: string | undefined): ResolvedNode | undefined {
		const seen = new Set<string>();
		let current = target;
		while (current !== undefined && !seen.has(current)) {
			seen.add(current);
			const r = this.index.get(current);
			const spec = r?.def.compilesTo;
			if (!r || spec?.kind !== "builtin") return undefined;
			if (spec.handler === "flow.rerouteExec") {
				current = this.index.execTarget(current, "then");
				continue;
			}
			if (spec.handler !== "flow.branch") return undefined;
			return this.execStack.has(r.node.id) ? undefined : r;
		}
		return undefined;
	}

	/**
	 * Runs `fn` with whatever it emits collected instead of written.
	 *
	 * The lines come back at the indentation they were produced at, so a caller
	 * that decides to keep them puts them back verbatim.
	 */
	private capture<T>(fn: () => T): { value: T; lines: OutLine[] } {
		const outer = this.out;
		this.out = [];
		try {
			return { value: fn(), lines: this.out };
		} finally {
			this.out = outer;
		}
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

			// A custom node's logic. See `runLogic`.
			case "logic.inputs":
				this.error("Node Inputs is where the logic starts, so nothing can run into it.", id);
				return undefined;

			case "logic.outputs": {
				for (const pin of r.baseInputs) {
					if (pin.kind !== "data") continue;
					this.push(`${logicOutputName(pin.id)} = ${this.resolveInput(r, pin, scope)}`, id);
				}
				return undefined;
			}

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

			case "lune.call": {
				const expression = this.luneCall(r, scope);
				if (this.index.consumerCount(id, "result") > 0) {
					const ident = this.names.unique(r.node.label || "result", "result");
					this.push(`local ${ident} = ${expression}`, id);
					scope.bindings.set(`${id}/result`, ident);
				} else {
					this.push(expression, id);
				}
				return this.index.execTarget(id, "then");
			}

			case "service.call": {
				const expression = this.serviceCall(r, scope);
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
				// As for a hoisted function: the parameters and the body's locals
				// are this function's, and go out of scope with its `end`.
				this.names.push();
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

				// A blank line either side, the same as a hoisted function gets. A
				// declaration is a change of subject, and two of them run together read
				// as one long block with an `end` somewhere in the middle of it.
				// `blank` will not double up, so a run of them gets one line each.
				this.blank();
				this.push(`${owner ? "" : "local "}function ${ident}(${params.join(", ")})${signature}`, id);
				this.indent++;
				this.walk(this.index.execTarget(id, "body"), body);
				this.indent--;
				this.names.pop();
				this.push("end", id);
				this.blank();
				this.terminated = false;
				return this.index.execTarget(id, "then");
			}

			case "type.declareHere": {
				const config = (r.node.config ?? {}) as {
					name?: string; export?: boolean; shape?: string; definition?: string; layout?: string;
					fields?: { name?: string; type?: string }[];
				};
				const name = (config.name ?? "").trim();
				const shape = typeShapeOf(r.def.id, config);

				let definition: string;
				if (shape === "typeof") {
					const value = this.resolveInput(r, this.pin(r, "value", "in"), scope);
					// The node writes `typeof(...)` itself, so a Type Of on the way in
					// makes `typeof(typeof(x))`. That is not a mistake Luau catches:
					// the inner call is an expression giving a string, so the type
					// quietly becomes `string`. Wiring one in is the obvious reading
					// of the native code this mirrors, so it is worth saying rather
					// than fixing silently.
					if (this.feederOf(id, "value")?.def.id === "value.typeof") {
						this.error(
							"Declare Type already takes the type of what you wire in, so the Type Of " +
							"node makes it the type of a string. Wire the value in directly.",
							id,
						);
						return this.index.execTarget(id, "then");
					}
					definition = `typeof(${value})`;
				} else {
					const before = this.diagnostics.length;
					definition = this.typeDefinition({ ...config, shape }, id);
					if (definition === "") {
						// A field with no type has already said what is wrong.
						if (this.diagnostics.length === before) {
							this.error("Declare Type needs a definition before it can be written.", id);
						}
						return this.index.execTarget(id, "then");
					}
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
				this.push(`${exported ? "export type" : "type"} ${name} = ${definition}`, id);
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
				// The type, when one was given, on the terms every other annotation
				// has: written when the mode line asks for annotations.
				const declared = ((r.node.config as { type?: string } | undefined)?.type ?? "").trim();
				let annotation = "";
				if (this.annotates && declared !== "" && declared !== "any") {
					const written = luauType(declared);
					if (written === "any") {
						this.error(
							`"${declared}" is not a type Roswaal can write. Check its brackets are closed.`,
							id,
						);
					} else {
						annotation = `: ${written}`;
					}
				}
				// `const` is Luau's, from 2026: the same binding, and reassigning it
				// is an error the language raises rather than one Roswaal has to.
				// Only the keyword changes; everything downstream reads a local.
				const keyword = isConstLocal(r.node.config) ? "const" : "local";
				this.push(`${keyword} ${ident}${annotation} = ${value}`, id);
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
				this.emitBranch(r, scope, "if");
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
				// The loop variable belongs to the body, so the next loop in the
				// same block may call its own counter `i` as well.
				this.names.push();
				const idx = this.names.unique(r.node.label || "i", "i");
				body.bindings.set(`${id}/index`, idx);
				const stepPart = step === "1" ? "" : `, ${step}`;
				this.push(`for ${idx} = ${first}, ${last}${stepPart} do`, id);
				this.indent++;
				this.walk(this.index.execTarget(id, "body"), body);
				this.indent--;
				this.names.pop();
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
				/**
				 * What the two loop variables are called.
				 *
				 * `key` and `value` are a placeholder, not a name: a loop over
				 * parts reads `for key, value in` and every line under it talks
				 * about `value`, which is the one word in the block that says
				 * nothing. Naming them is what a hand-written loop does first.
				 *
				 * Held to identifiers here rather than refused, because the field
				 * is typed into and a half-typed name should not fail a compile.
				 */
				const names = (r.node.config ?? {}) as { keyName?: string; valueName?: string };
				// Both belong to the body, for the same reason a numeric loop's
				// counter does.
				this.names.push();
				const k = this.names.unique(names.keyName?.trim() || (isArray ? "i" : "key"), "key");
				const v = this.names.unique(names.valueName?.trim() || "value", "value");
				body.bindings.set(`${id}/${keyPin}`, k);
				body.bindings.set(`${id}/value`, v);
				/**
				 * Luau takes an annotation on a `for` binding, so a typed loop
				 * variable is said where it is introduced rather than cast on the
				 * first line of the body.
				 *
				 * An array's index is not offered one: `ipairs` hands back a
				 * number and writing `i: number` is saying what the loop already
				 * said. On the terms every other annotation has -- written only
				 * when the mode line asks for them.
				 */
				const types = loopTypes(r.node.config ?? {});
				const bind = (ident: string, type: string | undefined) =>
					this.annotates && type ? `${ident}: ${luauType(type)}` : ident;
				const keyBinding = isArray ? k : bind(k, types.key);
				this.push(`for ${keyBinding}, ${bind(v, types.value)} in ${isArray ? "ipairs" : "pairs"}(${source}) do`, id);
				this.indent++;
				this.walk(this.index.execTarget(id, "body"), body);
				this.indent--;
				this.names.pop();
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
				this.names.within(() => this.walk(this.index.execTarget(id, "body"), new Scope(scope, true)));
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

				// The connection is a local in the *enclosing* block, so it is
				// named before the handler's own frame is opened.
				let prefix = "";
				if (this.index.consumerCount(id, "connection") > 0) {
					const ident = this.names.unique(r.node.label || "connection", "connection");
					scope.bindings.set(`${id}/connection`, ident);
					prefix = `local ${ident} = `;
				}

				// The handler is a function literal, so its parameters and its
				// locals are its own. Closed after the walk, below.
				this.names.push();
				const params = (sig.params ?? []).map((p, i) => {
					const ident = this.names.unique(p.name || `arg${i + 1}`, `arg${i + 1}`);
					body.bindings.set(`${id}/p${i}`, ident);
					return this.annotates ? `${ident}: ${luauType(p.type)}` : ident;
				});
				this.push(`${prefix}${signal}:${method}(function(${params.join(", ")})`, id);
				this.indent++;
				this.walk(this.index.execTarget(id, "body"), body);
				this.indent--;
				this.names.pop();
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
	/**
	 * Where a data input's value comes from, as a key two nodes can agree on.
	 *
	 * A wire is identified by the pin it leaves, so an Is A and a Cast reading
	 * the same For Each loop variable produce the same key. An unwired pin
	 * falls back to its own literal, so `Is A` on a typed-in path and a Cast on
	 * the same typed-in path also agree.
	 */
	private valueKey(r: ResolvedNode, pinId: string): string | undefined {
		const link = this.index.sourceOf(r.node.id, pinId);
		if (link) return `${link.from.node}/${link.from.pin}`;
		const text = this.literalText(r, pinId);
		return text === "" ? undefined : `literal:${text}`;
	}

	/**
	 * What a Branch's condition proves about the values it tests.
	 *
	 * Only Is A, and only the shapes whose meaning is unambiguous:
	 *
	 * - `x:IsA("BasePart")` — x is a BasePart.
	 * - `a and b` — everything both operands prove, because both hold.
	 * - `a or b` — only what *both* operands prove about the same value, as the
	 *   union of their classes. This is the `Decal` or `Texture` case: either
	 *   branch may be the one that fired, so the value is one of the two and
	 *   nothing narrower. A value only one side mentions is not narrowed at all.
	 *
	 * Anything else contributes nothing, which is the safe direction: a missed
	 * narrowing costs a redundant cast, and an invented one is a lie to the
	 * typechecker.
	 */
	private narrowingsOf(r: ResolvedNode, pinId: string): Map<string, Set<string>> {
		const feeder = this.feederOf(r.node.id, pinId);
		if (!feeder) return new Map();
		return this.narrowingsFrom(feeder);
	}

	/**
	 * Whether a Cast is claiming exactly what the enclosing arm already proved.
	 *
	 * Exactly, not merely compatibly. A narrowing of `Decal | Texture` and a
	 * Cast to `Decal` are different claims — the value might be the other one —
	 * and Roswaal has no subtype table to judge `BasePart` against `Instance`
	 * with. So the two sets of class names have to match, which is a rule that
	 * can be stated in one sentence on the documentation page and never
	 * surprises anybody by dropping a cast that was doing work.
	 */
	private alreadyNarrowed(src: ResolvedNode, scope: Scope): boolean {
		const key = this.valueKey(src, "value");
		if (!key) return false;
		const known = scope.narrowedTo(key);
		if (!known) return false;

		const claimed = this.literalText(src, "type")
			.split("|")
			.map((part) => part.trim())
			.filter((part) => part !== "");
		if (claimed.length === 0) return false;
		if (claimed.length !== known.size) return false;
		return claimed.every((part) => known.has(part));
	}

	private narrowingsFrom(node: ResolvedNode, depth = 0): Map<string, Set<string>> {
		const out = new Map<string, Set<string>>();
		if (depth > 8) return out;

		if (node.def.id === "instance.isA") {
			const key = this.valueKey(node, "instance");
			const className = this.literalText(node, "className");
			if (key && /^[A-Za-z_][A-Za-z0-9_]*$/.test(className)) out.set(key, new Set([className]));
			return out;
		}

		const operands = node.inputs
			.filter((p) => VARIADIC_PIN.test(p.id))
			.map((p) => this.feederOf(node.node.id, p.id))
			.filter((f): f is ResolvedNode => f !== undefined);

		if (node.def.id === "logic.and") {
			for (const operand of operands) {
				for (const [key, classes] of this.narrowingsFrom(operand, depth + 1)) {
					const existing = out.get(key);
					if (existing) for (const c of classes) existing.add(c);
					else out.set(key, new Set(classes));
				}
			}
			return out;
		}

		if (node.def.id === "logic.or") {
			// Every operand has to say something about a value for the branch to
			// know anything about it, so this starts from the first and keeps
			// only what survives the rest.
			if (operands.length === 0) return out;
			let shared = this.narrowingsFrom(operands[0], depth + 1);
			for (const operand of operands.slice(1)) {
				const next = this.narrowingsFrom(operand, depth + 1);
				const merged = new Map<string, Set<string>>();
				for (const [key, classes] of shared) {
					const other = next.get(key);
					if (!other) continue;
					merged.set(key, new Set([...classes, ...other]));
				}
				shared = merged;
			}
			return shared;
		}

		return out;
	}

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

			// Only Make Dictionary can read a pair, from inside `$pairs`. Reaching
			// here means something else was handed one.
			case "table.pair":
				this.error(
					"A Key Value Pair is one entry of a table, so it only goes into Make Dictionary.",
					src.node.id,
				);
				return "nil";

			/**
			 * The local a Declare Local bound, looked up in the reader's scope.
			 *
			 * The same lookup a wire from Declare Local's output gets, so the two
			 * cannot disagree about where a local exists: after its declaration,
			 * inside the block that made it and anything nested in that block —
			 * a branch, a loop, a function declared further down.
			 */
			/**
			 * A parameter of the function or handler this node sits inside.
			 *
			 * The same shape as Get Local, against a key three binders already
			 * write: `function.entry`, `function.declareHere` and `event.connect`
			 * each bind `${id}/p${i}` into the body's **own** scope before
			 * walking it. So "this node has to be inside the body" is not a rule
			 * implemented here — it is what the scope chain already means, and a
			 * node outside simply finds nothing and is told so.
			 *
			 * Looked up by name and resolved to an index, because the name is
			 * what the node stores: see `ParamRef`.
			 */
			case "function.getParam": {
				const ref = (src.node.config ?? {}) as ParamRef;
				const owner = ref.function ? this.index.get(ref.function) : undefined;
				if (!ref.function || !owner) {
					this.error(
						ref.function
							? "Get Parameter points at a function that is no longer in this graph."
							: "Get Parameter has no function chosen.",
						src.node.id,
					);
					return "nil";
				}

				const signature = (owner.node.config ?? {}) as Signature;
				const owning = signature.name || owner.node.label || "that function";
				const index = (signature.params ?? []).findIndex((p) => p.name === ref.param);
				if (index === -1) {
					this.error(
						`"${ref.param ?? "That parameter"}" is not a parameter of "${owning}".`,
						src.node.id,
					);
					return "nil";
				}

				const bound = scope.lookup(`${ref.function}/p${index}`);
				if (bound) return bound;
				this.error(
					`"${ref.param}" is a parameter of "${owning}", and this node is not inside its ` +
					"body. A parameter exists only where the function runs — wire this into " +
					"something on the function's Body, or use a variable for a value the whole " +
					"script reads.",
					src.node.id,
				);
				return "nil";
			}

			case "local.get": {
				const ref = (src.node.config ?? {}) as LocalRef;
				const declared = ref.local ? this.index.get(ref.local) : undefined;
				if (!ref.local || declared?.def.id !== "local.declare") {
					this.error(
						ref.local
							? "Get Local points at a Declare Local that is no longer in this graph."
							: "Get Local has no local chosen.",
						src.node.id,
					);
					return "nil";
				}
				const bound = scope.lookup(`${ref.local}/ref`);
				if (bound) return bound;
				this.error(
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
				this.requireClient(src, "Local Player");
				return `${this.resolveRoot("Players")}.LocalPlayer`;

			case "players.localCharacter":
				this.requireClient(src, "Local Character");
				return `${this.resolveRoot("Players")}.LocalPlayer.Character`;

			case "service.call":
				return this.serviceCall(src, scope);

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
				if (this.options.inline) return `game:GetService(${quoteString(name)})`;
				const existing = this.services.get(name);
				if (existing) return existing;
				const ident = this.names.uniqueForFile(name, "service");
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
				const specifier = this.literalText(src, "specifier").trim();
				if (specifier === "") {
					this.error("Require at Top has no module to require.", src.node.id, "specifier");
					return "nil";
				}

				const wrong = checkSpecifier(specifier, this.script.target, this.options.specifiers);
				if (wrong?.severity === "error") {
					this.error(wrong.message, src.node.id, "specifier");
				} else if (wrong) {
					this.warn(wrong.message, src.node.id, "specifier");
				}
				if (this.options.inline) return `require(${quoteString(specifier)})`;

				const key = `top:${specifier}`;
				const existing = this.requires.get(key);
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
				const chosen = this.literalText(src, "as").trim();
				const ident = chosen === ""
					? this.names.uniqueForFile(specifierName(specifier) || "module", "module")
					: toIdentifier(chosen);
				if (chosen !== "") {
					if (PROVIDED_GLOBALS.includes(ident)) {
						this.warn(
							`Require at Top binds "${ident}", which shadows something Luau provides. ` +
								"Everything below it in this file sees the module rather than the global.",
							src.node.id,
							"as",
						);
					}
					this.names.reserve(ident);
				}
				this.requires.set(key, { ident, expression: quoteString(specifier) });
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
				return this.luneCall(src, scope);

			case "module.get": {
				const id = String((src.node.config as { module?: string } | undefined)?.module ?? "");
				const ident = this.moduleIdents.get(id);
				if (ident) return ident;
				const name = String((src.node.config as { name?: string } | undefined)?.name ?? "");
				this.error(
					id === ""
						? "Get Module has no module chosen."
						: `"${name || "That module"}" is not declared by this script any more. ` +
							"Declare it in the Variables panel, or point this at one that is.",
					src.node.id,
				);
				return "nil";
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

				if (this.options.inline) return `require(${renderPath(this.resolveRoot(root), path)})`;
				// One local per distinct module, however many nodes require it.
				const key = `${root}/${path}`;
				const existing = this.requires.get(key);
				if (existing) return existing.ident;

				const hint = this.literalText(src, "as") || lastSegment(path) || "module";
				const ident = this.names.uniqueForFile(hint, "module");
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

		const cast = CAST_NODES.has(src.def.id) ? castModeOf(src.node.config) : undefined;
		// An implicit Cast standing inside the arm that already proved its
		// claim has nothing left to say, so it says nothing and hands the value
		// through. This is the line hand-written Luau does not write either.
		if (cast === "implicit" && src.def.id === "cast.as" && this.alreadyNarrowed(src, scope)) {
			return this.resolveInput(src, this.pin(src, "value", "in"), scope);
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
		// Concatenate writes the interpolated form when the node says so.
		let expr = src.def.id === "string.concat" && isInterpolated(src.node.config)
			? this.interpolated(src, scope)
			: this.renderTemplate(src, template, scope);
		this.execStack.delete(`pure:${nodeId}`);

		/**
		 * An operator pill asked to bracket what it works out.
		 *
		 * Only the pills, because only they are one operator wearing its symbol
		 * on its face -- and only they have the readable-either-way property that
		 * makes this a choice rather than a bug. Everywhere else the emitter
		 * brackets exactly what Luau's precedence requires and no more, which is
		 * what `parenAt` is for.
		 *
		 * Wrapping here rather than at the use site means the brackets travel
		 * with the value: read twice, bound to a local, spliced into a template,
		 * it is the same expression each time. And a wrapped expression is
		 * already an atom, so nothing downstream adds a second pair.
		 */
		if (src.def.display === "operator" && (src.node.config as { parens?: unknown } | undefined)?.parens === true) {
			expr = `(${expr})`;
		}

		/**
		 * What to call the local, when there is one.
		 *
		 * `resultName` first, exactly as the impure path reads it. A node that
		 * bound its result under a name you typed has to go on doing so now the
		 * binding happens here instead — otherwise making a node pure silently
		 * orphans the name already sitting in the file, and the local comes back
		 * as the pin's name with a number stuck on it.
		 */
		const named = (src.node.config as { resultName?: string } | undefined)?.resultName;

		/**
		 * One consumer: splice it in. More: bind it once, so a side-effecting or
		 * merely expensive expression is not worked out twice.
		 *
		 * **An access path is the exception**, and reading it again is not a
		 * concession — it is the more faithful answer. `restore.weld` read twice
		 * is what the hand-written module writes, hoisting it costs a line and a
		 * name that says nothing, and the local is a *snapshot*: a Set Index
		 * between the two reads would never reach it, so the graph would say
		 * "read this field here" and the file would not. See `isAccessPath` for
		 * how narrow the test is.
		 *
		 * A name you typed is the other exception, in the other direction.
		 * Naming the result is a request for the local, not a suggestion about
		 * what to call one if it happens to appear — and a field that does
		 * nothing until some second reader shows up is a field you have to
		 * experiment on to understand.
		 *
		 * A pure node's logic is one expression, with nowhere to put the local.
		 */
		if (this.options.expressionsOnly) return expr;
		// A cast that has been told which it is overrides the ordinary rule.
		// Implicit never takes a line; explicit always does, even for one reader.
		if (cast === "implicit") return expr;
		if (cast !== "explicit" && !named) {
			if (this.effectiveConsumers(nodeId, pinId) <= 1) return expr;
			if (isAccessPath(expr)) return expr;
		}

		const outPin = src.outputs.find((p) => p.id === pinId);
		const hint = named || src.node.label || outPin?.name || src.def.title;
		const ident = this.names.unique(hint, "value");
		this.push(`local ${ident} = ${expr}`, nodeId);
		scope.bindings.set(`${nodeId}/${pinId}`, ident);
		return ident;
	}

	/**
	 * Concatenate, written as Luau's interpolated string.
	 *
	 * `a .. " has no " .. name` and the interpolated form are the same string,
	 * and which reads better depends on the line: a join of two values is
	 * plainer as a join, and a sentence with three values in it is a sentence
	 * with holes in it. So it is a setting on the node, as a pill's brackets
	 * are, and the node carries the answer into everybody else's checkout.
	 *
	 * A part typed into the node is written as **text**, escaped where Luau's
	 * interpolation needs it; anything wired in is written as a hole. A plain
	 * string literal arriving down a wire is unwrapped, since a hole with a
	 * constant in it is a hole the reader has to look through.
	 */
	private interpolated(r: ResolvedNode, scope: Scope): string {
		const parts: string[] = [];
		for (const pin of r.inputs.filter((p) => VARIADIC_PIN.test(p.id))) {
			const wired = this.index.sourceOf(r.node.id, pin.id) !== undefined;
			const literal = r.node.literals?.[pin.id] ?? pin.default;
			if (!wired && literal && literal.t === "string") {
				parts.push(escapeInterpolated(literal.v));
				continue;
			}
			const value = this.resolveInput(r, pin, scope);
			const plain = PLAIN_STRING.exec(value);
			parts.push(plain ? escapeInterpolated(plain[1]) : `{${value}}`);
		}
		return `\`${parts.join("")}\``;
	}

	// -- templates ---------------------------------------------------------

	/**
	 * A pin a template reads more than once, worked out once.
	 *
	 * `x ~= x` is the NaN check, and its template names one pin twice — so
	 * without this, the value arrives twice: `roll() ~= roll()` calls `roll`
	 * two times and compares two different numbers, which is not the question
	 * the node asks. Fanning out to two *pins* already binds a local; this is
	 * the same rule for one pin read twice.
	 *
	 * An identifier or an access path is spliced as it is, for the reason
	 * `resolveOutput` gives: `restore.weld` read twice is what the hand-written
	 * module says, and a local for it is a snapshot rather than a shorthand.
	 * A literal is left alone too — nothing is saved by naming `0`.
	 *
	 * Nothing is bound in a logic graph, which is one expression with nowhere
	 * to put a local; there the value is worked out where it is read, as it was
	 * before this existed.
	 */
	private readOnce(r: ResolvedNode, template: string, scope: Scope): Map<string, string> {
		const out = new Map<string, string>();
		if (this.options.expressionsOnly) return out;

		const counts = new Map<string, number>();
		for (const match of template.matchAll(/\$in\.([A-Za-z_][A-Za-z0-9_]*)(?![.\w!])/g)) {
			counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
		}

		for (const [pinId, count] of counts) {
			if (count < 2) continue;
			const pin = r.inputs.find((one) => one.id === pinId);
			if (!pin) continue;
			const expr = this.resolveInput(r, pin, scope);
			// A name, a literal or a field read: repeating it costs nothing and
			// reads as the hand-written line would. A call is not on this list,
			// however atomic it looks -- calling it twice is the bug.
			if (REPEATABLE.test(expr) || isAccessPath(expr)) {
				out.set(pinId, expr);
				continue;
			}
			// Named after what fed it, as `resolveOutput` names its locals: the
			// pin is unnamed on a pill, and `a` would be a local called after
			// the operand slot rather than after the value in it.
			const src = this.feederOf(r.node.id, pinId);
			const hint = src?.node.label || pin.name || src?.def.title || pinId;
			const ident = this.names.unique(hint, "value");
			this.push(`local ${ident} = ${expr}`, r.node.id);
			out.set(pinId, ident);
		}
		return out;
	}

	private renderTemplate(r: ResolvedNode, template: string, scope: Scope): string {
		/**
		 * `$config.<key>` — a name the node carries rather than a pin it has.
		 *
		 * Get Member's member is the case: it is chosen from what the wired
		 * type declares, drawn on the pill's face, and is not a value anything
		 * can wire, so a pin for it would be a pin that only ever holds what
		 * the picker put there. Written out as an identifier, and a key that is
		 * missing or is not one leaves the template empty for the node's own
		 * validation to report.
		 */
		template = template.replace(
			/\$config\.([A-Za-z_][A-Za-z0-9_]*)/g,
			(_match, key: string) => {
				const value = (r.node.config as Record<string, unknown> | undefined)?.[key];
				const text = typeof value === "string" ? value.trim() : "";
				return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? text : "";
			},
		);

		// `$args(<separator>)` folds every variadic input pin into one list, so a
		// node whose arity is chosen per instance still compiles from a static
		// template. Each operand is parenthesised, because the separator is
		// usually an operator and precedence has to survive.
		template = template.replace(/\$args\(([^)]*)\)/g, (_match, separator: string) => {
			const args = r.inputs.filter((p) => VARIADIC_PIN.test(p.id));
			if (args.length === 0) return "";
			const needed = foldPrecedence(separator);
			return args
				.map((p, i) => parenAt(this.resolveInput(r, p, scope), i === 0 ? needed.first : needed.rest))
				.join(separator);
		});

		// `$more(<sep>)` is `$args` with a leading separator when there is anything
		// to separate. It is what lets `Fire(player, a, b)` and `Fire(player)` come
		// from one template instead of forcing a payload nobody asked for.
		template = template.replace(/\$more\(([^)]*)\)/g, (_match, separator: string) => {
			const args = r.inputs.filter((p) => VARIADIC_PIN.test(p.id));
			if (args.length === 0) return "";
			const needed = foldPrecedence(separator);
			return separator + args
				.map((p, i) => parenAt(this.resolveInput(r, p, scope), i === 0 ? needed.first : needed.rest))
				.join(separator);
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
		 * `$pairs(<sep>)` folds `p0`, `p1`, … into `[key] = value`.
		 *
		 * Each row is one pair pin, in one of two states. Split, it is a Key and
		 * a Value read from its parts. Whole, it takes a Key Value Pair, which
		 * brings its own key — and is read here, where there is a table for the
		 * entry to belong to, rather than as an expression it cannot be.
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
			// The rows as the node declares them, before splitting — a split row
			// is two part pins and would otherwise be counted twice or not at all.
			for (const pin of r.baseInputs) {
				const match = /^p(\d+)$/.exec(pin.id);
				if (!match) continue;

				let key: string;
				let entry: string;

				const split = this.splitOf(r, pin.id, "in");
				if (split) {
					/**
					 * Read the parts directly rather than resolving the row.
					 *
					 * Resolving it would send a split input to `buildSplitInput`,
					 * which rebuilds a value from `make` — and a pair is syntax
					 * rather than a value, so there is nothing to rebuild it into.
					 * Here there is a table for the entry to belong to, which is
					 * the only place a key and a value mean anything together.
					 */
					const keyPin = r.inputs.find((p) => p.id === partPinId(pin.id, "key"));
					const valuePin = r.inputs.find((p) => p.id === partPinId(pin.id, "value"));
					if (!keyPin || !valuePin) continue;
					key = this.resolveInput(r, keyPin, scope);
					entry = this.resolveInput(r, valuePin, scope);
				} else {
					// Whole: the row takes a Key Value Pair, which brings its own
					// key. An empty row is left out rather than reported — growing
					// the node gives you one, and a row you have not filled in yet
					// should not be a table entry.
					const from = this.feederOf(r.node.id, pin.id);
					if (from?.def.id !== "table.pair") continue;
					key = this.resolveInput(from, this.pin(from, "key", "in"), scope);
					entry = this.resolveInput(from, this.pin(from, "value", "in"), scope);
				}

				if (key === '""' || key === "nil") continue;
				const plain = this.bracketsOnly(r) ? null : plainKey(key);
				entries.push(`${plain ?? `[${key}]`} = ${entry}`);
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

		// Worked out before anything is spliced, so a value read twice is read
		// once and the local it binds sits above the line that uses it.
		const once = this.readOnce(r, template, scope);

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

			// Read twice by this template: the same text both times, and a local
			// above it where the value could not be repeated safely.
			const shared = modifier === undefined ? once.get(pinId) : undefined;
			if (shared !== undefined) {
				return parenAt(shared, templatePrecedence(template, offset, offset + match.length));
			}

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
			// next to an operator, and only as far as that position needs.
			// Wrapping every argument would be correct but would make print((x))
			// of everything.
			return parenAt(expr, templatePrecedence(template, offset, offset + match.length));
		});
	}
}

/**
 * An expression a template may splice twice: a name, a number, a string, or
 * one of Luau's three keyword values. Anything with a call, an operator or a
 * constructor in it is worked out once and bound. See `readOnce`.
 */
const REPEATABLE = /^(?:[A-Za-z_][A-Za-z0-9_]*|-?\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"|nil|true|false)$/;

/** A double-quoted literal with nothing in it that interpolation would mind. */
const PLAIN_STRING = /^"([^"`{}\\\n]*)"$/;

/**
 * Text inside an interpolated string.
 *
 * Luau reads a backtick as the end of one and a brace as the start of a hole,
 * so both are escaped; a backslash escapes itself, and a line break is written
 * as an escape rather than folded into the source.
 */
function escapeInterpolated(text: string): string {
	return text
		.replace(/\\/g, "\\\\")
		.replace(/`/g, "\\`")
		.replace(/\{/g, "\\{")
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r");
}

/** Whether this Concatenate writes an interpolated string rather than a join. */
export function isInterpolated(config: NodeConfig | undefined): boolean {
	return (config as { interpolate?: unknown } | undefined)?.interpolate === true;
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
