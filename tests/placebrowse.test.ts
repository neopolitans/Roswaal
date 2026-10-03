/**
 * The DataModel browser's half on the host: the outline of a place, one
 * instance's properties as text, and the two routes both hosts answer.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { describeInstance, outlinePlace, readAttributes, TUCKED } from "../src/core/rbx/browse.js";
import { readRbx } from "../src/core/rbx/index.js";
import { planImport, surveyPlace } from "../src/core/rbx/placeImport.js";
import { writePlaceImport } from "../src/server/project.js";
import { ApiSession } from "../src/server/routes.js";
import { buildPlace, folder, script, service } from "./rbxfixture.js";

/** Attribute bytes as Studio writes them: a count, then name, type and value. */
function attributes(list: [string, number, (view: DataView, at: number) => number][]): Uint8Array {
	const buf = new ArrayBuffer(512);
	const view = new DataView(buf);
	const bytes = new Uint8Array(buf);
	let p = 0;
	view.setUint32(p, list.length, true);
	p += 4;
	for (const [name, type, write] of list) {
		const encoded = new TextEncoder().encode(name);
		view.setUint32(p, encoded.length, true);
		bytes.set(encoded, p + 4);
		p += 4 + encoded.length;
		view.setUint8(p++, type);
		p = write(view, p);
	}
	return bytes.slice(0, p);
}

const f32s =
	(...values: number[]) =>
	(view: DataView, at: number) => {
		values.forEach((v, i) => view.setFloat32(at + i * 4, v, true));
		return at + values.length * 4;
	};

const place = () =>
	buildPlace([
		service("TestService"),
		service("ReplicatedStorage", [
			folder("item10"),
			folder("Item2"),
			script("ModuleScript", "Util", "return {}"),
		]),
		service("Workspace", [
			{
				className: "Part",
				name: "Signpost",
				props: {
					Material: { type: 18, value: 256 },
					Color3uint8: { type: 12, value: [1, 0.5, 0] },
					Tags: { type: 1, value: new TextEncoder().encode("Night\0Road") },
					AttributesSerialize: {
						type: 1,
						value: attributes([
							["Height", 0x06, (v, at) => (v.setFloat64(at, 12.5, true), at + 8)],
							["Lit", 0x03, (v, at) => (v.setUint8(at, 1), at + 1)],
						]),
					},
				},
			},
		]),
	]);

describe("the outline of a place", () => {
	it("lists services in the Explorer's order, then children by name", () => {
		const { outline, order } = outlinePlace(readRbx(place()));
		const names = outline.nodes.map(([, name]) => name);
		expect(names).toEqual([
			"Workspace",
			"Signpost",
			"ReplicatedStorage",
			"Item2",
			"item10",
			"Util",
			"TestService",
		]);
		// Parents are indices into the same list, and the order matches it.
		const util = names.indexOf("Util");
		expect(names[outline.nodes[util][2]]).toBe("ReplicatedStorage");
		expect(order[util].name).toBe("Util");
		expect(outline.classes[outline.nodes[util][0]]).toBe("ModuleScript");
	});

	it("tucks away empty services the Explorer does not list", () => {
		const { outline } = outlinePlace(readRbx(place()));
		const flags = Object.fromEntries(
			outline.nodes.filter(([, , parent]) => parent === -1).map(([, name, , f]) => [name, f]),
		);
		expect(flags).toEqual({ Workspace: 0, ReplicatedStorage: 0, TestService: TUCKED });
	});
});

describe("an instance's properties", () => {
	const signpost = () => {
		const doc = readRbx(place());
		return describeInstance(doc.instances.find((i) => i.name === "Signpost")!, 1, () => undefined);
	};

	it("names enums, shows colours and uses Studio's names", () => {
		const props = Object.fromEntries(signpost().properties.map((p) => [p.name, p]));
		expect(props.Material.value).toBe("Plastic (256)");
		expect(props.Material.category).toBe("Appearance");
		expect(props.Color).toMatchObject({ value: "255, 128, 0", color: "#ff8000" });
		expect(props.Color3uint8).toBeUndefined();
	});

	it("reads tags and attributes, not the bytes that hold them", () => {
		const props = signpost().properties;
		expect(props.filter((p) => p.category === "Tags").map((p) => p.name)).toEqual([
			"Night",
			"Road",
		]);
		expect(
			props.filter((p) => p.category === "Attributes").map((p) => `${p.name}=${p.value}`),
		).toEqual(["Height=12.5", "Lit=true"]);
		expect(props.some((p) => p.name === "AttributesSerialize" || p.name === "Tags")).toBe(false);
	});

	it("gives the class's summary and the path from the service", () => {
		const info = signpost();
		expect(info.path).toEqual(["Workspace", "Signpost"]);
		expect(info.summary).toBeTruthy();
	});
});

