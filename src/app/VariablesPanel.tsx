/**
 * The open graph's variable list.
 *
 * Sits under the project tree because that is where you look for "what is in
 * this script". Dragging a variable onto the canvas spawns a Get node, or a
 * Set node with Ctrl held — the shortest path from seeing a variable to using
 * one.
 */

import {
	type DragEvent,
	Fragment,
	type ReactNode,
	useDeferredValue,
	useMemo,
	useState,
} from "react";
import { headersByNode } from "../core/comments.js";
import { compile } from "../core/compiler/index.js";
import {
	checkMove,
	type MoveCheck,
	type ReorderKind,
	renameGroup,
	reorder,
	setGroup,
	type Where,
} from "../core/declarationOrder.js";
import {
	type GraphId,
	hoistedFunctions,
	visibleFrom,
	withFunctionGraphs,
} from "../core/functionGraph.js";
import { diffLines, type ShownLine, shownLines } from "../core/lineDiff.js";
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
import { type DeclarationKind, type GlobalName, scriptOrder } from "../core/scriptOrder.js";
import { typeFamily } from "../core/typeFamily.js";
import {
	codeMentions,
	declarationDetail,
	functionSignature,
	localTypeOf,
	moduleTableVariable,
	servicesAndModules,
	useCounts,
	usesOf,
} from "../core/variablesOutline.js";
import { frameNode } from "./CanvasStrip.jsx";
import { PanelHead } from "./Cards.jsx";
import { cx } from "./cx.js";
import { ExplorerIcon } from "./ExplorerIcon.jsx";
import {
	addModule,
	addService,
	addVariable,
	declareModule,
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
import { Icon } from "./icons.jsx";
import { MenuButton } from "./Menu.jsx";
import { configText } from "./nodeConfig.js";
import { pinColor } from "./palette.js";
import { specifierSuggestions, useProjectLuaurc } from "./projectAliases.js";
import { requiredTypes, useProjectTypes } from "./projectTypes.js";
import { PROPERTY_DRAG, type PropertyDrag } from "./propertyDrag.js";
import { store, useEditor } from "./store.js";
import { TypePicker } from "./TypePicker.jsx";
import {
	type MakeLocal,
	makeLocalPlan,
	moveToTop,
	type TidyRow,
	tidyAll,
	tidyPlan,
} from "./tidy.js";
import { classDetail, ValuePicker } from "./ValuePicker.jsx";

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
	/** Asks before a move that changes when something runs, showing the Luau's diff. */
	confirmMove?: (title: string, message: string, diff: ShownLine[]) => Promise<boolean>;
	/** Asks before a tidy, listing what moves and what stays, with the Luau's diff. */
	confirmChange?: (ask: {
		title: string;
		message: string;
		points?: string[];
		diff: ShownLine[];
		confirmLabel: string;
	}) => Promise<boolean>;
	/**
	 * A file from Graphs or Output dropped on Modules. Where it
	 * lands in the DataModel is the project's to say, so the caller resolves it.
	 */
	onModuleFile?: (path: string) => void;
}

