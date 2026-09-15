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
/**
 * Hand-written Luau, as a pin type of its own.
 *
 * A code pin used to be typed `string`, which was true of the storage and
 * useless as a description: the reference read "Code : string" with a yellow
 * warning badge beside it, as though an ordinary string pin had gone wrong.
 * It had not — it is a different kind of pin, and saying so as a type is
 * clearer than saying so as a warning.
 *
 * Only the two escape hatches use it, so `luau` on a pin is also the signal
 * that this is a place hand-written code enters the graph.
 */
export const LUAU: DataType = "luau";
/**
 * One entry of a table: a key and its value, travelling as one wire.
 *
 * Not a value Luau has — `{ walkSpeed = 16 }` is syntax, not a thing you can
 * hold — so a pair goes only into a pin that takes entries, and `any` does not.
 * See `PinDef.pairs`.
 */
export const PAIR: DataType = "pair";

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
	 * Data inputs only: the underlying call takes this argument or nothing.
	 *
	 * The difference from a pin with a `default` is what reaches the generated
	 * Luau. A default is a *value* — leave the pin alone and that value is
	 * emitted. An optional pin left alone emits **nothing at all**, and the
	 * argument is dropped from the call.
	 *
	 * That distinction is not cosmetic. Plenty of Roblox constructors reject an
	 * explicit `nil` where they are perfectly happy with a missing argument, so
	 * "pass the default" and "do not pass it" are genuinely different calls and
	 * only one of them works. It also means a node stops having to invent a
	 * default it has no business choosing: `TweenInfo.new` decides what its own
	 * repeat count is, and Roswaal guessing `0` on its behalf is a guess that
	 * silently becomes wrong the day the engine changes its mind.
	 *
	 * Only meaningful inside a `$opt(<sep>)` group in the template, which is
	 * what knows where the argument list ends. An optional pin outside one is a
	 * pin whose emptiness nothing acts on.
	 */
	optional?: boolean;
	/**
	 * Data inputs only: also takes a Key Value Pair, whose key then names the
	 * entry. Make Dictionary's value pins set it, and nothing else does, because
	 * a pair means nothing outside a table constructor.
	 */
	pairs?: boolean;
	/**
	 * Data inputs only: offer these values as a dropdown instead of a free text
	 * field. Suggestions, not a closed set — anything not listed can still be
	 * typed, so a value the list has not caught up with is never a dead end.
	 */
	options?: string[];
	description?: string;
	/**
	 * This pin accepts hand-written Luau, and opens a code editor for it.
	 *
	 * **A `raw` default does not imply this, and must not.** Plenty of ordinary
	 * pins default to a raw constant simply because their type has no literal
	 * form — a `Vector3` input defaults to `Vector3.zero` because `nil` would be
	 * wrong. If that alone opened a code editor, every vector pin in the library
	 * would be a place to hide arbitrary code inside a node that looks like a
	 * constructor, and a reviewer scanning a shared graph for Custom Code nodes
	 * would never find it.
	 *
	 * So this is opt-in, and only the two deliberate escape hatches set it:
	 * Custom Code and Luau Expression. Their node titles say what they are.
	 * Everywhere else a raw default is displayed and not editable — author the
	 * value by wiring a node, or by splitting the pin.
	 */
	code?: boolean;
	/**
	 * Set only on a pin produced by splitting a struct pin, never declared by a
	 * `NodeDef`. Says which pin this is a component of, so the emitter can put
	 * the value back together and the canvas can draw it as a child row.
	 *
	 * The pin's own id is `parent.id` — see `partPinId` in `structs.ts`.
	 */
	part?: { parent: string; mode: string; id: string };
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

/**
 * The category holding every Roblox datatype, one subcategory per type.
 *
 * Here rather than beside the category ordering in `nodes/index.ts` because
 * the library needs it too, and the library is what `nodes/index.ts` imports —
 * putting it there makes a cycle whose failure mode is a module-initialisation
 * error rather than a compile one. `schema.ts` imports nothing, so nothing can
 * cycle through it.
 */
export const ENGINE_TYPES = "Engine Types";

/** Drives node colour and the "this can start or end a flow" rule. */
export type NodeRole = "entry" | "terminal" | "flow" | "normal";

