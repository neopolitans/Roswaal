/**
 * Undo and redo for changes to the place: Properties' values, attributes and
 * tags, and Explorer's adds, deletes, moves and duplicates.
 *
 * Each change's answer names the change that undoes it (see `undo` on
 * `POST /place/property` and `POST /place/instance`), so a step is that
 * request, not a copy of the file. Applying one answers with its own undo,
 * which goes on the other stack: undo and redo are the same act.
 *
 * Steps name instances by their index in the place's outline. That holds
 * because the stacks are last in, first out: each step meets the place as
 * it was just after the change it undoes. A version of the place this did not
 * write -- Studio saved it, an export wrote scripts into it -- empties both.
 *
 * Which history Ctrl+Z reaches is decided here too. The graph keeps its own;
 * the place's has the keys while its tab is in front, or while the last
 * click was in Explorer's DataModel view, Properties, or the place's view.
 */

import type { RawProp } from "../core/rbx/rawValue.js";
import type { PlaceInstanceChange } from "./api.js";

/** One step: the request that makes it, and what it changes, for the notice. */
export type PlaceStep =
	| { kind: "property"; index: number; property: string; raw: RawProp; label: string }
	| { kind: "instance"; change: PlaceInstanceChange; label: string };

export interface PlaceHistory {
	undo: readonly PlaceStep[];
	redo: readonly PlaceStep[];
	/** The version of the place the top of `undo` meets. */
	stamp: string | null;
	/** Every version this history wrote or started from: one it did not is a change made elsewhere. */
	known: ReadonlySet<string>;
}

export type Direction = "undo" | "redo";

/** The most steps kept to undo. */
export const LIMIT = 100;

export const EMPTY: PlaceHistory = { undo: [], redo: [], stamp: null, known: new Set() };

/** A change made, at `stamp`: its undo on top, nothing left to redo. A change with no undo empties both. */
export function recorded(h: PlaceHistory, step: PlaceStep | null, stamp: string): PlaceHistory {
	const known = new Set(h.known).add(stamp);
	if (!step) return { undo: [], redo: [], stamp, known };
	return { undo: [...h.undo, step].slice(-LIMIT), redo: [], stamp, known };
}

/** The step an undo or redo takes, and the history without it; null with nothing to take. */
export function taken(
	h: PlaceHistory,
	which: Direction,
): { step: PlaceStep; rest: PlaceHistory } | null {
	const list = h[which];
	const step = list[list.length - 1];
	if (!step) return null;
	return { step, rest: { ...h, [which]: list.slice(0, -1) } };
}

/**
 * The history after a step taken from `which` was written, at `stamp`: what
 * undoes it on the other stack. Without one, the other stack empties, since
 * what is under it no longer meets the place it expects.
 */
export function applied(
	rest: PlaceHistory,
	which: Direction,
	inverse: PlaceStep | null,
	stamp: string,
): PlaceHistory {
	const other: Direction = which === "undo" ? "redo" : "undo";
	const known = new Set(rest.known).add(stamp);
	return {
		...rest,
		[other]: inverse ? [...rest[other], inverse].slice(-LIMIT) : [],
		stamp,
		known,
	};
}

/** The history once the place is seen at `stamp`: emptied if something else wrote that version. */
export function seen(h: PlaceHistory, stamp: string): PlaceHistory {
	if (h.known.has(stamp)) return h;
	return { undo: [], redo: [], stamp, known: new Set([stamp]) };
}

// -- one history per project ---------------------------------------------------

const histories = new Map<string, PlaceHistory>();

export function historyOf(project: string): PlaceHistory {
	return histories.get(project) ?? EMPTY;
}

export function setHistory(project: string, h: PlaceHistory): void {
	histories.set(project, h);
}

// -- which history has the keys --------------------------------------------------

/** Where a click gives the place's history the keys. */
const PLACE_SURFACES = ".place-browser, .place-properties, .viewport, .vp-dock";

let placeInFront = false;
let lastInPlace = false;

/** The place's tab is the document in front: its history has the keys. */
export function setPlaceInFront(front: boolean): void {
	placeInFront = front;
	if (!front) lastInPlace = false;
}

/** Follows where the last click or focus went, until the returned function stops it. */
export function watchPlaceFocus(): () => void {
	const note = (e: Event) => {
		lastInPlace = e.target instanceof Element && e.target.closest(PLACE_SURFACES) !== null;
	};
	addEventListener("pointerdown", note, true);
	addEventListener("focusin", note, true);
	return () => {
		removeEventListener("pointerdown", note, true);
		removeEventListener("focusin", note, true);
	};
}

/** Whether Ctrl+Z, with `target` where it was pressed, is the place's rather than the graph's. */
export function placeHasKeys(target: EventTarget | null): boolean {
	const element = typeof Element !== "undefined" && target instanceof Element ? target : null;
	if (element?.closest(PLACE_SURFACES)) return true;
	return lastInPlace || placeInFront;
}

/** Undo or redo, from a key: Ctrl or Cmd with Z, Shift for redo, or Y. */
export function undoKey(e: {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
}): Direction | null {
	if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
	const key = e.key.toLowerCase();
	if (key === "z") return e.shiftKey ? "redo" : "undo";
	if (key === "y" && !e.shiftKey) return "redo";
	return null;
}
