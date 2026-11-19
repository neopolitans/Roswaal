/**
 * Nodescripts as children of nodescripts, as Rojo allows scripts under
 * scripts: `Foo/init.nodescript` is the script Foo, compiled to
 * `Foo/init.<realm>.luau`, and the other graphs in `Foo/` are its children.
 */

import { readdir, readFile } from "node:fs/promises";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { Volume } from "../src/web/volume.js";

vi.mock("../src/server/host.js", async () => {
	const { posixPath: path } = await import("../src/web/posixPath.js");
	const { Volume: MemoryVolume } = await import("../src/web/volume.js");
	const volume = new MemoryVolume();
	return { volume, fs: volume, path, formatLuau: (_cwd: string, code: string) => ({ code }) };
});

const { volume } = (await import("../src/server/host.js")) as unknown as { volume: Volume };
const { ApiSession, errorResponse } = await import("../src/server/routes.js");
const { graphNameFor, isInitGraph } = await import("../src/server/documents.js");
const { outputFileName } = await import("../src/core/compiler/index.js");
const { emptyScript } = await import("../src/core/schema.js");

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
			if (entry.isDirectory()) await walk(abs);
			else
				out[`${mountAt}/${nodePath.relative(dir, abs).split(nodePath.sep).join("/")}`] =
					await readFile(abs, "utf8");
		}
	};
	await walk(dir);
	return out;
}

const session = new ApiSession({});
beforeAll(async () => {
	volume.mount(await snapshotOf(DEMO, "/nest"));
	await session.openAt("/nest");
});

const get = (path: string, query: Record<string, string> = {}) =>
	session.handle("GET", path, { query });
const post = (path: string, body: unknown = {}) => session.handle("POST", path, { body });
const read = (path: string) =>
	(volume.readFile(`/nest/${path}`, "utf8") as Promise<string>).catch(() => null);

async function refusal(call: Promise<unknown>): Promise<string | null> {
	try {
		await call;
		return null;
	} catch (err) {
		return errorResponse(err).body.error;
	}
}

const SHARED = ".roswaal/scripts/ReplicatedStorage/Shared";
const OUT = "src/ReplicatedStorage/Shared";

describe("a graph's name and file, as a script with children", () => {
	it("takes its folder's name and compiles to init", () => {
		expect(isInitGraph(`${SHARED}/Greeter/init.nodescript`)).toBe(true);
		expect(isInitGraph(`${SHARED}/Greeter.nodescript`)).toBe(false);
		expect(graphNameFor(`${SHARED}/Greeter/init.nodescript`)).toBe("Greeter");
		const script = { ...emptyScript("Greeter", "g1"), init: true };
		expect(outputFileName({ ...script, scriptClass: "Script" })).toBe("init.server.luau");
		expect(outputFileName({ ...script, scriptClass: "LocalScript" })).toBe("init.client.luau");
		expect(outputFileName({ ...script, scriptClass: "ModuleScript" })).toBe("init.luau");
	});
});

