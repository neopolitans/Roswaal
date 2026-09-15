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

import { VERSION } from "../cli/version.js";

import { volume } from "./host.js";
import { opfsStore, persistence } from "./persist.js";
import type { FromWorker, ToWorker } from "./protocol.js";
import { PLAYGROUND_ROOT, playgroundFiles } from "./seed.js";

declare const self: DedicatedWorkerGlobalScope;

function post(message: FromWorker): void {
	self.postMessage(message);
}

const store = persistence(opfsStore(), VERSION);

const session = new ApiSession({
	capabilities: {
		/**
		 * The only thing this host can do that a machine cannot: throw the
		 * project away and start from the demo again.
		 *
		 * A capability rather than something the worker handles on its own,
		 * because the editor has to know whether to offer it — and the daemon
		 * must not, where "start again" would mean deleting somebody's
		 * repository. A host that does not pass it answers 501.
		 */
		reset: async () => {
			await store.forget();
		},
	},
	compileStep: (step) => post({ kind: "event", event: "compile", data: step }),
});

/**
 * Mounted and opened before the first request is answered, not before the first
 * one arrives — the editor starts asking as soon as it renders, and making it
 * wait for a handshake would be a second thing to get wrong.
 *
 * The stored project wins over the demo. Somebody returning to a tab they were
 * working in wants what they left; somebody arriving for the first time has
 * nothing stored and gets the demo. Neither needs to be asked.
 */
const ready = (async () => {
	const stored = await store.restore();
	volume.mount(stored ?? playgroundFiles());
	await session.openAt(PLAYGROUND_ROOT);
})();

/** The volume as it now stands, for the store to write when things settle. */
function snapshot() {
	return volume.snapshot(PLAYGROUND_ROOT);
}



/**
 * Dynamic compiling, without a file watcher.
 *
 * The daemon watches the directory, because a graph there can change without
 * Roswaal doing it — a branch switch, a pull, another editor. Here there is no
 * directory and nothing else that can touch the volume, so the *only* way a
 * graph changes is a write through this worker. That makes the watcher
 * unnecessary rather than impossible: every event it would have reported passes
 * through the line below.
 *
 * Without this the editor showed Dynamic as on and nothing recompiled, which is
 * worse than not offering it — the setting was there, it said it was working,
 * and the generated Luau silently stopped matching the graph.
 *
 * Compiled through the route table rather than by calling the compiler, so the
 * refusals a manual compile makes — a hand-edited file, a name collision — are
 * the same ones here.
 */
async function dynamicCompile(method: string, path: string, body: unknown): Promise<void> {
	if (method !== "PUT" || path !== "/script") return;
	if (session.current?.config.compileMode !== "hot") return;

	const relPath = (body as { path?: string })?.path;
	if (typeof relPath !== "string" || relPath === "") return;

	try {
		const { results } = await session.handle("POST", "/compile", {
			body: { path: relPath, write: true },
		}) as { results: unknown[] };
		post({
			kind: "event",
			event: "hot",
			data: { type: "compiled", path: relPath, outcome: results[0] },
		});
	} catch (err) {
		// Reported the way the watcher reports one, rather than failing the write
		// that triggered it: the graph is saved either way, and a compile that
		// will not run is news rather than a reason to lose the save.
		post({
			kind: "event",
			event: "hot",
			data: { type: "error", path: relPath, message: (err as Error).message },
		});
	}
}

self.onmessage = async (event: MessageEvent<ToWorker>) => {
	const message = event.data;

	/**
	 * The tab is going away, or has at least stopped being looked at.
	 *
	 * Writes settle rather than happening at once, so without this the change
	 * made in the last four hundred milliseconds is the one change that does not
	 * survive — which is precisely the one somebody is most likely to notice.
	 * The main thread sends it, because this side cannot see a page unload.
	 */
	if (message?.kind === "flush") {
		await store.flush();
		return;
	}

	if (message?.kind !== "request") return;

	try {
		await ready;
		const payload = await session.handle(message.method, message.path, {
			query: message.query,
			body: message.body,
		});
		post({ kind: "response", id: message.id, status: 200, payload });
		// After the reply, so the save is confirmed before the compile it causes
		// starts reporting on itself.
		await dynamicCompile(message.method, message.path, message.body);
		// Anything that is not a read may have changed the volume, and the
		// compile above writes too. Debounced, so a burst costs one write.
		if (message.method !== "GET") store.touch(snapshot);
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
