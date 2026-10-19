/**
 * Writing a whole place from a document: every type the readers decode goes
 * out as binary and as XML and reads back as it went in, references included.
 */

import { describe, expect, it } from "vitest";
import { md5 } from "../src/core/md5.js";
import { type Prop, type RbxInstance, readRbx, walk } from "../src/core/rbx/index.js";
import {
	convertPlace,
	placeFormatOf,
	writeBinaryPlace,
	writeXmlPlace,
} from "../src/core/rbx/serialize.js";

const utf8 = new TextEncoder();

function inst(
	className: string,
	name: string,
	props: Record<string, Prop> = {},
	children: RbxInstance[] = [],
	service = false,
): RbxInstance {
	const made: RbxInstance = {
		className,
		name,
		parent: null,
		children,
		service,
		props: new Map(
			Object.entries({ Name: { type: "String", value: utf8.encode(name) }, ...props }),
		),
	};
	for (const child of children) child.parent = made;
	return made;
}

function documentOfEveryType() {
	const target = inst("Part", "Target");
	const other = inst("Part", "Other", {
		Anchored: { type: "Bool", value: true },
		Count: { type: "Int32", value: -7 },
		Size: { type: "Float32", value: 0.1 },
		Value: { type: "Float64", value: -1234.5678 },
		Big: { type: "Int64", value: -9007199254740991n },
		Material: { type: "Enum", value: 288 },
		Team: { type: "BrickColor", value: 1004 },
		Tint: { type: "Color3", value: [0.25, 0.5, 1] },
		Color3uint8: { type: "Color3uint8", value: [10, 200, 255] },
		Where: { type: "Vector3", value: [1.5, -2, 3] },
		Flat: { type: "Vector2", value: [4, 5] },
		Span: { type: "NumberRange", value: [1, 2.5] },
		Box: { type: "Rect", value: [0, 1, 2, 3] },
		Pad: { type: "UDim", value: [0.5, 12] },
		Frame: { type: "UDim2", value: [0.1, 2, 0.3, -4] },
		CFrame: {
			type: "CFrame",
			value: { position: [1, 2, 3], rotation: [0, 0, 1, 0, 1, 0, -1, 0, 0] },
		},
		Pivot: { type: "OptionalCFrame", value: null },
		Points: { type: "Ref", value: target },
		Nothing: { type: "Ref", value: null },
		Words: { type: "String", value: utf8.encode('a < b & "c"') },
		Blob: { type: "String", value: Uint8Array.of(0, 1, 2, 255) },
		Source: { type: "ProtectedString", value: utf8.encode("print(']]>')") },
		UniqueId: { type: "UniqueId", value: "0123456789abcdef0123456789abcdef" },
	});
	const workspace = inst("Workspace", "Workspace", {}, [target, other], true);
	const roots = [workspace, inst("Lighting", "Lighting", {}, [], true)];
	return { format: "binary" as const, roots, instances: [...walk(roots)], undecoded: new Map() };
}

/**
 * `b` holds every property of `a` as it was. Binary stores every property for
 * every instance of a class, so `b` may hold more, given blank values.
 */
function expectSame(a: RbxInstance[], b: RbxInstance[]) {
	expect(b.map((i) => `${i.className} ${i.name} ${i.service}`)).toEqual(
		a.map((i) => `${i.className} ${i.name} ${i.service}`),
	);
	a.forEach((was, n) => {
		const now = b[n]!;
		expect([...now.props.keys()]).toEqual(expect.arrayContaining([...was.props.keys()]));
		for (const [name, prop] of was.props) {
			const got = now.props.get(name)!;
			// Studio's binary keeps a script's Source as a plain String, and
			// refused a place that gave it the ProtectedString type.
			const kept = prop.type === "ProtectedString" && got.type === "String" ? prop.type : got.type;
			expect(kept, name).toBe(prop.type);
			if (prop.type === "Ref") {
				expect((got.value as RbxInstance | null)?.name ?? null, name).toBe(
					(prop.value as RbxInstance | null)?.name ?? null,
				);
			} else if (prop.type === "Float32") {
				expect(Math.fround(got.value as number), name).toBe(Math.fround(prop.value as number));
			} else if (Array.isArray(prop.value)) {
				// Flat, so a sequence's keypoints compare as their numbers.
				const flat = (x: unknown) => (x as unknown[]).flat(2) as number[];
				expect(flat(got.value).length, name).toBe(flat(prop.value).length);
				flat(prop.value).forEach((v, i) => expect(flat(got.value)[i], name).toBeCloseTo(v, 5));
			} else {
				expect(got.value, name).toEqual(prop.value);
			}
		}
	});
}

