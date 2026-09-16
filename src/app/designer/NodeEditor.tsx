/**
 * The node canvas: one node, large, built by handling it.
 *
 * The node is drawn by `NodeView` — the component the graph canvas draws every
 * node with — so what you are making is the node you will place, not a picture
 * of one. Everything else floats around it: the pin palette and the + / − for
 * each side along the top, the node's details and its problems in the corners,
 * a popover beside whichever pin you clicked, and its logic in a panel below.
 *
 * ## Adding a pin
 *
 * Drag a type from the palette onto the node: the left half adds an input, the
 * right half an output. **Execution** is in the palette too, and adds that
 * side's execution pin. The + beside each side adds an `any` pin and the −
 * takes the last one off — which, once only the execution pin is left, takes
 * that, and the node goes pure.
 *
 * ## What saving checks
 *
 * `problemsOf`, which ends in `parseNodePack` — the loader's own check. Save is
 * off while there is anything in the problems list, so a node that saves is a
 * node the project loads.
 */

import {
	useCallback, useEffect, useMemo, useRef, useState,
	type DragEvent, type PointerEvent as ReactPointerEvent,
} from "react";

import { compileLogic, defaultLogic, type LogicGraph } from "../../core/compiler/logic.js";
import { createRegistry, type Registry } from "../../core/nodes/index.js";
import { LOGIC_NODES } from "../../core/nodes/logic.js";
import type { GraphNode, Literal, NodeDef, PinDef, Target } from "../../core/schema.js";
import { api } from "../api.js";
import { FloatingTools, ToolGroup } from "../FloatingTools.jsx";
import { headerHeight, isCompact, nodeBounds, nodeWidth, pinPosition } from "../geometry.js";
import { Icon } from "../icons.jsx";
import { NodeView } from "../NodeView.jsx";
import { pinColor } from "../palette.js";
import { TypePicker } from "../TypePicker.jsx";
import {
	addPin, defOf, draftOf, movePin, newDraft, pillShape, problemsOf, purityOf, removePin, renamePin,
	retypePin, setPinDefault, setResult, shapeOfDraft, targetsOf, targetsText,
	type Draft, type DraftPin, type PackNode, type Side,
} from "./draft.js";
import { LogicCanvas } from "./LogicCanvas.jsx";
import { LuauField } from "./LuauField.jsx";
import type { Notify } from "./PackBrowser.jsx";

/** How much larger than on a graph the node is drawn. */
const SCALE = 1.6;
/** The margin the plate behind the node keeps around it, in node pixels. */
const PLATE = 22;
const NODE_ID = "designer-node";
/** The registry key the drawn node uses, whatever id is being typed. */
const DRAW_DEF = "designer.node";
const PIN_DRAG = "application/x-roswaal-pintype";
const LOGIC_KEY = "roswaal.designer.logicHeight";
const DETAILS_KEY = "roswaal.designer.details";

/** The palette: execution, then the types a custom node reaches for most. */
const PALETTE = [
	"exec", "any", "boolean", "number", "string", "table", "function",
	"Instance", "Vector3", "CFrame", "Color3",
];

const NOOP = () => {};
const NEVER = () => false;
const NOTHING_WIRED: ReadonlySet<string> = new Set();

function readLogicHeight(): number {
	try {
		const stored = Number(localStorage.getItem(LOGIC_KEY));
		return Number.isFinite(stored) && stored >= 90 ? stored : 220;
	} catch {
		return 220;
	}
}

export interface NodeEditorProps {
	packPath: string;
	/** The node as it is saved, with its logic graph, or null for one not saved yet. */
	original: PackNode | null;
	/**
	 * Nodes its logic may be built from besides the built-ins: the rest of this
	 * pack, and the packs it requires.
	 */
	requiredDefs: NodeDef[];
	/** Packs this one requires that the project does not have. */
	missingRequires: string[];
	/** What the project compiles for, which the logic's node menu follows. */
	target: Target | null;
	/** The namespace a new node's id starts in. */
	namespace: string;
	/** The ids of the pack's other nodes, which this one's must not repeat. */
	otherIds: string[];
	onSaved: (def: NodeDef) => void;
	onDeleted: () => void;
	/** Whether there are edits not yet saved, for the pack view to guard. */
	onDirty: (dirty: boolean) => void;
	notify: Notify;
}

