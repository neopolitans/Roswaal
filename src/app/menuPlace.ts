/**
 * Where a menu goes, so that all of it is on screen.
 *
 * A menu opens one of two ways. A context menu opens with its corner at the
 * pointer; near the bottom of the window -- the last rows of the project tree,
 * Compile Content's above all -- that puts its last entries below the edge,
 * and Delete is always last. So, as a native menu does, it opens on the other
 * side of the pointer when it does not fit. A dropdown hangs from the button
 * that opened it, below or above, lined up with one of its edges; it goes to
 * the other side of the button when there is no room, and slides along it to
 * stay inside the window.
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

export interface Box {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** A dropdown's button, and how the menu would like to hang from it. */
export interface ButtonAnchor {
	element: Element;
	/** Below the button unless said otherwise: above suits a button at the foot of something. */
	side?: "below" | "above";
	/** Which edges line up: `end` for a button at the right-hand end of a row. */
	align?: "start" | "end";
}

/** Where a menu is opened: at a point, or from a button. */
export type MenuAnchor = Point | ButtonAnchor;

/** Room kept between a menu and the window's edge. */
const MARGIN = 8;

/** The gap between a button and the menu hanging from it. */
const GAP = 4;

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

export function hangFrom(
	button: Box,
	size: Size,
	view: Size,
	{ side = "below", align = "start" }: Pick<ButtonAnchor, "side" | "align"> = {},
	margin = MARGIN,
): Point {
	const below = button.bottom + GAP;
	const above = button.top - GAP - size.height;
	const fitsBelow = below + size.height <= view.height - margin;
	const fitsAbove = above >= margin;
	let y: number;
	if (side === "below") y = fitsBelow || !fitsAbove ? below : above;
	else y = fitsAbove || !fitsBelow ? above : below;
	// Neither side holds it: inside the window, its top edge winning.
	y = Math.max(margin, Math.min(y, view.height - margin - size.height));

	const x = align === "start" ? button.left : button.right - size.width;
	return { x: Math.max(margin, Math.min(x, view.width - margin - size.width)), y };
}

function isPoint(anchor: MenuAnchor): anchor is Point {
	return "x" in anchor;
}

/** Where the menu goes before it has been measured: a first guess that the layout effect corrects. */
function roughly(anchor: MenuAnchor): Point {
	if (isPoint(anchor)) return anchor;
	const box = anchor.element.getBoundingClientRect();
	return { x: box.left, y: box.bottom + GAP };
}

/**
 * Where the menu in `ref` goes for `anchor`.
 *
 * Keyed by what the anchor says rather than by the object, so a caller may
 * write `at={{ x, y }}` inline without every render measuring again -- and a
 * second right-click at a new spot, a new menu, is measured afresh.
 */
export function usePlacement(ref: RefObject<HTMLElement | null>, anchor: MenuAnchor): Point {
	const key = isPoint(anchor)
		? `${anchor.x},${anchor.y}`
		: `${anchor.side ?? "below"},${anchor.align ?? "start"}`;
	const element = isPoint(anchor) ? null : anchor.element;
	const [placed, setPlaced] = useState<{ key: string; element: Element | null; at: Point } | null>(
		null,
	);
	// `anchor` is read through `key` and `element`, which are all it says; the
	// object itself is new on every render of an inline `at={{…}}`.
	// biome-ignore lint/correctness/useExhaustiveDependencies: anchor, by key and element
	useLayoutEffect(() => {
		const menu = ref.current;
		if (!menu) return;
		const size = { width: menu.offsetWidth, height: menu.offsetHeight };
		const view = { width: innerWidth, height: innerHeight };
		const at = isPoint(anchor)
			? fitOnScreen(anchor, size, view)
			: hangFrom(anchor.element.getBoundingClientRect(), size, view, anchor);
		setPlaced({ key, element, at });
	}, [ref, key, element]);
	return placed?.key === key && placed.element === element ? placed.at : roughly(anchor);
}
