/**
 * Graph -> Luau: the compiler's way into the emitter.
 *
 * `emit` writes a script's generated file and `emitLogic` a custom node's
 * logic, with the types both hand back. What does the writing is `emitter.ts`
 * and the modules beside it; nothing here holds state.
 */

import type { SpecifierContext } from "../modules.js";
import type { Registry } from "../nodes/index.js";
import type { NodeScript } from "../schema.js";
import { Emitter } from "./emitter.js";

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

/** Writes a script's generated file: header, declarations, flow and return. */
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
	/** See `castsByHierarchy` in the project config. Default off. */
	castsByHierarchy?: boolean;
}

/** What a node's logic compiles to, before the placeholders are put back. */
export interface LogicEmit {
	/** An impure node's body, one statement to a line. */
	body: string;
	/** A pure node's expression per output pin. */
	expressions: Record<string, string>;
	diagnostics: Diagnostic[];
}

/** The two ends of a node's logic graph, and the pins between them. */
export interface LogicEnds {
	inputsId: string;
	outputsId: string;
	pure: boolean;
	inputs: string[];
	outputs: string[];
}

/**
 * Emits a node's logic graph: from its Node Inputs to its Node Outputs.
 *
 * See `compileLogic` in `logic.ts`, which is the only caller and the place the
 * rules about what a logic graph may hold are kept.
 */
export function emitLogic(
	script: NodeScript,
	registry: Registry,
	shape: LogicEnds,
): LogicEmit {
	return new Emitter(script, registry, "", { inline: true, expressionsOnly: shape.pure }).runLogic(shape);
}

export { hashString } from "./hash.js";
export { logicInputName, logicOutputName } from "./emitScope.js";
