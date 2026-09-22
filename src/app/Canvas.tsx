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

import type { Comment, Literal, NodeConfig, NodeScript, PinDef, PinRef } from "../core/schema.js";
import { resolveNodePins, type Registry } from "../core/nodes/index.js";
import type { Diagnostic } from "../core/compiler/index.js";
import { viewOf, type GraphId } from "../core/functionGraph.js";
import {
	isReroute, nodeBounds, pinPosition, rectFromPoints, rectsIntersect, screenToWorld, wirePath,
	type WireStyle,
	type Rect, type Vec, type View,
} from "./geometry.js";
import { GRID, LAYER, NODE, ZOOM } from "./layers.js";
import { commentColor, pinColor } from "./palette.js";
import { serviceFromSource } from "../core/serviceCalls.js";
import { NodeView, type PinDragState } from "./NodeView.jsx";
import {
	addNode, bindNodeToFunction, bindNodeToLocal, bindNodeToVariable, canConnect, commentContents,
	wireLanding,
	commentsByArea, connect,
	capturePlacements, currentArity, disconnectPin, growNode, growthRule,
	insertReroute, pinLinkCount, placeNodes, removeLink, selectionAnchor, setConfig, setLiteral,
	updateComment,
	type Placement,
} from "./edits.js";
import { store, useEditor, useView } from "./store.js";

/**
 * The smallest a comment may be dragged to.
 *
 * Named because two corners now enforce it and they have to agree: a
 * top-left drag stops where a bottom-right drag would have stopped.
 */
const COMMENT_MIN = { w: 160, h: 96 } as const;

/** What can be dropped on the canvas: what the panels and the tree drag out. */
export const DROPPABLE = [
	"application/x-roswaal-variable",
	"application/x-roswaal-local",
	"application/x-roswaal-function",
	"application/x-roswaal-module",
	"application/x-roswaal-type",
	"application/x-roswaal-node",
	"application/x-roswaal",
] as const;


export interface CanvasProps {
	/** The whole script. The canvas draws one graph of it. */
	script: NodeScript;
	/** Which graph: a function's id, or null for the nodescript's own. */
	graph?: GraphId;
	registry: Registry;
	diagnostics: Diagnostic[];
	/**
	 * Opens the palette. `from` is set when a wire was released over empty
	 * canvas, so the node picked can be wired up rather than the wire dropped.
	 */
	onRequestMenu: (
		screen: Vec, world: Vec,
		from?: { ref: PinRef; side: "in" | "out"; pin: PinDef; service?: string },
	) => void;
	/**
	 * Ctrl and the right mouse button: the node picker, which draws what it
	 * offers. Absent leaves the gesture as an ordinary right-click.
	 */
	onRequestNodePicker?: (world: Vec) => void;
	/**
	 * A node dragged off the node picker's list, dropped here. The caller
	 * places it, since placing one is the picker's job and it closes after.
	 */
	onDropNode?: (defId: string, config: NodeConfig | undefined, world: Vec) => void;
	onRequestPinMenu: (screen: Vec, nodeId: string, pin: PinDef, side: "in" | "out") => void;
	onEditCode: (nodeId: string, pin: PinDef, value: string) => void;
	/**
	 * Where the pointer is over the canvas, in world coordinates, and `null`
	 * once it leaves.
	 *
	 * For paste, which has to place a clipping at the pointer without having an
	 * event of its own to read it from -- a keystroke does not say where the
	 * mouse is. Called on every move, so the caller is expected to put it in a
	 * ref rather than in state.
	 */
	onPointerAt?: (world: Vec | null) => void;
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
	/**
	 * Draw a node wide enough for its header rather than truncating it.
	 *
	 * Threaded in for the reason `wireStyle` is — but this one moves pins, so
	 * the same answer has to reach the wire router and the node itself, or a
	 * wire would end where the node used to be.
	 */
	wideNodes?: boolean;
	/**
	 * What scrolling does with nothing held: zoom, as a mouse wheel always has
	 * here, or pan, which is what a trackpad's two-finger drag means. Resolved
	 * from the preference by the caller. Pinching zooms either way.
	 */
	wheel?: "zoom" | "pan";
}

