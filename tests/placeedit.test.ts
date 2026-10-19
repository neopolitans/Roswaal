/**
 * Changing a property in a place: which properties may change, the one value
 * written into a binary or an XML place with every other byte kept, and the
 * route that writes it over the project's place with a backup first.
 */

import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { describeInstance, outlinePlace, propertyEdit } from "../src/core/rbx/browse.js";
import { readChunks } from "../src/core/rbx/chunks.js";
import { storedValue, writeProperty } from "../src/core/rbx/edit.js";
import { RbxError, type RbxInstance, readRbx, stringProp } from "../src/core/rbx/index.js";
import { ApiSession } from "../src/server/routes.js";
import { buildPlace, type Compression, type FixtureInstance, service } from "./rbxfixture.js";

const part = (name: string, n: number): FixtureInstance => ({
	className: "Part",
	name,
	props: {
		Anchored: { type: 2, value: n % 2 === 0 },
		Transparency: { type: 4, value: n / 10 },
		Material: { type: 18, value: 256 },
		Color3uint8: { type: 26, value: [n, 2 * n, 3 * n] },
		Mass: { type: 4, value: 7 },
	},
});

const tree = (): FixtureInstance[] => [
	service("Workspace", [part("A", 1), part("B", 2), part("C", 3)]),
	service("Lighting"),
	{ className: "NumberValue", name: "Gold", props: { Value: { type: 5, value: 1.5 } } },
	{ className: "SpawnLocation", name: "Spawn", props: { Duration: { type: 3, value: 10 } } },
	{ className: "Team", name: "Red", props: { TeamColor: { type: 11, value: 21 } } },
	{ className: "StringValue", name: "Motto", props: { Value: { type: 1, value: "hold" } } },
	{ className: "IntValue", name: "Coins", props: { Value: { type: 27, value: -4 } } },
];

function lighting(): FixtureInstance[] {
	const all = tree();
	all[1] = {
		...all[1],
		props: {
			Ambient: { type: 12, value: [0.5, 0.25, 1] },
			GlobalShadows: { type: 2, value: true },
		},
	};
	return all;
}

const named = (doc: ReturnType<typeof readRbx>, name: string): RbxInstance =>
	doc.instances.find((i) => i.name === name)!;

/** Changes `name`'s `stored` to `input`, as the route would, and reads the result. */
function change(bytes: Uint8Array, name: string, stored: string, input: unknown) {
	const doc = readRbx(bytes);
	const inst = named(doc, name);
	const edit = propertyEdit(inst, stored);
	if (!edit) throw new Error(`${stored} offers no edit`);
	const out = writeProperty(
		bytes,
		doc,
		inst,
		stored,
		storedValue(edit, inst.props.get(stored)!, input),
	);
	return { out, doc: readRbx(out) };
}

describe("which properties may change", () => {
	const doc = readRbx(buildPlace(lighting()));
	const a = named(doc, "A");

	it("offers the simple kinds a script may set, in Studio's terms", () => {
		expect(propertyEdit(a, "Anchored")).toEqual({ stored: "Anchored", kind: "bool", value: false });
		expect(propertyEdit(a, "Transparency")).toMatchObject({ kind: "number" });
		const material = propertyEdit(a, "Material")!;
		expect(material).toMatchObject({
			stored: "Material",
			kind: "enum",
			value: 256,
			enum: "Material",
		});
		expect(material.items).toContainEqual({ name: "Plastic", value: 256 });
		expect(material.items).toContainEqual({ name: "Neon", value: 288 });
		expect(propertyEdit(a, "Color3uint8")).toEqual({
			stored: "Color3uint8",
			kind: "color",
			value: [1, 2, 3],
		});
		expect(propertyEdit(named(doc, "Lighting"), "Ambient")).toEqual({
			stored: "Ambient",
			kind: "color",
			value: [128, 64, 255],
		});
		expect(propertyEdit(named(doc, "Red"), "TeamColor")).toMatchObject({ kind: "brickcolor" });
		expect(propertyEdit(named(doc, "Coins"), "Value")).toMatchObject({ kind: "int", value: -4 });
		expect(propertyEdit(named(doc, "Motto"), "Value")).toMatchObject({
			kind: "string",
			value: "hold",
		});
	});

	it("leaves out read-only properties and anything the engine does not list", () => {
		expect(propertyEdit(a, "Mass")).toBeUndefined();
		expect(propertyEdit(a, "NoSuchThing")).toBeUndefined();
		// A name is changed since 0.200.0; see placeeditnames.test.ts.
		expect(propertyEdit(a, "Name")).toMatchObject({ kind: "string" });
	});

	it("is carried on the properties the browser shows", () => {
		const order = outlinePlace(doc).order;
		const info = describeInstance(a, order.indexOf(a), () => undefined);
		const by = (n: string) => info.properties.find((p) => p.name === n)!;
		expect(by("Color").edit).toMatchObject({ stored: "Color3uint8", kind: "color" });
		expect(by("Mass").edit).toBeUndefined();
	});
});

