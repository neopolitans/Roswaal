/**
 * A node that names a class hands back that class — in the file, too.
 *
 * The Find First nodes typed their output as the class they were given while
 * the file said nothing, so Luau read `Instance?` where the graph read
 * `Humanoid`. And a Class Name arriving by wire kept whatever class had last
 * been typed into the pin, whatever the wire carried.
 */

import { describe, expect, it } from "vitest";

import { retypeClassReads } from "../src/core/classReads.js";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import type { NodeScript, TypecheckMode } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

function outputType(script: NodeScript, nodeId: string): string | undefined {
	const node = script.nodes.find((n) => n.id === nodeId)!;
	return resolveNodePins(registry.get(node.def)!, node.config, node.literals)
		.outputs.find((p) => p.id === "result")?.type;
}

/** A Find First Child Of Class printed, in the given typechecking mode. */
function printed(typecheck: TypecheckMode, className = "Humanoid"): string {
	const b = new Builder();
	const start = b.node("script.begin");
	const find = b.node("instance.findFirstChildOfClass");
	b.lit(find, "instance", { t: "raw", v: "character" });
	b.lit(find, "className", { t: "string", v: className });
	const print = b.node("debug.print");
	b.link(start, "then", print, "in");
	b.link(find, "result", print, "value");
	const result = compile(b.build({ typecheck }), registry);
	expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	return body(result.code);
}

describe("a Find First node's class, in the file", () => {
	it("is cast to the class or nil where annotations are written", () => {
		expect(printed("strict")).toContain(
			'print((character:FindFirstChildOfClass("Humanoid") :: Humanoid?))',
		);
		expect(printed("nonstrict")).toContain(":: Humanoid?)");
	});

	it("is not cast in Default, which writes no annotations", () => {
		expect(printed("default")).toContain('print(character:FindFirstChildOfClass("Humanoid"))');
	});

	it("is not cast when the class is not one Roswaal knows", () => {
		expect(printed("strict", "NotAClass")).not.toContain("::");
	});

	it("keeps the bare class on the pin, as every pin does", () => {
		const b = new Builder();
		const find = b.node("instance.findFirstChildWhichIsA");
		b.lit(find, "className", { t: "string", v: "Part" });
		expect(outputType(b.build(), find)).toBe("Part");
	});

	it("leaves New Instance alone: it never hands back nil", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const make = b.node("roblox.instanceNew");
		b.lit(make, "className", { t: "string", v: "Part" });
		b.link(start, "then", make, "in");
		const out = body(compile(b.build({ typecheck: "strict" }), registry).code);
		expect(out).not.toContain(":: Part?");
	});
});

describe("a wired Class Name", () => {
	function wired(from: "string" | "knot" | "expression"): { script: NodeScript; find: string } {
		const b = new Builder();
		const find = b.node("instance.findFirstChildOfClass");
		// The literal left behind from before the wire arrived.
		b.lit(find, "className", { t: "string", v: "Humanoid" });
		let source: string;
		if (from === "expression") {
			source = b.node("value.expression", { literals: { code: { t: "raw", v: "pickClass()" } } });
		} else {
			source = b.node("value.string", { literals: { value: { t: "string", v: "Part" } } });
		}
		if (from === "knot") {
			const knot = b.node("flow.reroute");
			b.link(source, "result", knot, "in");
			b.link(knot, "out", find, "className");
		} else {
			b.link(source, "result", find, "className");
		}
		return { script: retypeClassReads(b.build()), find };
	}

	it("takes the class a String node carries", () => {
		const { script, find } = wired("string");
		expect(outputType(script, find)).toBe("Part");
	});

	it("follows the String through reroute knots", () => {
		const { script, find } = wired("knot");
		expect(outputType(script, find)).toBe("Part");
	});

	it("is Instance when the class is only known at runtime", () => {
		const { script, find } = wired("expression");
		expect(outputType(script, find)).toBe("Instance");
	});

	it("goes back to the typed class when the wire is removed", () => {
		const { script, find } = wired("expression");
		const unwired = retypeClassReads({
			...script,
			links: script.links.filter((l) => l.to.node !== find),
		});
		expect(outputType(unwired, find)).toBe("Humanoid");
		expect(unwired.nodes.find((n) => n.id === find)!.config).not.toHaveProperty("wiredClass");
	});

	it("hands back the same script when there is nothing to change", () => {
		const b = new Builder();
		b.node("debug.print");
		const script = b.build();
		expect(retypeClassReads(script)).toBe(script);
	});
});
