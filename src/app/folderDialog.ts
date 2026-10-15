/**
 * The daemon's folder dialog, asked for from any page.
 *
 * The daemon shows one dialog at a time, and a second ask waits for the
 * answer to the first. That is right, but a dialog that opened behind another
 * window made the button look dead, so a second ask from this tab says where
 * the first one is likely to be.
 */

import { api } from "./api.js";
import { showToast } from "./Toast.jsx";

/** Dialogs this tab has asked for and not had an answer to. */
let waiting = 0;

export async function chooseFolder(startIn?: string): Promise<{ path: string | null }> {
	if (waiting > 0) {
		showToast({
			title: "The folder dialog is already open",
			detail: "It may be behind another window",
			tone: "warn",
		});
	}
	waiting++;
	try {
		return await api.browseForProject(startIn);
	} finally {
		waiting--;
	}
}
