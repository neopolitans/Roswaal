import { describe, expect, it } from "vitest";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry, literalOnlyPins } from "../src/core/nodes/index.js";
import { migrateScript } from "../src/core/migrate.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

function errors(result: { diagnostics: { severity: string; message: string }[] }): string[] {
	return result.diagnostics.filter((d) => d.severity === "error").map((d) => d.message);
}

describe("client-only nodes", () => {
	function localPlayerGraph(scriptClass: "Script" | "LocalScript" | "ModuleScript") {
		const b = new Builder();
		const start = b.node("script.begin");
		const me = b.node("players.localPlayer");
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		b.link(me, "player", print, "value");
		return b.build({ scriptClass });
	}

	/** It reaches the service itself, through the same hoisting Get Service uses. */
	it("hoists Players without a Get Service node", () => {
		const out = compile(localPlayerGraph("LocalScript"), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			[`local Players = game:GetService("Players")`, "", "print(Players.LocalPlayer)"].join("\n"),
		);
	});

	/**
	 * On the server `Players.LocalPlayer` is nil, and the failure surfaces later
	 * as "attempt to index nil" a long way from the node that caused it. Saying
	 * so at compile time is the whole point of the node knowing it is client-only.
	 */
	it("warns when a client-only node is used in a server Script", () => {
		const out = compile(localPlayerGraph("Script"), registry);
		const warnings = out.diagnostics.filter((d) => d.severity === "warning");
		expect(warnings.map((w) => w.message).join(" ")).toContain("client-only");
		// A warning, not an error: it compiles, it is just wrong at runtime.
		expect(errors(out)).toEqual([]);
	});

	it("says nothing in a LocalScript", () => {
		const out = compile(localPlayerGraph("LocalScript"), registry);
		expect(out.diagnostics.filter((d) => d.severity === "warning")).toEqual([]);
	});

	/** A module cannot know where it will be required, so the wording softens. */
	it("hedges in a ModuleScript rather than accusing it", () => {
		const out = compile(localPlayerGraph("ModuleScript"), registry);
		expect(out.diagnostics.map((d) => d.message).join(" ")).toContain("required from the client");
	});

	it("shares one hoisted Players local with Get Service", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const me = b.node("players.localPlayer");
		const service = b.node("roblox.getService");
		b.lit(service, "service", { t: "string", v: "Players" });
		const a = b.node("debug.print");
		const c = b.node("debug.print");
		b.link(start, "then", a, "in");
		b.link(a, "then", c, "in");
		b.link(me, "player", a, "value");
		b.link(service, "service", c, "value");

		const out = compile(b.build({ scriptClass: "LocalScript" }), registry);
		expect(body(out.code).match(/GetService/g)).toHaveLength(1);
	});
});

describe("signals and networking", () => {
	/** Once is Connect with a different method name and nothing else different. */
	it("emits Once rather than Connect, with the same body", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const signal = b.node("roblox.getEvent");
		b.lit(signal, "event", { t: "string", v: "Touched" });
		const source = b.node("value.expression");
		b.lit(source, "code", { t: "raw", v: "part" });
		const once = b.node("event.once", { config: { params: [] } });
		const print = b.node("debug.print");
		b.lit(print, "value", { t: "string", v: "hit" });
		b.link(source, "result", signal, "instance");
		b.link(start, "then", once, "in");
		b.link(signal, "result", once, "signal");
		b.link(once, "body", print, "in");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			["part.Touched:Once(function()", `\tprint("hit")`, "end)"].join("\n"),
		);
	});

	/**
	 * `$more` exists for exactly this: firing at a player with nothing to say
	 * must not emit `FireClient(player, )`, and firing with a payload must not
	 * lose the comma.
	 */
	it("fires at a player with no payload and no trailing comma", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const remote = b.node("value.expression");
		b.lit(remote, "code", { t: "raw", v: "remote" });
		const player = b.node("value.expression");
		b.lit(player, "code", { t: "raw", v: "player" });
		const fire = b.node("remote.fireClient");
		b.link(start, "then", fire, "in");
		b.link(remote, "result", fire, "remote");
		b.link(player, "result", fire, "player");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe("remote:FireClient(player)");
	});

	it("separates a payload from the player it is sent to", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const remote = b.node("value.expression");
		b.lit(remote, "code", { t: "raw", v: "remote" });
		const player = b.node("value.expression");
		b.lit(player, "code", { t: "raw", v: "player" });
		const fire = b.node("remote.fireClient", { config: { args: 2 } });
		b.lit(fire, "a0", { t: "number", v: 1 });
		b.lit(fire, "a1", { t: "string", v: "go" });
		b.link(start, "then", fire, "in");
		b.link(remote, "result", fire, "remote");
		b.link(player, "result", fire, "player");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(`remote:FireClient(player, 1, "go")`);
	});

	it("fires with no arguments at all", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const remote = b.node("value.expression");
		b.lit(remote, "code", { t: "raw", v: "remote" });
		const fire = b.node("remote.fireServer");
		b.link(start, "then", fire, "in");
		b.link(remote, "result", fire, "remote");

		const out = compile(b.build(), registry);
		expect(body(out.code)).toBe("remote:FireServer()");
	});
});

