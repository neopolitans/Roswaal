/**
 * Whether the project's place has edits not saved, as the host last said.
 *
 * Edits to the place -- Properties, Explorer, a drag in the view -- are made
 * in the host's copy and reach the file only at a save (`POST /place/save`),
 * as Studio's do. Every answer about the place says whether some are
 * waiting, and whether the file changed on disk under them; `api.ts` hands
 * each here. The place's tab shows a dot for them, Save writes them, and
 * closing the tab or leaving the page asks first.
 */

import { useSyncExternalStore } from "react";

export interface PlaceSaveState {
	/** Edits are waiting for a save. */
	unsaved: boolean;
	/** The file changed on disk since they began: Studio saved it. */
	diskChanged: boolean;
}

const CLEAN: PlaceSaveState = { unsaved: false, diskChanged: false };

let state: PlaceSaveState = CLEAN;
const listeners = new Set<() => void>();

/** An answer about the place, read for whether it has edits waiting. */
export function notePlaceSave(answer: { unsaved?: boolean; diskChanged?: boolean }): void {
	const unsaved = answer.unsaved === true;
	const diskChanged = unsaved && answer.diskChanged === true;
	if (unsaved === state.unsaved && diskChanged === state.diskChanged) return;
	state = unsaved ? { unsaved, diskChanged } : CLEAN;
	for (const l of listeners) l();
}

export function placeSaveState(): PlaceSaveState {
	return state;
}

export function subscribePlaceSave(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function usePlaceSave(): PlaceSaveState {
	return useSyncExternalStore(subscribePlaceSave, placeSaveState);
}

/** Save, from a key: Ctrl or Cmd with S, nothing else held. */
export function saveKey(e: {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
}): boolean {
	return (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s";
}
