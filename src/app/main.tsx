/**
 * The editor as the daemon serves it.
 *
 * `api.ts` talks to `/api` on the same origin, which is the daemon. The one
 * thing to do first is the key: `roswaal serve` prints the editor's address
 * with it after a `#`, which the browser never sends anywhere. It is taken out
 * of the address, so it is not left in the address bar, the history or a
 * bookmark, and kept in this tab's session storage, which no other port's
 * pages can read, so a reload keeps working. See `server/token.ts`. The hosted
 * build has a worker to wire up first and lives in `src/web/main.tsx`.
 */

import { sendDaemonKey } from "./api.js";
import { bootEditor } from "./boot.jsx";

const IN_ADDRESS = /(^#|&)token=([0-9a-f]{64})(?=&|$)/;
const KEPT = "roswaal.daemonKey";

/** The key in the address, taken out of it; null when there is none. */
function keyFromAddress(): string | null {
	const found = IN_ADDRESS.exec(location.hash);
	if (!found) return null;
	const rest = location.hash.replace(IN_ADDRESS, "$1").replace(/^#&/, "#").replace(/^#$/, "");
	history.replaceState(history.state, "", `${location.pathname}${location.search}${rest}`);
	return found[2];
}

function keep(key: string): void {
	try {
		sessionStorage.setItem(KEPT, key);
	} catch {
		// Storage refused: the key still works until this tab reloads.
	}
}

function kept(): string | null {
	try {
		return sessionStorage.getItem(KEPT);
	} catch {
		return null;
	}
}

const key = keyFromAddress() ?? kept();
if (key) {
	keep(key);
	sendDaemonKey(key);
}

// A new address pasted into this tab after the daemon restarts changes only the
// part after the `#`, which loads nothing: the new key is kept and the editor
// started again with it. A refusal is said by the API itself, on its first call.
addEventListener("hashchange", () => {
	const next = keyFromAddress();
	if (next && next !== key) {
		keep(next);
		location.reload();
	}
});

bootEditor();
