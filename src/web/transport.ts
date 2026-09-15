/**
 * Turning the editor's HTTP calls into messages to the worker.
 *
 * The editor builds URLs and reads `Response` objects, and it goes on doing
 * exactly that here — this hands it a real `Response` built from the worker's
 * reply, so `response.ok`, `response.json()` and the project-changed guard in
 * `api.ts` are the same code on the web as on a developer's machine. The
 * alternative was a second client with its own error handling, which is the
 * kind of duplication that is invisible until the two disagree about what a
 * failure looks like.
 */

import type { EventStream, Transport } from "../app/api.js";

import type { ApiRequestMessage, FromWorker } from "./protocol.js";

export interface WorkerTransport {
	request: Transport;
	events: () => EventStream;
	/**
	 * Hands a folder the developer picked to the worker.
	 *
	 * Resolves with `notAProject` rather than rejecting when the folder has no
	 * `roswaal.json`: that is an answer the caller acts on by asking, not a
	 * failure. Calling again with `initialise` is what the yes turns into.
	 */
	mount: (handle: FileSystemDirectoryHandle, initialise?: boolean)
		=> Promise<{ root: string } | { notAProject: string }>;
}

export function workerTransport(worker: Worker): WorkerTransport {
	let nextId = 1;
	const pending = new Map<number, (message: Extract<FromWorker, { kind: "response" }>) => void>();
	/** Live listeners by event name, across every stream the editor has opened. */
	const listeners = new Map<string, Set<(event: MessageEvent) => void>>();

	worker.addEventListener("message", (event: MessageEvent<FromWorker>) => {
		const message = event.data;

		if (message.kind === "response") {
			pending.get(message.id)?.(message);
			pending.delete(message.id);
			return;
		}

		// Delivered as a `MessageEvent` carrying JSON text, because that is what
		// `EventSource` delivers and what the editor's handlers already parse.
		for (const handler of listeners.get(message.event) ?? []) {
			handler(new MessageEvent(message.event, { data: JSON.stringify(message.data) }));
		}
	});

	const request: Transport = (url, init) => {
		const parsed = new URL(url, self.location.origin);
		const query: Record<string, string> = {};
		parsed.searchParams.forEach((value, key) => {
			query[key] = value;
		});

		const message: ApiRequestMessage = {
			kind: "request",
			id: nextId++,
			method: init.method ?? "GET",
			// The route table is keyed on the path below `/api`, which is what the
			// daemon's own guard reads too.
			path: parsed.pathname.replace(/^\/api/, ""),
			query,
			body: typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
		};

		return new Promise<Response>((resolve) => {
			pending.set(message.id, (reply) => {
				resolve(new Response(JSON.stringify(reply.payload), {
					status: reply.status,
					headers: { "Content-Type": "application/json" },
				}));
			});
			worker.postMessage(message);
		});
	};

	const events = (): EventStream => {
		/** This stream's own handlers, so closing it takes out only its own. */
		const mine: [string, (event: MessageEvent) => void][] = [];

		return {
			addEventListener(type, handler) {
				let set = listeners.get(type);
				if (!set) {
					set = new Set();
					listeners.set(type, set);
				}
				set.add(handler);
				mine.push([type, handler]);
			},
			close() {
				for (const [type, handler] of mine) listeners.get(type)?.delete(handler);
				mine.length = 0;
			},
		};
	};

	/**
	 * Tell the worker to finish writing while there is still time.
	 *
	 * `visibilitychange` rather than `beforeunload`: a hidden tab may be
	 * discarded without any further warning, and every close is preceded by a
	 * hide. `pagehide` as well, for a navigation that never hides first.
	 */
	/**
	 * The folder itself, not its contents.
	 *
	 * A directory handle is structured-cloneable and carries its permission with
	 * it, so the worker gets the real thing rather than a copy of the files. The
	 * picker cannot be called from a worker — it needs a window and a gesture —
	 * which is the whole reason this crosses the boundary in this direction.
	 */
	const mount = (handle: FileSystemDirectoryHandle, initialise?: boolean) => {
		const id = nextId++;
		return new Promise<{ root: string } | { notAProject: string }>((resolve, reject) => {
			pending.set(id, (reply) => {
				const payload = reply.payload as
					{ root?: string; code?: string; name?: string; error?: string };
				if (reply.status === 200) resolve({ root: payload.root! });
				else if (payload.code === "not-a-project") resolve({ notAProject: payload.name! });
				else reject(new Error(payload.error ?? "It would not open."));
			});
			worker.postMessage({ kind: "mount", id, handle, initialise });
		});
	};

	const flush = () => worker.postMessage({ kind: "flush" });
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") flush();
	});
	window.addEventListener("pagehide", flush);

	return { request, events, mount };
}
