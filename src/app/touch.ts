/**
 * The mouse gestures a finger cannot make, made from ones it can.
 *
 * Roswaal puts a lot behind the right button, the double-click and dragging:
 * every node, pin, wire and tree row has a menu, a graph is opened by
 * double-clicking it, and a variable reaches the graph by being dragged there.
 * A touch screen has none of the three. iPadOS Safari sends no `contextmenu`
 * for a long press, no `dblclick` for a double tap, and does not start the
 * page's drag-and-drop from a finger, so on an iPad none of that was reachable.
 *
 * So this makes them:
 *
 * - a **long press** is a `contextmenu`;
 * - a **two-finger long press**, lifted, is a `contextmenu` with Ctrl held --
 *   which on the canvas is the visual node search rather than the node menu;
 * - a **double tap** is a `dblclick`;
 * - a **long press on something draggable, then a drag**, is `dragstart`,
 *   `dragenter`/`dragover`/`dragleave` under the finger, `drop` where it lifts,
 *   and `dragend` -- carrying a data transfer the source fills in itself.
 *
 * Each is dispatched on the element under the finger with the finger's
 * coordinates, so every handler already written for the mouse runs as it is:
 * the canvas's drop reads a variable out of the transfer exactly as it does for
 * a mouse. There is no second, touch-shaped copy of any menu or drop to keep in
 * step.
 *
 * Fingers and pens -- an Apple Pencil has no second button either. Not the
 * mouse, which has all three already. A browser that sends its own events for
 * these (Android Chrome sends `contextmenu`) has the duplicate swallowed rather
 * than acted on twice.
 */

/** How long a still finger is held before it counts as a right-click. */
const LONG_PRESS_MS = 500;
/** How far a finger may drift and still be pressing rather than dragging. */
const SLOP = 10;
/** The window for a second tap, and how close to the first it must land. */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_SLOP = 24;
/** How long after a synthesised event the browser's own copy is swallowed. */
const ECHO_MS = 800;

/**
 * What a drag carries, for a drag no browser started.
 *
 * The app's drag sources and drop targets use only these members, and a
 * constructed `DataTransfer` is not available in every Safari this runs in —
 * so a plain object with the same shape, which both sides read and write
 * without knowing the difference.
 */
class TouchDataTransfer {
	private readonly data = new Map<string, string>();
	dropEffect = "none";
	effectAllowed = "all";
	readonly files: readonly File[] = [];
	/**
	 * What the source asked to be dragged as, copied when it asked -- the
	 * source is free to throw its own away straight after, as it must for a
	 * mouse, where the browser takes its picture there and then.
	 */
	image: { element: HTMLElement; x: number; y: number } | null = null;

	get types(): string[] {
		return [...this.data.keys()];
	}

	setData(type: string, value: string): void {
		this.data.set(type.toLowerCase(), value);
	}

	getData(type: string): string {
		return this.data.get(type.toLowerCase()) ?? "";
	}

	clearData(type?: string): void {
		if (type === undefined) this.data.clear();
		else this.data.delete(type.toLowerCase());
	}

	setDragImage(element: Element, x: number, y: number): void {
		const copy = element.cloneNode(true) as HTMLElement;
		// Wherever the source kept it out of sight is not where it is drawn.
		copy.style.position = "static";
		copy.style.left = "";
		copy.style.top = "";
		this.image = { element: copy, x, y };
	}
}

let installed = false;

