/**
 * The editor's modal: one question at a time, answered through a promise.
 */

import { useCallback, useRef, useState } from "react";

import type { DialogRequest, DialogResult, PendingDialog } from "./Dialog.jsx";

export interface Dialogs {
	/** The question on screen, for the shell to render. */
	dialog: PendingDialog | null;
	/** True while one is open, read by key handlers that must stand aside. */
	dialogOpen: { readonly current: boolean };
	ask: (request: DialogRequest) => Promise<DialogResult>;
	/** A notice: one button, and nothing to wait for. */
	notify: (title: string, message: string) => void;
}

export function useDialogs(): Dialogs {
	const [dialog, setDialog] = useState<PendingDialog | null>(null);
	/**
	 * Opens a modal and resolves with what the developer chose.
	 *
	 * One at a time: a second question replaces the first, which is answered
	 * as dismissed. It used to be dropped unanswered, and whatever was waiting
	 * on it waited for ever.
	 */
	const answerDialog = useRef<((result: DialogResult) => void) | null>(null);
	const dialogOpen = useRef(false);
	const ask = useCallback((request: DialogRequest): Promise<DialogResult> => {
		answerDialog.current?.(null);
		return new Promise((resolve) => {
			const answer = (result: DialogResult) => {
				if (answerDialog.current !== answer) return;
				answerDialog.current = null;
				dialogOpen.current = false;
				setDialog(null);
				resolve(result);
			};
			answerDialog.current = answer;
			dialogOpen.current = true;
			setDialog({ request, resolve: answer });
		});
	}, []);

	const notify = useCallback(
		(title: string, message: string) => void ask({ kind: "notice", title, message }),
		[ask],
	);

	return { dialog, dialogOpen, ask, notify };
}
