/**
 * What the editor and its worker say to each other.
 *
 * Deliberately shaped like HTTP, because on a developer's machine it *is* HTTP
 * and the editor above this line cannot tell which it got. A request carries a
 * method, a path and a query; a reply carries a status and a payload. The
 * translation lives in `transport.ts` and is about fifteen lines, which is the
 * whole cost of the hosted editor speaking to a worker instead of a daemon.
 */

export interface ApiRequestMessage {
	kind: "request";
	/** Matches a reply to its caller; the worker answers out of order freely. */
	id: number;
	method: string;
	/** Relative to `/api`, matching the keys of the route table. */
	path: string;
	query: Record<string, string>;
	body?: unknown;
}

export interface ApiResponseMessage {
	kind: "response";
	id: number;
	status: number;
	payload: unknown;
}

/**
 * Something the worker says without being asked.
 *
 * The daemon's server-sent events, by another road. Only `compile` ever arrives
 * in the playground — there is no file watcher, because there are no files for
 * anything but this tab to change — but the editor listens for the others
 * anyway, and hearing nothing is the correct answer rather than a gap.
 */
export interface ApiEventMessage {
	kind: "event";
	event: string;
	data: unknown;
}

/**
 * Finish anything still settling, because the tab may be about to go.
 *
 * Sent by the main thread, which is the only side that can see it coming: a
 * dedicated worker gets no `beforeunload` — that is a window event — and is
 * simply terminated when the page goes. `visibilitychange` is the signal that
 * actually arrives in time.
 */
export interface FlushMessage {
	kind: "flush";
}

/**
 * A folder on the developer's own disk, handed over.
 *
 * The picker is a window API and cannot be called from a worker, so the main
 * thread opens it and sends the handle here. Handles are structured-cloneable,
 * which is what makes this possible at all — permission travels with it, and
 * the worker can read and write through it directly.
 *
 * Answered like a request, because the editor has to know whether the folder
 * turned out to be a project before it shows one.
 */
export interface MountMessage {
	kind: "mount";
	id: number;
	handle: FileSystemDirectoryHandle;
	/**
	 * Make it a Roswaal project on the way in.
	 *
	 * Absent on the first attempt, which is how a folder that is not one gets
	 * reported rather than adopted. The editor asks, and asks again with this
	 * set — so writing into a folder somebody picked for another reason is
	 * always something they said yes to, never something that happened.
	 */
	initialise?: boolean;
}

export type ToWorker = ApiRequestMessage | FlushMessage | MountMessage;
export type FromWorker = ApiResponseMessage | ApiEventMessage;
