/**
 * Pan and zoom for a graph in the documentation.
 *
 * A graph preview scaled to fit is unreadable as soon as the graph is bigger
 * than a few nodes, and a scrollbar is chrome on a page that has none. So a
 * documentation graph behaves like the canvas instead: wheel to zoom at the
 * cursor, drag to pan, double-click to fit. Read-only — there is nothing to
 * select, nothing to move, and no store behind it.
 *
 * ## Why this file has no imports
 *
 * It is delivered two ways from one source. The in-app panel calls it directly;
 * `scripts/build-docs.mjs` serialises it with `toString()` into the static
 * site's single script, because that site cannot import a module. A closure
 * over anything outside this function would serialise to a reference that does
 * not exist on the other side — so the limits arrive as an argument and every
 * helper is inline, deliberately.
 *
 * ## It is an enhancement, never a requirement
 *
 * Without it the SVG renders at its natural size inside a viewport that clips.
 * That is still a picture of a graph, which is what the static site promises:
 * no JavaScript is needed to *read* a page. This only makes a large one
 * navigable.
 *
 * The zoom arithmetic is the canvas's, line for line — see the wheel handler in
 * `Canvas.tsx`. Two answers to "where does the point under the cursor go" would
 * be two feels, and the whole point of a documentation graph is that it behaves
 * like the thing it is documenting.
 */
export function attachGraphView(
	viewport: HTMLElement,
	limits: { min: number; max: number; step: number },
): () => void {
	const svg = viewport.querySelector("svg");
	if (!svg) return () => {};

	const natural = {
		w: Number(svg.getAttribute("width")) || viewport.clientWidth,
		h: Number(svg.getAttribute("height")) || viewport.clientHeight,
	};

	let x = 0;
	let y = 0;
	let zoom = 1;
	let dragging = false;
	let lastX = 0;
	let lastY = 0;

	const clamp = (value: number, low: number, high: number) =>
		value < low ? low : value > high ? high : value;

	const apply = () => {
		svg.style.transformOrigin = "0 0";
		svg.style.transform = "translate(" + x + "px," + y + "px) scale(" + zoom + ")";
	};

	/** The whole graph, centred. Never magnified past 1: a two-node scene blown
	 *  up to fill a wide page looks like a mistake rather than a diagram. */
	const fit = () => {
		const box = viewport.getBoundingClientRect();
		if (box.width === 0 || natural.w === 0) return;
		zoom = clamp(Math.min(box.width / natural.w, box.height / natural.h, 1), limits.min, limits.max);
		x = (box.width - natural.w * zoom) / 2;
		y = (box.height - natural.h * zoom) / 2;
		apply();
	};

	const onWheel = (event: WheelEvent) => {
		event.preventDefault();
		const box = viewport.getBoundingClientRect();
		const sx = event.clientX - box.left;
		const sy = event.clientY - box.top;

		const factor = event.deltaY < 0 ? limits.step : 1 / limits.step;
		const next = clamp(zoom * factor, limits.min, limits.max);
		if (next === zoom) return;

		// Keep the point under the cursor pinned while zooming. The canvas's own
		// arithmetic; changing it here would make the docs feel unlike the editor.
		const wx = (sx - x) / zoom;
		const wy = (sy - y) / zoom;
		x = sx - wx * next;
		y = sy - wy * next;
		zoom = next;
		apply();
	};

	const onDown = (event: PointerEvent) => {
		// Left button only. A right-click is the browser's menu, and a middle
		// click is the reader's own scroll gesture.
		if (event.button !== 0) return;
		dragging = true;
		lastX = event.clientX;
		lastY = event.clientY;
		viewport.setPointerCapture(event.pointerId);
		viewport.classList.add("panning");
	};

	const onMove = (event: PointerEvent) => {
		if (!dragging) return;
		x += event.clientX - lastX;
		y += event.clientY - lastY;
		lastX = event.clientX;
		lastY = event.clientY;
		apply();
	};

	const onUp = (event: PointerEvent) => {
		if (!dragging) return;
		dragging = false;
		if (viewport.hasPointerCapture(event.pointerId)) {
			viewport.releasePointerCapture(event.pointerId);
		}
		viewport.classList.remove("panning");
	};

	// `passive: false` because the wheel handler calls preventDefault; without it
	// the page scrolls out from under the graph while the graph also zooms.
	viewport.addEventListener("wheel", onWheel, { passive: false });
	viewport.addEventListener("pointerdown", onDown);
	viewport.addEventListener("pointermove", onMove);
	viewport.addEventListener("pointerup", onUp);
	viewport.addEventListener("pointercancel", onUp);
	viewport.addEventListener("dblclick", fit);

	// Refit while the reader has not touched it, so opening a narrow window does
	// not leave the graph parked off-screen.
	let touched = false;
	const markTouched = () => { touched = true; };
	viewport.addEventListener("wheel", markTouched, { passive: true });
	viewport.addEventListener("pointerdown", markTouched);

	const observer =
		typeof ResizeObserver === "undefined"
			? null
			: new ResizeObserver(() => { if (!touched) fit(); });
	observer?.observe(viewport);

	viewport.classList.add("interactive");
	fit();

	return () => {
		observer?.disconnect();
		viewport.removeEventListener("wheel", onWheel);
		viewport.removeEventListener("wheel", markTouched);
		viewport.removeEventListener("pointerdown", onDown);
		viewport.removeEventListener("pointerdown", markTouched);
		viewport.removeEventListener("pointermove", onMove);
		viewport.removeEventListener("pointerup", onUp);
		viewport.removeEventListener("pointercancel", onUp);
		viewport.removeEventListener("dblclick", fit);
		viewport.classList.remove("interactive", "panning");
	};
}
