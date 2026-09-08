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
import { resolveNodePins, type Registry } from "../core/nodes/index.js";
import type { Diagnostic } from "../core/compiler/index.js";
import {
	nodeBounds, pinPosition, rectFromPoints, rectsIntersect, screenToWorld, wirePath,
	type WireStyle,
	type Rect, type Vec, type View,
} from "./geometry.js";
import { GRID, LAYER, NODE, ZOOM } from "./layers.js";
import { pinColor } from "./palette.js";
import { NodeView, type PinDragState } from "./NodeView.jsx";
import {
	addNode, bindNodeToVariable, canConnect, commentContents, commentsByArea, connect,
	capturePlacements, currentArity, disconnectPin, growNode, growthRule,
	insertReroute, pinLinkCount, placeNodes, removeLink, setLiteral, updateComment,
	type Placement,
} from "./edits.js";
import { store, useEditor, useView } from "./store.js";

const COMMENT_DEFAULT_COLOR = "6a8fbf";

export interface CanvasProps {
	script: NodeScript;
	registry: Registry;
	diagnostics: Diagnostic[];
	/**
	 * Opens the palette. `from` is set when a wire was released over empty
	 * canvas, so the node picked can be wired up rather than the wire dropped.
	 */
	onRequestMenu: (
		screen: Vec, world: Vec,
		from?: { ref: PinRef; side: "in" | "out"; pin: PinDef },
	) => void;
	onRequestPinMenu: (screen: Vec, nodeId: string, pin: PinDef, side: "in" | "out") => void;
	onEditCode: (nodeId: string, pin: PinDef, value: string) => void;
	/** A file dragged in from the project tree, dropped at this point. */
	onDropFile: (path: string, screen: Vec, world: Vec) => void;
	/**
	 * The graph is being compiled and must not be edited.
	 *
	 * A change made while the walk is running lands in the written file or does
	 * not, depending on where the walk had got to when you made it — and the
	 * file then disagrees with the graph with nothing to say so. Locking is the
	 * cheap half of the fix; the compile is a second or two.
	 */
	locked?: boolean;
	/**
	 * How wires are drawn. A preference, threaded in rather than read here, so
	 * the canvas stays a component that renders what it is given — and so the
	 * live wire being dragged uses the same style as the ones already placed.
	 */
	wireStyle?: WireStyle;
}

type Gesture =
	| { kind: "none" }
	| { kind: "pan"; startView: View; origin: Vec }
	| { kind: "marquee"; origin: Vec; additive: boolean }
	| {
			kind: "move";
			origin: Vec;
			ids: ReadonlySet<string>;
			/** Positions at the moment the drag began, so snapping has an origin. */
			start: Map<string, Placement>;
			/** The thing actually grabbed; the group snaps relative to it. */
			anchor: string;
	  }
	| { kind: "wire"; from: PinRef; side: "in" | "out"; pin: PinDef }
	| { kind: "resize"; id: string; origin: Vec; start: { w: number; h: number } };

