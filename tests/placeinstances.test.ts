/**
 * Adding, deleting, moving and duplicating instances in a place, binary and
 * XML, under the rules Studio keeps, in files Studio will open.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { blankPlaceBytes, blankPlaceXml } from "../src/core/rbx/blankPlace.js";
import { chunkData, readChunks, readReferents, u32 } from "../src/core/rbx/chunks.js";
import { pathOf } from "../src/core/rbx/dom.js";
import { writeProperty } from "../src/core/rbx/edit.js";
import { RbxError, readRbx } from "../src/core/rbx/index.js";
import {
	addableClasses,
	changeInstances,
	classProblem,
	type InstanceChange,
	parentProblem,
	targetProblem,
} from "../src/core/rbx/instances.js";
import { LINKS_FILE } from "../src/core/rbx/placeImport.js";
import { ApiSession } from "../src/server/routes.js";
import { buildPlace, service } from "./rbxfixture.js";

const utf8 = new TextEncoder();
const text = new TextDecoder();

/** A place and the changes made to it, finding instances by path. */
function place(start: Uint8Array) {
	let bytes = start;
	const doc = () => readRbx(bytes);
	const at = (path: string) => {
		const inst = doc().instances.find((i) => pathOf(i).join("/") === path);
		if (!inst) throw new Error(`no ${path}`);
		return inst;
	};
	return {
		get bytes() {
			return bytes;
		},
		doc,
		at,
		ref: (path: string) => at(path).ref!,
		change(change: InstanceChange) {
			const out = changeInstances(bytes, change);
			bytes = out.bytes;
			return out.ref;
		},
		point(from: string, prop: string, to: string) {
			const d = doc();
			const inst = d.instances.find((i) => pathOf(i).join("/") === from)!;
			const target = d.instances.find((i) => pathOf(i).join("/") === to)!;
			bytes = writeProperty(bytes, d, inst, prop, target);
		},
	};
}

const pathTo = (v: unknown) =>
	v && typeof v === "object" && "className" in v ? pathOf(v as never).join("/") : v;

/**
 * What Studio checks of a binary place before it opens it: referents from
 * nought to one short of the count, each once, and class numbers the same.
 */
function studioNumbering(bytes: Uint8Array): string[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset);
	const classes = view.getUint32(16, true);
	const count = view.getUint32(20, true);
	const problems: string[] = [];
	const refs = new Set<number>();
	const ids = new Set<number>();
	for (const chunk of readChunks(bytes)) {
		if (chunk.name !== "INST" && chunk.name !== "PROP" && chunk.name !== "PRNT") continue;
		const d = chunkData(chunk);
		if (chunk.name === "PRNT") {
			const n = u32(d, 1);
			for (const r of [...readReferents(d, 5, n), ...readReferents(d, 5 + 4 * n, n)])
				if (r >= count) problems.push(`PRNT names ${r} of ${count}`);
			continue;
		}
		const id = u32(d, 0);
		if (id >= classes) problems.push(`class ${id} of ${classes}`);
		if (chunk.name === "PROP") continue;
		ids.add(id);
		const n = u32(d, 4);
		for (const r of readReferents(d, 8 + n + 5, u32(d, 8 + n + 1))) {
			if (r < 0 || r >= count) problems.push(`referent ${r} of ${count}`);
			if (refs.has(r)) problems.push(`referent ${r} twice`);
			refs.add(r);
		}
	}
	if (refs.size !== count) problems.push(`${refs.size} referents for ${count} instances`);
	if (ids.size !== classes) problems.push(`${ids.size} classes for ${classes}`);
	return problems;
}

describe("Studio's rules", () => {
	it("makes what Studio makes, and nothing else", () => {
		expect(classProblem("Part")).toBeUndefined();
		expect(classProblem("Lighting")).toMatch(/service/);
		expect(classProblem("Player")).toMatch(/does not make/);
		expect(classProblem("Terrain")).toMatch(/does not make/);
		expect(classProblem("NoSuchClass")).toMatch(/does not know/);
		const addable = addableClasses();
		expect(addable).toEqual(
			expect.arrayContaining(["Folder", "Part", "Script", "ProximityPrompt"]),
		);
		expect(addable).not.toContain("Workspace");
		expect(addable).not.toContain("Player");
	});

	it("puts the classes that need a parent only in one", () => {
		expect(parentProblem("WrapLayer", "Folder")).toMatch(/MeshPart/);
		expect(parentProblem("WrapLayer", "MeshPart")).toBeUndefined();
		expect(parentProblem("Bone", "Part")).toBeUndefined();
		expect(parentProblem("Bone", "Model")).toMatch(/BasePart or Bone/);
		expect(parentProblem("Animator", "AnimationController")).toBeUndefined();
		expect(parentProblem("Part", "Folder")).toBeUndefined();
	});

	it("leaves services, and what Studio keeps, where they are", () => {
		expect(targetProblem("Workspace", true)).toMatch(/service/);
		expect(targetProblem("Terrain", false)).toMatch(/keeps/);
		expect(targetProblem("Part", false)).toBeUndefined();
	});
});

