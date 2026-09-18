/**
 * The keyboard's edits, as buttons, for a phone or a tablet.
 *
 * Its own module because two canvases draw it: the editor's graph and Node
 * Design's logic graph. Each has its own key handler with the same keys, and
 * the bar sends keystrokes, so it works under either without knowing which.
 */

import type { NodeScript } from "../core/schema.js";
import { Icon } from "./icons.jsx";
import { store } from "./store.js";

/**
 * How many selected things still exist. A delete leaves the removed ids in the
 * selection, which nothing drew and a keyboard never noticed -- but the touch
 * bar counted them and went on offering Copy and Delete for nothing.
 */
export function liveSelection(script: NodeScript, selection: ReadonlySet<string>): number {
	let live = 0;
	for (const id of selection) {
		if (script.nodes.some((n) => n.id === id) || script.comments.some((c) => c.id === id)) live++;
	}
	return live;
}

export function TouchBar({ selected, canPaste, locked }: { selected: number; canPaste: boolean; locked: boolean }) {
	const press = (key: string, withMod: boolean) =>
		document.body.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: withMod, bubbles: true }));
	// Read at render: the bar redraws with the editor on every edit.
	const history = { undo: store.canUndo(), redo: store.canRedo() };
	return (
		<>
			<button
				className="tb icon-only"
				title="Undo"
				aria-label="Undo"
				disabled={locked || !history.undo}
				onClick={() => press("z", true)}
			>
				<Icon name="undo" size={18} />
			</button>
			<button
				className="tb icon-only"
				title="Redo"
				aria-label="Redo"
				disabled={locked || !history.redo}
				onClick={() => press("y", true)}
			>
				<Icon name="redo" size={18} />
			</button>
			{selected > 1 && (
				<button
					className="tb with-icon"
					title="Align the selection on the node picked first, as A does"
					disabled={locked}
					onClick={() => press("a", false)}
				>
					<Icon name="straighten" size={18} />
					Align
				</button>
			)}
			{selected > 0 && (
				<>
					<button className="tb" onClick={() => press("c", true)}>Copy</button>
					<button className="tb" disabled={locked} onClick={() => press("x", true)}>Cut</button>
					<button className="tb" disabled={locked} onClick={() => press("d", true)}>Duplicate</button>
					<button className="tb" disabled={locked} onClick={() => press("Delete", false)}>Delete</button>
				</>
			)}
			{canPaste && (
				<button className="tb" disabled={locked} onClick={() => press("v", true)}>Paste</button>
			)}
		</>
	);
}
