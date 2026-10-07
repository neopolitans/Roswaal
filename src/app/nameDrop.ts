/**
 * A name dragged from the Variables panel into code: a variable, a service, a
 * module, a local, a function or a type, written where it is dropped.
 *
 * The panel's rows already drag out for the canvas, where each becomes the
 * node that reads it. In code the same drag means the name itself -- what the
 * generated file calls that thing, so `playersJoined += 1` reads the variable
 * the panel lists. The DataModel and Properties drag in through
 * `instanceDrop`, which writes a path rather than a name.
 */

import { dropCursor, EditorView } from "@codemirror/view";
import { namedResultRef } from "../core/namedResults.js";
import type { Registry } from "../core/nodes/index.js";
import { localNameOf } from "../core/nodes/variables.js";
import type { NodeScript } from "../core/schema.js";
import { configText } from "./nodeConfig.js";

/** The kinds of row the Variables panel drags, by their data type. */
export const NAME_DRAGS = [
	"application/x-roswaal-variable",
	"application/x-roswaal-service",
	"application/x-roswaal-module",
	"application/x-roswaal-local",
	"application/x-roswaal-function",
	"application/x-roswaal-type",
] as const;

export type NameDrag = (typeof NAME_DRAGS)[number];

/**
 * The name a dragged row stands for in code, or undefined when it no longer
 * names anything in this script -- a variable deleted while it was dragged.
 */
export function droppedName(
	script: NodeScript | null,
	registry: Registry,
	kind: NameDrag,
	payload: unknown,
): string | undefined {
	if (typeof payload !== "object" || payload === null) return undefined;
	const data = payload as { id?: unknown; service?: unknown; type?: unknown };
	const id = typeof data.id === "string" ? data.id : undefined;
	switch (kind) {
		case "application/x-roswaal-service":
			return typeof data.service === "string" && data.service.trim()
				? data.service.trim()
				: undefined;
		case "application/x-roswaal-type":
			return typeof data.type === "string" && data.type.trim() ? data.type.trim() : undefined;
		case "application/x-roswaal-variable":
			return script?.variables.find((v) => v.id === id)?.name;
		case "application/x-roswaal-module":
			return script?.modules?.find((m) => m.id === id)?.name || undefined;
		case "application/x-roswaal-local": {
			const node = script?.nodes.find((n) => n.id === id);
			if (!node) return undefined;
			// A Declare Local, or a step whose result is named.
			return node.def === "local.declare"
				? localNameOf(node)
				: namedResultRef(node, registry)?.name;
		}
		case "application/x-roswaal-function": {
			const node = script?.nodes.find((n) => n.id === id);
			return node ? configText(node, "name") || undefined : undefined;
		}
	}
}

/** The kind of row being dragged, if it is one of the panel's. */
function draggedKind(transfer: DataTransfer | null): NameDrag | undefined {
	if (!transfer) return undefined;
	return NAME_DRAGS.find((kind) => transfer.types.includes(kind));
}

/**
 * The editor half: accepts the panel's rows, and writes the name at the
 * point the pointer let go, with the cursor after it. The script is read
 * through a getter, so a name renamed since the editor opened is the new one.
 */
export function nameDrop(script: () => NodeScript | null, registry: Registry) {
	return [
		dropCursor(),
		EditorView.domEventHandlers({
			dragover(event) {
				if (!draggedKind(event.dataTransfer)) return false;
				event.preventDefault();
				if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
				return false;
			},
			drop(event, view: EditorView) {
				const kind = draggedKind(event.dataTransfer);
				if (!kind) return false;
				let payload: unknown;
				try {
					payload = JSON.parse(event.dataTransfer?.getData(kind) ?? "");
				} catch {
					return false;
				}
				const name = droppedName(script(), registry, kind, payload);
				if (!name) return false;
				event.preventDefault();
				const at =
					view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
					view.state.selection.main.head;
				view.dispatch({
					changes: { from: at, insert: name },
					selection: { anchor: at + name.length },
					userEvent: "input.drop",
				});
				view.focus();
				return true;
			},
		}),
	];
}
