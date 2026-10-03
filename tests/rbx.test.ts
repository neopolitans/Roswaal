/**
 * Reading places and models, binary and XML.
 *
 * The binary files are built by `rbxfixture.ts`; the XML is written out here.
 * Real places never enter the repository -- see `rbxcorpus.test.ts` for the
 * local check against them.
 */

import { describe, expect, it } from "vitest";
import { isScript, pathOf, RbxError, readRbx, stringProp, text, walk } from "../src/core/rbx/index.js";
import { lz4Compress, lz4Decompress } from "../src/core/rbx/lz4.js";
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

describe("a damaged file", () => {
	/** What reading threw, or "read" when it did not. */
	const outcome = (bytes: Uint8Array): string => {
		try {
			readRbx(bytes);
			return "read";
		} catch (error) {
			return error instanceof RbxError ? "RbxError" : `${(error as Error).name}: ${(error as Error).message}`;
		}
	};

	it("throws RbxError for a binary header cut short", () => {
		const whole = buildPlace(place(), "none");
		expect(outcome(whole.subarray(0, 14))).toBe("RbxError");
		expect(outcome(whole.subarray(0, 15))).toBe("RbxError");
		expect(() => readRbx(whole.subarray(0, 15))).toThrow(/header/);
	});

	it("throws only RbxError however a binary place is cut or spoiled", () => {
		for (const compression of ["none", "lz4", "zstd"] as Compression[]) {
			const whole = buildPlace(place(), compression);
			const seen = new Set<string>();
			for (let n = 8; n < whole.length; n++) seen.add(outcome(whole.subarray(0, n)));
			let seed = 7;
			for (let k = 0; k < 300; k++) {
				const spoiled = whole.slice();
				seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
				const at = 32 + (seed % (whole.length - 32));
				spoiled[at] ^= 1 + (seed >>> 24) % 255;
				seen.add(outcome(spoiled));
			}
			seen.delete("read");
			expect([...seen]).toEqual(["RbxError"]);
		}
	});

	it("throws RbxError for XML it cannot decode", () => {
		const props = (inner: string) =>
			new TextEncoder().encode(`<roblox><Item class="Part" referent="A"><Properties>${inner}</Properties></Item></roblox>`);
		expect(outcome(props('<int64 name="Id">1.5</int64>'))).toBe("RbxError");
		expect(outcome(props('<BinaryString name="B">not base64!</BinaryString>'))).toBe("RbxError");
		expect(outcome(props('<string name="Name">&#x110000;</string>'))).toBe("read");
		for (let n = 1; n < XML.length; n += 7) {
			const cut = outcome(new TextEncoder().encode(XML.slice(0, n)));
			expect(["RbxError", "read"]).toContain(cut);
		}
	});
});

describe("LZ4 compression", () => {
	const r = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
	const cases: [string, Uint8Array][] = [
		["empty", new Uint8Array(0)],
		["short", new TextEncoder().encode("local x = 1")],
		["repetitive", new TextEncoder().encode("print('hello')\n".repeat(5000))],
		["noise", (() => { const g = r(1); return Uint8Array.from({ length: 100_000 }, () => Math.floor(g() * 256)); })()],
		["runs", (() => { const g = r(2); const a = new Uint8Array(300_000); for (let i = 0; i < a.length; i++) a[i] = g() < 0.9 ? a[Math.max(0, i - 40)] : Math.floor(g() * 256); return a; })()],
	];
	for (const [name, data] of cases) {
		it(`round-trips ${name}`, () => {
			const packed = lz4Compress(data);
			expect(Array.from(lz4Decompress(packed, data.length)).every((b, i) => b === data[i])).toBe(true);
		});
	}
	it("compresses what repeats", () => {
		const data = new TextEncoder().encode("print('hello')\n".repeat(5000));
		expect(lz4Compress(data).length).toBeLessThan(data.length / 20);
	});
});
