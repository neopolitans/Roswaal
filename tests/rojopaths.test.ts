/**
 * Rojo's naming rules, which the node map, the require resolver and the place
 * import and export all read from one module.
 */

import { describe, expect, it } from "vitest";

import type { MapNode } from "../src/core/nodemap.js";
import {
	instanceNameOf,
	isModuleFile,
	locateUnder,
	mappedPaths,
	normalisePath,
	scriptClassOf,
	scriptSuffix,
} from "../src/core/rojoPaths.js";

const node = (name: string, path: string | undefined, children: MapNode[] = []): MapNode => ({
	id: name,
	name,
	className: "Folder",
	...(path ? { path } : {}),
	children,
});

describe("Rojo's file names", () => {
	it("say a script's class, and back", () => {
		expect(
			["a.server.luau", "a.client.lua", "a.luau", "init.server.nodescript"].map(scriptClassOf),
		).toEqual(["Script", "LocalScript", "ModuleScript", "Script"]);
		expect(["Script", "LocalScript", "ModuleScript"].map(scriptSuffix)).toEqual([
			".server.luau",
			".client.luau",
			".luau",
		]);
		expect(isModuleFile("Util.luau")).toBe(true);
		expect(isModuleFile("Main.server.luau")).toBe(false);
	});

	it("name the instance, and init names nothing", () => {
		expect(instanceNameOf("Greeter.client.luau")).toBe("Greeter");
		expect(instanceNameOf("init.luau")).toBeUndefined();
		expect(instanceNameOf("signal@2.0.0")).toBe("signal@2.0.0");
	});

	it("spell a path one way, whichever slash it came with", () => {
		expect(normalisePath(".\\src\\shared\\")).toBe("src/shared");
		expect(normalisePath("./src//")).toBe("src");
	});
});

describe("where a file lands under a map", () => {
	const root = node("game", undefined, [
		node("ReplicatedStorage", "src/shared", [node("Packages", "Packages")]),
		node("ServerScriptService", "src/server"),
	]);

	it("takes the deepest mapping the file is inside", () => {
		expect(mappedPaths(root).map((m) => m.segments.join("."))).toEqual([
			"ReplicatedStorage",
			"ReplicatedStorage.Packages",
			"ServerScriptService",
		]);
		expect(locateUnder(mappedPaths(root), "src\\shared\\Util\\init.luau")).toEqual({
			segments: ["ReplicatedStorage"],
			base: "src/shared",
			parts: ["Util"],
			leaf: "init.luau",
		});
		expect(locateUnder(mappedPaths(root), "Packages/Signal.lua")?.segments).toEqual([
			"ReplicatedStorage",
			"Packages",
		]);
		expect(locateUnder(mappedPaths(root), "src/sharedish/x.luau")).toBeUndefined();
	});
});