describe("writing one value into a binary place", () => {
	for (const compression of ["none", "lz4", "zstd"] as Compression[]) {
		it(`changes only that instance's value, ${compression}`, () => {
			const bytes = buildPlace(lighting(), compression);
			const { out, doc } = change(bytes, "B", "Transparency", 0.75);
			expect(named(doc, "B").props.get("Transparency")!.value).toBe(Math.fround(0.75));
			expect(named(doc, "A").props.get("Transparency")!.value).toBe(Math.fround(0.1));
			expect(named(doc, "C").props.get("Transparency")!.value).toBe(Math.fround(0.3));
			// One chunk changed; every other is the bytes it was.
			const was = readChunks(bytes).map((c) => c.whole.join());
			const now = readChunks(out).map((c) => c.whole.join());
			expect(now.length).toBe(was.length);
			expect(now.filter((c, i) => c !== was[i])).toHaveLength(1);
		});
	}

	it("writes each simple kind", () => {
		let bytes = buildPlace(lighting());
		const steps: [string, string, unknown, (i: RbxInstance) => unknown, unknown][] = [
			["C", "Anchored", true, (i) => i.props.get("Anchored")!.value, true],
			["A", "Material", 288, (i) => i.props.get("Material")!.value, 288],
			["B", "Color3uint8", [10, 20, 30], (i) => i.props.get("Color3uint8")!.value, [10, 20, 30]],
			["Gold", "Value", -2.25, (i) => i.props.get("Value")!.value, -2.25],
			["Spawn", "Duration", -3, (i) => i.props.get("Duration")!.value, -3],
			["Red", "TeamColor", 1004, (i) => i.props.get("TeamColor")!.value, 1004],
			["Coins", "Value", 9007199254740991, (i) => i.props.get("Value")!.value, 9007199254740991n],
			["Motto", "Value", "hold the line", (i) => stringProp(i, "Value"), "hold the line"],
			["Lighting", "Ambient", [255, 0, 51], (i) => i.props.get("Ambient")!.value, [1, 0, 0.2]],
		];
		for (const [name, stored, input, read, expected] of steps) {
			const { out, doc } = change(bytes, name, stored, input);
			const got = read(named(doc, name));
			if (Array.isArray(expected))
				(got as number[]).forEach((v, i) => expect(v).toBeCloseTo(expected[i], 6));
			else expect(got).toEqual(expected);
			bytes = out;
		}
		// And nothing else moved: A's colour and C's material are as built.
		const doc = readRbx(bytes);
		expect(named(doc, "A").props.get("Color3uint8")!.value).toEqual([1, 2, 3]);
		expect(named(doc, "C").props.get("Material")!.value).toBe(256);
		expect(named(doc, "Lighting").props.get("GlobalShadows")!.value).toBe(true);
	});

	it("refuses a value the property cannot hold", () => {
		const doc = readRbx(buildPlace(lighting()));
		const a = named(doc, "A");
		const value = (stored: string, input: unknown) =>
			storedValue(propertyEdit(a, stored)!, a.props.get(stored)!, input);
		expect(() => value("Anchored", "yes")).toThrow(RbxError);
		expect(() => value("Material", 3)).toThrow(/not one of Enum.Material/);
		expect(() => value("Transparency", Number.NaN)).toThrow(/is a number/);
		expect(() => value("Color3uint8", [0, 0, 256])).toThrow(/0 to 255/);
		const spawn = named(doc, "Spawn");
		expect(() =>
			storedValue(propertyEdit(spawn, "Duration")!, spawn.props.get("Duration")!, 2 ** 31),
		).toThrow(/whole number from/);
	});
});

const XML_PLACE = `<roblox version="4">
	<Item class="Workspace" referent="RBX0">
		<Properties>
			<string name="Name">Workspace</string>
		</Properties>
		<Item class="Part" referent="RBX1">
			<Properties>
				<bool name="Anchored">false</bool>
				<Color3uint8 name="Color3uint8">4288914085</Color3uint8>
				<token name="Material">256</token>
				<string name="Name">Floor</string>
				<float name="Transparency">0</float>
			</Properties>
		</Item>
	</Item>
	<Item class="Lighting" referent="RBX2">
		<Properties>
			<Color3 name="Ambient">
				<R>0.5</R>
				<G>0.5</G>
				<B>0.5</B>
			</Color3>
			<string name="Name">Lighting</string>
		</Properties>
	</Item>
	<Item class="Sky" referent="RBX4">
		<Properties>
			<string name="Name">Sky</string>
			<Content name="SkyboxUp"><url>rbxassetid://1</url></Content>
		</Properties>
	</Item>
	<Item class="StringValue" referent="RBX3">
		<Properties>
			<string name="Name">Motto</string>
			<string name="Value"/>
		</Properties>
	</Item>
</roblox>
`;

