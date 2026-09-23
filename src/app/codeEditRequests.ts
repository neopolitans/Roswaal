/**
 * Asking for the code editor from somewhere that cannot reach the app.
 *
 * The canvas opens it through a prop, for a pin's code. The Inspector sits
 * several components away and has no such prop, and a Declare Type written
 * out in Luau wants the same editor — so it asks here, and the app, which
 * owns the editor, listens.
 */

import type { CodeEditState } from "./Overlays.js";

type Listener = (request: CodeEditState) => void;
const listeners = new Set<Listener>();

export function requestCodeEdit(request: CodeEditState): void {
	for (const listener of listeners) listener(request);
}

/** Subscribes, and returns the unsubscribe. */
export function onCodeEditRequest(listener: Listener): () => void {
	listeners.add(listener);
	return () => void listeners.delete(listener);
}
