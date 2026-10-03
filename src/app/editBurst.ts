/**
 * Typing in a field as one undo step, not one per keystroke.
 *
 * A text field in the Inspector writes the graph on every keystroke, so the
 * node and the generated Luau follow as you type. Each of those writes was its
 * own undo entry, and undoing a function name took one Ctrl+Z per letter.
 *
 * A burst opens a store transaction (`store.begin`) at the first keystroke and
 * closes it (`store.end`) when the typing is over: the field loses focus, Enter
 * is pressed, the pointer goes down anywhere, or the field goes away. The
 * pointer is in that list because it can switch the graph before the field
 * has blurred -- a tab activates on `pointerdown`, ahead of the focus change --
 * and a transaction must end on the document it began on.
 *
 * Not for pickers, selects and buttons: each of those is one decision, and one
 * edit already.
 */

import { useEffect, useMemo } from "react";

import type { NodeScript } from "../core/schema.js";
import { store } from "./store.js";

/** The parts of the store a burst uses, so a test can stand in for it. */
export interface BurstStore {
	begin(): void;
	end(): void;
	edit(fn: (script: NodeScript) => NodeScript): void;
	/** The document edits go to now. */
	activePath(): string | null;
}

/** One run of typing in one field. */
export class EditBurst {
	/** The document the open transaction began on; undefined while closed. */
	private openOn: string | null | undefined = undefined;

	constructor(private readonly target: BurstStore) {}

	/** Whether a transaction is open. */
	get open(): boolean {
		return this.openOn !== undefined;
	}

	/** Apply one keystroke's edit, opening the transaction on the first. */
	edit(fn: (script: NodeScript) => NodeScript): void {
		if (this.openOn === undefined) {
			this.target.begin();
			this.openOn = this.target.activePath();
		}
		this.target.edit(fn);
	}

	/**
	 * Close the transaction, making everything typed one undo entry.
	 *
	 * Only on the document it opened on. If another graph is active by now the
	 * store has no way to end that one (`end` acts on the active document), so
	 * it is left for the next transaction on it to close rather than closing an
	 * unrelated one here.
	 */
	end(): void {
		if (this.openOn === undefined) return;
		const same = this.target.activePath() === this.openOn;
		this.openOn = undefined;
		if (same) this.target.end();
	}
}

const STORE: BurstStore = {
	begin: () => store.begin(),
	end: () => store.end(),
	edit: (fn) => store.edit(fn),
	activePath: () => store.getSnapshot().path,
};

/** The handlers a typing field spreads onto its `<input>` or `<textarea>`. */
export interface BurstFieldProps {
	onBlur: () => void;
	onKeyDown: (e: { key: string }) => void;
}

/**
 * A burst for one component's fields, closed when the component unmounts and
 * on any pointer press. `field` goes on every text input that calls `edit`.
 */
export function useEditBurst(): {
	edit: (fn: (script: NodeScript) => NodeScript) => void;
	field: BurstFieldProps;
} {
	const burst = useMemo(() => new EditBurst(STORE), []);

	useEffect(() => {
		// Captured, so it runs before whatever the press lands on can switch
		// the graph. Pressing inside the field itself ends the burst too; the
		// next keystroke starts another, which is a fair place for a step.
		const away = () => burst.end();
		window.addEventListener("pointerdown", away, true);
		return () => {
			window.removeEventListener("pointerdown", away, true);
			burst.end();
		};
	}, [burst]);

	return useMemo(
		() => ({
			edit: (fn: (script: NodeScript) => NodeScript) => burst.edit(fn),
			field: {
				onBlur: () => burst.end(),
				onKeyDown: (e: { key: string }) => {
					if (e.key === "Enter") burst.end();
				},
			},
		}),
		[burst],
	);
}
