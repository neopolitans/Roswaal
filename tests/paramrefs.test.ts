/**
 * Keeping Get Parameter pointing at the right parameter.
 *
 * `ListEditor` rewrites a signature's whole `params` array on every keystroke,
 * so there is no rename event to react to — only a before and an after. Rename,
 * reorder and deletion have to be told apart by inference, and this is the file
 * that says the inference is right.
 *
 * It matters more than it looks. Getting it wrong does not throw or fail to
 * compile: the graph goes on emitting Luau and quietly means something else,
 * which is the worst shape a bug can take here.
 */

import { describe, expect, it } from "vitest";

import { syncParamRefs } from "../src/app/edits.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder } from "./helpers.js";

/** A function with two parameters, and a node reading each by name. */
function graph(params: { name: string; type?: string }[]) {
	const b = new Builder();
	const fn = b.node("function.entry", { config: { name: "pair", params, returns: [] } });
	const readsFirst = b.node("function.getParam", {
		config: { function: fn, param: "first", type: "string" },
	});
	const readsSecond = b.node("function.getParam", {
		config: { function: fn, param: "second", type: "string" },
	});
	return { script: b.build(), fn, readsFirst, readsSecond };
}

const paramOf = (script: NodeScript, id: string) =>
	(script.nodes.find((n) => n.id === id)!.config as { param?: string }).param;

const typeOf = (script: NodeScript, id: string) =>
	(script.nodes.find((n) => n.id === id)!.config as { type?: string }).type;

const FIRST = { name: "first", type: "string" };
const SECOND = { name: "second", type: "string" };

describe("renaming a parameter", () => {
	it("carries the nodes reading it across", () => {
		const { script, fn, readsFirst, readsSecond } = graph([FIRST, SECOND]);
		const out = syncParamRefs(script, fn, [FIRST, SECOND], [{ name: "who" }, SECOND]);

		expect(paramOf(out, readsFirst)).toBe("who");
		expect(paramOf(out, readsSecond), "the other is untouched").toBe("second");
	});

	/**
	 * The case that makes this hard. Typing rewrites the array per keystroke, so
	 * a rename arrives as a run of one-character edits and each has to land.
	 */
	it("follows a name as it is typed, one keystroke at a time", () => {
		const { script, fn, readsFirst } = graph([FIRST, SECOND]);

		let out = script;
		let before = [FIRST, SECOND] as { name: string; type?: string }[];
		for (const name of ["firs", "fir", "fi", "f", "fo", "fou", "four"]) {
			const after = [{ name, type: "string" }, SECOND];
			out = syncParamRefs(out, fn, before, after);
			before = after;
		}

		expect(paramOf(out, readsFirst)).toBe("four");
	});
});

describe("reordering parameters", () => {
	/**
	 * By position this looks exactly like two renames, and acting on it would
	 * swap every reference. References are by name precisely so this is a no-op.
	 */
	it("changes nothing, because the names are all still there", () => {
		const { script, fn, readsFirst, readsSecond } = graph([FIRST, SECOND]);
		const out = syncParamRefs(script, fn, [FIRST, SECOND], [SECOND, FIRST]);

		expect(paramOf(out, readsFirst)).toBe("first");
		expect(paramOf(out, readsSecond)).toBe("second");
	});

	it("returns the same script when there is nothing to do", () => {
		const { script, fn } = graph([FIRST, SECOND]);
		expect(syncParamRefs(script, fn, [FIRST, SECOND], [SECOND, FIRST])).toBe(script);
	});
});

describe("deleting a parameter", () => {
	/**
	 * Deliberately *not* repaired. Dropping `first` shifts `second` up into its
	 * position, which by position alone reads as a rename — and repointing the
	 * node to `second` would silently make it read a different value. It is left
	 * dangling so `validate` can name it against the node.
	 */
	it("leaves the node pointing at what is gone, rather than at its neighbour", () => {
		const { script, fn, readsFirst, readsSecond } = graph([FIRST, SECOND]);
		const out = syncParamRefs(script, fn, [FIRST, SECOND], [SECOND]);

		expect(paramOf(out, readsFirst), "not silently repointed to second").toBe("first");
		expect(paramOf(out, readsSecond)).toBe("second");
	});

	/** The `−` on a function's header takes the last one off. */
	it("leaves the last one dangling when the node is shrunk", () => {
		const { script, fn, readsSecond } = graph([FIRST, SECOND]);
		const out = syncParamRefs(script, fn, [FIRST, SECOND], [FIRST]);
		expect(paramOf(out, readsSecond)).toBe("second");
	});
});

describe("a parameter's type", () => {
	it("is refreshed on the nodes reading it", () => {
		const { script, fn, readsFirst } = graph([FIRST, SECOND]);
		const out = syncParamRefs(script, fn, [FIRST, SECOND], [{ name: "first", type: "Model" }, SECOND]);
		expect(typeOf(out, readsFirst)).toBe("Model");
	});

	/** A Luau type becomes the pin type the canvas can colour and compare. */
	it("is stored as a pin type, not as whatever Luau was written", () => {
		const { script, fn, readsFirst } = graph([FIRST, SECOND]);
		const out = syncParamRefs(script, fn, [FIRST, SECOND], [{ name: "first", type: "Model?" }, SECOND]);
		expect(typeOf(out, readsFirst)).toBe("Model");
	});

	it("follows a rename and a retype at once", () => {
		const { script, fn, readsFirst } = graph([FIRST, SECOND]);
		const out = syncParamRefs(script, fn, [FIRST, SECOND], [{ name: "who", type: "number" }, SECOND]);
		expect(paramOf(out, readsFirst)).toBe("who");
		expect(typeOf(out, readsFirst)).toBe("number");
	});
});

describe("nodes belonging to another function", () => {
	it("are left alone", () => {
		const b = new Builder();
		const mine = b.node("function.entry", {
			config: { name: "mine", params: [FIRST], returns: [] },
		});
		const theirs = b.node("function.entry", {
			config: { name: "theirs", params: [FIRST], returns: [] },
		});
		const readsTheirs = b.node("function.getParam", {
			config: { function: theirs, param: "first", type: "string" },
		});

		const out = syncParamRefs(b.build(), mine, [FIRST], [{ name: "renamed" }]);
		expect(paramOf(out, readsTheirs)).toBe("first");
	});
});