describe("New graph, inside a graph", () => {
	let parent = "";

	it("makes the graph its folder's init, moves its Luau and meta file, and adds the child", async () => {
		await post("/compile", { path: `${SHARED}/Greeter.nodescript`, write: true });
		expect(await read(`${OUT}/Greeter.luau`)).not.toBeNull();
		volume.mount({ [`/nest/${OUT}/Greeter.meta.json`]: '{ "properties": {} }' });

		const made = (await post("/script/child", {
			parent: `${SHARED}/Greeter.nodescript`,
			name: "Phrases",
			scriptClass: "ModuleScript",
		})) as { path: string; parent: string; moved: boolean; script: { name: string } };
		parent = made.parent;

		expect(made.moved).toBe(true);
		expect(made.parent).toBe(`${SHARED}/Greeter/init.nodescript`);
		expect(made.path).toBe(`${SHARED}/Greeter/Phrases.nodescript`);
		expect(made.script.name).toBe("Phrases");
		expect(await read(`${SHARED}/Greeter.nodescript`)).toBeNull();

		// Dynamic mode compiled it again where it is now, and took the old file away.
		const luau = await read(`${OUT}/Greeter/init.luau`);
		expect(luau).toContain("-- edit Greeter/init.nodescript");
		expect(await read(`${OUT}/Greeter.luau`)).toBeNull();
		expect(await read(`${OUT}/Greeter/init.meta.json`)).toBe('{ "properties": {} }');
		expect(await read(`${OUT}/Greeter.meta.json`)).toBeNull();
	});

	it("reads the parent by its folder's name", async () => {
		const { script } = (await get("/script", { path: parent })) as {
			script: { name: string; init?: boolean };
		};
		expect(script.name).toBe("Greeter");
		expect(script.init).toBe(true);
	});

	it("adds a second child without moving the parent again", async () => {
		const made = (await post("/script/child", { parent, name: "Moods" })) as {
			moved: boolean;
			path: string;
		};
		expect(made.moved).toBe(false);
		expect(made.path).toBe(`${SHARED}/Greeter/Moods.nodescript`);
	});

	it("shows the folder in the tree as the script, holding its graph", async () => {
		const { tree } = (await get("/tree")) as { tree: TreeNode[] };
		const folder = find(tree, `${SHARED}/Greeter`);
		expect(folder?.role).toBe("script");
		expect(folder?.script).toBe(parent);
		// Coloured as the script it is: Greeter is a ModuleScript, as is its child.
		expect(folder?.realm).toBe("module");
		expect(find(tree, `${SHARED}/Greeter/Phrases.nodescript`)?.realm).toBe("module");
	});
});

interface TreeNode {
	path: string;
	role?: string;
	script?: string;
	realm?: string;
	children?: TreeNode[];
}
function find(nodes: TreeNode[], path: string): TreeNode | undefined {
	for (const node of nodes) {
		if (node.path === path) return node;
		const inside = node.children && find(node.children, path);
		if (inside) return inside;
	}
	return undefined;
}

describe("names Studio could not tell apart", () => {
	it("refuses a graph called init", async () => {
		expect(await refusal(post("/script/create", { dir: SHARED, name: "init" }))).toMatch(
			/choose New graph/,
		);
	});

	it("refuses a graph beside a folder of its name, and a folder beside a graph of its", async () => {
		expect(await refusal(post("/script/create", { dir: SHARED, name: "Greeter" }))).toMatch(
			/two instances of that name/,
		);
		await post("/script/create", { dir: SHARED, name: "Lonely" });
		expect(await refusal(post("/folder/create", { path: `${SHARED}/Lonely` }))).toMatch(
			/two instances of that name/,
		);
	});
});

describe("the DataModel the lint sees", () => {
	it("knows a script with children is a script, whichever file is read first", async () => {
		volume.mount({
			"/nest/src/ReplicatedStorage/Shared/Box/Apple.luau": "return {}\n",
			"/nest/src/ReplicatedStorage/Shared/Box/init.server.luau": "print('box')\n",
		});
		const { outline } = (await get("/instances")) as {
			outline: { classes: string[]; nodes: [number, string, number, number][] };
		};
		const box = outline.nodes.find(([, name]) => name === "Box");
		expect(box && outline.classes[box[0]]).toBe("Script");
	});
});

describe("what the editor calls a script with children", () => {
	it("names it for its folder, as the graph is named", async () => {
		const { graphLabel } = await import("../src/app/analysis.js");
		expect(graphLabel(`${SHARED}/Greeter/init.nodescript`)).toBe("Greeter");
		expect(graphLabel(`${SHARED}/Greeter/Phrases.nodescript`)).toBe("Phrases");
	});
});

