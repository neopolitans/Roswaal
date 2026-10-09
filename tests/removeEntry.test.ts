/**
 * Removing a parameter, an argument, an output or a result from any position:
 * the entries after it move up a place and keep their wires and values.
 */

import { describe, expect, it } from "vitest";

import { removeEntry, removeListEntry } from "../src/app/edits.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

/** Where each wire into or out of a node lands, as `from.pin>to.pin`. */
function wiresOf(script: NodeScript, node: string): string[] {
	return script.links
		.filter((l) => l.from.node === node || l.to.node === node)
		.map((l) => `${l.from.node}.${l.from.pin}>${l.to.node}.${l.to.pin}`)
		.sort();
}

describe("removeEntry", () => {
	it("takes the middle argument out of a call and moves the last one up", () => {
		const b = new Builder();
		const call = b.node("call.function", { config: { args: 3 } });
		const one = b.node("value.number");
		const three = b.node("value.number");
		b.link(one, "value", call, "a0");
		b.link(three, "value", call, "a2");
		b.lit(call, "a1", { t: "number", v: 2 });
		b.lit(call, "a2", { t: "number", v: 3 });

		const after = removeEntry(b.build(), registry, call, 1);
		const node = after.nodes.find((n) => n.id === call)!;
		expect(node.config?.args).toBe(2);
		expect(wiresOf(after, call)).toEqual([`${one}.value>${call}.a0`, `${three}.value>${call}.a1`]);
		expect(node.literals).toEqual({ a1: { t: "number", v: 3 } });
	});

	it("drops the removed entry's own wire", () => {
		const b = new Builder();
		const call = b.node("call.function", { config: { args: 2 } });
		const first = b.node("value.number");
		b.link(first, "value", call, "a0");

		const after = removeEntry(b.build(), registry, call, 0);
		expect(wiresOf(after, call)).toEqual([]);
		expect(after.nodes.find((n) => n.id === call)!.config?.args).toBe(1);
	});

	it("takes a function's first parameter out, and its others keep their wires", () => {
		const b = new Builder();
		const fn = b.node("function.entry", {
			config: {
				name: "f",
				params: [
					{ name: "a", type: "number" },
					{ name: "b", type: "string" },
				],
			},
		});
		const print = b.node("debug.print", { graph: fn });
		b.link(fn, "p1", print, "value");

		const after = removeEntry(b.build(), registry, fn, 0);
		const node = after.nodes.find((n) => n.id === fn)!;
		expect(node.config?.params).toEqual([{ name: "b", type: "string" }]);
		expect(wiresOf(after, print)).toEqual([`${fn}.p0>${print}.value`]);
	});

	it("takes a result out of every Return of the function, each renumbered", () => {
		const b = new Builder();
		const returns = [
			{ name: "x", type: "number" },
			{ name: "y", type: "string" },
		];
		const fn = b.node("function.entry", { config: { name: "f", returns } });
		const first = b.node("function.return", { graph: fn, config: { returns } });
		const second = b.node("function.return", { graph: fn, config: { returns } });
		const text = b.node("value.string", { graph: fn });
		b.link(text, "value", first, "r1");
		b.link(text, "value", second, "r1");

		const after = removeEntry(b.build(), registry, first, 0);
		const want = [{ name: "y", type: "string" }];
		for (const id of [fn, first, second]) {
			expect(after.nodes.find((n) => n.id === id)!.config?.returns, id).toEqual(want);
		}
		expect(wiresOf(after, first)).toEqual([`${text}.value>${first}.r0`]);
		expect(wiresOf(after, second)).toEqual([`${text}.value>${second}.r0`]);
	});

	it("will not go below the node's minimum", () => {
		const b = new Builder();
		const seq = b.node("flow.sequence", { config: { count: 2 } });
		const before = b.build();
		expect(removeEntry(before, registry, seq, 0)).toBe(before);
	});

	it("takes a result out of a function from the Inspector, and its Returns keep their wires", () => {
		const b = new Builder();
		const returns = [
			{ name: "x", type: "number" },
			{ name: "y", type: "string" },
		];
		const fn = b.node("function.entry", { config: { name: "f", returns } });
		const ret = b.node("function.return", { graph: fn, config: { returns } });
		const text = b.node("value.string", { graph: fn });
		b.link(text, "value", ret, "r1");

		const after = removeListEntry(b.build(), registry, fn, "returns", 0);
		expect(after.nodes.find((n) => n.id === ret)!.config?.returns).toEqual([
			{ name: "y", type: "string" },
		]);
		expect(wiresOf(after, ret)).toEqual([`${text}.value>${ret}.r0`]);
	});
});
