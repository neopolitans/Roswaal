/**
 * The side strip: zoom, undo and redo, and fit, down the left edge of a graph.
 *
 * Procreate keeps the controls a hand reaches for most on a slim strip at the
 * side of the canvas, where a thumb rests on an iPad and a pointer reaches on
 * a desk without crossing the drawing. These are the canvas's equivalents. The
 * zoom is a slider as well as two buttons, because on a tablet a pinch is the
 * fast way and a slider is the precise one.
 *
 * Undo and redo go through the keyboard's own commands, as the touch bar's do,
 * so there is one place that decides what an undo means while a drag is held.
 */

import { useEffect } from "react";
import type { GraphId } from "../core/functionGraph.js";
import { viewOf } from "../core/functionGraph.js";
import { nodeBounds } from "../core/nodeBox.js";
import type { Registry } from "../core/nodes/index.js";
import type { NodeScript } from "../core/schema.js";

import { Icon } from "./icons.jsx";
import { ZOOM } from "./layers.js";
import { readPreferences } from "./preferences.js";
import { store, useView } from "./store.js";
import { showToast } from "./Toast.jsx";

/** Undo or redo through the keyboard's own commands. */
function press(key: "z" | "y") {
	window.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true }));
}

/**
 * Two fingers tapped on the graph undo, and three redo, as they do in
 * Procreate. A tap is quick and does not move; anything else is a pinch or a
 * pan, and the canvas has it.
 */
function useTapToUndo(graph: GraphId) {
	useEffect(() => {
		const canvas = document.querySelector<HTMLElement>(".centre-body .canvas");
		if (!canvas) return;
		const down = new Map<number, { x: number; y: number }>();
		let most = 0;
		let started = 0;
		let moved = false;
		const onDown = (e: PointerEvent) => {
			if (e.pointerType !== "touch") return;
			if (down.size === 0) {
				most = 0;
				started = performance.now();
				moved = false;
			}
			down.set(e.pointerId, { x: e.clientX, y: e.clientY });
			most = Math.max(most, down.size);
		};
		const onMove = (e: PointerEvent) => {
			const at = down.get(e.pointerId);
			if (at && Math.hypot(e.clientX - at.x, e.clientY - at.y) > 10) moved = true;
		};
		const onUp = (e: PointerEvent) => {
			if (!down.delete(e.pointerId) || down.size > 0) return;
			if (moved || performance.now() - started > 300 || most < 2) return;
			if (most === 2) {
				press("z");
				showToast({ title: "Undo", detail: "Two-finger tap", icon: "undo" });
			} else {
				press("y");
				showToast({ title: "Redo", detail: "Three-finger tap", icon: "redo" });
			}
		};
		const onCancel = (e: PointerEvent) => {
			down.delete(e.pointerId);
			moved = true;
		};
		canvas.addEventListener("pointerdown", onDown, true);
		window.addEventListener("pointermove", onMove, true);
		window.addEventListener("pointerup", onUp, true);
		window.addEventListener("pointercancel", onCancel, true);
		return () => {
			canvas.removeEventListener("pointerdown", onDown, true);
			window.removeEventListener("pointermove", onMove, true);
			window.removeEventListener("pointerup", onUp, true);
			window.removeEventListener("pointercancel", onCancel, true);
		};
	}, [graph]);
}

/** The canvas the strip acts on, in the window. */
function canvasBox(): DOMRect | null {
	return document.querySelector(".centre-body .canvas")?.getBoundingClientRect() ?? null;
}

const clamp = (zoom: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, zoom));

/**
 * Brings one node to the middle of the canvas no card covers, at the zoom the
 * view is already at. For a list that points at a node from outside the
 * canvas, after `store.reveal` has opened its graph and selected it.
 */
export function frameNode(nodeId: string, registry: Registry): void {
	const { script, graph } = store.getSnapshot();
	const box = canvasBox();
	if (!script || !box) return;
	const node = viewOf(script, graph).nodes.find((n) => n.id === nodeId);
	if (!node) return;
	const r = nodeBounds(node, registry, readPreferences().wideNodes);
	const free = freeBox(box);
	const { zoom } = store.getView();
	store.setView({
		x: free.x + free.w / 2 - (r.x + r.w / 2) * zoom,
		y: free.y + free.h / 2 - (r.y + r.h / 2) * zoom,
		zoom,
	});
}

/** Zooms about the middle of the canvas, so what is in the middle stays there. */
function zoomTo(zoom: number) {
	const box = canvasBox();
	const view = store.getView();
	const next = clamp(zoom);
	if (!box || next === view.zoom) return;
	const sx = box.width / 2;
	const sy = box.height / 2;
	const wx = (sx - view.x) / view.zoom;
	const wy = (sy - view.y) / view.zoom;
	store.setView({ x: sx - wx * next, y: sy - wy * next, zoom: next });
}

