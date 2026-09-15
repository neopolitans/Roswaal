/**
 * A custom node's logic, built on a graph canvas.
 *
 * The graph editor itself — `Canvas`, with `NodeMenu` for adding nodes — rather
 * than a second, smaller one. Wiring a node's logic is wiring a graph, and
 * everything somebody already knows about the canvas should carry over: the
 * right-click menu, dropping a wire into space, knots, comments, undo.
 *
 * ## One document in the store, for as long as this is open
 *
 * `Canvas` edits through the editor store, so the logic graph is opened there as
 * a document of its own and read back as it changes. The designer page has no
 * other documents, so nothing else is disturbed; the document closes when this
 * unmounts.
 *
 * Changes go both ways. An edit on the canvas reaches the draft through
 * `onChange`. A pin added to the node reaches the canvas as an edit that brings
 * Node Inputs and Node Outputs up to date — and drops any wire to a pin that has
 * gone — which is `logicScript`'s job, and so the compiler's view and the
 * canvas's cannot disagree about what the two ends have.
 *
 * ## What cannot be done here
 *
 * The menu leaves out what a node's logic may not hold (`LOGIC_DENIED`) and the
 * two ends, which already exist; Delete leaves the two ends alone. The compiler
 * refuses all of it anyway — this is the courtesy, and `compileLogic` is the
 * rule.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { logicScript, type LogicGraph } from "../../core/compiler/logic.js";
import { resolveNodePins, type Registry } from "../../core/nodes/index.js";
import { LOGIC_DENIED, LOGIC_INPUTS, LOGIC_OUTPUTS, type LogicShape } from "../../core/nodes/logic.js";
import type { NodeConfig, NodeDef, NodeScript, Target } from "../../core/schema.js";
import { Canvas } from "../Canvas.jsx";
import {
	addComment, addNode, alignToAnchor, connect, copySelection, deleteSelection, landingPins,
	pasteClipping, selectionAnchor, setConfig, withCommentContents, type Clipping,
} from "../edits.js";
import { FloatingTools, ToolGroup } from "../FloatingTools.jsx";
import { Icon } from "../icons.jsx";
import { autoLayout } from "../layout.js";
import { NodeMenu, type MenuAnchor } from "../NodeMenu.jsx";
import { readPreferences, writePreferences } from "../preferences.js";
import { store, useEditor } from "../store.js";

/** The store path the logic graph is open under. Never a file. */
const PATH = "designer:logic";

const isEnd = (def: string) => def === LOGIC_INPUTS || def === LOGIC_OUTPUTS;

/**
 * The two ends are the node's own pins, one of each, and already here.
 *
 * So they cannot be deleted, and they cannot be copied either — a second Node
 * Inputs is a thing `compileLogic` refuses, and offering a way to make one is
 * offering a way to break the node. A comment drawn around an end brings the
 * rest of what it encloses and leaves the end behind.
 */
export function withoutEnds(clip: Clipping): Clipping {
	const ends = new Set(clip.nodes.filter((n) => isEnd(n.def)).map((n) => n.id));
	if (ends.size === 0) return clip;
	return {
		nodes: clip.nodes.filter((n) => !ends.has(n.id)),
		links: clip.links.filter((l) => !ends.has(l.from.node) && !ends.has(l.to.node)),
		comments: clip.comments,
	};
}

/** The same rule for anything being taken away: everything but the two ends. */
export function removable(script: NodeScript, picked: ReadonlySet<string>): Set<string> {
	const ends = new Set(script.nodes.filter((n) => isEnd(n.def)).map((n) => n.id));
	return new Set([...picked].filter((id) => !ends.has(id)));
}

const NOOP = () => {};

export interface LogicCanvasProps {
	graph: LogicGraph;
	shape: LogicShape;
	/** The built-ins, the two ends, and the nodes of the packs this one requires. */
	registry: Registry;
	target: Target;
	onChange: (graph: LogicGraph) => void;
}