for (const format of ["binary", "xml"] as const) {
	const blank = () => (format === "binary" ? blankPlaceBytes() : utf8.encode(blankPlaceXml()));

	describe(`instances in a ${format} place`, () => {
		it("adds one with what a fresh one starts with, and its own ids", () => {
			const p = place(blank());
			p.change({ kind: "add", parent: p.ref("Workspace"), className: "Folder", name: "Kit" });
			p.change({ kind: "add", parent: p.ref("Workspace/Kit"), className: "Part", name: "Plate" });
			p.change({ kind: "add", parent: p.ref("Workspace/Kit"), className: "Part", name: "Plate2" });
			p.change({
				kind: "add",
				parent: p.ref("Workspace/Kit/Plate"),
				className: "Fire",
				name: "Flame",
			});
			const plate = p.at("Workspace/Kit/Plate");
			expect((plate.props.get("size")?.value as number[]).map(Math.fround)).toEqual([
				4,
				Math.fround(1.2),
				2,
			]);
			expect(plate.props.get("Anchored")?.value).toBe(false);
			const ids = ["Plate", "Plate2"].map(
				(n) => p.at(`Workspace/Kit/${n}`).props.get("UniqueId")?.value,
			);
			if (ids[0] !== undefined) expect(ids[0]).not.toBe(ids[1]);
			expect(p.at("Workspace/Kit/Plate/Flame").className).toBe("Fire");
			if (format === "binary") expect(studioNumbering(p.bytes)).toEqual([]);
		});

		it("gives each new script a ScriptGuid of its own", () => {
			const p = place(blank());
			p.change({
				kind: "add",
				parent: p.ref("ServerScriptService"),
				className: "Script",
				name: "A",
			});
			p.change({
				kind: "add",
				parent: p.ref("ServerScriptService"),
				className: "Script",
				name: "B",
			});
			const guid = (n: string) =>
				text.decode(p.at(`ServerScriptService/${n}`).props.get("ScriptGuid")!.value as Uint8Array);
			expect(guid("A")).toMatch(
				/^\{[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}\}$/,
			);
			expect(guid("A")).not.toBe(guid("B"));
		});

		it("deletes one with everything in it, and what pointed at it points at nothing", () => {
			const p = place(blank());
			p.change({ kind: "add", parent: p.ref("Workspace"), className: "Model", name: "Hull" });
			p.change({ kind: "add", parent: p.ref("Workspace/Hull"), className: "Part", name: "Plate" });
			p.change({
				kind: "add",
				parent: p.ref("Workspace"),
				className: "ObjectValue",
				name: "Target",
			});
			p.point("Workspace/Target", "Value", "Workspace/Hull/Plate");
			const count = p.doc().instances.length;
			p.change({ kind: "delete", target: p.ref("Workspace/Hull") });
			expect(p.doc().instances.length).toBe(count - 2);
			expect(p.at("Workspace/Target").props.get("Value")?.value).toBeNull();
			// The SpawnLocation is its class's only instance: the class goes too.
			p.change({ kind: "delete", target: p.ref("Workspace/SpawnLocation") });
			expect(p.doc().instances.some((i) => i.className === "SpawnLocation")).toBe(false);
			if (format === "binary") expect(studioNumbering(p.bytes)).toEqual([]);
		});

		it("numbers what it adds after a delete as Studio needs", () => {
			const p = place(blank());
			p.change({ kind: "delete", target: p.ref("Workspace/SpawnLocation") });
			p.change({ kind: "add", parent: p.ref("Workspace"), className: "Part", name: "After" });
			p.change({ kind: "add", parent: p.ref("Workspace"), className: "Folder", name: "Later" });
			if (format === "binary") expect(studioNumbering(p.bytes)).toEqual([]);
			expect(p.at("Workspace/After").className).toBe("Part");
		});

		it("duplicates one beside it, with references inside the copy pointing into it", () => {
			const p = place(blank());
			p.change({ kind: "add", parent: p.ref("Workspace"), className: "Folder", name: "Kit" });
			p.change({ kind: "add", parent: p.ref("Workspace/Kit"), className: "Part", name: "Plate" });
			p.change({
				kind: "add",
				parent: p.ref("Workspace/Kit"),
				className: "ObjectValue",
				name: "Inside",
			});
			p.change({
				kind: "add",
				parent: p.ref("Workspace/Kit"),
				className: "ObjectValue",
				name: "Outside",
			});
			p.point("Workspace/Kit/Inside", "Value", "Workspace/Kit/Plate");
			p.point("Workspace/Kit/Outside", "Value", "Workspace/Baseplate");
			const copy = p.change({ kind: "duplicate", target: p.ref("Workspace/Kit") });
			const copies = p.doc().instances.filter((i) => pathOf(i).join("/") === "Workspace/Kit");
			expect(copies).toHaveLength(2);
			const twin = copies.find((i) => i.ref === copy)!;
			const child = (name: string) => twin.children.find((c) => c.name === name)!;
			expect(child("Inside").props.get("Value")?.value).toBe(child("Plate"));
			expect(pathTo(child("Outside").props.get("Value")?.value)).toBe("Workspace/Baseplate");
			const original = copies.find((i) => i.ref !== copy)!;
			const plate = original.children.find((c) => c.name === "Plate")!;
			const id = plate.props.get("UniqueId")?.value;
			if (id !== undefined) expect(child("Plate").props.get("UniqueId")?.value).not.toBe(id);
			if (format === "binary") expect(studioNumbering(p.bytes)).toEqual([]);
		});

		it("moves one, and changes nothing else", () => {
			const p = place(blank());
			p.change({ kind: "add", parent: p.ref("Workspace"), className: "Folder", name: "Kit" });
			p.change({ kind: "add", parent: p.ref("Workspace/Kit"), className: "Part", name: "Plate" });
			const before = p.at("Workspace/Kit/Plate");
			const moved = p.change({
				kind: "move",
				target: p.ref("Workspace/Kit"),
				parent: p.ref("ReplicatedStorage"),
			});
			expect(moved).toBe(p.ref("ReplicatedStorage/Kit"));
			const after = p.at("ReplicatedStorage/Kit/Plate");
			expect([...after.props.keys()]).toEqual([...before.props.keys()]);
			for (const [name, prop] of before.props)
				expect(after.props.get(name)?.value).toEqual(prop.value);
		});

		it("refuses what Studio would not do, and leaves the place as it was", () => {
			const p = place(blank());
			p.change({ kind: "add", parent: p.ref("Workspace"), className: "Folder", name: "Kit" });
			const was = p.bytes;
			const refused = (change: InstanceChange) => expect(() => p.change(change)).toThrow(RbxError);
			refused({
				kind: "add",
				parent: p.ref("Workspace/Kit"),
				className: "WrapLayer",
				name: "Wrap",
			});
			refused({ kind: "add", parent: p.ref("Workspace"), className: "Lighting", name: "Lighting" });
			refused({ kind: "add", parent: p.ref("Workspace"), className: "Part", name: "" });
			refused({ kind: "delete", target: p.ref("Workspace") });
			refused({ kind: "move", target: p.ref("Workspace/Kit"), parent: p.ref("Workspace") });
			refused({ kind: "duplicate", target: p.ref("Lighting") });
			refused({ kind: "delete", target: format === "binary" ? 9999 : "RBXNOTHERE" });
			expect(p.bytes).toBe(was);
		});
	});
}

