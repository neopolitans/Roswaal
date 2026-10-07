/**
 * Requiring a module by where it sits, and declaring the services a script
 * reaches -- both since 0.152.0, both Roblox's.
 *
 * Before 0.152.0 the Modules list took only a require string, so the way most
 * Roblox code requires a module, `require(ReplicatedStorage.Shared.Greeter)`,
 * needed a Require Module node instead; and a service was hoisted only when a
 * node asked for it, so there was no saying "these, at the top, in this order".
 */

import { describe, expect, it } from "vitest";
import { requiredModules } from "../src/app/projectTypes.js";
import { compile, serialiseScript } from "../src/core/compiler/index.js";
import {
	checkSpecifier,
	instanceSpecifier,
	parseInstancePath,
	renderInstancePath,
} from "../src/core/modules.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript, ScriptModule } from "../src/core/schema.js";
import { SCRIPT_CALL } from "../src/core/scriptCalls.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

/** A Roblox script whose one step is this Code Block. */
function script(
	patch: Partial<NodeScript> = {},
	code = "print(1)",
	target: "roblox" | "lune" = "roblox",
): NodeScript {
	const b = new Builder();
	const start = b.node("script.begin");
	const custom = b.node("code.custom");
	b.lit(custom, "code", { t: "raw", v: code });
	b.link(start, "then", custom, "in");
	return b.build({ target, ...patch });
}

const module = (specifier: string, name = "Greeter"): ScriptModule => ({
	id: `m-${name}`,
	name,
	specifier,
});

const warnings = (out: ReturnType<typeof compile>) =>
	out.diagnostics.filter((d) => d.severity === "warning").map((d) => d.message);
const errors = (out: ReturnType<typeof compile>) =>
	out.diagnostics.filter((d) => d.severity === "error").map((d) => d.message);

describe("reading a require as a place in the DataModel", () => {
	const steps = (text: string) => {
		const parsed = parseInstancePath(text);
		return parsed && "path" in parsed ? parsed.path : parsed;
	};

	it("starts from the service, however it is reached", () => {
		const expected = {
			root: "ReplicatedStorage",
			steps: [
				{ name: "Shared", wait: false },
				{ name: "Greeter", wait: false },
			],
		};
		expect(steps("ReplicatedStorage.Shared.Greeter")).toEqual(expected);
		expect(steps("game.ReplicatedStorage.Shared.Greeter")).toEqual(expected);
		expect(steps('game:GetService("ReplicatedStorage").Shared.Greeter')).toEqual(expected);
		expect(steps('game.ReplicatedStorage["Shared"].Greeter')).toEqual(expected);
	});

	it("keeps script, workspace and WaitForChild as written", () => {
		expect(steps("script.Parent.Util")).toEqual({
			root: "script",
			steps: [
				{ name: "Parent", wait: false },
				{ name: "Util", wait: false },
			],
		});
		expect(steps('ReplicatedStorage:WaitForChild("Shared").Greeter')).toHaveProperty("steps.0", {
			name: "Shared",
			wait: true,
		});
	});

	it("leaves strings to be strings", () => {
		for (const text of ["@lune/fs", "./util", "../shared/config", "@self/Child", "Greeter"])
			expect(parseInstancePath(text)).toBeNull();
	});

	/** A field in the panel is not somewhere to hide a call. */
	it("refuses anything a path does not have in it", () => {
		for (const text of [
			"ReplicatedStorage.Shared:Destroy()",
			"ReplicatedStorage.Shared.Greeter .. x",
			'ReplicatedStorage:FindFirstChild("Shared")',
			"ReplicatedStorage",
			"game",
		]) {
			expect(parseInstancePath(text), text).toHaveProperty("problem");
			expect(checkSpecifier(text, "roblox")?.severity, text).toBe("error");
		}
	});

	it("is Roblox's: Lune has no DataModel", () => {
		expect(checkSpecifier("ReplicatedStorage.Shared.Greeter", "roblox")).toBeNull();
		expect(checkSpecifier("ReplicatedStorage.Shared.Greeter", "lune")?.message).toMatch(
			/Lune has none/,
		);
	});

	it("brackets a name Luau will not take after a dot", () => {
		expect(
			renderInstancePath("Workspace", [
				{ name: "Spawn Pad", wait: false },
				{ name: "end", wait: false },
				{ name: "Door", wait: true },
			]),
		).toBe('Workspace["Spawn Pad"]["end"]:WaitForChild("Door")');
		expect(instanceSpecifier(["ReplicatedStorage", "Shared", "Greeter"])).toBe(
			"ReplicatedStorage.Shared.Greeter",
		);
	});
});

describe("a module required by where it sits", () => {
	it("is required through the hoisted service", () => {
		const out = compile(
			script({ modules: [module("game.ReplicatedStorage.Shared.Greeter")] }, "Greeter.greet()"),
			registry,
		);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			[
				'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
				"",
				"local Greeter = require(ReplicatedStorage.Shared.Greeter)",
				"",
				"Greeter.greet()",
			].join("\n"),
		);
	});

	it("writes script and WaitForChild as they were written", () => {
		const out = compile(
			script({
				modules: [
					module("script.Parent.Util", "Util"),
					module('ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Greeter")'),
				],
			}),
			registry,
		);
		expect(body(out.code)).toContain("local Util = require(script.Parent.Util)");
		expect(body(out.code)).toContain(
			'local Greeter = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Greeter"))',
		);
	});

	it("is named after the ModuleScript when nobody named it", () => {
		const out = compile(
			script({ modules: [module("ReplicatedStorage.Shared.Greeter", "")] }),
			registry,
		);
		expect(body(out.code)).toContain("local Greeter = require(");
	});
});

