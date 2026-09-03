/**
 * The graph canvas.
 *
 * Everything on the canvas lives in world coordinates inside a single
 * transformed container, so panning and zooming are one CSS transform rather
 * than per-element arithmetic. The grid is the exception: it is painted in
 * screen space with a background-size derived from the zoom, which is both
 * cheaper and sharper than scaling a drawn grid.
 */

import {
	useCallback, useEffect, useMemo, useRef, useState,
	type CSSProperties, type PointerEvent as ReactPointerEvent,
} from "react";

import type { Comment, Literal, NodeScript, PinDef, PinRef } from "../core/schema.js";
import type { Registry } from "../core/nodes/index.js";
import type { Diagnostic } from "../core/compiler/index.js";
import {
	nodeBounds, pinPosition, rectFromPoints, rectsIntersect, screenToWorld, wirePath,
	type Rect, type Vec, type View,
} from "./geometry.js";
import { GRID, LAYER, NODE, ZOOM } from "./layers.js";
import { pinColor } from "./palette.js";
import { NodeView, type PinDragState } from "./NodeView.jsx";
import {
	addNode, bindNodeToVariable, canConnect, commentContents, commentsByArea, connect,
	moveNodes, removeLink, setLiteral, updateComment,
} from "./edits.js";
import { store, useEditor } from "./store.js";

const COMMENT_DEFAULT_COLOR = "6a8fbf";

export interface CanvasProps {
	script: NodeScript;
	registry: Registry;
	diagnostics: Diagnostic[];
	onRequestMenu: (screen: Vec, world: Vec) => void;
}

type Gesture =
	| { kind: "none" }
	| { kind: "pan"; startView: View; origin: Vec }
	| { kind: "marquee"; origin: Vec; additive: boolean }
	| { kind: "move"; last: Vec; ids: ReadonlySet<string> }
	| { kind: "wire"; from: PinRef; side: "in" | "out"; pin: PinDef }
	| { kind: "resize"; id: string; origin: Vec; start: { w: number; h: number } };

