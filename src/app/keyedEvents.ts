/**
 * The daemon's event stream, read with `fetch` so the key goes in a header.
 *
 * `EventSource` cannot send headers, so the key used to ride in the stream's
 * address as `?key=`. An address is where a key should not be (CASA 2.1, from
 * OWASP ASVS): it shows in the browser's network panel and in anything that
 * logs addresses. This reads the same `text/event-stream` with the key in
 * `X-Roswaal-Token`, as every other call sends it, and reconnects after a
 * drop the way `EventSource` does.
 */

import type { EventStream } from "./api.js";

/** One event as the stream frames it: its name, and its data lines joined. */
export interface StreamEvent {
	type: string;
	data: string;
}

/**
 * A parser for `text/event-stream`, fed text as it arrives in pieces of any
 * size. `retry:` sets the wait before reconnecting; comments (`: ping`) and
 * `id:` are passed over, as nothing here resumes.
 */
export function eventStreamParser(
	onEvent: (event: StreamEvent) => void,
	onRetry?: (ms: number) => void,
) {
	let buffer = "";
	let type = "message";
	let data: string[] = [];
	const line = (text: string) => {
		if (text === "") {
			if (data.length > 0) onEvent({ type, data: data.join("\n") });
			type = "message";
			data = [];
			return;
		}
		if (text.startsWith(":")) return;
		const colon = text.indexOf(":");
		const field = colon < 0 ? text : text.slice(0, colon);
		let value = colon < 0 ? "" : text.slice(colon + 1);
		if (value.startsWith(" ")) value = value.slice(1);
		if (field === "event") type = value;
		else if (field === "data") data.push(value);
		else if (field === "retry" && /^\d+$/.test(value)) onRetry?.(Number(value));
	};
	return (chunk: string) => {
		buffer += chunk;
		for (let at = buffer.indexOf("\n"); at >= 0; at = buffer.indexOf("\n")) {
			line(buffer.slice(0, at).replace(/\r$/, ""));
			buffer = buffer.slice(at + 1);
		}
	};
}

/** The stream at `url`, with `headers` on each connection. */
export function keyedEventStream(url: string, headers: Record<string, string>): EventStream {
	const listeners = new Map<string, Set<(event: MessageEvent) => void>>();
	const emit = (type: string, data: string) => {
		for (const handler of listeners.get(type) ?? []) handler(new MessageEvent(type, { data }));
	};
	let closed = false;
	let connection: AbortController | null = null;

	async function run(): Promise<void> {
		let wait = 3000;
		while (!closed) {
			connection = new AbortController();
			try {
				const response = await fetch(url, {
					headers: { Accept: "text/event-stream", ...headers },
					cache: "no-store",
					signal: connection.signal,
				});
				if (!response.ok || !response.body)
					throw new Error(`The stream answered ${response.status}.`);
				emit("open", "");
				const feed = eventStreamParser(
					(event) => emit(event.type, event.data),
					(ms) => {
						wait = ms;
					},
				);
				const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
				for (;;) {
					const { value, done } = await reader.read();
					if (done) break;
					feed(value);
				}
			} catch {
				// Dropped, refused or closed: said below, then tried again.
			}
			if (closed) return;
			emit("error", "");
			await new Promise((resolve) => setTimeout(resolve, wait));
		}
	}
	void run();

	return {
		addEventListener(type, handler) {
			let set = listeners.get(type);
			if (!set) listeners.set(type, (set = new Set()));
			set.add(handler);
		},
		close() {
			closed = true;
			connection?.abort();
		},
	};
}