type Gesture =
	| { kind: "none" }
	| {
			kind: "pan"; startView: View; origin: Vec;
			/**
			 * A finger on empty canvas pans rather than drawing a marquee, so it
			 * cannot clear the selection on the way down the way a click does.
			 * It does so on the way up instead, if it never moved: a tap.
			 */
			tap?: boolean;
	  }
	/**
	 * A finger held still on empty canvas, which is now one of two things.
	 *
	 * Drag from here and it is a marquee; lift and it is the menu a
	 * right-click opens. Apple's Freeform works the same way, and it is the
	 * only way a finger can draw a marquee at all -- a finger that simply
	 * moves on empty canvas pans. `client` is where it was held, in viewport
	 * coordinates, because both answers start there.
	 */
	| { kind: "hold"; client: Vec }
	/** Two fingers: zoom by how far apart they are, pan by where they are. */
	| { kind: "pinch"; startView: View; ids: [number, number]; distance: number; middle: Vec }
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
	/**
 * Resizing a comment, from either corner.
 *
 * The **whole** starting box, not just its size: dragging the top-left moves
 * the box as well as resizing it, and it has to move by exactly what the size
 * lost. Working that out from the current box each frame accumulates rounding
 * and the opposite corner creeps.
 */
| { kind: "resize"; id: string; corner: "nw" | "se"; origin: Vec; start: Rect };