export function Canvas({ script, registry, diagnostics, onRequestMenu }: CanvasProps) {
	const { selection, view } = useEditor();
	const surface = useRef<HTMLDivElement>(null);
	const gesture = useRef<Gesture>({ kind: "none" });

	const [pointer, setPointer] = useState<Vec | null>(null);
	const [marquee, setMarquee] = useState<Rect | null>(null);
	const [wireDrag, setWireDrag] = useState<PinDragState | null>(null);
	const [editingComment, setEditingComment] = useState<string | null>(null);

	// -- derived -----------------------------------------------------------

	const connectedPins = useMemo(() => {
		const set = new Set<string>();
		for (const link of script.links) {
			set.add(`${link.from.node}/${link.from.pin}`);
			set.add(`${link.to.node}/${link.to.pin}`);
		}
		return set;
	}, [script.links]);

	const errorsByNode = useMemo(() => {
		const map = new Map<string, number>();
		for (const d of diagnostics) {
			if (d.severity !== "error" || !d.node) continue;
			map.set(d.node, (map.get(d.node) ?? 0) + 1);
		}
		return map;
	}, [diagnostics]);

	const nodesById = useMemo(
		() => new Map(script.nodes.map((n) => [n.id, n])),
		[script.nodes],
	);

	// -- coordinate helpers ------------------------------------------------

	const toWorld = useCallback(
		(clientX: number, clientY: number): Vec => {
			const box = surface.current?.getBoundingClientRect();
			const v = store.getSnapshot().view;
			return screenToWorld(v, clientX - (box?.left ?? 0), clientY - (box?.top ?? 0));
		},
		[],
	);

	// -- zoom --------------------------------------------------------------

	useEffect(() => {
		const element = surface.current;
		if (!element) return;

		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const box = element.getBoundingClientRect();
			const sx = e.clientX - box.left;
			const sy = e.clientY - box.top;
			const current = store.getSnapshot().view;

			const factor = e.deltaY < 0 ? ZOOM.step : 1 / ZOOM.step;
			const zoom = clamp(current.zoom * factor, ZOOM.min, ZOOM.max);
			if (zoom === current.zoom) return;

			// Keep the world point under the cursor pinned while zooming.
			const wx = (sx - current.x) / current.zoom;
			const wy = (sy - current.y) / current.zoom;
			store.setView({ x: sx - wx * zoom, y: sy - wy * zoom, zoom });
		};

		element.addEventListener("wheel", onWheel, { passive: false });
		return () => element.removeEventListener("wheel", onWheel);
	}, []);

	// -- gesture plumbing --------------------------------------------------

	const endGesture = useCallback(() => {
		const g = gesture.current;
		if (g.kind === "move" || g.kind === "resize") store.end();
		gesture.current = { kind: "none" };
		setMarquee(null);
		setWireDrag(null);
	}, []);

	useEffect(() => {
		const onMove = (e: PointerEvent) => {
			const g = gesture.current;
			if (g.kind === "none") return;
			const world = toWorld(e.clientX, e.clientY);
			setPointer(world);

			switch (g.kind) {
				case "pan": {
					const box = surface.current!.getBoundingClientRect();
					store.setView({
						...g.startView,
						x: g.startView.x + (e.clientX - box.left) - g.origin.x,
						y: g.startView.y + (e.clientY - box.top) - g.origin.y,
					});
					break;
				}
				case "marquee":
					setMarquee(rectFromPoints(g.origin, world));
					break;
				case "move": {
					const dx = world.x - g.last.x;
					const dy = world.y - g.last.y;
					if (dx === 0 && dy === 0) break;
					g.last = world;
					store.apply((s) => moveNodes(s, g.ids, dx, dy));
					break;
				}
				case "resize": {
					store.apply((s) =>
						updateComment(s, g.id, {
							w: Math.max(160, g.start.w + (world.x - g.origin.x)),
							h: Math.max(96, g.start.h + (world.y - g.origin.y)),
						}),
					);
					break;
				}
			}
		};

		const onUp = (e: PointerEvent) => {
			const g = gesture.current;
			if (g.kind === "marquee" && marquee) commitMarquee(marquee, g.additive);
			if (g.kind === "wire") {
				// Released over nothing: offer the palette, pre-filtered by the
				// pin that was dragged, rather than silently dropping the wire.
				const target = document.elementFromPoint(e.clientX, e.clientY);
				if (!target?.closest(".pin")) {
					const box = surface.current!.getBoundingClientRect();
					onRequestMenu(
						{ x: e.clientX - box.left, y: e.clientY - box.top },
						toWorld(e.clientX, e.clientY),
					);
				}
			}
			endGesture();
		};

		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		};
	});

	function commitMarquee(box: Rect, additive: boolean) {
		const hits: string[] = [];
		for (const node of script.nodes) {
			if (rectsIntersect(box, nodeBounds(node, registry))) hits.push(node.id);
		}
		for (const c of script.comments) {
			if (rectsIntersect(box, { x: c.x, y: c.y, w: c.w, h: c.h })) hits.push(c.id);
		}
		store.select(hits, additive ? "add" : "replace");
	}

	// -- background --------------------------------------------------------

	function onSurfacePointerDown(e: ReactPointerEvent) {
		if (e.button === 1 || (e.button === 0 && e.altKey)) {
			const box = surface.current!.getBoundingClientRect();
			gesture.current = {
				kind: "pan",
				startView: store.getSnapshot().view,
				origin: { x: e.clientX - box.left, y: e.clientY - box.top },
			};
			e.preventDefault();
			return;
		}
		if (e.button !== 0) return;
		const additive = e.shiftKey || e.ctrlKey;
		if (!additive) store.clearSelection();
		gesture.current = { kind: "marquee", origin: toWorld(e.clientX, e.clientY), additive };
	}

	// -- nodes -------------------------------------------------------------

	function onNodePointerDown(e: ReactPointerEvent, nodeId: string) {
		if (e.button !== 0) return;
		e.stopPropagation();

		const already = selection.has(nodeId);
		if (e.shiftKey || e.ctrlKey) store.select([nodeId], "toggle");
		else if (!already) store.select([nodeId]);

		const ids = new Set(store.getSnapshot().selection);
		ids.add(nodeId);
		store.begin();
		gesture.current = { kind: "move", last: toWorld(e.clientX, e.clientY), ids };
	}

	function onPinPointerDown(
		e: ReactPointerEvent, nodeId: string, pin: PinDef, side: "in" | "out",
	) {
		if (e.button !== 0) return;
		e.stopPropagation();

		// Grabbing a wired input picks the existing wire up rather than making a
		// second one, which is how you rewire without deleting first.
		if (side === "in") {
			const existing = script.links.find((l) => l.to.node === nodeId && l.to.pin === pin.id);
			if (existing) {
				const sourcePin = pinDefOf(registry, script, existing.from, "out");
				store.edit((s) => removeLink(s, existing.id));
				if (sourcePin) {
					gesture.current = { kind: "wire", from: existing.from, side: "out", pin: sourcePin };
					setWireDrag({
						from: existing.from,
						side: "out",
						kind: sourcePin.kind,
						type: sourcePin.type,
					});
					setPointer(toWorld(e.clientX, e.clientY));
				}
				return;
			}
		}

		gesture.current = { kind: "wire", from: { node: nodeId, pin: pin.id }, side, pin };
		setWireDrag({ from: { node: nodeId, pin: pin.id }, side, kind: pin.kind, type: pin.type });
		setPointer(toWorld(e.clientX, e.clientY));
	}

	function onPinPointerUp(
		e: ReactPointerEvent, nodeId: string, pin: PinDef, side: "in" | "out",
	) {
		const g = gesture.current;
		if (g.kind !== "wire" || g.side === side) return;
		e.stopPropagation();

		const from = side === "in" ? g.from : { node: nodeId, pin: pin.id };
		const to = side === "in" ? { node: nodeId, pin: pin.id } : g.from;
		if (canConnect(script, registry, from, to).ok) {
			store.edit((s) => connect(s, registry, from, to));
		}
		endGesture();
	}

	const canAccept = useCallback(
		(pin: PinDef, side: "in" | "out"): boolean => {
			const drag = wireDrag;
			if (!drag || drag.side === side) return false;
			if (drag.kind !== pin.kind) return false;
			if (pin.kind === "exec") return true;
			const from = drag.type ?? "any";
			const to = pin.type ?? "any";
			return (
				from === to || from === "any" || to === "any" ||
				from === "wildcard" || to === "wildcard"
			);
		},
		[wireDrag],
	);

	const onLiteralChange = useCallback((nodeId: string, pinId: string, value: Literal) => {
		store.edit((s) => setLiteral(s, nodeId, pinId, value));
	}, []);

	// -- comments ----------------------------------------------------------

	function onCommentPointerDown(e: ReactPointerEvent, comment: Comment) {
		if (e.button !== 0) return;
		e.stopPropagation();

		if (e.shiftKey || e.ctrlKey) store.select([comment.id], "toggle");
		else if (!selection.has(comment.id)) store.select([comment.id]);

		// Membership is captured now, not tracked. A node that was inside when
		// the drag began travels with the comment; one that was not, does not.
		const ids = new Set(store.getSnapshot().selection);
		ids.add(comment.id);
		for (const id of [...ids]) {
			if (script.comments.some((c) => c.id === id)) {
				for (const member of commentContents(script, registry, id)) ids.add(member);
			}
		}
		store.begin();
		gesture.current = { kind: "move", last: toWorld(e.clientX, e.clientY), ids };
	}

	function onCommentResize(e: ReactPointerEvent, comment: Comment) {
		if (e.button !== 0) return;
		e.stopPropagation();
		store.begin();
		gesture.current = {
			kind: "resize",
			id: comment.id,
			origin: toWorld(e.clientX, e.clientY),
			start: { w: comment.w, h: comment.h },
		};
	}

	// -- rendering ---------------------------------------------------------

	const worldStyle: CSSProperties = {
		transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
	};

	const liveWire = (() => {
		const g = gesture.current;
		if (g.kind !== "wire" || !pointer) return null;
		const node = nodesById.get(g.from.node);
		if (!node) return null;
		const anchor = pinPosition(node, registry, g.from.pin, g.side);
		if (!anchor) return null;
		return g.side === "out" ? wirePath(anchor, pointer) : wirePath(pointer, anchor);
	})();

	return (
		<div
			className="canvas"
			ref={surface}
			tabIndex={0}
			onPointerDown={onSurfacePointerDown}
			onContextMenu={(e) => {
				e.preventDefault();
				const box = surface.current!.getBoundingClientRect();
				onRequestMenu(
					{ x: e.clientX - box.left, y: e.clientY - box.top },
					toWorld(e.clientX, e.clientY),
				);
			}}
			onDragOver={(e) => {
				if (!e.dataTransfer.types.includes("application/x-roswaal-variable")) return;
				e.preventDefault();
				e.dataTransfer.dropEffect = "copy";
			}}
			onDrop={(e) => {
				const raw = e.dataTransfer.getData("application/x-roswaal-variable");
				if (!raw) return;
				e.preventDefault();
				const { id } = JSON.parse(raw) as { id: string };
				const world = toWorld(e.clientX, e.clientY);
				// Ctrl gives a Set instead of a Get, the way Blueprints do it.
				const defId = e.ctrlKey ? "variable.set" : "variable.get";
				const def = registry.get(defId);
				if (!def) return;
				store.edit((s) => {
					const added = addNode(s, def, world.x - NODE.width / 2, world.y - 20);
					queueMicrotask(() => store.select([added.id]));
					return bindNodeToVariable(added.script, added.id, id);
				});
			}}
		>
			<GridLayer view={view} />

			<div className="watermark" style={{ zIndex: LAYER.watermark }}>
				<small>{script.scriptClass}</small>
				{script.name}
			</div>

			<div className="world" style={worldStyle}>
				{commentsByArea(script.comments).map((comment, index) => (
					<CommentView
						key={comment.id}
						comment={comment}
						/* Larger comments render first and sit further back, so a
						   nested comment is never buried by the one containing it. */
						depth={index}
						selected={selection.has(comment.id)}
						editing={editingComment === comment.id}
						onPointerDown={onCommentPointerDown}
						onResize={onCommentResize}
						onStartEdit={() => setEditingComment(comment.id)}
						onCommit={(text) => {
							setEditingComment(null);
							store.edit((s) => updateComment(s, comment.id, { text }));
						}}
					/>
				))}

				<svg className="wires" style={{ zIndex: LAYER.wire }}>
					{script.links.map((link) => {
						const fromNode = nodesById.get(link.from.node);
						const toNode = nodesById.get(link.to.node);
						if (!fromNode || !toNode) return null;
						const a = pinPosition(fromNode, registry, link.from.pin, "out");
						const b = pinPosition(toNode, registry, link.to.pin, "in");
						if (!a || !b) return null;
						const pin = pinDefOf(registry, script, link.from, "out");
						const isExec = pin?.kind === "exec";
						const path = wirePath(a, b);
						return (
							<g key={link.id}>
								<path
									className="hit"
									d={path}
									onPointerDown={(e) => {
										// Alt-click severs a wire without a menu round trip.
										if (!e.altKey) return;
										e.stopPropagation();
										store.edit((s) => removeLink(s, link.id));
									}}
								/>
								<path
									d={path}
									stroke={isExec ? "var(--wire-exec)" : pinColor(pin?.type, "data")}
									strokeWidth={isExec ? 2.4 : 1.8}
									opacity={isExec ? 0.95 : 0.85}
								/>
							</g>
						);
					})}
					{liveWire && (
						<path
							d={liveWire}
							stroke="var(--select)"
							strokeWidth={2.2}
							strokeDasharray="6 4"
							style={{ zIndex: LAYER.wireDrag }}
						/>
					)}
				</svg>

				{script.nodes.map((node) => (
					<NodeView
						key={node.id}
						node={node}
						def={registry.get(node.def)}
						selected={selection.has(node.id)}
						errorCount={errorsByNode.get(node.id) ?? 0}
						connected={connectedPins}
						drag={wireDrag}
						canAccept={canAccept}
						onNodePointerDown={onNodePointerDown}
						onPinPointerDown={onPinPointerDown}
						onPinPointerUp={onPinPointerUp}
						onLiteralChange={onLiteralChange}
						onContextMenu={(e, id) => {
							if (!selection.has(id)) store.select([id]);
							const box = surface.current!.getBoundingClientRect();
							onRequestMenu(
								{ x: e.clientX - box.left, y: e.clientY - box.top },
								toWorld(e.clientX, e.clientY),
							);
						}}
					/>
				))}
			</div>

			{marquee && (
				<div
					className="marquee"
					style={{
						zIndex: LAYER.marquee,
						left: marquee.x * view.zoom + view.x,
						top: marquee.y * view.zoom + view.y,
						width: marquee.w * view.zoom,
						height: marquee.h * view.zoom,
					}}
				/>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------

/**
 * The grid, painted as a repeating background rather than drawn.
 *
 * Two densities are layered: the fine grid fades out when zoomed far enough
 * that it would turn into a flat wash, leaving the coarse grid to carry the
 * sense of scale.
 */
function GridLayer({ view }: { view: View }) {
	const fine = GRID.fine * view.zoom;
	const coarse = fine * GRID.coarseMultiple;
	const showFine = view.zoom >= GRID.fineFadeBelow;

	const layers: string[] = [];
	const sizes: string[] = [];
	const positions: string[] = [];

	const add = (color: string, size: number) => {
		layers.push(
			`linear-gradient(to right, ${color} 1px, transparent 1px)`,
			`linear-gradient(to bottom, ${color} 1px, transparent 1px)`,
		);
		sizes.push(`${size}px ${size}px`, `${size}px ${size}px`);
		positions.push(`${view.x}px ${view.y}px`, `${view.x}px ${view.y}px`);
	};

	if (showFine) add("var(--grid-fine)", fine);
	add("var(--grid-coarse)", coarse);

	return (
		<div
			className="grid"
			style={{
				zIndex: LAYER.grid,
				backgroundImage: layers.join(","),
				backgroundSize: sizes.join(","),
				backgroundPosition: positions.join(","),
			}}
		/>
	);
}

interface CommentViewProps {
	comment: Comment;
	depth: number;
	selected: boolean;
	editing: boolean;
	onPointerDown: (e: ReactPointerEvent, comment: Comment) => void;
	onResize: (e: ReactPointerEvent, comment: Comment) => void;
	onStartEdit: () => void;
	onCommit: (text: string) => void;
}

function CommentView(props: CommentViewProps) {
	const { comment } = props;
	const color = `#${comment.color ?? COMMENT_DEFAULT_COLOR}`;

	return (
		<div
			className={`comment${props.selected ? " selected" : ""}`}
			style={{
				left: comment.x,
				top: comment.y,
				width: comment.w,
				height: comment.h,
				zIndex: LAYER.comment + props.depth,
				["--comment-color" as string]: color,
			}}
		>
			<div
				className="bar"
				style={{ zIndex: LAYER.commentHeader }}
				onPointerDown={(e) => props.onPointerDown(e, comment)}
				onDoubleClick={props.onStartEdit}
			>
				{props.editing ? (
					<input
						autoFocus
						defaultValue={comment.text}
						onPointerDown={(e) => e.stopPropagation()}
						onBlur={(e) => props.onCommit(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") (e.target as HTMLInputElement).blur();
							if (e.key === "Escape") props.onCommit(comment.text);
						}}
					/>
				) : (
					comment.text
				)}
			</div>
			<div className="resize" onPointerDown={(e) => props.onResize(e, comment)} />
		</div>
	);
}

// ---------------------------------------------------------------------------

function pinDefOf(
	registry: Registry, script: NodeScript, ref: PinRef, side: "in" | "out",
): PinDef | undefined {
	const node = script.nodes.find((n) => n.id === ref.node);
	const def = node && registry.get(node.def);
	if (!node || !def) return undefined;
	const derived = def.derivePins?.(node.config ?? {}) ?? { inputs: def.inputs, outputs: def.outputs };
	return (side === "in" ? derived.inputs : derived.outputs).find((p) => p.id === ref.pin);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export { NODE };
