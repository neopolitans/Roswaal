/**
 * Following a `require` from hand-written Luau to the module it reaches, and
 * what that module gives back: the code half, the disk half, and hover using
 * both. The project is made up; its shapes are the ones real projects use.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { hoverAt } from "../src/core/luau/hover.js";
import { moduleExports, requiresIn } from "../src/core/luau/requires.js";
import { serialiseMap, type NodeMap } from "../src/core/nodemap.js";
import { openProject } from "../src/server/project.js";
import { modulesRequiredBy } from "../src/server/requires.js";
import { ApiSession } from "../src/server/routes.js";

describe("where a require goes", () => {
	it("reads services, locals, WaitForChild, Parent and strings", () => {
		const src = [
			'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
			"local Packages = ReplicatedStorage.Packages",
			"local Flux = require(Packages.Flux)",
			'local Shared = require(ReplicatedStorage:WaitForChild("Shared").Util)',
			"local Sibling = require(script.Parent.Sibling)",
			'local Path = require("./path")',
			"local Computed = require(pick())",
		].join("\n");
		expect(requiresIn(src)).toEqual([
			{ name: "Flux", target: { t: "instance", from: "game", names: ["ReplicatedStorage", "Packages", "Flux"] } },
			{ name: "Shared", target: { t: "instance", from: "game", names: ["ReplicatedStorage", "Shared", "Util"] } },
			{ name: "Sibling", target: { t: "instance", from: "script", names: ["..", "Sibling"] } },
			{ name: "Path", target: { t: "string", spec: "./path" } },
		]);
	});
});

describe("what a module gives back", () => {
	it("a table and what the file puts on it, with comments", () => {
		const exports = moduleExports("local Fruit = {}\n\n-- Picks one.\nfunction Fruit.pick(n: number): string\n\treturn \"\"\nend\n\nreturn Fruit");
		expect(exports.kind).toBe("table");
		expect(exports.members).toMatchObject([{ name: "pick", kind: "function", detail: "(n: number) -> (string)", doc: { text: "Picks one." } }]);
	});

	it("looks through casts, table.freeze and setmetatable", () => {
		expect(moduleExports("local M = {}\nM.x = 1\nreturn M :: any").members.map((m) => m.name)).toEqual(["x"]);
		expect(moduleExports("return table.freeze({ a = 1, b = function() end })").members.map((m) => [m.name, m.kind]))
			.toEqual([["a", "field"], ["b", "function"]]);
		expect(moduleExports("local M = {}\nM.y = 2\nreturn table.freeze(setmetatable(M, {}))").members.map((m) => m.name)).toEqual(["y"]);
	});

	it("takes a field's signature and comment from the function it names", () => {
		const src = "local Signal = {}\n--- Makes one.\nfunction Signal.new() end\nreturn table.freeze({ new = Signal.new })";
		expect(moduleExports(src).members).toMatchObject([{ name: "new", kind: "function", doc: { text: "Makes one." } }]);
	});

	it("passes another module's through, and describes a returned global function", () => {
		expect(moduleExports('return require(script.Parent._Index["a_b@1.0.0"]["b"])').reexport)
			.toEqual({ t: "instance", from: "script", names: ["..", "_Index", "a_b@1.0.0", "b"] });
		expect(moduleExports("local Inner = require(script.Inner)\nreturn Inner").reexport)
			.toEqual({ t: "instance", from: "script", names: ["Inner"] });
		const button = moduleExports("--[[ A button. ]]\nfunction Button(props: {}) end\nreturn Button");
		expect(button).toMatchObject({ kind: "function", detail: "(props: {}) -> ()", doc: { text: "A button." } });
	});

	it("takes a block comment at the top as the module's, and not a heading", () => {
		expect(moduleExports("--[[ Keeps fruit. ]]\nlocal M = {}\nreturn M").doc?.text).toBe("Keeps fruit.");
		expect(moduleExports("-- SERVICES\nlocal M = {}\nreturn M").doc).toBeUndefined();
	});
});

describe("following requires in a project", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	async function project() {
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-requires-"));
		const put = async (rel: string, text: string) => {
			await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
			await writeFile(path.join(root, rel), text);
		};
		const map: NodeMap = {
			schemaVersion: 1, kind: "map", id: "m", name: "Orchard", output: "default.project.json",
			root: {
				id: "r", name: "DataModel", className: "DataModel", children: [
					{ id: "rs", name: "ReplicatedStorage", children: [
						{ id: "sh", name: "Shared", path: "src/shared", children: [] },
						{ id: "pk", name: "Packages", path: "Packages", children: [] },
					] },
					{ id: "ss", name: "ServerScriptService", children: [{ id: "sv", name: "Server", path: "src/server", children: [] }] },
				],
			},
		};
		await put("roswaal.json", JSON.stringify({ schemaVersion: 1 }));
		await put(".roswaal/scripts/Orchard.nodemap", serialiseMap(map));
		// A package reached through its thunk, and itself a Rojo project.
		await put("Packages/Flux.lua", 'return require(script.Parent._Index["someone_flux@0.2.0"]["flux"])\n');
		await put("Packages/_Index/someone_flux@0.2.0/flux/default.project.json", '{ "name": "flux", "tree": { "$path": "src" } }');
		await put("Packages/_Index/someone_flux@0.2.0/flux/src/init.luau", "local Flux = {}\n--- Makes state.\nfunction Flux.state(v) return v end\nreturn Flux\n");
		// One vendored in the thunk's place.
		await put("Packages/Signal.lua", "-- return require(script.Parent._Index[\"x_signal@1.0.0\"][\"signal\"])\nlocal Signal = {}\nfunction Signal.new() end\nreturn Signal\n");
		await put("src/shared/Fruit.luau", "local Fruit = {}\n-- Picks one.\nfunction Fruit.pick() end\nreturn Fruit\n");
		await put("src/server/Helpers.luau", "return { help = function() end }\n");
		await put("src/server/main.server.luau", [
			'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
			"local Flux = require(ReplicatedStorage.Packages.Flux)",
			"local Signal = require(ReplicatedStorage.Packages.Signal)",
			"local Fruit = require(ReplicatedStorage.Shared.Fruit)",
			"local Helpers = require(script.Parent.Helpers)",
			'local Same = require("./Helpers")',
			"print(Flux.state(1), Fruit.pick())",
		].join("\n"));
		return openProject(root);
	}

	it("reaches each module and what it gives back", async () => {
		const found = await modulesRequiredBy(await project(), "src/server/main.server.luau");
		expect(found.map((m) => [m.name, m.file, m.members.map((x) => x.name).join(",")])).toEqual([
			["Flux", "Packages/_Index/someone_flux@0.2.0/flux/src/init.luau", "state"],
			["Signal", "Packages/Signal.lua", "new"],
			["Fruit", "src/shared/Fruit.luau", "pick"],
			["Helpers", "src/server/Helpers.luau", "help"],
			["Same", "src/server/Helpers.luau", "help"],
		]);
		// A package's instance path leaves out the src/ its project file walks through.
		expect(found[0].path).toEqual(["ReplicatedStorage", "Packages", "_Index", "someone_flux@0.2.0", "flux"]);
	});

	it("is answered on both hosts' route, and hovers with the module's members", async () => {
		await project();
		const session = new ApiSession({});
		await session.openAt(root);
		const { modules } = (await session.handle("POST", "/luau/modules", { body: { path: "src/server/main.server.luau" } })) as { modules: { name: string; members: never[] }[] };
		const members = new Map(modules.map((m) => [m.name, m.members]));
		const src = "local Flux = require(ReplicatedStorage.Packages.Flux)\nprint(Flux.state(1))";
		expect(hoverAt(src, src.lastIndexOf("state") + 1, true, members)).toMatchObject({ code: "Flux.state: (v) -> ()", doc: { text: "Makes state." } });
		const info = new Map(modules.map((m) => [m.name, m as never]));
		expect(hoverAt(src, src.indexOf("Flux") + 1, true, members, info)).toMatchObject({ code: "Flux: module", role: "module · ReplicatedStorage.Packages._Index.someone_flux@0.2.0.flux" });
	});
});