describe("a binary place with a property Roswaal does not read", () => {
	const unread = () =>
		buildPlace([
			service("Workspace", [
				{
					className: "Folder",
					name: "Odd",
					props: { Mystery: { type: 35, value: Uint8Array.of(1, 2, 3, 4) } },
				},
				{ className: "Part", name: "Plate" },
			]),
			service("ReplicatedStorage"),
		]);

	it("refuses to write that class again, and moves and adds around it", () => {
		const p = place(unread());
		expect(() =>
			p.change({ kind: "add", parent: p.ref("Workspace"), className: "Folder", name: "Another" }),
		).toThrow(/Folder.Mystery/);
		p.change({ kind: "move", target: p.ref("Workspace/Odd"), parent: p.ref("ReplicatedStorage") });
		p.change({ kind: "add", parent: p.ref("Workspace"), className: "Part", name: "Second" });
		p.change({ kind: "delete", target: p.ref("Workspace/Plate") });
		expect(studioNumbering(p.bytes)).toEqual([]);
		const odd = readChunks(p.bytes).filter(
			(c) => c.name === "PROP" && text.decode(chunkData(c)).includes("Mystery"),
		);
		expect(odd).toHaveLength(1);
	});
});

describe("an XML place's text", () => {
	it("is only changed where the change is", () => {
		const p = place(utf8.encode(blankPlaceXml()));
		const lighting = (src: string) => {
			const from = src.indexOf('<Item class="Lighting"');
			return src.slice(from, src.indexOf("</Item>", from));
		};
		const was = text.decode(p.bytes);
		p.change({ kind: "add", parent: p.ref("Workspace"), className: "Part", name: "Plate" });
		p.change({ kind: "duplicate", target: p.ref("Workspace/Plate") });
		p.change({ kind: "delete", target: p.ref("Workspace/SpawnLocation") });
		const now = text.decode(p.bytes);
		expect(lighting(now)).toBe(lighting(was));
		// Laid out as the rest of the file is.
		expect(now).toMatch(
			/\n\t\t<Item class="Part" referent="RBX[0-9A-F]{32}">\n\t\t\t<Properties>\n/,
		);
	});
});