export function VariablesPanel({
	script,
	graph,
	registry,
	confirm,
	locked,
	onModuleFile,
	confirmMove,
	confirmChange,
}: VariablesPanelProps) {
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
	const outline = servicesAndModules(script);
	const counts = useCounts(script);
	const tableId = moduleTableVariable(script);
	const table = script.variables.find((v) => v.id === tableId);
	const variables = script.variables.filter((v) => v.id !== tableId);
	const groupNames = [...new Set(variables.flatMap((v) => (v.group ? [v.group] : [])))];
	const [filter, setFilter] = useState("");
	const deferredScript = useDeferredValue(script);
	const [view, setView] = useState<PanelView | undefined>(readView);
	const [chips, setChips] = useState<ReadonlySet<DeclarationKind>>(new Set());
	const [headingOrder, setHeadingOrder] = useState<SectionId[]>(readHeadingOrder);
	const [movingHeading, setMovingHeading] = useState<SectionId | null>(null);
	const moveHeading = (target: SectionId) => {
		if (!movingHeading || movingHeading === target) return;
		const next = headingOrder.filter((id) => id !== movingHeading);
		next.splice(next.indexOf(target), 0, movingHeading);
		setHeadingOrder(next);
		saveHeadingOrder(next);
		setMovingHeading(null);
	};
	const headingDrag: HeadingDrag = {
		moving: movingHeading,
		onStart: setMovingHeading,
		onEnd: () => setMovingHeading(null),
		onDrop: moveHeading,
	};
	// A row being dragged to a new place, and where it would go now.
	const [moving, setMoving] = useState<{ kind: ReorderKind; id: string } | null>(null);
	const [over, setOver] = useState<{ id: string; where: Where; check: MoveCheck } | null>(null);
	const drop = async () => {
		const move = moving;
		const at = over;
		setMoving(null);
		setOver(null);
		if (!move || !at || !at.check.ok) return;
		const next = reorder(script, move.kind, move.id, at.id, at.where);
		if (at.check.asks) {
			const before = compile(script, registry).code;
			const after = compile(next, registry).code;
			const ok = confirmMove
				? await confirmMove("Move it?", at.check.asks, shownLines(diffLines(before, after)))
				: await confirm("Move it?", at.check.asks, "Move");
			if (!ok) return;
		}
		store.edit((s) => reorder(s, move.kind, move.id, at.id, at.where));
	};
	const slot = (kind: ReorderKind, id: string, row: ReactNode) => (
		<ReorderSlot
			key={`${kind}:${id}`}
			kind={kind}
			id={id}
			moving={moving}
			over={over?.id === id ? over : null}
			needed={over?.check.needs?.includes(id) === true}
			onStart={() => setMoving({ kind, id })}
			onEnd={() => {
				setMoving(null);
				setOver(null);
			}}
			onOver={(where) =>
				moving &&
				setOver({ id, where, check: checkMove(script, moving.kind, moving.id, id, where) })
			}
			onDrop={() => void drop()}
		>
			{row}
		</ReorderSlot>
	);
	const needle = filter.trim().toLowerCase();
	const shows = (name: string) => needle === "" || name.toLowerCase().includes(needle);
	const showsModule = (m: ScriptModule) => shows(m.name) || shows(m.specifier);
	const rowCount =
		outline.services.length +
		(script.modules ?? []).length +
		script.variables.length +
		declaredTypes.length +
		required.length +
		locals.length +
		namedResults.length +
		functions.length;
	// Selects what uses a row, and brings the first into view.
	const findUses = (ids: string[]) => {
		if (ids.length === 0) return;
		store.select(ids);
		requestAnimationFrame(() => frameNode(ids[0], registry));
	};
	const moduleRow = (module: ScriptModule, nested: boolean) =>
		showsModule(module) &&
		slot(
			"module",
			module.id,
			<ModuleRow
				key={module.id}
				script={script}
				module={module}
				confirm={confirm}
				nested={nested}
				uses={(counts.get(module.id) ?? 0) + codeMentions(script, module.name).length}
				onFind={() =>
					findUses([...usesOf(script, module.id), ...codeMentions(script, module.name)])
				}
				expanded={open === module.id}
				onToggle={() => setOpen((id) => (id === module.id ? null : module.id))}
			/>,
		);
	const servicesShown = script.target === "roblox" || outline.services.length > 0;
	// Locals by where they live: the top graph's are the script's, visible to
	// the flow after them; a function's own are its alone.
	const inFunction = graph !== null;
	const localScopes = [
		{
			title: "Script locals",
			locals: locals.filter((n) => n.graph === undefined),
			results: namedResults.filter(({ node }) => node.graph === undefined),
		},
		...(inFunction
			? [
					{
						title: "Function locals",
						locals: locals.filter((n) => n.graph !== undefined),
						results: namedResults.filter(({ node }) => node.graph !== undefined),
					},
				]
			: []),
	];

	// What the flow declares in the order the file does, and the globals an
	// older file sets: read from the compiled Luau, on the top graph.
	const order = useMemo(() => {
		if (inFunction) return { flow: [], globals: [], code: "" };
		const result = compile(deferredScript, registry);
		const read = scriptOrder(result.code, result.sourceMap);
		// A type declared at the top is a node too, but not the flow's.
		const top = new Set(
			deferredScript.nodes.filter((n) => n.def === "type.declareTop").map((n) => n.id),
		);
		return { ...read, flow: read.flow.filter((d) => !top.has(d.node)), code: result.code };
	}, [deferredScript, registry, inFunction]);
	// What can move to the top, and why the rest stays (Tidy, Move to top).
	const plan = useMemo(
		() => new Map(tidyPlan(deferredScript, order.flow, order.code).map((r) => [r.node, r])),
		[deferredScript, order],
	);
	const movable = [...plan.values()].filter((r) => r.can).length;
	// The canvas comment each declaration sits in: its group, as the Luau heads it.
	const groups = useMemo(() => headersByNode(deferredScript, registry), [deferredScript, registry]);

	// Shows the Luau's diff and asks; true when the developer agrees.
	const askChange = async (
		title: string,
		message: string,
		next: NodeScript,
		confirmLabel: string,
		points?: string[],
	) => {
		// Without the header's hashes, which change with any edit.
		const luau = (s: NodeScript) =>
			compile(s, registry)
				.code.split("\n")
				.filter((l) => !l.startsWith("-- roswaal-"))
				.join("\n");
		const diff = shownLines(diffLines(luau(script), luau(next)));
		return confirmChange
			? confirmChange({ title, message, points, diff, confirmLabel })
			: confirm(title, message, confirmLabel);
	};
	const moveRow = async (row: TidyRow) => {
		const next = moveToTop(script, row.node);
		const ok = await askChange(
			`Move ${row.name} to the top?`,
			`${row.why}, so it can be declared at the top of the file, before the flow runs.`,
			next,
			"Move",
		);
		if (ok) store.edit((s) => moveToTop(s, row.node));
	};
	const tidyDeclarations = async () => {
		const out = compile(script, registry);
		const top = new Set(script.nodes.filter((n) => n.def === "type.declareTop").map((n) => n.id));
		const now = scriptOrder(out.code, out.sourceMap).flow.filter((d) => !top.has(d.node));
		const rows = tidyPlan(script, now, out.code);
		const can = rows.filter((r) => r.can);
		if (can.length === 0) return;
		const ok = await askChange(
			"Tidy declarations",
			`${can.length} of ${rows.length} can move to the top of the file. Nothing else changes.`,
			tidyAll(script, rows),
			`Move ${can.length}`,
			[
				...can.map((r) => `Moves: ${r.name}. ${r.why}.`),
				...rows.filter((r) => !r.can).map((r) => `Stays: ${r.name}. ${r.why}.`),
			],
		);
		if (ok) store.edit((s) => tidyAll(s, rows));
	};
	const makeLocal = async (g: GlobalName) => {
		const m = makeLocalPlan(script, order.code, g);
		if (!m.ok || !m.run) return;
		const run = m.run;
		const ok = await askChange(
			`Make ${g.name} local?`,
			"It becomes local where the file first sets it. Another script that reads it as a global will no longer see it.",
			run(script),
			"Make local",
		);
		if (ok) store.edit(run);
	};
	const fromCode = order.flow.some(
		(d) => script.nodes.find((n) => n.id === d.node)?.def === "code.custom",
	);
	const showOrder =
		!inFunction &&
		(view === "order" || (view === undefined && (fromCode || order.globals.length > 0)));
	const shownFlow = order.flow.filter(
		(d) => (chips.size === 0 || chips.has(d.kind)) && shows(d.name),
	);

	const sections: Record<SectionId, ReactNode> = {
		services: (
			<>
				{/* Services and the modules required through them, as the file
						    declares them: a require needs its service's local above it.
						    A service the graph only fetches where it is used is listed
						    too, fainter, with Declare; a module through script sits
						    under a script row; the rest after. */}
				<DataModelDrop
					accepts={(drag) =>
						(servicesShown && drag.path.length === 1 && isService(drag.path[0] ?? "")) ||
						drag.className === "ModuleScript"
					}
					onFile={script.target === "roblox" ? onModuleFile : undefined}
					onDrop={(drag) =>
						drag.className === "ModuleScript"
							? store.edit(
									(s) =>
										declareModule(s, drag.path.at(-1) ?? "module", instanceSpecifier(drag.path))
											.script,
								)
							: store.edit((s) => addService(s, drag.path[0] ?? ""))
					}
				>
					<Heading
						section="services"
						drag={headingDrag}
						title={servicesShown ? "Services and modules" : "Modules"}
						count={(servicesShown ? outline.services.length : 0) + (script.modules ?? []).length}
					>
						{servicesShown && (
							<button
								className="tb"
								title="Declare a service"
								onClick={() => setAddingService(true)}
							>
								Service
							</button>
						)}
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
							Module
						</button>
					</Heading>
					{servicesShown &&
						outline.services.map(
							(group) =>
								(shows(group.name) || group.modules.some(showsModule)) && (
									<div key={group.name} className="variable-group">
										{(group.declared
											? (row: ReactNode) => slot("service", group.name, row)
											: (row: ReactNode) => row)(
											<ServiceRow
												name={group.name}
												local={script.serviceNames?.[group.name]}
												declared={group.declared}
												uses={
													group.uses +
													codeMentions(script, script.serviceNames?.[group.name] ?? group.name)
														.length
												}
												onFind={() =>
													findUses([
														...usesOf(script, group.name, true),
														...codeMentions(
															script,
															script.serviceNames?.[group.name] ?? group.name,
														),
													])
												}
												onDeclare={() => store.edit((s) => addService(s, group.name))}
												onDelete={() => store.edit((s) => deleteService(s, group.name))}
											/>,
										)}
										{group.modules.map((module) => moduleRow(module, true))}
									</div>
								),
						)}
					{outline.throughScript.length > 0 && (
						<div className="variable-group">
							<div className="variable">
								<div
									className="variable-head script-row"
									title="Required through script: where this graph's script sits."
								>
									<ExplorerIcon className="Script" service={false} open={false} />
									<span className="name">script</span>
								</div>
							</div>
							{outline.throughScript.map((module) => moduleRow(module, true))}
						</div>
					)}
					{outline.others.map((module) => moduleRow(module, false))}
					{addingService && (
						<ServicePicker
							declared={script.services ?? []}
							onDone={(name) => {
								setAddingService(false);
								if (name) store.edit((s) => addService(s, name));
							}}
						/>
					)}
					{outline.services.length === 0 &&
						(script.modules ?? []).length === 0 &&
						!addingService && (
							<p
								className="hint"
								title={servicesShown ? EMPTY_SERVICES.more : emptyModules(script.target).more}
							>
								{servicesShown ? EMPTY_SERVICES.text : emptyModules(script.target).text}
							</p>
						)}
				</DataModelDrop>
			</>
		),
		module: (
			<>
				{/* The table a ModuleScript returns: what requiring it gives. */}
				{table && shows(table.name) && (
					<>
						<Heading section="module" drag={headingDrag} title="Module" count={1} />
						<VariableRow
							key={table.id}
							script={script}
							variable={table}
							confirm={confirm}
							exported
							uses={(counts.get(table.id) ?? 0) + codeMentions(script, table.name).length}
							onFind={() =>
								findUses([...usesOf(script, table.id), ...codeMentions(script, table.name)])
							}
							expanded={open === table.id}
							onToggle={() => setOpen((id) => (id === table.id ? null : table.id))}
						/>
					</>
				)}
			</>
		),
		types: showOrder ? null : (
			<>
				{/* The types this graph declares, and the ones its requires bring
						    in. Dragged out, a type becomes a local of that type. */}
				{(declaredTypes.length > 0 || required.length > 0) && (
					<>
						<Heading
							section="types"
							drag={headingDrag}
							title="Types"
							count={declaredTypes.length + required.length}
						/>
						{declaredTypes.map((node) => {
							const name = (configText(node, "name") ?? "").trim();
							return (
								shows(name) && (
									<TypeRow
										key={node.id}
										// Only types with a name are listed; see `declaredTypes`.
										type={name}
										detail={node.config?.export === false ? "type" : "export"}
										onClick={() => store.reveal(node.id)}
									/>
								)
							);
						})}
						{required.map(
							(entry) =>
								shows(entry.type) && (
									<TypeRow
										key={entry.type}
										type={entry.type}
										detail="required"
										title={`Exported by ${entry.graph}`}
									/>
								),
						)}
					</>
				)}
			</>
		),
		variables: (
			<>
				<Heading
					section="variables"
					drag={headingDrag}
					title="Variables"
					count={variables.length}
				/>
				{/* Runs of a group of the author's own sit under the group's
				    header, which is the comment header the Luau carries. */}
				{groupRuns(variables).map((run) => {
					const rows = run.items.map(
						(variable) =>
							shows(variable.name) &&
							slot(
								"variable",
								variable.id,
								<VariableRow
									key={variable.id}
									script={script}
									variable={variable}
									confirm={confirm}
									groups={groupNames}
									uses={(counts.get(variable.id) ?? 0) + codeMentions(script, variable.name).length}
									onFind={() =>
										findUses([
											...usesOf(script, variable.id),
											...codeMentions(script, variable.name),
										])
									}
									expanded={open === variable.id}
									onToggle={() => setOpen((id) => (id === variable.id ? null : variable.id))}
								/>,
							),
					);
					return run.group ? (
						<div key={`group:${run.group}`} className="variable-group-run">
							<GroupHeader
								name={run.group}
								count={run.items.length}
								onRename={(to) => store.edit((s) => renameGroup(s, run.group ?? "", to))}
								onDissolve={() => store.edit((s) => renameGroup(s, run.group ?? "", ""))}
							/>
							{rows}
						</div>
					) : (
						<Fragment key={`run:${run.items[0]?.id}`}>{rows}</Fragment>
					);
				})}
				{variables.length === 0 && (
					<p className="hint" title={EMPTY_VARIABLES.more}>
						{EMPTY_VARIABLES.text}
					</p>
				)}
				{/* Names the file sets at its top level without local: an older
				    file declares most of its state this way. */}
				{order.globals.length > 0 && (
					<>
						<Heading title="Globals" count={order.globals.length} />
						{order.globals.map(
							(g) =>
								shows(g.name) && (
									<div className="variable" key={g.name}>
										<div
											className="variable-head flow-row"
											title={`First set on line ${g.line}${g.how === "function" ? ", as function " + g.name + "()" : ""}. A global: every script in the same environment sees it.`}
											onClick={() => g.node && store.reveal(g.node)}
											onDoubleClick={() => g.node && goTo(g.node)}
										>
											{g.how === "function" ? (
												<FlowBadge kind="function" />
											) : (
												<PinSwatch type="any" />
											)}
											<span className="name">{g.name}</span>
											<span className="type flow-global">global</span>
											<GlobalActions
												plan={makeLocalPlan(script, order.code, g)}
												onMake={() => makeLocal(g)}
											/>
										</div>
									</div>
								),
						)}
					</>
				)}
			</>
		),
		locals: showOrder ? (
			<>
				<Heading
					section="locals"
					drag={headingDrag}
					title="In script order"
					count={order.flow.length}
				/>
				<div className="flow-chips" role="group" aria-label="Show only">
					{FLOW_KINDS.map(([kind, label]) => (
						<button
							key={kind}
							type="button"
							className={cx("flow-chip", chips.has(kind) && "on")}
							aria-pressed={chips.has(kind)}
							onClick={() => {
								const next = new Set(chips);
								if (next.has(kind)) next.delete(kind);
								else next.add(kind);
								setChips(next);
							}}
						>
							{label}
						</button>
					))}
				</div>
				{shownFlow.map((d, i) => (
					<Fragment key={`${d.line}:${d.name}`}>
						{groups.get(d.node)?.id !== groups.get(shownFlow[i - 1]?.node ?? "")?.id &&
							groups.get(d.node) && (
								<div className="flow-group" title="A comment on the canvas around these">
									{groupTitle(groups.get(d.node)?.text ?? "")}
								</div>
							)}
						<div className={cx("variable", groups.get(d.node) && "flow-grouped")}>
							<div
								className="variable-head flow-row"
								title={`${KIND_WORDS[d.kind]}, line ${d.line}. Click to select what declares it; double-click to go to it.`}
								onClick={() => store.reveal(d.node)}
								onDoubleClick={() => goTo(d.node)}
							>
								{d.kind === "local" ? (
									<PinSwatch
										type={valueType(
											d.detail ?? declarationDetail(script, registry, d.node, d.kind),
										)}
									/>
								) : (
									<FlowBadge kind={d.kind} />
								)}
								<span className="name">{d.name}</span>
								<span className="type">
									{d.detail ?? declarationDetail(script, registry, d.node, d.kind)}
								</span>
								{plan.get(d.node)?.can && (
									<span className="row-actions">
										<button
											type="button"
											className="tb"
											title={`${plan.get(d.node)?.why}: declare it at the top of the file`}
											draggable={false}
											onClick={(e) => {
												e.stopPropagation();
												const row = plan.get(d.node);
												if (row) void moveRow(row);
											}}
										>
											To top
										</button>
									</span>
								)}
							</div>
						</div>
					</Fragment>
				))}
				{order.flow.length === 0 && <p className="hint">The flow declares nothing yet.</p>}
				{order.flow.length > 0 && !locked && (
					<div className="flow-foot">
						<button
							type="button"
							className="tb with-icon"
							disabled={movable === 0}
							title={
								movable === 0
									? "Nothing in the flow can move to the top without changing what the file does"
									: "List what can move to the top, why the rest stays, and the Luau's diff, before changing anything"
							}
							onClick={() => void tidyDeclarations()}
						>
							<Icon name="straighten" size={13} />
							Tidy declarations…
						</button>
						<span className="flow-foot-note">
							{movable === 0 ? "Nothing can move" : `${movable} can move to the top`}
						</span>
					</div>
				)}
			</>
		) : (
			<>
				{/* The graph's Declare Locals, so one can be dragged out as a Get
						    Local instead of wired from where it was made. */}
				{localScopes.map(
					(scope) =>
						(scope.locals.length > 0 || scope.results.length > 0) && (
							<Fragment key={scope.title}>
								<Heading
									section="locals"
									drag={headingDrag}
									title={scope.title}
									count={scope.locals.length + scope.results.length}
								/>
								{scope.locals.map((node) => (
									<LocalRow
										key={node.id}
										node={node}
										type={localTypeOf(script, registry, node)}
										hidden={!shows(localRefFor(node).name ?? "")}
										uses={counts.get(node.id) ?? 0}
										onFind={() => findUses(usesOf(script, node.id))}
										onDelete={() => deleteDeclaration(node, "local")}
										onGoTo={() => goTo(node.id)}
									/>
								))}
								{scope.results.map(
									({ node, ref }) =>
										shows(ref.name) && (
											<NamedResultRow
												key={node.id}
												node={node}
												name={ref.name}
												type={ref.type}
												onGoTo={() => goTo(node.id)}
											/>
										),
								)}
							</Fragment>
						),
				)}
			</>
		),
		functions: showOrder ? null : (
			<>
				{/* The functions this graph declares. In a graph of any size the
						    declaration is somewhere off screen, and this is the list that
						    says what there is and takes you to one. */}
				{functions.length > 0 && (
					<>
						<Heading
							section="functions"
							drag={headingDrag}
							title="Functions"
							count={functions.length}
						/>
						{functions.map(
							(node) =>
								shows(configText(node, "name") ?? "") && (
									<FunctionRow
										key={node.id}
										node={node}
										uses={counts.get(node.id) ?? 0}
										onFind={() => findUses(usesOf(script, node.id))}
										onDelete={() => deleteDeclaration(node, "function")}
									/>
								),
						)}
					</>
				)}
			</>
		),
	};

	return (
		<div className={cx("variables", locked && "editing-locked")}>
			<PanelHead>
				{/* How the panel lists things: one small menu rather than a switch
				    and a button in the head. Empty in a function with the
				    headings as the file has them, so then there is none. */}
				{(!inFunction || headingOrder.join() !== SCRIPT_ORDER.join()) && (
					<MenuButton
						label={<Icon name="layout" size={14} />}
						title="How the panel lists things"
						align="end"
						sections={[
							...(!inFunction
								? [
										{
											label: "List the flow",
											entries: [
												{
													label: "By kind",
													hint: "types, locals, functions",
													checked: !showOrder,
													run: () => {
														setView("kind");
														saveView("kind");
													},
												},
												{
													label: "In script order",
													hint: "as the file makes them",
													checked: showOrder,
													run: () => {
														setView("order");
														saveView("order");
													},
												},
											],
										},
									]
								: []),
							...(headingOrder.join() !== SCRIPT_ORDER.join()
								? [
										{
											label: "Headings",
											entries: [
												{
													label: "Script order",
													hint: "as the file declares them",
													run: () => {
														setHeadingOrder([...SCRIPT_ORDER]);
														saveHeadingOrder([...SCRIPT_ORDER]);
													},
												},
											],
										},
									]
								: []),
						]}
					/>
				)}
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

			<div
				className="variable-list"
				onContextMenu={(e) => {
					// A long press on a touch screen: the row's actions, in place of its count.
					const head = (e.target as Element).closest(".variable-head");
					if (!head || !head.querySelector(".row-actions")) return;
					e.preventDefault();
					for (const other of document.querySelectorAll(".variable-head.show-actions"))
						if (other !== head) other.classList.remove("show-actions");
					head.classList.toggle("show-actions");
				}}
			>
				{/* A filter once the panel holds more than a screen of rows. */}
				{rowCount > FILTER_FROM && (
					<input
						className="tb variables-filter"
						placeholder="Filter"
						aria-label="Filter the panel"
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
					/>
				)}

				{headingOrder.map((id) => (
					<Fragment key={id}>{sections[id]}</Fragment>
				))}
			</div>
		</div>
	);
}

