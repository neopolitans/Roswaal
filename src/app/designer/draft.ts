/**
 * A node being designed, and every edit the designer can make to it.
 *
 * Pure functions over a plain object, for the reason `edits.ts` is: the canvas
 * and the floating tools stay free of bookkeeping, and the rules — which pins a
 * node may have, what renaming a pin does to the template that reads it, when a
 * node is pure — can be tested without a browser.
 *
 * ## Pure is decided by the pins
 *
 * A node with no execution pins is **pure**: a value, one expression per
 * output. A node with an execution input is **impure**: a step, with a template
 * run where the node sits. An execution *output* with no input is refused,
 * because nothing could ever run the node — see `purityOf`.
 *
 * So there is no "kind" to choose. Take the last execution pin off and the node
 * is pure; the designer keeps both kinds of logic in the draft, so putting the
 * pin back gives the template back rather than an empty one.
 *
 * ## One execution pin a side, and fixed ids
 *
 * A custom node's template cannot route between several execution outputs —
 * the emitter follows `then` and nothing else — so a side has at most one, and
 * they are always `in` and `then`. Data pins take their ids from their names,
 * because the id is what a template writes (`$in.force`), and a template that
 * has to say `$in.pin3` is one nobody can read.
 */

import type { LogicCompile, LogicGraph } from "../../core/compiler/logic.js";
import { parseNodePack } from "../../core/nodes/index.js";
import type { LogicShape } from "../../core/nodes/logic.js";
import type { Literal, NodeDef, PinDef, Target } from "../../core/schema.js";

/** A node as a pack stores it: its definition, and its logic graph when it has one. */
export type PackNode = NodeDef & { logic?: LogicGraph };

export const EXEC_IN = "in";
export const EXEC_OUT = "then";

export type Side = "in" | "out";

export interface DraftPin {
	id: string;
	/** What the node shows beside the pin. Execution pins read better without one. */
	name: string;
	kind: "exec" | "data";
	type: string;
	/** Inputs only: the value used when nothing is wired. */
	default?: Literal;
	/**
	 * Inputs only: values offered in a dropdown on the node.
	 *
	 * Suggestions rather than a gate, as `PinDef.options` is — the loader has
	 * taken these from a `.nodedef.json` all along and there was no way to set
	 * one from the editor that builds them.
	 */
	options?: string[];
	description?: string;
}

export interface Draft {
	id: string;
	title: string;
	category: string;
	summary: string;
	inputs: DraftPin[];
	outputs: DraftPin[];
	/** What an impure node compiles to. */
	template: string;
	/** What a pure node compiles to: one expression per output, by pin id. */
	expressions: Record<string, string>;
	/**
	 * An impure node's result: the output a call's value lands in. Without one
	 * the node is a statement, and its data outputs are locals the template
	 * assigns to.
	 */
	result?: string;
	/** A pill, for a pure node in the getter shape; otherwise a normal node. */
	display: "normal" | "compact";
	targets?: Target[];
	latent: boolean;
	/**
	 * Where the logic comes from: written as a template, or built from nodes
	 * and compiled to one. Both are kept, so switching back and forth loses
	 * neither; only the one in use is saved.
	 */
	logicMode: "luau" | "nodes";
	logic?: LogicGraph;
}

const execPin = (id: string): DraftPin => ({ id, name: "", kind: "exec", type: "exec" });

/**
 * A new node: an empty header, one execution pin each side.
 *
 * Impure, because that is the common case, and because it shows both kinds of
 * pin on the first thing somebody sees.
 */
export function newDraft(namespace: string, taken: Iterable<string>): Draft {
	const used = new Set(taken);
	let id = `${namespace}.newNode`;
	for (let n = 2; used.has(id); n++) id = `${namespace}.newNode${n}`;
	return {
		id,
		title: "",
		category: namespace.charAt(0).toUpperCase() + namespace.slice(1),
		summary: "",
		inputs: [execPin(EXEC_IN)],
		outputs: [execPin(EXEC_OUT)],
		template: "",
		expressions: {},
		display: "normal",
		latent: false,
		logicMode: "luau",
	};
}

