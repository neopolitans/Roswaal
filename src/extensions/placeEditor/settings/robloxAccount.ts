/**
 * Sign in with Roblox as the editor knows it: asked of the daemon once, and
 * kept current by its `roblox` event, which the Place Editor's manifest
 * passes on here. Never a
 * token: the daemon holds those and the editor never sees one.
 */

import { useSyncExternalStore } from "react";

import { type RobloxStatus, robloxApi } from "../app/robloxApi.js";

let status: RobloxStatus = { available: false };
let asked = false;
const listeners = new Set<() => void>();

function set(next: RobloxStatus): void {
	status = next;
	for (const listener of listeners) listener();
}

/** What the daemon's `roblox` event says, which is the same shape as its status. */
export function setRobloxStatus(next: Omit<RobloxStatus, "available">): void {
	set({ ...next, available: true });
}

/** Asks the daemon again. */
export async function refreshRobloxStatus(): Promise<void> {
	try {
		set(await robloxApi.status());
	} catch {
		set({ available: false });
	}
}

export function useRobloxStatus(): RobloxStatus {
	if (!asked) {
		asked = true;
		void refreshRobloxStatus();
	}
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => status,
	);
}

/**
 * Starts a sign-in and opens Roblox's page in a new tab.
 *
 * The tab is opened first, empty, while the click still counts as one -- a
 * browser blocks a window opened after waiting on the daemon -- and is sent to
 * Roblox once the daemon answers.
 */
export async function startRobloxSignIn(): Promise<void> {
	const tab = window.open("about:blank", "_blank");
	try {
		const { url } = await robloxApi.signIn();
		if (tab) {
			tab.opener = null;
			tab.location.href = url;
		} else {
			window.open(url, "_blank", "noopener");
		}
	} catch (err) {
		tab?.close();
		throw err;
	}
}

export async function signOutOfRoblox(): Promise<void> {
	await robloxApi.signOut();
	await refreshRobloxStatus();
}