/** Variables in runs: each group's members together, ungrouped ones between. */
function groupRuns(
	variables: readonly ScriptVariable[],
): { group?: string; items: ScriptVariable[] }[] {
	const runs: { group?: string; items: ScriptVariable[] }[] = [];
	for (const variable of variables) {
		const last = runs[runs.length - 1];
		if (last && last.group === variable.group) last.items.push(variable);
		else runs.push({ ...(variable.group ? { group: variable.group } : {}), items: [variable] });
	}
	return runs;
}

/**
 * A group's header: its name, which is the comment above its run in the
 * Luau, renamed by clicking it; and × to dissolve it, which leaves the
 * variables where they are.
 */
function GroupHeader({
	name,
	count,
	onRename,
	onDissolve,
}: {
	name: string;
	count: number;
	onRename: (to: string) => void;
	onDissolve: () => void;
}) {
	const [editing, setEditing] = useState<string | null>(null);
	const commit = () => {
		if (editing !== null && editing.trim() !== "" && editing.trim() !== name) onRename(editing);
		setEditing(null);
	};
	return (
		<div className="variable-group-head" title="A comment header over these variables in the Luau.">
			<span className="group-mark" aria-hidden="true">
				--
			</span>
			{editing === null ? (
				<button type="button" className="group-name" onClick={() => setEditing(name)}>
					{name}
				</button>
			) : (
				<input
					className="tb group-name-input"
					aria-label="Group name"
					// biome-ignore lint/a11y/noAutofocus: opened to be typed into.
					autoFocus
					value={editing}
					onChange={(e) => setEditing(e.target.value)}
					onBlur={commit}
					onKeyDown={(e) => {
						if (e.key === "Enter") commit();
						if (e.key === "Escape") setEditing(null);
					}}
				/>
			)}
			<span className="variables-count">{count}</span>
			<button
				type="button"
				className="tb variable-delete"
				title={`Dissolve "${name}": the variables stay where they are`}
				aria-label={`Dissolve "${name}"`}
				onClick={onDissolve}
			>
				×
			</button>
		</div>
	);
}

