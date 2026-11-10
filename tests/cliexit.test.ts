/**
 * The CLI asking a daemon something and then exiting (0.228.2).
 *
 * On Windows, Node 24 aborted with exit code 127 when a process that had used
 * `fetch` called `process.exit`, so `roswaal status` and `roswaal stop` failed
 * after doing their work. They ask through `src/cli/daemonCall.ts` now; this
 * runs that in a process of its own and holds it to a clean exit.
 */

import { execFile } from "node:child_process";
import http from "node:http";
import type net from "node:net";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { askDaemon } from "../src/cli/daemonCall.js";

let server: http.Server;
let port = 0;

beforeAll(async () => {
	server = http.createServer((req, res) => {
		if (req.url === "/api/health") {
			res.setHeader("content-type", "application/json");
			res.end(JSON.stringify({ ok: true }));
		} else if (req.url === "/api/shutdown") {
			// A daemon told to stop goes before it has finished answering.
			req.socket.destroy();
		} else {
			res.statusCode = 404;
			res.end();
		}
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	port = (server.address() as net.AddressInfo).port;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("the CLI asking a daemon", () => {
	it("exits cleanly after the answer", async () => {
		const code = await new Promise<number | null>((resolve) => {
			execFile(
				process.execPath,
				["--import", "tsx", path.resolve("tests/cliexit.fixture.mts"), String(port)],
				{ timeout: 30_000 },
				(err) => resolve(err ? ((err as { code?: number }).code ?? -1) : 0),
			);
		});
		expect(code).toBe(0);
	}, 40_000);

	it("answers null for nothing listening, and for a daemon that hangs up", async () => {
		const nothing = await new Promise<number>((resolve) => {
			const spare = http.createServer().listen(0, "127.0.0.1", () => {
				const free = (spare.address() as net.AddressInfo).port;
				spare.close(() => resolve(free));
			});
		});
		expect(await askDaemon(nothing, "GET", "/api/health", {}, 1500)).toBeNull();
		expect(await askDaemon(port, "POST", "/api/shutdown", {}, 1500)).toBeNull();
		expect(await askDaemon(port, "GET", "/api/health", {}, 1500)).toEqual({
			status: 200,
			body: '{"ok":true}',
		});
	});
});
