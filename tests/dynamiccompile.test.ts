/**
 * Dynamic mode compiles on every save, and moving a node is a save.
 *
 * A save that changes nothing the generated file says writes nothing: no
 * StyLua, no write for Rojo to sync into Studio. What decides it is the Luau
 * the compiler emits, not the graph, because some of a graph's layout does
 * reach the file: hoisted functions are written top to bottom as drawn.
 *
 * Driven through `POST /compile` with `skipUnchanged`, as the web worker
 * sends it, against a project on disk through the daemon's own host.
 */

import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { NodeScript } from "../src/core/schema.js";
import type { CompileOutcome } from "../src/server/compile.js";
import { ApiSession } from "../src/server/routes.js";

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "examples", "demo");
const GRAPH = ".roswaal/scripts/ReplicatedStorage/Shared/Greeter.nodescript";
const OUTPUT = "src/ReplicatedStorage/Shared/Greeter.luau";

let base: string;
let session: ApiSession;

beforeAll(async () => {
	base = await mkdtemp(path.join(tmpdir(), "roswaal-dynamic-"));
	await cp(DEMO, base, { recursive: true });
	session = new ApiSession();
	await session.openAt(base);
});

afterAll(async () => {
	await rm(base, { recursive: true, force: true });
});

async function graph(): Promise<NodeScript> {
	return (
		(await session.handle("GET", "/script", { query: { path: GRAPH } })) as { script: NodeScript }
	).script;
}

async function save(script: NodeScript): Promise<void> {
	await session.handle("PUT", "/script", { body: { path: GRAPH, script } });
}

async function compile(skipUnchanged: boolean): Promise<CompileOutcome> {
	const { results } = (await session.handle("POST", "/compile", {
		body: { path: GRAPH, write: true, skipUnchanged },
	})) as { results: CompileOutcome[] };
	return results[0];
}

/** The output's bytes and the time it was last written. */
async function output(): Promise<{ text: string; mtime: number }> {
	const abs = path.join(base, OUTPUT);
	return { text: await readFile(abs, "utf8"), mtime: (await stat(abs)).mtimeMs };
}

const moved = (script: NodeScript, id: string, dx: number, dy: number): NodeScript => ({
	...script,
	nodes: script.nodes.map((n) => (n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
});

describe("a Dynamic compile", () => {
	it("writes the first time, when the file is not what the graph writes", async () => {
		await writeFile(path.join(base, OUTPUT), "");
		await rm(path.join(base, OUTPUT));
		const first = await compile(true);
		expect(first.written).toBe(true);
		expect(first.unchanged).toBeUndefined();
	});

	it("writes nothing when a node is moved and the Luau would come out the same", async () => {
		const before = await output();
		await save(moved(await graph(), "concat", 40, 25));
		const outcome = await compile(true);
		expect(outcome.unchanged).toBe(true);
		expect(outcome.written).toBe(false);
		expect(outcome.code).toBe(before.text);
		expect(await output()).toEqual(before);
	});

	it("writes when a move changes the order the file is written in", async () => {
		const before = await output();
		// GreetPlayer's entry, lifted above AccumulateNum's: hoisted functions
		// are written top to bottom.
		const script = await graph();
		const top = Math.min(...script.nodes.map((n) => n.y));
		await save(
			moved(script, "fn", 0, top - 200 - (script.nodes.find((n) => n.id === "fn")?.y ?? 0)),
		);
		const outcome = await compile(true);
		expect(outcome.written).toBe(true);
		const after = await output();
		expect(after.text).not.toBe(before.text);
		expect(after.text.indexOf("GreetPlayer")).toBeLessThan(after.text.indexOf("AccumulateNum"));
	});

	it("writes when a wire changes", async () => {
		const script = await graph();
		await save({ ...script, links: script.links.filter((l) => l.id !== "g2") });
		const outcome = await compile(true);
		expect(outcome.written).toBe(true);
		expect(outcome.unchanged).toBeUndefined();
	});

	it("does not take a file edited since for unchanged", async () => {
		await save(moved(await graph(), "ret", 10, 0));
		await writeFile(path.join(base, OUTPUT), `${(await output()).text}\n-- edited by hand\n`);
		const outcome = await compile(true);
		expect(outcome.unchanged).toBeUndefined();
		// The hand-edit guard answers, as it always has.
		expect(outcome.skipped).toBeDefined();
		await compile(false).catch(() => undefined);
	});

	it("always writes when somebody asks", async () => {
		await session.handle("POST", "/compile", { body: { path: GRAPH, write: true, force: true } });
		const outcome = await compile(false);
		expect(outcome.written).toBe(true);
	});

	it("recognises the file it would write after the project is opened again", async () => {
		await compile(false);
		const before = await output();
		await session.openAt(base);
		await save(moved(await graph(), "concat", -5, 5));
		const outcome = await compile(true);
		expect(outcome.unchanged).toBe(true);
		expect(await output()).toEqual(before);
	});
});