export function NodeEditor({
	packPath, original, requiredDefs, missingRequires, target, namespace, otherIds, onSaved, onDeleted, onDirty, notify,
}: NodeEditorProps) {
	const [draft, setDraft] = useState<Draft>(() => (original ? draftOf(original) : newDraft(namespace, otherIds)));
	const [pin, setPin] = useState<{ side: Side; index: number } | null>(null);
	const [output, setOutput] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);
	/**
	 * The node's details — id, title, category, summary — expand out from the
	 * floating tools rather than sitting over the canvas the whole time. The
	 * summary is what the node's documentation reads, so it gets room to write in.
	 */
	const [detailsOpen, setDetailsOpen] = useState(() => {
		try {
			return localStorage.getItem(DETAILS_KEY) === "open";
		} catch {
			return false;
		}
	});
	const toggleDetails = () =>
		setDetailsOpen((open) => {
			try {
				localStorage.setItem(DETAILS_KEY, open ? "closed" : "open");
			} catch {
				// The choice still applies to this visit.
			}
			return !open;
		});
	const [saving, setSaving] = useState(false);
	const [logicHeight, setLogicHeight] = useState(readLogicHeight);
	const stage = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ w: 900, h: 500 });

	useEffect(() => {
		const element = stage.current;
		if (!element) return;
		const observer = new ResizeObserver(() => setSize({ w: element.clientWidth, h: element.clientHeight }));
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	const update = useCallback((fn: (d: Draft) => Draft) => setDraft((d) => fn(d)), []);

	const purity = purityOf(draft);
	const logicRegistry = useMemo(() => createRegistry([...LOGIC_NODES, ...requiredDefs]), [requiredDefs]);
	const shape = useMemo(() => shapeOfDraft(draft), [draft]);
	const shapeKey = JSON.stringify(shape);
	// Recompiled on every change to the logic or the pins, so the node on the
	// canvas, the problems and the Luau beside the graph are always the logic's.
	const compiled = useMemo(
		() => (draft.logicMode === "nodes" && draft.logic ? compileLogic(draft.logic, shape, logicRegistry) : null),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[draft.logicMode, draft.logic, shapeKey, logicRegistry],
	);
	const def = useMemo(() => defOf(draft, compiled), [draft, compiled]);
	const problems = useMemo(() => problemsOf(draft, otherIds, compiled), [draft, otherIds, compiled]);
	const targets = targetsOf(draft, compiled);
	const warnings = [
		...missingRequires.map((name) => `This pack requires ${name}, which this project does not have.`),
		// Worth knowing rather than a reason not to save: a pack is often written
		// for somewhere other than the project it happens to be open in.
		...(target && targets && targets.length > 0 && !targets.includes(target)
			? [`It runs on ${targetsText(targets)}, and this project compiles for ${target === "lune" ? "Lune" : "Roblox"}.`]
			: []),
		...(compiled?.warnings ?? []),
	];
	const savedJson = useMemo(() => {
		if (!original) return null;
		const saved = draftOf(original);
		const savedCompile =
			saved.logicMode === "nodes" && saved.logic ? compileLogic(saved.logic, shapeOfDraft(saved), logicRegistry) : null;
		return JSON.stringify(defOf(saved, savedCompile));
	}, [original, logicRegistry]);
	const dirty = savedJson === null || JSON.stringify(def) !== savedJson;
	const onLogicChange = useCallback((logic: LogicGraph) => update((d) => ({ ...d, logic })), [update]);
	useEffect(() => onDirty(dirty), [dirty, onDirty]);

	// -- the drawn node ----------------------------------------------------

	const drawDef = useMemo<NodeDef>(() => ({ ...def, id: DRAW_DEF }), [def]);
	const registry = useMemo(() => new Map([[DRAW_DEF, drawDef]]) as Registry, [drawDef]);
	const node = useMemo<GraphNode>(() => ({ id: NODE_ID, def: DRAW_DEF, x: 0, y: 0 }), []);
	const bounds = nodeBounds(node, registry);
	const offset = {
		x: Math.round(size.w / 2 - (bounds.w * SCALE) / 2),
		y: Math.round(Math.max(90, (size.h - bounds.h * SCALE) / 2)),
	};
	const toStage = (p: { x: number; y: number }) => ({ x: offset.x + p.x * SCALE, y: offset.y + p.y * SCALE });

	const pinsOn = (side: Side) => (side === "in" ? draft.inputs : draft.outputs);

	const onPinPointerDown = useCallback(
		(e: ReactPointerEvent, _node: string, clicked: PinDef, side: "in" | "out") => {
			e.stopPropagation();
			const list = side === "in" ? draft.inputs : draft.outputs;
			const index = list.findIndex((p) => p.id === clicked.id);
			if (index !== -1) setPin({ side, index });
		},
		[draft],
	);

	const onLiteralChange = useCallback(
		(_node: string, pinId: string, value: Literal | undefined) => {
			update((d) => setPinDefault(d, d.inputs.findIndex((p) => p.id === pinId), value));
		},
		[update],
	);

	// -- structural edits clear the pin selection, whose index they move ----

	const structural = (fn: (d: Draft) => Draft) => {
		setPin(null);
		update(fn);
	};

	const onDrop = (e: DragEvent) => {
		const type = e.dataTransfer.getData(PIN_DRAG);
		if (!type || !stage.current) return;
		e.preventDefault();
		const x = e.clientX - stage.current.getBoundingClientRect().left;
		const side: Side = x < offset.x + (bounds.w * SCALE) / 2 ? "in" : "out";
		structural((d) => addPin(d, side, type));
	};

	const removeLast = (side: Side) => {
		const pins = pinsOn(side);
		if (pins.length === 0) return;
		// The last data pin first; the execution pin once only it is left.
		const lastData = pins.map((p) => p.kind).lastIndexOf("data");
		structural((d) => removePin(d, side, lastData === -1 ? pins.length - 1 : lastData));
	};

	// -- saving ------------------------------------------------------------

	const save = useCallback(async () => {
		if (problems.length > 0 || saving) return;
		setSaving(true);
		try {
			await api.savePackNode(packPath, def, original?.id);
			notify(`${def.title} is saved. It is in the palette now.`);
			onSaved(def);
		} catch (err) {
			notify((err as Error).message, "failed");
		} finally {
			setSaving(false);
		}
	}, [problems, saving, packPath, def, original, notify, onSaved]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
				e.preventDefault();
				void save();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [save]);

	// -- logic -------------------------------------------------------------

	const dataOutputs = draft.outputs.filter((p) => p.kind === "data");
	const exprPin = purity === "pure" ? (dataOutputs.find((p) => p.id === output) ?? dataOutputs[0]) : undefined;
	const placeholders = [
		...draft.inputs.filter((p) => p.kind === "data").map((p) => `$in.${p.id}`),
		...(purity !== "pure" ? dataOutputs.map((p) => `$out.${p.id}`) : []),
		"$args(, )",
		"$opt(, )",
	];
	const logicHint =
		purity === "pure"
			? `One expression for ${exprPin ? (exprPin.name || exprPin.id) : "each output"}. $in.pin reads an input.`
			: draft.result
				? "An expression, whose value lands in the result pin. $in.pin reads an input."
				: "Runs where the node sits. $in.pin reads an input; assign to $out.pin to set an output.";

	const startResize = (e: ReactPointerEvent) => {
		e.preventDefault();
		const startY = e.clientY;
		const startH = logicHeight;
		let latest = startH;
		const move = (ev: PointerEvent) => {
			latest = Math.round(Math.min(window.innerHeight * 0.7, Math.max(90, startH - (ev.clientY - startY))));
			setLogicHeight(latest);
		};
		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			try {
				localStorage.setItem(LOGIC_KEY, String(latest));
			} catch {
				// The size still applies to this visit.
			}
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	};

	// -- the selected pin's popover ----------------------------------------

	const selected = pin ? pinsOn(pin.side)[pin.index] : undefined;
	const popoverAt = selected && pin ? toStage(pinPosition(node, registry, selected.id, pin.side) ?? { x: 0, y: 0 }) : null;

	const pill = pillShape(draft);
	const compact = isCompact(drawDef);

	return (
		<div className="node-editor">
			<div
				className="node-editor-stage"
				ref={stage}
				onPointerDown={() => setPin(null)}
				onDragOver={(e) => {
					if (e.dataTransfer.types.includes(PIN_DRAG)) {
						e.preventDefault();
						e.dataTransfer.dropEffect = "copy";
					}
				}}
				onDrop={onDrop}
			>
				<div
					className="node-editor-world"
					style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${SCALE})` }}
				>
					{/* A plate behind the node: its own bounds and a margin, so the node
					    sits on something rather than floating in the grid. It grows and
					    shrinks with the node as pins come and go. */}
					<div
						className="node-plate"
						style={{ left: -PLATE, top: -PLATE, width: bounds.w + PLATE * 2, height: bounds.h + PLATE * 2 }}
					/>
					<NodeView
						node={node}
						def={drawDef}
						selected={false}
						anchor={false}
						errorCount={0}
						warningCount={0}
						connected={NOTHING_WIRED}
						drag={null}
						canAccept={NEVER}
						onNodePointerDown={NOOP}
						onPinPointerDown={onPinPointerDown}
						onPinPointerUp={NOOP}
						onPinContextMenu={NOOP}
						onLiteralChange={onLiteralChange}
						onEditCode={NOOP}
						onContextMenu={NOOP}
						onGrow={NOOP}
						growth={null}
						highlightPin={pin && selected ? `${pin.side}:${selected.id}` : null}
						onPinRowPointerDown={onPinPointerDown}
					/>
					{/* The title is typed on the header itself. A pill has no header,
					    so its title is in the details instead. */}
					{!compact && (
						<input
							className="node-title-edit"
							value={draft.title}
							placeholder="Title"
							spellCheck={false}
							style={{ width: nodeWidth(drawDef, node), height: headerHeight(drawDef) }}
							onPointerDown={(e) => e.stopPropagation()}
							onChange={(e) => update((d) => ({ ...d, title: e.target.value }))}
						/>
					)}
				</div>

				<FloatingTools label="Node">
					<ToolGroup>
						<button
							className={`tb with-icon${detailsOpen ? " on" : ""}`}
							aria-pressed={detailsOpen}
							title="The node's id, title, category, and the summary its documentation reads"
							onClick={toggleDetails}
						>
							<Icon name="rename" size={15} />
							Details
						</button>
					</ToolGroup>
					<ToolGroup title="Drag a type onto the node: the left half adds an input, the right half an output.">
						{PALETTE.map((type) => (
							<span
								key={type}
								className="pin-chip"
								draggable
								onDragStart={(e) => {
									e.dataTransfer.setData(PIN_DRAG, type);
									e.dataTransfer.effectAllowed = "copy";
								}}
							>
								<span
									className={`chip-dot ${type === "exec" ? "exec" : "data"}`}
									style={{ color: pinColor(type === "exec" ? undefined : type, type === "exec" ? "exec" : "data") }}
								/>
								{type === "exec" ? "Execution" : type}
							</span>
						))}
					</ToolGroup>
					<ToolGroup>
						<span className="tool-label">Inputs</span>
						<button className="tb icon-only" title="Take the last input off" onClick={() => removeLast("in")}>−</button>
						<button className="tb icon-only" title="Add an input" onClick={() => structural((d) => addPin(d, "in", "any"))}>+</button>
						<span className="divider" />
						<span className="tool-label">Outputs</span>
						<button className="tb icon-only" title="Take the last output off" onClick={() => removeLast("out")}>−</button>
						<button className="tb icon-only" title="Add an output" onClick={() => structural((d) => addPin(d, "out", "any"))}>+</button>
					</ToolGroup>
					<span className="spacer" />
					<ToolGroup>
						<span
							className={`badge${purity === "unrunnable" ? " warn" : ""}`}
							title={
								purity === "pure"
									? "No execution pins: a value, evaluated where it is used."
									: purity === "impure"
										? "Has an execution input: a step, run where it sits."
										: "An execution output with no input: nothing can run it."
							}
						>
							{purity === "pure" ? "Pure" : purity === "impure" ? "Impure" : "Cannot run"}
						</span>
						{purity === "pure" && (
							<div className="segmented">
								<button
									className={draft.display === "normal" ? "on" : ""}
									onClick={() => update((d) => ({ ...d, display: "normal" }))}
								>
									Normal
								</button>
								<button
									className={draft.display === "compact" ? "on" : ""}
									disabled={!pill.ok}
									title={pill.ok ? "Drawn as a pill, like a getter" : pill.reason}
									onClick={() => update((d) => ({ ...d, display: "compact" }))}
								>
									Pill
								</button>
							</div>
						)}
						<span className="divider" />
						{original &&
							(confirmDelete ? (
								<>
									<span className="tool-label">Delete {original.title}?</span>
									<button
										className="tb danger"
										onClick={async () => {
											try {
												await api.deletePackNode(packPath, original.id);
												notify(`${original.title} was deleted.`);
												onDeleted();
											} catch (err) {
												notify((err as Error).message, "failed");
											}
										}}
									>
										Delete
									</button>
									<button className="tb" onClick={() => setConfirmDelete(false)}>Keep</button>
								</>
							) : (
								<button className="tb icon-only" title="Delete this node…" onClick={() => setConfirmDelete(true)}>
									<Icon name="remove" size={15} />
								</button>
							))}
						<button
							className="tb primary with-icon"
							disabled={problems.length > 0 || saving || !dirty}
							title={problems.length > 0 ? "Fix the problems first" : dirty ? "Save into the pack (Ctrl+S)" : "Saved"}
							onClick={() => void save()}
						>
							<Icon name="build" size={15} />
							{dirty ? "Save" : "Saved"}
						</button>
					</ToolGroup>
				</FloatingTools>

				{detailsOpen && (
				<div className="node-details" onPointerDown={(e) => e.stopPropagation()}>
					<div className="node-details-head">
						<strong>Details</strong>
						<span style={{ flex: 1 }} />
						<button className="tb icon-only" title="Close" aria-label="Close the details" onClick={toggleDetails}>
							<Icon name="close" size={14} />
						</button>
					</div>
					<label>
						<span>Id</span>
						<input className="tb" value={draft.id} spellCheck={false} onChange={(e) => update((d) => ({ ...d, id: e.target.value }))} />
					</label>
					<label>
						<span>Title</span>
						<input className="tb" value={draft.title} onChange={(e) => update((d) => ({ ...d, title: e.target.value }))} />
					</label>
					<label>
						<span>Category</span>
						<input className="tb" value={draft.category} onChange={(e) => update((d) => ({ ...d, category: e.target.value }))} />
					</label>
					<label>
						<span>Runs on</span>
						<div className="segmented" title="The targets this node declares. Logic built from nodes can narrow it further.">
							{([
								["both", "Roblox and Lune", undefined],
								["roblox", "Roblox", ["roblox"]],
								["lune", "Lune", ["lune"]],
							] as const).map(([key, label, value]) => {
								const declared = draft.targets?.length === 1 ? draft.targets[0] : "both";
								return (
									<button
										key={key}
										className={declared === key ? "on" : ""}
										onClick={() => update((d) => ({ ...d, targets: value ? [...value] : undefined }))}
									>
										{label}
									</button>
								);
							})}
						</div>
					</label>
					{/* What building from nodes did to that, said where the choice is made. */}
					{draft.logicMode === "nodes" && compiled?.targets && (
						<p className="hint targets-note">
							Its logic uses nodes that run on {targetsText(compiled.targets)}, so the node runs on {targetsText(targets)}.
						</p>
					)}
					<label className="summary">
						<span>Summary</span>
						<textarea
							className="tb"
							rows={3}
							value={draft.summary}
							placeholder="What it does, for the node's documentation. The Inspector shows the first sentence."
							onChange={(e) => update((d) => ({ ...d, summary: e.target.value }))}
						/>
					</label>
				</div>
				)}

				<div className={`node-problems${problems.length ? " bad" : ""}`}>
					{problems.length === 0 ? (
						<span>{dirty ? "Ready to save." : "Saved, and the project loads it."}</span>
					) : (
						<ul>
							{problems.map((problem) => <li key={problem}>{problem}</li>)}
						</ul>
					)}
					{/* Worth knowing, and no reason not to save. */}
					{warnings.length > 0 && (
						<ul className="warnings">
							{warnings.map((warning) => <li key={warning}>{warning}</li>)}
						</ul>
					)}
				</div>

				{selected && pin && popoverAt && (
					<PinPopover
						key={`${pin.side}:${selected.id}`}
						pin={selected}
						side={pin.side}
						index={pin.index}
						count={pinsOn(pin.side).length}
						isResult={pin.side === "out" && draft.result === selected.id}
						canBeResult={
							pin.side === "out" && selected.kind === "data" && purity === "impure" && draft.logicMode === "luau"
						}
						style={
							pin.side === "in"
								? { right: Math.max(8, size.w - popoverAt.x + 18), top: Math.max(8, popoverAt.y - 24) }
								: { left: Math.min(size.w - 280, popoverAt.x + 18), top: Math.max(8, popoverAt.y - 24) }
						}
						onRename={(name) => update((d) => renamePin(d, pin.side, pin.index, name))}
						onRetype={(type) => update((d) => retypePin(d, pin.side, pin.index, type))}
						onDefault={(value) => update((d) => setPinDefault(d, pin.index, value))}
						onDescription={(text) =>
							update((d) => {
								const list = pin.side === "in" ? d.inputs : d.outputs;
								const next = list.map((p, i) => (i === pin.index ? { ...p, description: text || undefined } : p));
								return pin.side === "in" ? { ...d, inputs: next } : { ...d, outputs: next };
							})
						}
						onChoices={(text) =>
							update((d) => {
								const options = readChoices(text);
								const next = d.inputs.map((p, i) =>
									(i === pin.index ? { ...p, options } : p));
								return { ...d, inputs: next };
							})
						}
						onResult={(on) => update((d) => setResult(d, on ? selected.id : undefined))}
						onMove={(delta) => {
							update((d) => movePin(d, pin.side, pin.index, delta));
							setPin({ side: pin.side, index: pin.index + delta });
						}}
						onRemove={() => structural((d) => removePin(d, pin.side, pin.index))}
						onClose={() => setPin(null)}
					/>
				)}
			</div>

			<div className="logic-splitter" onPointerDown={startResize} title="Drag to resize" />
			<div className="node-logic" style={{ height: logicHeight }}>
				<div className="logic-head">
					<strong>Logic</strong>
					<div className="segmented">
						<button
							className={draft.logicMode === "luau" ? "on" : ""}
							title="Write the logic as a Luau template"
							onClick={() =>
								update((d) => {
									// Leaving nodes for an empty Luau field starts it from what the
									// nodes compiled to. Luau already written is left alone.
									const spec = d.logicMode === "nodes" ? compiled?.compilesTo : undefined;
									if (spec?.kind === "statement" && d.template.trim() === "") {
										return { ...d, logicMode: "luau", template: spec.template, result: undefined };
									}
									if (spec?.kind === "expr" && Object.values(d.expressions).every((e) => e.trim() === "")) {
										return { ...d, logicMode: "luau", expressions: { ...spec.outputs } };
									}
									return { ...d, logicMode: "luau" };
								})
							}
						>
							Luau
						</button>
						<button
							className={draft.logicMode === "nodes" ? "on" : ""}
							title="Build the logic from nodes, compiled to Luau as you go"
							onClick={() => update((d) => ({ ...d, logicMode: "nodes", logic: d.logic ?? defaultLogic(shapeOfDraft(d)) }))}
						>
							Nodes
						</button>
					</div>
					{draft.logicMode === "luau" && purity === "pure" && dataOutputs.length > 1 && (
						<div className="segmented">
							{dataOutputs.map((p) => (
								<button key={p.id} className={exprPin?.id === p.id ? "on" : ""} onClick={() => setOutput(p.id)}>
									{p.name || p.id}
								</button>
							))}
						</div>
					)}
					<span className="hint">
						{draft.logicMode === "nodes"
							? "Right-click for nodes. Compiled to the Luau on the right as you build it."
							: logicHint}
					</span>
				</div>
				{draft.logicMode === "nodes" && draft.logic ? (
					<div className="logic-split">
						<LogicCanvas
							graph={draft.logic}
							shape={shape}
							registry={logicRegistry}
							target={target ?? "roblox"}
							onChange={onLogicChange}
						/>
						<pre className="logic-compiled" title="What the nodes compile to, and what the node is saved as">
							{compiled?.compilesTo?.kind === "statement"
								? compiled.compilesTo.template || "-- Nothing yet"
								: compiled?.compilesTo?.kind === "expr"
									? Object.entries(compiled.compilesTo.outputs).map(([id, text]) => `-- ${id}\n${text}`).join("\n\n")
									: "-- Fix the problems to see the Luau it compiles to."}
						</pre>
					</div>
				) : purity === "pure" && !exprPin ? (
					<p className="hint logic-empty">A pure node's logic is one expression per output. Add an output first.</p>
				) : (
					<LuauField
						key={purity === "pure" ? `expr:${exprPin!.id}` : "template"}
						value={purity === "pure" ? (draft.expressions[exprPin!.id] ?? "") : draft.template}
						placeholders={placeholders}
						onChange={(text) =>
							update((d) =>
								purity === "pure"
									? { ...d, expressions: { ...d.expressions, [exprPin!.id]: text } }
									: { ...d, template: text },
							)
						}
					/>
				)}
			</div>
		</div>
	);
}

/** Everything about one pin that does not fit on the pin. */
/**
 * The values a pin offers, from a comma-separated field.
 *
 * Blank means no list rather than an empty one, because a pin with `options: []`
 * is a dropdown with nothing in it -- and `undefined` is what every pin that has
 * never had choices already stores.
 *
 * Commas and newlines both separate, so a list pasted from anywhere works.
 * Duplicates are dropped and order is kept: order is the author's, and it is the
 * order the dropdown shows.
 */
function readChoices(text: string): string[] | undefined {
	const values = text
		.split(/[,\n]/)
		.map((value) => value.trim())
		.filter((value) => value !== "");
	const unique = [...new Set(values)];
	return unique.length > 0 ? unique : undefined;
}

function PinPopover(props: {
	pin: DraftPin;
	side: Side;
	index: number;
	count: number;
	isResult: boolean;
	canBeResult: boolean;
	style: React.CSSProperties;
	onRename: (name: string) => void;
	onRetype: (type: string) => void;
	onDefault: (value: Literal | undefined) => void;
	onDescription: (text: string) => void;
	onChoices: (text: string) => void;
	onResult: (on: boolean) => void;
	onMove: (delta: -1 | 1) => void;
	onRemove: () => void;
	onClose: () => void;
}) {
	const { pin, side } = props;
	// Committed on blur or Enter, not per keystroke: the id follows the name,
	// and every intermediate id would rewrite the template on the way.
	const [name, setName] = useState(pin.name);
	const commitName = () => {
		if (name !== pin.name) props.onRename(name);
	};

	const value = pin.default;
	const valueKind = value === undefined ? "none" : value.t;

	return (
		<div className="pin-popover" style={props.style} onPointerDown={(e) => e.stopPropagation()}>
			<div className="pin-popover-head">
				<span
					className={`chip-dot ${pin.kind}`}
					style={{ color: pinColor(pin.kind === "exec" ? undefined : pin.type, pin.kind) }}
				/>
				<strong>{pin.kind === "exec" ? "Execution" : pin.name || pin.id}</strong>
				<span className="hint">{side === "in" ? "input" : "output"}</span>
				<span style={{ flex: 1 }} />
				<button className="tb icon-only" title="Close" onClick={props.onClose}>
					<Icon name="close" size={14} />
				</button>
			</div>

			{pin.kind === "exec" ? (
				<p className="hint">
					{side === "in"
						? "Where the flow arrives. Without it the node is pure, or — with an execution output — cannot run."
						: "Where the flow carries on. Without it the node ends the flow it is in."}
				</p>
			) : (
				<>
					<label>
						<span>Name</span>
						<input
							className="tb"
							value={name}
							autoFocus
							onChange={(e) => setName(e.target.value)}
							onBlur={commitName}
							onKeyDown={(e) => e.key === "Enter" && commitName()}
						/>
					</label>
					<div className="hint">In the logic: <code>${side === "in" ? "in" : "out"}.{pin.id}</code></div>
					<label>
						<span>Type</span>
						<TypePicker value={pin.type} onChange={props.onRetype} />
					</label>
					{side === "in" && (
						<label>
							<span>Default</span>
							<select
								className="tb"
								value={valueKind}
								onChange={(e) => {
									const kind = e.target.value;
									props.onDefault(
										kind === "none" ? undefined
											: kind === "number" ? { t: "number", v: 0 }
												: kind === "boolean" ? { t: "boolean", v: false }
													: kind === "raw" ? { t: "raw", v: "nil" }
														: { t: "string", v: "" },
									);
								}}
							>
								<option value="none">None</option>
								<option value="string">Text</option>
								<option value="number">Number</option>
								<option value="boolean">True or false</option>
								<option value="raw">Luau constant</option>
							</select>
						</label>
					)}
					{side === "in" && value?.t === "raw" && (
						<label>
							<span>Constant</span>
							<input
								className="tb"
								value={value.v}
								spellCheck={false}
								onChange={(e) => props.onDefault({ t: "raw", v: e.target.value })}
							/>
						</label>
					)}
					{side === "in" && value && value.t !== "raw" && value.t !== "nil" && (
						<p className="hint">Set the value on the node itself.</p>
					)}
					{props.canBeResult && (
						<label className="check">
							<input type="checkbox" checked={props.isResult} onChange={(e) => props.onResult(e.target.checked)} />
							<span>The call's result — its logic is one expression, and this pin holds its value</span>
						</label>
					)}
					{side === "in" && (
						<label>
							<span>Choices</span>
							<input
								className="tb"
								value={(pin.options ?? []).join(", ")}
								placeholder="Optional, comma separated"
								spellCheck={false}
								title="Offers these in a dropdown on the node. Suggestions rather than a gate: anything else can still be typed."
								onChange={(e) => props.onChoices(e.target.value)}
							/>
						</label>
					)}
					<label>
						<span>Tooltip</span>
						<input
							className="tb"
							value={pin.description ?? ""}
							placeholder="Optional"
							onChange={(e) => props.onDescription(e.target.value)}
						/>
					</label>
				</>
			)}

			<div className="pin-popover-actions">
				{pin.kind === "data" && (
					<>
						<button className="tb icon-only" title="Move up" onClick={() => props.onMove(-1)}>↑</button>
						<button className="tb icon-only" title="Move down" disabled={props.index >= props.count - 1} onClick={() => props.onMove(1)}>↓</button>
					</>
				)}
				<span style={{ flex: 1 }} />
				<button className="tb danger" onClick={props.onRemove}>Remove</button>
			</div>
		</div>
	);
}
