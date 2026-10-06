/**
 * The daemon's pure decisions — the ones it makes without touching a socket,
 * and can therefore be tested without binding a port.
 *
 * ## The guard that stops a graph being written into the wrong project
 *
 * The daemon serves one project at a time and can be pointed at another one
 * while an editor tab is still open on the old one. The tab went on autosaving
 * against whatever root the daemon had moved to, and two stray graphs turned up
 * in `examples/demo` that way — with nothing going wrong from either side's
 * point of view, which is what made it worth a guard rather than a note.
 *
 * The decision is a pure function so it can be tested without binding a port.
 * What matters is which requests it lets through: too strict and the editor
 * cannot switch projects at all, too loose and the bug comes back.
 */

import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";

import {
	createDaemon,
	refusesConnection,
	refusesRequest,
	SECURITY_HEADERS,
	trustedOrigins,
} from "../src/server/app.js";
import { streamCount, streamEvents } from "../src/server/events.js";
import { type CompileOutcome, describeOutcome } from "../src/server/project.js";
import type { DynamicCompiler } from "../src/server/watcher.js";

const HERE = "/projects/one";
const THERE = "/projects/two";

describe("the project guard", () => {
	it("refuses a write aimed at a project the daemon has left", () => {
		expect(refusesRequest("PUT", "/script", HERE, THERE)).toBe(true);
		expect(refusesRequest("POST", "/script/create", HERE, THERE)).toBe(true);
		expect(refusesRequest("PUT", "/map", HERE, THERE)).toBe(true);
	});

	it("allows a write to the project actually open", () => {
		expect(refusesRequest("PUT", "/script", HERE, HERE)).toBe(false);
	});

	it("lets reads through", () => {
		// Showing the new project's files is what the tab is about to be told to
		// do anyway, and refusing a read would leave it unable to recover.
		expect(refusesRequest("GET", "/tree", HERE, THERE)).toBe(false);
		expect(refusesRequest("HEAD", "/script", HERE, THERE)).toBe(false);
	});

	it("lets the editor change projects", () => {
		// These paths are relative to the /api mount, which is what `req.path`
		// is inside the middleware. Spelling them in full matches nothing, and
		// the guard would then refuse the very request meant to resolve it.
		expect(refusesRequest("POST", "/project/open", HERE, THERE)).toBe(false);
		expect(refusesRequest("POST", "/project/init", HERE, THERE)).toBe(false);
		expect(refusesRequest("POST", "/shutdown", HERE, THERE)).toBe(false);
	});

	it("does not lock out a client that sends no claim", () => {
		// An older editor, or a script using the API directly. This is a safety
		// net for a race, not an authentication scheme.
		expect(refusesRequest("PUT", "/script", undefined, THERE)).toBe(false);
	});

	it("has nothing to protect when no project is open", () => {
		expect(refusesRequest("PUT", "/script", HERE, null)).toBe(false);
	});
});

/**
 * ## What a compiled file is called in the progress view
 *
 * A project compile pushes one event per file so the status panel can show the
 * walk rather than only its result, and the word on each row comes from here
 * rather than from the editor — otherwise the two decide separately what
 * "written: false and no reason given" means, and drift the first time a case
 * is added.
 */
function outcome(over: Partial<CompileOutcome> = {}): CompileOutcome {
	return {
		scriptPath: "scripts/Main.nodescript",
		outputPath: "src/Main.server.luau",
		written: false,
		diagnostics: [],
		sourceMap: [],
		code: "",
		...over,
	};
}

describe("a compile step's verdict", () => {
	it("calls a written file wrote, with nothing to add", () => {
		expect(describeOutcome(outcome({ written: true }))).toEqual({ state: "wrote" });
	});

	/**
	 * The distinction the panel acts on. A skipped file has something the
	 * developer can do about it and the panel offers **overwrite**; a failed one
	 * has an error in the graph, and overwriting it would write nothing.
	 */
	it("separates a refused write from a broken graph", () => {
		const guard = "Main.server.luau has been edited by hand since it was generated.";
		expect(describeOutcome(outcome({ skipped: guard }))).toEqual({
			state: "skipped",
			note: guard,
		});

		expect(
			describeOutcome(
				outcome({
					skipped: "The graph has errors, so no file was written.",
					diagnostics: [{ severity: "error", message: "Print has no value" }],
				}),
			),
		).toEqual({
			state: "failed",
			note: "The graph has errors, so no file was written.",
		});
	});

	it("falls back to the error itself when nothing else says why", () => {
		expect(
			describeOutcome(
				outcome({
					diagnostics: [{ severity: "error", message: "Print has no value" }],
				}),
			),
		).toEqual({ state: "failed", note: "Print has no value" });
	});

	/**
	 * Check mode writes nothing and that is not a problem, so it must not read
	 * as one. Without this case a clean check reported every file as skipped.
	 */
	it("calls a clean check checked rather than skipped", () => {
		expect(describeOutcome(outcome())).toEqual({ state: "checked" });
	});

	it("does not let a warning fail a file", () => {
		expect(
			describeOutcome(
				outcome({
					written: true,
					diagnostics: [{ severity: "warning", message: "Unused variable" }],
				}),
			),
		).toEqual({ state: "wrote" });
	});
});

