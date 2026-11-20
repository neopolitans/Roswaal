/**
 * The Variables panel in script order: services with the modules required
 * through them, the module's own table, how often each thing is used, a
 * local's type from its value, and a function's signature.
 */

import { describe, expect, it } from "vitest";

import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
import { emptyScript, type GraphNode, type NodeScript } from "../src/core/schema.js";
import {
	codeMentions,
	functionSignature,
	localTypeOf,
	moduleTableVariable,
	servicesAndModules,
	useCounts,
	usesOf,
} from "../src/core/variablesOutline.js";

const registry = createRegistry(BUILTIN_NODES);
const node = (id: string, def: string, extra: Partial<GraphNode> = {}): GraphNode => ({
	id,
	def,
	x: 0,
	y: 0,
	...extra,
});
const script = (patch: Partial<NodeScript>): NodeScript => ({
	...emptyScript("Main", "main"),
	...patch,
});

describe("services and modules", () => {
	it("lists declared services first, then ones only used, with the modules required through each", () => {
		const outline = servicesAndModules(
			script({
				target: "roblox",
				services: ["Players"],
				nodes: [
					node("a", "roblox.getService", {
						literals: { service: { t: "string", v: "RunService" } },
					}),
					node("b", "roblox.getService", { literals: { service: { t: "string", v: "Players" } } }),
				],
				modules: [
					{ id: "g", name: "Greeter", specifier: "ReplicatedStorage.Shared.Greeter" },
					{ id: "c", name: "Config", specifier: "script.Parent.Config" },
					{ id: "s", name: "Signal", specifier: "@game/ReplicatedStorage/Signal" },
				],
			}),
		);
		expect(
			outline.services.map((s) => [s.name, s.declared, s.uses, s.modules.map((m) => m.name)]),
		).toEqual([
			["Players", true, 1, []],
			["RunService", false, 1, []],
			["ReplicatedStorage", false, 0, ["Greeter"]],
		]);
		expect(outline.throughScript.map((m) => m.name)).toEqual(["Config"]);
		expect(outline.others.map((m) => m.name)).toEqual(["Signal"]);
	});
});

describe("the module's own table", () => {
	it("is the variable wired into Module Exports", () => {
		const s = script({
			variables: [{ id: "t", name: "Occupancy", type: "table", default: { t: "nil" } }],
			nodes: [
				node("get", "variable.get", { config: { variable: "t" } }),
				node("ex", "module.exports"),
			],
			links: [{ id: "l", from: { node: "get", pin: "value" }, to: { node: "ex", pin: "e0" } }],
		});
		expect(moduleTableVariable(s)).toBe("t");
		expect(moduleTableVariable(script({}))).toBeUndefined();
	});
});

describe("uses", () => {
	it("counts what refers to each thing, and finds it", () => {
		const s = script({
			nodes: [
				node("decl", "local.declare"),
				node("g1", "local.get", { config: { local: "decl" } }),
				node("g2", "local.get", { config: { local: "decl" } }),
				node("v", "variable.set", { config: { variable: "x" } }),
				node("rs", "roblox.getService", {
					literals: { service: { t: "string", v: "RunService" } },
				}),
			],
		});
		const counts = useCounts(s);
		expect(counts.get("decl")).toBe(2);
		expect(counts.get("x")).toBe(1);
		expect(usesOf(s, "decl")).toEqual(["g1", "g2"]);
		expect(usesOf(s, "RunService", true)).toEqual(["rs"]);
	});
});

describe("a local's type", () => {
	it("is what it declares, or what its value is", () => {
		const typed = node("a", "local.declare", { config: { type: "Part" } });
		const string = node("b", "local.declare", {
			literals: { value: { t: "string", v: "TankExit" } },
		});
		const s = script({ nodes: [typed, string] });
		expect(localTypeOf(s, registry, typed)).toBe("Part");
		expect(localTypeOf(s, registry, string)).toBe("string");
	});

	it("is the type of what is wired in", () => {
		const local = node("l", "local.declare");
		const players = node("p", "roblox.getService", {
			literals: { service: { t: "string", v: "Players" } },
		});
		const s = script({
			nodes: [local, players],
			links: [{ id: "w", from: { node: "p", pin: "service" }, to: { node: "l", pin: "value" } }],
		});
		expect(localTypeOf(s, registry, local)).not.toBe("any");
	});
});

describe("a function's signature", () => {
	it("reads as its parameters and what it returns", () => {
		expect(
			functionSignature({
				params: [{ name: "m", type: "Model" }],
				returns: [{ type: "Instance" }],
			}),
		).toBe("(Model) → Instance");
		expect(functionSignature({ params: [], returns: [] })).toBe("() → ()");
		expect(
			functionSignature({
				params: [{ name: "a", type: "" }],
				returns: [{ type: "boolean" }, { type: "string" }],
			}),
		).toBe("(any) → (boolean, string)");
	});
});

describe("what Code Blocks read", () => {
	it("counts a block that names it as a whole word, not as a field or part of a name", () => {
		const code = (id: string, v: string) =>
			node(id, "code.custom", { literals: { code: { t: "raw", v } } });
		const s = script({
			nodes: [
				code("a", "local n = #Players:GetPlayers()"),
				code("b", "print(player.Players, MyPlayers)"),
				code("c", "Players.PlayerAdded:Connect(f)"),
			],
		});
		expect(codeMentions(s, "Players")).toEqual(["a", "c"]);
	});

	it("reads an Expression node as well as a Code Block", () => {
		const s = script({
			nodes: [
				node("e", "value.expression", {
					literals: { code: { t: "raw", v: "Players.PlayerAdded" } },
				}),
			],
		});
		expect(codeMentions(s, "Players")).toEqual(["e"]);
	});
});
