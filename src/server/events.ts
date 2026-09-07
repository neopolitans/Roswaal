/**
 * Server-sent events, so the editor learns about compiles it did not ask for.
 *
 * The watcher fires on any change to a graph, including ones Roswaal did not
 * make — a branch switch, a pull, another editor. Without a push channel the
 * editor would show stale output until the next manual refresh.
 */

import type { Request, Response } from "express";
import type { CompileStep } from "./project.js";
import type { HotEvent, HotReloader } from "./watcher.js";

/** Some proxies drop an idle stream; a periodic comment keeps it open. */
const PING_MS = 25_000;

function frame(event: string, data: unknown): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Every open stream, so a change to which project is open can be pushed to all
 * of them.
 *
 * A hot-reload event is about one file and comes from the watcher; this is
 * about the daemon as a whole, and every tab needs it at once. Pointing the
 * daemon at another project used to leave a tab quietly editing a document that
 * no longer belonged to it, and the tab had no way to find out.
 */
const streams = new Set<Response>();

/**
 * How many editors are listening.
 *
 * Exported for the test. The bug this guards against is a set that nothing ever
 * adds to, which no assertion about the *contents* of a message would catch —
 * every broadcast succeeds, to nobody.
 */
export function streamCount(): number {
	return streams.size;
}

/**
 * Sends one frame to every open editor.
 *
 * Each write is isolated, and a stream that fails is dropped rather than
 * retried. `close` normally takes a response out of the set, but a socket can
 * die between the last event and that firing — and this loop only started
 * carrying anything at all in 0.13.0, so an unguarded throw halfway through
 * would be a new way for one dead tab to silence every live one. A compile
 * pushes two of these per file, which is a great many chances to find out.
 */
function broadcast(event: string, data: unknown): void {
	for (const res of [...streams]) {
		try {
			if (res.writableEnded || res.destroyed) throw new Error("stream closed");
			res.write(frame(event, data));
		} catch {
			streams.delete(res);
		}
	}
}

/** Tells every open editor that the daemon now serves a different project. */
export function broadcastProject(root: string | null): void {
	broadcast("project", { root });
}

/**
 * One file's turn in a project compile, while the compile is still running.
 *
 * Broadcast rather than sent back down the request that asked for it, for the
 * same reason the project switch is: the POST does not answer until the whole
 * walk is finished, which is precisely the wait this exists to narrate. Every
 * open tab hears it, which is right — a compile started in one window is a
 * thing happening to the project, not to that window.
 */
export function broadcastCompile(step: CompileStep): void {
	broadcast("compile", step);
}

export function streamEvents(hot: HotReloader, req: Request, res: Response): void {
	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
		// Nginx and friends buffer by default, which defeats the point.
		"X-Accel-Buffering": "no",
	});
	res.write(frame("ready", { hot: hot.running }));

	// Registered here, and dropped on close, so the broadcasters above can find
	// it. This was missing, and its absence is invisible from the outside: the
	// stream still delivers hot-reload events, because those go through the
	// watcher's own subscriber list, so only the daemon-wide messages went
	// nowhere — a project switch told nobody, silently, for a whole release.
	streams.add(res);

	const send = (event: HotEvent) => res.write(frame("hot", event));
	const unsubscribe = hot.subscribe(send);
	const ping = setInterval(() => res.write(": ping\n\n"), PING_MS);

	req.on("close", () => {
		clearInterval(ping);
		unsubscribe();
		streams.delete(res);
	});
}