/**
 * ## The event stream's own subscriber list
 *
 * Two kinds of message go out over `/api/events`. Dynamic-compile events go through
 * the watcher's subscriber list; the daemon-wide ones — a project switch, and
 * now a compile's progress — go through a set of open responses in `events.ts`.
 *
 * That set was iterated by both broadcasters and added to by nobody, so every
 * daemon-wide message succeeded, to an empty room, for a whole release. Nothing
 * about the *content* of a message would have caught it, which is what this
 * counts instead.
 */
describe("the event stream", () => {
	/** Only the three members `streamEvents` touches. */
	function fakes() {
		const closers: (() => void)[] = [];
		const dynamic = { running: false, subscribe: () => () => {} } as unknown as DynamicCompiler;
		const req = {
			on: (name: string, fn: () => void) => {
				if (name === "close") closers.push(fn);
			},
		} as unknown as Request;
		const res = { writeHead: () => {}, write: () => true } as unknown as Response;
		return { dynamic, req, res, close: () => closers.forEach((fn) => fn()) };
	}

	it("registers an open stream, and forgets it when it closes", () => {
		const before = streamCount();
		const a = fakes();
		streamEvents(a.dynamic, a.req, a.res);
		expect(streamCount()).toBe(before + 1);

		const b = fakes();
		streamEvents(b.dynamic, b.req, b.res);
		expect(streamCount()).toBe(before + 2);

		// A tab closing must not take the other tab's stream with it, and must
		// not leave a dead response in the set for the next broadcast to write
		// into — which throws, inside a loop over every other listener.
		a.close();
		expect(streamCount()).toBe(before + 1);
		b.close();
		expect(streamCount()).toBe(before);
	});
});

/**
 * ## Who the daemon will answer at all
 *
 * It listens on 127.0.0.1, which keeps the network out but not the browser
 * already running on this machine: every page the developer has open can reach
 * a loopback port. It used to answer all of them with a permissive `cors()`,
 * which made this work from any website:
 *
 *     POST /api/project/init  { root: "C:/Users/someone" }
 *     GET  /api/source?path=...
 *
 * `safeJoin` keeps paths inside the project root, but the root is whatever the
 * caller asked for, so that pair reads any file the developer can.
 *
 * Two headers, stopping two different attacks, which is why both are checked.
 */
