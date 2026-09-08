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
				{def.id === "type.define" && <TypeEditor node={node} />}
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
 * The Luau type a Define Type node writes out.
 *
 * The definition is a textarea rather than a set of pins, and that is the
 * honest shape: a type is not built out of values, so there is nothing for a
 * node to be. `{ speed: number }` describes something no wire can carry.
 */
function TypeEditor({ node }: { node: GraphNode }) {
	const config = (node.config ?? {}) as { name?: string; definition?: string; export?: boolean };
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
			<Field label="Definition">
				<textarea
					className="tb type-definition"
					rows={3}
					spellCheck={false}
					value={config.definition ?? ""}
					placeholder="{ movementSpeed: number }"
					onChange={(e) => store.edit((s) => setConfig(s, node.id, { definition: e.target.value }))}
				/>
			</Field>
			<Field label="Export">
				<label style={{ cursor: "pointer" }}>
					<input
						type="checkbox"
						checked={config.export !== false}
						onChange={(e) => store.edit((s) => setConfig(s, node.id, { export: e.target.checked }))}
					/>{" "}
					other modules can use it
				</label>
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
