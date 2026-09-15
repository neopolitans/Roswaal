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

	return { request, events };
}
