/**
 * The open graph's variable list.
 *
 * Sits under the project tree because that is where you look for "what is in
 * this script". Dragging a variable onto the canvas spawns a Get node, or a
 * Set node with Ctrl held — the shortest path from seeing a variable to using
 * one.
 */

import { useState, type DragEvent } from "react";

import type { GraphNode, Literal, NodeScript, ScriptVariable } from "../core/schema.js";
import { hoistedFunctions, visibleFrom, type GraphId } from "../core/functionGraph.js";
import {
	addVariable, defaultLiteralFor, deleteVariable, localRefFor, updateVariable, variableUsageCount,
} from "./edits.js";
import { FUNCTION_NODES } from "../core/nodes/flow.js";
import { isConstLocal } from "../core/nodes/variables.js";
import { pinColor } from "./palette.js";
import { requiredTypes, useProjectTypes } from "./projectTypes.js";
import { store } from "./store.js";
import { TypePicker } from "./TypePicker.jsx";

export interface VariablesPanelProps {
	/**
	 * The graph is being compiled and refuses edits. The store is what actually
	 * refuses them -- see `EditorState.locked` -- so this exists so the panel
	 * does not sit there looking like it accepted one.
	 */
	locked?: boolean;
	script: NodeScript;
	/** The graph on screen: a function's id, or null for the script's own. */
	graph: GraphId;
	selection: ReadonlySet<string>;
	/** Asks for confirmation; resolves true when the developer agrees. */
	confirm: (title: string, message: string, confirmLabel: string) => Promise<boolean>;
}

export function VariablesPanel({ script, graph, confirm, locked }: VariablesPanelProps) {
	const [open, setOpen] = useState<string | null>(null);
	// Both kinds, because a graph's functions are its functions: which one is
	// hoisted is a property of each, shown on the row rather than sorted on.
	// The list is not scoped: it is how you move between a file's functions, and
	// a function you cannot see from here is still one you may want to open.
	const functions = script.nodes.filter((n) => FUNCTION_NODES.has(n.def));
	const hoisted = hoistedFunctions(script);
	const locals = script.nodes.filter(
		(n) => n.def === "local.declare" && visibleFrom(n, graph, hoisted),
	);
	const declaredTypes = script.nodes.filter(
		(n) =>
			(n.def === "type.declareTop" || n.def === "type.declareHere") &&
			((n.config as { name?: string } | undefined)?.name ?? "").trim() !== "" &&
			// A type declared inside a function is scoped to it exactly as a
			// local is; a hoisted one is written above everything and always is.
			(n.def === "type.declareTop" || visibleFrom(n, graph, hoisted)),
	);
	const required = requiredTypes(script, useProjectTypes());

	return (
		<div className={`variables${locked ? " editing-locked" : ""}`}>
			<h2>
				<span>Variables</span>
				<button
					className="tb"
					title="Add a variable"
					onClick={() =>
						store.edit((s) => {
							const { script: next, id } = addVariable(s);
							queueMicrotask(() => setOpen(id));
							return next;
						})
					}
				>
					Add
				</button>
			</h2>

			<div className="variable-list">
				{script.variables.map((variable) => (
					<VariableRow
						key={variable.id}
						script={script}
						variable={variable}
						confirm={confirm}
						expanded={open === variable.id}
						onToggle={() => setOpen((id) => (id === variable.id ? null : variable.id))}
					/>
				))}
				{script.variables.length === 0 && (
					<p className="hint">
						None yet. A variable is a value the whole script can read and write, as opposed to a
						local, which only exists inside the block that declared it.
					</p>
				)}

				{/* The graph's Declare Locals, so one can be dragged out as a Get
				    Local instead of wired from where it was made. */}
				{locals.length > 0 && (
					<>
						<h3 className="variables-sub">Locals</h3>
						{locals.map((node) => (
							<LocalRow key={node.id} node={node} />
						))}
					</>
				)}

				{/* The functions this graph declares. In a graph of any size the
				    declaration is somewhere off screen, and this is the list that
				    says what there is and takes you to one. */}
				{functions.length > 0 && (
					<>
						<h3 className="variables-sub">Functions</h3>
						{functions.map((node) => (
							<FunctionRow key={node.id} node={node} />
						))}
					</>
				)}

				{/* The types this graph declares, and the ones its requires bring
				    in. Dragged out, a type becomes a local of that type. */}
				{(declaredTypes.length > 0 || required.length > 0) && (
					<>
						<h3 className="variables-sub">Types</h3>
						{declaredTypes.map((node) => {
							const config = (node.config ?? {}) as { name?: string; export?: boolean };
							return (
								<TypeRow
									key={node.id}
									type={config.name!.trim()}
									detail={config.export === false ? "type" : "export"}
									onClick={() => store.reveal(node.id)}
								/>
							);
						})}
						{required.map((entry) => (
							<TypeRow
								key={entry.type}
								type={entry.type}
								detail="required"
								title={`Exported by ${entry.graph}`}
							/>
						))}
					</>
				)}
			</div>
		</div>
	);
}