/** Choosing a variable's group: one there is, a new name, or none. */
function GroupField({
	value,
	groups,
	onChange,
}: {
	value: string;
	groups: string[];
	onChange: (group: string) => void;
}) {
	const [text, setText] = useState(value);
	const commit = () => {
		if (text.trim() !== value) onChange(text);
	};
	return (
		<>
			<input
				className="tb"
				placeholder="None"
				list="roswaal-variable-groups"
				title="A comment header over its group in the Luau. Its members stay together."
				value={text}
				onChange={(e) => setText(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Enter") commit();
				}}
			/>
			<datalist id="roswaal-variable-groups">
				{groups.map((group) => (
					<option key={group} value={group} />
				))}
			</datalist>
		</>
	);
}

/** What a reordering drag carries, beside what the canvas reads. */
const REORDER_DRAG = "application/x-roswaal-reorder";

/**
 * A row that can be moved to change where it is declared. The drag also
 * carries what the canvas reads, so the same row still drops onto the canvas
 * as a Get. Over another row of its kind, the marker says where it would go,
 * or why it cannot, and the rows that reason is about light up.
 */
function ReorderSlot({
	kind,
	id,
	moving,
	over,
	needed,
	onStart,
	onEnd,
	onOver,
	onDrop,
	children,
}: {
	kind: ReorderKind;
	id: string;
	moving: { kind: ReorderKind; id: string } | null;
	over: { where: Where; check: MoveCheck } | null;
	needed: boolean;
	onStart: () => void;
	onEnd: () => void;
	onOver: (where: Where) => void;
	onDrop: () => void;
	children: ReactNode;
}) {
	const mine = moving !== null && moving.kind === kind && moving.id !== id;
	return (
		<div
			className={cx(
				"reorder-slot",
				needed && "needed",
				over && `drop-${over.where}`,
				over && !over.check.ok && "refused",
			)}
			onDragStart={(e) => {
				// After the row's own handler, which offers a copy to the canvas.
				e.dataTransfer.setData(REORDER_DRAG, JSON.stringify({ kind, id }));
				e.dataTransfer.effectAllowed = "copyMove";
				onStart();
			}}
			onDragEnd={onEnd}
			onDragOver={(e) => {
				if (!mine) return;
				e.preventDefault();
				e.stopPropagation();
				const box = e.currentTarget.getBoundingClientRect();
				onOver(e.clientY < box.top + box.height / 2 ? "before" : "after");
				e.dataTransfer.dropEffect = over && !over.check.ok ? "none" : "move";
			}}
			onDrop={(e) => {
				if (!mine) return;
				e.preventDefault();
				e.stopPropagation();
				onDrop();
			}}
		>
			<span className="reorder-grip" aria-hidden="true">
				⋮⋮
			</span>
			{children}
			{over && !over.check.ok && over.check.reason && (
				<div className="reorder-reason" role="status">
					Can't go here: {over.check.reason}
				</div>
			)}
		</div>
	);
}

