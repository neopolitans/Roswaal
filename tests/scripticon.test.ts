/**
 * The script a graph or a Luau file becomes, as its icon's corner says: a
 * server for a Script, a monitor for a LocalScript, a puzzle piece for a
 * ModuleScript. The same rule Rojo reads from a file name, and the tree's
 * colours, so a graph and its Luau always agree.
 */

import { describe, expect, it } from "vitest";

import { realmClass, realmOfLuau, realmOfScript } from "../src/app/ScriptIcon.jsx";

describe("the script an icon says", () => {
	it("reads a graph's class, and its run context", () => {
		expect(realmOfScript({ scriptClass: "Script", target: "roblox" })).toBe("server");
		expect(realmOfScript({ scriptClass: "Script", runContext: "Client", target: "roblox" })).toBe(
			"client",
		);
		expect(realmOfScript({ scriptClass: "LocalScript", target: "roblox" })).toBe("client");
		expect(realmOfScript({ scriptClass: "ModuleScript", target: "roblox" })).toBe("module");
	});

	it("says nothing for a Lune graph, which is no Roblox script", () => {
		expect(realmOfScript({ scriptClass: "ModuleScript", target: "lune" })).toBeUndefined();
	});

	it("reads a Luau file's name as Rojo does", () => {
		expect(realmOfLuau("src/Main.server.luau")).toBe("server");
		expect(realmOfLuau("src/Controls.client.lua")).toBe("client");
		expect(realmOfLuau("src/Config/init.luau")).toBe("module");
		expect(realmOfLuau("src/Rig.luau")).toBe("module");
	});

	it("colours each as the tree already does", () => {
		expect(realmClass("server")).toBe("tree-script-server");
		expect(realmClass("client")).toBe("tree-script-local");
		expect(realmClass("module")).toBe("tree-script-module");
		expect(realmClass(undefined)).toBeUndefined();
	});
});
