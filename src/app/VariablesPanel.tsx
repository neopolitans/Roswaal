/**
 * The open graph's variable list.
 *
 * Sits under the project tree because that is where you look for "what is in
 * this script". Dragging a variable onto the canvas spawns a Get node, or a
 * Set node with Ctrl held — the shortest path from seeing a variable to using
 * one.
 */

import { type DragEvent, type ReactNode, useMemo, useState } from "react";
import {
	type GraphId,
	hoistedFunctions,
	visibleFrom,
	withFunctionGraphs,
} from "../core/functionGraph.js";
import { instanceSpecifier } from "../core/modules.js";
import { namedResultRef } from "../core/namedResults.js";
import { FUNCTION_NODES } from "../core/nodes/flow.js";
import type { Registry } from "../core/nodes/index.js";
import { isConstLocal } from "../core/nodes/variables.js";
import { EMPTY_SERVICES, EMPTY_VARIABLES, emptyModules } from "../core/panelHints.js";
import { isService, ROBLOX_SERVICES } from "../core/roblox.js";
import type {
	GraphNode,
	Literal,
	NodeScript,
	ScriptModule,
	ScriptVariable,
} from "../core/schema.js";
import { SPECIFIER_HINTS } from "../core/schema.js";
import { frameNode } from "./CanvasStrip.jsx";
import { PanelHead } from "./Cards.jsx";
import { cx } from "./cx.js";
import {
	addModule,
	addService,
	addVariable,
	defaultLiteralFor,
	deleteModule,
	deleteSelection,
	deleteService,
	deleteVariable,
	localRefFor,
	moduleUsageCount,
	updateModule,
	updateVariable,
	variableUsageCount,
} from "./edits.js";
import { configText } from "./nodeConfig.js";
import { PROPERTY_DRAG, type PropertyDrag } from "./PlaceBrowser.jsx";
import { pinColor } from "./palette.js";
import { specifierSuggestions, useProjectLuaurc } from "./projectAliases.js";
import { requiredTypes, useProjectTypes } from "./projectTypes.js";
import { store, useEditor } from "./store.js";
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
	/** For deleting a local or a function, which is deleting its node. */
	registry: Registry;
	/** Asks for confirmation; resolves true when the developer agrees. */
	confirm: (title: string, message: string, confirmLabel: string) => Promise<boolean>;
}

