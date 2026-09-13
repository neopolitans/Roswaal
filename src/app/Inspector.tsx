/**
 * Node inspector.
 *
 * Most nodes need nothing here — their inputs are edited on the node itself.
 * It exists for the handful whose *shape* is data: function signatures, module
 * exports, connect handler parameters. Those cannot be expressed as pins
 * because the pins are what they define.
 */

import type { GraphNode, Literal, NodeDef, NodeScript } from "../core/schema.js";
import { nodeTitle, type Registry } from "../core/nodes/index.js";
import type { Signature } from "../core/nodes/index.js";
import { resolvePins } from "./geometry.js";
import { nodeColor } from "./palette.js";
import {
	addVariable, bindNodeToFunction, bindNodeToLocal, bindNodeToVariable, disconnectInput, renameNode,
	setConfig, setLiteral, syncFunctionRefs, syncFunctionReturns, syncParamRefs,
} from "./edits.js";
import { FUNCTION_NODES, typeShapeOf } from "../core/nodes/flow.js";
import { localNameOf } from "../core/nodes/variables.js";
import { store } from "./store.js";
import { TypePicker } from "./TypePicker.jsx";

/**
 * Abbreviations whose full stop is not the end of a sentence.
 *
 * One `e.g.` in the whole library today, which is exactly the sort of thing
 * that is fine until the day somebody writes another and the panel starts
 * truncating a node's description to four words.
 */
const NOT_A_FULL_STOP = /(?:\be\.g|\bi\.e|\betc|\bvs|\bcf|\bapprox)\.$/i;

/**
 * The opening of a node's summary, short enough for a side panel.
 *
 * Summaries are written for the reference page, where a paragraph is right —
 * what the node does, when to reach for it, what it refuses. Beside the graph
 * that paragraph is a wall, and the rest of it is one click away.
 *
 * **Sentences until it has said something, rather than one sentence.** Plenty
 * of summaries open with a label instead of a description — "Escape hatch.",
 * "if / else.", "By name." — and stopping at the first full stop would put
 * those in the panel alone, which is worse than the wall. So it keeps taking
 * sentences until what it has is long enough to be a description.
 *
 * Splitting prose into sentences is famously not solvable in general. This has
 * to be right only about what occurs here: abbreviations, and full stops inside
 * code spans — `Vector3.new` must not end a sentence, and a stop between
 * backticks is never a boundary.
 */
const ENOUGH_SAID = 45;

