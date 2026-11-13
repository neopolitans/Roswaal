/**
 * Whether the editor shows its notice of the Terms of Service and Privacy
 * Policy: on a first visit, and again when either page has changed since this
 * browser last saw it. See `LegalNotice.tsx`.
 *
 * Remembered in local storage under a `roswaal` name, as the Privacy Policy
 * says preferences are.
 */

import { LEGAL_EDITED } from "../core/docs/pages/legal.js";

const KEY = "roswaal.legal.seen";

/** What is remembered: each page's Last Edited date. */
export function legalStamp(edited: { terms: string; privacy: string } = LEGAL_EDITED): string {
	return `terms ${edited.terms}; privacy ${edited.privacy}`;
}

/** Why the notice is shown: never seen, or seen before a change. Null when it is not. */
export function legalNoticeState(
	seen: string | null,
	stamp: string = legalStamp(),
): "first" | "changed" | null {
	if (seen === stamp) return null;
	return seen === null ? "first" : "changed";
}

export function readLegalSeen(storage: Pick<Storage, "getItem"> | undefined): string | null {
	try {
		return storage?.getItem(KEY) ?? null;
	} catch {
		return null;
	}
}

export function rememberLegalSeen(
	storage: Pick<Storage, "setItem"> | undefined,
	stamp: string = legalStamp(),
): void {
	try {
		storage?.setItem(KEY, stamp);
	} catch {
		// Storage that refuses (a private window, blocked site data) means the
		// notice comes back next visit, which is the safe way to be wrong.
	}
}