/** A node from a pack, as a draft to edit. */
export function draftOf(def: PackNode): Draft {
	const pin = (p: PinDef): DraftPin => ({
		id: p.id,
		name: p.name ?? "",
		kind: p.kind,
		type: p.kind === "exec" ? "exec" : (p.type ?? "any"),
		...(p.default ? { default: p.default } : {}),
		...(p.options && p.options.length > 0 ? { options: [...p.options] } : {}),
		...(p.description ? { description: p.description } : {}),
	});
	const spec = def.compilesTo;
	return {
		id: def.id,
		title: def.title,
		category: def.category,
		summary: def.summary ?? "",
		inputs: def.inputs.map(pin),
		outputs: def.outputs.map(pin),
		template: spec.kind === "call" || spec.kind === "statement" ? spec.template : "",
		expressions: spec.kind === "expr" ? { ...spec.outputs } : {},
		...(spec.kind === "call" ? { result: spec.result } : {}),
		display: def.display === "compact" ? "compact" : "normal",
		...(def.targets ? { targets: def.targets } : {}),
		latent: def.latent === true,
		...(def.logic ? { logicMode: "nodes" as const, logic: def.logic } : { logicMode: "luau" as const }),
	};
}

/**
 * The targets a node runs on: what it declares, narrowed by what its logic uses.
 *
 * An intersection, not a choice between them. A node that says Lune and is
 * built from Get Service is a Roblox node whatever it says — and one that says
 * Roblox and is built from nodes that run anywhere is still a Roblox node,
 * because somebody decided it was. `null` is both.
 *
 * Logic written in Luau cannot be read for this, so only what it declares counts.
 */
export function targetsOf(draft: Draft, compiled?: LogicCompile | null): Target[] | null {
	const derived = draft.logicMode === "nodes" ? (compiled?.targets ?? null) : null;
	let out: Target[] | null = draft.targets ? [...draft.targets] : null;
	if (derived) out = out === null ? [...derived] : out.filter((t) => derived.includes(t));
	return out;
}

const TARGET_NAME: Record<Target, string> = { roblox: "Roblox", lune: "Lune" };

/** "Roblox only", "Roblox and Lune": how a set of targets is said in a problem. */
export function targetsText(targets: readonly Target[] | null): string {
	if (targets === null) return "Roblox and Lune";
	if (targets.length === 0) return "nothing";
	return `${targets.map((t) => TARGET_NAME[t]).join(" and ")} only`;
}

/** The pins a logic graph's two ends take from the node. */
export function shapeOfDraft(draft: Draft): LogicShape {
	const data = (pins: DraftPin[]) =>
		pins.filter((p) => p.kind === "data").map((p) => ({ id: p.id, name: p.name, type: p.type }));
	return { pure: purityOf(draft) === "pure", inputs: data(draft.inputs), outputs: data(draft.outputs) };
}

/** What the pins make the node. */
export function purityOf(draft: Draft): "pure" | "impure" | "unrunnable" {
	const execIn = draft.inputs.some((p) => p.kind === "exec");
	const execOut = draft.outputs.some((p) => p.kind === "exec");
	if (execIn) return "impure";
	return execOut ? "unrunnable" : "pure";
}

function pinsOf(draft: Draft, side: Side): DraftPin[] {
	return side === "in" ? draft.inputs : draft.outputs;
}

function withPins(draft: Draft, side: Side, pins: DraftPin[]): Draft {
	return side === "in" ? { ...draft, inputs: pins } : { ...draft, outputs: pins };
}

/**
 * A pin id from a name: `Hit Part` becomes `hitPart`.
 *
 * Unique among `taken`, and never `in` or `then`, which the execution pins own.
 */
export function pinIdFor(name: string, taken: Iterable<string>): string {
	const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
	let base = words
		.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)))
		.join("");
	if (base === "") base = "value";
	if (/^[0-9]/.test(base)) base = `pin${base}`;
	const used = new Set([...taken, EXEC_IN, EXEC_OUT]);
	let id = base;
	for (let n = 2; used.has(id); n++) id = `${base}${n}`;
	return id;
}

