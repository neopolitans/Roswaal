/**
 * The two mouse gestures a finger cannot make, made from ones it can.
 *
 * Roswaal puts a lot behind the right button and the double-click: every node,
 * pin, wire and tree row has a menu, and a graph is opened by double-clicking
 * it. A touch screen has neither. iPadOS Safari sends no `contextmenu` for a
 * long press and no `dblclick` for a double tap, so on an iPad none of that
 * was reachable at all.
 *
 * So this turns a **long press** into a `contextmenu` and a **double tap** into
 * a `dblclick`, dispatched on the element under the finger with the finger's
 * coordinates. Every handler already written for the mouse then runs as it is —
 * there is no second, touch-shaped copy of any menu to keep in step.
 *
 * Fingers and pens — an Apple Pencil has no second button either. Not the
 * mouse, which has both gestures already. A browser that sends its own events
 * for these (Android Chrome sends `contextmenu`) has the duplicate swallowed
 * rather than acted on twice.
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

let installed = false;

export function installTouchGestures(target: Window = window): void {
	if (installed) return;
	installed = true;

	/** The one finger that might become a long press, while it is down. */
	let press: {
		id: number; x: number; y: number; element: Element; timer: number; fired: boolean;
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
		if (press) window.clearTimeout(press.timer);
		press = null;
	};

	const fire = (type: "contextmenu" | "dblclick", element: Element, x: number, y: number) => {
		element.dispatchEvent(new MouseEvent(type, {
			bubbles: true,
			cancelable: true,
			composed: true,
			clientX: x,
			clientY: y,
			button: type === "contextmenu" ? 2 : 0,
			detail: type === "dblclick" ? 2 : 0,
			view: window,
		}));
	};

	target.addEventListener("pointerdown", (e) => {
		if (e.pointerType === "mouse") {
			cancelPress();
			return;
		}
		fingers.add(e.pointerId);
		// A second finger is a pinch, not a press that is taking its time.
		if (fingers.size > 1) {
			cancelPress();
			lastTap = null;
			return;
		}
		const element = e.target instanceof Element ? e.target : null;
		if (!element) return;
		cancelPress();
		const at = { id: e.pointerId, x: e.clientX, y: e.clientY, element };
		press = {
			...at,
			fired: false,
			timer: window.setTimeout(() => {
				if (!press || press.id !== at.id) return;
				press.fired = true;
				sentMenuAt = performance.now();
				fire("contextmenu", element.isConnected ? element : document.body, at.x, at.y);
			}, LONG_PRESS_MS),
		};
	}, true);

	target.addEventListener("pointermove", (e) => {
		if (!press || e.pointerId !== press.id || press.fired) return;
		if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) cancelPress();
	}, true);

	const lift = (e: PointerEvent, cancelled: boolean) => {
		if (e.pointerType === "mouse") return;
		fingers.delete(e.pointerId);
		const held = press && e.pointerId === press.id ? press : null;
		if (!held) return;
		window.clearTimeout(held.timer);
		press = null;

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