/** Past this many rows the panel is more than a screen, and offers a filter. */
const FILTER_FROM = 20;

/** How the panel lists the flow: by kind, or in the order the file makes it. */
type PanelView = "kind" | "order";
const VIEW_KEY = "roswaal.variablesPanel.view";

/** The view this browser chose, or none: then the graph decides. */
function readView(): PanelView | undefined {
	try {
		const kept = localStorage.getItem(VIEW_KEY);
		return kept === "kind" || kept === "order" ? kept : undefined;
	} catch {
		return undefined;
	}
}

function saveView(view: PanelView): void {
	try {
		localStorage.setItem(VIEW_KEY, view);
	} catch {
		// Kept for this visit only.
	}
}

/** The chips that narrow "In script order", in place and still in order. */
const FLOW_KINDS: readonly [DeclarationKind, string][] = [
	["type", "Types"],
	["local", "Locals"],
	["function", "Functions"],
	["require", "Requires"],
];

/** The panel's headings, in the order the file declares them. */
type SectionId = "services" | "module" | "types" | "variables" | "locals" | "functions";
const SCRIPT_ORDER: readonly SectionId[] = [
	"services",
	"module",
	"types",
	"variables",
	"locals",
	"functions",
];
const ORDER_KEY = "roswaal.variablesPanel.headings";

