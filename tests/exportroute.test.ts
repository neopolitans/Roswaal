/**
 * The export as the menu asks for it: the place saved in either format, the
 * graphs whose Luau is older than the graph, the backups left behind, and the
 * menu's choices kept in roswaal.json.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { fromBase64 } from "../src/core/base64.js";
import { readRbx } from "../src/core/rbx/index.js";
import { parseConfig } from "../src/server/config.js";
import { createProject } from "../src/server/newProject.js";
import { ApiSession } from "../src/server/routes.js";

type Exported = {
	files: Record<string, string>;
	binaries: Record<string, string>;
	place?: {
		file: string;
		savedAs?: string;
		leftOut?: [string, number][];
		convertLoses?: [string, number][];
	};
	stale: string[];
};

const counter = () => {
	let n = 0;
	return () => `id-${++n}`;
};

const MAIN = ".roswaal/scripts/ServerScriptService/Server/Main.nodescript";

describe("the export route", () => {
	let base = "";
	afterEach(async () => {
		if (base) await fs.rm(base, { recursive: true, force: true });
	});

	async function open() {
		base = await fs.mkdtemp(path.join(os.tmpdir(), "roswaal-export-"));
		const root = path.join(base, "Obby");
		await createProject(root, { name: "Obby", target: "roblox", place: true }, counter());
		const session = new ApiSession({});
		await session.openAt(root);
		const get = (query: Record<string, string> = {}) =>
			session.handle("GET", "/export", { query }) as Promise<Exported>;
		return { root, get };
	}

	it("hands the place over as it is, and says what saving it as .rbxlx would leave out", async () => {
		const { get } = await open();
		const out = await get({ place: "modify" });
		expect(Object.keys(out.binaries)).toEqual(["place.rbxl"]);
		expect(out.place?.savedAs).toBeUndefined();
		expect(out.place?.convertLoses).toEqual([]);
		expect(out.stale).toEqual([]);
	});

	it("saves the place as .rbxlx under its new name, scripts and all", async () => {
		const { get } = await open();
		const out = await get({ place: "modify", format: "rbxlx" });
		expect(Object.keys(out.binaries)).toEqual(["place.rbxlx"]);
		expect(out.place).toMatchObject({ file: "place.rbxl", savedAs: "place.rbxlx", leftOut: [] });
		const doc = readRbx(fromBase64(out.binaries["place.rbxlx"]!));
		expect(doc.format).toBe("xml");
		expect(doc.instances.some((i) => i.className === "Script" && i.name === "Main")).toBe(true);
	});

	it("names a graph edited since it was compiled, and one never compiled", async () => {
		const { root, get } = await open();
		const graph = JSON.parse(await fs.readFile(path.join(root, MAIN), "utf8"));
		graph.nodes.find((n: { literals?: object }) => n.literals).literals.value.v = "Hello again";
		await fs.writeFile(path.join(root, MAIN), JSON.stringify(graph), "utf8");
		expect((await get()).stale).toEqual([MAIN]);
		await fs.rm(path.join(root, "src/ServerScriptService/Server/Main.server.luau"));
		expect((await get()).stale).toEqual([MAIN]);
	});

	it("leaves the property editor's backups out", async () => {
		const { root, get } = await open();
		await fs.mkdir(path.join(root, ".roswaal/backups"), { recursive: true });
		await fs.copyFile(
			path.join(root, "place.rbxl"),
			path.join(root, ".roswaal/backups/place.20261019-100000.rbxl"),
		);
		expect(Object.keys((await get()).binaries)).toEqual(["place.rbxl"]);
	});
});

describe("the Export menu's choices in roswaal.json", () => {
	const config = (extra: object) => ({ schemaVersion: 1, ...extra });

	it("are kept when they are ones the menu offers", () => {
		const parsed = parseConfig(
			config({ export: { shape: "place", modify: false, format: "rbxlx", compileFirst: false } }),
		);
		expect(parsed.export).toEqual({
			shape: "place",
			modify: false,
			format: "rbxlx",
			compileFirst: false,
		});
		expect(parseConfig(config({ export: null })).export).toBeUndefined();
	});

	it("are refused, naming the one that is wrong, when they are not", () => {
		expect(() => parseConfig(config({ export: { format: "zip" } }))).toThrow(/export\.format/);
		expect(() => parseConfig(config({ export: { compileFirst: "yes" } }))).toThrow(
			/export\.compileFirst/,
		);
		expect(() => parseConfig(config({ export: [] }))).toThrow(/"export"/);
	});
});
