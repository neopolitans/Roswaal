/**
 * The API, driven directly rather than over a socket.
 *
 * These handlers were Express routes, and while they were, the only way to test
 * one was to bind a port — so none of them was tested, and the forty-odd of
 * them were checked by opening the editor and clicking. Lifting them into a
 * table in `routes.ts` so the hosted editor could serve them too has the side
 * effect of making them callable, and this is that: the same table the daemon
 * mounts, run against a project held in memory.
 *
 * Two things are being pinned down. The ordinary ones — what a route answers
 * when it works — and the refusals, which matter more here than they usually
 * would: a browser tab cannot open a folder picker or reveal a file, and the
 * editor's behaviour when it cannot is to drop the button. That only works if
 * the route says 501 rather than failing some other way.
 */

import { readFile, readdir } from "node:fs/promises";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { Volume } from "../src/web/volume.js";

vi.mock("../src/server/host.js", async () => {
	const { posixPath: path } = await import("../src/web/posixPath.js");
	const { Volume: MemoryVolume } = await import("../src/web/volume.js");
	const volume = new MemoryVolume();
	return { volume, fs: volume, path, formatLuau: (_cwd: string, code: string) => code };
});

const { volume } = await import("../src/server/host.js") as unknown as { volume: Volume };
const { ApiSession, HttpError } = await import("../src/server/routes.js");

const DEMO = nodePath.resolve(
	nodePath.dirname(fileURLToPath(import.meta.url)), "..", "examples", "demo",
);

async function snapshotOf(dir: string, mountAt: string): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	const walk = async (at: string): Promise<void> => {
		for (const entry of await readdir(at, { withFileTypes: true })) {
			const abs = nodePath.join(at, entry.name);
			if (entry.isDirectory()) {
				await walk(abs);
				continue;
			}
			const rel = nodePath.relative(dir, abs).split(nodePath.sep).join("/");
			out[`${mountAt}/${rel}`] = await readFile(abs, "utf8");
		}
	};
	await walk(dir);
	return out;
}

/** The compile steps the session pushed, which the editor draws as a walk. */
const steps: { index: number; total: number; state: string }[] = [];

const session = new ApiSession({
	compileStep: (step) => void steps.push(step),
	// No capabilities, exactly as the worker constructs it.
});

beforeAll(async () => {
	volume.mount(await snapshotOf(DEMO, "/demo"));
	await session.openAt("/demo");
});

const get = (path: string, query: Record<string, string> = {}) =>
	session.handle("GET", path, { query });
const post = (path: string, body: unknown = {}) => session.handle("POST", path, { body });
const put = (path: string, body: unknown = {}) => session.handle("PUT", path, { body });

/** The status a refused call carried, or `null` if it was not refused at all. */
async function statusOf(call: Promise<unknown>): Promise<number | null> {
	try {
		await call;
		return null;
	} catch (err) {
		return err instanceof HttpError ? err.status : 400;
	}
}

// ---------------------------------------------------------------------------

describe("what the API says about the project it has open", () => {
	it("is healthy, and says which project and which version", async () => {
		const health = await get("/health") as { ok: boolean; project: string; version: string };
		expect(health.ok).toBe(true);
		expect(health.project).toBe("/demo");
		expect(health.version).toMatch(/^\d+\.\d+\.\d+/);
	});

	it("describes the open project, tree and all", async () => {
		const project = await get("/project") as {
			open: boolean; root: string; packErrors: string[]; tree: { path: string }[];
		};
		expect(project.open).toBe(true);
		expect(project.root).toBe("/demo");
		expect(project.packErrors).toEqual([]);
		expect(project.tree.length).toBeGreaterThan(0);
	});

	/**
	 * The route that sent 215 built-ins for months. The editor bundles those
	 * itself, and the copies shadowed the real ones — so what is worth asserting
	 * is not that packs arrive but that *only* packs do.
	 */
	it("hands over the project's own node definitions and no built-ins", async () => {
		const { BUILTIN_NODES } = await import("../src/core/nodes/index.js");
		const nodes = await get("/nodes") as { custom: { id: string }[]; errors: string[] };
		const builtin = new Set(BUILTIN_NODES.map((def) => def.id));

		expect(nodes.custom.length).toBeGreaterThan(0);
		expect(nodes.custom.filter((def) => builtin.has(def.id))).toEqual([]);
		expect(nodes.errors).toEqual([]);
	});

	it("lists the packs and where a new one would go", async () => {
		const packs = await get("/packs") as { packs: { path: string }[]; dir: string };
		expect(packs.packs.length).toBeGreaterThan(0);
		expect(packs.dir).toBe(".roswaal/nodes");
	});
});

describe("reading and writing through the API", () => {
	const GRAPH = ".roswaal/scripts/ReplicatedStorage/Shared/Greeter.nodescript";

	it("reads a graph", async () => {
		const { script } = await get("/script", { path: GRAPH }) as { script: { name: string } };
		expect(script.name).toBe("Greeter");
	});

	it("writes one back and reads the change", async () => {
		const { script } = await get("/script", { path: GRAPH }) as
			{ script: { nodes: unknown[]; name: string } };
		const before = script.nodes.length;
		script.nodes.push({ id: "routes-test", def: "script.begin", x: 0, y: 0 });

		expect(await put("/script", { path: GRAPH, script })).toEqual({ ok: true });

		const after = await get("/script", { path: GRAPH }) as { script: { nodes: { id: string }[] } };
		expect(after.script.nodes.length).toBe(before + 1);

		after.script.nodes = after.script.nodes.filter((node) => node.id !== "routes-test");
		await put("/script", { path: GRAPH, script: after.script });
	});

	it("creates a graph with somewhere for execution to start", async () => {
		const created = await post("/script/create", {
			dir: ".roswaal/scripts", name: "Made By Test",
		}) as { path: string; script: { nodes: { def: string }[] } };

		expect(created.path).toBe(".roswaal/scripts/Made By Test.nodescript");
		expect(created.script.nodes.map((node) => node.def)).toContain("script.begin");

		await post("/script/delete", { path: created.path });
	});

	it("reads generated Luau back as text", async () => {
		const source = await get("/source", {
			path: "src/ReplicatedStorage/Shared/Greeter.luau",
		}) as { text: string };
		expect(source.text).toContain("roswaal-graph:");
	});
});

