/**
 * The open graph's variable list.
 *
 * Sits under the project tree because that is where you look for "what is in
 * this script". Dragging a variable onto the canvas spawns a Get node, or a
 * Set node with Ctrl held — the shortest path from seeing a variable to using
 * one.
 */

import { useState, type DragEvent } from "react";

import type { Literal, NodeScript, ScriptVariable } from "../core/schema.js";
import {
	addVariable, defaultLiteralFor, deleteVariable, updateVariable, variableUsageCount,
} from "./edits.js";
import { pinColor } from "./palette.js";
import { store } from "./store.js";

const TYPES = [
	"boolean", "number", "string", "table", "function",
	"Instance", "Vector3", "Vector2", "CFrame", "Color3", "UDim2", "any",
];

export interface VariablesPanelProps {
	script: NodeScript;
	selection: ReadonlySet<string>;
	/** Asks for confirmation; resolves true when the developer agrees. */
	confirm: (title: string, message: string, confirmLabel: string) => Promise<boolean>;
}

export function VariablesPanel({ script, confirm }: VariablesPanelProps) {
	const [open, setOpen] = useState<string | null>(null);

	return (
		<div className="variables">
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
						variable={variable}
						script={script}
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
						<select
							className="tb"
							value={variable.type}
							onChange={(e) =>
								store.edit((s) => updateVariable(s, variable.id, { type: e.target.value }))
							}
						>
							{TYPES.map((t) => (
								<option key={t}>{t}</option>
							))}
						</select>
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
