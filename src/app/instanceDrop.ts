/**
 * Dropping an instance from the DataModel into a code editor.
 *
 * The place browser and Properties drag out `PROPERTY_DRAG`: an instance's
 * path, and a property or attribute when that is what was picked up. Dropped
 * into Luau, it becomes the code that reaches it, written where the pointer
 * let go. In Code Block a blank line takes a whole `local Name = ...`;
 * anywhere else, and in a box that holds one expression, it is the
 * expression alone.
 */

import type { Extension } from "@codemirror/state";
import { dropCursor, EditorView } from "@codemirror/view";

import type { LuauFragment } from "../core/luau/check.js";
import {
	type InstanceReference,
	type KnownInstance,
	referenceExpression,
	referenceLocal,
} from "../core/luau/instanceReference.js";
import { PROPERTY_DRAG } from "./PlaceBrowser.jsx";

/**
 * What dropping `ref` at a point on `line` writes, and where. `known` is the
 * names in scope there that hold instances, nearest first, for the code to
 * start from rather than spelling the path out again.
 */
export function droppedText(
	ref: InstanceReference,
	kind: LuauFragment,
	line: { from: number; to: number; text: string },
	at: number,
	known: readonly KnownInstance[] = [],
): { from: number; insert: string } {
	if (kind === "block" && line.text.trim() === "") {
		return { from: line.to, insert: referenceLocal(ref, known) };
	}
	return { from: at, insert: referenceExpression(ref, known) };
}

/**
 * Takes instance drops; `kind` is read when one lands, and `known` asked
 * with the code and the point it lands at.
 */
export function instanceDrop(
	kind: () => LuauFragment,
	known: (src: string, at: number) => readonly KnownInstance[] = () => [],
): Extension {
	return [
		dropCursor(),
		EditorView.domEventHandlers({
			dragover(event) {
				if (!event.dataTransfer?.types.includes(PROPERTY_DRAG)) return false;
				event.preventDefault();
				event.dataTransfer.dropEffect = "copy";
				return false;
			},
			drop(event, view) {
				const raw = event.dataTransfer?.getData(PROPERTY_DRAG);
				if (!raw) return false;
				let ref: InstanceReference;
				try {
					ref = JSON.parse(raw) as InstanceReference;
				} catch {
					return false;
				}
				if (!Array.isArray(ref.path) || ref.path.length === 0) return false;
				event.preventDefault();
				const at =
					view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
					view.state.selection.main.head;
				const { from, insert } = droppedText(
					ref,
					kind(),
					view.state.doc.lineAt(at),
					at,
					known(view.state.doc.toString(), at),
				);
				view.dispatch({
					changes: { from, insert },
					selection: { anchor: from + insert.length },
					scrollIntoView: true,
					userEvent: "input.drop",
				});
				view.focus();
				return true;
			},
		}),
	];
}
