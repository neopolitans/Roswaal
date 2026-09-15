/**
 * Calling a method on a service.
 *
 * The promise: whatever the catalogue says a service can do, a graph can do,
 * and the line it writes is the line somebody would have written by hand —
 * including the `local RunService = game:GetService("RunService")` at the top,
 * shared with every other node that asked for the same service.
 */

import { describe, expect, it } from "vitest";

import { body, Builder } from "./helpers.js";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import {
	CALL_OPTIONS, SERVICE_CALL, SERVICE_VALUE, SERVICES_WITH_METHODS, argumentPins, callDetail,
	methodsOfService, nameItems, serviceFromSource, serviceMenuItems, serviceMethod, servicePins,
	splitCall,
} from "../src/core/serviceCalls.js";

const registry = createRegistry();

/** A script that asks a service something and prints the answer. */
function asking(service: string, method: string, literals: Record<string, string> = {}) {
	const b = new Builder();
	const start = b.node("script.begin", { id: "start" });
	const ask = b.node(SERVICE_VALUE, { id: "ask", config: { service, method } });
	const print = b.node("debug.print", { id: "print" });
	for (const [pin, value] of Object.entries(literals)) b.lit(ask, pin, { t: "string", v: value });
	b.link(start, "then", print, "in");
	b.link(ask, "result", print, "value");
	return b.build();
}

describe("the catalogue", () => {
	it("has the method everybody reaches for first", () => {
		const isServer = serviceMethod("RunService", "IsServer");
		expect(isServer).toBeDefined();
		expect(isServer?.returns).toBe("boolean");
		expect(isServer?.params).toEqual([]);
		expect(isServer?.pure).toBe(true);
	});

	/** Workspace's Raycast is declared on WorldRoot, and is why the walk goes up. */
	it("includes methods a service inherits below Instance", () => {
		const raycast = serviceMethod("Workspace", "Raycast");
		expect(raycast?.from).toBe("WorldRoot");
		expect(raycast?.params.map((p) => p.type)).toEqual(["Vector3", "Vector3", "RaycastParams"]);
	});

	/**
	 * `FindFirstChild` and friends have nodes of their own. Offering them a
	 * second time here would be the same call in two shapes.
	 */
	it("stops before Instance's own methods", () => {
		for (const service of SERVICES_WITH_METHODS) {
			const names = methodsOfService(service).map((m) => m.name);
			expect(names).not.toContain("FindFirstChild");
			expect(names).not.toContain("Destroy");
		}
	});

	it("keeps nothing a game script cannot call", () => {
		for (const service of SERVICES_WITH_METHODS) {
			for (const method of methodsOfService(service)) {
				expect(method.name).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
				expect(method.summary).not.toBe("");
			}
		}
	});

	/** A yielding method is an instruction, never an expression the menu offers. */
	it("never marks a yielding method read-only", () => {
		for (const service of SERVICES_WITH_METHODS) {
			for (const method of methodsOfService(service)) {
				if (method.yields) expect(method.pure).toBeUndefined();
			}
		}
	});

	it("sends read-only methods to the value node and the rest to the call node", () => {
		const items = serviceMenuItems();
		const isServer = items.find((i) => i.service === "RunService" && i.method.name === "IsServer");
		const addItem = items.find((i) => i.service === "Debris" && i.method.name === "AddItem");
		expect(isServer?.defId).toBe(SERVICE_VALUE);
		expect(addItem?.defId).toBe(SERVICE_CALL);
		expect(addItem?.config).toEqual({ service: "Debris", method: "AddItem" });
	});
});