/** What a new pin of a type is called before anybody names it. */
export function nameForType(type: string): string {
	if (type === "any" || type === "") return "Value";
	return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Adds a pin. `"exec"` adds that side's execution pin, first in the list, and
 * does nothing when it already has one; anything else is a data pin of that
 * type, at the end.
 */
export function addPin(draft: Draft, side: Side, type: string, name?: string): Draft {
	const pins = pinsOf(draft, side);
	if (type === "exec") {
		if (pins.some((p) => p.kind === "exec")) return draft;
		return withPins(draft, side, [execPin(side === "in" ? EXEC_IN : EXEC_OUT), ...pins]);
	}
	const label = name ?? nameForType(type);
	const id = pinIdFor(label, pins.map((p) => p.id));
	const next = withPins(draft, side, [...pins, { id, name: label, kind: "data", type }]);
	return side === "out" ? { ...next, expressions: { ...next.expressions, [id]: next.expressions[id] ?? "" } } : next;
}

export function removePin(draft: Draft, side: Side, index: number): Draft {
	const pins = pinsOf(draft, side);
	const pin = pins[index];
	if (!pin) return draft;
	let next = withPins(draft, side, pins.filter((_, i) => i !== index));
	if (side === "out" && pin.kind === "data") {
		const { [pin.id]: _gone, ...expressions } = next.expressions;
		next = { ...next, expressions, ...(next.result === pin.id ? { result: undefined } : {}) };
	}
	return next;
}

/**
 * Moves a pin up or down its side. An execution pin stays first — it is the
 * row a wire into the node arrives at — so data pins cannot pass it.
 */
export function movePin(draft: Draft, side: Side, index: number, delta: -1 | 1): Draft {
	const pins = [...pinsOf(draft, side)];
	const to = index + delta;
	if (!pins[index] || !pins[to] || pins[index].kind === "exec" || pins[to].kind === "exec") return draft;
	[pins[index], pins[to]] = [pins[to], pins[index]];
	return withPins(draft, side, pins);
}

/** `$in.old` or `$out.old` in a template, not followed by more of an identifier. */
function reference(side: Side, id: string): RegExp {
	const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`\\$${side === "in" ? "in" : "out"}\\.${escaped}(?![A-Za-z0-9_])`, "g");
}

/**
 * Renames a data pin, and its id with it — and every template that read the
 * old id reads the new one. A rename that left `$in.force` behind after the pin
 * became `impulse` would compile to a template reading a pin that is gone.
 */
export function renamePin(draft: Draft, side: Side, index: number, name: string): Draft {
	const pins = pinsOf(draft, side);
	const pin = pins[index];
	if (!pin || pin.kind === "exec") return draft;
	const id = pinIdFor(name, pins.filter((_, i) => i !== index).map((p) => p.id));
	let next = withPins(draft, side, pins.map((p, i) => (i === index ? { ...p, name, id } : p)));
	if (id === pin.id) return next;

	const rewrite = (text: string) => text.replace(reference(side, pin.id), `$${side === "in" ? "in" : "out"}.${id}`);
	const expressions: Record<string, string> = {};
	for (const [key, text] of Object.entries(next.expressions)) {
		expressions[side === "out" && key === pin.id ? id : key] = rewrite(text);
	}
	next = { ...next, template: rewrite(next.template), expressions };
	if (side === "out" && next.result === pin.id) next = { ...next, result: id };
	return next;
}

/** Changes a data pin's type. A default of another kind of value goes. */
export function retypePin(draft: Draft, side: Side, index: number, type: string): Draft {
	const pins = pinsOf(draft, side);
	const pin = pins[index];
	if (!pin || pin.kind === "exec") return draft;
	const keeps = pin.default !== undefined && fitsType(pin.default, type);
	return withPins(
		draft,
		side,
		pins.map((p, i) => {
			if (i !== index) return p;
			const { default: _old, ...rest } = p;
			return keeps ? { ...rest, type, default: p.default } : { ...rest, type };
		}),
	);
}