export function Canvas({
	script: whole, graph = null, registry, diagnostics, onRequestMenu, onRequestNodePicker, onDropNode,
	onRequestPinMenu, onEditCode,
	onPointerAt,
	onDropFile, locked = false, wireStyle = "curved", wideNodes = false, wheel = "zoom",
}: CanvasProps) {
	const { selection, path } = useEditor();
	/**
	 * The graph on screen, as a script of its own.
	 *
	 * Everything below that reads, draws or hit-tests reads this; everything that
	 * edits goes through `store.edit` against the whole script, by id. That split
	 * is what keeps select-all, marquee and delete to what you can see.
	 */
	const script = useMemo(() => viewOf(whole, graph), [whole, graph]);
	const functionName = useMemo(() => {
		if (graph === null) return null;
		const fn = whole.nodes.find((n) => n.id === graph);
		return (fn?.config as { name?: string } | undefined)?.name?.trim() || "function";
	}, [whole, graph]);
	const openFunction = useCallback((id: string) => {
		if (path) store.openFunction(path, id);
	}, [path]);
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
	/** Where a held finger is, relative to the canvas, so it can be ringed. */
	const [holdAt, setHoldAt] = useState<Vec | null>(null);

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

	/**
	 * Warnings, so a node can say it needs attention before it needs fixing.
	 *
	 * The case this exists for: a Lune call whose module nothing requires. The
	 * Inspector says so and offers the button, and until now the canvas said
	 * nothing — so a node you had put down and not yet opened looked fine.
	 */
	const warningsByNode = useMemo(() => {
		const map = new Map<string, number>();
		for (const d of diagnostics) {
			// Only the ones that opted in. Most warnings are about where a node
			// sits rather than what it is, and "not connected to anything that
			// runs" is true of every node the moment it is dropped.
			if (d.severity !== "warning" || !d.node || !d.attention) continue;
			map.set(d.node, (map.get(d.node) ?? 0) + 1);
		}
		return map;
	}, [diagnostics]);

	/**
	 * The node the rest of a selection would line up on, marked on the canvas.
	 *
	 * Null with fewer than two selected: one node is already where it would be
	 * put, so calling it the anchor is a badge with nothing behind it.
	 */
	const anchorId = useMemo(
		() => (selection.size > 1 ? selectionAnchor(script, selection) : null),
		[script, selection],
	);

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

	// -- zoom and scroll ---------------------------------------------------

	/** Read by listeners bound once, so a changed preference reaches them. */
	const wheelMode = useRef(wheel);
	wheelMode.current = wheel;

	/** Touches down on the canvas, by pointer id, in client coordinates. */
	const touches = useRef(new Map<number, Vec>());
	/**
	 * The pointer driving the gesture in progress.
	 *
	 * A mouse has one, so this never mattered. Fingers are several, and without
	 * it the second finger of a pinch moved whatever the first had grabbed.
	 */
	const activePointer = useRef<number | null>(null);

	useEffect(() => {
		const element = surface.current;
		if (!element) return;

		/** Zoom by `factor` about a point on the canvas, which stays where it is. */
		const zoomAbout = (sx: number, sy: number, factor: number, from = store.getView()) => {
			const zoom = clamp(from.zoom * factor, ZOOM.min, ZOOM.max);
			if (zoom === store.getView().zoom) return;
			const wx = (sx - from.x) / from.zoom;
			const wy = (sy - from.y) / from.zoom;
			store.setView({ x: sx - wx * zoom, y: sy - wy * zoom, zoom });
		};

		/** Safari's own pinch, while one is in progress. See below. */
		let pinch: { view: View; sx: number; sy: number } | null = null;

		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			// Safari reports a trackpad pinch twice over; the gesture events own it.
			if (pinch) return;
			const box = element.getBoundingClientRect();
			const sx = e.clientX - box.left;
			const sy = e.clientY - box.top;
			// Lines and pages are what a mouse wheel sends in Firefox. Pixels are
			// what everything else is measured in.
			const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? box.height : 1;
			const dx = e.deltaX * unit;
			const dy = e.deltaY * unit;

			// Ctrl is also what a browser adds to a trackpad pinch, so this is the
			// pinch as well as Ctrl+wheel. Anything sideways is a trackpad or a
			// tilting wheel, and only ever meant to move.
			const zooming = e.ctrlKey || e.metaKey || (wheelMode.current === "zoom" && dx === 0);
			if (!zooming) {
				const current = store.getView();
				store.setView({ ...current, x: current.x - dx, y: current.y - dy });
				return;
			}
			if (dy === 0) return;
			// A wheel notch is one step, whatever size the browser calls it. A
			// pinch arrives as a stream of small deltas and follows the fingers.
			const factor = e.deltaMode !== 0 || Math.abs(dy) >= 50
				? (dy < 0 ? ZOOM.step : 1 / ZOOM.step)
				: Math.exp(-dy * 0.01);
			zoomAbout(sx, sy, factor);
		};

		/**
		 * A pinch in Safari, on a Mac's trackpad or an iPad.
		 *
		 * Safari sends these instead of Ctrl+wheel, and zooms the whole page if
		 * nobody cancels them. `scale` is relative to the start of the gesture,
		 * so the view it started from is kept rather than compounded.
		 *
		 * Fingers on the glass are the canvas's own pinch — see `pinch` in the
		 * gestures — so these are only acted on when no touch is down.
		 */
		type SafariGesture = Event & { scale: number; clientX: number; clientY: number };
		const onGestureStart = (event: Event) => {
			event.preventDefault();
			if (touches.current.size > 0) return;
			const e = event as SafariGesture;
			const box = element.getBoundingClientRect();
			pinch = { view: store.getView(), sx: e.clientX - box.left, sy: e.clientY - box.top };
		};
		const onGestureChange = (event: Event) => {
			event.preventDefault();
			if (!pinch || touches.current.size > 0) return;
			zoomAbout(pinch.sx, pinch.sy, (event as SafariGesture).scale, pinch.view);
		};
		const onGestureEnd = (event: Event) => {
			event.preventDefault();
			pinch = null;
		};

		element.addEventListener("wheel", onWheel, { passive: false });
		element.addEventListener("gesturestart", onGestureStart);
		element.addEventListener("gesturechange", onGestureChange);
		element.addEventListener("gestureend", onGestureEnd);
		return () => {
			element.removeEventListener("wheel", onWheel);
			element.removeEventListener("gesturestart", onGestureStart);
			element.removeEventListener("gesturechange", onGestureChange);
			element.removeEventListener("gestureend", onGestureEnd);
		};
	}, []);

	// -- gesture plumbing --------------------------------------------------

	const endGesture = useCallback(() => {
		const g = gesture.current;
		if (g.kind === "move" || g.kind === "resize") store.end();
		gesture.current = { kind: "none" };
		activePointer.current = null;
		setMarquee(null);
		setWireDrag(null);
		setHoldAt(null);
	}, []);

	useEffect(() => {
		const onMove = (e: PointerEvent) => {
			if (touches.current.has(e.pointerId)) {
				touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
			}
			const g = gesture.current;
			if (g.kind === "none") return;
			if (g.kind === "pinch") {
				const a = touches.current.get(g.ids[0]);
				const b = touches.current.get(g.ids[1]);
				if (!a || !b) return;
				const box = surface.current!.getBoundingClientRect();
				const zoom = clamp(
					g.startView.zoom * Math.hypot(a.x - b.x, a.y - b.y) / g.distance,
					ZOOM.min, ZOOM.max,
				);
				// The world point that was between the fingers stays between them,
				// wherever they have moved to.
				const wx = (g.middle.x - g.startView.x) / g.startView.zoom;
				const wy = (g.middle.y - g.startView.y) / g.startView.zoom;
				const mx = (a.x + b.x) / 2 - box.left;
				const my = (a.y + b.y) / 2 - box.top;
				store.setView({ x: mx - wx * zoom, y: my - wy * zoom, zoom });
				return;
			}
			if (activePointer.current !== null && e.pointerId !== activePointer.current) return;
			// A held finger that moves draws a marquee from where it was held.
			if (g.kind === "hold") {
				if (Math.hypot(e.clientX - g.client.x, e.clientY - g.client.y) < 8) return;
				store.clearSelection();
				setHoldAt(null);
				gesture.current = {
					kind: "marquee",
					origin: toWorld(g.client.x, g.client.y),
					additive: false,
				};
				setMarquee(rectFromPoints(gesture.current.origin, toWorld(e.clientX, e.clientY)));
				return;
			}
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
					store.apply((s) => placeNodes(s, g.start, dx, dy, graph));
					break;
				}
				case "resize": {
					const dx = world.x - g.origin.x;
					const dy = world.y - g.origin.y;
					/**
					 * The bottom-right corner grows the box. The top-left moves it
					 * *and* shrinks it by the same amount, so the opposite corner
					 * stays where it is — which is the whole reason to grab that
					 * corner rather than the other one.
					 *
					 * Clamped by taking the smaller of the drag and what is left
					 * above the minimum, so a top-left drag that runs out of box
					 * stops moving instead of sliding on past its own bottom-right.
					 */
					const patch = g.corner === "se"
						? {
								w: Math.max(COMMENT_MIN.w, g.start.w + dx),
								h: Math.max(COMMENT_MIN.h, g.start.h + dy),
							}
						: (() => {
								const takeX = Math.min(dx, g.start.w - COMMENT_MIN.w);
								const takeY = Math.min(dy, g.start.h - COMMENT_MIN.h);
								return {
									x: g.start.x + takeX,
									y: g.start.y + takeY,
									w: g.start.w - takeX,
									h: g.start.h - takeY,
								};
							})();
					store.apply((s) => updateComment(s, g.id, patch));
					break;
				}
			}
		};

		const onUp = (e: PointerEvent) => {
			const lifted = touches.current.delete(e.pointerId);
			const g = gesture.current;
			if (g.kind === "pinch") {
				// Either finger ends it. The one left behind does not pick up a
				// pan halfway through: it would jump by however far the middle
				// of the pinch was from it.
				if (lifted && g.ids.includes(e.pointerId)) endGesture();
				return;
			}
			if (activePointer.current !== null && e.pointerId !== activePointer.current) return;
			// Held and lifted without moving: the menu, where it was held.
			if (g.kind === "hold") {
				endGesture();
				onRequestMenu(g.client, toWorld(g.client.x, g.client.y));
				return;
			}
			if (g.kind === "pan" && g.tap) {
				const box = surface.current!.getBoundingClientRect();
				const moved = Math.hypot(
					e.clientX - box.left - g.origin.x, e.clientY - box.top - g.origin.y,
				);
				if (moved < 8) store.clearSelection();
			}
			if (g.kind === "marquee" && marquee) commitMarquee(marquee, g.additive);
			if (g.kind === "wire" && !wireHandled.current) {
				const target = document.elementFromPoint(e.clientX, e.clientY);
				const onNode = target?.closest<HTMLElement>(".node");

				// Dropped on a node that can take another input: grow it and land
				// on the pin that appears. Anywhere on the node counts, including
				// the pin column — a pin that could not take the wire has already
				// declined it by this point.
				//
				// Only when the new pin could take the wire. A Sequence grows an
				// execution output and a function grows a parameter, which is an
				// output too, so dropping a data wire on either used to add a pin
				// nothing could connect to and leave it there.
				if (onNode && g.side === "out" && g.pin.kind === "data") {
					const nodeId = onNode.dataset.nodeId;
					if (nodeId && nodeId !== g.from.node && growth.get(nodeId)?.canAdd) {
						store.edit((s) => {
							const grown = growNode(s, registry, nodeId, 1, {
								name: g.pin.name || undefined,
								type: g.pin.type,
							});
							if (!grown.pin) return s;
							const target = { node: nodeId, pin: grown.pin };
							if (!canConnect(grown.script, registry, g.from, target).ok) return s;
							return connect(grown.script, registry, g.from, target);
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
					// Which service the wire carries, if any, so the menu can open
					// on that service's methods rather than on everything.
					const source = script.nodes.find((n) => n.id === g.from.node);
					const service = g.side === "out"
						? serviceFromSource(source, g.pin.type)
						: undefined;
					onRequestMenu(
						{ x: e.clientX - box.left, y: e.clientY - box.top },
						toWorld(e.clientX, e.clientY),
						{ ref: g.from, side: g.side, pin: g.pin, service },
					);
				}
			}
			endGesture();
		};

		/**
		 * The browser took the pointer back, which iPadOS does when a system
		 * gesture starts. Whatever was half-done stays where it got to, and no
		 * menu opens for a release that never happened.
		 */
		const onCancel = (e: PointerEvent) => {
			touches.current.delete(e.pointerId);
			const g = gesture.current;
			if (g.kind === "none") return;
			if (g.kind === "pinch" ? g.ids.includes(e.pointerId) : e.pointerId === activePointer.current) {
				endGesture();
			}
		};

		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onCancel);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onCancel);
		};
	});

	function commitMarquee(box: Rect, additive: boolean) {
		const hits: string[] = [];
		for (const node of script.nodes) {
			if (rectsIntersect(box, nodeBounds(node, registry, wideNodes))) hits.push(node.id);
		}
		for (const c of script.comments) {
			if (rectsIntersect(box, { x: c.x, y: c.y, w: c.w, h: c.h })) hits.push(c.id);
		}
		store.select(hits, additive ? "add" : "replace");
	}

	// -- background --------------------------------------------------------

	function onSurfacePointerDown(e: ReactPointerEvent) {
		const finger = e.pointerType === "touch";
		if (e.button === 1 || (e.button === 0 && (e.altKey || finger))) {
			const box = surface.current!.getBoundingClientRect();
			gesture.current = {
				kind: "pan",
				startView: store.getView(),
				origin: { x: e.clientX - box.left, y: e.clientY - box.top },
				tap: finger,
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

		// A knot is 22px across and its two pins are stacked at its centre, so a
		// click meant for the knot lands on a pin more often than not. With a
		// modifier held that is unambiguous -- nobody shift-clicks a knot to cut
		// the wire they can see, and cutting it is what used to happen -- so it
		// goes to the selection instead. The wire is still severed by shift- or
		// alt-clicking the wire itself, which is where it is visible.
		if ((e.shiftKey || e.ctrlKey) && isReroute(registry.get(nodesById.get(nodeId)?.def ?? ""))) {
			onNodePointerDown(e, nodeId);
			return;
		}

		// Shift-click clears the pin. Cutting a wire otherwise means finding the
		// curve and alt-clicking it, which is fiddly when several overlap near
		// the pin they all end at.
		if (e.shiftKey) {
			if (pinLinkCount(script, nodeId, pin.id, side) > 0) {
				store.edit((s) => disconnectPin(s, nodeId, pin.id, side, registry));
			}
			return;
		}

		// Grabbing a wired input picks the existing wire up rather than making a
		// second one, which is how you rewire without deleting first.
		if (side === "in") {
			const existing = script.links.find((l) => l.to.node === nodeId && l.to.pin === pin.id);
			if (existing) {
				const sourcePin = pinDefOf(registry, script, existing.from, "out");
				store.edit((s) => removeLink(s, existing.id, registry));
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

	const dropTarget = useCallback(
		(nodeId: string, pin: PinDef, side: "in" | "out", from: "in" | "out") =>
			wireLanding(nodesById.get(nodeId), registry, pin, side, from),
		[nodesById, registry],
	);

	function onPinPointerUp(
		e: ReactPointerEvent, nodeId: string, pin: PinDef, side: "in" | "out",
	) {
		const g = gesture.current;
		if (g.kind !== "wire") return;
		const target = dropTarget(nodeId, pin, side, g.side);
		if (!target) return;
		({ pin, side } = target);

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

	/**
	 * Whether the wire being dragged could land on this pin.
	 *
	 * The same question the drop asks, through the same function. This used to
	 * keep its own shorter list of what fits — same type, `any`, `wildcard` — so
	 * a number dimmed a string pin it would then connect to, and a pin whose
	 * text is pasted into the source lit up and then refused the drop.
	 */
	const canAccept = useCallback(
		(nodeId: string, pin: PinDef, side: "in" | "out"): boolean => {
			const drag = wireDrag;
			if (!drag) return false;
			// A knot's far pin lights up for a drop aimed at its near one, because
			// that is where the drop will actually go. Anything else answers only
			// for itself.
			const target = dropTarget(nodeId, pin, side, drag.side);
			if (!target) return false;
			const here = { node: nodeId, pin: target.pin.id };
			return drag.side === "out"
				? canConnect(script, registry, drag.from, here).ok
				: canConnect(script, registry, here, drag.from).ok;
		},
		[wireDrag, script, registry, dropTarget],
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

	function onCommentResize(e: ReactPointerEvent, comment: Comment, corner: "nw" | "se") {
		if (e.button !== 0) return;
		e.stopPropagation();
		store.begin();
		gesture.current = {
			kind: "resize",
			id: comment.id,
			corner,
			origin: toWorld(e.clientX, e.clientY),
			start: { x: comment.x, y: comment.y, w: comment.w, h: comment.h },
		};
	}

	// -- rendering ---------------------------------------------------------

	const worldStyle: CSSProperties = {
		transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
		zIndex: LAYER.world,
	};

	const liveWire = (() => {
		const g = gesture.current;
		if (g.kind !== "wire" || !pointer) return null;
		const node = nodesById.get(g.from.node);
		if (!node) return null;
		const anchor = pinPosition(node, registry, g.from.pin, g.side, wideNodes);
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
			onPointerMove={(e) => onPointerAt?.(toWorld(e.clientX, e.clientY))}
			// Captured, so a press anywhere inside -- on a node, a pin, a comment
			// -- records where the pointer is even if the move that got it there
			// was swallowed by something between here and it.
			onPointerDownCapture={(e) => {
				onPointerAt?.(toWorld(e.clientX, e.clientY));
				if (e.pointerType !== "touch") {
					if (gesture.current.kind === "none") activePointer.current = e.pointerId;
					return;
				}
				// A finger is captured by whatever it first touched, so a wire
				// dragged from a pin would report its release to that same pin
				// rather than to the one it was dropped on. Let it go, and the
				// release lands on what is actually under the finger.
				const touched = e.target as Element;
				if (touched.hasPointerCapture?.(e.pointerId)) touched.releasePointerCapture(e.pointerId);

				touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
				if (touches.current.size === 1) {
					activePointer.current = e.pointerId;
					return;
				}
				// A second finger: whatever the first one started becomes a
				// pinch. A node halfway through a move stays where it got to.
				e.stopPropagation();
				if (touches.current.size !== 2) return;
				const [a, b] = [...touches.current.entries()];
				endGesture();
				const box = surface.current!.getBoundingClientRect();
				gesture.current = {
					kind: "pinch",
					startView: store.getView(),
					ids: [a[0], b[0]],
					distance: Math.max(1, Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y)),
					middle: { x: (a[1].x + b[1].x) / 2 - box.left, y: (a[1].y + b[1].y) / 2 - box.top },
				};
			}}
			// A long press arrives as a right-click (see `touch.ts`) while the
			// finger is still down and the drag it began is still live. The menu
			// is what was meant, so the drag stops here.
			onContextMenuCapture={(e) => {
				const g = gesture.current;
				// On empty canvas the press is held, not answered yet: see
				// `hold`. Only for the press `touch.ts` recognised -- a pen or a
				// mouse sends its own right-click and means it.
				if (g.kind === "pan" && g.tap && !e.nativeEvent.isTrusted) {
					e.preventDefault();
					e.stopPropagation();
					// Anything the finger drifted before it counted as held is
					// put back, so the marquee starts under it.
					store.setView(g.startView);
					const box = surface.current!.getBoundingClientRect();
					gesture.current = { kind: "hold", client: { x: e.clientX, y: e.clientY } };
					setHoldAt({ x: e.clientX - box.left, y: e.clientY - box.top });
					return;
				}
				if (g.kind !== "none") endGesture();
			}}
			// A pointer that has left has no position to paste at, and the
			// alternative -- keeping the last one it had -- puts the paste
			// wherever it happened to exit, which is not somewhere anybody chose.
			onPointerLeave={() => onPointerAt?.(null)}
			onContextMenu={(e) => {
				e.preventDefault();
				// Ctrl asks the same question the slower way: the picker, which
				// draws each node as you walk the list. The menu is for when you
				// know the name; this is for when you know the shape.
				if (e.ctrlKey || e.metaKey) {
					onRequestNodePicker?.(toWorld(e.clientX, e.clientY));
					return;
				}
				// Viewport coordinates, not canvas-relative: every menu is
				// `position: fixed`, so subtracting the canvas origin here would
				// open it a sidebar's width to the left of the pointer.
				onRequestMenu({ x: e.clientX, y: e.clientY }, toWorld(e.clientX, e.clientY));
			}}
			onDragOver={(e) => {
				// Every kind `onDrop` reads. One missing here is a drop the
				// browser refuses before `onDrop` is asked, which is how
				// functions went undroppable.
				const kinds = e.dataTransfer.types;
				if (!DROPPABLE.some((kind) => kinds.includes(kind))) return;
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

				// A node from the picker's list, dragged out rather than tapped.
				const picked = e.dataTransfer.getData("application/x-roswaal-node");
				if (picked) {
					e.preventDefault();
					const { def, config } = JSON.parse(picked) as { def: string; config?: NodeConfig };
					onDropNode?.(def, config, toWorld(e.clientX, e.clientY));
					return;
				}

				// A type from the Types list. A local of that type is what a type is
				// reached for most; Ctrl gives a Cast to it, as it gives a Set for a
				// variable.
				const typed = e.dataTransfer.getData("application/x-roswaal-type");
				if (typed) {
					e.preventDefault();
					const { type } = JSON.parse(typed) as { type: string };
					const cast = e.ctrlKey;
					const def = registry.get(cast ? "cast.as" : "local.declare");
					if (!def) return;
					const world = toWorld(e.clientX, e.clientY);
					store.edit((s) => {
						const added = addNode(s, def, world.x - NODE.width / 2, world.y - 20);
						queueMicrotask(() => store.select([added.id]));
						return cast
							? setLiteral(added.script, added.id, "type", { t: "string", v: type })
							: setConfig(added.script, added.id, { type });
					});
					return;
				}

				// A module from the Modules list: a Get Module pointed at it. The
				// same shape as a local or a function -- a reference to something
				// this script declares, rather than a node configured from scratch.
				const module = e.dataTransfer.getData("application/x-roswaal-module");
				if (module) {
					e.preventDefault();
					const { id } = JSON.parse(module) as { id: string };
					const def = registry.get("module.get");
					if (!def) return;
					const world = toWorld(e.clientX, e.clientY);
					store.edit((s) => {
						const declared = (s.modules ?? []).find((m) => m.id === id);
						const added = addNode(
							s, def,
							world.x - NODE.compactMinWidth / 2,
							world.y - NODE.compactHeight / 2,
						);
						queueMicrotask(() => store.select([added.id]));
						// The name is cached on the node so the capsule has something
						// to draw; `updateModule` refreshes it on a rename.
						return setConfig(added.script, added.id, {
							module: id,
							name: declared?.name ?? "",
						});
					});
					return;
				}

				// A local from the Locals list: a Get Local pointed at it.
				const local = e.dataTransfer.getData("application/x-roswaal-local");
				if (local) {
					e.preventDefault();
					const { id } = JSON.parse(local) as { id: string };
					const def = registry.get("local.get");
					if (!def) return;
					const world = toWorld(e.clientX, e.clientY);
					store.edit((s) => {
						const added = addNode(s, def, world.x - NODE.compactMinWidth / 2, world.y - NODE.compactHeight / 2);
						queueMicrotask(() => store.select([added.id]));
						return bindNodeToLocal(added.script, added.id, id);
					});
					return;
				}

				// A function from the Functions list: a Get Function pointed at it.
				// The same shape as a local, because it is the same idea — a
				// reference to something declared elsewhere in this graph.
				const fn = e.dataTransfer.getData("application/x-roswaal-function");
				if (fn) {
					e.preventDefault();
					const { id } = JSON.parse(fn) as { id: string };
					const def = registry.get("function.get");
					if (!def) return;
					const world = toWorld(e.clientX, e.clientY);
					store.edit((s) => {
						const added = addNode(s, def, world.x - NODE.compactMinWidth / 2, world.y - NODE.compactHeight / 2);
						queueMicrotask(() => store.select([added.id]));
						return bindNodeToFunction(added.script, added.id, id);
					});
					return;
				}

				const raw = e.dataTransfer.getData("application/x-roswaal-variable");
				if (!raw) return;
				e.preventDefault();
				const { id } = JSON.parse(raw) as { id: string };
				const world = toWorld(e.clientX, e.clientY);
				// Ctrl gives a Set instead of a Get, the convention node editors use.
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
				{functionName === null ? (
					<>
						<small>{script.target === "lune" ? "Lune" : script.scriptClass}</small>
						{script.name}
					</>
				) : (
					<>
						<small>{script.name}</small>
						ƒ {functionName}
					</>
				)}
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
						onCommit={(text, barHeight) => {
							setEditingComment(null);
							// The box grows to keep its header inside it: a header taller
							// than the comment would cover the nodes it is drawn around.
							const h = Math.max(comment.h, Math.round(barHeight) + 40);
							if (text === comment.text && h === comment.h) return;
							store.edit((s) => updateComment(s, comment.id, { text, h }));
						}}
					/>
				))}

				<svg className="wires" style={{ zIndex: LAYER.wire }}>
					{script.links.map((link) => {
						const fromNode = nodesById.get(link.from.node);
						const toNode = nodesById.get(link.to.node);
						if (!fromNode || !toNode) return null;
						const a = pinPosition(fromNode, registry, link.from.pin, "out", wideNodes);
						const b = pinPosition(toNode, registry, link.to.pin, "in", wideNodes);
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
										// Shift- or alt-click severs a wire without a menu round
										// trip. Two modifiers because neither is obviously the
										// one: shift is what already clears a pin, and alt is
										// what node editors conventionally use. Both land on
										// the same idea of "take this connection away", and a
										// wire is not selectable, so neither modifier had
										// another job here.
										if (!e.shiftKey && !e.altKey) return;
										e.stopPropagation();
										store.edit((s) => removeLink(s, link.id, registry));
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
										{(isExec
											? "Execution"
											: coerces
												? `${fromPin?.type ?? "any"} → ${toPin?.type ?? "any"}`
												: (fromPin?.type ?? "any")) +
												"\nShift-click or alt-click to disconnect" +
												"\nDouble-click to add a reroute knot"}
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
						wideNodes={wideNodes}
						anchor={node.id === anchorId}
						errorCount={errorsByNode.get(node.id) ?? 0}
						warningCount={warningsByNode.get(node.id) ?? 0}
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
						onOpen={
							(node.config as { presence?: string } | undefined)?.presence === "outer"
								? openFunction
								: undefined
						}
						onContextMenu={(e, id) => {
							if (!selection.has(id)) store.select([id]);
							onRequestMenu({ x: e.clientX, y: e.clientY }, toWorld(e.clientX, e.clientY));
						}}
					/>
				))}
			</div>

			{holdAt && (
				<div
					className="canvas-hold"
					style={{ zIndex: LAYER.marquee, left: holdAt.x, top: holdAt.y }}
				/>
			)}

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
	onResize: (e: ReactPointerEvent, comment: Comment, corner: "nw" | "se") => void;
	onStartEdit: () => void;
	/** The text, and how tall the header ended up, so the box can fit it. */
	onCommit: (text: string, barHeight: number) => void;
}

function CommentView(props: CommentViewProps) {
	const { comment } = props;
	const color = commentColor(comment.color);
	const bar = useRef<HTMLDivElement>(null);

	/** Keeps the field exactly as tall as what it holds. */
	const fit = (field: HTMLTextAreaElement) => {
		field.style.height = "auto";
		field.style.height = `${field.scrollHeight}px`;
	};

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
				ref={bar}
				style={{ zIndex: LAYER.commentHeader }}
				onPointerDown={(e) => props.onPointerDown(e, comment)}
				onDoubleClick={props.onStartEdit}
			>
				{props.editing ? (
					<textarea
						autoFocus
						defaultValue={comment.text}
						onPointerDown={(e) => e.stopPropagation()}
						onFocus={(e) => fit(e.currentTarget)}
						onInput={(e) => fit(e.currentTarget)}
						onBlur={(e) => props.onCommit(e.target.value, bar.current?.offsetHeight ?? 0)}
						onKeyDown={(e) => {
							// Enter is a new line in here. Escape and Ctrl+Enter finish, and
							// so does clicking anywhere else — every way out keeps what was
							// typed, because a header is a label rather than a dialog.
							if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
								e.preventDefault();
								e.currentTarget.blur();
							}
						}}
					/>
				) : (
					comment.text
				)}
			</div>
			{/* Both corners. The top-left moves the box as it resizes, which is
			    what you want when a comment has to grow upwards to take in a node
			    above it -- the alternative is resizing from the bottom and then
			    dragging the whole thing back. */}
			<div
				className="resize nw"
				title="Resize from this corner"
				onPointerDown={(e) => props.onResize(e, comment, "nw")}
			/>
			<div
				className="resize se"
				title="Resize from this corner"
				onPointerDown={(e) => props.onResize(e, comment, "se")}
			/>
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
