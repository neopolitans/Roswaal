/**
 * The daemon, in a worker, with a volume in memory where the disk would be.
 *
 * This is the whole of the hosted editor's back end. It mounts the demo,
 * opens it through `ApiSession` exactly as `roswaal serve <dir>` does, and then
 * answers the same route table over `postMessage` instead of over a socket.
 * Nothing here knows anything about projects — `routes.ts` does that, and
 * `project.ts` under it, both running unmodified.
 *
 * In a worker rather than on the main thread because compiling is the one thing
 * here that can take a while. A whole-project compile walks every graph in the
 * project and the playground is deliberately small, so today it would not
 * matter; it will matter the moment the hosted editor is pointed at somebody's
 * real repository, and moving it afterwards would mean moving this boundary
 * afterwards too.
 */

/// <reference lib="webworker" />

import { ApiSession, HttpError } from "../server/routes.js";

import { volume } from "./host.js";
import type { FromWorker, ToWorker } from "./protocol.js";
import { PLAYGROUND_ROOT, playgroundFiles } from "./seed.js";

declare const self: DedicatedWorkerGlobalScope;

function post(message: FromWorker): void {
	self.postMessage(message);
}

const session = new ApiSession({
	// No capabilities at all: there is no file manager to reveal a file in, no
	// editor to hand one to, and no folder picker. Each of those routes answers
	// 501, and the editor drops the button rather than offering something that
	// cannot work.
	compileStep: (step) => post({ kind: "event", event: "compile", data: step }),
});

/**
 * Mounted and opened before the first request is answered, not before the first
 * one arrives — the editor starts asking as soon as it renders, and making it
 * wait for a handshake would be a second thing to get wrong.
 */
const ready = (async () => {
	volume.mount(playgroundFiles());
	await session.openAt(PLAYGROUND_ROOT);
})();

self.onmessage = async (event: MessageEvent<ToWorker>) => {
	const message = event.data;
	if (message?.kind !== "request") return;

	try {
		await ready;
		const payload = await session.handle(message.method, message.path, {
			query: message.query,
			body: message.body,
		});
		post({ kind: "response", id: message.id, status: 200, payload });
	} catch (err) {
		// The same mapping `app.ts` makes for Express: a thrown `HttpError` knows
		// its own status, and anything else is the caller's fault at 400.
		const status = err instanceof HttpError ? err.status : 400;
		post({
			kind: "response",
			id: message.id,
			status,
			payload: { error: (err as Error).message },
		});
	}
};