describe("writing a place from nothing", () => {
	it("as binary, every type reads back as it went in", () => {
		const doc = documentOfEveryType();
		const read = readRbx(writeBinaryPlace(doc));
		expect(read.format).toBe("binary");
		expect(read.undecoded.size).toBe(0);
		expectSame([...walk(doc.roots)], [...walk(read.roots)]);
		// Target had none of Other's properties, so it has them blank.
		const target = read.instances.find((i) => i.name === "Target")!;
		expect(target.props.get("Anchored")?.value).toBe(false);
		expect(target.props.get("Points")?.value).toBeNull();
	});

	it("as XML, every type reads back as it went in", () => {
		const doc = documentOfEveryType();
		const xml = writeXmlPlace(doc);
		expect(xml).toContain('<BinaryString name="Blob">AAEC/w==</BinaryString>');
		expect(xml).toContain('<string name="Words">a &lt; b &amp; &quot;c&quot;</string>');
		const read = readRbx(utf8.encode(xml));
		expect(read.format).toBe("xml");
		expectSame([...walk(doc.roots)], [...walk(read.roots)]);
	});

	it("writes an asset link as XML's Content element, which Studio reads, and reads it back", () => {
		const decal = inst("Decal", "Decal", {
			Texture: { type: "String", value: utf8.encode("rbxasset://textures/SpawnLocation.png") },
		});
		const sky = inst("Sky", "Sky", { SkyboxUp: { type: "String", value: new Uint8Array(0) } });
		const roots = [inst("Workspace", "Workspace", {}, [decal, sky], true)];
		const xml = writeXmlPlace({
			format: "xml",
			roots,
			instances: [...walk(roots)],
			undecoded: new Map(),
		});
		expect(xml).toContain(
			'<Content name="Texture"><url>rbxasset://textures/SpawnLocation.png</url></Content>',
		);
		expect(xml).toContain('<Content name="SkyboxUp"><null></null></Content>');
		const read = readRbx(utf8.encode(xml));
		expect(read.undecoded.size).toBe(0);
		const texture = read.instances.find((i) => i.name === "Decal")!.props.get("Texture")!;
		expect(new TextDecoder().decode(texture.value as Uint8Array)).toBe(
			"rbxasset://textures/SpawnLocation.png",
		);
		expect(
			(read.instances.find((i) => i.name === "Sky")!.props.get("SkyboxUp")!.value as Uint8Array)
				.length,
		).toBe(0);
	});

	it("is the same file for the same document", () => {
		expect(writeBinaryPlace(documentOfEveryType())).toEqual(
			writeBinaryPlace(documentOfEveryType()),
		);
		expect(writeXmlPlace(documentOfEveryType())).toBe(writeXmlPlace(documentOfEveryType()));
	});

	it("writes shared strings once each, keyed by their MD5, in both formats", () => {
		const doc = documentOfEveryType();
		const mesh = Uint8Array.from({ length: 300 }, (_, i) => i % 256);
		const [target, other] = doc.roots[0]!.children;
		target!.props.set("MeshData", { type: "SharedString", value: mesh });
		other!.props.set("MeshData", { type: "SharedString", value: mesh });
		for (const bytes of [writeBinaryPlace(doc), utf8.encode(writeXmlPlace(doc))]) {
			const read = readRbx(bytes);
			expect(read.undecoded.size).toBe(0);
			for (const name of ["Target", "Other"])
				expect(read.instances.find((i) => i.name === name)!.props.get("MeshData")!.value).toEqual(
					mesh,
				);
		}
		const xml = writeXmlPlace(doc);
		const key = btoa(String.fromCharCode(...md5(mesh)));
		expect(xml.match(/<SharedString md5=/g)).toHaveLength(1);
		expect(xml).toContain(`<SharedString name="MeshData">${key}</SharedString>`);
	});
});