function fitsType(value: Literal, type: string): boolean {
	if (type === "any" || value.t === "raw" || value.t === "nil") return true;
	return value.t === type;
}

/** Sets or clears an input's default. */
export function setPinDefault(draft: Draft, index: number, value: Literal | undefined): Draft {
	const pin = draft.inputs[index];
	if (!pin || pin.kind === "exec") return draft;
	return {
		...draft,
		inputs: draft.inputs.map((p, i) => {
			if (i !== index) return p;
			const { default: _old, ...rest } = p;
			return value === undefined ? rest : { ...rest, default: value };
		}),
	};
}

/** Marks an output as the call's result, or with `undefined` makes the node a statement. */
export function setResult(draft: Draft, outputId: string | undefined): Draft {
	if (outputId !== undefined && !draft.outputs.some((p) => p.id === outputId && p.kind === "data")) return draft;
	return { ...draft, result: outputId };
}

/**
 * Whether the node can be drawn as a pill.
 *
 * The getter shape only — no inputs and one output — because a pill has nowhere
 * to draw an input. Said with its reason, so the choice can be greyed out
 * rather than hidden.
 */
export function pillShape(draft: Draft): { ok: true } | { ok: false; reason: string } {
	if (purityOf(draft) !== "pure") return { ok: false, reason: "A pill is a value: take the execution pins off first." };
	if (draft.inputs.length > 0) return { ok: false, reason: "A pill has nowhere to draw an input." };
	if (draft.outputs.length !== 1) return { ok: false, reason: "A pill has exactly one output." };
	return { ok: true };
}

/**
 * The draft as the definition a pack stores.
 *
 * With logic built from nodes, `compiled` is what that logic compiled to, and
 * it — not the draft's template — is what the node compiles to. The graph is
 * saved beside it for the designer to read back; the loader never looks at it.
 */
export function defOf(draft: Draft, compiled?: LogicCompile | null): PackNode {
	/**
	 * `side` rather than `p.kind`, because an output pin is `data` too and the
	 * two fields below are an input's alone: a default is what is used when
	 * nothing is wired, and a dropdown is a value nobody can set on an output.
	 */
	const pin = (side: Side) => (p: DraftPin): PinDef => ({
		id: p.id,
		name: p.name,
		kind: p.kind,
		...(p.kind === "data" ? { type: p.type || "any" } : {}),
		...(side === "in" && p.kind === "data" && p.default ? { default: p.default } : {}),
		...(side === "in" && p.kind === "data" && p.options && p.options.length > 0
			? { options: [...p.options] }
			: {}),
		...(p.description ? { description: p.description } : {}),
	});
	const purity = purityOf(draft);
	const outputs = draft.outputs.map(pin("out"));

	const fromNodes = draft.logicMode === "nodes";
	let compilesTo: NodeDef["compilesTo"];
	if (fromNodes) {
		compilesTo =
			compiled?.compilesTo ??
			(purity === "pure" ? { kind: "expr", outputs: {} } : { kind: "statement", template: "" });
	} else if (purity === "pure") {
		const exprs: Record<string, string> = {};
		for (const out of outputs) if (out.kind === "data") exprs[out.id] = draft.expressions[out.id] ?? "";
		compilesTo = { kind: "expr", outputs: exprs };
	} else if (draft.result && outputs.some((p) => p.id === draft.result)) {
		compilesTo = { kind: "call", template: draft.template, result: draft.result };
	} else {
		compilesTo = { kind: "statement", template: draft.template };
	}

	return {
		id: draft.id.trim(),
		title: draft.title.trim(),
		category: draft.category.trim() || "Custom",
		...(draft.summary.trim() ? { summary: draft.summary.trim() } : {}),
		...(draft.display === "compact" && purity === "pure" ? { display: "compact" as const } : {}),
		// A node built from a yielding node yields, whatever the draft says.
		...(draft.latent || (fromNodes && compiled?.latent) ? { latent: true } : {}),
		...(() => {
			const targets = targetsOf(draft, compiled);
			return targets ? { targets } : {};
		})(),
		inputs: draft.inputs.map(pin("in")),
		outputs,
		compilesTo,
		...(fromNodes && draft.logic ? { logic: draft.logic } : {}),
	};
}

