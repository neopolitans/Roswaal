/**
 * Where each graph's Luau stands, for the Project panel's dots: missing before
 * a compile, fresh after it, stale once the graph changes, failing when it
 * does not compile. Worked out in memory; nothing is written.
 */

import { readdir, readFile } from "node:fs/promises";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import type { Volume } from "../src/web/volume.js";

vi.mock("../src/server/host.js", async () => {
	const { posixPath: path } = await import("../src/web/posixPath.js");
	const { Volume: MemoryVolume } = await import("../src/web/volume.js");
	const volume = new MemoryVolume();
	return { volume, fs: volume, path, formatLuau: (_cwd: string, code: string) => ({ code }) };
});

const { volume } = (await import("../src/server/host.js")) as unknown as { volume: Volume };
const { compileAll, graphStates, openProject, readScript, writeScript } = await import(
	"../src/server/project.js"
);

const DEMO = nodePath.resolve(
	nodePath.dirname(fileURLToPath(import.meta.url)),
	"..",
	"examples",
	"demo",
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
			if (rel.startsWith("src/")) continue;
			out[`${mountAt}/${rel}`] = await readFile(abs, "utf8");
		}
	};
	await walk(dir);
	return out;
}

volume.mount(await snapshotOf(DEMO, "/states"));

const GREETER = ".roswaal/scripts/ReplicatedStorage/Shared/Greeter.nodescript";

describe("a graph's Luau", () => {
	it("is missing before the first compile, and fresh after it", async () => {
		const project = await openProject("/states");
		const before = await graphStates(project);
		expect(Object.keys(before).length).toBeGreaterThan(0);
		for (const one of Object.values(before)) expect(one.state).toBe("missing");

		await compileAll(project, { write: true });
		const after = await graphStates(project);
		for (const [graph, one] of Object.entries(after))
			expect([graph, one.state]).toEqual([graph, "fresh"]);
		expect(after[GREETER]?.luau).toMatch(/^src\/ReplicatedStorage\/Shared\/Greeter\.luau$/);
	});

	it("is stale once the graph changes, and nothing is written by asking", async () => {
		const project = await openProject("/states");
		const script = await readScript(project, GREETER);
		script.nodes.push({ id: "added-by-test", def: "script.begin", x: 40, y: 400 });
		await writeScript(project, GREETER, script);
		const luau = (await graphStates(project))[GREETER];
		expect(luau?.state).toBe("stale");
		const written = await volume.readFile(`/states/${luau?.luau}`, "utf8");
		const again = await graphStates(project);
		expect(await volume.readFile(`/states/${luau?.luau}`, "utf8")).toBe(written);
		expect(again[GREETER]?.state).toBe(luau?.state);
	});

	it("is failing when the graph does not compile", async () => {
		const project = await openProject("/states");
		const script = await readScript(project, GREETER);
		script.nodes.push({ id: "unknown-by-test", def: "no.such.node", x: 40, y: 600 });
		await writeScript(project, GREETER, script);
		expect((await graphStates(project))[GREETER]?.state).toBe("failing");
	});
});