/** The headings in the order this browser keeps, or the file's. */
function readHeadingOrder(): SectionId[] {
	try {
		const kept = JSON.parse(localStorage.getItem(ORDER_KEY) ?? "null") as unknown;
		if (
			Array.isArray(kept) &&
			kept.length === SCRIPT_ORDER.length &&
			SCRIPT_ORDER.every((id) => kept.includes(id))
		)
			return kept as SectionId[];
	} catch {
		// No storage, or something else in it: the file's order.
	}
	return [...SCRIPT_ORDER];
}

function saveHeadingOrder(order: readonly SectionId[]): void {
	try {
		if (order.join() === SCRIPT_ORDER.join()) localStorage.removeItem(ORDER_KEY);
		else localStorage.setItem(ORDER_KEY, JSON.stringify(order));
	} catch {
		// Kept for this visit only.
	}
}

interface HeadingDrag {
	moving: SectionId | null;
	onStart: (id: SectionId) => void;
	onEnd: () => void;
	onDrop: (target: SectionId) => void;
}

const HEADING_DRAG = "application/x-roswaal-heading";

/**
 * A heading: its name, how many rows are under it, and its buttons. Dragged
 * onto another heading it moves the panel's sections, for you only: the
 * file keeps Luau's order whatever the panel shows.
 */
function Heading({
	title,
	count,
	section,
	drag,
	children,
}: {
	title: string;
	count: number;
	section?: SectionId;
	drag?: HeadingDrag;
	children?: ReactNode;
}) {
	const target = section !== undefined && drag?.moving != null && drag.moving !== section;
	return (
		<h3
			className={cx("variables-sub", target && "heading-target")}
			draggable={section !== undefined}
			title={
				section !== undefined
					? "Drag onto another heading to rearrange the panel, for you only."
					: undefined
			}
			onDragStart={(e) => {
				if (section === undefined || !drag) return;
				e.dataTransfer.setData(HEADING_DRAG, section);
				e.dataTransfer.effectAllowed = "move";
				drag.onStart(section);
			}}
			onDragEnd={() => drag?.onEnd()}
			onDragOver={(e) => {
				if (!target) return;
				e.preventDefault();
				e.dataTransfer.dropEffect = "move";
			}}
			onDrop={(e) => {
				if (!target || section === undefined) return;
				e.preventDefault();
				drag?.onDrop(section);
			}}
		>
			<span>{title}</span>
			<span className="variables-count">{count}</span>
			{children && <span className="variables-sub-actions">{children}</span>}
		</h3>
	);
}

