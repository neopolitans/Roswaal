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

export type ToWorker = ApiRequestMessage;
export type FromWorker = ApiResponseMessage | ApiEventMessage;
