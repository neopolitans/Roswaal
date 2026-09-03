/**
 * Roswaal core schema.
 *
 * Everything in this file is pure data. It is shared verbatim between the
 * compiler (Node) and the editor (browser), so it must not import anything
 * platform-specific.
 */

export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------------

/**
 * Data types are plain strings so that custom node packs can introduce their
 * own without patching Roswaal. `any` accepts and is accepted by everything;
 * `wildcard` additionally propagates (a wildcard pin adopts the type of
 * whatever it is first connected to).
 */
export type DataType = string;

export const ANY: DataType = "any";
export const WILDCARD: DataType = "wildcard";

export type PinKind = "exec" | "data";

export interface PinDef {
	/** Stable within the node. Referenced from templates as `$in.<id>`. */
	id: string;
	name: string;
	kind: PinKind;
	/** Data pins only. */
	type?: DataType;
	/** Data inputs only: value used when the pin is left unconnected. */
	default?: Literal;
	/** Data inputs only: suppress the inline literal editor (must be wired). */
	required?: boolean;
	/**
	 * Data inputs only: offer these values as a dropdown instead of a free text
	 * field. Suggestions, not a closed set — anything not listed can still be
	 * typed, so a value the list has not caught up with is never a dead end.
	 */
	options?: string[];
	description?: string;
}

// ---------------------------------------------------------------------------
// Literals
//
// A literal is the value typed directly into an unconnected data input. It is
// deliberately narrow: anything richer belongs upstream as a node.
// ---------------------------------------------------------------------------

export type Literal =
	| { t: "nil" }
	| { t: "boolean"; v: boolean }
	| { t: "number"; v: number }
	| { t: "string"; v: string }
	/** Verbatim Luau. The escape hatch; never quoted or sanitised. */
	| { t: "raw"; v: string };

// ---------------------------------------------------------------------------
// Node definitions
// ---------------------------------------------------------------------------

/**
 * How a node turns into Luau.
 *
 * `expr` and `statement` are declarative templates and are the only forms a
 * custom node may use — they are data, so loading a node pack never executes
 * third-party code. `builtin` is reserved for control flow that has to open
 * blocks (branch, loops, function bodies) and is implemented inside the
 * emitter.
 *
 * Template placeholders:
 *   $in.<pin>          expression for that input (wired source, or its literal)
 *   $in.<pin>!ident    unconnected literal, sanitised to a Luau identifier
 *   $in.<pin>!raw      unconnected literal, inserted verbatim
 *   $out.<pin>         the local this output was bound to
 */
export type CompileSpec =
	/** Pure: no exec pins, no side effects. One Luau expression per output. */
	| { kind: "expr"; outputs: Record<string, string> }
	/** Impure, produces exactly one value: emits `local <tmp> = <template>`. */
	| { kind: "call"; template: string; result: string }
	/** Impure statements. Data outputs are pre-declared as locals. */
	| { kind: "statement"; template: string }
	/** Control flow implemented by the emitter. */
	| { kind: "builtin"; handler: string };

/** Drives node colour and the "this can start or end a flow" rule. */
export type NodeRole = "entry" | "terminal" | "flow" | "normal";

export interface NodeDef {
	/** Namespaced, e.g. "flow.branch", "math.add", "mypack.spawnEnemy". */
	id: string;
	title: string;
	category: string;
	summary?: string;
	role?: NodeRole;
	/** No exec pins. Pure nodes are inlined at their use site when possible. */
	pure?: boolean;
	/** Yields (task.wait, WaitForChild, :Await). Never inlined. */
	latent?: boolean;
	/** Only meaningful for these targets. Omitted means "both". */
	targets?: Target[];
	inputs: PinDef[];
	outputs: PinDef[];
	compilesTo: CompileSpec;
	/**
	 * Builtins whose pins depend on per-instance config (function signatures,
	 * module exports) derive them here. Data-only custom nodes never set this.
	 */
	derivePins?: (config: NodeConfig) => { inputs: PinDef[]; outputs: PinDef[] };
	/**
	 * Second header line, smaller, under the title. For nodes whose identity is
	 * not the whole story — a function's signature, a variable's type — this is
	 * the difference between reading the graph and hunting through an inspector.
	 */
	subtitle?: (config: NodeConfig) => string | undefined;
	/**
	 * How the node is drawn. "compact" is the small capsule Unreal uses for a
	 * variable getter: no header bar, no title row, one output on the right. It
	 * suits a node whose whole meaning is its name, and only those — anything
	 * with inputs needs rows to put them in.
	 */
	display?: "normal" | "compact";
}

// ---------------------------------------------------------------------------
// Graph documents
// ---------------------------------------------------------------------------

export type Target = "roblox" | "lune";

export type ScriptClass = "Script" | "LocalScript" | "ModuleScript";
export type RunContext = "Server" | "Client" | "Legacy";

/** Free-form per-node configuration (function signature, exports list, ...). */
export type NodeConfig = Record<string, unknown>;

export interface GraphNode {
	id: string;
	/** NodeDef id. */
	def: string;
	x: number;
	y: number;
	/** Literal values for unconnected data inputs, keyed by pin id. */
	literals?: Record<string, Literal>;
	config?: NodeConfig;
	/** Optional per-instance title override. */
	label?: string;
}

export interface PinRef {
	node: string;
	pin: string;
}

export interface Link {
	id: string;
	/** Output side. */
	from: PinRef;
	/** Input side. */
	to: PinRef;
}

export interface Comment {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
	text: string;
	/** Hex, without the leading hash. */
	color?: string;
}

/**
 * A named value belonging to the whole graph, in the sense Unreal's Blueprints
 * mean it: declared once in a list, then read and written by Get and Set nodes
 * anywhere in the script. Distinct from a local declared mid-flow, which only
 * exists inside the block that declared it.
 */
export interface ScriptVariable {
	id: string;
	name: string;
	type: DataType;
	/** Initial value. Every variable has one so the local is never left nil by accident. */
	default: Literal;
	description?: string;
}

export interface NodeScript {
	schemaVersion: number;
	kind: "script";
	id: string;
	name: string;
	scriptClass: ScriptClass;
	runContext?: RunContext;
	target: Target;
	strict: boolean;
	variables: ScriptVariable[];
	nodes: GraphNode[];
	links: Link[];
	comments: Comment[];
}

export function emptyScript(name: string, id: string): NodeScript {
	return {
		schemaVersion: SCHEMA_VERSION,
		kind: "script",
		id,
		name,
		scriptClass: "Script",
		target: "roblox",
		strict: true,
		variables: [],
		nodes: [],
		links: [],
		comments: [],
	};
}

// ---------------------------------------------------------------------------
// Project configuration (roswaal.json)
// ---------------------------------------------------------------------------

export interface RoswaalConfig {
	schemaVersion: number;
	target: Target;
	/** Where .nodescript files live, relative to the project root. */
	sourceDir: string;
	/** Where compiled .luau is written, relative to the project root. */
	outDir: string;
	compileMode: "manual" | "hot";
	/** Extra directories scanned for .nodedef.json custom node packs. */
	nodePaths: string[];
	/** Run stylua over generated files when it is available on PATH. */
	format: boolean;
	/** Rojo project file, used to resolve the tree view. */
	rojoProject?: string;
}

export function defaultConfig(): RoswaalConfig {
	return {
		schemaVersion: SCHEMA_VERSION,
		target: "roblox",
		sourceDir: ".roswaal/scripts",
		outDir: "src",
		compileMode: "manual",
		nodePaths: [".roswaal/nodes"],
		format: true,
		rojoProject: "default.project.json",
	};
}