describe("a Service Function node's pins", () => {
	it("are the method's arguments, named and typed", () => {
		const { inputs, outputs } = servicePins({ service: "Debris", method: "AddItem" }, false);
		expect(inputs.map((p) => p.id)).toEqual(["in", "service", "a0", "a1"]);
		expect(inputs[2].type).toBe("Instance");
		expect(inputs[3].type).toBe("number");
		expect(inputs[3].optional).toBe(true);
		// AddItem returns nothing, so there is no result pin to wire nil out of.
		expect(outputs.map((p) => p.id)).toEqual(["then"]);
	});

	it("drop the execution pins on the value node", () => {
		const { inputs, outputs } = servicePins({ service: "RunService", method: "IsServer" }, true);
		// The receiver stays: dragging a service out and asking it for a method
		// needs somewhere for that wire to land, pure or not.
		expect(inputs.map((p) => p.id)).toEqual(["service"]);
		expect(inputs[0].name).toBe("RunService");
		expect(outputs.map((p) => p.id)).toEqual(["result"]);
		expect(outputs[0].type).toBe("boolean");
	});

	/** The list is a dropdown, not a gate — see `robloxMembers.ts`. */
	it("fall back to a typed argument count for a method nobody has heard of", () => {
		const { inputs, outputs } = servicePins(
			{ service: "RunService", method: "SomethingShippedLastWeek", args: 2 }, false,
		);
		expect(inputs.map((p) => p.id)).toEqual(["in", "service", "a0", "a1"]);
		expect(outputs.map((p) => p.id)).toEqual(["then", "result"]);
	});

	/** The picker lists calls, not methods: the service is half of the name. */
	it("are listed for the picker as one name per call", () => {
		expect(CALL_OPTIONS).toContain("RunService:IsServer");
		expect(CALL_OPTIONS).toContain("Players:GetPlayers");
		expect(splitCall("RunService:IsServer")).toEqual({
			service: "RunService", method: "IsServer",
		});
		expect(splitCall("RunService")).toBeUndefined();
		expect(callDetail("RunService:IsServer")).toContain("boolean");
		expect(callDetail("Debris:AddItem")).toContain("item, lifetime");
	});

	it("describe an enum argument as the enum it belongs to", () => {
		const pins = argumentPins(serviceMethod("UserInputService", "IsKeyDown")!);
		expect(pins[0].type).toBe("string");
		expect(pins[0].description).toContain("KeyCode");
	});
});