describe("who the daemon answers", () => {
	const DAEMON = "127.0.0.1:4471";
	const own = trustedOrigins(4471);
	// The development runner's: Vite's port as well.
	const dev = trustedOrigins(4471, ["http://localhost:4470", "http://127.0.0.1:4470"]);
	const ask = (host: string | undefined, origin?: string, fetchSite?: string, api = true) =>
		refusesConnection({ host, origin, fetchSite, api }, own);

	it("serves the editor, however it is addressed locally", () => {
		expect(ask(DAEMON)).toBeNull();
		expect(ask("localhost:4471", "http://localhost:4471", "same-origin")).toBeNull();
		expect(ask("[::1]:4471", "http://[::1]:4471")).toBeNull();
		expect(ask(DAEMON, "http://127.0.0.1:4471", "same-origin")).toBeNull();
	});

	it("answers Vite only when it is told to, as the development runner does", () => {
		expect(ask(DAEMON, "http://127.0.0.1:4470")).not.toBeNull();
		expect(refusesConnection({ host: DAEMON, origin: "http://127.0.0.1:4470" }, dev)).toBeNull();
		expect(refusesConnection({ host: DAEMON, origin: "http://localhost:4470" }, dev)).toBeNull();
	});

	/**
	 * Some other server on this machine -- a notebook, a dev server, a static
	 * server over a downloaded folder -- serves somebody else's pages, however
	 * local they are.
	 */
	it("refuses a page from another server on this machine", () => {
		expect(ask(DAEMON, "http://127.0.0.1:8000")).not.toBeNull();
		expect(ask(DAEMON, "http://localhost:8888")).not.toBeNull();
		expect(ask(DAEMON, "http://127.0.0.1")).not.toBeNull();
	});

	it("refuses a page on the open web", () => {
		expect(ask(DAEMON, "https://evil.example")).not.toBeNull();
		expect(ask(DAEMON, "http://evil.example:4471")).not.toBeNull();
	});

	/**
	 * The attack an origin check alone does not see. If `evil.example` resolves
	 * to 127.0.0.1, the browser considers the page same-origin with the daemon
	 * and sends no `Origin` header at all — but `Host` still says who was asked
	 * for, and it is not something a page can forge.
	 */
	it("refuses a host that is not loopback, even with no origin", () => {
		expect(ask("evil.example:4471")).not.toBeNull();
		expect(ask("192.168.1.20:4471")).not.toBeNull();
	});

	/**
	 * A sandboxed iframe and a `file://` page both send `Origin: null`, which is
	 * not loopback and must not be read as "no origin".
	 */
	it("refuses an opaque origin", () => {
		expect(ask(DAEMON, "null")).not.toBeNull();
	});

	/**
	 * An `<img>` or a `<script>` on another site sends no `Origin`, but the
	 * browser still says where the request came from -- and another port on
	 * this machine is `same-site`, not `same-origin`.
	 */
	it("refuses the API to a request from another site that sends no origin", () => {
		expect(ask(DAEMON, undefined, "cross-site")).not.toBeNull();
		expect(ask(DAEMON, undefined, "same-site")).not.toBeNull();
		expect(ask(DAEMON, undefined, "same-origin")).toBeNull();
		// Typed into the address bar.
		expect(ask(DAEMON, undefined, "none")).toBeNull();
	});

	/** A link to the editor from anywhere is how it is opened. */
	it("lets a page be opened from a link on another site", () => {
		expect(ask(DAEMON, undefined, "cross-site", false)).toBeNull();
	});

	/**
	 * curl, the CLI, and anything else that is not a browser. They send neither
	 * header, and a hostile page cannot suppress its own — so allowing this
	 * costs nothing and keeps `roswaal check` and scripting working.
	 */
	it("allows a client that is not a browser", () => {
		expect(ask(DAEMON)).toBeNull();
		expect(ask(DAEMON, "")).toBeNull();
	});

	/** Compared without case or a trailing slash, as browsers and proxies vary. */
	it("reads the host and the origin in whatever form they arrive", () => {
		expect(ask("LOCALHOST:4471", "HTTP://LOCALHOST:4471/")).toBeNull();
		expect(ask("127.0.0.1", undefined)).toBeNull();
		// Not loopback merely because it starts with it.
		expect(ask("127.0.0.1.evil.example:4471")).not.toBeNull();
	});
});

describe("what every answer says about itself", () => {
	it("keeps the daemon's pages out of anybody else's frames", () => {
		expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("SAMEORIGIN");
		expect(SECURITY_HEADERS["Content-Security-Policy"]).toContain("frame-ancestors 'self'");
	});

	it("runs scripts from the daemon only", () => {
		const csp = SECURITY_HEADERS["Content-Security-Policy"];
		expect(csp).toContain("script-src 'self';");
		expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
		expect(csp).toContain("object-src 'none'");
	});
});

/**
 * A request through the Express app itself, with no socket bound: the request
 * and response are Node's own, on a socket that never connects.
 */
async function through(
	app: (req: IncomingMessage, res: ServerResponse) => void,
	method: string,
	url: string,
	headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
	const req = new IncomingMessage(new Socket());
	req.method = method;
	req.url = url;
	req.headers = { host: "127.0.0.1:4471", ...headers };
	req.push(null);
	const res = new ServerResponse(req);
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		res.write = ((chunk: string | Uint8Array) => {
			chunks.push(Buffer.from(chunk));
			return true;
		}) as ServerResponse["write"];
		res.end = ((chunk?: string | Uint8Array) => {
			if (chunk) chunks.push(Buffer.from(chunk));
			resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
			return res;
		}) as ServerResponse["end"];
		app(req, res);
	});
}

describe("a daemon, before it listens", () => {
	it("answers the API with nothing bound", async () => {
		const { app } = createDaemon();
		const health = await through(app, "GET", "/api/health");
		expect(health.status).toBe(200);
		expect(health.body).toMatchObject({ ok: true, project: null });
	});

	it("answers a refusal in the one error shape", async () => {
		const { app } = createDaemon();
		const refused = await through(app, "GET", "/api/tree");
		expect(refused.status).toBe(409);
		expect(refused.body).toEqual({ error: "No project is open. Open one first." });
		expect((await through(app, "GET", "/api/health", { host: "evil.example" })).status).toBe(403);
	});
});
