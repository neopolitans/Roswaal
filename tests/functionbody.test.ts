/**
 * Which nodes belong to a function.
 *
 * Nothing in a `.nodescript` says so. A function's body is whatever the
 * execution wires reach, which is why this has to be derived — and why it has
 * to be derived the way the emitter walks, not approximately: it decides which
 * graph a node is moved into when an older file gains function graphs.
 *
 * The case that drives it is `Occupancy.hide`: a Declare Function in a 97-node
 * graph, which is the shape the rule has to carve correctly.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { bindsParameters, bodyPinOf, functionBody } from "../src/core/functionBody.js";
import { migrateScript } from "../src/core/migrate.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder } from "./helpers.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = createRegistry();

const body = (script: NodeScript, id: string) => functionBody(script, registry, id);

describe("where a body hangs from", () => {
	/**
	 * The pair that is easy to get backwards. A hoisted Function is not in the
	 * flow, so `then` *is* its body. Declare Function sits in the flow, so
	 * `then` is the statement after it and `body` is the function.
	 */
	it("is then for the hoisted one and body for the in-flow one", () => {
		expect(bodyPinOf("function.entry")).toBe("then");
		expect(bodyPinOf("function.declareHere")).toBe("body");
	});

	it("is nothing for a node that declares no function", () => {
		expect(bodyPinOf("debug.print")).toBeUndefined();
		expect(bodyPinOf("flow.branch")).toBeUndefined();
	});

	/** A handler binds parameters as a function does, so Get Parameter reads both. */
	it("binds parameters for both functions and both handlers", () => {
		for (const id of ["function.entry", "function.declareHere", "event.connect", "event.once"]) {
			expect(bindsParameters(id), id).toBe(true);
		}
		expect(bindsParameters("flow.forEach")).toBe(false);
	});
});

describe("a hoisted Function", () => {
	function graph() {
		const b = new Builder();
		const fn = b.node("function.entry", { config: { name: "greet", params: [], returns: [] } });
		const first = b.node("debug.print");
		const second = b.node("debug.print");
		b.link(fn, "then", first, "in");
		b.link(first, "then", second, "in");
		return { script: b.build(), fn, first, second };
	}

	it("takes everything down its chain", () => {
		const { script, fn, first, second } = graph();
		expect([...body(script, fn)].sort()).toEqual([first, second].sort());
	});

	/** The thing being described is not part of what it describes. */
	it("does not include the declaration itself", () => {
		const { script, fn } = graph();
		expect(body(script, fn).has(fn)).toBe(false);
	});
});

describe("a Declare Function", () => {
	/** A function in the flow: something before it, something after it. */
	function graph() {
		const b = new Builder();
		const begin = b.node("script.begin");
		const fn = b.node("function.declareHere", {
			config: { name: "hide", params: [{ name: "who", type: "string" }], returns: [] },
		});
		const inside = b.node("debug.print");
		const after = b.node("debug.print");
		b.link(begin, "then", fn, "in");
		b.link(fn, "body", inside, "in");
		b.link(fn, "then", after, "in");
		return { script: b.build(), begin, fn, inside, after };
	}

	it("takes what hangs off body", () => {
		const { script, fn, inside } = graph();
		expect([...body(script, fn)]).toEqual([inside]);
	});

	/**
	 * `then` is the next statement in the block the node sits in, not part of
	 * the function. Following it would take the rest of the script with it.
	 */
	it("leaves the statement after it alone", () => {
		const { script, fn, after, begin } = graph();
		const inside = body(script, fn);
		expect(inside.has(after)).toBe(false);
		expect(inside.has(begin)).toBe(false);
	});
});

