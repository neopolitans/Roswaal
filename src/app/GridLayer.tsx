/**
 * The canvas's grid, drawn rather than painted as a background.
 *
 * Until 0.154.1 it was the stylesheet's repeating background, like every other
 * surface's. That is right for a surface that never zooms, and wrong for one
 * that does: a browser rounds a repeating tile to whole device pixels, so a
 * step of 24.3px is painted as 24.5 and the error adds up across the screen
 * -- 7px out forty dots along at a zoom of 1.013, measured in WebKit. Zooming
 * walks the step through those roundings, and the far dots jumped back and
 * forth against the nodes, which a transform scales without rounding. An SVG
 * pattern rounds its tile the same way. Drawing each mark where it falls keeps
 * every one within a fraction of a pixel of its place.
 *
 * What the grid looks like is still the stylesheet's, read from the same
 * properties "The grid" in theme.css gives every other surface: the pattern,
 * the colours for the strength in use, the dot size. This only says where.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { View } from "./geometry.js";
import { GRID, LAYER } from "./layers.js";

/** The spacing at this zoom: the fine one, or the coarse one when the fine would be a wash. */
export function gridSpacing(zoom: number): { step: number; far: boolean } {
	const fine = GRID.fine * zoom;
	const far = zoom < GRID.fineFadeBelow;
	return { step: far ? fine * GRID.coarseMultiple : fine, far };
}

/**
 * Where marks fall along one axis: `origin + k * step` for every k that lands
 * within `length`, and its index k. Multiplied out rather than added up, so the
 * thousandth mark is as exact as the first.
 */
export function gridMarks(
	origin: number,
	step: number,
	length: number,
): { at: number; k: number }[] {
	if (!(step > 0)) return [];
	const first = Math.ceil((-origin - step) / step);
	const last = Math.floor((length - origin + step) / step);
	const out: { at: number; k: number }[] = [];
	for (let k = first; k <= last; k++) out.push({ at: origin + k * step, k });
	return out;
}

interface GridStyle {
	lines: boolean;
	dot: string;
	dotSize: number;
	fine: string;
	coarse: string;
}

/** The grid as the stylesheet has it for this element, right now. */
function readStyle(element: Element): GridStyle {
	const css = getComputedStyle(element);
	const prop = (name: string) => css.getPropertyValue(name).trim();
	return {
		lines: document.documentElement.dataset.grid === "lines",
		dot: prop("--grid-dot"),
		dotSize: Number.parseFloat(prop("--grid-dot-size")) || 1.1,
		fine: prop("--grid-fine"),
		coarse: prop("--grid-coarse"),
	};
}

/**
 * Bumps whenever something the grid's look depends on might have changed: a
 * setting or a theme written onto the root, or the system's contrast or
 * colour scheme.
 */
function useStyleVersion(): number {
	const [version, setVersion] = useState(0);
	useEffect(() => {
		const bump = () => setVersion((v) => v + 1);
		const observer = new MutationObserver(bump);
		observer.observe(document.documentElement, { attributes: true });
		const queries = ["(prefers-contrast: more)", "(prefers-color-scheme: dark)"].map((q) =>
			window.matchMedia(q),
		);
		for (const query of queries) query.addEventListener("change", bump);
		return () => {
			observer.disconnect();
			for (const query of queries) query.removeEventListener("change", bump);
		};
	}, []);
	return version;
}

function draw(canvas: HTMLCanvasElement, view: View, style: GridStyle): void {
	const dpr = window.devicePixelRatio || 1;
	const width = canvas.clientWidth;
	const height = canvas.clientHeight;
	if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
	if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, width, height);

	const { step, far } = gridSpacing(view.zoom);
	const xs = gridMarks(view.x, step, width);
	const ys = gridMarks(view.y, step, height);

	if (!style.lines) {
		// A dot at every point. The radius is the stylesheet's solid size
		// plus half its soft edge, which is what the gradient drew.
		const radius = style.dotSize + 0.3;
		ctx.fillStyle = style.dot;
		ctx.beginPath();
		for (const x of xs) {
			for (const y of ys) {
				ctx.moveTo(x.at + radius, y.at);
				ctx.arc(x.at, y.at, radius, 0, Math.PI * 2);
			}
		}
		ctx.fill();
		return;
	}

	// Lines one device pixel wide, each put on the nearest whole device pixel
	// by itself, so none is blurred across two and none drifts. Every fifth is
	// heavier; zoomed far out, only those, since the step is already theirs.
	const snap = (at: number) => Math.round(at * dpr) / dpr;
	const one = 1 / dpr;
	const heavy = (k: number) => far || k % GRID.coarseMultiple === 0;
	for (const pass of ["fine", "coarse"] as const) {
		if (pass === "fine" && far) continue;
		ctx.fillStyle = pass === "fine" ? style.fine : style.coarse;
		for (const x of xs) {
			if (heavy(x.k) === (pass === "coarse")) ctx.fillRect(snap(x.at), 0, Math.max(one, 1), height);
		}
		for (const y of ys) {
			if (heavy(y.k) === (pass === "coarse")) ctx.fillRect(0, snap(y.at), width, Math.max(one, 1));
		}
	}
}

/**
 * The grid behind the canvas. Redrawn when the view moves, when the canvas
 * changes size, and when the look might have.
 */
export function GridLayer({ view }: { view: View }) {
	const ref = useRef<HTMLCanvasElement>(null);
	const version = useStyleVersion();
	const [size, setSize] = useState(0);

	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const observer = new ResizeObserver(() => setSize((s) => s + 1));
		observer.observe(canvas);
		return () => observer.disconnect();
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: size and version are redraw triggers.
	useLayoutEffect(() => {
		const canvas = ref.current;
		if (canvas) draw(canvas, view, readStyle(canvas));
	}, [view, size, version]);

	return <canvas ref={ref} className="grid" aria-hidden="true" style={{ zIndex: LAYER.grid }} />;
}
