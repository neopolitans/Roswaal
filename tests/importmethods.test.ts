/**
 * Method calls an import makes nodes of (0.185.0).
 *
 * `part:Destroy()` is Destroy, `remote:FireAllClients(1)` is Fire All
 * Clients and `RunService:IsServer()` a Service Function, but only where the
 * importer knows what the method is called on: a service, a type written
 * beside a name, `workspace`, or what another node gives back. A method on
 * anything else stays Call Method, as a table may have a method of any name.
 * Every one compiles back to the line it was.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { graphNameOf, importLuau } from "../src/core/import/fromLuau.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";

const registry = createRegistry();

function imported(src: string): NodeScript {
	const { name, scriptClass } = graphNameOf("Test.server.luau");
	const result = importLuau(src, { name, scriptClass, target: "roblox", idPrefix: "t" });
	if (!result.ok) throw new Error(result.error);
	return result.script;
}

function body(script: NodeScript): string {
	return compile(script, registry).code.replace(/^[\s\S]*?-- roswaal-output: \w+\n\n/, "");
}

const defs = (script: NodeScript) => script.nodes.map((n) => n.def);

/** Imports `src`, checks it compiles back as written, and hands back the graph. */
function roundTrip(lines: string[]): NodeScript {
	const src = `${lines.join("\n")}\n`;
	const script = imported(src);
	expect(body(script)).toBe(src);
	return script;
}

describe("a method on an object of a known type", () => {
	it("is the library's node, for a type written beside the name", () => {
		const script = roundTrip([
			"local function clear(part: BasePart)",
			"\tpart:Destroy()",
			"end",
			"",
			"clear(workspace.Baseplate)",
		]);
		expect(defs(script)).toContain("roblox.destroy");
		expect(defs(script)).not.toContain("call.method");
	});

	it("is the library's node, for what another node gave back", () => {
		const script = roundTrip([
			'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
			"",
			'local remote = ReplicatedStorage:WaitForChild("Ping")',
			"remote:FireAllClients(1)",
		]);
		expect(defs(script)).toEqual(
			expect.arrayContaining(["roblox.waitForChild", "remote.fireAllClients"]),
		);
	});

	it("reads workspace as an Instance node", () => {
		const script = roundTrip(['local part = workspace:FindFirstChild("Part")', "print(part)"]);
		expect(defs(script)).toEqual(
			expect.arrayContaining(["roblox.instancePath", "roblox.findFirstChild"]),
		);
	});

	it("knows a service named otherwise by the GetService it came from", () => {
		const script = roundTrip([
			'local RS = game:GetService("ReplicatedStorage")',
			"",
			'local folder = RS:WaitForChild("Shared")',
			"print(folder)",
		]);
		expect(defs(script)).toContain("roblox.waitForChild");
	});
});

describe("a method on a service", () => {
	it("is a Service Function for one the catalogue has", () => {
		const script = roundTrip([
			'local Debris = game:GetService("Debris")',
			'local RunService = game:GetService("RunService")',
			"",
			"if RunService:IsServer() then",
			"\tDebris:AddItem(workspace.Baseplate, 5)",
			"end",
		]);
		const calls = script.nodes.filter((n) => n.def.startsWith("roblox.service"));
		expect(calls.map((n) => [n.def, n.config?.method])).toEqual(
			expect.arrayContaining([
				["roblox.serviceValue", "IsServer"],
				["roblox.serviceCall", "AddItem"],
			]),
		);
	});

	it("takes an enum argument by its member's name", () => {
		const script = roundTrip([
			'local UserInputService = game:GetService("UserInputService")',
			"",
			"print(UserInputService:IsKeyDown(Enum.KeyCode.W))",
		]);
		const call = script.nodes.find((n) => n.def === "roblox.serviceValue");
		expect(call?.literals?.a0).toEqual({ t: "string", v: "W" });
	});

	it("stays as code with an enum argument written another way", () => {
		const script = roundTrip([
			'local UserInputService = game:GetService("UserInputService")',
			"",
			"local key = Enum.KeyCode.W",
			"print(UserInputService:IsKeyDown(key))",
		]);
		expect(defs(script)).not.toContain("roblox.serviceValue");
	});
});

describe("a method on an object of an unknown type", () => {
	it("stays Call Method", () => {
		const script = roundTrip(["local thing = {}", "thing:Destroy()"]);
		expect(defs(script)).toContain("call.method");
		expect(defs(script)).not.toContain("roblox.destroy");
	});
});

describe("a method's line as the file wrote it", () => {
	it("gains no cast for a class it names", () => {
		roundTrip([
			"local function heal(character: Model)",
			'\tlocal humanoid = character:FindFirstChildOfClass("Humanoid")',
			"\tprint(humanoid)",
			"end",
		]);
	});

	it("gains no brackets round a call it is made on", () => {
		roundTrip([
			'for _, mod in (script.Parent :: Instance):WaitForChild("Weapons"):GetChildren() do',
			"\tprint(mod)",
			"end",
		]);
	});
});
