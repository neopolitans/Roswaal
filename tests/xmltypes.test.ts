/**
 * Reading an XML place as Studio's binary would keep it, so a Legacy place
 * saved as .rbxl opens in Studio. Each case is one Studio refused: a hidden
 * asset link read as a Content, a BrickColor read as an int, a Source written
 * as a ProtectedString.
 */

import { describe, expect, it } from "vitest";

import { readRbx } from "../src/core/rbx/index.js";
import { convertPlace } from "../src/core/rbx/serialize.js";

const place = (items: string) =>
	new TextEncoder().encode(
		`<roblox version="4"><Item class="Workspace" referent="RBX0"><Properties><string name="Name">Workspace</string></Properties>${items}</Item></roblox>`,
	);

const decal = `<Item class="Decal" referent="RBX1"><Properties>
	<string name="Name">Decal</string>
	<Content name="TexturePack"><null></null></Content>
	<Content name="EmissiveMaskContent">
		<null></null>
	</Content>
</Properties></Item>`;

const spawn = `<Item class="SpawnLocation" referent="RBX2"><Properties>
	<string name="Name">Spawn</string>
	<int name="TeamColor">194</int>
</Properties></Item>`;

const script = `<Item class="ModuleScript" referent="RBX3"><Properties>
	<string name="Name">Module</string>
	<ProtectedString name="Source"><![CDATA[return {}]]></ProtectedString>
</Properties></Item>`;

const prop = (bytes: Uint8Array, name: string, property: string) =>
	readRbx(bytes)
		.instances.find((i) => i.name === name)!
		.props.get(property)!;

describe("an XML place read as Studio's binary keeps it", () => {
	it("takes a hidden asset link with none as the asset link it is", () => {
		const bytes = place(decal);
		expect(prop(bytes, "Decal", "TexturePack").type).toBe("String");
		// A newer `...Content` property with none is a Content, written the same way.
		expect(prop(bytes, "Decal", "EmissiveMaskContent").type).toBe("Content");
	});

	it("takes a BrickColor Studio wrote as an int as a BrickColor", () => {
		expect(prop(place(spawn), "Spawn", "TeamColor")).toEqual({ type: "BrickColor", value: 194 });
	});

	it("saves each as .rbxl with the type Studio's binary gives it", () => {
		const binary = convertPlace(place(decal + spawn + script), "rbxl").bytes;
		expect(prop(binary, "Decal", "TexturePack").type).toBe("String");
		expect(prop(binary, "Decal", "EmissiveMaskContent").type).toBe("Content");
		expect(prop(binary, "Spawn", "TeamColor").type).toBe("BrickColor");
		expect(prop(binary, "Module", "Source").type).toBe("String");
	});
});
