/**
 * What the thing serving the API can actually do.
 *
 * The editor is a client, and it has two of them now: a daemon with a machine
 * under it, and a worker holding a project in a browser tab. Some of what the
 * editor offers needs the machine — showing a file in a file manager, handing
 * one to VS Code, opening the folder picker, opening a *different* project at
 * all. A tab has none of that.
 *
 * Asking the host and hiding what it cannot do, rather than offering everything
 * and failing on the click. The routes already answer 501 for a capability the
 * host did not pass, and 501 is the right answer to a request that should not
 * have been made; it is not a good thing for somebody to discover by pressing a
 * button and watching nothing happen.
 *
 * Held outside React state for the reason `projectTypes.ts` is: unrelated parts
 * of two different pages read it — the project tree, the source view, the
 * project menu, Node Design's pack cards — and threading it down from whichever
 * component happened to fetch it would be props for their own sake.
 */

import { useSyncExternalStore } from "react";

import { api } from "./api.js";

/**
 * The four the routes gate on, named as the routes name them.
 *
 * `inspect` is the interesting one: it stands for "there is a filesystem with
 * other projects on it". A daemon over SSH has no folder picker and can still
 * be pointed at another directory by typing the path, so `browse` gates the
 * button and `inspect` gates everything about a second project — switching to
 * one, the recent list, copying a node pack between two.
 */
/**
 * `reset` is the one a machine does *not* have: throwing the project away and
 * starting from the demo only means anything where the project is the host's
 * own copy. On the daemon it would mean deleting a repository.
 */
export type Capability = "inspect" | "browse" | "reveal" | "edit" | "reset";

/**
 * Nothing until the host has answered.
 *
 * Starting empty rather than assuming the daemon's four: a control that appears
 * and then vanishes is worse than one that appears a moment late, and the
 * answer arrives in the same breath as the project does.
 */
let capabilities: ReadonlySet<string> = new Set();
let asked = false;

/**
 * Why the host could not be reached, when it could not.
 *
 * A host that does not answer and a host with a project it has not opened yet
 * look identical from the editor: both leave it with nothing to show. It used
 * to treat them the same and fall through to the folder picker, which is right
 * for a daemon that has not been started and actively misleading in a browser
 * tab, where the picker cannot pick anything and the real problem is that the
 * worker threw on the way up.
 *
 * Both times the hosted build broke during its first week, this is what it
 * looked like: an editor asking for a project directory, with the actual error
 * sitting unread in a worker nobody thought to open.
 */
let failure: string | null = null;

const listeners = new Set<() => void>();

function announce(): void {
	for (const listener of listeners) listener();
}

/**
 * Asks the host what it can do. Once per page, and never throws — a host that
 * will not answer is a host that can do nothing, which is the safe reading and
 * also what a broken one deserves.
 */
export async function loadCapabilities(): Promise<void> {
	if (asked) return;
	asked = true;
	try {
		const health = await api.health();
		capabilities = new Set(health.capabilities ?? []);
		failure = null;
	} catch (err) {
		capabilities = new Set();
		failure = (err as Error).message || "It did not answer.";
	}
	announce();
}

export function hostCan(capability: Capability): boolean {
	return capabilities.has(capability);
}

/** Why the host is unreachable, or `null` while it is answering. */
export function useHostFailure(): string | null {
	return useSyncExternalStore(subscribe, () => failure, () => null);
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** `hostCan`, for a component that should redraw when the answer arrives. */
export function useHostCan(capability: Capability): boolean {
	return useSyncExternalStore(
		subscribe,
		() => capabilities.has(capability),
		() => false,
	);
}

/**
 * Why a control is there but cannot be used, for its tooltip.
 *
 * The file-manager and editor buttons are disabled rather than hidden, and the
 * difference is deliberate: they describe something the tool genuinely does,
 * just not here, and somebody trying Roswaal in a browser is exactly who should
 * find that out. The ones that need a *second project* are hidden instead —
 * there is nothing to say about them that would help, because there is no
 * action behind them to take.
 */
export const NOT_HERE = "Not in the browser version — this needs Roswaal running on your machine.";
