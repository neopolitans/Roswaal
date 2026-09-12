/**
 * Comments that hold nothing.
 *
 * A comment used to be a wrapper: `C` was bound only with a selection, so every
 * comment came into being around something. That is the common case and not the
 * only one — a heading over an empty stretch of canvas, a reminder, a space left
 * for work not done yet are all notes worth writing before there is anything to
 * wrap.
 *
 * Nothing in the graph model ever required a comment to contain nodes, which is
 * why this was a keybinding gate rather than a feature. What was missing is a
 * guard saying an empty one survives the things that move comments about —
 * tidying the graph re-fits each comment around what it held, and "what it held"
 * being nothing is the case that would quietly collapse or drop one.
 */

import { describe, expect, it } from "vitest";

import { addComment, commentContents, deleteSelection } from "../src/app/edits.js";
import { autoLayout } from "../src/app/layout.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

const EMPTY = { x: 400, y: 400, w: 320, h: 200 };

/** A graph with two wired nodes, well away from where the comment goes. */
function graph(): NodeScript {
	const b = new Builder();
	const start = b.node("script.begin", { x: 0, y: 0 });
	const print = b.node("debug.print", { x: 260, y: 0 });
	b.link(start, "then", print, "in");
	return b.build();
}

const commentsOf = (script: NodeScript) => script.comments;

describe("a comment with nothing in it", () => {
	it("is made where it was put, holding nothing", () => {
		const { script, id } = addComment(graph(), EMPTY);
		const comment = commentsOf(script).find((c) => c.id === id)!;
		expect(comment).toMatchObject(EMPTY);
		expect([...commentContents(script, registry, id)]).toEqual([]);
	});

	/**
	 * The case that would go wrong silently. Tidying re-fits each comment around
	 * the nodes it held, and one that held none has nothing to be re-fitted to.
	 */
	it("survives a tidy-up, at the size it was given", () => {
		const { script, id } = addComment(graph(), EMPTY);
		const tidied = autoLayout(script, registry, {});

		const comment = commentsOf(tidied).find((c) => c.id === id);
		expect(comment, "the comment was dropped by autoLayout").toBeDefined();
		expect(comment).toMatchObject({ w: EMPTY.w, h: EMPTY.h });
	});

	it("is still empty after a tidy-up, rather than collecting what moved", () => {
		const { script, id } = addComment(graph(), EMPTY);
		const tidied = autoLayout(script, registry, {});
		expect([...commentContents(tidied, registry, id)]).toEqual([]);
	});

	it("goes when it is deleted, and not before", () => {
		const first = addComment(graph(), EMPTY);
		const second = addComment(first.script, { x: 900, y: 900, w: 200, h: 120 });

		const left = deleteSelection(second.script, new Set([first.id]), registry);
		expect(commentsOf(left).map((c) => c.id)).toEqual([second.id]);
	});

	/** Deleting nodes is not a reason to delete the note left about them. */
	it("outlives the nodes it was drawn around", () => {
		const b = new Builder();
		const start = b.node("script.begin", { x: 0, y: 0 });
		const print = b.node("debug.print", { x: 260, y: 0 });
		b.link(start, "then", print, "in");

		const { script, id } = addComment(b.build(), { x: -40, y: -60, w: 500, h: 240 });
		expect([...commentContents(script, registry, id)].length).toBeGreaterThan(0);

		const gone = deleteSelection(script, new Set([start, print]), registry);
		expect(commentsOf(gone).map((c) => c.id)).toEqual([id]);
		expect([...commentContents(gone, registry, id)]).toEqual([]);
	});
});