/**
 * The part of the canvas no card covers: between the docks, below the top
 * clusters. Fitting the graph to the whole canvas would put its ends behind
 * the Project card and the Inspector.
 */
function freeBox(box: DOMRect): { x: number; y: number; w: number; h: number } {
	const left = document
		.querySelector(".workspace > .dock.left:not(.drawer)")
		?.getBoundingClientRect();
	const right = document
		.querySelector(".workspace > .dock.right:not(.drawer)")
		?.getBoundingClientRect();
	const strip = document.querySelector(".side-strip")?.getBoundingClientRect();
	// The strip is down the left edge on a touch screen and along the bottom
	// with a mouse; only down the side does it take width.
	const stripAtSide =
		strip !== undefined && strip.left < box.left + 80 && strip.height > strip.width;
	const x0 = Math.max(box.left, left ? left.right : 0, stripAtSide ? strip.right : 0) + 16;
	const x1 = Math.min(box.right, right ? right.left : box.right) - 16;
	const top = getComputedStyle(document.documentElement).getPropertyValue("--chrome-top");
	const y0 = box.top + (Number.parseFloat(top) || 56) + 8;
	const y1 = box.bottom - 56;
	return {
		x: x0 - box.left,
		y: y0 - box.top,
		w: Math.max(120, x1 - x0),
		h: Math.max(120, y1 - y0),
	};
}

export function CanvasStrip({
	script,
	graph,
	registry,
	wide,
}: {
	script: NodeScript;
	graph: GraphId;
	registry: Registry;
	/** Nodes drawn at the wide width, a preference: the bounds follow it. */
	wide: boolean;
}) {
	const view = useView();
	const percent = Math.round(view.zoom * 100);
	useTapToUndo(graph);

	const fit = () => {
		const box = canvasBox();
		const nodes = viewOf(script, graph).nodes;
		if (!box || nodes.length === 0) return;
		let x0 = Number.POSITIVE_INFINITY;
		let y0 = Number.POSITIVE_INFINITY;
		let x1 = Number.NEGATIVE_INFINITY;
		let y1 = Number.NEGATIVE_INFINITY;
		for (const node of nodes) {
			const r = nodeBounds(node, registry, wide);
			x0 = Math.min(x0, r.x);
			y0 = Math.min(y0, r.y);
			x1 = Math.max(x1, r.x + r.w);
			y1 = Math.max(y1, r.y + r.h);
		}
		const free = freeBox(box);
		const zoom = clamp(Math.min(free.w / (x1 - x0), free.h / (y1 - y0), 1));
		store.setView({
			x: free.x + (free.w - (x1 - x0) * zoom) / 2 - x0 * zoom,
			y: free.y + (free.h - (y1 - y0) * zoom) / 2 - y0 * zoom,
			zoom,
		});
	};

	return (
		<div className="side-strip tool-group" role="toolbar" aria-label="View">
			<button
				className="tb icon-only"
				title="Zoom in"
				aria-label="Zoom in"
				onClick={() => zoomTo(view.zoom * 1.25)}
			>
				<Icon name="plus" size={16} />
			</button>
			<input
				className="strip-zoom"
				type="range"
				min={Math.round(ZOOM.min * 100)}
				max={Math.round(ZOOM.max * 100)}
				value={percent}
				aria-label="Zoom"
				onChange={(e) => zoomTo(Number(e.target.value) / 100)}
			/>
			<button
				className="tb icon-only"
				title="Zoom out"
				aria-label="Zoom out"
				onClick={() => zoomTo(view.zoom / 1.25)}
			>
				<Icon name="minus" size={16} />
			</button>
			<button className="strip-percent" title="Back to 100%" onClick={() => zoomTo(1)}>
				{percent}%
			</button>
			<span className="strip-rule" />
			<button
				className="tb icon-only"
				title="Undo (Ctrl+Z). On a touch screen, tap with two fingers."
				aria-label="Undo"
				disabled={!store.canUndo()}
				onClick={() => press("z")}
			>
				<Icon name="undo" size={16} />
			</button>
			<button
				className="tb icon-only"
				title="Redo (Ctrl+Y). On a touch screen, tap with three fingers."
				aria-label="Redo"
				disabled={!store.canRedo()}
				onClick={() => press("y")}
			>
				<Icon name="redo" size={16} />
			</button>
			<span className="strip-rule" />
			<button
				className="tb icon-only"
				title="Fit the graph to the window"
				aria-label="Fit"
				onClick={fit}
			>
				<Icon name="fit" size={16} />
			</button>
		</div>
	);
}