export function installTouchGestures(target: Window = window): void {
	if (installed) return;
	installed = true;

	/**
	 * The one finger that might become a long press, while it is down.
	 *
	 * `source` is the draggable thing it landed in, if any. On one of those the
	 * long press does not open the menu straight away: it *arms* a drag, and
	 * what the finger does next decides -- move and it drags, lift and the menu
	 * opens then. The same bargain as holding on empty canvas.
	 */
	let press: {
		id: number; x: number; y: number; element: Element; timer: number;
		fired: boolean; source: HTMLElement | null; armed: boolean;
	} | null = null;
	/** A drag in progress, carried by one finger. */
	let drag: {
		id: number; source: HTMLElement; transfer: TouchDataTransfer; ghost: HTMLElement;
		over: Element | null; accepted: boolean;
		/** Where the finger is on a drag image, which is then drawn from there. */
		offset: { x: number; y: number } | null;
	} | null = null;
	/**
	 * Two fingers held still together, which lifted is Ctrl and the right
	 * button: the mouse gesture for the visual node search.
	 *
	 * Answered on the lift, not when the timer runs out, so a pinch that starts
	 * slowly is still a pinch: it only stops being one if the fingers are
	 * held and then let go without having moved.
	 */
	let pair: {
		start: Map<number, { x: number; y: number }>; timer: number; held: boolean;
	} | null = null;
	/** Where the last quick tap ended, for recognising the second. */
	let lastTap: { x: number; y: number; at: number } | null = null;
	/** Touches currently down, by id, so a lost release cannot leave a count stuck. */
	const fingers = new Set<number>();
	/** When this module last sent each kind, so the browser's echo is ignored. */
	let sentMenuAt = -Infinity;
	let sentDoubleAt = -Infinity;
	let swallowClickUntil = -Infinity;

	const cancelPress = () => {
		if (press) {
			window.clearTimeout(press.timer);
			press.source?.classList.remove("touch-lifted");
		}
		press = null;
	};

	const cancelPair = () => {
		if (pair) window.clearTimeout(pair.timer);
		pair = null;
	};

	const fire = (
		type: "contextmenu" | "dblclick", element: Element, x: number, y: number, ctrlKey = false,
	) => {
		element.dispatchEvent(new MouseEvent(type, {
			bubbles: true,
			cancelable: true,
			composed: true,
			clientX: x,
			clientY: y,
			ctrlKey,
			button: type === "contextmenu" ? 2 : 0,
			detail: type === "dblclick" ? 2 : 0,
			view: window,
		}));
	};

	/**
	 * A drag event carrying the transfer. A `MouseEvent` with `dataTransfer`
	 * defined on it rather than a `DragEvent`, whose constructor not every
	 * Safari has; React and every handler here read the property either way.
	 */
	const dragEvent = (type: string, transfer: TouchDataTransfer, x: number, y: number) => {
		const event = new MouseEvent(type, {
			bubbles: true,
			cancelable: type !== "dragleave" && type !== "dragend",
			composed: true,
			clientX: x,
			clientY: y,
			view: window,
		});
		Object.defineProperty(event, "dataTransfer", { value: transfer });
		return event;
	};

	const moveDrag = (x: number, y: number) => {
		if (!drag) return;
		drag.ghost.style.left = `${x - (drag.offset?.x ?? 0)}px`;
		drag.ghost.style.top = `${y - (drag.offset?.y ?? 0)}px`;
		const under = document.elementFromPoint(x, y);
		if (under !== drag.over) {
			drag.over?.dispatchEvent(dragEvent("dragleave", drag.transfer, x, y));
			under?.dispatchEvent(dragEvent("dragenter", drag.transfer, x, y));
			drag.over = under;
		}
		if (!under) {
			drag.accepted = false;
			return;
		}
		// A target says it will take the drop by cancelling `dragover`, which is
		// what every drop target here already does for a mouse.
		const over = dragEvent("dragover", drag.transfer, x, y);
		under.dispatchEvent(over);
		drag.accepted = over.defaultPrevented;
	};

	const startDrag = (held: NonNullable<typeof press>, x: number, y: number) => {
		const source = held.source!;
		window.clearTimeout(held.timer);
		source.classList.remove("touch-lifted");
		press = null;

		// The source fills the transfer in itself, from its own `dragstart`.
		const transfer = new TouchDataTransfer();
		const start = dragEvent("dragstart", transfer, held.x, held.y);
		source.dispatchEvent(start);
		if (start.defaultPrevented || transfer.types.length === 0) return;

		// What the source asked to be dragged as, as a mouse drag would show it
		// -- the node picker gives the node itself. Otherwise a label, since the
		// thing itself stays where it is.
		const ghost = document.createElement("div");
		const image = transfer.image;
		if (image) {
			ghost.className = "touch-drag-image";
			ghost.appendChild(image.element);
		} else {
			ghost.className = "touch-drag-ghost";
			ghost.textContent = (source.textContent ?? "").trim().slice(0, 48);
		}
		document.body.appendChild(ghost);

		drag = {
			id: held.id, source, transfer, ghost, over: null, accepted: false,
			offset: image ? { x: image.x, y: image.y } : null,
		};
		moveDrag(x, y);
	};

	const endDrag = (x: number, y: number, cancelled: boolean) => {
		if (!drag) return;
		const { source, transfer, ghost, over, accepted } = drag;
		drag = null;
		ghost.remove();
		if (!cancelled && over && accepted) over.dispatchEvent(dragEvent("drop", transfer, x, y));
		else over?.dispatchEvent(dragEvent("dragleave", transfer, x, y));
		source.dispatchEvent(dragEvent("dragend", transfer, x, y));
		swallowClickUntil = performance.now() + ECHO_MS;
	};

	target.addEventListener("pointerdown", (e) => {
		if (e.pointerType === "mouse") {
			cancelPress();
			return;
		}
		fingers.add(e.pointerId);
		// A second finger is a pinch, not a press that is taking its time --
		// unless the two are held still, which `pair` watches for. Only when
		// the first had not already become something: a menu opened by its
		// long press, or a drag it armed.
		if (fingers.size > 1) {
			const first = press && !press.fired && !press.armed && fingers.size === 2 ? press : null;
			cancelPress();
			cancelPair();
			lastTap = null;
			if (first) {
				const start = new Map([
					[first.id, { x: first.x, y: first.y }],
					[e.pointerId, { x: e.clientX, y: e.clientY }],
				]);
				pair = {
					start,
					held: false,
					timer: window.setTimeout(() => {
						if (pair && pair.start === start) pair.held = true;
					}, LONG_PRESS_MS),
				};
			}
			return;
		}
		const element = e.target instanceof Element ? e.target : null;
		if (!element) return;
		cancelPress();
		const source = element.closest<HTMLElement>('[draggable="true"]');
		const at = { id: e.pointerId, x: e.clientX, y: e.clientY, element, source };
		press = {
			...at,
			fired: false,
			armed: false,
			timer: window.setTimeout(() => {
				if (!press || press.id !== at.id) return;
				if (at.source) {
					// Held on something draggable: wait to see which it is.
					press.armed = true;
					at.source.classList.add("touch-lifted");
					return;
				}
				press.fired = true;
				sentMenuAt = performance.now();
				fire("contextmenu", element.isConnected ? element : document.body, at.x, at.y);
			}, LONG_PRESS_MS),
		};
	}, true);

	target.addEventListener("pointermove", (e) => {
		if (drag && e.pointerId === drag.id) {
			moveDrag(e.clientX, e.clientY);
			return;
		}
		const from = pair?.start.get(e.pointerId);
		if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > SLOP) {
			// It moved, so it is the pinch or the pan it looked like.
			cancelPair();
			return;
		}
		if (!press || e.pointerId !== press.id || press.fired) return;
		const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP;
		if (!moved) return;
		if (press.armed) startDrag(press, e.clientX, e.clientY);
		else cancelPress();
	}, true);

	/**
	 * An armed press or a drag keeps the page where it is. Without this the
	 * finger that has just been held still on a tree row scrolls the tree the
	 * moment it moves -- and the browser, having started a scroll, cancels the
	 * pointer, so the drag never happens. A touch-move is the one event that can
	 * still refuse the scroll at that point; the first one after a still hold is
	 * always cancelable.
	 */
	target.addEventListener("touchmove", (e) => {
		if (drag || press?.armed) e.preventDefault();
	}, { capture: true, passive: false });

	const lift = (e: PointerEvent, cancelled: boolean) => {
		if (e.pointerType === "mouse") return;
		fingers.delete(e.pointerId);
		if (pair?.start.has(e.pointerId)) {
			const { start, held } = pair;
			cancelPair();
			if (held && !cancelled) {
				// Between the two fingers, which is where the hand was.
				const [a, b] = [...start.values()];
				const x = (a.x + b.x) / 2;
				const y = (a.y + b.y) / 2;
				// On a graph, the canvas itself rather than what the point
				// lands on: between two fingers is often a node, and a node's
				// right-click is its own menu. The search is what was asked for.
				const under = document.elementFromPoint(x, y);
				sentMenuAt = performance.now();
				fire("contextmenu", under?.closest(".canvas") ?? under ?? document.body, x, y, true);
				swallowClickUntil = performance.now() + ECHO_MS;
			}
			lastTap = null;
			return;
		}
		if (drag && e.pointerId === drag.id) {
			endDrag(e.clientX, e.clientY, cancelled);
			lastTap = null;
			return;
		}
		const held = press && e.pointerId === press.id ? press : null;
		if (!held) return;
		window.clearTimeout(held.timer);
		held.source?.classList.remove("touch-lifted");
		press = null;

		if (held.armed) {
			// Held and lifted without moving: it was the menu after all.
			if (!cancelled) {
				sentMenuAt = performance.now();
				fire("contextmenu", held.element.isConnected ? held.element : document.body, held.x, held.y);
			}
			swallowClickUntil = performance.now() + ECHO_MS;
			lastTap = null;
			return;
		}
		if (held.fired) {
			// The menu is open under the finger. The click that follows the lift
			// would land on whatever it was pressed on and act as well.
			swallowClickUntil = performance.now() + ECHO_MS;
			lastTap = null;
			return;
		}
		if (cancelled) return;

		const now = performance.now();
		if (
			lastTap
			&& now - lastTap.at < DOUBLE_TAP_MS
			&& Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_TAP_SLOP
		) {
			lastTap = null;
			sentDoubleAt = now;
			const under = document.elementFromPoint(e.clientX, e.clientY) ?? held.element;
			fire("dblclick", under, e.clientX, e.clientY);
			return;
		}
		lastTap = { x: e.clientX, y: e.clientY, at: now };
	};

	target.addEventListener("pointerup", (e) => lift(e, false), true);
	target.addEventListener("pointercancel", (e) => lift(e, true), true);

	// The browser's own versions, where it has them, arriving after ours.
	target.addEventListener("contextmenu", (e) => {
		if (!e.isTrusted) return;
		if (press && !press.fired) {
			// It beat the timer: let it through and stand ours down.
			cancelPress();
			return;
		}
		if (performance.now() - sentMenuAt < ECHO_MS) {
			e.preventDefault();
			e.stopImmediatePropagation();
		}
	}, true);

	target.addEventListener("dblclick", (e) => {
		if (e.isTrusted && performance.now() - sentDoubleAt < ECHO_MS) {
			e.stopImmediatePropagation();
		}
	}, true);

	target.addEventListener("click", (e) => {
		if (performance.now() < swallowClickUntil) {
			swallowClickUntil = -Infinity;
			e.preventDefault();
			e.stopImmediatePropagation();
		}
	}, true);
}