/** One type: drag it for a Declare Local of that type, or a Cast with Ctrl. */
function TypeRow({
	type, detail, title, onClick,
}: { type: string; detail: string; title?: string; onClick?: () => void }) {
	function onDragStart(e: DragEvent) {
		e.dataTransfer.setData("application/x-roswaal-type", JSON.stringify({ type }));
		e.dataTransfer.effectAllowed = "copy";
	}

	return (
		<div className="variable">
			<div
				className="variable-head"
				draggable
				title={`${title ? `${title}. ` : ""}Drag onto the canvas for a local of this type, or a Cast with Ctrl.`}
				onDragStart={onDragStart}
				onClick={onClick}
			>
				<span className="swatch type-swatch" />
				<span className="name">{type}</span>
				<span className="type">{detail}</span>
			</div>
		</div>
	);
}

/** One Declare Local: drag it for a Get Local, click it to find the node. */
function LocalRow({ node }: { node: GraphNode }) {
	const ref = localRefFor(node);
	const declared = (node.config as { type?: string } | undefined)?.type?.trim();

	function onDragStart(e: DragEvent) {
		e.dataTransfer.setData("application/x-roswaal-local", JSON.stringify({ id: node.id }));
		e.dataTransfer.effectAllowed = "copy";
	}

	return (
		<div className="variable">
			<div
				className="variable-head"
				draggable
				title="Drag onto the canvas for a Get Local. Click to select its Declare Local."
				onDragStart={onDragStart}
				onClick={() => store.reveal(node.id)}
			>
				<span className="swatch" style={{ background: pinColor(ref.type, "data") }} />
				<span className="name">{ref.name}</span>
				{/* The list is where you look to see what a graph holds, so a promise
				    one of them has made belongs here rather than only in the
				    Inspector of the node that made it. */}
				{isConstLocal(node.config) && <span className="badge const">const</span>}
				<span className="type">{declared || "any"}</span>
			</div>
		</div>
	);
}

/**
 * One function: drag it for a Get Function, click it to open its graph.
 *
 * The detail says which of the two it is, because that is the thing you cannot
 * tell from the name and the thing that decides where its body runs — hoisted
 * to the top of the file, or declared where the node sits.
 */
function FunctionRow({ node }: { node: GraphNode }) {
	const sig = (node.config ?? {}) as { name?: string };

	function onDragStart(e: DragEvent) {
		e.dataTransfer.setData("application/x-roswaal-function", JSON.stringify({ id: node.id }));
		e.dataTransfer.effectAllowed = "copy";
	}

	return (
		<div className="variable">
			<div
				className="variable-head"
				draggable
				title="Drag onto the canvas for a Get Function. Click to open its graph."
				onDragStart={onDragStart}
				onClick={() => {
					const path = store.getSnapshot().path;
					if (path) store.openFunction(path, node.id);
				}}
			>
				<span className="swatch" style={{ background: pinColor("function", "data") }} />
				<span className="name">{sig.name || "function"}</span>
				<span className="type">{node.def === "function.entry" ? "hoisted" : "here"}</span>
			</div>
		</div>
	);
}

interface VariableRowProps {
	variable: ScriptVariable;
	script: NodeScript;
	expanded: boolean;
	onToggle: () => void;
	confirm: VariablesPanelProps["confirm"];
}