describe("casts", () => {
	/**
	 * The reason Cast Array exists, in one test: Get Descendants is
	 * `{ Instance }` however much you know about what is in it.
	 */
	it("asserts an element type on a collection", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const model = b.node("roblox.instancePath");
		b.lit(model, "root", { t: "string", v: "Workspace" });
		b.lit(model, "path", { t: "string", v: "Arena" });
		const kids = b.node("instance.getDescendants");
		const cast = b.node("cast.array");
		b.lit(cast, "type", { t: "string", v: "BasePart" });
		const print = b.node("debug.print");
		b.link(model, "instance", kids, "instance");
		b.link(kids, "result", cast, "value");
		b.link(start, "then", print, "in");
		b.link(cast, "result", print, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toContain("(Workspace.Arena:GetDescendants() :: { BasePart })");
	});

	/** A cast's type is pasted into the source, so it cannot come from a wire. */
	it("will not take its type from a wire", () => {
		const cast = registry.get("cast.as")!;
		expect(literalOnlyPins(cast).has("type")).toBe(true);
	});
});

describe("service hoisting", () => {
	it("lifts a service to a top-level local named after it", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const service = b.node("roblox.getService");
		const print = b.node("debug.print");
		b.lit(service, "service", { t: "string", v: "ReplicatedStorage" });
		b.link(start, "then", print, "in");
		b.link(service, "service", print, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			[
				'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
				"",
				"print(ReplicatedStorage)",
			].join("\n"),
		);
	});

	/** Asking twice is one local, because GetService is idempotent and cached. */
	it("reuses one local when the same service is asked for twice", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const first = b.node("roblox.getService");
		const second = b.node("roblox.getService");
		const a = b.node("debug.print");
		const c = b.node("debug.print");
		b.lit(first, "service", { t: "string", v: "Players" });
		b.lit(second, "service", { t: "string", v: "Players" });
		b.link(start, "then", a, "in");
		b.link(a, "then", c, "in");
		b.link(first, "service", a, "value");
		b.link(second, "service", c, "value");

		const code = body(compile(b.build(), registry).code);
		expect(code.match(/GetService/g)).toHaveLength(1);
		expect(code).toContain("print(Players)");
	});

	it("keeps distinct services in the order they were first needed", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const players = b.node("roblox.getService");
		const storage = b.node("roblox.getService");
		const a = b.node("debug.print");
		const c = b.node("debug.print");
		b.lit(players, "service", { t: "string", v: "Players" });
		b.lit(storage, "service", { t: "string", v: "ReplicatedStorage" });
		b.link(start, "then", a, "in");
		b.link(a, "then", c, "in");
		b.link(players, "service", a, "value");
		b.link(storage, "service", c, "value");

		const lines = body(compile(b.build(), registry).code).split("\n");
		expect(lines[0]).toContain('"Players"');
		expect(lines[1]).toContain('"ReplicatedStorage"');
	});

	it("sits below the variable declarations it may be read by", () => {
		const b = new Builder();
		b.variable("count", "number", { t: "number", v: 0 });
		const start = b.node("script.begin");
		const service = b.node("roblox.getService");
		const print = b.node("debug.print");
		b.lit(service, "service", { t: "string", v: "Lighting" });
		b.link(start, "then", print, "in");
		b.link(service, "service", print, "value");

		const lines = body(compile(b.build(), registry).code).split("\n");
		// The service block comes first; variables follow it.
		expect(lines[0]).toContain("GetService");
		expect(lines[2]).toBe("local count: number = 0");
	});

	it("refuses a wired service name", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const service = b.node("roblox.getService");
		const name = b.node("value.string");
		const print = b.node("debug.print");
		b.lit(name, "value", { t: "string", v: "Players" });
		b.link(name, "result", service, "service");
		b.link(start, "then", print, "in");
		b.link(service, "service", print, "value");

		expect(errors(compile(b.build(), registry)).join(" ")).toContain("typed in, not wired");
	});

	it("does not shadow a variable that already claimed the name", () => {
		const b = new Builder();
		b.variable("Players", "any", { t: "nil" });
		const start = b.node("script.begin");
		const service = b.node("roblox.getService");
		const print = b.node("debug.print");
		b.lit(service, "service", { t: "string", v: "Players" });
		b.link(start, "then", print, "in");
		b.link(service, "service", print, "value");

		const code = body(compile(b.build(), registry).code);
		expect(code).toContain("local Players2 = game:GetService");
		// The variable keeps the name it claimed first; the service yields.
		expect(code).toContain("local Players = nil");
	});
});

