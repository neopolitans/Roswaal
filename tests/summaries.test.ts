/**
 * The opening of a node's summary, which is what the Inspector shows.
 *
 * Summaries are written for the reference page, where a paragraph is right —
 * what the node does, when to reach for it, what it refuses. Beside the graph
 * that paragraph is a wall, and the rest is one click away.
 *
 * **It takes sentences until it has said something, not one sentence.** That
 * rule came out of running the first version over the real library: eleven
 * nodes open with a label rather than a description — "Escape hatch.",
 * "if / else.", "By name." — and stopping at the first full stop put those in
 * the panel on their own, which is worse than the wall it was fixing.
 *
 * Splitting prose into sentences is famously not solvable in general. This has
 * to be right only about what occurs here, so the test that matters is the last
 * one: it runs over **every summary in the registry** and asserts none comes
 * back mangled. That check keeps working as nodes are added by someone who
 * never read this file.
 */

import { describe, expect, it } from "vitest";

import { briefSummary } from "../src/app/Inspector.js";
import { createRegistry } from "../src/core/nodes/index.js";

describe("shortening a summary", () => {
	it("stops at the first full stop that has said enough", () => {
		expect(briefSummary("Reads a script variable from anywhere in the graph. And more besides."))
			.toBe("Reads a script variable from anywhere in the graph.");
	});

	it("leaves a summary that is already short alone", () => {
		expect(briefSummary("Constructs an empty table.")).toBe("Constructs an empty table.");
	});

	it("returns the whole thing when there is no full stop at all", () => {
		expect(briefSummary("No full stop here")).toBe("No full stop here");
	});

	/**
	 * The reason it is not simply the first sentence. A label is a true thing to
	 * say about a node and a useless one to show on its own.
	 */
	it("keeps going past an opening label", () => {
		expect(briefSummary("Escape hatch. Whatever you type here is pasted in as it stands."))
			.toBe("Escape hatch. Whatever you type here is pasted in as it stands.");
	});

	/** `Vector3.new` is not the end of a sentence; there is no space after it. */
	it("is not fooled by a method call", () => {
		expect(briefSummary("Makes a vector with Vector3.new and hands it straight back. Then more."))
			.toBe("Makes a vector with Vector3.new and hands it straight back.");
	});

	/** The library has one of these today, which is how these things start. */
	it("is not fooled by an abbreviation", () => {
		expect(
			briefSummary("An instance reached by path, e.g. Modules.Combat under storage. And more."),
		).toBe("An instance reached by path, e.g. Modules.Combat under storage.");
	});

	/** A stop inside backticks belongs to the code, not to the prose. */
	it("does not end inside a code span", () => {
		expect(briefSummary("Writes `a. b` to the file and then stops there. Then more."))
			.toBe("Writes `a. b` to the file and then stops there.");
	});

	it("ends on a question mark as readily as a full stop", () => {
		expect(briefSummary("Is the child you are waiting for there yet, or not? Find out."))
			.toBe("Is the child you are waiting for there yet, or not?");
	});
});

/**
 * Every node in the registry, run through it. Nothing may come back empty,
 * longer than it started, or as something that is not a prefix of what it was —
 * and nothing that *was* long may be cut down to a fragment.
 *
 * The last of those checks the shortener, not the author: a summary that is
 * three words to begin with is a summary somebody wrote that way, and this is
 * not the place to argue with it.
 */
describe("every summary in the library", () => {
	const registry = createRegistry();
	const summaries = [...registry.values()]
		.filter((def) => def.summary)
		.map((def) => ({ id: def.id, summary: def.summary as string }));

	it("has something to describe, so the check means something", () => {
		expect(summaries.length).toBeGreaterThan(100);
	});

	it("survives being shortened", () => {
		const mangled: string[] = [];
		for (const { id, summary } of summaries) {
			const brief = briefSummary(summary);
			if (brief.length === 0) mangled.push(`${id}: came back empty`);
			if (brief.length > summary.length) mangled.push(`${id}: came back longer`);
			if (!summary.startsWith(brief)) mangled.push(`${id}: is not a prefix of the summary`);
			// Only when something was actually cut. Four words is the line between a
			// short description and a fragment of one.
			if (brief !== summary && brief.trim().split(/\s+/).length < 4) {
				mangled.push(`${id}: cut to "${brief}"`);
			}
		}
		expect(mangled).toEqual([]);
	});

	/** If nothing were ever shortened the whole thing would be doing nothing. */
	it("actually shortens the long ones", () => {
		const shortened = summaries.filter(
			({ summary }) => briefSummary(summary).length < summary.length,
		);
		expect(shortened.length).toBeGreaterThan(20);
	});

	/** And what it leaves has to fit a panel, which is the point of all of it. */
	it("leaves nothing longer than a short paragraph", () => {
		const tooLong = summaries
			.map(({ id, summary }) => ({ id, brief: briefSummary(summary) }))
			.filter(({ brief }) => brief.length > 220)
			.map(({ id, brief }) => `${id}: ${brief.length} characters`);
		expect(tooLong).toEqual([]);
	});
});