export function VariablesPanel({ script, graph, registry, confirm, locked }: VariablesPanelProps) {
	// Deletes the node that declares a local or a function, as the canvas would.
	//
	// The nodes that refer to it stay, as a variable's Get and Set do, and
	// report an error until they are repointed or removed. A function's own
	// graph goes with it, which the canvas also does -- so the question says how
	// much of each.
	const deleteDeclaration = async (node: GraphNode, kind: "local" | "function") => {
		const name =
			kind === "local" ? localRefFor(node).name || "local" : configText(node, "name") || "function";
		const key = kind === "local" ? "local" : "function";
		const uses = script.nodes.filter(
			(n) => n.id !== node.id && configText(n, key) === node.id,
		).length;
		const inside =
			kind === "function" ? withFunctionGraphs(script, new Set([node.id])).size - 1 : 0;
		const parts = [`Delete "${name}"?`];
		if (inside > 0)
			parts.push(
				`${inside} node${inside === 1 ? " is" : "s are"} inside it, and go${inside === 1 ? "es" : ""} with it.`,
			);
		if (uses > 0) {
			parts.push(
				`${uses} node${uses === 1 ? "" : "s"} still reference it, and will report an error until repointed or removed.`,
			);
		}
		const title = kind === "local" ? "Delete local" : "Delete function";
		if (await confirm(title, parts.join(" "), "Delete")) {
			store.edit((s) => deleteSelection(s, new Set([node.id]), registry));
		}
	};

	const [open, setOpen] = useState<string | null>(null);
	const [addingService, setAddingService] = useState(false);
	const services = script.services ?? [];
	// Double-click or Ctrl+click a local: its node, brought into view.
	const goTo = (id: string) => {
		store.reveal(id);
		requestAnimationFrame(() => frameNode(id, registry));
	};
	// Both kinds, because a graph's functions are its functions: which one is
	// hoisted is a property of each, shown on the row rather than sorted on.
	// The list is not scoped: it is how you move between a file's functions, and
	// a function you cannot see from here is still one you may want to open.
	const functions = script.nodes.filter((n) => FUNCTION_NODES.has(n.def));
	const hoisted = hoistedFunctions(script);
	const locals = script.nodes.filter(
		(n) => n.def === "local.declare" && visibleFrom(n, graph, hoisted),
	);
	// Steps whose result is named: locals too, read by name the same way.
	const namedResults = script.nodes.flatMap((n) => {
		if (n.def === "local.declare" || !visibleFrom(n, graph, hoisted)) return [];
		const ref = namedResultRef(n, registry);
		return ref ? [{ node: n, ref }] : [];
	});
	const declaredTypes = script.nodes.filter(
		(n) =>
			(n.def === "type.declareTop" || n.def === "type.declareHere") &&
			(configText(n, "name") ?? "").trim() !== "" &&
			// A type declared inside a function is scoped to it exactly as a
			// local is; a hoisted one is written above everything and always is.
			(n.def === "type.declareTop" || visibleFrom(n, graph, hoisted)),
	);
	const required = requiredTypes(script, useProjectTypes());

	return (
		<div className={cx("variables", locked && "editing-locked")}>
			<PanelHead>
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
			</PanelHead>

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
					<p className="hint" title={EMPTY_VARIABLES.more}>
						{EMPTY_VARIABLES.text}
					</p>
				)}

				{/* The services this script fetches at the top, in this order.
				    
				    Roblox's, so shown on a Roblox graph -- and on a Lune one only
				    while it still has some, so they can be seen and removed. A
				    service dragged in from the DataModel browser is declared. */}
				{(script.target === "roblox" || services.length > 0) && (
					<DataModelDrop
						accepts={(drag) => drag.path.length === 1 && isService(drag.path[0] ?? "")}
						onDrop={(drag) => store.edit((s) => addService(s, drag.path[0] ?? ""))}
					>
						<h3 className="variables-sub">
							<span>Services</span>
							<button
								className="tb"
								title="Declare a service"
								onClick={() => setAddingService(true)}
							>
								Add
							</button>
						</h3>
						{services.map((name) => (
							<ServiceRow
								key={name}
								name={name}
								onDelete={() => store.edit((s) => deleteService(s, name))}
							/>
						))}
						{addingService && (
							<ServicePicker
								declared={services}
								onDone={(name) => {
									setAddingService(false);
									if (name) store.edit((s) => addService(s, name));
								}}
							/>
						)}
						{services.length === 0 && !addingService && (
							<p className="hint" title={EMPTY_SERVICES.more}>
								{EMPTY_SERVICES.text}
							</p>
						)}
					</DataModelDrop>
				)}

				{/* What this script requires.
				    
				    Here rather than in a panel of its own because it answers the
				    same question the variables do -- what does this script have
				    to hand -- and because a require is a dependency, which is
				    exactly the kind of thing that should be somewhere you can see
				    it rather than somewhere you have to go looking. */}
				<DataModelDrop
					accepts={(drag) => drag.className === "ModuleScript"}
					onDrop={(drag) =>
						store.edit(
							(s) =>
								addModule(s, drag.path.at(-1) ?? "module", instanceSpecifier(drag.path)).script,
						)
					}
				>
					<h3 className="variables-sub">
						<span>Modules</span>
						<button
							className="tb"
							title="Require a module"
							onClick={() =>
								store.edit((s) => {
									const { script: next, id } = addModule(s);
									queueMicrotask(() => setOpen(id));
									return next;
								})
							}
						>
							Add
						</button>
					</h3>
					{(script.modules ?? []).map((module) => (
						<ModuleRow
							key={module.id}
							script={script}
							module={module}
							confirm={confirm}
							expanded={open === module.id}
							onToggle={() => setOpen((id) => (id === module.id ? null : module.id))}
						/>
					))}
					{(script.modules ?? []).length === 0 && (
						<p className="hint" title={emptyModules(script.target).more}>
							{emptyModules(script.target).text}
						</p>
					)}
				</DataModelDrop>

				{/* The graph's Declare Locals, so one can be dragged out as a Get
				    Local instead of wired from where it was made. */}
				{(locals.length > 0 || namedResults.length > 0) && (
					<>
						<h3 className="variables-sub">Locals</h3>
						{locals.map((node) => (
							<LocalRow
								key={node.id}
								node={node}
								onDelete={() => deleteDeclaration(node, "local")}
								onGoTo={() => goTo(node.id)}
							/>
						))}
						{namedResults.map(({ node, ref }) => (
							<NamedResultRow
								key={node.id}
								node={node}
								name={ref.name}
								type={ref.type}
								onGoTo={() => goTo(node.id)}
							/>
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
							<FunctionRow
								key={node.id}
								node={node}
								onDelete={() => deleteDeclaration(node, "function")}
							/>
						))}
					</>
				)}

				{/* The types this graph declares, and the ones its requires bring
				    in. Dragged out, a type becomes a local of that type. */}
				{(declaredTypes.length > 0 || required.length > 0) && (
					<>
						<h3 className="variables-sub">Types</h3>
						{declaredTypes.map((node) => (
							<TypeRow
								key={node.id}
								// Only types with a name are listed; see `declaredTypes`.
								type={(configText(node, "name") ?? "").trim()}
								detail={node.config?.export === false ? "type" : "export"}
								onClick={() => store.reveal(node.id)}
							/>
						))}
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
	type,
	detail,
	title,
	onClick,
}: {
	type: string;
	detail: string;
	title?: string;
	onClick?: () => void;
}) {
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

/**
 * One module the script requires: the name it binds, and where it comes from.
 *
 * Dragged onto the canvas it becomes a Get Module pill, exactly as a variable
 * becomes a Get. The specifier is shown on the collapsed row because it is the
 * part you scan for — two modules called `util` are told apart by where they
 * came from, not by their names.
 */
function ModuleRow({
	module,
	script,
	expanded,
	onToggle,
	confirm,
}: {
	module: ScriptModule;
	script: NodeScript;
	expanded: boolean;
	onToggle: () => void;
	confirm: VariablesPanelProps["confirm"];
}) {
	const uses = moduleUsageCount(script, module.id);

	function onDragStart(e: DragEvent) {
		e.dataTransfer.setData("application/x-roswaal-module", JSON.stringify({ id: module.id }));
		e.dataTransfer.effectAllowed = "copy";
	}

	return (
		<div className={cx("variable", expanded && "expanded")}>
			<div
				className="variable-head"
				draggable
				title="Drag onto the canvas for a Get Module."
				onDragStart={onDragStart}
				onClick={onToggle}
			>
				<span className="swatch module" />
				<span className="name">{module.name}</span>
				<span className="type" title={module.specifier || undefined}>
					{module.specifier || "not set"}
				</span>
			</div>

			{expanded && (
				<div className="variable-body">
					<label className="field">
						<span>Name</span>
						<input
							className="tb"
							value={module.name}
							title="The local this binds to. Yours to choose: two modules called the same thing need telling apart."
							onChange={(e) =>
								store.edit((s) => updateModule(s, module.id, { name: e.target.value }))
							}
						/>
					</label>
					<label className="field">
						<span>Module</span>
						{/* A suggestion, not a choice: the set of things a require can
						    name is still moving, so everything known is a keystroke
						    away and anything else is simply typed. */}
						<input
							className="tb"
							value={module.specifier}
							placeholder={
								script.target === "roblox" ? "ReplicatedStorage.Shared.Greeter" : "@lune/fs"
							}
							list="roswaal-specifier-hints"
							title={
								"What goes inside require(...): @ for an alias, ./ or ../ for a path" +
								(script.target === "roblox"
									? ", or where the ModuleScript sits, from a service or script: ReplicatedStorage.Shared.Greeter."
									: ".")
							}
							onChange={(e) =>
								store.edit((s) => updateModule(s, module.id, { specifier: e.target.value }))
							}
						/>
					</label>
					{/* What to pull off it into locals of their own. Lune's own
					    idiom, and what lets the datatype nodes compile unchanged
					    there: bind `Vector3` and `Vector3.new(...)` just works. */}
					<label className="field">
						<span>Members</span>
						<input
							className="tb"
							value={(module.members ?? []).join(", ")}
							placeholder="Vector3, CFrame"
							title="Names bound beneath the require, comma separated. `local Vector3 = roblox.Vector3`."
							onChange={(e) =>
								store.edit((s) =>
									updateModule(s, module.id, {
										members: e.target.value
											.split(",")
											.map((part) => part.trim())
											.filter((part) => part !== ""),
									}),
								)
							}
						/>
					</label>
					<div className="variable-actions">
						<span className="hint">
							{uses === 0 ? "Not used yet" : `${uses} node${uses === 1 ? "" : "s"}`}
						</span>
						<button
							className="tb"
							onClick={async () => {
								// Same bargain as a variable: the pills stay as errors rather
								// than disappearing, so say what that will cost first.
								const warning =
									uses === 0
										? `Delete "${module.name}"?`
										: `Delete "${module.name}"? ${uses} node${uses === 1 ? "" : "s"} still ` +
											`reference it, and will report an error until repointed or removed.`;
								if (await confirm("Delete module", warning, "Delete")) {
									store.edit((s) => deleteModule(s, module.id));
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

/**
 * A section that takes a row dragged out of the DataModel browser, when it is
 * the kind of thing the section lists: a service for Services, a ModuleScript
 * for Modules. Anything else dropped on it is left alone.
 */
function DataModelDrop({
	accepts,
	onDrop,
	children,
}: {
	accepts: (drag: PropertyDrag) => boolean;
	onDrop: (drag: PropertyDrag) => void;
	children: ReactNode;
}) {
	const [over, setOver] = useState(false);
	return (
		<div
			className={cx("variables-drop", over && "over")}
			onDragOver={(e) => {
				// Only the types are readable until the drop, so any DataModel row
				// is let in here and `accepts` decides when it lands.
				if (!e.dataTransfer.types.includes(PROPERTY_DRAG)) return;
				e.preventDefault();
				e.dataTransfer.dropEffect = "copy";
				setOver(true);
			}}
			onDragLeave={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
			}}
			onDrop={(e) => {
				setOver(false);
				const raw = e.dataTransfer.getData(PROPERTY_DRAG);
				if (!raw) return;
				e.preventDefault();
				let drag: PropertyDrag;
				try {
					drag = JSON.parse(raw) as PropertyDrag;
				} catch {
					return;
				}
				if (!Array.isArray(drag.path) || drag.property || drag.attribute) return;
				if (accepts(drag)) onDrop(drag);
			}}
		>
			{children}
		</div>
	);
}

/** One declared service: drag it for a Get Service, or remove it. */
function ServiceRow({ name, onDelete }: { name: string; onDelete: () => void }) {
	function onDragStart(e: DragEvent) {
		e.dataTransfer.setData("application/x-roswaal-service", JSON.stringify({ service: name }));
		e.dataTransfer.effectAllowed = "copy";
	}

	return (
		<div className="variable">
			<div
				className="variable-head"
				draggable
				title="Drag onto the canvas for a Get Service. It reads the local declared here."
				onDragStart={onDragStart}
			>
				<span className="swatch" style={{ background: pinColor(name, "data") }} />
				<span className="name">{name}</span>
				<span className="type">{isService(name) ? "service" : "not a listed service"}</span>
				<RowDelete name={name} onDelete={onDelete} />
			</div>
		</div>
	);
}

/**
 * Where a service is typed or picked when declaring one. Enter or leaving the
 * field declares it; Escape does not.
 */
function ServicePicker({
	declared,
	onDone,
}: {
	declared: readonly string[];
	onDone: (name: string | null) => void;
}) {
	const [value, setValue] = useState("");
	const offered = ROBLOX_SERVICES.filter((service) => !declared.includes(service));
	return (
		<div className="variable-add">
			<input
				className="tb"
				// biome-ignore lint/a11y/noAutofocus: opened by Add, to type into straight away.
				autoFocus
				value={value}
				placeholder="ReplicatedStorage"
				list="roswaal-service-hints"
				aria-label="Service to declare"
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") onDone(value.trim() || null);
					else if (e.key === "Escape") onDone(null);
				}}
				onBlur={() => onDone(value.trim() || null)}
			/>
			<datalist id="roswaal-service-hints">
				{offered.map((service) => (
					<option key={service} value={service} />
				))}
			</datalist>
		</div>
	);
}

/**
 * Delete, on a row that does not open.
 *
 * A variable or a module expands, and its Delete is at the foot of what opens.
 * A local's row selects its node and a function's opens its graph, so theirs
 * sits on the row itself -- always shown rather than on hover, which a finger
 * does not have.
 */
function RowDelete({ name, onDelete }: { name: string; onDelete: () => void }) {
	return (
		<button
			className="tb variable-delete"
			title={`Delete "${name}"`}
			aria-label={`Delete "${name}"`}
			draggable={false}
			onClick={(e) => {
				// The row's own click selects or opens; this is not that.
				e.stopPropagation();
				onDelete();
			}}
		>
			×
		</button>
	);
}

/** One Declare Local: drag it for a Get Local, click it to find the node. */
function LocalRow({
	node,
	onDelete,
	onGoTo,
}: {
	node: GraphNode;
	onDelete: () => void;
	onGoTo: () => void;
}) {
	const ref = localRefFor(node);
	const declared = configText(node, "type")?.trim();

	function onDragStart(e: DragEvent) {
		e.dataTransfer.setData("application/x-roswaal-local", JSON.stringify({ id: node.id }));
		e.dataTransfer.effectAllowed = "copy";
	}

	return (
		<div className="variable">
			<div
				className="variable-head"
				draggable
				title="Drag onto the canvas for a Get Local. Click to select its Declare Local; double-click or Ctrl+click to go to it."
				onDragStart={onDragStart}
				onClick={(e) => (e.ctrlKey || e.metaKey ? onGoTo() : store.reveal(node.id))}
				onDoubleClick={onGoTo}
			>
				<span className="swatch" style={{ background: pinColor(ref.type, "data") }} />
				<span className="name">{ref.name}</span>
				{/* The list is where you look to see what a graph holds, so a promise
				    one of them has made belongs here rather than only in the
				    Inspector of the node that made it. */}
				{isConstLocal(node.config) && <span className="badge const">const</span>}
				<span className="type">{declared || "any"}</span>
				<RowDelete name={ref.name || "local"} onDelete={onDelete} />
			</div>
		</div>
	);
}

/**
 * One step's named result: drag it for a Get Local, click it to find the step.
 *
 * No delete: the row is a call that does something, and removing its local is
 * clearing its Result name, in the Inspector where the name was typed.
 */
function NamedResultRow({
	node,
	name,
	type,
	onGoTo,
}: {
	node: GraphNode;
	name: string;
	type: string;
	onGoTo: () => void;
}) {
	function onDragStart(e: DragEvent) {
		e.dataTransfer.setData("application/x-roswaal-local", JSON.stringify({ id: node.id }));
		e.dataTransfer.effectAllowed = "copy";
	}
	return (
		<div className="variable">
			<div
				className="variable-head"
				draggable
				title="A step's named result. Drag onto the canvas for a Get Local. Click to select the step; double-click or Ctrl+click to go to it."
				onDragStart={onDragStart}
				onClick={(e) => (e.ctrlKey || e.metaKey ? onGoTo() : store.reveal(node.id))}
				onDoubleClick={onGoTo}
			>
				<span className="swatch" style={{ background: pinColor(type, "data") }} />
				<span className="name">{name}</span>
				<span className="badge-result">result</span>
				<span className="type">{type}</span>
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
function FunctionRow({ node, onDelete }: { node: GraphNode; onDelete: () => void }) {
	const name = configText(node, "name") || "function";

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
				<span className="name">{name}</span>
				<span className="type">{node.def === "function.entry" ? "hoisted" : "here"}</span>
				<RowDelete name={name} onDelete={onDelete} />
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
		e.dataTransfer.setData("application/x-roswaal-variable", JSON.stringify({ id: variable.id }));
		e.dataTransfer.effectAllowed = "copy";
	}

	return (
		<div className={cx("variable", expanded && "expanded")}>
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
							onChange={(type) => store.edit((s) => updateVariable(s, variable.id, { type }))}
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
								onClick={() => store.edit((s) => updateVariable(s, variable.id, { const: true }))}
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
	type,
	value,
	onChange,
}: {
	type: string;
	value: Literal;
	onChange: (next: Literal) => void;
}) {
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

/**
 * The specifiers a require could name here, as a `<datalist>`.
 *
 * One element, shared by every specifier field on screen through a fixed id —
 * the browser matches a `list` attribute to it wherever it sits, and rendering
 * one per row would put sixty options in the DOM per module.
 *
 * Which aliases are offered depends on **where this graph is**, because a
 * `.luaurc` in `src/ui` defines aliases for `src/ui` and below. It asks the
 * same function the compiler resolves by, so the field cannot offer a name the
 * compiler would then refuse.
 */
export function SpecifierHints() {
	const editor = useEditor();
	const files = useProjectLuaurc();
	const script = editor.script;
	const suggestions = useMemo(
		() => (script ? specifierSuggestions(files, editor.path ?? "", script.target) : []),
		[files, editor.path, script],
	);

	return (
		<datalist id={SPECIFIER_HINTS}>
			{suggestions.map((one) => (
				<option key={one.value} value={one.value} label={one.what} />
			))}
		</datalist>
	);
}
