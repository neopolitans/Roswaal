/**
 * Asking for a field in the Code panel from somewhere that cannot reach the app.
 *
 * The canvas opens one through a prop, for a pin's code. The Inspector sits
 * several components away and has no such prop, and a Declare Type written
 * out in Luau wants the same panel -- so it asks here, and the app, which
 * owns the panel's tabs, listens.
 */

import type { LuauFragment } from "../core/luau/check.js";

/** A field to open: a pin's code, or a Declare Type's definition. */
export interface CodeOpenRequest {
	nodeId: string;
	/** The pin whose literal is the code. */
	pin?: string;
	/** A config field to write to, rather than a pin's literal. */
	field?: "definition";
	/** What the text must parse as. Worked out from the node when absent. */
	kind?: LuauFragment;
}

type Listener = (request: CodeOpenRequest) => void;
const listeners = new Set<Listener>();

export function requestCodeEdit(request: CodeOpenRequest): void {
	for (const listener of listeners) listener(request);
}

/** Subscribes, and returns the unsubscribe. */
export function onCodeEditRequest(listener: Listener): () => void {
	listeners.add(listener);
	return () => void listeners.delete(listener);
}
