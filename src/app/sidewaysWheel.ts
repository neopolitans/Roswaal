/**
 * A mouse wheel that scrolls a row of tabs sideways.
 *
 * The tab rows scroll horizontally, with their scrollbars hidden. A trackpad
 * scrolls them by itself, sending sideways movement; a mouse wheel sends only
 * up and down, which a row that cannot scroll vertically ignores -- so on a
 * Windows mouse the tabs past the edge could not be reached at all. This turns
 * an up-and-down turn of the wheel into sideways scrolling, while the row has
 * more than it shows.
 *
 * A native listener rather than React's `onWheel`, which React attaches as
 * passive: the page would then scroll as well, and nothing could stop it.
 */

import { type RefObject, useEffect } from "react";

/** Pixels per line, for a wheel that reports lines: `deltaMode` 1. */
const LINE = 16;

/**
 * `count` is how many tabs the row holds: asked again when it changes, because
 * a row with no tabs may not be in the page yet, and the listener has to find
 * the element once it is.
 */
export function useSidewaysWheel(row: RefObject<HTMLElement | null>, count: number): void {
	useEffect(() => {
		const element = row.current;
		if (!element) return;
		const onWheel = (event: WheelEvent) => {
			// Ctrl with the wheel is zoom, and a sideways gesture already scrolls.
			if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
			if (element.scrollWidth <= element.clientWidth) return;
			const step =
				event.deltaMode === 1
					? event.deltaY * LINE
					: event.deltaMode === 2
						? event.deltaY * element.clientWidth
						: event.deltaY;
			const before = element.scrollLeft;
			element.scrollLeft += step;
			// Only claimed when the row moved: at either end, the wheel is the
			// page's again.
			if (element.scrollLeft !== before) event.preventDefault();
		};
		element.addEventListener("wheel", onWheel, { passive: false });
		return () => element.removeEventListener("wheel", onWheel);
	}, [row, count]);
}
