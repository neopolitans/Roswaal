/**
 * One pointer followed from press to release, on the window.
 *
 * Every drag in the editor that is not the canvas -- a splitter, a panel, a
 * floating window, a tab, Node Design's logic height -- has the same shape:
 * press on a handle, then listen on the window until the pointer lets go.
 * Listening on the window rather than the handle means a release is heard
 * wherever it happens, so a fast drag that outruns a five-pixel handle cannot
 * leave a move listener behind.
 *
 * The part each copy kept getting wrong is the ending. iPadOS takes a pointer
 * back with `pointercancel` when a system gesture starts, and a drag that only
 * listened for `pointerup` kept its move listener for the rest of the visit.
 * Here both end it, the caller is told which, and every listener goes.
 *
 * Not for the graph canvas, which multiplexes several fingers into one gesture
 * (a pinch, a held press that becomes a marquee) and keeps its own listeners.
 */

/** What a drag listens to. Both are optional; most drags want both. */
export interface PointerHandlers {
	/** Each move of the tracked pointer, until it ends. */
	move?: (event: PointerEvent) => void;
	/**
	 * Called once, however the drag ends. `release` is the `pointerup` that
	 * ended it, and undefined when the browser cancelled the pointer or the
	 * caller stopped the drag itself -- a drop should only land on a release.
	 */
	end?: (release: PointerEvent | undefined) => void;
}

/** Where to listen. The window, unless a test passes something it can drive. */
export interface TrackOptions {
	target?: EventTarget;
}

/**
 * Follow the pointer that `press` started until it lifts or is cancelled.
 *
 * Only that pointer: a second finger that lands and lifts mid-drag does not
 * end the first one's drag. Returns a function that ends the drag early (its
 * `end` is called with no release), for a move that finds no button held.
 */
export function trackPointer(
	press: { pointerId: number },
	{ move, end }: PointerHandlers,
	{ target = window }: TrackOptions = {},
): () => void {
	const id = press.pointerId;
	let done = false;

	const onMove = (event: Event) => {
		const e = event as PointerEvent; // Registered for pointermove only.
		if (e.pointerId === id) move?.(e);
	};
	const finish = (release: PointerEvent | undefined) => {
		if (done) return;
		done = true;
		target.removeEventListener("pointermove", onMove);
		target.removeEventListener("pointerup", onUp);
		target.removeEventListener("pointercancel", onCancel);
		end?.(release);
	};
	const onUp = (event: Event) => {
		const e = event as PointerEvent; // Registered for pointerup only.
		if (e.pointerId === id) finish(e);
	};
	const onCancel = (event: Event) => {
		if ((event as PointerEvent).pointerId === id) finish(undefined);
	};

	target.addEventListener("pointermove", onMove);
	target.addEventListener("pointerup", onUp);
	target.addEventListener("pointercancel", onCancel);
	return () => finish(undefined);
}