describe("moving, renaming and deleting scripts with children", () => {
	const put = (path: string, body: unknown) => session.handle("PUT", path, { body });
	const RS = ".roswaal/scripts/ReplicatedStorage";

	it("refuses to move or rename a script's own graph apart from its folder", async () => {
		expect(
			await refusal(
				post("/script/move", { from: `${SHARED}/Greeter/init.nodescript`, toDir: SHARED }),
			),
		).toMatch(/move its folder/);
		expect(
			await refusal(
				post("/entry/rename", { path: `${SHARED}/Greeter/init.nodescript`, name: "Other" }),
			),
		).toMatch(/rename its folder/);
	});

	it("moves a script with its children, its Luau and its meta file following", async () => {
		const moved = (await post("/script/move", { from: `${SHARED}/Greeter`, toDir: RS })) as {
			path: string;
		};
		expect(moved.path).toBe(`${RS}/Greeter`);
		expect(await read(`${RS}/Greeter/init.nodescript`)).not.toBeNull();
		expect(await read(`${RS}/Greeter/Phrases.nodescript`)).not.toBeNull();
		// Dynamic mode compiled each where it is now, and took the old Luau away.
		expect(await read("src/ReplicatedStorage/Greeter/init.luau")).toContain(
			"-- edit Greeter/init.nodescript",
		);
		expect(await read(`${OUT}/Greeter/init.luau`)).toBeNull();
		expect(await read("src/ReplicatedStorage/Greeter/init.meta.json")).toBe('{ "properties": {} }');
		expect(await read(`${OUT}/Greeter/init.meta.json`)).toBeNull();
	});

	it("refuses a move that would put a graph beside a folder of its name", async () => {
		await post("/script/create", { dir: SHARED, name: "Greeter" });
		expect(
			await refusal(post("/script/move", { from: `${SHARED}/Greeter.nodescript`, toDir: RS })),
		).toMatch(/two instances of that name/);
		await post("/script/delete", { path: `${SHARED}/Greeter.nodescript` });
	});

	it("deletes a graph's Luau with it, and leaves a script with no children as it is by default", async () => {
		// A Script compiles as it is made; an empty ModuleScript has nothing to export yet.
		await post("/script/create", { dir: `${RS}/Greeter`, name: "Ticker", scriptClass: "Script" });
		await post("/compile", { path: `${RS}/Greeter/Ticker.nodescript`, write: true });
		expect(await read("src/ReplicatedStorage/Greeter/Ticker.server.luau")).not.toBeNull();
		await post("/script/delete", { path: `${RS}/Greeter/Ticker.nodescript` });
		expect(await read(`${RS}/Greeter/Ticker.nodescript`)).toBeNull();
		expect(await read("src/ReplicatedStorage/Greeter/Ticker.server.luau")).toBeNull();

		await post("/script/delete", { path: `${RS}/Greeter/Moods.nodescript` });

		const gone = (await post("/script/delete", { path: `${RS}/Greeter/Phrases.nodescript` })) as {
			flattened?: unknown;
		};
		expect(gone.flattened).toBeUndefined();
		expect(await read(`${RS}/Greeter/init.nodescript`)).not.toBeNull();
	});

	it("flattens a script whose last child goes, when the project asks", async () => {
		const { config } = (await get("/project")) as { config: Record<string, unknown> };
		await put("/project/config", { ...config, flattenEmptyScripts: true });
		await post("/script/create", { dir: `${RS}/Greeter`, name: "Last" });

		const gone = (await post("/script/delete", { path: `${RS}/Greeter/Last.nodescript` })) as {
			flattened?: { from: string; to: string };
		};
		expect(gone.flattened).toEqual({
			from: `${RS}/Greeter/init.nodescript`,
			to: `${RS}/Greeter.nodescript`,
		});
		expect(await read(`${RS}/Greeter.nodescript`)).not.toBeNull();
		expect(await read(`${RS}/Greeter/init.nodescript`)).toBeNull();
		expect(await read("src/ReplicatedStorage/Greeter.luau")).toContain(
			"-- edit Greeter.nodescript",
		);
		expect(await read("src/ReplicatedStorage/Greeter/init.luau")).toBeNull();
		expect(await read("src/ReplicatedStorage/Greeter.meta.json")).toBe('{ "properties": {} }');
	});
});