export interface NodeDef {
	/** Namespaced, e.g. "flow.branch", "math.add", "mypack.spawnEnemy". */
	id: string;
	title: string;
	category: string;
	/**
	 * A second level of grouping inside a category.
	 *
	 * Exists for one shape in particular: **Engine types**, where the category
	 * is "every Roblox datatype" and the useful grouping is per type. Twelve
	 * Vector3 nodes and eleven Color3 nodes in one flat list is a list you scan
	 * rather than a place you look.
	 *
	 * Optional, and most nodes do not set it. A category with no subcategories
	 * behaves exactly as it did before this existed — which is why adding it
	 * moved no node anybody had already placed.
	 *
	 * It is also what a node is **coloured** by when present, so Vector3 and
	 * CFrame nodes stay the two different colours they were when those were
	 * separate categories. Grouping them together should not make them look
	 * like the same thing.
	 */
	subcategory?: string;
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
	 * The name this instance already has, used as its label when nobody has
	 * typed one.
	 *
	 * Some nodes are named twice. A Function node has a **function name**, which
	 * is what it is called in the generated Luau and what everything else in the
	 * graph refers to — and it also has a label, which is what the header shows.
	 * Leaving those independent meant naming a function `greet` and still
	 * reading "Function" on the canvas, so a graph with four functions in it
	 * showed four nodes with the same title and the answer only in the
	 * inspector.
	 *
	 * So the name wins by default, and an explicit label still overrides it —
	 * see `nodeTitle`. Only set this where the config genuinely names the node.
	 * A Set Variable node is *about* a variable rather than named after one, and
	 * showing "Accumulator" where "Set Variable" was would lose the verb; that
	 * belongs in `subtitle`, which is where it already is.
	 */
	/**
	 * The node itself is passed as well, because not everything that names a
	 * node lives in its config. A Declare Local's name is a literal on its Name
	 * pin -- typed on the node face, where you would expect to type a name --
	 * and a header that could not read it was a header that could not say which
	 * local this is.
	 */
	defaultLabel?: (
		config: NodeConfig,
		node?: Pick<GraphNode, "literals" | "label">,
	) => string | undefined;
	/**
	 * How the node is drawn. "compact" is the small capsule node editors use for
	 * a variable getter: no header bar, no title row, one output on the right.
	 * It suits a node whose whole meaning is its name, and only those — anything
	 * with inputs needs rows to put them in.
	 */
	display?: "normal" | "compact" | "reroute" | "operator";
	/**
	 * The operator an `operator` pill shows in its middle — `==`, `and`, `nil`.
	 *
	 * Luau's own spelling rather than a word or a glyph: `~=` is what the
	 * generated file will say, and a graph is easier to read against its output
	 * when the two agree. Ignored by every other display.
	 */
	operator?: string;
	/**
	 * The node takes a variable number of inputs, numbered a0, a1, ... The count
	 * lives in the node's own config, so two Add nodes in one graph can have
	 * different arity. Templates fold them with `$args(<separator>)`.
	 */
	variadic?: { min: number; max: number; type?: DataType; default?: Literal };
}

// ---------------------------------------------------------------------------
// Graph documents
// ---------------------------------------------------------------------------

export type Target = "roblox" | "lune";

export type ScriptClass = "Script" | "LocalScript" | "ModuleScript";
export type RunContext = "Server" | "Client" | "Legacy";

/**
 * Which Luau typechecking mode the generated file declares.
 *
 * `default` writes no mode line at all, leaving the file to whatever the
 * enclosing project says — which in Roblox means nonstrict. The other two write
 * `--!nonstrict` or `--!strict` on the first line.
 *
 * The mode also decides whether generated locals and function parameters carry
 * **type annotations**. Without them `--!nonstrict` would be almost
 * indistinguishable from `default` on Roblox, where nonstrict is already the
 * default; with them it is the gradual middle ground Luau intends — the types
 * are written down and checked loosely.
 */
export type TypecheckMode = "default" | "nonstrict" | "strict";

export const TYPECHECK_MODES: readonly TypecheckMode[] = ["default", "nonstrict", "strict"];

/**
 * Free-form per-node configuration (function signature, exports list, ...).
 *
 * One key is understood by the registry rather than by any one node:
 * `split` is a `SplitMap` — `{ "in:position": "xyz" }` — recording which struct
 * pins this instance has broken into components, and in which mode. It is
 * per-instance because two Vector nodes in one graph may want different
 * answers. See `structs.ts`.
 */
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
	/**
	 * The function whose graph this node is drawn in, by the declaration's id.
	 * Absent for the nodescript's own graph. Layout only: what compiles is still
	 * decided by the wires. See `functionGraph.ts`.
	 */
	graph?: string;
	/**
	 * Where a Declare Function sits in the graph it opens, as its entry node.
	 * `x` and `y` are where it sits in the flow it is declared in.
	 */
	inner?: { x: number; y: number };
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
	/** The function graph it is drawn in, as for `GraphNode.graph`. */
	graph?: string;
}