export function LogicCanvas({ graph, shape, registry, target, onChange }: LogicCanvasProps) {
	const editor = useEditor();
	const [menu, setMenu] = useState<MenuAnchor | null>(null);
	/**
	 * Straighten, shared with the editor: it is the same preference, read the
	 * same way, so a habit set on a graph holds on a node's logic too.
	 */
	const [alignExec, setAlignExec] = useState(() => readPreferences().alignExec);
	const container = useRef<HTMLDivElement>(null);

	/** Tidies into columns: the selection when there is more than one node in it, else everything. */
	const realign = useCallback(() => {
		const state = store.getSnapshot();
		if (!state.script) return;
		const selected = new Set([...state.selection].filter((id) => state.script!.nodes.some((n) => n.id === id)));
		const only = selected.size > 1 ? selected : undefined;
		const wideNodes = readPreferences().wideNodes;
		store.edit((s) => autoLayout(s, registry, { only, alignExec, wideNodes }));
	}, [registry, alignExec]);

	/** Opens the node menu in the middle of what the canvas is showing. */
	const menuAtCentre = useCallback(() => {
		const box = container.current?.getBoundingClientRect();
		if (!box) return;
		const view = store.getView();
		const cx = box.width / 2;
		const cy = box.height / 2;
		setMenu({
			screen: { x: box.left + cx, y: box.top + cy },
			world: { x: (cx - view.x) / view.zoom, y: (cy - view.y) / view.zoom },
		});
	}, []);
	/** The last script this and the draft agreed on, so an echo is not an edit. */
	const agreed = useRef<NodeScript | null>(null);
	const shapeKey = JSON.stringify(shape);
	const openedShape = useRef(shapeKey);

	useEffect(() => {
		const script = logicScript(graph, shape, registry);
		agreed.current = script;
		store.open(PATH, script);
		// Opens on the graph: its top-left node just inside the panel, which is
		// short, rather than wherever a new document's view happens to start —
		// and below the floating tools, which would otherwise sit on its header.
		if (script.nodes.length > 0) {
			const left = Math.min(...script.nodes.map((n) => n.x));
			const top = Math.min(...script.nodes.map((n) => n.y));
			store.setView({ x: 40 - left, y: 64 - top, zoom: 1 });
		}
		return () => store.closeAll();
		// Opened once, with the graph as it is; changes after that are edits.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// The node's pins changed, so the two ends follow them.
	useEffect(() => {
		if (openedShape.current === shapeKey) return;
		openedShape.current = shapeKey;
		store.edit((s) => logicScript(s, shape, registry));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [shapeKey]);

	// An edit on the canvas reaches the draft.
	useEffect(() => {
		const script = editor.script;
		if (!script || script === agreed.current) return;
		agreed.current = script;
		onChange({ nodes: script.nodes, links: script.links, comments: script.comments });
	}, [editor.script, onChange]);

	const menuRegistry = useMemo(
		() => new Map([...registry].filter(([id]) => !LOGIC_DENIED.has(id) && id !== LOGIC_INPUTS && id !== LOGIC_OUTPUTS)) as Registry,
		[registry],
	);

	const spawn = useCallback(
		(def: NodeDef, config?: NodeConfig) => {
			if (!menu) return;
			const { from, world } = menu;
			store.edit((s) => {
				const added = addNode(s, def, world.x, world.y);
				queueMicrotask(() => store.select([added.id]));
				let next = config ? setConfig(added.script, added.id, config) : added.script;
				if (!from) return next;
				const placed = next.nodes.find((n) => n.id === added.id);
				const pins = placed ? resolveNodePins(def, placed.config) : { inputs: [], outputs: [] };
				const side = from.side === "out" ? "in" : "out";
				const landing = landingPins(def, side === "in" ? pins.inputs : pins.outputs, from.pin, side)[0];
				if (!landing) return next;
				const target = { node: added.id, pin: landing.id };
				next = from.side === "out"
					? connect(next, registry, from.ref, target)
					: connect(next, registry, target, from.ref);
				return next;
			});
			setMenu(null);
		},
		[menu, registry],
	);

	/**
	 * Copy and paste, which the logic canvas did not have.
	 *
	 * The graph editor's shell owns these on a nodescript, and the designer page
	 * has no shell — so a canvas that was meant to behave like the graph editor
	 * quietly did not, in the one way you notice while building a node out of
	 * three copies of the same pair.
	 *
	 * The same helpers, so a comment brings what it is drawn around and a paste
	 * lands at the pointer here exactly as it does on a graph.
	 */
	const clipboard = useRef<Clipping | null>(null);
	const pointerAt = useRef<{ x: number; y: number } | null>(null);

	const paste = useCallback((clip: Clipping) => {
		const at = pointerAt.current ?? undefined;
		store.edit((s) => {
			const { script, ids } = pasteClipping(s, clip, { at });
			queueMicrotask(() => store.select(ids));
			return script;
		});
	}, []);

	// Keys for the canvas, while it has focus. The designer page has no editor
	// shell to handle them, and typing in the node's fields must not reach here.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const element = container.current;
			const target = e.target as HTMLElement;
			if (!element || !element.contains(target)) return;
			if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
			const mod = e.ctrlKey || e.metaKey;
			const key = e.key.toLowerCase();
			// The graph editor's two alignment keys, which live in its shell — and
			// the designer page has no shell, so they were missing here.
			if (mod && e.shiftKey && key === "l") {
				e.preventDefault();
				realign();
				return;
			}
			if (!mod && key === "a" && store.getSnapshot().selection.size > 1) {
				const state = store.getSnapshot();
				const anchor = state.script ? selectionAnchor(state.script, state.selection) : null;
				if (!anchor) return;
				e.preventDefault();
				const ids = state.selection;
				store.edit((s) => alignToAnchor(s, registry, ids, anchor));
				return;
			}
			if (mod && key === "z") {
				e.preventDefault();
				if (e.shiftKey) store.redo();
				else store.undo();
			} else if (mod && key === "y") {
				e.preventDefault();
				store.redo();
			} else if (mod && key === "a") {
				e.preventDefault();
				const s = store.getSnapshot().script;
				if (s) store.select([...s.nodes.map((n) => n.id), ...s.comments.map((c) => c.id)]);
			} else if (mod && (key === "c" || key === "x")) {
				const state = store.getSnapshot();
				if (!state.script || state.selection.size === 0) return;
				e.preventDefault();
				clipboard.current = withoutEnds(copySelection(state.script, state.selection, registry));
				if (key === "x") {
					const ids = removable(state.script, withCommentContents(state.script, state.selection, registry));
					if (ids.size > 0) store.edit((s) => deleteSelection(s, ids, registry));
				}
			} else if (mod && key === "v") {
				const clip = clipboard.current;
				if (!clip || clip.nodes.length + clip.comments.length === 0) return;
				e.preventDefault();
				paste(clip);
			} else if (mod && key === "d") {
				const state = store.getSnapshot();
				if (!state.script || state.selection.size === 0) return;
				e.preventDefault();
				paste(withoutEnds(copySelection(state.script, state.selection, registry)));
			} else if (e.key === "Delete" || e.key === "Backspace") {
				e.preventDefault();
				const state = store.getSnapshot();
				if (!state.script) return;
				const ids = removable(state.script, state.selection);
				if (ids.size > 0) store.edit((s) => deleteSelection(s, ids, registry));
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [registry, realign, paste]);

	return (
		<div className="logic-canvas" ref={container}>
			{editor.script && editor.path === PATH && (
				<Canvas
					script={editor.script}
					graph={null}
					registry={registry}
					diagnostics={[]}
					onPointerAt={(world) => { pointerAt.current = world; }}
					onRequestMenu={(screen, world, from) => setMenu({ screen, world, from })}
					onRequestPinMenu={NOOP}
					onEditCode={NOOP}
					onDropFile={NOOP}
				/>
			)}
			{/* The graph's own tools, floating over this canvas as they do over a graph. */}
			<FloatingTools label="Logic">
				<ToolGroup>
					<button
						className="tb icon-only"
						title="Add node — in the middle of the view. Right-clicking the canvas does the same, where you click."
						aria-label="Add a node"
						onClick={menuAtCentre}
					>
						<Icon name="search" size={16} />
					</button>
					<button
						className="tb icon-only"
						title="Realign — tidy into columns (Ctrl+Shift+L). With several nodes selected, only those move. A aligns the selection."
						aria-label="Realign the logic"
						onClick={realign}
					>
						<Icon name="layout" size={16} />
					</button>
					<button
						className={`tb${alignExec ? " on" : ""}`}
						aria-pressed={alignExec}
						title={
							alignExec
								? "Realign lines each node up on the execution wire arriving at it. Click to tidy into plain columns instead."
								: "Realign tidies into plain columns. Click to line each node up on the execution wire arriving at it."
						}
						onClick={() => {
							const next = !alignExec;
							setAlignExec(next);
							writePreferences({ ...readPreferences(), alignExec: next });
						}}
					>
						Straighten
					</button>
				</ToolGroup>
			</FloatingTools>
			{menu && (
				<NodeMenu
					anchor={menu}
					registry={menuRegistry}
					target={target}
					presets={[]}
					onPick={spawn}
					onAddComment={() => {
						const { world } = menu;
						store.edit((s) => addComment(s, { x: world.x, y: world.y, w: 320, h: 200 }).script);
						setMenu(null);
					}}
					onClose={() => setMenu(null)}
				/>
			)}
		</div>
	);
}
