/**
 * Reading places and models, binary and XML.
 *
 * The binary files are built by `rbxfixture.ts`; the XML is written out here.
 * Real places never enter the repository -- see `rbxcorpus.test.ts` for the
 * local check against them.
 */

import { describe, expect, it } from "vitest";
import { isScript, pathOf, readRbx, stringProp, text, walk } from "../src/core/rbx/index.js";
import { lz4Decompress } from "../src/core/rbx/lz4.js";
import { buildPlace, type Compression, folder, script, service } from "./rbxfixture.js";

const place = () => [
	service("ServerScriptService", [
		script("Script", "Main", 'print("hello")', { RunContext: { type: 18, value: 2 } }),
	]),
	service("ReplicatedStorage", [
		folder("Shared", [script("ModuleScript", "Util", "return {}", { UniqueId: { type: 31, value: "0123456789abcdef0123456789abcdef" } })]),
	]),
	service("Workspace", [
		{ className: "Part", name: "Coin", props: { Anchored: { type: 2, value: true }, Transparency: { type: 4, value: 0.5 } } },
	]),
];

describe("the binary reader", () => {
	for (const compression of ["none", "lz4", "zstd"] as Compression[]) {
		it(`reads a place with ${compression} chunks`, () => {
			const doc = readRbx(buildPlace(place(), compression));
			expect(doc.format).toBe("binary");
			expect(doc.roots.map((r) => r.name)).toEqual(["ServerScriptService", "ReplicatedStorage", "Workspace"]);
			expect(doc.roots.every((r) => r.service)).toBe(true);
			const scripts = doc.instances.filter(isScript);
			expect(scripts.map((s) => pathOf(s).join("."))).toEqual(["ServerScriptService.Main", "ReplicatedStorage.Shared.Util"]);
			expect(stringProp(scripts[0], "Source")).toBe('print("hello")');
			expect(scripts[0].props.get("RunContext")?.value).toBe(2);
			expect(scripts[1].props.get("UniqueId")?.value).toBe("0123456789abcdef0123456789abcdef");
			const coin = doc.instances.find((i) => i.name === "Coin")!;
			expect(coin.props.get("Anchored")?.value).toBe(true);
			expect(coin.props.get("Transparency")?.value).toBe(0.5);
			expect(coin.parent?.name).toBe("Workspace");
		});
	}

	it("keeps text properties as bytes, so binary ones survive", () => {
		const blob = Uint8Array.of(0, 255, 1, 128);
		const doc = readRbx(buildPlace([service("Workspace", [{ className: "Part", name: "P", props: { AttributesSerialize: { type: 1, value: blob } } }])]));
		const value = doc.instances.find((i) => i.name === "P")!.props.get("AttributesSerialize")!.value as Uint8Array;
		expect(Array.from(value)).toEqual([0, 255, 1, 128]);
	});

	it("counts a property type it does not decode, and reads the rest", () => {
		const doc = readRbx(buildPlace([service("Workspace", [{ className: "ParticleEmitter", name: "Sparks", props: { Size: { type: 21, value: [[0, 1, 0], [1, 2, 0]] } } }])]));
		expect(doc.undecoded.get("NumberSequence")).toBe(1);
		const sparks = doc.instances.find((i) => i.name === "Sparks")!;
		expect(sparks.props.has("Size")).toBe(false);
		expect(sparks.className).toBe("ParticleEmitter");
	});

	it("refuses a file cut short", () => {
		const bytes = buildPlace(place());
		expect(() => readRbx(bytes.subarray(0, bytes.length - 30))).toThrow();
		expect(() => readRbx(new TextEncoder().encode("hello"))).toThrow(/not a Roblox place or model/);
	});
});

describe("LZ4", () => {
	it("reads a block with a match that overlaps itself", () => {
		// "ab" as literals, then a match of 6 at offset 2: "abababab".
		const block = Uint8Array.of(0x22, 0x61, 0x62, 0x02, 0x00, 0x00);
		expect(text(lz4Decompress(block, 8))).toBe("abababab");
	});

	it("refuses a block that does not fill its length", () => {
		expect(() => lz4Decompress(Uint8Array.of(0x10, 0x61), 5)).toThrow();
	});
});

const XML = `<?xml version="1.0" encoding="utf-8"?>
<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" version="4">
	<Meta name="ExplicitAutoJoints">true</Meta>
	<External>null</External>
	<!-- A comment Studio does not write, but a person might. -->
	<Item class="ServerScriptService" referent="RBX1">
		<Properties>
			<string name="Name">ServerScriptService</string>
		</Properties>
		<Item class="Script" referent="RBX2">
			<Properties>
				<string name="Name">Main &amp; Friends</string>
				<ProtectedString name="Source"><![CDATA[if a < b and c > d then print("<ok>") end]]></ProtectedString>
				<token name="RunContext">1</token>
				<bool name="Disabled">false</bool>
				<UniqueId name="UniqueId">44B188DACE632B4702E9C68D004815FC</UniqueId>
				<BinaryString name="AttributesSerialize">AAEC</BinaryString>
				<Ref name="Target">RBX3</Ref>
			</Properties>
		</Item>
	</Item>
	<Item class="Workspace" referent="RBX3">
		<Properties>
			<string name="Name">Workspace</string>
			<Vector3 name="Gravity2"><X>0</X><Y>-196.2</Y><Z>0</Z></Vector3>
			<SharedString name="Blob">abc</SharedString>
			<Font name="SomeFont"><Family><url>rbxasset://x</url></Family></Font>
		</Properties>
	</Item>
	<SharedStrings>
		<SharedString md5="abc">aGVsbG8=</SharedString>
	</SharedStrings>
</roblox>`;

describe("the XML reader", () => {
	const doc = readRbx(new TextEncoder().encode(XML));

	it("reads the tree, names and services", () => {
		expect(doc.format).toBe("xml");
		expect(doc.roots.map((r) => r.name)).toEqual(["ServerScriptService", "Workspace"]);
		expect(doc.roots.every((r) => r.service)).toBe(true);
		expect([...walk(doc.roots)].map((i) => i.name)).toEqual(["ServerScriptService", "Main & Friends", "Workspace"]);
	});

	it("reads each property type it knows", () => {
		const main = doc.instances.find(isScript)!;
		expect(stringProp(main, "Source")).toBe('if a < b and c > d then print("<ok>") end');
		expect(main.props.get("RunContext")?.value).toBe(1);
		expect(main.props.get("Disabled")?.value).toBe(false);
		expect(main.props.get("UniqueId")?.value).toBe("44b188dace632b4702e9c68d004815fc");
		expect(Array.from(main.props.get("AttributesSerialize")!.value as Uint8Array)).toEqual([0, 1, 2]);
		expect(main.props.get("Target")?.value).toBe(doc.roots[1]);
		const ws = doc.roots[1];
		expect(ws.props.get("Gravity2")?.value).toEqual([0, -196.2, 0]);
		expect(text(ws.props.get("Blob")?.value)).toBe("hello");
		expect(doc.undecoded.get("Font")).toBe(1);
	});

	it("says where malformed XML goes wrong", () => {
		expect(() => readRbx(new TextEncoder().encode("<roblox><Item class='A'></roblox>"))).toThrow(/closes <roblox> inside <Item>/);
	});
});