describe("migration to a pure Get Service", () => {
	it("joins the execution wires that used to run through it", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const service = b.node("roblox.getService", { id: "svc" });
		const print = b.node("debug.print");
		b.lit(service, "service", { t: "string", v: "Players" });
		// The old shape: exec ran into and back out of the service node.
		b.link(start, "then", service, "in");
		b.link(service, "then", print, "in");
		b.link(service, "result", print, "value");

		const { script, notes } = migrateScript(b.build());
		expect(notes.join(" ")).toContain("now pure");

		// Start now runs straight into the print, and the data wire follows the
		// renamed pin.
		expect(script.links).toContainEqual(
			expect.objectContaining({ from: { node: start, pin: "then" }, to: { node: print, pin: "in" } }),
		);
		expect(script.links).toContainEqual(
			expect.objectContaining({ from: { node: "svc", pin: "service" }, to: { node: print, pin: "value" } }),
		);
		expect(errors(compile(script, registry))).toEqual([]);
	});
});

describe("instance paths and requires", () => {
	it("reaches a child by path, pulling in the service it starts from", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const inst = b.node("roblox.instancePath");
		const print = b.node("debug.print");
		b.lit(inst, "root", { t: "string", v: "ReplicatedStorage" });
		b.lit(inst, "path", { t: "string", v: "Assets.Sword" });
		b.link(start, "then", print, "in");
		b.link(inst, "instance", print, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			[
				'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
				"",
				"print(ReplicatedStorage.Assets.Sword)",
			].join("\n"),
		);
	});

	/** Instance names are not identifiers; "Main Menu" has to be bracketed. */
	it("brackets a path segment that is not an identifier", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const inst = b.node("roblox.instancePath");
		const print = b.node("debug.print");
		b.lit(inst, "root", { t: "string", v: "workspace" });
		b.lit(inst, "path", { t: "string", v: "Main Menu.Button 1" });
		b.link(start, "then", print, "in");
		b.link(inst, "instance", print, "value");

		expect(body(compile(b.build(), registry).code)).toBe(
			'print(workspace["Main Menu"]["Button 1"])',
		);
	});

	it("hoists a required module below the services it depends on", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const mod = b.node("module.requirePath");
		const print = b.node("debug.print");
		b.lit(mod, "root", { t: "string", v: "ReplicatedStorage" });
		b.lit(mod, "path", { t: "string", v: "Modules.Combat" });
		b.link(start, "then", print, "in");
		b.link(mod, "exports", print, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			[
				'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
				"",
				"local Combat = require(ReplicatedStorage.Modules.Combat)",
				"",
				"print(Combat)",
			].join("\n"),
		);
	});

	it("requires the same module once however many nodes ask", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const first = b.node("module.requirePath");
		const second = b.node("module.requirePath");
		const a = b.node("debug.print");
		const c = b.node("debug.print");
		for (const node of [first, second]) {
			b.lit(node, "root", { t: "string", v: "ReplicatedStorage" });
			b.lit(node, "path", { t: "string", v: "Modules.Combat" });
		}
		b.link(start, "then", a, "in");
		b.link(a, "then", c, "in");
		b.link(first, "exports", a, "value");
		b.link(second, "exports", c, "value");

		const code = body(compile(b.build(), registry).code);
		expect(code.match(/require\(/g)).toHaveLength(1);
	});

	it("names the local after the As field when one is given", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const mod = b.node("module.requirePath");
		const print = b.node("debug.print");
		b.lit(mod, "root", { t: "string", v: "script" });
		b.lit(mod, "path", { t: "string", v: "Parent.Util" });
		b.lit(mod, "as", { t: "string", v: "Helpers" });
		b.link(start, "then", print, "in");
		b.link(mod, "exports", print, "value");

		const code = body(compile(b.build(), registry).code);
		// script needs no declaration, so there is no service line above it.
		expect(code).toBe(
			["local Helpers = require(script.Parent.Util)", "", "print(Helpers)"].join("\n"),
		);
	});

	it("reports a Require Module with no path", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const mod = b.node("module.requirePath");
		const print = b.node("debug.print");
		b.lit(mod, "path", { t: "string", v: "" });
		b.link(start, "then", print, "in");
		b.link(mod, "exports", print, "value");

		expect(errors(compile(b.build(), registry)).join(" ")).toContain("starting point and a path");
	});
});

