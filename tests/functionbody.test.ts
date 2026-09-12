/**
 * Which nodes belong to a function.
 *
 * Nothing in a `.nodescript` says so. A function's body is whatever the
 * execution wires reach, which is why this has to be derived — and why it has
 * to be derived the way the emitter walks, not approximately. A fold that hid a
 * node the compiler still emits would read as a bug in the compiler.
 *
 * The case that drives it is `Occupancy.hide`: a Declare Function in a 97-node
 * graph, which is the shape the rule has to carve correctly.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
	bodyPinOf, functionBody, functionBodyWithValues, hiddenByCollapse, isCollapsed,
} from "../src/core/functionBody.js";
import { migrateScript } from "../src/core/migrate.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder } from "./helpers.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = createRegistry();

const body = (script: NodeScript, id: string) => functionBody(script, registry, id);
const withValues = (script: NodeScript, id: string) =>
	functionBodyWithValues(script, registry, id);

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
	 * the function. Following it would fold the rest of the script away.
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
 * Execution wires alone are not enough to fold a function: a pure node sits off
 * the chain and can be anywhere on the canvas, so folding only the chain would
 * strand values still wired to nodes nobody is drawing any more.
 */
describe("the values a body uses", () => {
	function graph(alsoOutside: boolean) {
		const b = new Builder();
		const begin = b.node("script.begin");
		const fn = b.node("function.entry", { config: { name: "sum", params: [], returns: [] } });
		const add = b.node("math.add");
		const inside = b.node("debug.print");
		b.link(fn, "then", inside, "in");
		b.link(add, "result", inside, "value");

		if (alsoOutside) {
			const outside = b.node("debug.print");
			b.link(begin, "then", outside, "in");
			b.link(add, "result", outside, "value");
		}
		return { script: b.build(), fn, add };
	}

	it("travels with the body when only the body reads it", () => {
		const { script, fn, add } = graph(false);
		expect(body(script, fn).has(add), "not on the execution chain").toBe(false);
		expect(withValues(script, fn).has(add)).toBe(true);
	});

	/** Read from both places it is genuinely in both, so it stays put. */
	it("stays behind when something outside reads it too", () => {
		const { script, fn, add } = graph(true);
		expect(withValues(script, fn).has(add)).toBe(false);
	});

	/** Pure feeds pure: the chain of them has to resolve, not just the first. */
	it("takes a value that only another interior value reads", () => {
		const b = new Builder();
		const fn = b.node("function.entry", { config: { name: "sum", params: [], returns: [] } });
		const inner = b.node("math.add");
		const outer = b.node("math.add");
		const print = b.node("debug.print");
		b.link(fn, "then", print, "in");
		b.link(inner, "result", outer, "a0");
		b.link(outer, "result", print, "value");

		const inside = withValues(b.build(), fn);
		expect(inside.has(outer)).toBe(true);
		expect(inside.has(inner), "reached only through another interior value").toBe(true);
	});
});

/**
 * Folding a function away.
 *
 * The flag lives on the node, so a graph opens as it was left. What it hides is
 * derived, so a fold cannot disagree with what compiles — which is the whole
 * reason membership is computed rather than stored.
 */
