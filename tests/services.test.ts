import { describe, expect, it } from "vitest";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { migrateScript } from "../src/core/migrate.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

function errors(result: { diagnostics: { severity: string; message: string }[] }): string[] {
	return result.diagnostics.filter((d) => d.severity === "error").map((d) => d.message);
}

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
