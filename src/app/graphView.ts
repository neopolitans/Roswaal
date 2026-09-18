/**
 * Pan and zoom for a graph in the documentation.
 *
 * A graph preview scaled to fit is unreadable as soon as the graph is bigger
 * than a few nodes, and a scrollbar is chrome on a page that has none. So a
 * documentation graph behaves like the canvas instead: scroll and pinch the way
 * the canvas takes them, drag to pan, two fingers to pinch and pan, double-click
 * or double-tap to fit. Read-only — there is nothing to select, nothing to
 * move, and no store behind it.
 *
 * ## Why this file has no imports
 *
 * It is delivered two ways from one source. The in-app panel calls it directly;
 * `scripts/lib/graphViewer.mjs` bundles it into the static site's single
 * script. It was once serialised with `toString()`, which is why the limits —
 * and now the reader's scroll choice — arrive as an argument and every helper
 * is inline; kept that way so it stays a function with nothing behind it.
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
	limits: {
		min: number; max: number; step: number; scale?: number;
		/**
		 * What scrolling does with nothing held, as on the canvas: the caller
		 * resolves the reader's preference with `wheelAction`. Zoom if absent,
		 * which is what this did before there was a choice.
		 */
		wheel?: "zoom" | "pan";
	},
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
	/** Fingers down, by pointer id, in client coordinates. */
	const touches = new Map<number, { x: number; y: number }>();
	/** Two fingers: the view and their spread and middle when the second landed. */
	let pinch: { x: number; y: number; zoom: number; spread: number; mx: number; my: number } | null = null;
	/** Safari's own pinch — a Mac trackpad's, or an iPad's with no fingers tracked. */
	let gesture: { x: number; y: number; zoom: number; sx: number; sy: number } | null = null;
	/** The last quick tap, for a double tap: Safari on iOS sends no dblclick. */
	let lastTap = { at: -1e9, x: 0, y: 0 };
	let downAt = { at: 0, x: 0, y: 0 };

	const clamp = (value: number, low: number, high: number) =>
		value < low ? low : value > high ? high : value;

	// The <svg> is looked up each time rather than held: if whatever owns the
	// viewport writes its markup again, the transform has to land on the
	// element on the page, not the one that was there when this attached.
	const apply = () => {
		const current = viewport.querySelector("svg");
		if (!current) return;
		current.style.transformOrigin = "0 0";
		current.style.transform = "translate(" + x + "px," + y + "px) scale(" + zoom + ")";
	};

	/** The whole graph, centred, and never bigger than its frame. Not magnified
	 *  past `scale` either — the reader's preview size, 1 unless they chose
	 *  otherwise: a two-node scene blown up to fill a wide page looks like a
	 *  mistake rather than a diagram. The frame itself grows with the preview
	 *  size, so a larger size is a larger picture that still fits. */
	const fit = () => {
		const box = viewport.getBoundingClientRect();
		if (box.width === 0 || natural.w === 0) return;
		const cap = limits.scale ?? 1;
		zoom = clamp(Math.min(box.width / natural.w, box.height / natural.h, cap), limits.min, limits.max);
		x = (box.width - natural.w * zoom) / 2;
		y = (box.height - natural.h * zoom) / 2;
		apply();
	};

	/**
	 * Zoom to `next` about a point in the viewport, from a given view. The
	 * canvas's arithmetic; changing it here would make the docs feel unlike the
	 * editor.
	 */
	const zoomAt = (
		sx: number, sy: number, next: number,
		from: { x: number; y: number; zoom: number } = { x, y, zoom },
	) => {
		const clamped = clamp(next, limits.min, limits.max);
		const wx = (sx - from.x) / from.zoom;
		const wy = (sy - from.y) / from.zoom;
		x = sx - wx * clamped;
		y = sy - wy * clamped;
		zoom = clamped;
		apply();
	};

	// The canvas's wheel handler, line for line: see `Canvas.tsx`.
	const onWheel = (event: WheelEvent) => {
		event.preventDefault();
		if (gesture) return;
		const box = viewport.getBoundingClientRect();
		const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.height : 1;
		const dx = event.deltaX * unit;
		const dy = event.deltaY * unit;
		const zooming =
			event.ctrlKey || event.metaKey || ((limits.wheel ?? "zoom") === "zoom" && dx === 0);
		if (!zooming) {
			x -= dx;
			y -= dy;
			apply();
			return;
		}
		if (dy === 0) return;
		const factor = event.deltaMode !== 0 || Math.abs(dy) >= 50
			? (dy < 0 ? limits.step : 1 / limits.step)
			: Math.exp(-dy * 0.01);
		zoomAt(event.clientX - box.left, event.clientY - box.top, zoom * factor);
	};

	type SafariGesture = Event & { scale: number; clientX: number; clientY: number };
	const onGestureStart = (event: Event) => {
		event.preventDefault();
		if (touches.size > 0) return;
		const e = event as SafariGesture;
		const box = viewport.getBoundingClientRect();
		gesture = { x, y, zoom, sx: e.clientX - box.left, sy: e.clientY - box.top };
	};
	const onGestureChange = (event: Event) => {
		event.preventDefault();
		if (!gesture || touches.size > 0) return;
		zoomAt(gesture.sx, gesture.sy, gesture.zoom * (event as SafariGesture).scale, gesture);
	};
	const onGestureEnd = (event: Event) => {
		event.preventDefault();
		gesture = null;
	};

	/** The two fingers' spread and middle, relative to the viewport. */
	const spreadOf = () => {
		const [a, b] = [...touches.values()];
		const box = viewport.getBoundingClientRect();
		return {
			spread: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
			mx: (a.x + b.x) / 2 - box.left,
			my: (a.y + b.y) / 2 - box.top,
		};
	};

	const onDown = (event: PointerEvent) => {
		// Left button only. A right-click is the browser's menu, and a middle
		// click is the reader's own scroll gesture.
		if (event.button !== 0) return;
		if (event.pointerType === "touch") {
			touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
			downAt = { at: performance.now(), x: event.clientX, y: event.clientY };
			if (touches.size === 2) {
				// The second finger: from here it is a pinch, not a drag.
				dragging = false;
				pinch = { x, y, zoom, ...spreadOf() };
				viewport.setPointerCapture(event.pointerId);
				return;
			}
			if (touches.size > 2) return;
		}
		// The graph is full of `<text>`, so without this a drag across it starts
		// a text selection and the reader ends up highlighting node titles
		// instead of panning. The CSS `user-select: none` covers the same ground;
		// both are here because the CSS can be absent — this file is delivered to
		// a page that may be styled by something else.
		event.preventDefault();
		dragging = true;
		lastX = event.clientX;
		lastY = event.clientY;
		viewport.setPointerCapture(event.pointerId);
		viewport.classList.add("panning");
	};

	const onMove = (event: PointerEvent) => {
		if (touches.has(event.pointerId)) {
			touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
		}
		if (pinch && touches.size >= 2) {
			// Zoom by the change in spread, and keep the point that was between
			// the fingers between them wherever they have gone.
			const now = spreadOf();
			const next = clamp(pinch.zoom * now.spread / pinch.spread, limits.min, limits.max);
			const wx = (pinch.mx - pinch.x) / pinch.zoom;
			const wy = (pinch.my - pinch.y) / pinch.zoom;
			x = now.mx - wx * next;
			y = now.my - wy * next;
			zoom = next;
			apply();
			return;
		}
		if (!dragging) return;
		x += event.clientX - lastX;
		y += event.clientY - lastY;
		lastX = event.clientX;
		lastY = event.clientY;
		apply();
	};

	const onUp = (event: PointerEvent) => {
		const wasTouch = touches.delete(event.pointerId);
		if (pinch) {
			// Either finger ends it, and the one left does not start a drag
			// from wherever the pinch left it.
			if (touches.size < 2) pinch = null;
			if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
			dragging = false;
			viewport.classList.remove("panning");
			return;
		}
		if (wasTouch && event.type === "pointerup") {
			const now = performance.now();
			const still = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) < 10;
			if (still && now - downAt.at < 300) {
				if (now - lastTap.at < 320 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 24) {
					lastTap = { at: -1e9, x: 0, y: 0 };
					fit();
				} else {
					lastTap = { at: now, x: event.clientX, y: event.clientY };
				}
			}
		}
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
	viewport.addEventListener("gesturestart", onGestureStart);
	viewport.addEventListener("gesturechange", onGestureChange);
	viewport.addEventListener("gestureend", onGestureEnd);

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
		viewport.removeEventListener("gesturestart", onGestureStart);
		viewport.removeEventListener("gesturechange", onGestureChange);
		viewport.removeEventListener("gestureend", onGestureEnd);
		viewport.classList.remove("interactive", "panning");
	};
}