describe("what counts as inside", () => {
	it("follows both arms of a branch", () => {
		const b = new Builder();
		const fn = b.node("function.entry", { config: { name: "pick", params: [], returns: [] } });
		const branch = b.node("flow.branch");
		const yes = b.node("debug.print");
		const no = b.node("debug.print");
		b.link(fn, "then", branch, "in");
		b.link(branch, "true", yes, "in");
		b.link(branch, "false", no, "in");

		const inside = body(b.build(), fn);
		expect(inside.has(branch)).toBe(true);
		expect(inside.has(yes)).toBe(true);
		expect(inside.has(no)).toBe(true);
	});

	/** A handler is a closure written inside the function and compiled in it. */
	it("follows an event handler's body", () => {
		const b = new Builder();
		const fn = b.node("function.entry", { config: { name: "wire", params: [], returns: [] } });
		const connect = b.node("event.connect", { config: { params: [] } });
		const handled = b.node("debug.print");
		const later = b.node("debug.print");
		b.link(fn, "then", connect, "in");
		b.link(connect, "body", handled, "in");
		b.link(connect, "then", later, "in");

		const inside = body(b.build(), fn);
		expect(inside.has(handled)).toBe(true);
		expect(inside.has(later)).toBe(true);
	});

	/**
	 * The one real boundary. A nested declaration is a statement in the outer
	 * body and belongs to it; the body it opens belongs to the function it
	 * declares.
	 */
	it("stops at a nested declaration's own body", () => {
		const b = new Builder();
		const outer = b.node("function.entry", { config: { name: "outer", params: [], returns: [] } });
		const nested = b.node("function.declareHere", {
			config: { name: "inner", params: [], returns: [] },
		});
		const innerBody = b.node("debug.print");
		const afterNested = b.node("debug.print");
		b.link(outer, "then", nested, "in");
		b.link(nested, "body", innerBody, "in");
		b.link(nested, "then", afterNested, "in");

		const script = b.build();
		const outside = body(script, outer);
		expect(outside.has(nested), "the declaration is a statement in the outer body").toBe(true);
		expect(outside.has(afterNested)).toBe(true);
		expect(outside.has(innerBody), "the inner body belongs to the inner function").toBe(false);

		// And the inner function claims exactly what the outer one did not.
		expect([...body(script, nested)]).toEqual([innerBody]);
	});

	/** A wire back into an earlier node is a graph error; it must not hang. */
	it("terminates on an execution wire that loops", () => {
		const b = new Builder();
		const fn = b.node("function.entry", { config: { name: "loop", params: [], returns: [] } });
		const one = b.node("debug.print");
		const two = b.node("debug.print");
		b.link(fn, "then", one, "in");
		b.link(one, "then", two, "in");
		b.link(two, "then", one, "in");

		expect([...body(b.build(), fn)].sort()).toEqual([one, two].sort());
	});
});

/**
 * The graph that prompted all of this: `hide` is a Declare Function among 97
 * nodes, and the rule has to carve it without taking the module with it.
 */
describe("Occupancy.hide, from the m103 example", () => {
	function occupancy(): { script: NodeScript; hide: string } {
		const file = path.join(
			ROOT, "examples/m103/graph/.roswaal/scripts/ReplicatedStorage/Tank/Occupancy.nodescript",
		);
		const script = migrateScript(JSON.parse(readFileSync(file, "utf8")) as NodeScript).script;
		const hide = script.nodes.find(
			(n) =>
				n.def === "function.declareHere" &&
				(n.config as { name?: string } | undefined)?.name === "hide",
		);
		expect(hide, "the example no longer has a Declare Function called hide").toBeDefined();
		return { script, hide: hide!.id };
	}

	it("claims a real body without claiming the module", () => {
		const { script, hide } = occupancy();
		const inside = functionBody(script, registry, hide);

		expect(inside.size, "hide has a body").toBeGreaterThan(1);
		expect(inside.size, "and it is not the whole graph").toBeLessThan(script.nodes.length);
		expect(inside.has(hide), "the declaration is not part of its own body").toBe(false);
	});

	/** A function's body must not take the module's top-level statements. */
	it("leaves the module's own flow outside", () => {
		const { script, hide } = occupancy();
		const inside = functionBody(script, registry, hide);

		for (const node of script.nodes) {
			if (node.def !== "script.begin" && node.def !== "module.exports") continue;
			expect(inside.has(node.id), `${node.def} is not inside a function`).toBe(false);
		}
	});

	/** Every other function's body is its own, with no overlap. */
	it("does not overlap another function's body", () => {
		const { script, hide } = occupancy();
		const mine = functionBody(script, registry, hide);

		for (const node of script.nodes) {
			if (node.id === hide || bodyPinOf(node.def) === undefined) continue;
			const theirs = functionBody(script, registry, node.id);
			for (const id of theirs) {
				expect(mine.has(id), `${id} is claimed by two functions`).toBe(false);
			}
		}
	});
});
