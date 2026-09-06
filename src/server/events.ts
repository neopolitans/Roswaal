/**
 * Server-sent events, so the editor learns about compiles it did not ask for.
 *
 * The watcher fires on any change to a graph, including ones Roswaal did not
 * make — a branch switch, a pull, another editor. Without a push channel the
 * editor would show stale output until the next manual refresh.
 */

import type { Request, Response } from "express";
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

/** Tells every open editor that the daemon now serves a different project. */
export function broadcastProject(root: string | null): void {
	for (const res of streams) res.write(frame("project", { root }));
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

	const send = (event: HotEvent) => res.write(frame("hot", event));
	const unsubscribe = hot.subscribe(send);
	const ping = setInterval(() => res.write(": ping\n\n"), PING_MS);

	req.on("close", () => {
		clearInterval(ping);
		unsubscribe();
	});
}