/**
 * How often a row is used, resting at its right; under the pointer, or after
 * a long press on a touch screen, Find uses and Delete in its place.
 */
function RowEnd({
	name,
	uses,
	onFind,
	onDelete,
	extra,
}: {
	name: string;
	uses: number;
	onFind?: () => void;
	onDelete?: () => void;
	/** A button of the row's own, before Find uses: Declare. */
	extra?: ReactNode;
}) {
	return (
		<>
			<span className="row-uses">
				{uses === 0 ? "unused" : `${uses} use${uses === 1 ? "" : "s"}`}
			</span>
			<span className="row-actions">
				{extra}
				{onFind && uses > 0 && (
					<button
						className="tb icon-only"
						title={`Find what uses "${name}"`}
						aria-label={`Find what uses "${name}"`}
						draggable={false}
						onClick={(e) => {
							e.stopPropagation();
							onFind();
						}}
					>
						<Icon name="search" size={12} />
					</button>
				)}
				{onDelete && <RowDelete name={name} onDelete={onDelete} />}
			</span>
		</>
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
				<FlowBadge kind="type" />
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
	nested,
	onFind,
}: {
	module: ScriptModule;
	script: NodeScript;
	expanded: boolean;
	onToggle: () => void;
	confirm: VariablesPanelProps["confirm"];
	/** Under the service, or script, it is required through. */
	nested?: boolean;
	uses?: number;
	onFind?: () => void;
}) {
	const uses = moduleUsageCount(script, module.id);
	// Under its service the path is said from there: Shared.Greeter, not ReplicatedStorage.Shared.Greeter.
	const shown = nested
		? module.specifier.replace(/^[A-Za-z_][A-Za-z0-9_]*\./, "")
		: module.specifier;

	function onDragStart(e: DragEvent) {
		e.dataTransfer.setData("application/x-roswaal-module", JSON.stringify({ id: module.id }));
		e.dataTransfer.effectAllowed = "copy";
	}

	return (
		<div className={cx("variable", expanded && "expanded", nested && "nested")}>
			<div
				className="variable-head"
				draggable
				title="Drag onto the canvas for a Get Module."
				onDragStart={onDragStart}
				onClick={onToggle}
			>
				<ExplorerIcon className="ModuleScript" service={false} open={false} />
				<span className="name">{module.name}</span>
				<span className="type" title={module.specifier || undefined}>
					{shown || "not set"}
				</span>
				<RowEnd name={module.name} uses={uses} onFind={onFind} />
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

/** What a row of the project tree carries when dragged: its file paths. */
const TREE_DRAG = "application/x-roswaal";

/**
 * A section that takes a row dragged out of the DataModel browser, when it is
 * the kind of thing the section lists: a service for Services, a ModuleScript
 * for Modules. Anything else dropped on it is left alone.
 */
function DataModelDrop({
	accepts,
	onDrop,
	onFile,
	children,
}: {
	accepts: (drag: PropertyDrag) => boolean;
	onDrop: (drag: PropertyDrag) => void;
	/** A file from the project tree, when the section takes one. */
	onFile?: (path: string) => void;
	children: ReactNode;
}) {
	const [over, setOver] = useState(false);
	const takes = (types: readonly string[]) =>
		types.includes(PROPERTY_DRAG) || (onFile !== undefined && types.includes(TREE_DRAG));
	return (
		<div
			className={cx("variables-drop", over && "over")}
			onDragOver={(e) => {
				// Only the types are readable until the drop, so any DataModel row
				// is let in here and `accepts` decides when it lands.
				if (!takes(e.dataTransfer.types)) return;
				e.preventDefault();
				e.dataTransfer.dropEffect = "copy";
				setOver(true);
			}}
			onDragLeave={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
			}}
			onDrop={(e) => {
				setOver(false);
				const files = onFile ? e.dataTransfer.getData(TREE_DRAG) : "";
				if (files) {
					e.preventDefault();
					try {
						const [first] = JSON.parse(files) as string[];
						if (first) onFile?.(first);
					} catch {
						// Not the tree's own payload; nothing of ours to drop.
					}
					return;
				}
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
function ServiceRow({
	name,
	local,
	declared,
	uses,
	onFind,
	onDeclare,
	onDelete,
}: {
	name: string;
	/** The local it is bound to, where not its own name. */
	local?: string;
	/** Declared up front, rather than only fetched where it is used. */
	declared: boolean;
	uses: number;
	onFind: () => void;
	onDeclare: () => void;
	onDelete: () => void;
}) {
	function onDragStart(e: DragEvent) {
		e.dataTransfer.setData("application/x-roswaal-service", JSON.stringify({ service: name }));
		e.dataTransfer.effectAllowed = "copy";
	}

	return (
		<div className={cx("variable", !declared && "undeclared")}>
			<div
				className="variable-head"
				draggable
				title={
					declared
						? "Drag onto the canvas for a Get Service. It reads the local declared here."
						: "Fetched where it is used, after the declared services. Declare it to fetch it at the top."
				}
				onDragStart={onDragStart}
			>
				<ExplorerIcon className={name} service open={false} />
				<span className="name">{local ?? name}</span>
				{local && <span className="type">{name}</span>}
				{!isService(name) && <span className="type">not a listed service</span>}
				<RowEnd
					name={name}
					uses={uses}
					onFind={onFind}
					{...(declared ? { onDelete } : {})}
					extra={
						!declared && (
							<button
								className="tb"
								title={`Declare ${name} at the top of the file`}
								draggable={false}
								onClick={(e) => {
									e.stopPropagation();
									onDeclare();
								}}
							>
								Declare
							</button>
						)
					}
				/>
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
	// The type picker's list: searchable, each service with its class icon and
	// what Roblox's documentation says it is. Those already declared are left out.
	const offered = ROBLOX_SERVICES.filter((service) => !declared.includes(service));
	let picked: string | null = null;
	return (
		<ValuePicker
			what="service"
			options={offered}
			value=""
			detailOf={classDetail}
			classes
			onPick={(name) => {
				picked = name.trim() || null;
			}}
			onClose={() => onDone(picked)}
		/>
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
	type,
	hidden,
	uses,
	onFind,
	onDelete,
	onGoTo,
}: {
	node: GraphNode;
	/** Its declared type, or what its value is. */
	type: string;
	/** Filtered out. */
	hidden?: boolean;
	uses: number;
	onFind: () => void;
	onDelete: () => void;
	onGoTo: () => void;
}) {
	const ref = localRefFor(node);
	if (hidden) return null;

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
				<span
					className="flow-mark"
					title="Declared where the flow reaches it, so it moves with its node: move the node to change where."
				>
					<Icon name="graph" size={11} />
				</span>
				<PinSwatch type={type} />
				<span className="name">{ref.name}</span>
				{/* The list is where you look to see what a graph holds, so a promise
				    one of them has made belongs here rather than only in the
				    Inspector of the node that made it. */}
				{isConstLocal(node.config) && <span className="badge const">const</span>}
				<span className="type">{type}</span>
				<RowEnd name={ref.name || "local"} uses={uses} onFind={onFind} onDelete={onDelete} />
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
				<PinSwatch type={type} />
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
function FunctionRow({
	node,
	uses,
	onFind,
	onDelete,
}: {
	node: GraphNode;
	uses: number;
	onFind: () => void;
	onDelete: () => void;
}) {
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
				title={`${node.def === "function.entry" ? "Hoisted to the top of the file. " : ""}Drag onto the canvas for a Get Function. Click to open its graph.`}
				onDragStart={onDragStart}
				onClick={() => {
					const path = store.getSnapshot().path;
					if (path) store.openFunction(path, node.id);
				}}
			>
				<FlowBadge kind="function" />
				<span className="name">{name}</span>
				<span className="type">{functionSignature(node.config)}</span>
				<RowEnd name={name} uses={uses} onFind={onFind} onDelete={onDelete} />
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
	/** The table a ModuleScript returns. */
	exported?: boolean;
	/** The groups the panel has, offered when choosing one. */
	groups?: string[];
	uses: number;
	onFind: () => void;
}

function VariableRow({
	variable,
	script,
	expanded,
	onToggle,
	confirm,
	exported,
	groups,
	onFind,
}: VariableRowProps) {
	const uses = variableUsageCount(script, variable.id);

	function onDragStart(e: DragEvent) {
		// The canvas reads this to decide what to spawn where it is dropped.
		e.dataTransfer.setData("application/x-roswaal-variable", JSON.stringify({ id: variable.id }));
		e.dataTransfer.effectAllowed = "copy";
	}

	return (
		<div className={cx("variable", expanded && "expanded")}>
			<div className="variable-head" draggable onDragStart={onDragStart} onClick={onToggle}>
				<PinSwatch type={variable.type} />
				<span className="name">{variable.name}</span>
				{variable.const === true && <span className="badge const">const</span>}
				{exported && (
					<span className="badge exported" title="What requiring this module gives">
						exported
					</span>
				)}
				<span className="type">{variable.type}</span>
				<RowEnd name={variable.name} uses={uses} onFind={onFind} />
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
						<span>Group</span>
						<GroupField
							value={variable.group ?? ""}
							groups={groups ?? []}
							onChange={(group) => store.edit((s) => setGroup(s, variable.id, group))}
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

const KIND_WORDS = {
	type: "A type",
	local: "A local",
	function: "A function",
	require: "A require",
} as const;

/**
 * A declaration's kind as a small coloured letter, in the code view's
 * colours: ƒ a function, T a type, x a local, and a require's module icon.
 */
function FlowBadge({ kind }: { kind: keyof typeof KIND_WORDS }) {
	return (
		<span className={`flow-badge flow-badge-${kind}`} aria-label={kind}>
			{kind === "function" ? (
				"ƒ"
			) : kind === "type" ? (
				"T"
			) : kind === "local" ? (
				"x"
			) : (
				<Icon name="instance" size={11} />
			)}
		</span>
	);
}

/** `number 16` read from the file is a number: the value is not the type. */
function valueType(detail: string): string {
	return /^(number|boolean) /.test(detail) ? detail.split(" ")[0] : detail;
}

/**
 * Something that holds a value, marked as its pin is on a node: the node's
 * own pin markup, so its shape, ring and colour are the canvas's, Four
 * Colours sprites included.
 */
function PinSwatch({ type }: { type: string }) {
	return (
		<span className="pin-icon" aria-label={type}>
			<span
				className={`pin data fam-${typeFamily(type)}`}
				style={{ color: pinColor(type, "data") }}
			>
				<span className="dot" />
			</span>
		</span>
	);
}

/** A comment's first line, as the group's name. */
function groupTitle(text: string): string {
	return text.trim().split("\n")[0] || "Comment";
}

/** A global's own button: Make local where it is safe, and nothing where it is not. */
function GlobalActions({ plan, onMake }: { plan: MakeLocal; onMake: () => void }) {
	if (!plan.ok) return null;
	return (
		<span className="row-actions">
			<button
				type="button"
				className="tb"
				title="Declare it local where the file first sets it"
				draggable={false}
				onClick={(e) => {
					e.stopPropagation();
					onMake();
				}}
			>
				Make local
			</button>
		</span>
	);
}
