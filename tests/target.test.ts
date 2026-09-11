/**
 * What a graph compiles for, and what happens to a node written for the other.
 *
 * A Roblox-only node in a Lune graph compiles to calls Lune does not have, so
 * it is an error on that node rather than a warning beside a written file —
 * including a pure node, which never walks the execution chain the emitter
 * checks.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { offTargetNodes } from "../src/core/compiler/validate.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { buildSite, findPage } from "../src/core/docs/site.js";
import { BUILTIN_NODES } from "../src/core/nodes/index.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

function withService(target: "roblox" | "lune") {
	const b = new Builder();
	const start = b.node("script.begin");
	const service = b.node("roblox.getService", { literals: { service: { t: "string", v: "Players" } } });
	const print = b.node("debug.print");
	b.link(start, "then", print, "in");
	b.link(service, "service", print, "value");
	return { script: b.build({ target }), service };
}

describe("a node for the other target", () => {
	it("is an error on the node in a Lune graph, even when it is pure", () => {
		const { script, service } = withService("lune");
		const errors = compile(script, registry).diagnostics.filter((d) => d.severity === "error");
		expect(errors.map((e) => e.message)).toContain(
			`"Get Service" only works in Roblox, and this graph compiles for Lune.`,
		);
		expect(errors.find((e) => e.message.includes("Get Service"))?.node).toBe(service);
	});

	it("is nothing at all in a Roblox graph", () => {
		const { script } = withService("roblox");
		const messages = compile(script, registry).diagnostics.map((d) => d.message);
		expect(messages.join("\n")).not.toContain("only works in");
	});
});

describe("switching a graph's target", () => {
	it("names the nodes that would become errors, and only those", () => {
		const { script, service } = withService("roblox");
		expect(offTargetNodes(script, registry, "lune").map((n) => n.id)).toEqual([service]);
		expect(offTargetNodes(script, registry, "roblox")).toEqual([]);
	});
});

describe("Hand-written Luau's examples", () => {
	const site = buildSite(registry, new Set(BUILTIN_NODES.map((d) => d.id)));
	const page = findPage(site, "hand-written-luau")!;

	it("draws each code node in its own graph", () => {
		expect(page.blocks.filter((b) => b.t === "graph")).toHaveLength(2);
	});

	it("shows the Luau each one compiles to, under its picture", () => {
		const codes = page.blocks.filter((b) => b.t === "code").map((b) => (b as { text: string }).text);
		expect(codes.some((c) => c.includes("hits += 1") && c.includes('print("Done")'))).toBe(true);
		expect(codes.some((c) => c.includes("print(os.clock() * 2)"))).toBe(true);
	});
});