function VariableRow({ variable, script, expanded, onToggle, confirm }: VariableRowProps) {
	const uses = variableUsageCount(script, variable.id);

	function onDragStart(e: DragEvent) {
		// The canvas reads this to decide what to spawn where it is dropped.
		e.dataTransfer.setData(
			"application/x-roswaal-variable",
			JSON.stringify({ id: variable.id }),
		);
		e.dataTransfer.effectAllowed = "copy";
	}

	return (
		<div className={`variable${expanded ? " expanded" : ""}`}>
			<div className="variable-head" draggable onDragStart={onDragStart} onClick={onToggle}>
				<span className="swatch" style={{ background: pinColor(variable.type, "data") }} />
				<span className="name">{variable.name}</span>
				{variable.const === true && <span className="badge const">const</span>}
				<span className="type">{variable.type}</span>
			</div>

			{expanded && (
				<div className="variable-body">
					<label className="field">
						<span>Name</span>
						<input
							className="tb"
							value={variable.name}
							onChange={(e) =>
								store.edit((s) => updateVariable(s, variable.id, { name: e.target.value }))
							}
						/>
					</label>
					<label className="field">
						<span>Type</span>
						<TypePicker
							value={variable.type}
							onChange={(type) =>
								store.edit((s) => updateVariable(s, variable.id, { type }))
							}
						/>
					</label>
					{/* `local` or `const`, per variable. A constant is declared once at
					    the top of the file with the value below, and Set Variable on
					    one is refused rather than left to the runtime. */}
					<label className="field">
						<span>Binding</span>
						<div className="segmented">
							<button
								className={variable.const !== true ? "on" : ""}
								onClick={() =>
									store.edit((s) => updateVariable(s, variable.id, { const: undefined }))
								}
							>
								local
							</button>
							<button
								className={variable.const === true ? "on" : ""}
								title="Luau's const: the name cannot be reassigned. Needs a runtime that has it."
								onClick={() =>
									store.edit((s) => updateVariable(s, variable.id, { const: true }))
								}
							>
								const
							</button>
						</div>
					</label>
					<label className="field">
						<span>Initial value</span>
						<DefaultEditor
							type={variable.type}
							value={variable.default}
							onChange={(next) =>
								store.edit((s) => updateVariable(s, variable.id, { default: next }))
							}
						/>
					</label>
					<label className="field">
						<span>Comment</span>
						<input
							className="tb"
							placeholder="Emitted above the local"
							value={variable.description ?? ""}
							onChange={(e) =>
								store.edit((s) =>
									updateVariable(s, variable.id, { description: e.target.value || undefined }),
								)
							}
						/>
					</label>

					<div className="variable-footer">
						<span className="hint">
							{uses === 0 ? "Not used yet" : `${uses} node${uses === 1 ? "" : "s"}`}
						</span>
						<button
							className="tb"
							onClick={async () => {
								// Deleting leaves the Get/Set nodes behind as errors rather than
								// removing work silently, so say what that will cost first.
								const warning =
									uses === 0
										? `Delete "${variable.name}"?`
										: `Delete "${variable.name}"? ${uses} node${uses === 1 ? "" : "s"} still ` +
											`reference it, and will report an error until repointed or removed.`;
								if (await confirm("Delete variable", warning, "Delete")) {
									store.edit((s) => deleteVariable(s, variable.id));
								}
							}}
						>
							Delete
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

function DefaultEditor({
	type, value, onChange,
}: { type: string; value: Literal; onChange: (next: Literal) => void }) {
	const current = value ?? defaultLiteralFor(type);

	if (current.t === "boolean") {
		return (
			<input
				type="checkbox"
				checked={current.v}
				onChange={(e) => onChange({ t: "boolean", v: e.target.checked })}
			/>
		);
	}
	if (current.t === "number") {
		return (
			<input
				className="tb"
				type="number"
				value={current.v}
				onChange={(e) => onChange({ t: "number", v: Number(e.target.value) || 0 })}
			/>
		);
	}
	if (current.t === "string") {
		return (
			<input
				className="tb"
				value={current.v}
				onChange={(e) => onChange({ t: "string", v: e.target.value })}
			/>
		);
	}
	// Everything else is an expression: a table constructor, a Vector3.new call,
	// whatever the type needs. Emitted verbatim.
	return (
		<input
			className="tb"
			value={current.t === "raw" ? current.v : "nil"}
			title="A Luau expression, inserted verbatim"
			onChange={(e) => onChange({ t: "raw", v: e.target.value })}
		/>
	);
}
