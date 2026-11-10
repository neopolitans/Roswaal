/**
 * The daemon's key: what a request to `/api` has to carry (F2).
 *
 * The daemon listens on loopback, which keeps other computers out but not
 * other accounts on this one: anybody logged in here could connect to
 * 127.0.0.1:4471 and open any folder your account can read as a project. So
 * the API asks for a key, kept in a file only your account can read, and
 * nothing without it gets further than whether a daemon is there at all.
 *
 * ## How the editor gets it
 *
 * `roswaal serve` prints the editor's address with the key after a `#`. The
 * part after a `#` is never sent to a server and never written to a log; the
 * page reads it, cleans it out of the address, keeps it in the tab's session
 * storage and sends it in a header with every call (`src/app/main.tsx`).
 *
 * Not a cookie: a browser sends a cookie for 127.0.0.1 to every port on
 * 127.0.0.1, so a server another account ran on another port would be handed
 * the key by the browser the moment you opened one of its pages. Session
 * storage belongs to one origin, and the port is part of the origin.
 *
 * ## A new key each start
 *
 * Every `roswaal serve` makes a new one. While the daemon is stopped another
 * account could start a server on its port, and a tab of yours reloaded then
 * would show that server's page, which can read what the tab kept. A new key
 * on every start means what it could read no longer opens anything. The cost
 * is that a tab open across a restart is asked to be opened again from the
 * new address.
 *
 * ## Where it is kept
 *
 * `~/.roswaal/daemon-<port>.token`, readable by your account only (0600 in a
 * 0700 folder on macOS and Linux; on Windows your profile folder is already
 * yours alone). One per port, so two daemons on two ports each keep their own.
 * The CLI reads it, which is how `roswaal stop` and `roswaal status` reach the
 * daemon they are pointed at.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import nodeFs from "node:fs";
import os from "node:os";
import nodePath from "node:path";

/** The header the key is sent in, by the editor and the CLI alike. */
export const TOKEN_HEADER = "x-roswaal-token";

/** Where the key for the daemon on `port` is kept. */
export function tokenFileFor(port: number, home = os.homedir()): string {
	return nodePath.join(home, ".roswaal", `daemon-${port}.token`);
}

/** A new key: 32 random bytes, as hex. */
export function newToken(): string {
	return randomBytes(32).toString("hex");
}

/**
 * Writes `token` to `file`, replacing the key a previous start left there.
 *
 * The old file is removed and the new one made with `wx`, so the 0600 mode is
 * the one it is made with rather than whatever the old file had; a file
 * another start made in between is a refusal, not something written over.
 */
export function keepToken(file: string, token: string): void {
	nodeFs.mkdirSync(nodePath.dirname(file), { recursive: true, mode: 0o700 });
	nodeFs.rmSync(file, { force: true });
	try {
		nodeFs.writeFileSync(file, `${token}\n`, { mode: 0o600, flag: "wx" });
	} catch {
		throw new Error(`Roswaal could not keep its key at ${file}.`);
	}
}

/** The key in `file`, or null when there is none to read. */
export function readToken(file: string): string | null {
	try {
		const text = nodeFs.readFileSync(file, "utf8").trim();
		return /^[0-9a-f]{64}$/.test(text) ? text : null;
	} catch {
		return null;
	}
}

/** Whether `given` is the key, compared in constant time. */
export function isToken(given: string | undefined, token: string): boolean {
	if (!given) return false;
	const a = Buffer.from(given);
	const b = Buffer.from(token);
	return a.length === b.length && timingSafeEqual(a, b);
}

/** The key a request carries in its header. */
export function tokenOf(
	headers: Record<string, string | string[] | undefined>,
): string | undefined {
	const header = headers[TOKEN_HEADER];
	return typeof header === "string" && header !== "" ? header : undefined;
}
