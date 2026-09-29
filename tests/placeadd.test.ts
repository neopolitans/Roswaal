/**
 * Adding scripts to a place: new scripts under the deepest instance of their
 * path that exists, Folders for what is missing, chosen values for the
 * properties a class carries, and a refusal for a layout it cannot extend.
 */

import { describe, expect, it } from "vitest";

import { addInstances } from "../src/core/rbx/adder.js";
import { pathOf, readRbx, stringProp } from "../src/core/rbx/index.js";
import { planPlaceUpdate } from "../src/core/rbx/placeExport.js";
import { writeSources } from "../src/core/rbx/writer.js";
import { buildPlace, type Compression, script, service } from "./rbxfixture.js";

/** Script properties as a real place carries them. */
const scriptProps = (idChar: string) => ({
	UniqueId: { type: 31, value: idChar.repeat(32) },
	SourceAssetId: { type: 27, value: 123 },
	Capabilities: { type: 33, value: 0 },
	Tags: { type: 28, value: 0 },
	AttributesSerialize: { type: 1, value: "attrs" },
	Disabled: { type: 2, value: false },
});

const place = (compression: Compression) =>
	buildPlace(
		[
			service("ServerScriptService", [
				script("Script", "Main", "print('main')", { ...scriptProps("a"), RunContext: { type: 18, value: 0 } }),
			]),
			service("ReplicatedStorage", [
				{
					className: "Folder",
					name: "Shared",
					props: {
						IconTint: { type: 12, value: [0.5, 0.25, 0.125] },
						UniqueId: { type: 31, value: "c".repeat(32) },
						Tags: { type: 28, value: 0 },
					},
					children: [script("ModuleScript", "Util", "return {}", scriptProps("b"))],
				},
			]),
		],
		compression,
		[new TextEncoder().encode("tagged"), new Uint8Array(0)],
	);

const entry = (file: string, path: string[], text: string, isModule = true) => ({
	file, text, isModule, targets: [{ path }],
});

describe("adding scripts to a binary place", () => {
	for (const compression of ["none", "zstd"] as Compression[]) {
		it(`adds scripts, their folders and a new class, with ${compression} chunks`, () => {
			const bytes = place(compression);
			const doc = readRbx(bytes);
			const update = planPlaceUpdate(doc, [
				entry("New.luau", ["ReplicatedStorage", "Shared", "New"], "return 'new'"),
				entry("Thing.luau", ["ReplicatedStorage", "Deep", "Deeper", "Thing"], "return 'deep'"),
				entry("Client.client.luau", ["ServerScriptService", "Client"], "print('client')", false),
				entry("Pack/init.luau", ["ReplicatedStorage", "Pack"], "return 'pack'"),
				entry("Pack/Child.luau", ["ReplicatedStorage", "Pack", "Child"], "return 'child'"),
			]);
			expect([...update.addedFiles].sort()).toEqual([
				"Client.client.luau", "New.luau", "Pack/Child.luau", "Pack/init.luau", "Thing.luau",
			]);
			const out = addInstances(writeSources(bytes, doc, update.changes), doc, update.added);
			const back = readRbx(out);
			const at = (path: string) => back.instances.find((i) => pathOf(i).join(".") === path)!;

			// Five scripts and two folders, and the header says so.
			expect(back.instances.length).toBe(doc.instances.length + 7);
			expect(new DataView(out.buffer, out.byteOffset).getInt32(20, true)).toBe(doc.instances.length + 7);
			expect(at("ReplicatedStorage.Shared.New").className).toBe("ModuleScript");
			expect(stringProp(at("ReplicatedStorage.Shared.New"), "Source")).toBe("return 'new'");
			expect(at("ReplicatedStorage.Deep").className).toBe("Folder");
			expect(at("ReplicatedStorage.Deep.Deeper").className).toBe("Folder");
			expect(stringProp(at("ReplicatedStorage.Deep.Deeper.Thing"), "Source")).toBe("return 'deep'");
			expect(at("ServerScriptService.Client").className).toBe("LocalScript");
			expect(stringProp(at("ServerScriptService.Client"), "Source")).toBe("print('client')");
			expect(at("ReplicatedStorage.Pack").className).toBe("ModuleScript");
			expect(stringProp(at("ReplicatedStorage.Pack.Child"), "Source")).toBe("return 'child'");

			// Chosen values, not the template's: a fresh id, no asset, no tags, no attributes.
			const fresh = at("ReplicatedStorage.Shared.New");
			expect(fresh.props.get("UniqueId")?.value).not.toBe("b".repeat(32));
			expect(fresh.props.get("UniqueId")?.value).not.toBe("0".repeat(32));
			expect(fresh.props.get("SourceAssetId")?.value).toBe(-1n);
			expect(Array.from(fresh.props.get("Tags")!.value as Uint8Array)).toEqual([]);
			expect(Array.from(fresh.props.get("AttributesSerialize")!.value as Uint8Array)).toEqual([]);
			// A Folder's tint has no empty value, so it takes the template's.
			expect(at("ReplicatedStorage.Deep").props.get("IconTint")?.value).toEqual([0.5, 0.25, 0.125]);
			// What was there is as it was.
			const util = at("ReplicatedStorage.Shared.Util");
			expect(util.props.get("UniqueId")?.value).toBe("b".repeat(32));
			expect(util.props.get("SourceAssetId")?.value).toBe(123n);
			expect(new TextDecoder().decode(util.props.get("Tags")!.value as Uint8Array)).toBe("tagged");
			expect(new TextDecoder().decode(util.props.get("AttributesSerialize")!.value as Uint8Array)).toBe("attrs");
		});
	}

	it("does not add beside a same-named instance, or under a service the place lacks", () => {
		const doc = readRbx(place("none"));
		const update = planPlaceUpdate(doc, [
			entry("Shared.luau", ["ReplicatedStorage", "Shared"], "return 1"),
			entry("Light.luau", ["Lighting", "Light"], "return 1"),
		]);
		expect(update.ambiguous).toEqual(["Shared.luau"]);
		expect(update.notInPlace).toEqual(["Light.luau"]);
		expect(update.added).toEqual([]);
	});

	it("refuses a class it cannot add to rather than half-writing it", () => {
		const bytes = buildPlace([
			service("ServerScriptService", [
				script("Script", "Main", "print(1)", { Odd: { type: 21, value: [[0, 1, 0], [1, 1, 0]] } }),
			]),
		]);
		const doc = readRbx(bytes);
		const update = planPlaceUpdate(doc, [entry("New.server.luau", ["ServerScriptService", "New"], "print(2)", false)]);
		expect(() => addInstances(bytes, doc, update.added)).toThrow(/Script\.Odd/);
	});
});

describe("adding scripts to an XML place", () => {
	it("adds the script and its folder inside the parent's item", () => {
		const XML =
			'<roblox version="4"><Item class="ReplicatedStorage" referent="RBX1"><Properties>' +
			'<string name="Name">ReplicatedStorage</string></Properties></Item></roblox>';
		const bytes = new TextEncoder().encode(XML);
		const doc = readRbx(bytes);
		const update = planPlaceUpdate(doc, [entry("Deep/Thing.luau", ["ReplicatedStorage", "Deep", "Thing"], "return 'a < b'")]);
		const back = readRbx(addInstances(bytes, doc, update.added));
		const thing = back.instances.find((i) => i.name === "Thing")!;
		expect(pathOf(thing)).toEqual(["ReplicatedStorage", "Deep", "Thing"]);
		expect(thing.parent!.className).toBe("Folder");
		expect(stringProp(thing, "Source")).toBe("return 'a < b'");
	});
});
