/**
 * Close a menu or popover when the pointer goes down anywhere outside it.
 *
 * One behaviour for every menu: a **captured** `pointerdown` on the window.
 * Captured, so a press on the graph closes the menu before the graph acts on
 * the press as well; `pointerdown` rather than `mousedown`, so a finger closes
 * it on the way down instead of after the browser's emulated mouse events.
 *
 * Registered from an effect, after the press that opened the menu has been
 * dispatched, so that press cannot close it again -- even when the menu opens
 * inside a `pointerdown` handler, since a capture listener added to the window
 * mid-dispatch is not called for the event already passing through.
 *
 * Not a focus trap and not a modal: a dialog has its own rules (`Dialog.tsx`).
 */

import { useEffect, useRef, type RefObject } from "react";

export interface DismissOptions {
	/** Listen only while this is true -- a popover that is shut has nothing to close. */
	enabled?: boolean;
	/** Escape closes it too. For menus; a field inside may want Escape for itself. */
	escape?: boolean;
}

/**
 * Call `onClose` when a press lands outside `ref`, or on Escape if asked.
 *
 * `onClose` is read through a ref, so a caller may pass a fresh arrow every
 * render without the listeners being taken down and put back each time.
 */
export function useDismiss(
	ref: RefObject<Element | null>,
	onClose: () => void,
	{ enabled = true, escape = false }: DismissOptions = {},
): void {
	const close = useRef(onClose);
	close.current = onClose;

	useEffect(() => {
		if (!enabled) return;
		const away = (e: PointerEvent) => {
			// A pointer event dispatched to the page always targets a Node.
			if (!ref.current?.contains(e.target as Node)) close.current();
		};
		const key = (e: KeyboardEvent) => {
			if (e.key === "Escape") close.current();
		};
		window.addEventListener("pointerdown", away, true);
		if (escape) window.addEventListener("keydown", key, true);
		return () => {
			window.removeEventListener("pointerdown", away, true);
			window.removeEventListener("keydown", key, true);
		};
	}, [ref, enabled, escape]);
}
