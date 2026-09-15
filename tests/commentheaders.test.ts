/**
 * A comment's header, written into the generated Luau.
 *
 * The promise is the thing to hold: the box you drew around six nodes puts its
 * header above those six nodes' code. That means the compiler asks the *same*
 * geometric question the canvas asks — `commentHolds`, on `nodeBounds` — because
 * any second, simpler rule would disagree at the edges and "I can see it inside
 * the box but nothing was printed" is a worse bug than the coupling.
 */

import { describe, expect, it } from "vitest";

import { body, Builder } from "./helpers.js";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { commentLines, headersByNode } from "../src/core/comments.js";

const registry = createRegistry();
const on = { comments: true };

/** Two prints in a row, with a box around whichever are named. */
function graph(box: { x: number; y: number; w: number; h: number }, text = "Say hello") {
	const b = new Builder();
	const start = b.node("script.begin", { id: "start", x: 0, y: 0 });
	const first = b.node("debug.print", { id: "first", x: 300, y: 100 });
	const second = b.node("debug.print", { id: "second", x: 300, y: 260 });
	b.lit(first, "value", { t: "string", v: "one" });
	b.lit(second, "value", { t: "string", v: "two" });
	b.link(start, "then", first, "in");
	b.link(first, "then", second, "in");
	b.script.comments.push({ id: "note", ...box, text });
	return b.build();
}

/** Wide and tall enough to hold both prints, whose bounds are 216 across. */
const BOTH = { x: 260, y: 60, w: 400, h: 340 };
/** Only the first: it stops above the second node's top edge. */
const FIRST_ONLY = { x: 260, y: 60, w: 400, h: 130 };

describe("a comment holding nodes", () => {
	it("writes its header above their code", () => {
		const out = compile(graph(BOTH), registry, on);
		expect(body(out.code)).toBe([
			"-- Say hello",
			'print("one")',
			'print("two")',
		].join("\n"));
	});

	/** Once, above the block — not above every statement in it. */
	it("writes it once however many nodes it holds", () => {
		const out = body(compile(graph(BOTH), registry, on).code);
		expect(out.match(/-- Say hello/g)).toHaveLength(1);
	});

	it("heads only the nodes it is actually drawn around", () => {
		const out = compile(graph(FIRST_ONLY), registry, on);
		expect(body(out.code)).toBe([
			"-- Say hello",
			'print("one")',
			'print("two")',
		].join("\n"));
		// The second print is outside the box, so the header sits above the
		// first and the second follows it uncommented — which is the same text
		// here, and is asserted by membership below rather than by the output.
		const holds = headersByNode(graph(FIRST_ONLY), registry);
		expect([...holds.keys()]).toEqual(["first"]);
	});

	it("keeps the lines the header was written with", () => {
		const out = body(compile(graph(BOTH, "Two lines\nof heading"), registry, on).code);
		expect(out).toContain("-- Two lines\n-- of heading");
	});

	/** A blank header would emit a bare `--`, which is noise rather than a note. */
	it("writes nothing for a comment with no text", () => {
		const out = body(compile(graph(BOTH, "   "), registry, on).code);
		expect(out).not.toContain("--");
	});

	/** A note about nothing in particular is a fair thing to write on a canvas. */
	it("writes nothing for a comment holding no nodes", () => {
		const script = graph({ x: 2000, y: 2000, w: 200, h: 120 }, "Off on its own");
		expect(body(compile(script, registry, on).code)).not.toContain("Off on its own");
	});

	it("writes nothing at all when the setting is off", () => {
		const out = body(compile(graph(BOTH), registry).code);
		expect(out).toBe(['print("one")', 'print("two")'].join("\n"));
	});
});

describe("a comment inside a comment", () => {
	/**
	 * Two headings over one statement is one heading too many, and the inner
	 * comment is the more specific thing said about it.
	 */
	it("gives a node to the smaller of the two", () => {
		const script = graph(BOTH, "Everything");
		script.comments.push({ id: "inner", x: 280, y: 80, w: 300, h: 120, text: "Just the first" });

		const holds = headersByNode(script, registry);
		expect(holds.get("first")?.text).toBe("Just the first");
		expect(holds.get("second")?.text).toBe("Everything");
	});
});

describe("a header inside a block", () => {
	/** It is a line of code like any other, so it takes the block's indentation. */
	it("is indented with the code it heads", () => {
		const b = new Builder();
		const start = b.node("script.begin", { id: "start", x: 0, y: 0 });
		const branch = b.node("flow.branch", { id: "branch", x: 300, y: 0 });
		const print = b.node("debug.print", { id: "print", x: 700, y: 100 });
		b.lit(print, "value", { t: "string", v: "yes" });
		b.link(start, "then", branch, "in");
		b.link(branch, "true", print, "in");
		b.script.comments.push({ id: "note", x: 660, y: 60, w: 400, h: 200, text: "The true arm" });

		expect(body(compile(b.build(), registry, on).code)).toBe([
			"if true then",
			"\t-- The true arm",
			`\tprint("yes")`,
			"end",
		].join("\n"));
	});
});

describe("a header's text as Luau", () => {
	it("is one comment line each, with no trailing space on a blank one", () => {
		expect(commentLines("one\ntwo")).toEqual(["-- one", "-- two"]);
		expect(commentLines("one\n\ntwo")).toEqual(["-- one", "--", "-- two"]);
	});

	it("takes Windows line endings as line endings", () => {
		expect(commentLines("one\r\ntwo")).toEqual(["-- one", "-- two"]);
	});
});