/**
 * Everything standing between the draft and a pack that loads, said plainly.
 *
 * The designer's own rules first, worded for somebody looking at the node; then
 * whatever `parseNodePack` still refuses, which is the loader's word and the
 * final one. `takenIds` are the other nodes of the pack, which an id must not
 * repeat.
 */
export function problemsOf(
	draft: Draft, takenIds: Iterable<string> = [], compiled?: LogicCompile | null,
): string[] {
	const out: string[] = [];
	const purity = purityOf(draft);
	const fromNodes = draft.logicMode === "nodes";

	if (!/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(draft.id.trim())) {
		out.push("An id is the pack's namespace and a name: combat.knockback.");
	} else if (new Set(takenIds).has(draft.id.trim())) {
		out.push(`Another node in this pack is already ${draft.id.trim()}.`);
	}
	if (draft.title.trim() === "") out.push("Give it a title.");
	if (purity === "unrunnable") {
		out.push("An execution output needs an execution input: nothing could run this node.");
	}

	if (purity === "pure" && !draft.outputs.some((p) => p.kind === "data")) {
		out.push("A pure node is a value, so it needs an output.");
	}

	// Logic built from nodes is checked by its compiler; the template it made is
	// not somebody's writing, so the template checks below are for Luau only.
	if (fromNodes) {
		if (!draft.logic) out.push("Build the logic from nodes, or switch to Luau.");
		else if (!compiled) out.push("The logic has not been compiled yet.");
		else {
			for (const error of compiled.errors) out.push(`Logic: ${error}`);
			// A step whose logic compiles to nothing would save as a node that does
			// nothing — and switching a working Luau node to Nodes starts exactly
			// there, so without this it saves over the template it had.
			const spec = compiled.compilesTo;
			if (purity !== "pure" && spec?.kind === "statement" && spec.template.trim() === "") {
				out.push("The logic does nothing yet. Build it from Node Inputs, or switch back to Luau.");
			}
		}
	} else if (purity === "pure") {
		for (const pin of draft.outputs.filter((p) => p.kind === "data")) {
			if ((draft.expressions[pin.id] ?? "").trim() === "") {
				out.push(`${pin.name || pin.id} has no expression yet.`);
			}
		}
	} else if (purity === "impure" && draft.template.trim() === "") {
		out.push("Write what it compiles to.");
	}

	const texts = fromNodes ? [] : purity === "pure" ? Object.values(draft.expressions) : [draft.template];
	const inputs = new Set(draft.inputs.map((p) => p.id));
	const outputs = new Set(draft.outputs.map((p) => p.id));
	const seen = new Set<string>();
	for (const text of texts) {
		for (const match of text.matchAll(/\$(in|out)\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
			const [, side, id] = match;
			const known = side === "in" ? inputs.has(id) : outputs.has(id);
			const key = `${side}.${id}`;
			if (!known && !seen.has(key)) {
				seen.add(key);
				out.push(`It reads $${key}, and there is no ${side === "in" ? "input" : "output"} called ${id}.`);
			}
		}
	}

	if (draft.display === "compact") {
		const pill = pillShape(draft);
		if (!pill.ok) out.push(pill.reason);
	}

	// Declared one way and built from nodes that only run the other: a node that
	// runs nowhere, which the loader would take and no project could use.
	const targets = targetsOf(draft, compiled);
	if (targets !== null && targets.length === 0) {
		out.push(
			`It runs on nothing: it says ${targetsText(draft.targets ?? null)}, and its logic uses nodes that ` +
			`run on ${targetsText(compiled?.targets ?? null)}.`,
		);
	}

	// The loader's word is the final one, not a second copy of the first: it
	// words the same problems its own way ("missing title"), so it is only asked
	// once the designer's checks have nothing left to say.
	if (out.length === 0) {
		for (const error of parseNodePack({ nodes: [defOf(draft, compiled)] }, "node").errors) {
			out.push(error.replace(/^node\[0\](?: \([^)]*\))?: /, ""));
		}
	}
	return out;
}
