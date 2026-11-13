/**
 * The daemon over a real socket: what a program on this machine, or a page in
 * a browser, actually reaches.
 *
 * `daemon.test.ts` decides each guard's question on its own, and drives the
 * Express app without a socket. This starts the daemon as `roswaal serve`
 * does, on loopback with the editor mounted, and asks it over HTTP: where it
 * can be reached, what every answer says about itself, and whether a path
 * spelled any way at all reaches a file outside the project.
 *
 * Requests go through `node:http` rather than `fetch`, because a test has to
 * send what a browser would never let a page set: the Host header, a forged
 * Origin, no Sec-Fetch-Site at all.
 */

import { cp, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDaemon, type Daemon, SECURITY_HEADERS } from "../src/server/app.js";
import { TOKEN_HEADER } from "../src/server/token.js";

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "examples", "demo");

/** Written beside the project, where no request should ever read it from. */
const SECRET = "SECRET-BESIDE-THE-PROJECT";
/** The daemon's key here. `ask` sends it, as the CLI does; an empty one is no key. */
const KEY = "0123456789abcdef".repeat(4);

let base: string;
let root: string;
let port: number;
let daemon: Daemon;

interface Answer {
	status: number;
	headers: http.IncomingHttpHeaders;
	body: string;
}

/** A port nothing is listening on, found by asking the system for one. */
function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = net.createServer().listen(0, "127.0.0.1", () => {
			const { port } = probe.address() as net.AddressInfo;
			probe.close(() => resolve(port));
		});
		probe.on("error", reject);
	});
}

/** One request, with exactly these headers: Host is the daemon's own unless given. */
function ask(
	method: string,
	url: string,
	headers: Record<string, string> = {},
	body?: string | Buffer,
): Promise<Answer> {
	return new Promise((resolve, reject) => {
		const req = http.request(
			{
				host: "127.0.0.1",
				port,
				method,
				path: url,
				headers: { host: `127.0.0.1:${port}`, [TOKEN_HEADER]: KEY, ...headers },
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on("data", (chunk: Buffer) => chunks.push(chunk));
				res.on("end", () =>
					resolve({
						status: res.statusCode ?? 0,
						headers: res.headers,
						body: Buffer.concat(chunks).toString("utf8"),
					}),
				);
			},
		);
		req.on("error", reject);
		if (body !== undefined) req.write(body);
		req.end();
	});
}

/** Whether a TCP connection to `host` on the daemon's port is accepted. */
function connects(host: string): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = net.connect({ host, port });
		const done = (ok: boolean) => {
			socket.destroy();
			resolve(ok);
		};
		socket.setTimeout(2000, () => done(false));
		socket.on("connect", () => done(true));
		socket.on("error", () => done(false));
	});
}

beforeAll(async () => {
	base = await mkdtemp(path.join(tmpdir(), "roswaal-socket-"));
	root = path.join(base, "project");
	await cp(DEMO, root, { recursive: true });
	await writeFile(path.join(base, "beside.txt"), SECRET);
	// A stand-in for the built editor, so pages are served as they are in use.
	const web = path.join(base, "web");
	await mkdir(web);
	await writeFile(path.join(web, "index.html"), "<!doctype html><title>Roswaal</title>");
	port = await freePort();
	daemon = createDaemon({ token: KEY });
	await daemon.start({ port, root, staticDir: web });
});

afterAll(async () => {
	await daemon?.stop();
	await rm(base, { recursive: true, force: true });
});

const JSON_BODY = { "content-type": "application/json" };

describe("where the daemon can be reached", () => {
	it("answers on loopback", async () => {
		expect(await connects("127.0.0.1")).toBe(true);
	});

	it("is not listening on any other address this machine has", async (ctx) => {
		const elsewhere = Object.values(networkInterfaces())
			.flat()
			.filter((a) => a !== undefined && !a.internal)
			.map((a) => a!.address)
			// Link-local IPv6 needs a zone to be dialled at all.
			.filter((address) => !address.toLowerCase().startsWith("fe80:"));
		if (elsewhere.length === 0) ctx.skip();
		for (const address of elsewhere) expect(await connects(address), address).toBe(false);
	});
});