describe("compiling through the API", () => {
	it("compiles the project and narrates the walk while it runs", async () => {
		steps.length = 0;
		const { results } = await post("/compile", { write: true }) as
			{ results: { written: boolean; scriptPath: string }[] };

		expect(results.length).toBeGreaterThan(0);
		expect(results.every((result) => result.written)).toBe(true);

		// The narration is the reason the route exists in this shape: a POST that
		// does not answer until the whole walk is done makes slow look like stuck.
		expect(steps.length).toBeGreaterThan(0);
		expect(steps[0]).toMatchObject({ index: 1, state: "working" });
		expect(steps[steps.length - 1].total).toBe(results.length);
	});

	it("compiles one graph without narrating anything", async () => {
		steps.length = 0;
		const { results } = await post("/compile", {
			path: ".roswaal/scripts/ReplicatedStorage/Shared/Greeter.nodescript",
		}) as { results: unknown[] };

		expect(results.length).toBe(1);
		expect(steps).toEqual([]);
	});

	it("reports no orphans in a project that has just been compiled", async () => {
		await post("/compile", { write: true });
		expect(await get("/orphans")).toEqual({ orphans: [] });
	});
});

// ---------------------------------------------------------------------------

describe("what the API refuses", () => {
	/**
	 * The four that need a machine. A browser tab passes no capabilities at all,
	 * and 501 is the answer the editor already knows how to read: it drops the
	 * button rather than offering something that cannot work twice.
	 */
	it("answers 501 for anything needing an operating system", async () => {
		expect(await statusOf(post("/project/browse", {}))).toBe(501);
		expect(await statusOf(post("/entry/reveal", { path: "src" }))).toBe(501);
		expect(await statusOf(post("/entry/edit", { path: "src/x.luau" }))).toBe(501);
		expect(await statusOf(get("/project/inspect", { root: "/demo" }))).toBe(501);
	});

	it("answers 400 when a required argument is missing", async () => {
		expect(await statusOf(get("/script", {}))).toBe(400);
		expect(await statusOf(post("/project/open", {}))).toBe(400);
		expect(await statusOf(put("/script", { path: "x.nodescript" }))).toBe(400);
		expect(await statusOf(post("/folder/create", {}))).toBe(400);
	});

	it("answers 404 for a route that is not there", async () => {
		expect(await statusOf(session.handle("GET", "/nope"))).toBe(404);
		expect(await statusOf(session.handle("DELETE", "/script"))).toBe(404);
	});

	/** `safeJoin` is what stands between a path and the rest of the volume. */
	it("refuses a path that climbs out of the project", async () => {
		expect(await statusOf(get("/source", { path: "../../etc/passwd" }))).toBe(400);
		expect(await statusOf(get("/script", { path: "../outside.nodescript" }))).toBe(400);
	});

	it("refuses a structural edit inside the output directory", async () => {
		expect(await statusOf(post("/folder/create", { path: "src/Invented" }))).toBe(400);
	});
});

describe("what the host tells the editor it can do", () => {
	/**
	 * The editor hides a control whose capability is missing rather than
	 * offering it and failing on the click, so this list is load-bearing: an
	 * empty one leaves a browser tab with no dead buttons, and a wrong one puts
	 * them back. Named capabilities rather than a boolean each, so a host
	 * gaining one does not change the shape.
	 */
	it("reports none for a host with no machine under it", async () => {
		const health = await get("/health") as { capabilities: string[] };
		expect(health.capabilities).toEqual([]);
	});

	it("reports exactly the ones it was given", async () => {
		const withMachine = new ApiSession({
			capabilities: {
				reveal: async () => {},
				edit: async () => "code",
			},
		});
		const health = await withMachine.handle("GET", "/health") as { capabilities: string[] };
		expect(health.capabilities).toEqual(["edit", "reveal"]);
	});

	/**
	 * The names have to be the ones the routes gate on, or a control is hidden
	 * while its route works, or shown while its route answers 501. Checked
	 * against the routes themselves rather than a list written twice.
	 */
	it("names them the way the routes refuse them", async () => {
		// The session with the demo open, so a route that needs a project gets
		// past that check and reaches the capability one -- which is the check
		// being read here.
		const refusals: Record<string, string> = {
			browse: "POST /project/browse",
			reveal: "POST /entry/reveal",
			edit: "POST /entry/edit",
			inspect: "GET /project/inspect",
		};

		for (const [capability, route] of Object.entries(refusals)) {
			const [method, path] = route.split(" ");
			const message = await session.handle(method, path, { body: { path: "x" }, query: { root: "/" } })
				.then(() => "", (err: Error) => err.message);
			expect([route, message.includes(capability)]).toEqual([route, true]);
		}
	});
});
