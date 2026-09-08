/**
 * Node inspector.
 *
 * Most nodes need nothing here — their inputs are edited on the node itself.
 * It exists for the handful whose *shape* is data: function signatures, module
 * exports, connect handler parameters. Those cannot be expressed as pins
 * because the pins are what they define.
 */

import type { NodeDef, NodeScript, GraphNode } from "../core/schema.js";
import { nodeTitle, type Registry } from "../core/nodes/index.js";
import type { Signature } from "../core/nodes/index.js";
import { resolvePins } from "./geometry.js";
import { nodeColor } from "./palette.js";
import {
	addVariable, bindNodeToFunction, bindNodeToVariable, renameNode, setConfig,
	syncFunctionRefs, syncFunctionReturns,
} from "./edits.js";
import { store } from "./store.js";

const TYPES = [
	"any", "boolean", "number", "string", "table", "function",
	"Instance", "Vector3", "Vector2", "CFrame", "Color3", "UDim2",
];

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
				{def.summary && <p className="summary">{def.summary}</p>}

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

				{def.id === "function.entry" && <FunctionEditor node={node} />}
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

				<PinSummary def={def} node={node} />
			</div>
		</div>
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
	// Only the hoisted one is written out. The in-flow one names the type of a
	// value wired into it, so its definition is the wire.
	const written = node.def === "type.declareTop";
	/**
	 * Which half of the editor to show, when the node has not said.
	 *
	 * A node made before the field list existed has a definition and no fields,
	 * and the compiler falls back to that definition — so the dropdown has to say
	 * "written out" or it claims to be showing a shape the file is not using.
	 */
	const fields = (config as { fields?: unknown[] }).fields ?? [];
	const shape =
		config.shape === "written" || config.shape === "fields"
			? config.shape
			: (config.definition ?? "") !== "" && fields.length === 0
				? "written"
				: "fields";

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

			{written && (
				<Field label="Shape">
					<select
						className="tb"
						value={shape}
						onChange={(e) => store.edit((s) => setConfig(s, node.id, { shape: e.target.value }))}
					>
						<option value="fields">A table of fields</option>
						<option value="written">Written out as Luau</option>
					</select>
				</Field>
			)}

			{written && shape === "fields" && <TypeFields node={node} />}

			{written && shape === "written" && (
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

			{!written && (
				<p className="summary">
					The definition is whatever you wire into <strong>Value</strong>:{" "}
					<code>type {config.name || "Name"} = typeof(that value)</code>. Put the node after
					the thing it describes.
				</p>
			)}

			{/* A checkbox belongs beside its own words, not under a heading with the
			    words orphaned below it — which is what a <label> nested inside the
			    <Field> label produced. */}
			<div className="field">
				<span>Is Export Type</span>
				<label className="check-row">
					<input
						type="checkbox"
						checked={config.export !== false}
						onChange={(e) => store.edit((s) => setConfig(s, node.id, { export: e.target.checked }))}
					/>
					<span>other modules can use it</span>
				</label>
			</div>
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
	const functions = script.nodes.filter((n) => n.def === "function.entry");
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
			return field === "returns" && node.def === "function.entry"
				? syncFunctionReturns(updated, node.id)
				: updated;
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
					<select
						className="tb"
						value={entry.type ?? "any"}
						onChange={(e) => {
							const next = [...list];
							next[i] = { ...entry, type: e.target.value };
							write(next);
						}}
					>
						{TYPES.map((t) => (
							<option key={t}>{t}</option>
						))}
					</select>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label className="field">
			<span>{label}</span>
			{children}
		</label>
	);
}