export function Canvas({
	script, registry, diagnostics, onRequestMenu, onRequestPinMenu, onEditCode, onDropFile,
	locked = false, wireStyle = "curved",
}: CanvasProps) {
	const { selection } = useEditor();
	const view = useView();
	const surface = useRef<HTMLDivElement>(null);
	const gesture = useRef<Gesture>({ kind: "none" });

	const [pointer, setPointer] = useState<Vec | null>(null);
	const [marquee, setMarquee] = useState<Rect | null>(null);
	const [wireDrag, setWireDrag] = useState<PinDragState | null>(null);
	/**
	 * Whether a pin took the wire. A drop that lands on a pin the wire cannot
	 * join used to be swallowed silently — which is most of the pin column,
	 * since a pin's hit area is deliberately larger than its dot. Now it falls
	 * through to the node, which grows a pin for it.
	 */
	const wireHandled = useRef(false);
	const [editingComment, setEditingComment] = useState<string | null>(null);

	// -- derived -----------------------------------------------------------

	// Keyed by side as well as pin, because a node may legitimately have an
	// input and an output with the same id -- Get Service takes a "service" and
	// gives one back. Without the side, wiring the output would hide the input's
	// editor.
	const connectedPins = useMemo(() => {
		const set = new Set<string>();
		for (const link of script.links) {
			set.add(`out:${link.from.node}/${link.from.pin}`);
			set.add(`in:${link.to.node}/${link.to.pin}`);
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

	const growth = useMemo(() => {
		const map = new Map<string, { canAdd: boolean; canRemove: boolean; label: string }>();
		for (const node of script.nodes) {
			const def = registry.get(node.def);
			const rule = growthRule(def);
			if (!rule) continue;
			const count = currentArity(node, def, rule);
			map.set(node.id, {
				canAdd: count < rule.max,
				canRemove: count > rule.min,
				label: rule.label,
			});
		}
		return map;
	}, [script.nodes, registry]);

	const onGrow = useCallback(
		(nodeId: string, delta: number) => {
			store.edit((s) => growNode(s, registry, nodeId, delta).script);
		},
		[registry],
	);

	// -- coordinate helpers ------------------------------------------------

	const toWorld = useCallback(
		(clientX: number, clientY: number): Vec => {
			const box = surface.current?.getBoundingClientRect();
			const v = store.getView();
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
			const current = store.getView();

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
					let dx = world.x - g.origin.x;
					let dy = world.y - g.origin.y;

					// Shift snaps the grabbed node to the grid, and everything else
					// moves with it — so a selection keeps its shape and lands square
					// rather than each node rounding to a different cell.
					if (e.shiftKey) {
						const anchor = g.start.get(g.anchor);
						if (anchor) {
							dx = snapToGrid(anchor.x + dx) - anchor.x;
							dy = snapToGrid(anchor.y + dy) - anchor.y;
						}
					}
					store.apply((s) => placeNodes(s, g.start, dx, dy));
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
			if (g.kind === "wire" && !wireHandled.current) {
				const target = document.elementFromPoint(e.clientX, e.clientY);
				const onNode = target?.closest<HTMLElement>(".node");

				// Dropped on a node that can take another input: grow it and land
				// on the pin that appears. Anywhere on the node counts, including
				// the pin column — a pin that could not take the wire has already
				// declined it by this point.
				if (onNode && g.side === "out" && g.pin.kind === "data") {
					const nodeId = onNode.dataset.nodeId;
					if (nodeId && nodeId !== g.from.node && growth.get(nodeId)?.canAdd) {
						store.edit((s) => {
							const grown = growNode(s, registry, nodeId, 1, {
								name: g.pin.name || undefined,
								type: g.pin.type,
							});
							if (!grown.pin) return grown.script;
							return connect(grown.script, registry, g.from, { node: nodeId, pin: grown.pin });
						});
						endGesture();
						return;
					}
				}

				// Released over nothing: offer the palette, and carry the pin with
				// it so whatever is picked arrives already wired. Dropping a wire
				// into space and getting an unconnected node was the one part of
				// this gesture that did not finish the thought.
				if (!onNode) {
					const box = surface.current!.getBoundingClientRect();
					onRequestMenu(
						{ x: e.clientX - box.left, y: e.clientY - box.top },
						toWorld(e.clientX, e.clientY),
						{ ref: g.from, side: g.side, pin: g.pin },
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
				startView: store.getView(),
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
		gesture.current = {
			kind: "move",
			origin: toWorld(e.clientX, e.clientY),
			ids,
			start: capturePlacements(script, ids),
			anchor: nodeId,
		};
	}

	function onPinPointerDown(
		e: ReactPointerEvent, nodeId: string, pin: PinDef, side: "in" | "out",
	) {
		if (e.button !== 0) return;
		e.stopPropagation();

		// Shift-click clears the pin. Cutting a wire otherwise means finding the
		// curve and alt-clicking it, which is fiddly when several overlap near
		// the pin they all end at.
		if (e.shiftKey) {
			if (pinLinkCount(script, nodeId, pin.id, side) > 0) {
				store.edit((s) => disconnectPin(s, nodeId, pin.id, side));
			}
			return;
		}

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

		wireHandled.current = false;
		gesture.current = { kind: "wire", from: { node: nodeId, pin: pin.id }, side, pin };
		setWireDrag({ from: { node: nodeId, pin: pin.id }, side, kind: pin.kind, type: pin.type });
		setPointer(toWorld(e.clientX, e.clientY));
	}

	function onPinPointerUp(
		e: ReactPointerEvent, nodeId: string, pin: PinDef, side: "in" | "out",
	) {
		const g = gesture.current;
		if (g.kind !== "wire" || g.side === side) return;

		const from = side === "in" ? g.from : { node: nodeId, pin: pin.id };
		const to = side === "in" ? { node: nodeId, pin: pin.id } : g.from;

		// A pin that cannot take this wire does not consume the drop; the window
		// handler decides what else to do with it.
		if (!canConnect(script, registry, from, to).ok) return;

		e.stopPropagation();
		wireHandled.current = true;
		store.edit((s) => connect(s, registry, from, to));
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

	const onLiteralChange = useCallback((nodeId: string, pinId: string, value: Literal | undefined) => {
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
		gesture.current = {
			kind: "move",
			origin: toWorld(e.clientX, e.clientY),
			ids,
			start: capturePlacements(script, ids),
			anchor: comment.id,
		};
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
		return g.side === "out"
			? wirePath(anchor, pointer, wireStyle)
			: wirePath(pointer, anchor, wireStyle);
	})();

	return (
		<div
			className={`canvas${wireDrag ? " wiring" : ""}${locked ? " locked" : ""}`}
			ref={surface}
			tabIndex={0}
			onPointerDown={onSurfacePointerDown}
			onContextMenu={(e) => {
				e.preventDefault();
				// Viewport coordinates, not canvas-relative: every menu is
				// `position: fixed`, so subtracting the canvas origin here would
				// open it a sidebar's width to the left of the pointer.
				onRequestMenu({ x: e.clientX, y: e.clientY }, toWorld(e.clientX, e.clientY));
			}}
			onDragOver={(e) => {
				const kinds = e.dataTransfer.types;
				if (
					!kinds.includes("application/x-roswaal-variable") &&
					!kinds.includes("application/x-roswaal")
				) {
					return;
				}
				e.preventDefault();
				e.dataTransfer.dropEffect = "copy";
			}}
			onDrop={(e) => {
				// A file from the project tree: the caller works out where it lives
				// in the DataModel and offers what can be done with it.
				const files = e.dataTransfer.getData("application/x-roswaal");
				if (files) {
					e.preventDefault();
					const paths = JSON.parse(files) as string[];
					if (paths[0]) {
						onDropFile(
							paths[0],
							{ x: e.clientX, y: e.clientY },
							toWorld(e.clientX, e.clientY),
						);
					}
					return;
				}

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
						const fromPin = pinDefOf(registry, script, link.from, "out");
						const toPin = pinDefOf(registry, script, link.to, "in");
						const isExec = fromPin?.kind === "exec";
						const path = wirePath(a, b, wireStyle);

						const fromColor = pinColor(fromPin?.type, "data");
						const toColor = pinColor(toPin?.type, "data");
						// A wire whose ends disagree about type is a coercion — an
						// `any` landing on a function pin, say. Fading between the two
						// colours says so on the wire itself, which is the only place
						// you are looking when two `any` wires cross.
						const coerces = !isExec && fromColor !== toColor;
						const gradientId = `wire-${link.id}`;

						return (
							<g key={link.id}>
								{coerces && (
									<linearGradient
										id={gradientId}
										gradientUnits="userSpaceOnUse"
										x1={a.x}
										y1={a.y}
										x2={b.x}
										y2={b.y}
									>
										{/* Held flat near each end so a pin's own colour still
										    reads there, with the blend in the middle. */}
										<stop offset="0%" stopColor={fromColor} />
										<stop offset="18%" stopColor={fromColor} />
										<stop offset="82%" stopColor={toColor} />
										<stop offset="100%" stopColor={toColor} />
									</linearGradient>
								)}
								<path
									className="hit"
									d={path}
									onPointerDown={(e) => {
										// Alt-click severs a wire without a menu round trip.
										if (!e.altKey) return;
										e.stopPropagation();
										store.edit((s) => removeLink(s, link.id));
									}}
									onDoubleClick={(e) => {
										// Double-click puts a knot where you clicked, so a wire
										// can be routed around a node instead of through it.
										e.stopPropagation();
										const world = toWorld(e.clientX, e.clientY);
										store.edit((s) => {
											const added = insertReroute(s, registry, link.id, world);
											if (!added) return s;
											queueMicrotask(() => store.select([added.id]));
											return added.script;
										});
									}}
								>
									<title>
										{isExec
											? "Execution"
											: coerces
												? `${fromPin?.type ?? "any"} → ${toPin?.type ?? "any"}`
												: (fromPin?.type ?? "any")}
									</title>
								</path>
								<path
									d={path}
									stroke={
										isExec
											? "var(--wire-exec)"
											: coerces
												? `url(#${gradientId})`
												: fromColor
									}
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
						onPinContextMenu={(e, id, pin, side) =>
							onRequestPinMenu({ x: e.clientX, y: e.clientY }, id, pin, side)
						}
						onLiteralChange={onLiteralChange}
						onEditCode={onEditCode}
						onGrow={onGrow}
						growth={growth.get(node.id) ?? null}
						onContextMenu={(e, id) => {
							if (!selection.has(id)) store.select([id]);
							onRequestMenu({ x: e.clientX, y: e.clientY }, toWorld(e.clientX, e.clientY));
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

			{/* Over everything, so it swallows the pointer rather than relying on
			    each handler below to check. The border is on the canvas itself —
			    see `.canvas.locked` — because a border drawn by this element
			    would disappear with it. */}
			{locked && (
				<div className="canvas-lock" style={{ zIndex: LAYER.lock }}>
					<span>Compiling — the graph is read-only until it finishes</span>
				</div>
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
	const derived = resolveNodePins(def, node.config);
	return (side === "in" ? derived.inputs : derived.outputs).find((p) => p.id === ref.pin);
}

/** Rounds to the nearest grid intersection, which is what shift-drag lands on. */
function snapToGrid(value: number): number {
	return Math.round(value / GRID.fine) * GRID.fine;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export { NODE };