describe("the instance route", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	type Outline = {
		stamp: string;
		outline: { nodes: [number, string, number, number][] };
		index?: number;
	};

	async function open() {
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-instances-"));
		await writeFile(path.join(root, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
		await writeFile(
			path.join(root, "place.rbxl"),
			buildPlace([
				service("Workspace", [
					{
						className: "Folder",
						name: "Gun",
						children: [
							{
								className: "Script",
								name: "Fire",
								props: { Source: { type: 1, value: "print(1)" } },
							},
						],
					},
				]),
				service("ReplicatedStorage"),
			]),
		);
		await mkdir(path.join(root, ".roswaal"), { recursive: true });
		await mkdir(path.join(root, "src"), { recursive: true });
		await writeFile(path.join(root, "src/Fire.server.luau"), "print(1)");
		await writeFile(
			path.join(root, LINKS_FILE),
			JSON.stringify({
				schemaVersion: 1,
				place: "place.rbxl",
				scripts: [
					{
						file: "src/Fire.server.luau",
						className: "Script",
						instances: [{ path: ["Workspace", "Gun", "Fire"] }],
					},
				],
			}),
		);
		const session = new ApiSession({});
		await session.openAt(root);
		const place = (await session.handle("GET", "/place")) as Outline;
		const at = (p: Outline, name: string) => p.outline.nodes.findIndex(([, n]) => n === name);
		const links = async () => JSON.parse(await readFile(path.join(root, LINKS_FILE), "utf8"));
		return { session, place, at, links };
	}

	it("adds one, and answers with the place and where the new one is", async () => {
		const { session, place, at } = await open();
		const answer = (await session.handle("POST", "/place/instance", {
			body: {
				stamp: place.stamp,
				kind: "add",
				index: at(place, "Gun"),
				className: "Part",
				name: "Barrel",
			},
		})) as Outline;
		expect(answer.stamp).not.toBe(place.stamp);
		expect(answer.index).toBe(at(answer, "Barrel"));
		expect(
			readRbx(await readFile(path.join(root, "place.rbxl"))).instances.some(
				(i) => i.name === "Barrel",
			),
		).toBe(true);
	});

	it("asks before a deletion unlinks a script, and keeps the file", async () => {
		const { session, place, at, links } = await open();
		const ask = { stamp: place.stamp, kind: "delete", index: at(place, "Gun") };
		await expect(session.handle("POST", "/place/instance", { body: ask })).rejects.toMatchObject({
			status: 409,
			details: { code: "linked-scripts", linked: ["src/Fire.server.luau"], placed: [] },
		});
		const answer = (await session.handle("POST", "/place/instance", {
			body: { ...ask, unlink: true },
		})) as Outline;
		expect(at(answer, "Gun")).toBe(-1);
		expect((await links()).scripts[0].instances).toEqual([]);
		expect(await readFile(path.join(root, "src/Fire.server.luau"), "utf8")).toBe("print(1)");
	});

	it("takes the links with a move", async () => {
		const { session, place, at, links } = await open();
		await session.handle("POST", "/place/instance", {
			body: {
				stamp: place.stamp,
				kind: "move",
				index: at(place, "Gun"),
				parent: at(place, "ReplicatedStorage"),
			},
		});
		expect((await links()).scripts[0].instances[0].path).toEqual([
			"ReplicatedStorage",
			"Gun",
			"Fire",
		]);
	});

	it("refuses what Studio would, and a place that changed", async () => {
		const { session, place, at } = await open();
		await expect(
			session.handle("POST", "/place/instance", {
				body: { stamp: place.stamp, kind: "delete", index: at(place, "Workspace") },
			}),
		).rejects.toMatchObject({ status: 422 });
		await expect(
			session.handle("POST", "/place/instance", {
				body: { stamp: "old", kind: "duplicate", index: at(place, "Gun") },
			}),
		).rejects.toMatchObject({ status: 409 });
	});
});