describe("MD5", () => {
	const hex = (s: string) =>
		[...md5(utf8.encode(s))].map((b) => b.toString(16).padStart(2, "0")).join("");
	it("matches the published values", () => {
		expect(hex("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
		expect(hex("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
		expect(hex("The quick brown fox jumps over the lazy dog")).toBe(
			"9e107d9d372bb6826bd81d3542a419d6",
		);
		expect(hex("a".repeat(1000))).toBe("cabe45dcc9ae5b66ba86600cca6b8ba8");
	});
});

describe("converting a place", () => {
	it("goes binary to XML and back with every decoded property, and names what it left out", () => {
		const doc = documentOfEveryType();
		const binary = writeBinaryPlace(doc);
		expect(convertPlace(binary, "rbxl").bytes).toBe(binary);
		const xml = convertPlace(binary, "rbxlx");
		expect(readRbx(xml.bytes).format).toBe("xml");
		expect(xml.leftOut).toEqual([]);
		const back = convertPlace(xml.bytes, "rbxl");
		expectSame([...walk(doc.roots)], [...walk(readRbx(back.bytes).roots)]);
		expect(placeFormatOf("place.RBXLX")).toBe("rbxlx");
		expect(placeFormatOf("place.rbxl")).toBe("rbxl");
	});

	it("reports the kinds of property it could not carry", () => {
		const xml = `<roblox version="4"><Item class="Part" referent="RBX1"><Properties>
			<string name="Name">P</string><Faces name="ResizeableFaces"><faces>63</faces></Faces>
			<Axes name="Axes"><axes>7</axes></Axes>
		</Properties></Item></roblox>`;
		const converted = convertPlace(utf8.encode(xml), "rbxl");
		expect(converted.leftOut.map(([type]) => type).sort()).toEqual(["Axes", "Faces"]);
		expect(readRbx(converted.bytes).instances[0]!.name).toBe("P");
	});

	it("carries sequences, physical properties, fonts, capabilities and content both ways", () => {
		const roots = [
			inst(
				"Workspace",
				"Workspace",
				{},
				[
					inst("Part", "Heavy", {
						CustomPhysicalProperties: {
							type: "PhysicalProperties",
							value: { flag: 1, values: [2, 0.5, 0.25, 1, 1] },
						},
						Capabilities: { type: "SecurityCapabilities", value: 5n },
					}),
					inst("Part", "Plain", {
						CustomPhysicalProperties: {
							type: "PhysicalProperties",
							value: { flag: 2, values: [] },
						},
						Capabilities: { type: "SecurityCapabilities", value: 0n },
					}),
					inst("ParticleEmitter", "Sparks", {
						Transparency: {
							type: "NumberSequence",
							value: [
								[0, 0, 0],
								[0.5, 0.25, 0.1],
								[1, 1, 0],
							],
						},
						Color: {
							type: "ColorSequence",
							value: [
								[0, 1, 0, 0, 0],
								[1, 0, 0, 1, 0],
							],
						},
					}),
					inst("TextLabel", "Label", {
						FontFace: {
							type: "Font",
							value: {
								family: "rbxasset://fonts/families/BuilderSans.json",
								weight: 700,
								style: 1,
								cachedFaceId: "rbxasset://fonts/BuilderSans-Bold.otf",
							},
						},
					}),
					inst("Decal", "Mask", {
						EmissiveMaskContent: { type: "Content", value: { source: 1, uri: "rbxassetid://123" } },
					}),
					inst("Decal", "Blank", {
						EmissiveMaskContent: { type: "Content", value: { source: 0 } },
					}),
				],
				true,
			),
		];
		const doc = {
			format: "binary" as const,
			roots,
			instances: [...walk(roots)],
			undecoded: new Map(),
		};
		for (const bytes of [writeBinaryPlace(doc), utf8.encode(writeXmlPlace(doc))]) {
			const read = readRbx(bytes);
			expect(read.undecoded.size).toBe(0);
			expectSame([...walk(doc.roots)], [...walk(read.roots)]);
		}
	});
});
