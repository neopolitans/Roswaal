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
 * purpose.
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
}

/**
 * Puts back what the keyboard scrolled: the page, and every hidden-overflow
 * box from `from` up. Returns how many boxes were moved, for the tests.
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
		const overflow = overflowOf(box);
		if (!/\b(hidden|clip)\b/.test(overflow)) continue;
		box.scrollTop = 0;
		box.scrollLeft = 0;
		moved++;
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

	let pending = 0;
	const later = (delay: number) => {
		target.clearTimeout(pending);
		pending = target.setTimeout(() => {
			if (keyboardUp(target.visualViewport?.height, target.innerHeight)) return;
			settle(
				(focused as unknown as Scrolled | null) ?? (target.document.body as unknown as Scrolled),
				target,
				(box) => {
					const style = target.getComputedStyle(box as unknown as Element);
					return `${style.overflowY} ${style.overflowX}`;
				},
			);
		}, delay);
	};

	// The keyboard going: the visible area grows back, and focus leaves the field.
	target.visualViewport?.addEventListener("resize", () => later(60));
	target.addEventListener("focusout", () => later(250));
	// A turn lays the page out again, with whatever shift it had.
	target.addEventListener("orientationchange", () => later(300));
	target.addEventListener("resize", () => later(150));
}