describe("every answer", () => {
	/**
	 * One of each kind of answer the daemon gives: a route, each refusal, a
	 * page, and the errors that come from no route at all.
	 */
	const KINDS: [string, () => Promise<Answer>][] = [
		["a route's answer", () => ask("GET", "/api/health")],
		["a page", () => ask("GET", "/")],
		["a page the editor draws itself", () => ask("GET", "/docs/somewhere")],
		["a refused host", () => ask("GET", "/api/health", { host: `attacker.example:${port}` })],
		[
			"a refused origin",
			() =>
				ask(
					"POST",
					"/api/folder/create",
					{ ...JSON_BODY, origin: "https://attacker.example" },
					"{}",
				),
		],
		[
			"a refused cross-site request",
			() => ask("GET", "/api/health", { "sec-fetch-site": "cross-site" }),
		],
		[
			"a refused preflight",
			() =>
				ask("OPTIONS", "/api/folder/create", {
					origin: "https://attacker.example",
					"access-control-request-method": "POST",
				}),
		],
		[
			"the project guard",
			() =>
				ask(
					"POST",
					"/api/folder/create",
					{ ...JSON_BODY, "x-roswaal-project": "/somewhere/else" },
					"{}",
				),
		],
		["a refused path", () => ask("GET", "/api/source?path=..%2fbeside.txt")],
		["a route that is not there", () => ask("GET", "/api/nothing-here")],
		["a method that is not there", () => ask("TRACE", "/api/health")],
		["a body that is not JSON", () => ask("POST", "/api/folder/create", JSON_BODY, "{not json")],
		[
			"a body too large",
			() => ask("POST", "/api/folder/create", JSON_BODY, Buffer.alloc(33 * 1024 * 1024, 32)),
		],
	];

	for (const [kind, request] of KINDS) {
		it(`carries the security headers: ${kind}`, async () => {
			const answer = await request();
			for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
				expect(answer.headers[name.toLowerCase()], `${name} on ${kind}`).toBe(value);
			}
			// No answer ever invites another site to read it.
			expect(answer.headers["access-control-allow-origin"]).toBeUndefined();
			expect(answer.headers["access-control-allow-credentials"]).toBeUndefined();
		});
	}

	it("from the API is JSON, and never a stack", async () => {
		for (const [kind, request] of KINDS) {
			const answer = await request();
			const isPage = answer.headers["content-type"]?.startsWith("text/html");
			if (isPage) {
				// Only the editor's own page is HTML.
				expect(answer.body, kind).toContain("<title>Roswaal</title>");
				continue;
			}
			expect(answer.headers["content-type"], kind).toMatch(/^application\/json/);
			expect(answer.body, kind).not.toMatch(/\bat .*[\\/]node_modules[\\/]|\.(?:js|ts):\d+:\d+/);
		}
	});
});

describe("a path, however it is spelled", () => {
	const OUTSIDE = [
		"../beside.txt",
		"..%2fbeside.txt",
		"%2e%2e%2fbeside.txt",
		"%2e%2e/beside.txt",
		"..%5cbeside.txt",
		"%2e%2e%5cbeside.txt",
		"src%2f..%2f..%2fbeside.txt",
		"src/../../beside.txt",
		"....%2f%2fbeside.txt",
		"%252e%252e%252fbeside.txt",
		"..%c0%afbeside.txt",
		"..%00/beside.txt",
	];

	it("reads nothing outside the project through a route that takes one", async () => {
		const absolute = encodeURIComponent(path.join(base, "beside.txt"));
		for (const route of [
			"/api/source",
			"/api/script",
			"/api/map",
			"/api/packs/read",
			"/api/packs/usage",
			"/api/resolve",
		]) {
			for (const spelling of [...OUTSIDE, absolute]) {
				const answer = await ask("GET", `${route}?path=${spelling}`);
				expect(answer.body, `${route} ${spelling}`).not.toContain(SECRET);
				expect(answer.status, `${route} ${spelling}`).not.toBe(500);
			}
		}
	});

	it("is read as one value, not as a list or an object", async () => {
		for (const query of [
			"path=a&path=..%2fbeside.txt",
			"path[]=..%2fbeside.txt",
			"path[x]=..%2fbeside.txt",
		]) {
			const answer = await ask("GET", `/api/source?${query}`);
			expect(answer.status, query).toBe(400);
			expect(answer.body, query).not.toContain(SECRET);
		}
	});

	it("serves nothing outside the editor's folder as a page", async () => {
		for (const spelling of OUTSIDE) {
			for (const prefix of ["/", "/assets/", "/web/"]) {
				const url = `${prefix}${spelling}`;
				const answer = await ask("GET", url);
				expect(answer.body, url).not.toContain(SECRET);
			}
		}
	});
});