describe("calling into a required module", () => {
	it("requires, reads a field, and calls it", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const mod = b.node("module.requirePath");
		const field = b.node("value.field");
		const call = b.node("call.function");
		b.lit(mod, "root", { t: "string", v: "ReplicatedStorage" });
		b.lit(mod, "path", { t: "string", v: "Shared.Greeter" });
		b.lit(field, "field", { t: "string", v: "greet" });
		b.lit(call, "a0", { t: "string", v: "world" });
		b.link(start, "then", call, "in");
		b.link(mod, "exports", field, "object");
		b.link(field, "result", call, "fn");

		const out = compile(b.build(), registry);
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

	it("takes as many arguments as the node is configured for", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const call = b.node("call.method", { config: { args: 3 } });
		const inst = b.node("roblox.instancePath");
		b.lit(inst, "root", { t: "string", v: "workspace" });
		b.lit(inst, "path", { t: "string", v: "Part" });
		b.lit(call, "method", { t: "string", v: "Move" });
		b.lit(call, "a0", { t: "number", v: 1 });
		b.lit(call, "a1", { t: "number", v: 2 });
		b.lit(call, "a2", { t: "number", v: 3 });
		b.link(start, "then", call, "in");
		b.link(inst, "instance", call, "object");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe("workspace.Part:Move(1, 2, 3)");
	});

	it("binds the result only when something reads it", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const call = b.node("call.function", { config: { args: 0 } });
		const fn = b.node("function.entry", { config: { name: "tick", params: [], returns: [] } });
		const get = b.node("function.get", { config: { function: fn, name: "tick" } });
		b.link(start, "then", call, "in");
		b.link(get, "fn", call, "fn");

		// Nothing reads the result, so it is emitted as a bare statement.
		expect(body(compile(b.build(), registry).code)).toContain("tick()");
		expect(body(compile(b.build(), registry).code)).not.toContain("local result");
	});
});
