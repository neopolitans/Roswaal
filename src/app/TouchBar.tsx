/**
 * The keyboard's edits, as buttons, for a phone or a tablet.
 *
 * Its own module because two canvases draw it: the editor's graph and Node
 * Design's logic graph. Each has its own key handler with the same keys, and
 * the bar sends keystrokes, so it works under either without knowing which.
 */

import type { NodeScript } from "../core/schema.js";
import { Icon, type IconName } from "./icons.jsx";
import type { ActionLabels, ActionRowStyle } from "./preferences.js";
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

export function TouchBar({ selected, canPaste, locked, labels = "icons", style = "separate" }: {
	selected: number;
	canPaste: boolean;
	locked: boolean;
	/** Glyphs or names; see the Action buttons preference. */
	labels?: ActionLabels;
	/** Buttons each on their own, or one bar; see the Action row preference. */
	style?: ActionRowStyle;
}) {
	const press = (key: string, withMod: boolean) =>
		document.body.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: withMod, bubbles: true }));
	// Read at render: the bar redraws with the editor on every edit.
	const history = { undo: store.canUndo(), redo: store.canRedo() };

	/**
	 * One action. Its name is always its accessible name and its tooltip -- a
	 * long press shows it on an iPad -- so choosing icons hides a word, never
	 * the meaning.
	 */
	const action = (
		name: string, icon: IconName, key: string, withMod: boolean, disabled: boolean,
	) => (
		<button
			key={name}
			className={labels === "icons" ? "tb icon-only" : "tb"}
			title={name}
			aria-label={name}
			disabled={disabled}
			onClick={() => press(key, withMod)}
		>
			{labels === "icons" ? <Icon name={icon} size={24} /> : name}
		</button>
	);

	return (
		<div className={`touch-bar-group${style === "unified" ? " unified" : ""}`}>
			{action("Undo", "undo", "z", true, locked || !history.undo)}
			{action("Redo", "redo", "y", true, locked || !history.redo)}
			{/* A lines the selection up on the node picked first. */}
			{selected > 1 && action("Align", "straighten", "a", false, locked)}
			{selected > 0 && (
				<>
					{action("Copy", "copy", "c", true, false)}
					{action("Cut", "cut", "x", true, locked)}
					{action("Duplicate", "duplicate", "d", true, locked)}
					{action("Delete", "remove", "Delete", false, locked)}
				</>
			)}
			{canPaste && action("Paste", "paste", "v", true, locked)}
		</div>
	);
}