describe("declared services", () => {
	it("come first, in the order they were declared", () => {
		const out = compile(
			script(
				{
					services: ["Players", "ReplicatedStorage"],
					modules: [module("ReplicatedStorage.Shared.Greeter")],
				},
				"Greeter.greet(Players.LocalPlayer)",
			),
			registry,
		);
		expect(errors(out)).toEqual([]);
		expect(warnings(out)).toEqual([]);
		expect(body(out.code).split("\n").slice(0, 4)).toEqual([
			'local Players = game:GetService("Players")',
			'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
			"",
			"local Greeter = require(ReplicatedStorage.Shared.Greeter)",
		]);
	});

	it("are the local a Get Service for the same one reads", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const get = b.node("roblox.getService");
		b.lit(get, "service", { t: "string", v: "Players" });
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		b.link(get, "service", print, "value");
		const out = compile(b.build({ services: ["Players"] }), registry);
		expect(body(out.code).match(/GetService\("Players"\)/g)).toHaveLength(1);
		expect(warnings(out)).toEqual([]);
	});

	it("say so when nothing uses one", () => {
		const out = compile(script({ services: ["Players", "Lighting"] }, "print(Players)"), registry);
		expect(warnings(out)).toEqual([
			"Lighting is declared in Services and nothing uses it. Use it, or remove it from the Variables panel.",
		]);
		// Still written: what was declared is what the file says.
		expect(body(out.code)).toContain('local Lighting = game:GetService("Lighting")');
	});

	it("are not used by a field, a method or a string of the same name", () => {
		const out = compile(
			script({ services: ["Lighting"] }, 'print(game.Lighting, x:Lighting(), "Lighting")'),
			registry,
		);
		expect(warnings(out)).toHaveLength(1);
	});

	it("are an error on Lune", () => {
		const out = compile(script({ services: ["Players"] }, "print(1)", "lune"), registry);
		expect(errors(out).join(" ")).toMatch(/services are Roblox's/);
		expect(body(out.code)).not.toContain("GetService");
	});

	it("are saved in their order, and only when there are some", () => {
		const saved = (patch: Partial<NodeScript>) => JSON.parse(serialiseScript(script(patch)));
		expect(saved({ services: ["Players", "Lighting"] }).services).toEqual(["Players", "Lighting"]);
		expect(saved({}).services).toBeUndefined();
		expect(saved({ services: [] }).services).toBeUndefined();
	});

	/** A graph that declares none is not rewritten because services can now be declared. */
	it("leave the hash of a graph without them as it was", () => {
		const hash = (s: NodeScript) => /roswaal-source: (\w+)/.exec(compile(s, registry).code)?.[1];
		expect(hash(script({ services: [] }))).toBe(hash(script()));
		expect(hash(script({ services: ["Players"] }))).not.toBe(hash(script()));
	});
});

describe("calling a function of a module declared by where it sits", () => {
	const greeter = module("ReplicatedStorage.Shared.Greeter");
	const calling = (modules: ScriptModule[]) => {
		const b = new Builder("Main");
		const begin = b.node("script.begin");
		const call = b.node(SCRIPT_CALL, {
			config: {
				module: greeter.id,
				moduleName: "Greeter",
				name: "greet",
				params: [{ name: "who", type: "string" }],
				returns: [],
			},
		});
		b.lit(call, "a0", { t: "string", v: "world" });
		b.link(begin, "then", call, "in");
		return compile(b.build({ modules }), registry);
	};

	it("calls through the declaration's own require", () => {
		const out = calling([greeter]);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			[
				'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
				"",
				"local Greeter = require(ReplicatedStorage.Shared.Greeter)",
				"",
				'Greeter.greet("world")',
			].join("\n"),
		);
	});

	it("is an error once the declaration has gone", () => {
		expect(errors(calling([])).join(" ")).toMatch(/no longer in the graph or declared/);
	});

	/** Offered from the node search exactly as a Require Module node's are. */
	it("offers the module's functions under the name it is declared as", () => {
		const exported = [
			{
				graph: "Greeter",
				name: "greet",
				params: [{ name: "who", type: "string" }],
				returns: [],
				location: { root: "ReplicatedStorage", path: "Shared.Greeter", isModule: true },
			},
		];
		const required = (modules: ScriptModule[]) =>
			requiredModules(new Builder().build({ modules }), exported).map((m) => [m.node, m.local]);
		expect(required([module("game.ReplicatedStorage.Shared.Greeter", "")])).toEqual([
			["m-", "Greeter"],
		]);
		expect(required([module("ReplicatedStorage.Shared.Greeter", "Hello")])).toEqual([
			["m-Hello", "Hello"],
		]);
		expect(required([module("ReplicatedStorage.Shared.Other")])).toEqual([]);
	});
});