describe("attributes", () => {
	it("reads the common types", () => {
		const read = readAttributes(
			attributes([
				[
					"Name",
					0x02,
					(v, at) => {
						v.setUint32(at, 2, true);
						v.setUint8(at + 4, 104);
						v.setUint8(at + 5, 105);
						return at + 6;
					},
				],
				["Count", 0x04, (v, at) => (v.setInt32(at, -3, true), at + 4)],
				["Tint", 0x0f, f32s(0, 1, 0)],
				["Offset", 0x11, f32s(1, 2.5, -3)],
			]),
		);
		expect(read.map((p) => `${p.name}:${p.type}=${p.value}`)).toEqual([
			"Name:string=hi",
			"Count:number=-3",
			"Tint:Color3=0, 255, 0",
			"Offset:Vector3=1, 2.5, -3",
		]);
		expect(read[2].color).toBe("#00ff00");
	});

	it("stops at a type it does not know rather than misreading the rest", () => {
		const read = readAttributes(
			attributes([
				["Known", 0x03, (v, at) => (v.setUint8(at, 0), at + 1)],
				["Odd", 0x7f, (_v, at) => at + 3],
				["After", 0x03, (v, at) => (v.setUint8(at, 1), at + 1)],
			]),
		);
		expect(read.map((p) => `${p.name}=${p.value}`)).toEqual([
			"Known=false",
			"Odd=not read",
			"…=1 more not read",
		]);
	});
});

describe("the place routes", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	async function openImported() {
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-browse-"));
		const bytes = buildPlace(
			[
				service("ServerScriptService", [script("Script", "Main", "print('main')")]),
				service("Workspace", [folder("Door", [script("Script", "Open", "open()")], "Model")]),
			],
			"lz4",
		);
		await writeFile(path.join(root, "Game.rbxl"), bytes);
		const plan = planImport(surveyPlace(readRbx(bytes)), {
			scope: "all",
			dedupe: true,
			outDir: "src",
			placeFile: "Game.rbxl",
			name: "Game",
		});
		await writePlaceImport(root, plan.files, "Game.rbxl");
		const session = new ApiSession({});
		await session.openAt(root);
		return session;
	}

	type Tree = {
		file: string;
		stamp: string;
		outline: { nodes: [number, string, number, number][] };
		scripts: Record<number, string>;
	};

	it("answer with the outline and which file writes each script", async () => {
		const session = await openImported();
		expect(((await session.handle("GET", "/tree")) as { place: string }).place).toBe("Game.rbxl");
		const tree = (await session.handle("GET", "/place")) as Tree;
		expect(tree.file).toBe("Game.rbxl");
		const at = (name: string) => tree.outline.nodes.findIndex(([, n]) => n === name);
		expect(tree.scripts[at("Main")]).toBe("src/ServerScriptService/Main.server.luau");
		expect(tree.scripts[at("Open")]).toMatch(/^place\/.*Open\.server\.luau$/);

		const info = (await session.handle("GET", "/place/instance", {
			query: { stamp: tree.stamp, index: String(at("Door")) },
		})) as { className: string; path: string[] };
		expect(info).toMatchObject({ className: "Model", path: ["Workspace", "Door"] });
	});

	it("refuse an instance by the stamp of a place that has since changed", async () => {
		const session = await openImported();
		const tree = (await session.handle("GET", "/place")) as Tree;
		await writeFile(path.join(root, "Game.rbxl"), buildPlace([service("Workspace")], "none"));
		await expect(
			session.handle("GET", "/place/instance", { query: { stamp: tree.stamp, index: "0" } }),
		).rejects.toMatchObject({ status: 409 });
		const again = (await session.handle("GET", "/place")) as Tree;
		expect(again.stamp).not.toBe(tree.stamp);
		expect(again.outline.nodes.map(([, n]) => n)).toEqual(["Workspace"]);
	});

	it("say when there is no place", async () => {
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-browse-"));
		await writeFile(path.join(root, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
		const session = new ApiSession({});
		await session.openAt(root);
		expect(await session.handle("GET", "/place")).toEqual({ file: null });
	});
});