describe("a request a website could make", () => {
	/**
	 * What a page elsewhere can have a browser send without asking: a form's
	 * POST, a `fetch` with a simple content type, an image. None of them may
	 * change the project, whatever the server says back.
	 */
	it("changes nothing, however it is dressed", async () => {
		const planted = path.join(root, "src", "Planted");
		const attempts: [string, Record<string, string>, string][] = [
			[
				"a form, from another origin",
				{
					origin: "https://attacker.example",
					"content-type": "application/x-www-form-urlencoded",
					"sec-fetch-site": "cross-site",
				},
				"path=src/Planted",
			],
			[
				"a fetch with a simple type",
				{
					origin: "https://attacker.example",
					"content-type": "text/plain",
					"sec-fetch-site": "cross-site",
				},
				'{"path":"src/Planted"}',
			],
			[
				"a fetch claiming JSON",
				{ origin: "https://attacker.example", ...JSON_BODY, "sec-fetch-site": "cross-site" },
				'{"path":"src/Planted"}',
			],
			[
				"a browser that hides its origin",
				{ origin: "null", ...JSON_BODY },
				'{"path":"src/Planted"}',
			],
			[
				"an older browser that sends only its origin",
				{ origin: "https://attacker.example", ...JSON_BODY },
				'{"path":"src/Planted"}',
			],
			[
				"a newer one that sends only the site",
				{ "sec-fetch-site": "cross-site", ...JSON_BODY },
				'{"path":"src/Planted"}',
			],
			[
				"a site on this machine",
				{ origin: "http://127.0.0.1:1", ...JSON_BODY, "sec-fetch-site": "same-site" },
				'{"path":"src/Planted"}',
			],
			[
				"a rebound name",
				{ host: `attacker.example:${port}`, ...JSON_BODY },
				'{"path":"src/Planted"}',
			],
		];
		for (const [what, headers, body] of attempts) {
			const answer = await ask("POST", "/api/folder/create", headers, body);
			expect(answer.status, what).toBe(403);
			await expect(stat(planted), what).rejects.toThrow();
		}
	});

	it("cannot read the API from another site, even where it is only reading", async () => {
		const sites: Record<string, string>[] = [
			{ "sec-fetch-site": "cross-site" },
			{ "sec-fetch-site": "same-site" },
			{ origin: "https://attacker.example" },
			{ host: `127.0.0.1.attacker.example:${port}` },
		];
		for (const headers of sites) {
			const answer = await ask(
				"GET",
				"/api/source?path=src%2FReplicatedStorage%2FShared%2FGreeter.luau",
				headers,
			);
			expect(answer.status, JSON.stringify(headers)).toBe(403);
			expect(answer.body).not.toContain("roswaal-graph:");
		}
	});
});

/**
 * The key (F2): another account on this computer can reach 127.0.0.1 too, so
 * the API asks for the key only this account can read. See `server/token.ts`.
 */
describe("a request without the daemon's key", () => {
	const NONE = { [TOKEN_HEADER]: "" };

	it("is refused everything but whether a daemon is there", async () => {
		for (const [method, url] of [
			["GET", "/api/tree"],
			["GET", "/api/source?path=roswaal.json"],
			["POST", "/api/shutdown"],
			["POST", "/api/project/open"],
		] as const) {
			const answer = await ask(method, url, NONE);
			expect(answer.status, url).toBe(401);
			expect(JSON.parse(answer.body).code, url).toBe("token");
		}
		const health = await ask("GET", "/api/health", NONE);
		expect(health.status).toBe(200);
		// Not which project is open, nor which version.
		expect(JSON.parse(health.body)).toEqual({ ok: true, locked: true });
	});

	it("is refused with a wrong key, however close", async () => {
		const wrong = { [TOKEN_HEADER]: `${KEY.slice(0, -1)}0` };
		expect((await ask("GET", "/api/tree", wrong)).status).toBe(401);
	});

	// A cookie for 127.0.0.1 goes to every port on it, other accounts' servers too.
	it("is not let in by a cookie", async () => {
		expect(
			(await ask("GET", "/api/tree", { ...NONE, cookie: `roswaal_token=${KEY}` })).status,
		).toBe(401);
		expect(
			(await ask("POST", "/api/session", { ...NONE, ...JSON_BODY }, JSON.stringify({ token: KEY })))
				.status,
		).toBe(401);
	});

	// The editor reads the stream with fetch and sends the key in its header,
	// so no address ever carries it (CASA 2.1).
	it("takes the key on the event stream in its header, and never in its address", async () => {
		const streamStatus = (url: string, key?: string) =>
			new Promise<number>((resolve, reject) => {
				const req = http.get(
					{
						host: "127.0.0.1",
						port,
						path: url,
						headers: { host: `127.0.0.1:${port}`, ...(key ? { "x-roswaal-token": key } : {}) },
					},
					(res) => {
						resolve(res.statusCode ?? 0);
						res.destroy();
					},
				);
				req.on("error", reject);
			});
		expect(await streamStatus("/api/events", KEY)).toBe(200);
		expect(await streamStatus(`/api/events?key=${KEY}`)).toBe(401);
		expect(await streamStatus("/api/events", "nope")).toBe(401);
		expect(await streamStatus("/api/events")).toBe(401);
		expect((await ask("GET", `/api/tree?key=${KEY}`, NONE)).status).toBe(401);
	});

	it("is the editor's page as anybody's: the page itself is not the key", async () => {
		const page = await ask("GET", "/", NONE);
		expect(page.status).toBe(200);
		expect(page.body).not.toContain(KEY);
	});
});