describe("writing one value into an XML place", () => {
	const bytes = new TextEncoder().encode(XML_PLACE);
	const text = (out: Uint8Array) => new TextDecoder().decode(out);

	it("replaces that element's text and nothing else", () => {
		const { out } = change(bytes, "Floor", "Anchored", true);
		expect(text(out)).toBe(XML_PLACE.replace(">false</bool>", ">true</bool>"));
	});

	it("keeps Studio's top byte on a packed colour, and each channel of a Color3", () => {
		const packed = change(bytes, "Floor", "Color3uint8", [255, 0, 16]);
		expect(text(packed.out)).toContain(`>${(0xffff0010 >>> 0).toString()}</Color3uint8>`);
		const ambient = change(bytes, "Lighting", "Ambient", [255, 0, 51]);
		expect(text(ambient.out)).toContain("<R>1</R>\n\t\t\t\t<G>0</G>\n\t\t\t\t<B>0.2</B>");
	});

	it("changes an asset link inside its Content element", () => {
		const { out, doc } = change(bytes, "Sky", "SkyboxUp", "rbxassetid://2");
		expect(text(out)).toContain('<Content name="SkyboxUp"><url>rbxassetid://2</url></Content>');
		expect(stringProp(named(doc, "Sky"), "SkyboxUp")).toBe("rbxassetid://2");
	});

	it("escapes text, and opens an element written as one tag", () => {
		const { out, doc } = change(bytes, "Motto", "Value", "a < b & c");
		expect(text(out)).toContain('<string name="Value">a &lt; b &amp; c</string>');
		expect(stringProp(named(doc, "Motto"), "Value")).toBe("a < b & c");
	});
});

describe("the property route", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	async function open() {
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-edit-"));
		await writeFile(path.join(root, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
		await writeFile(path.join(root, "place.rbxl"), buildPlace(lighting(), "lz4"));
		const session = new ApiSession({});
		await session.openAt(root);
		const tree = (await session.handle("GET", "/place")) as {
			stamp: string;
			outline: { nodes: [number, string, number, number][] };
		};
		const at = (name: string) => tree.outline.nodes.findIndex(([, n]) => n === name);
		return { session, tree, at };
	}

	type Answer = {
		stamp: string;
		backup?: string;
		instance: { index: number; properties: { name: string; value: string }[] };
	};

	it("writes the place, keeps one backup until the file changes elsewhere, and keeps the outline", async () => {
		const { session, tree, at } = await open();
		const original = await readFile(path.join(root, "place.rbxl"));
		const first = (await session.handle("POST", "/place/property", {
			body: { stamp: tree.stamp, index: at("B"), property: "Anchored", value: false },
		})) as Answer;
		expect(first.backup).toMatch(/^\.roswaal\/backups\/place\.\d{8}-\d{6}\.rbxl$/);
		expect(new Uint8Array(await readFile(path.join(root, first.backup!)))).toEqual(
			new Uint8Array(original),
		);
		expect(first.instance.index).toBe(at("B"));
		expect(first.instance.properties.find((p) => p.name === "Anchored")!.value).toBe("false");

		const second = (await session.handle("POST", "/place/property", {
			body: { stamp: first.stamp, index: at("B"), property: "Transparency", value: 0.5 },
		})) as Answer;
		expect(second.backup).toBeUndefined();
		const again = (await session.handle("GET", "/place")) as typeof tree;
		expect(again.stamp).toBe(second.stamp);
		expect(again.outline).toEqual(tree.outline);
		const doc = readRbx(await readFile(path.join(root, "place.rbxl")));
		expect(named(doc, "B").props.get("Anchored")!.value).toBe(false);
		expect(named(doc, "B").props.get("Transparency")!.value).toBe(0.5);

		// Saved elsewhere since: the next change copies that version first.
		await writeFile(path.join(root, "place.rbxl"), buildPlace(lighting(), "none"));
		const fresh = (await session.handle("GET", "/place")) as typeof tree;
		const third = (await session.handle("POST", "/place/property", {
			body: { stamp: fresh.stamp, index: at("A"), property: "Anchored", value: true },
		})) as Answer;
		expect(third.backup).toBeDefined();
		expect(third.backup).not.toBe(first.backup);
		expect(await readdir(path.join(root, ".roswaal", "backups"))).toHaveLength(2);
	});

	it("refuses a stale stamp, a property it does not change, and a value that does not fit", async () => {
		const { session, tree, at } = await open();
		const before = await readFile(path.join(root, "place.rbxl"));
		const post = (body: object) => session.handle("POST", "/place/property", { body });
		await expect(
			post({ stamp: "place.rbxl:old", index: at("A"), property: "Anchored", value: true }),
		).rejects.toMatchObject({ status: 409 });
		await expect(
			post({ stamp: tree.stamp, index: at("A"), property: "Mass", value: 1 }),
		).rejects.toMatchObject({ status: 422 });
		await expect(
			post({ stamp: tree.stamp, index: at("A"), property: "Material", value: 3 }),
		).rejects.toMatchObject({ status: 422 });
		expect(new Uint8Array(await readFile(path.join(root, "place.rbxl")))).toEqual(
			new Uint8Array(before),
		);
	});

	it("says when Studio has the place open", async () => {
		const { session } = await open();
		await writeFile(path.join(root, "place.rbxl.lock"), "");
		expect(await session.handle("GET", "/place")).toMatchObject({ studio: true });
	});
});