export function briefSummary(text: string): string {
	const boundaries = /[.!?](?=\s)/g;
	let match: RegExpExecArray | null;
	while ((match = boundaries.exec(text)) !== null) {
		const upto = text.slice(0, match.index + 1);
		if (NOT_A_FULL_STOP.test(upto)) continue;
		// An odd number of backticks means the stop is inside a code span.
		if ((upto.match(/`/g) ?? []).length % 2 === 1) continue;
		if (upto.length >= ENOUGH_SAID) return upto;
	}
	return text;
}

/**
 * Whether this node's label also names something in the generated Luau.
 *
 * A `call` node binds its result to a local and takes the name from the label,
 * so labelling a Find First Child "value" emits `local value = ...` instead of
 * `local Child = ...` followed by a second local to rename it. That worked
 * already and was findable only by guessing that a field called Label was
 * load-bearing — the same trap Declare Local's name was in.
 */
function namesResult(def: NodeDef): boolean {
	if (def.compilesTo.kind === "call") return true;
	// A pure node binds a local too, as soon as anything reads its value twice
	// -- and since Find First Child became one, the field was hidden on exactly
	// the node that prompted it. A pure *builtin* stays out: it resolves to a
	// bare identifier and is never bound, so a name there would do nothing.
	return def.compilesTo.kind === "expr"
		&& (def.outputs ?? []).some((pin) => pin.kind === "data");
}

/** Where a node's page lives in the docs window. */
function docsHref(nodeId: string): string {
	return `/docs#${encodeURIComponent(`node/${nodeId}`)}`;
}

export interface InspectorProps {
	/**
	 * The graph is being compiled and refuses edits. The store is what actually
	 * refuses them -- see `EditorState.locked` -- so this exists so the panel
	 * does not sit there looking like it accepted one.
	 */
	locked?: boolean;
	script: NodeScript;
	registry: Registry;
	selection: ReadonlySet<string>;
}

export function Inspector({ script, registry, selection, locked }: InspectorProps) {
	if (selection.size !== 1) return null;
	const id = [...selection][0];
	const node = script.nodes.find((n) => n.id === id);
	if (!node) return null;
	const def = registry.get(node.def);
	if (!def) return null;

	return (
		<div className={`inspector${locked ? " editing-locked" : ""}`}>
			<h2>Node</h2>
			<div className="inspector-body">
				<div className="node-heading" style={{ background: nodeColor(def) }}>
					{def.title}
				</div>
				{def.summary && (
					<p className="summary">
						{briefSummary(def.summary)}{" "}
						{/* Named window, so it reuses the docs the toolbar opens rather
						    than stacking up a tab per node. */}
						<a className="docs-link" href={docsHref(def.id)} target="roswaal-docs">
							See docs page
						</a>
					</p>
				)}

				{/* The placeholder is what the node is called *now*, which for a
				    named node is its function or variable name rather than the
				    definition's title — so an empty field reads as "this is
				    already fine" instead of as a suggestion to type the name a
				    second time. */}
				<Field label="Label">
					<input
						className="tb"
						placeholder={nodeTitle(def, node)}
						value={node.label ?? ""}
						onChange={(e) => store.edit((s) => renameNode(s, id, e.target.value))}
					/>
				</Field>

				{namesResult(def) && <ResultName node={node} />}
				{FUNCTION_NODES.has(def.id) && <FunctionEditor node={node} />}
				{def.id === "function.return" && (
					<ListEditor
						node={node}
						field="returns"
						title="Returns"
						hint="Kept in step with the Function node this returns from."
					/>
				)}
				{def.id === "module.exports" && (
					<ListEditor
						node={node}
						field="exports"
						title="Exports"
						hint="One pin per key on the returned table. A single pin named “value” returns that value directly instead of wrapping it."
					/>
				)}
				{def.id === "event.connect" && (
					<ListEditor
						node={node}
						field="params"
						title="Handler parameters"
						hint="Whatever the signal passes to its listener."
					/>
				)}
				{(def.id === "table.dictionary"
					|| def.id === "table.getKey"
					|| def.id === "table.setKey") && <KeyStyle node={node} />}
				{def.id === "table.pair" && <PairEditor node={node} def={def} />}
				{def.id === "table.dictionary" && <TableLayout node={node} />}
				{def.id === "flow.sequence" && (
					<CountEditor node={node} field="count" label="Outputs" min={2} max={12} fallback={2} />
				)}
				{(def.id === "call.function" || def.id === "call.method") && (
					<CountEditor node={node} field="args" label="Arguments" min={0} max={8} fallback={1} />
				)}
				{(def.id === "type.declareTop" || def.id === "type.declareHere") && (
					<TypeEditor node={node} />
				)}
				{(def.id === "variable.get"
					|| def.id === "variable.set"
					|| def.id === "variable.init") && (
					<VariablePicker script={script} node={node} />
				)}
				{def.id === "function.get" && <FunctionPicker script={script} node={node} />}
				{def.id === "function.getParam" && <ParamPicker script={script} node={node} />}
				{def.id === "local.get" && <LocalPicker script={script} node={node} />}
				{def.id === "local.declare" && <LocalType node={node} />}

				<PinSummary def={def} node={node} />
			</div>
		</div>
	);
}

/**
 * What the local holding this node's result is called.
 *
 * Its own field rather than the node's label, which used to do both jobs and
 * so could only do one at a time: labelling a Find First Child `value` made
 * the node stop saying Find First Child. It shows under the header, the way
 * Declare Type shows the type it declares.
 */
function ResultName({ node }: { node: GraphNode }) {
	const current = (node.config as { resultName?: string } | undefined)?.resultName ?? "";
	return (
		<Field label="Result name" hint="The local this node's result lands in.">
			<input
				className="tb"
				value={current}
				placeholder="chosen for you"
				onChange={(e) => store.edit((s) => setConfig(s, node.id, { resultName: e.target.value }))}
			/>
		</Field>
	);
}

function FunctionEditor({ node }: { node: GraphNode }) {
	const sig = (node.config ?? {}) as Signature;
	return (
		<>
			<Field label="Function name">
				<input
					className="tb"
					value={sig.name ?? ""}
					placeholder="doSomething"
					onChange={(e) =>
						store.edit((s) => syncFunctionRefs(setConfig(s, node.id, { name: e.target.value })))
					}
				/>
			</Field>
			<ListEditor node={node} field="params" title="Parameters" />
			<ListEditor
				node={node}
				field="returns"
				title="Returns"
				hint="Return nodes inside this function follow along automatically."
			/>
		</>
	);
}

/**
 * The Luau type a Declare Type node writes out.
 *
 * The definition is a textarea rather than a set of pins, and that is the
 * honest shape: a type is not built out of values, so there is nothing for a
 * node to be. `{ speed: number }` describes something no wire can carry.
 */
/** Suggestions for a Luau field type. Free text — the list is a shortcut. */
const LUAU_TYPE_HINTS = [
	"number", "string", "boolean", "any",
	"Vector3", "Vector2", "CFrame", "Color3", "UDim2", "Instance", "BasePart",
	"{ [string]: number }", "{ number }", "string?",
];

/**
 * The fields of a table type, as rows rather than as typed-out Luau.
 *
 * `{ movementSpeed: number, hp: number }` is a list of pairs written in one
 * line, and a list of pairs is what an editor is good at: it lines the names up,
 * it cannot lose a brace, and adding a field is a button rather than finding
 * the right comma. The written-out box stays for everything this shape cannot
 * say — a union, a function type, a generic — which is most of Luau's type
 * language and not worth building a second grammar for.
 *
 * The type of each field is free text with suggestions rather than a dropdown.
 * A closed list would be wrong within a week: `Instance?`, `{ Player }` and
 * every type declared in the same file are all valid and none could be offered.
 */
function TypeFields({ node }: { node: GraphNode }) {
	const fields = ((node.config ?? {}).fields as { name: string; type: string }[]) ?? [];
	const write = (next: { name: string; type: string }[]) =>
		store.edit((s) => setConfig(s, node.id, { fields: next }));

	return (
		<div className="list-editor">
			<div className="list-title">
				<span>Fields</span>
				<button
					className="tb"
					onClick={() => write([...fields, { name: `field${fields.length + 1}`, type: "number" }])}
				>
					Add
				</button>
			</div>
			{fields.map((entry, i) => (
				<div className="list-row" key={i}>
					<input
						className="tb"
						value={entry.name}
						placeholder="name"
						onChange={(e) => {
							const next = [...fields];
							next[i] = { ...entry, name: e.target.value };
							write(next);
						}}
					/>
					<input
						className="tb"
						list="luau-type-hints"
						value={entry.type}
						placeholder="number"
						onChange={(e) => {
							const next = [...fields];
							next[i] = { ...entry, type: e.target.value };
							write(next);
						}}
					/>
					<button className="tb" title="Remove" onClick={() => write(fields.filter((_, j) => j !== i))}>
						×
					</button>
				</div>
			))}
			{fields.length === 0 && <p className="summary">No fields yet.</p>}
			<datalist id="luau-type-hints">
				{LUAU_TYPE_HINTS.map((t) => (
					<option key={t} value={t} />
				))}
			</datalist>
		</div>
	);
}

function TypeEditor({ node }: { node: GraphNode }) {
	const config = (node.config ?? {}) as {
		name?: string; definition?: string; export?: boolean; shape?: string;
	};
	// The in-flow node can also be the type of a wired value; the hoisted one is
	// written above every value there is, so it cannot.
	const inFlow = node.def === "type.declareHere";
	/**
	 * Which shape to show, when the node has not said. The same rule the
	 * compiler uses, so the dropdown cannot claim a shape the file is not using.
	 */
	const shape = typeShapeOf(node.def, node.config ?? {});
	const setShape = (next: string) =>
		store.edit((s) => {
			const shaped = setConfig(s, node.id, { shape: next });
			// The Value pin goes with the typeof shape, and a wire left on it
			// would point at a pin that is no longer there.
			return next === "typeof" ? shaped : disconnectInput(shaped, { node: node.id, pin: "value" });
		});

	return (
		<>
			<Field label="Type name">
				<input
					className="tb"
					value={config.name ?? ""}
					placeholder="Config"
					onChange={(e) => store.edit((s) => setConfig(s, node.id, { name: e.target.value }))}
				/>
			</Field>

			<Field label="Shape">
				<select className="tb" value={shape} onChange={(e) => setShape(e.target.value)}>
					{inFlow && <option value="typeof">Type of a Value</option>}
					<option value="fields">Table of Fields</option>
					<option value="written">Custom Luau</option>
				</select>
			</Field>

			{shape === "fields" && <TypeFields node={node} />}

			{shape === "written" && (
				<Field label="Definition">
					<textarea
						className="tb type-definition"
						rows={3}
						spellCheck={false}
						value={config.definition ?? ""}
						placeholder={'"idle" | "driving"'}
						onChange={(e) =>
							store.edit((s) => setConfig(s, node.id, { definition: e.target.value }))
						}
					/>
				</Field>
			)}

			{shape === "typeof" && (
				<p className="summary">
					The definition is whatever you wire into <strong>Value</strong>:{" "}
					<code>type {config.name || "Name"} = typeof(that value)</code>. Put the node after
					the thing it describes.
				</p>
			)}

			{/* One line: the box and what it is called. A checkbox does not need a
			    heading above it as well — the heading and the label were two ways
			    of saying the same thing, and reading them as a pair suggested they
			    were two different settings. What it *means* is a tooltip, which is
			    where an explanation belongs once the name is clear enough. */}
			<label className="check-row" title="Can other scripts see or use this type definition?">
				<input
					type="checkbox"
					checked={config.export !== false}
					onChange={(e) => store.edit((s) => setConfig(s, node.id, { export: e.target.checked }))}
				/>
				<span>Is Export Type</span>
			</label>
		</>
	);
}

/**
 * Whether a string key is written plainly or in brackets.
 *
 * `t.tuning` and `t["tuning"]` are the same access and Luau takes both, so this
 * is a setting rather than a rule — the generated file is meant to be read
 * beside hand-written Luau, and which one reads better depends on the table. A
 * settings table wants `tuning.turnRate`. A table keyed by names that only
 * happen to be identifiers today wants the brackets it will need tomorrow.
 *
 * Only a key that is a literal string and a valid Luau name can be written
 * plainly at all; a computed key, a number, or anything with a space in it
 * stays bracketed whatever this says.
 */
/**
 * Whether a table is written on one line or one key to a line.
 *
 * Inline is right for two or three keys and unreadable for ten, which is the
 * length a settings table actually is. stylua would break a long one for you,
 * but only if it is installed -- and what the generated file looks like should
 * not depend on whether an optional tool happens to be on PATH.
 */
function TableLayout({ node }: { node: GraphNode }) {
	const current = (node.config as { layout?: string } | undefined)?.layout === "lines"
		? "lines"
		: "inline";
	return (
		<Field label="Layout">
			<select
				className="tb"
				value={current}
				onChange={(e) => store.edit((s) => setConfig(s, node.id, { layout: e.target.value }))}
			>
				<option value="inline">Inline</option>
				<option value="lines">One per line</option>
			</select>
		</Field>
	);
}

function KeyStyle({ node }: { node: GraphNode }) {
	const current = (node.config as { keys?: string } | undefined)?.keys === "brackets"
		? "brackets"
		: "plain";
	return (
		<Field label="String keys">
			<select
				className="tb"
				value={current}
				onChange={(e) => store.edit((s) => setConfig(s, node.id, { keys: e.target.value }))}
			>
				<option value="plain">Property-like — t.name</option>
				<option value="brackets">Bracketed — t["name"]</option>
			</select>
		</Field>
	);
}

/** An empty value of each kind the Value field offers. */
const BLANK: Record<string, Literal> = {
	string: { t: "string", v: "" },
	number: { t: "number", v: 0 },
	boolean: { t: "boolean", v: false },
	raw: { t: "raw", v: "nil" },
	nil: { t: "nil" },
};

/**
 * A Key Value Pair's key and value, in the panel as well as on the node.
 *
 * The same two literals the node's rows edit, so neither place can disagree
 * with the other. The rows are quicker for a short key; the panel has room to
 * say what kind of value it is, which a row's one field cannot.
 */
function PairEditor({ node, def }: { node: GraphNode; def: NodeDef }) {
	const fallback = (pin: string) => def.inputs.find((p) => p.id === pin)?.default;
	const key = node.literals?.key ?? fallback("key");
	const value = node.literals?.value ?? fallback("value") ?? BLANK.nil;
	const set = (pin: string, literal: Literal) => store.edit((s) => setLiteral(s, node.id, pin, literal));

	return (
		<>
			<Field label="Key">
				<input
					className="tb"
					value={key?.t === "string" ? key.v : ""}
					placeholder="name"
					onChange={(e) => set("key", { t: "string", v: e.target.value })}
				/>
			</Field>
			<Field label="Value" hint="Ignored while a wire is plugged into Value.">
				<div className="field-row">
					<select
						className="tb"
						value={value.t}
						onChange={(e) => set("value", BLANK[e.target.value] ?? BLANK.nil)}
					>
						<option value="string">String</option>
						<option value="number">Number</option>
						<option value="boolean">Boolean</option>
						<option value="raw">Luau</option>
						<option value="nil">nil</option>
					</select>
					{value.t === "string" && (
						<input className="tb" value={value.v} onChange={(e) => set("value", { t: "string", v: e.target.value })} />
					)}
					{value.t === "number" && (
						<input
							className="tb"
							type="number"
							value={value.v}
							onChange={(e) => set("value", { t: "number", v: Number(e.target.value) || 0 })}
						/>
					)}
					{value.t === "boolean" && (
						<input
							type="checkbox"
							checked={value.v}
							onChange={(e) => set("value", { t: "boolean", v: e.target.checked })}
						/>
					)}
					{value.t === "raw" && (
						<input
							className="tb"
							spellCheck={false}
							value={value.v}
							placeholder="Vector3.zero"
							onChange={(e) => set("value", { t: "raw", v: e.target.value })}
						/>
					)}
				</div>
			</Field>
		</>
	);
}

function VariablePicker({ script, node }: { script: NodeScript; node: GraphNode }) {
	const current = (node.config as { variable?: string } | undefined)?.variable ?? "";

	/**
	 * Making the variable from here, rather than sending you to the panel.
	 *
	 * Initialize Variable is the node that showed this up: it exists to give a
	 * variable its first value, and it could not be used at all until you had
	 * been somewhere else and made one. The name is asked for rather than typed
	 * into a pin because a pin's literal is inert data — a literal that created
	 * a variable as a side effect would put the name in two places and leave
	 * them to drift.
	 */
	const create = () => {
		const name = window.prompt("Name the new variable", "newVariable");
		if (name === null || name.trim() === "") return;
		store.edit((s) => {
			const added = addVariable(s, name.trim(), "any");
			return bindNodeToVariable(added.script, node.id, added.id);
		});
	};

	return (
		<Field label="Variable">
			<div className="field-row">
				<select
					className="tb"
					style={{ flex: 1 }}
					value={current}
					onChange={(e) => store.edit((s) => bindNodeToVariable(s, node.id, e.target.value))}
				>
					{current === "" && (
						<option value="">
							{script.variables.length === 0 ? "No variables yet…" : "Choose a variable…"}
						</option>
					)}
					{script.variables.map((v) => (
						<option key={v.id} value={v.id}>
							{v.name} : {v.type}
						</option>
					))}
				</select>
				<button className="tb" title="Make a variable and point this node at it" onClick={create}>
					New…
				</button>
			</div>
		</Field>
	);
}

function FunctionPicker({ script, node }: { script: NodeScript; node: GraphNode }) {
	const current = (node.config as { function?: string } | undefined)?.function ?? "";
	const functions = script.nodes.filter((n) => FUNCTION_NODES.has(n.def));
	if (functions.length === 0) {
		return <p className="summary">This graph declares no functions yet.</p>;
	}
	return (
		<Field label="Function">
			<select
				className="tb"
				value={current}
				onChange={(e) => store.edit((s) => bindNodeToFunction(s, node.id, e.target.value))}
			>
				{current === "" && <option value="">Choose a function…</option>}
				{functions.map((fn) => (
					<option key={fn.id} value={fn.id}>
						{(fn.config as { name?: string } | undefined)?.name ?? "function"}
					</option>
				))}
			</select>
		</Field>
	);
}

/**
 * The type a Declare Local is annotated with.
 *
 * Any Luau type, the way a parameter's is: the list for the everyday ones and
 * Other… for `{ [Model]: Restore }`.
 */
function LocalType({ node }: { node: GraphNode }) {
	const current = (node.config as { type?: string } | undefined)?.type;
	return (
		<Field label="Type" hint="Written after the name when the graph is Nonstrict or Strict.">
			<TypePicker
				value={current ?? "any"}
				onChange={(type) =>
					store.edit((s) => setConfig(s, node.id, { type: type === "any" ? undefined : type }))
				}
			/>
		</Field>
	);
}

/**
 * Which parameter a Get Parameter reads: whose, and then which.
 *
 * Two steps rather than one flat list, because parameter names repeat across
 * functions — a list of bare names would offer three called `character` with
 * nothing to tell them apart.
 *
 * The owners are a **wider** set than `FunctionPicker`'s. Connect and Once bind
 * their handler's parameters exactly as the two declarations do, so a handler
 * is a legitimate thing to read a parameter from, and offering only functions
 * here would make a working graph unbuildable from the Inspector.
 */
function ParamPicker({ script, node }: { script: NodeScript; node: GraphNode }) {
	const ref = (node.config ?? {}) as { function?: string; param?: string };
	// The function whose graph this node is in comes first: it is nearly always
	// the one meant.
	const owners = script.nodes
		.filter((n) => FUNCTION_NODES.has(n.def) || n.def === "event.connect" || n.def === "event.once")
		.sort((a, b) => Number(b.id === node.graph) - Number(a.id === node.graph));
	if (owners.length === 0) {
		return <p className="summary">This graph has no functions or handlers with parameters yet.</p>;
	}

	const owner = owners.find((n) => n.id === ref.function);
	const params =
		((owner?.config as { params?: { name: string; type?: string }[] } | undefined)?.params) ?? [];

	/** Picking an owner clears a parameter that owner does not have. */
	const chooseOwner = (id: string) => {
		const next = owners.find((n) => n.id === id);
		const list =
			((next?.config as { params?: { name: string }[] } | undefined)?.params) ?? [];
		const keep = list.some((p) => p.name === ref.param) ? ref.param : list[0]?.name;
		store.edit((s) => setConfig(s, node.id, { function: id, param: keep, type: undefined }));
	};

	const chooseParam = (name: string) => {
		const found = params.find((p) => p.name === name);
		store.edit((s) => setConfig(s, node.id, { param: name, type: found?.type }));
	};

	return (
		<>
			<Field label="From">
				<select
					className="tb"
					value={ref.function ?? ""}
					onChange={(e) => chooseOwner(e.target.value)}
				>
					{ref.function === undefined && <option value="">Choose a function…</option>}
					{owners.map((fn) => (
						<option key={fn.id} value={fn.id}>
							{/* A handler has no name of its own — it is identified by the
						    signal it listens to, which is a wire rather than a
						    label — so it is named by what it is. */}
						{(fn.config as { name?: string } | undefined)?.name
								|| (FUNCTION_NODES.has(fn.def) ? "function" : "handler")}
						</option>
					))}
				</select>
			</Field>

			<Field label="Parameter" hint="Reads it wherever this node sits inside that body.">
				{params.length === 0 ? (
					<p className="summary">That one has no parameters yet.</p>
				) : (
					<select
						className="tb"
						value={ref.param ?? ""}
						onChange={(e) => chooseParam(e.target.value)}
					>
						{ref.param === undefined && <option value="">Choose a parameter…</option>}
						{params.map((p) => (
							<option key={p.name} value={p.name}>
								{p.name}
							</option>
						))}
					</select>
				)}
			</Field>
		</>
	);
}

function LocalPicker({ script, node }: { script: NodeScript; node: GraphNode }) {
	const current = (node.config as { local?: string } | undefined)?.local ?? "";
	const locals = script.nodes.filter((n) => n.def === "local.declare");
	if (locals.length === 0) {
		return <p className="summary">This graph declares no locals yet.</p>;
	}
	return (
		<Field label="Local">
			<select
				className="tb"
				value={current}
				onChange={(e) => store.edit((s) => bindNodeToLocal(s, node.id, e.target.value))}
			>
				{current === "" && <option value="">Choose a local…</option>}
				{locals.map((local) => (
					<option key={local.id} value={local.id}>
						{localNameOf(local)}
					</option>
				))}
			</select>
		</Field>
	);
}

interface CountEditorProps {
	node: GraphNode;
	field: string;
	label: string;
	min: number;
	max: number;
	fallback: number;
}

/** A numeric config field that changes how many pins a node has. */
function CountEditor({ node, field, label, min, max, fallback }: CountEditorProps) {
	const value = Number((node.config ?? {})[field] ?? fallback);
	return (
		<Field label={label}>
			<input
				className="tb"
				type="number"
				min={min}
				max={max}
				value={value}
				onChange={(e) => {
					const next = Math.max(min, Math.min(max, Number(e.target.value)));
					store.edit((s) =>
						setConfig(s, node.id, { [field]: Number.isFinite(next) ? next : fallback }),
					);
				}}
			/>
		</Field>
	);
}

interface ListEditorProps {
	node: GraphNode;
	field: "params" | "returns" | "exports";
	title: string;
	hint?: string;
}

function ListEditor({ node, field, title, hint }: ListEditorProps) {
	const list = ((node.config ?? {})[field] as { name: string; type?: string }[]) ?? [];

	const write = (next: { name: string; type?: string }[]) => {
		store.edit((s) => {
			const updated = setConfig(s, node.id, { [field]: next });
			// Changing a function's returns has to reach its Return nodes, or the
			// graph and the signature drift apart silently.
			if (field === "returns" && FUNCTION_NODES.has(node.def)) {
				return syncFunctionReturns(updated, node.id);
			}
			// And renaming a parameter has to reach every Get Parameter reading
			// it. The whole array is rewritten on each keystroke, so the sync is
			// handed both versions and works out what actually happened.
			if (field === "params") return syncParamRefs(updated, node.id, list, next);
			return updated;
		});
	};

	return (
		<div className="list-editor">
			<div className="list-title">
				<span>{title}</span>
				<button
					className="tb"
					onClick={() => write([...list, { name: `${field === "returns" ? "value" : "arg"}${list.length + 1}`, type: "any" }])}
				>
					Add
				</button>
			</div>
			{hint && <p className="summary">{hint}</p>}
			{list.map((entry, i) => (
				<div className="list-row" key={i}>
					<input
						className="tb"
						value={entry.name}
						onChange={(e) => {
							const next = [...list];
							next[i] = { ...entry, name: e.target.value };
							write(next);
						}}
					/>
					<TypePicker
						value={entry.type}
						onChange={(type) => {
							const next = [...list];
							next[i] = { ...entry, type };
							write(next);
						}}
					/>
					<button
						className="tb"
						title="Remove"
						onClick={() => write(list.filter((_, j) => j !== i))}
					>
						×
					</button>
				</div>
			))}
			{list.length === 0 && <p className="summary">None.</p>}
		</div>
	);
}

function PinSummary({ def, node }: { def: NodeDef; node: GraphNode }) {
	const { inputs, outputs } = resolvePins(def, node.config);
	const data = [...inputs, ...outputs].filter((p) => p.kind === "data");
	if (data.length === 0) return null;
	return (
		<div className="list-editor">
			<div className="list-title">
				<span>Data pins</span>
			</div>
			{data.map((pin) => (
				<div className="pin-summary" key={`${pin.kind}${pin.id}`}>
					<span>{pin.name || pin.id}</span>
					<span className="type">{pin.type}</span>
				</div>
			))}
		</div>
	);
}

function Field(
	{ label, hint, children }:
		{ label: string; hint?: string; children: React.ReactNode },
) {
	return (
		<label className="field" title={hint}>
			<span>{label}</span>
			{children}
		</label>
	);
}