describe("what it compiles to", () => {
	it("calls the method on a hoisted service local", () => {
		const out = compile(asking("RunService", "IsServer"), registry, {});
		expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(out.code).toContain('local RunService = game:GetService("RunService")');
		expect(body(out.code)).toContain("print(RunService:IsServer())");
	});

	/** One local, however many nodes ask — the rule Get Service already had. */
	it("shares the local with Get Service", () => {
		const b = new Builder();
		const start = b.node("script.begin", { id: "start" });
		const get = b.node("roblox.getService", { id: "get" });
		b.lit(get, "service", { t: "string", v: "RunService" });
		const ask = b.node(SERVICE_VALUE, {
			id: "ask", config: { service: "RunService", method: "IsStudio" },
		});
		const print = b.node("debug.print", { id: "print" });
		const second = b.node("debug.print", { id: "second" });
		b.link(start, "then", print, "in");
		b.link(print, "then", second, "in");
		b.link(ask, "result", print, "value");
		b.link(get, "service", second, "value");

		const code = compile(b.build(), registry, {}).code;
		expect(code.match(/game:GetService\("RunService"\)/g)).toHaveLength(1);
	});

	it("passes the arguments in order", () => {
		const b = new Builder();
		const start = b.node("script.begin", { id: "start" });
		const part = b.node("roblox.instanceNew", { id: "part" });
		b.lit(part, "className", { t: "string", v: "Part" });
		const add = b.node(SERVICE_CALL, {
			id: "add", config: { service: "Debris", method: "AddItem" },
		});
		b.lit(add, "a1", { t: "number", v: 5 });
		b.link(start, "then", part, "in");
		b.link(part, "then", add, "in");
		b.link(part, "result", add, "a0");

		const out = compile(b.build(), registry, {});
		expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(body(out.code)).toContain("Debris:AddItem(");
		expect(body(out.code)).toMatch(/Debris:AddItem\(\w+, 5\)/);
	});

	/** An untouched optional argument is not passed as nil; it is not passed. */
	it("leaves an optional argument out when nothing set it", () => {
		const b = new Builder();
		const start = b.node("script.begin", { id: "start" });
		const part = b.node("roblox.instanceNew", { id: "part" });
		b.lit(part, "className", { t: "string", v: "Part" });
		const add = b.node(SERVICE_CALL, {
			id: "add", config: { service: "Debris", method: "AddItem" },
		});
		b.link(start, "then", part, "in");
		b.link(part, "then", add, "in");
		b.link(part, "result", add, "a0");

		expect(body(compile(b.build(), registry, {}).code)).toMatch(/Debris:AddItem\(\w+\)$/m);
	});

	it("writes an enum argument out in full", () => {
		const script = asking("UserInputService", "IsKeyDown", { a0: "E" });
		const out = compile(script, registry, {});
		expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(body(out.code)).toContain("UserInputService:IsKeyDown(Enum.KeyCode.E)");
	});

	it("binds the result to a local when the impure node's answer is read", () => {
		const b = new Builder();
		const start = b.node("script.begin", { id: "start" });
		const ask = b.node(SERVICE_CALL, {
			id: "ask", config: { service: "Players", method: "GetPlayers" }, label: "players",
		});
		const print = b.node("debug.print", { id: "print" });
		b.link(start, "then", ask, "in");
		b.link(ask, "then", print, "in");
		b.link(ask, "result", print, "value");

		expect(body(compile(b.build(), registry, {}).code)).toContain(
			"local players = Players:GetPlayers()",
		);
	});

	it("says so when no call has been chosen", () => {
		const b = new Builder();
		const start = b.node("script.begin", { id: "start" });
		const ask = b.node(SERVICE_CALL, { id: "ask", config: { service: "RunService" } });
		b.link(start, "then", ask, "in");

		const errors = compile(b.build(), registry, {}).diagnostics.filter(
			(d) => d.severity === "error",
		);
		expect(errors.map((d) => d.message).join(" ")).toContain("no call chosen");
	});

	/** A method the build has never seen still compiles: the list is a suggestion. */
	it("calls a method that is not in the catalogue", () => {
		const script = asking("RunService", "SomethingShippedLastWeek");
		const out = compile(script, registry, {});
		expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(body(out.code)).toContain("RunService:SomethingShippedLastWeek()");
	});
});

describe("dragging a service out", () => {
	/**
	 * The gesture this node should have been found by: pull a wire off Get
	 * Service and ask what that service can do.
	 */
	it("reads the service off a Get Service node", () => {
		const node = { def: "roblox.getService", literals: { service: { t: "string", v: "RunService" } } };
		expect(serviceFromSource(node as never, "Instance")).toBe("RunService");
	});

	/** An untouched Get Service has no literal, and its pin declares the default. */
	it("falls back to the service the pin defaults to", () => {
		expect(serviceFromSource({ def: "roblox.getService" }, "Instance")).toBe("Players");
	});

	/** A pin typed as the service is the general answer, and needs no node. */
	it("reads a pin typed as a service class", () => {
		expect(serviceFromSource(undefined, "Workspace")).toBe("Workspace");
	});

	it("says nothing for a pin that carries no service", () => {
		expect(serviceFromSource({ def: "roblox.instanceNew" }, "Instance")).toBeUndefined();
		expect(serviceFromSource(undefined, "number")).toBeUndefined();
		expect(serviceFromSource(undefined, undefined)).toBeUndefined();
	});
});

