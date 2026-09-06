/**
 * The node reference, derived from the registry.
 *
 * Every page in the node reference is generated from the same `NodeDef` the
 * editor and the compiler use. Epic generate their Blueprint node reference the
 * same way and for the same reason: a hand-written reference to 124 nodes is
 * wrong within a month, and wrong in the places nobody re-reads.
 *
 * Two things follow from living in `src/core` rather than in a build script.
 *
 * It runs in the browser, so the in-app help documents **the project's own
 * custom node packs** alongside the built-ins — a pack author gets a reference
 * page for free, from the same JSON the editor loads.
 *
 * And the examples are produced by running the real compiler, so a page cannot
 * claim output the emitter would not produce. Where a node cannot be shown
 * honestly in isolation, the example is omitted and the reason recorded, which
 * is the whole discipline: no example beats a wrong one.
 */

import { compile } from "../compiler/index.js";
import { literalToLuau } from "../compiler/luau.js";
import type { NodeDef, NodeScript, PinDef } from "../schema.js";
import { emptyScript } from "../schema.js";
import type { Registry } from "../nodes/index.js";
import { literalOnlyPins, resolveNodePins } from "../nodes/index.js";
import { STRUCTS, type StructRegistry } from "../structs.js";
import { CURATED, EXAMPLE_NOTES } from "./examples.js";

export interface PinDoc {
	id: string;
	name: string;
	kind: "exec" | "data";
	type?: string;
	/** The pin's default, rendered as the Luau it compiles to. */
	default?: string;
	/** Must be wired: no literal editor is offered. */
	required: boolean;
	/** Suggested values, where the pin offers a dropdown. */
	options?: string[];
	description?: string;
	/** This pin's text is pasted into the source; it cannot be wired. */
	literalOnly: boolean;
	/** Decompositions this pin can be split into, by name. */
	splitModes: string[];
}

export type ExampleOmission =
	| "opens-a-block"
	| "needs-configuring"
	| "needs-wiring"
	| "did-not-compile";

export interface NodeDoc {
	id: string;
	title: string;
	category: string;
	summary?: string;
	/** "expr" | "call" | "statement" | "builtin". */
	compiles: string;
	pure: boolean;
	latent: boolean;
	/** Begins or ends a flow, drawn red in the editor. */
	role?: string;
	/** Omitted means both targets. */
	targets?: string[];
	variadic?: { min: number; max: number };
	inputs: PinDoc[];
	outputs: PinDoc[];
	/** True when this node came from a pack rather than the built-in library. */
	custom: boolean;
	/** The Luau a minimal graph using this node compiles to. */
	example?: string;
	/** A note that belongs with the example rather than with the node. */
	exampleNote?: string;
	/** Why there is no example, when there is not one. */
	exampleOmitted?: ExampleOmission;
}

// ---------------------------------------------------------------------------

export function documentPin(
	def: NodeDef, pin: PinDef, side: "in" | "out", structs: StructRegistry = STRUCTS,
): PinDoc {
	const struct = pin.kind === "data" ? structs.get(pin.type ?? "") : undefined;
	return {
		id: pin.id,
		name: pin.name,
		kind: pin.kind,
		type: pin.type,
		default: pin.default ? literalToLuau(pin.default) : undefined,
		// Only an input can be "required": an output is a value the node hands
		// back, so it has neither a default to fall back on nor a wire to demand.
		required:
			side === "in" && pin.kind === "data" && (pin.required === true || pin.default === undefined),
		options: pin.options,
		description: pin.description,
		literalOnly: literalOnlyPins(def).has(pin.id),
		splitModes: struct ? Object.values(struct.modes).map((m) => m.name) : [],
	};
}

export function documentNode(
	def: NodeDef, registry: Registry, builtinIds: ReadonlySet<string>,
): NodeDoc {
	const { inputs, outputs } = resolveNodePins(def, undefined);
	const example = exampleFor(def, registry);

	return {
		id: def.id,
		title: def.title,
		category: def.category,
		summary: def.summary,
		compiles: def.compilesTo.kind,
		pure: def.pure === true,
		latent: def.latent === true,
		role: def.role,
		targets: def.targets ? [...def.targets] : undefined,
		variadic: def.variadic ? { min: def.variadic.min, max: def.variadic.max } : undefined,
		inputs: inputs.map((p) => documentPin(def, p, "in")),
		outputs: outputs.map((p) => documentPin(def, p, "out")),
		custom: !builtinIds.has(def.id),
		example: example.luau,
		exampleNote: example.note,
		exampleOmitted: example.omitted,
	};
}