describe("what a fold hides", () => {
	function graph(collapsed: boolean) {
		const b = new Builder();
		const begin = b.node("script.begin");
		const fn = b.node("function.declareHere", {
			config: { name: "hide", params: [], returns: [], ...(collapsed ? { collapsed: true } : {}) },
		});
		const inner = b.node("debug.print");
		const value = b.node("math.add");
		const after = b.node("debug.print");
		b.link(begin, "then", fn, "in");
		b.link(fn, "body", inner, "in");
		b.link(value, "result", inner, "value");
		b.link(fn, "then", after, "in");
		return { script: b.build(), fn, inner, value, after, begin };
	}

	it("hides nothing until a function is folded", () => {
		expect(hiddenByCollapse(graph(false).script, registry).size).toBe(0);
	});

	it("hides the body and the values only it reads", () => {
		const { script, inner, value } = graph(true);
		const hidden = hiddenByCollapse(script, registry);
		expect(hidden.has(inner)).toBe(true);
		expect(hidden.has(value)).toBe(true);
	});

	/** Fold it and it must still be there: it is what you open to get back in. */
	it("never hides the declaration itself", () => {
		const { script, fn } = graph(true);
		expect(hiddenByCollapse(script, registry).has(fn)).toBe(false);
	});

	it("leaves the flow around it alone", () => {
		const { script, begin, after } = graph(true);
		const hidden = hiddenByCollapse(script, registry);
		expect(hidden.has(begin)).toBe(false);
		expect(hidden.has(after)).toBe(false);
	});

	/** A folded function inside a folded function is hidden by the outer one. */
	it("hides a nested declaration when the function holding it is folded", () => {
		const b = new Builder();
		const outer = b.node("function.entry", {
			config: { name: "outer", params: [], returns: [], collapsed: true },
		});
		const nested = b.node("function.declareHere", {
			config: { name: "inner", params: [], returns: [], collapsed: true },
		});
		const innerBody = b.node("debug.print");
		b.link(outer, "then", nested, "in");
		b.link(nested, "body", innerBody, "in");

		const hidden = hiddenByCollapse(b.build(), registry);
		expect(hidden.has(nested), "hidden by the outer fold, not exempted by its own").toBe(true);
		expect(hidden.has(innerBody)).toBe(true);
	});

	it("takes the union of two folds standing side by side", () => {
		const b = new Builder();
		const one = b.node("function.entry", {
			config: { name: "one", params: [], returns: [], collapsed: true },
		});
		const two = b.node("function.entry", {
			config: { name: "two", params: [], returns: [], collapsed: true },
		});
		const first = b.node("debug.print");
		const second = b.node("debug.print");
		b.link(one, "then", first, "in");
		b.link(two, "then", second, "in");

		const hidden = hiddenByCollapse(b.build(), registry);
		expect(hidden.has(first)).toBe(true);
		expect(hidden.has(second)).toBe(true);
	});
});

describe("the collapsed flag", () => {
	it("means nothing on a node that declares no function", () => {
		expect(isCollapsed({ def: "debug.print", config: { collapsed: true } })).toBe(false);
		expect(isCollapsed({ def: "function.entry", config: { collapsed: true } })).toBe(true);
	});

	it("is off unless it is set", () => {
		expect(isCollapsed({ def: "function.entry" })).toBe(false);
		expect(isCollapsed({ def: "function.entry", config: {} })).toBe(false);
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
		const inside = functionBodyWithValues(script, registry, hide);

		expect(inside.size, "hide has a body").toBeGreaterThan(1);
		expect(inside.size, "and it is not the whole graph").toBeLessThan(script.nodes.length);
		expect(inside.has(hide), "the declaration is not part of its own body").toBe(false);
	});

	/** Folding a function must not fold the module's top-level statements. */
	it("leaves the module's own flow outside", () => {
		const { script, hide } = occupancy();
		const inside = functionBodyWithValues(script, registry, hide);

		for (const node of script.nodes) {
			if (node.def !== "script.begin" && node.def !== "module.exports") continue;
			expect(inside.has(node.id), `${node.def} is not inside a function`).toBe(false);
		}
	});

	/** Every other function's body is its own, with no overlap. */
	it("does not overlap another function's body", () => {
		const { script, hide } = occupancy();
		const mine = functionBodyWithValues(script, registry, hide);

		for (const node of script.nodes) {
			if (node.id === hide || bodyPinOf(node.def) === undefined) continue;
			const theirs = functionBody(script, registry, node.id);
			for (const id of theirs) {
				expect(mine.has(id), `${id} is claimed by two functions`).toBe(false);
			}
		}
	});
});