/**
 * A named value belonging to the whole graph, in the sense visual-scripting
 * tools mean it: declared once in a list, then read and written by Get and Set
 * nodes anywhere in the script. Distinct from a local declared mid-flow, which
 * only exists inside the block that declared it.
 */
export interface ScriptVariable {
	id: string;
	name: string;
	type: DataType;
	/** Initial value. Every variable has one so the local is never left nil by accident. */
	default: Literal;
	description?: string;
	/**
	 * Declared with Luau's `const` rather than `local`: the name cannot be
	 * reassigned once the file has started.
	 *
	 * Per variable, and off unless somebody says so — a variable that nothing
	 * happens to assign is not the same as one you are promising never to. Set
	 * Variable on a constant is refused before the file is written, and an
	 * Initialize Variable node cannot declare one, since a constant is
	 * initialised where it is declared and nowhere else.
	 */
	const?: boolean;
}

export interface NodeScript {
	schemaVersion: number;
	kind: "script";
	id: string;
	name: string;
	scriptClass: ScriptClass;
	runContext?: RunContext;
	target: Target;
	typecheck: TypecheckMode;
	variables: ScriptVariable[];
	nodes: GraphNode[];
	links: Link[];
	comments: Comment[];
}

/**
 * Whether a graph compiles to a module that returns its exports.
 *
 * Lune has no script classes: every file is `.luau`, and a file is a module
 * when it has something to return. So on Lune a Module Exports node is what
 * decides, and `scriptClass` is not read at all.
 */
export function isModuleScript(script: Pick<NodeScript, "target" | "scriptClass" | "nodes">): boolean {
	if (script.target === "lune") return script.nodes.some((n) => n.def === "module.exports");
	return script.scriptClass === "ModuleScript";
}

export function emptyScript(name: string, id: string): NodeScript {
	return {
		schemaVersion: SCHEMA_VERSION,
		kind: "script",
		id,
		name,
		scriptClass: "Script",
		target: "roblox",
		typecheck: "strict",
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
	/**
	 * What one level of indentation is in generated Luau.
	 *
	 * In `roswaal.json` rather than in a developer's own preferences, because
	 * the generated files are committed: two people compiling the same graph
	 * with different answers would hand each other a whole-file diff.
	 *
	 * Passed to stylua as well when formatting is on, so the setting decides
	 * rather than losing to whatever `stylua.toml` happens to say.
	 */
	indentStyle: IndentStyle;
	/** How many spaces one level is, when `indentStyle` is `"space"`. */
	indentWidth: number;
	/**
	 * Write each comment's header into the generated Luau, above the code of the
	 * nodes it is drawn around.
	 *
	 * On by default, and that is a position rather than a shrug. A comment on a
	 * graph is written to be read by whoever reads the graph *or the file*, and
	 * a visual language that drops it at the compiler's door makes you write the
	 * same explanation twice. The generated file is committed here and is meant
	 * to be read beside hand-written Luau, which settles it.
	 *
	 * Off is for anyone coming from a tool where comments never leave the
	 * canvas, which is most of them -- Blueprints and Bolt both keep theirs
	 * entirely in the editor.
	 */
	comments: boolean;
	/** Rojo project file, used to resolve the tree view. */
	rojoProject?: string;
}

export type IndentStyle = "tab" | "space";

/** The widths offered for space indentation. Free of a text field on purpose. */
export const INDENT_WIDTHS: readonly number[] = [2, 3, 4, 8];

/**
 * One level of indentation, as the text the emitter repeats.
 *
 * Tolerant of a config written by hand: an unknown style is a tab, and a width
 * outside the offered range is clamped rather than refused, because a file
 * somebody typed into should not stop a graph compiling.
 */
export function indentUnit(config: Pick<RoswaalConfig, "indentStyle" | "indentWidth">): string {
	if (config.indentStyle !== "space") return "\t";
	const width = Math.round(Number(config.indentWidth));
	if (!Number.isFinite(width)) return "    ";
	return " ".repeat(Math.min(8, Math.max(1, width)));
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
		indentStyle: "tab",
		indentWidth: 4,
		comments: true,
		rojoProject: "default.project.json",
	};
}