/** Every node in a registry, in the order the palette lists them. */
export function documentRegistry(
	registry: Registry, builtinIds: ReadonlySet<string>,
): NodeDoc[] {
	return [...registry.values()]
		.map((def) => documentNode(def, registry, builtinIds))
		.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------------------
// Examples
// ---------------------------------------------------------------------------

/**
 * The Luau a minimal graph using this node compiles to.
 *
 * A pure node is wired into a Print, so the reader sees the expression in a
 * place it could actually appear. An impure one is hung off Script Start. Both
 * shapes are the smallest graph that makes the node's own output visible
 * without inventing context around it.
 *
 * Anything that cannot be shown this way returns a reason instead. Control flow
 * that opens a block needs a body to be worth reading; a node whose pins come
 * from its configuration has no pins until it is configured; a node with a pin
 * that must be wired has nothing to wire it to here. Each of those would
 * produce an example that is technically emitted and actually misleading.
 */
export function exampleFor(
	def: NodeDef, registry: Registry,
): { luau?: string; note?: string; omitted?: ExampleOmission } {
	// Control flow needs a scene rather than a bare node: a Branch with nothing
	// inside it emits an empty `if`. Those graphs are hand-authored, and still
	// compiled here like every other example.
	const curated = CURATED[def.id];
	if (curated) {
		const result = compile(curated(), registry);
		if (result.diagnostics.some((d) => d.severity === "error")) {
			return { omitted: "did-not-compile" };
		}
		const luau = stripHeader(result.code);
		return luau === "" ? { omitted: "did-not-compile" } : { luau, note: EXAMPLE_NOTES[def.id] };
	}

	if (def.compilesTo.kind === "builtin") return { omitted: "opens-a-block" };

	// A node whose pins follow its configuration is documented at its default
	// configuration, which for the variadics is their minimum arity — `Add` with
	// two operands is exactly what you get when you drop one on the canvas.
	const { inputs, outputs } = resolveNodePins(def, undefined);

	const script = def.pure
		? pureExample(def, inputs, outputs)
		: statementExample(def, inputs);
	if (!script) return { omitted: "needs-wiring" };

	const result = compile(script, registry);
	if (result.diagnostics.some((d) => d.severity === "error")) {
		return { omitted: "did-not-compile" };
	}

	const luau = stripHeader(result.code);
	return luau === "" ? { omitted: "did-not-compile" } : { luau };
}

/** A pure node's value, wired into a Print so it appears in a real position. */
function pureExample(def: NodeDef, inputs: PinDef[], outputs: PinDef[]): NodeScript | null {
	const value = outputs.find((p) => p.kind === "data");
	if (!value) return null;

	const script = emptyScript("Example", "docs-example");
	script.nodes = [
		{ id: "begin", def: "script.begin", x: 0, y: 0 },
		{ id: "subject", def: def.id, x: 200, y: 100 },
		{ id: "print", def: "debug.print", x: 400, y: 0 },
	];
	script.links = [
		{ id: "l1", from: { node: "begin", pin: "then" }, to: { node: "print", pin: "in" } },
		{ id: "l2", from: { node: "subject", pin: value.id }, to: { node: "print", pin: "value" } },
	];
	addPlaceholders(script, def, inputs);
	return script;
}

/** An impure node, hung off Script Start. */
function statementExample(def: NodeDef, inputs: PinDef[]): NodeScript {
	const script = emptyScript("Example", "docs-example");
	script.nodes = [
		{ id: "begin", def: "script.begin", x: 0, y: 0 },
		{ id: "subject", def: def.id, x: 200, y: 0 },
	];
	script.links = [
		{ id: "l1", from: { node: "begin", pin: "then" }, to: { node: "subject", pin: "in" } },
	];
	addPlaceholders(script, def, inputs);
	return script;
}

/**
 * Feeds every input that has no value of its own from a named stand-in.
 *
 * Destroy has no default for its Instance pin, and it never will — there is no
 * sensible instance to default to. Documenting it as `nil:Destroy()` would be
 * true of the graph and useless to the reader, so the pin is fed by a Luau
 * Expression carrying the pin's own name instead: `part:Destroy()` reads as
 * "given a part". The stand-in is visible in the emitted code rather than
 * pretending to be a value the node supplies.
 */
function addPlaceholders(script: NodeScript, def: NodeDef, inputs: PinDef[]): void {
	const literalOnly = literalOnlyPins(def);
	let n = 0;

	for (const pin of inputs) {
		if (pin.kind !== "data" || pin.default !== undefined) continue;
		// A pin whose text is pasted into the source cannot take a wire at all.
		if (literalOnly.has(pin.id)) continue;

		const id = `stand${n++}`;
		script.nodes.push({
			id,
			def: "value.expression",
			x: 0,
			y: 200 + n * 40,
			literals: { code: { t: "raw", v: placeholderName(pin) } },
		});
		script.links.push({
			id: `p${n}`,
			from: { node: id, pin: "result" },
			to: { node: "subject", pin: pin.id },
		});
	}
}

/**
 * Luau globals a stand-in must not be called, or the example would read as
 * indexing the standard library rather than a value you supplied.
 */
const SHADOWS = new Set([
	"table", "string", "math", "os", "task", "game", "script", "workspace",
	"type", "select", "next", "print", "require", "shared",
]);

function placeholderName(pin: PinDef): string {
	const base = (pin.name || pin.id).replace(/[^A-Za-z0-9]+/g, "");
	const named = base === "" ? "value" : base.charAt(0).toLowerCase() + base.slice(1);
	return SHADOWS.has(named) ? `${named}Value` : named;
}

/** Everything after the generated header, which carries volatile hashes. */
export function stripHeader(code: string): string {
	const lines = code.split("\n");
	const start = lines.findIndex((l) => l.startsWith("-- roswaal-output:"));
	return lines.slice(start + 1).join("\n").trim();
}

/** Why a node has no worked example, in words a reader can act on. */
export const OMISSION_REASONS: Record<ExampleOmission, string> = {
	"opens-a-block":
		"This node opens a block, so an example without a body inside it would show less than it hid.",
	"needs-configuring":
		"This node's pins come from its own configuration — a function's signature, a call's argument count — so it has no fixed shape to show.",
	"needs-wiring":
		"This node has an input that must be wired, and wiring it here would document the other node instead.",
	"did-not-compile":
		"No example: this node did not compile in isolation. That is worth reporting as a bug rather than working around.",
};
