/**
 * Changing attributes and tags in a place: a value changed, an attribute added
 * and removed, a tag added and removed, in a binary and an XML place, with every
 * attribute not touched kept as its bytes were.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	type AttributeEntry,
	attributeEdit,
	attributeEntries,
	attributeNameProblem,
	encodeAttributes,
	tagsOf,
} from "../src/core/rbx/attributes.js";
import { readRbx } from "../src/core/rbx/index.js";
import { convertPlace } from "../src/core/rbx/serialize.js";
import { ApiSession } from "../src/server/routes.js";
import { buildPlace, type FixtureInstance, service } from "./rbxfixture.js";

const utf8 = new TextEncoder();
const f32s = (...n: number[]) => {
	const out = new Uint8Array(n.length * 4);
	n.forEach((v, i) => new DataView(out.buffer).setFloat32(i * 4, v, true));
	return out;
};
const text = (s: string) => {
	const bytes = utf8.encode(s);
	const out = new Uint8Array(4 + bytes.length);
	new DataView(out.buffer).setUint32(0, bytes.length, true);
	out.set(bytes, 4);
	return out;
};

// A CFrame with an axis-aligned rotation (id 2): read past, never changed here.
const turned = Uint8Array.of(...f32s(1, 2, 3), 2);
const entries = (): AttributeEntry[] => [
	{ name: "Team", type: 0x02, value: text("Red") },
	{ name: "Speed", type: 0x06, value: new Uint8Array(new Float64Array([16]).buffer) },
	{ name: "Spawn", type: 0x14, value: turned },
	{ name: "Offset", type: 0x11, value: f32s(0, 1, 0) },
];

const tree = (): FixtureInstance[] => [
	service("Workspace", [
		{
			className: "Part",
			name: "Hull",
			props: {
				AttributesSerialize: { type: 1, value: encodeAttributes(entries()) },
				Tags: { type: 1, value: utf8.encode("Armour\0Hull") },
			},
		},
	]),
];

describe("an attribute list", () => {
	it("reads back as the bytes it was", () => {
		const blob = encodeAttributes(entries());
		expect(encodeAttributes(attributeEntries(blob)!)).toEqual(blob);
	});

	it("is not rewritten when it holds a type this cannot measure", () => {
		const odd = encodeAttributes([{ name: "Odd", type: 0x7f, value: new Uint8Array(3) }]);
		expect(attributeEntries(odd)).toBeNull();
	});

	it("offers its simple kinds for editing, and not a turned CFrame", () => {
		const [team, speed, spawn, offset] = attributeEntries(encodeAttributes(entries()))!;
		expect(attributeEdit(team)).toMatchObject({ kind: "string", value: "Red", attribute: true });
		expect(attributeEdit(speed)).toMatchObject({ kind: "number", value: 16 });
		expect(attributeEdit(spawn)).toBeUndefined();
		expect(attributeEdit(offset)).toMatchObject({ kind: "vector", value: [0, 1, 0] });
	});

	it("takes names as Studio does", () => {
		expect(attributeNameProblem("Fuel_2")).toBeNull();
		expect(attributeNameProblem("Fuel tank")).toMatch(/letters, digits and underscores/);
		expect(attributeNameProblem("RBXThing")).toMatch(/Roblox's own/);
	});
});

describe.each(["rbxl", "rbxlx"] as const)("the attribute and tag routes, on a .%s", (format) => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	async function open(roots: FixtureInstance[] = tree(), shared?: Uint8Array[]) {
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-attrs-"));
		const bytes = buildPlace(roots, "none", shared);
		await writeFile(path.join(root, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
		await writeFile(
			path.join(root, `place.${format}`),
			format === "rbxl" ? bytes : convertPlace(bytes, "rbxlx").bytes,
		);
		const session = new ApiSession({});
		await session.openAt(root);
		let stamp = ((await session.handle("GET", "/place")) as { stamp: string }).stamp;
		const index = 1; // Workspace, then Hull.
		const post = async (route: string, body: object) => {
			const answer = (await session.handle("POST", route, {
				body: { stamp, index, ...body },
			})) as { stamp: string };
			stamp = answer.stamp;
			return answer;
		};
		const hull = async (name = "Hull") => {
			const doc = readRbx(await readFile(path.join(root, `place.${format}`)));
			const inst = doc.instances.find((i) => i.name === name)!;
			const blob = (stored: string) =>
				(inst.props.get(stored)?.value as Uint8Array | undefined) ?? new Uint8Array(0);
			return {
				attributes: attributeEntries(blob("AttributesSerialize"))!,
				tags: tagsOf(blob("Tags")),
			};
		};
		return { post, hull };
	}

	it("keeps tags shared, as Studio files them", async () => {
		// Studio writes Tags as a SharedString: an index into the file's table.
		const shared = [new Uint8Array(0), utf8.encode("Armour\0Hull")];
		const { post, hull } = await open(
			[
				service("Workspace", [
					{ className: "Part", name: "Hull", props: { Tags: { type: 28, value: 1 } } },
					{ className: "Part", name: "Plain", props: { Tags: { type: 28, value: 0 } } },
				]),
			],
			shared,
		);
		await post("/place/tag", { tag: "Tracked" });
		expect((await hull()).tags).toEqual(["Armour", "Hull", "Tracked"]);
		expect((await hull("Plain")).tags).toEqual([]);
		const doc = readRbx(await readFile(path.join(root, `place.${format}`)));
		const tags = doc.instances.find((i) => i.name === "Hull")!.props.get("Tags")!;
		expect(tags.type).toBe("SharedString");
	});

	it("gives a place that keeps neither the properties Studio would have written", async () => {
		// As a place written before 0.199.0, or by another tool, has it.
		const { post, hull } = await open([
			service("Workspace", [
				{ className: "Part", name: "Hull" },
				{ className: "Part", name: "Turret" },
			]),
		]);
		await post("/place/attribute", { name: "Fuel", add: "number" });
		await post("/place/tag", { tag: "Tracked" });
		const hullNow = await hull();
		expect(hullNow.attributes.map((a) => a.name)).toEqual(["Fuel"]);
		expect(hullNow.tags).toEqual(["Tracked"]);
		// The class's other part has them too, empty, as Studio would.
		expect(await hull("Turret")).toEqual({ attributes: [], tags: [] });
	});

	it("changes a value and keeps the rest as they were", async () => {
		const { post, hull } = await open();
		await post("/place/attribute", { name: "Team", value: "Blue" });
		const { attributes } = await hull();
		expect(attributeEdit(attributes[0])?.value).toBe("Blue");
		// The turned CFrame, which nothing here can write, is byte for byte the same.
		expect(attributes[2].value).toEqual(turned);
		expect(attributes.map((a) => a.name)).toEqual(["Team", "Speed", "Spawn", "Offset"]);
	});

	it("adds an attribute and removes one", async () => {
		const { post, hull } = await open();
		await post("/place/attribute", { name: "Fuel", add: "number" });
		await post("/place/attribute", { name: "Fuel", value: 40 });
		await post("/place/attribute", { name: "Speed", remove: true });
		const { attributes } = await hull();
		expect(attributes.map((a) => a.name)).toEqual(["Team", "Spawn", "Offset", "Fuel"]);
		expect(attributeEdit(attributes[3])?.value).toBe(40);
	});

	it("refuses a name taken, or one Studio would not take", async () => {
		const { post } = await open();
		await expect(post("/place/attribute", { name: "Team", add: "string" })).rejects.toMatchObject({
			status: 409,
		});
		await expect(
			post("/place/attribute", { name: "two words", add: "string" }),
		).rejects.toMatchObject({ status: 422 });
	});

	it("adds a tag and removes one", async () => {
		const { post, hull } = await open();
		await post("/place/tag", { tag: "Tracked" });
		await post("/place/tag", { tag: "Armour", remove: true });
		expect((await hull()).tags).toEqual(["Hull", "Tracked"]);
		await expect(post("/place/tag", { tag: "Hull" })).rejects.toMatchObject({ status: 422 });
	});
});
