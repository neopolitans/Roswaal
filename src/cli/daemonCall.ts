/**
 * One request from the CLI to a daemon on this computer.
 *
 * `node:http` with no connection kept, rather than `fetch`. On Windows, Node 24
 * aborts with "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" and exit
 * code 127 when a process that has used `fetch` calls `process.exit` -- which
 * every CLI command does when it finishes -- so `roswaal status` reported a
 * running daemon and then failed. A plain request whose socket is closed with
 * the answer leaves nothing open for the exit to trip over.
 */

import http from "node:http";

export interface DaemonAnswer {
	status: number;
	body: string;
}

/**
 * Asks the daemon on `port`. Null when nothing answered in `timeoutMs`, or the
 * connection failed -- including a daemon that exits mid-answer, as one asked
 * to shut down does.
 */
export function askDaemon(
	port: number,
	method: "GET" | "POST",
	path: string,
	headers: Record<string, string>,
	timeoutMs: number,
): Promise<DaemonAnswer | null> {
	return new Promise((resolve) => {
		const req = http.request(
			{ host: "127.0.0.1", port, method, path, headers, agent: false, timeout: timeoutMs },
			(res) => {
				const chunks: Buffer[] = [];
				res.on("data", (chunk: Buffer) => chunks.push(chunk));
				res.on("end", () =>
					resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
				);
				res.on("error", () => resolve(null));
			},
		);
		req.on("timeout", () => req.destroy());
		req.on("error", () => resolve(null));
		req.end();
	});
}
