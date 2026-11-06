/**
 * Putting the page back after the on-screen keyboard.
 *
 * iOS and iPadOS keep a focused field's caret above the keyboard by scrolling
 * whatever holds it: the page itself, and boxes whose overflow is hidden, which
 * nothing can scroll back by hand. When the keyboard goes they stay where they
 * were put, so the editor's top row and side strip are left above the screen.
 * Turning the iPad cleared it only for that orientation, and with both stuck
 * the controls were out of reach. So once the keyboard has gone, or the screen
 * has turned, every such shift is put back.
 *
 * A box that is meant to scroll -- the docs, a list -- is left as it is: only
 * the page and hidden-overflow boxes are reset, and those never scroll on
 * purpose. Each way on its own: a row of tabs is hidden up and down but
 * scrolls sideways, and its sideways scroll is the tab in front kept in sight. A text field is left too: its overflow reads as clipped, but its
 * scroll is the browser keeping the caret in sight as you type.
 */

/**
 * Whether the keyboard is up: the visible area noticeably shorter than the
 * window. Without a visual viewport there is no telling, and nothing is moved.
 */
export function keyboardUp(visible: number | undefined, whole: number): boolean {
	return visible === undefined || visible < whole * 0.85;
}

interface Scrolled {
	scrollTop: number;
	scrollLeft: number;
	parentElement: Scrolled | null;
	tagName?: string;
}

/** A field that scrolls its own text to show the caret. */
const TEXT_FIELD = /^(input|textarea|select)$/i;

const STILL = /^(hidden|clip)$/;

/**
 * Puts back what the keyboard scrolled: the page, and every hidden-overflow
 * box from `from` up. `overflowOf` answers a box's overflow up and down, then
 * sideways, as "hidden auto"; one word is both. Returns how many boxes were
 * moved, for the tests.
 */
export function settle(
	from: Scrolled | null,
	page: { scrollX: number; scrollY: number; scrollTo(x: number, y: number): void },
	overflowOf: (box: Scrolled) => string,
): number {
	if (page.scrollX !== 0 || page.scrollY !== 0) page.scrollTo(0, 0);
	let moved = 0;
	for (let box = from; box; box = box.parentElement) {
		if (box.scrollTop === 0 && box.scrollLeft === 0) continue;
		if (TEXT_FIELD.test(box.tagName ?? "")) continue;
		const [y, x = y] = overflowOf(box).trim().split(/\s+/);
		const top = box.scrollTop !== 0 && STILL.test(y);
		const left = box.scrollLeft !== 0 && STILL.test(x);
		if (top) box.scrollTop = 0;
		if (left) box.scrollLeft = 0;
		if (top || left) moved++;
	}
	return moved;
}

let installed = false;

export function installKeyboardSettle(target: Window = window): void {
	if (installed) return;
	installed = true;

	// The field the keyboard was for: what it scrolled is above it.
	let focused: Element | null = null;
	target.addEventListener("focusin", (event) => {
		const field = event.target as Element | null;
		if (field && "parentElement" in field) focused = field;
	});

	// A box that scrolled while the keyboard was down: put back from there.
	let scrolled: Element | null = null;

	let pending = 0;
	const later = (delay: number) => {
		target.clearTimeout(pending);
		pending = target.setTimeout(() => {
			if (keyboardUp(target.visualViewport?.height, target.innerHeight)) return;
			const overflowOf = (box: Scrolled) => {
				const style = target.getComputedStyle(box as unknown as Element);
				return `${style.overflowY} ${style.overflowX}`;
			};
			if (scrolled) settle(scrolled as unknown as Scrolled, target, overflowOf);
			scrolled = null;
			settle(
				(focused as unknown as Scrolled | null) ?? (target.document.body as unknown as Scrolled),
				target,
				overflowOf,
			);
		}, delay);
	};

	// The keyboard going: the visible area grows back, and focus leaves the field.
	target.visualViewport?.addEventListener("resize", () => later(60));
	target.addEventListener("focusout", () => later(250));
	// A turn lays the page out again, with whatever shift it had.
	target.addEventListener("orientationchange", () => later(300));
	target.addEventListener("resize", () => later(150));
	// And any scroll of the page, or of a box that never scrolls on purpose,
	// while the keyboard is down: nothing in the editor asks for one, but iOS
	// left the window shifted in ways the four above did not catch. Heard
	// while capturing, as a box's scroll does not bubble; while the keyboard
	// is up, iOS is left to show the caret.
	target.document.addEventListener(
		"scroll",
		(event) => {
			if (keyboardUp(target.visualViewport?.height, target.innerHeight)) return;
			const box = event.target;
			if (box instanceof Element) scrolled = box;
			later(60);
		},
		{ capture: true, passive: true },
	);
}
