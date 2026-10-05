/**
 * Dragging a new node off an execution output that is already wired puts the
 * node in between: the dragged-from step leads into it, and it leads on to
 * whatever the step led to before. Without this the new node took the wire
 * and the rest of the chain fell off.
 */

import { describe, expect, it } from "vitest";

import { continuingOutput, insertIntoChain } from "../src/app/edits.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

/** Print A leading into Print B, and a node of `def` to put between them. */
function chain(def: string) {
	const b = new Builder();
	const a = b.node("debug.print");
	const next = b.node("debug.print");
	b.link(a, "then", next, "in");
	const inserted = b.node(def);
	return { script: b.build(), a, next, inserted };
}

/** Where each execution wire goes, as `from.pin -> to`. */
const execWires = (script: NodeScript, ids: Record<string, string>) => {
	const name = (id: string) => Object.entries(ids).find(([, v]) => v === id)?.[0] ?? id;
	return script.links
		.filter((l) => ["then", "s0", "s1", "completed", "body", "true", "false"].includes(l.from.pin))
		.map((l) => `${name(l.from.node)}.${l.from.pin} -> ${name(l.to.node)}`)
		.sort();
};

describe("inserting a node into a chain", () => {
	it("puts a step between the two", () => {
		const { script, a, next, inserted } = chain("debug.print");
		const out = insertIntoChain(
			script,
			registry,
			{ node: a, pin: "then" },
			{ node: inserted, pin: "in" },
		);
		expect(execWires(out, { a, next, inserted })).toEqual([
			"a.then -> inserted",
			"inserted.then -> next",
		]);
	});

	it("hands on from Then 0 of a Sequence", () => {
		const { script, a, next, inserted } = chain("flow.sequence");
		const out = insertIntoChain(
			script,
			registry,
			{ node: a, pin: "then" },
			{ node: inserted, pin: "in" },
		);
		expect(execWires(out, { a, next, inserted })).toEqual([
			"a.then -> inserted",
			"inserted.s0 -> next",
		]);
	});

	it("hands on from a loop's Completed, not its Body", () => {
		const { script, a, next, inserted } = chain("flow.forEach");
		const out = insertIntoChain(
			script,
			registry,
			{ node: a, pin: "then" },
			{ node: inserted, pin: "in" },
		);
		expect(execWires(out, { a, next, inserted })).toEqual([
			"a.then -> inserted",
			"inserted.completed -> next",
		]);
	});

	it("hands on from True on a Branch, the only way on", () => {
		const def = registry.get("flow.branch")!;
		expect(continuingOutput(def.id, resolveNodePins(def, {}).outputs)?.id).toBe("true");
	});

	it("ends the chain at a Return", () => {
		const { script, a, next, inserted } = chain("function.return");
		const out = insertIntoChain(
			script,
			registry,
			{ node: a, pin: "then" },
			{ node: inserted, pin: "in" },
		);
		expect(execWires(out, { a, next, inserted })).toEqual(["a.then -> inserted"]);
	});

	it("is a plain connection when the pin led nowhere", () => {
		const b = new Builder();
		const a = b.node("debug.print");
		const inserted = b.node("debug.print");
		const out = insertIntoChain(
			b.build(),
			registry,
			{ node: a, pin: "then" },
			{ node: inserted, pin: "in" },
		);
		expect(execWires(out, { a, inserted })).toEqual(["a.then -> inserted"]);
	});
});