describe("a service wired into the receiver", () => {
	/** The wire is the object the call is made on, so no local is hoisted. */
	it("is called on instead of the hoisted local", () => {
		const b = new Builder();
		const start = b.node("script.begin", { id: "start" });
		const get = b.node("roblox.getService", { id: "get" });
		b.lit(get, "service", { t: "string", v: "Debris" });
		const add = b.node(SERVICE_CALL, {
			id: "add", config: { service: "Debris", method: "AddItem" },
		});
		const part = b.node("roblox.instanceNew", { id: "part" });
		b.lit(part, "className", { t: "string", v: "Part" });
		b.link(start, "then", part, "in");
		b.link(part, "then", add, "in");
		b.link(get, "service", add, "service");
		b.link(part, "result", add, "a0");

		const out = compile(b.build(), registry, {});
		expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		// Get Service still hoists its own local, and the call is made on it.
		expect(out.code).toContain('local Debris = game:GetService("Debris")');
		expect(body(out.code)).toMatch(/Debris:AddItem\(\w+\)/);
	});

	/**
	 * Wiring something that is plainly not the service is worth saying. Only a
	 * pin that names a class: most instance pins are typed `Instance`, which
	 * claims nothing and is refused nothing.
	 */
	it("warns when the wire is a class the method does not belong to", () => {
		const b = new Builder();
		const start = b.node("script.begin", { id: "start" });
		const humanoid = b.variable("target", "Humanoid", { t: "nil" });
		const get = b.node("variable.get", {
			id: "get", config: { variable: humanoid, name: "target", type: "Humanoid" },
		});
		const part = b.node("roblox.instanceNew", { id: "part" });
		b.lit(part, "className", { t: "string", v: "Part" });
		const add = b.node(SERVICE_CALL, {
			id: "add", config: { service: "Debris", method: "AddItem" },
		});
		b.link(start, "then", part, "in");
		b.link(part, "then", add, "in");
		b.link(get, "value", add, "service");
		b.link(part, "result", add, "a0");

		const warnings = compile(b.build(), registry, {}).diagnostics.filter(
			(d) => d.severity === "warning",
		);
		expect(warnings.map((d) => d.message).join(" ")).toContain("Debris method");
	});
});

describe("a service or a class by its name", () => {
	const items = nameItems();
	const named = (name: string) => items.filter((item) => item.name === name);

	it("offers a service as Get Service, filled in", () => {
		expect(named("ReplicatedStorage")).toEqual([{
			name: "ReplicatedStorage",
			defId: "roblox.getService",
			literals: { service: { t: "string", v: "ReplicatedStorage" } },
			summary: "Get Service — ReplicatedStorage, as a local at the top of the file.",
			category: "Engine",
		}]);
	});

	it("offers a class as New Instance, filled in", () => {
		expect(named("ProximityPrompt")).toEqual([{
			name: "ProximityPrompt",
			defId: "roblox.instanceNew",
			literals: { className: { t: "string", v: "ProximityPrompt" } },
			summary: 'New Instance — Instance.new("ProximityPrompt").',
			category: "Instances",
		}]);
	});

	/** `Instance.new("Players")` is a runtime error, so only one of the two. */
	it("gives a service no New Instance entry", () => {
		expect(named("Players").map((item) => item.defId)).toEqual(["roblox.getService"]);
		expect(named("Workspace").map((item) => item.defId)).toEqual(["roblox.getService"]);
	});

	it("names every entry after the thing itself, and nothing twice", () => {
		const keys = items.map((item) => `${item.defId}:${item.name}`);
		expect(new Set(keys).size).toBe(keys.length);
		for (const item of items) expect(item.name).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
	});

	/** Both of these are pin literals rather than config — see `NameItem`. */
	it("fills a pin the node actually has", () => {
		for (const item of items) {
			const def = registry.get(item.defId)!;
			for (const pin of Object.keys(item.literals)) {
				expect(def.inputs.some((p) => p.id === pin), `${item.defId}/${pin}`).toBe(true);
			}
		}
	});
});
