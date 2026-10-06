/**
 * Where a menu opened at a point goes, so that all of it is on screen.
 *
 * A context menu opens with its corner at the pointer. Near the bottom of the
 * window -- the last rows of the project tree, Compile Content's above all --
 * that puts its last items below the edge, and Delete is always last. A native
 * menu flips to the other side of the pointer when it does not fit, and so
 * does this.
 *
 * The arithmetic is pure and tested on its own; the hook measures the menu
 * after it is laid out and before it is painted, so it never shows in the
 * wrong place first.
 */

import { type RefObject, useLayoutEffect, useState } from "react";

export interface Point {
	x: number;
	y: number;
}

export interface Size {
	width: number;
	height: number;
}

/** Room kept between a menu and the window's edge. */
const MARGIN = 8;

export function fitOnScreen(at: Point, size: Size, view: Size, margin = MARGIN): Point {
	const axis = (start: number, extent: number, room: number) => {
		if (start + extent <= room - margin) return start;
		// Flipped to the other side of the pointer, as a native menu does.
		if (start - extent >= margin) return start - extent;
		// Neither side holds it: as near the pointer as keeps its far edge on
		// screen, and never past the near one.
		return Math.max(margin, room - margin - extent);
	};
	return { x: axis(at.x, size.width, view.width), y: axis(at.y, size.height, view.height) };
}

/**
 * `at`, moved as far as it takes for the menu in `ref` to fit the window.
 *
 * Keyed by `at` itself rather than its numbers, so a second right-click on the
 * same spot -- a new menu -- is measured afresh rather than handed the place
 * the last one ended up.
 */
export function useOnScreen(ref: RefObject<HTMLElement | null>, at: Point | null): Point | null {
	const [placed, setPlaced] = useState<{ at: Point; pos: Point } | null>(null);
	useLayoutEffect(() => {
		const menu = ref.current;
		if (!at || !menu) return;
		const size = { width: menu.offsetWidth, height: menu.offsetHeight };
		setPlaced({ at, pos: fitOnScreen(at, size, { width: innerWidth, height: innerHeight }) });
	}, [ref, at]);
	return placed?.at === at ? placed.pos : at;
}
