/**
 * Which nodes a comment is drawn around, and what that means for the file.
 *
 * ## One rule, three callers
 *
 * A comment's membership is **geometric and recomputed**, never stored: a node
 * dragged out of a comment is simply out, and there is no stale list to
 * reconcile. Dragging asks this, copying asks this, and — since the comment
 * headers can be written into the generated Luau — so does the compiler.
 *
 * The compiler asking a question about rectangles is the surprising part, and it
 * is the price of the promise being made: the comment you drew around six nodes
 * puts its header above those six nodes' code. Any second, simpler rule down
 * here would disagree with the canvas at the edges, and "I can see it inside the
 * box but nothing was printed" is a worse bug than the coupling.
 *
 * ## Within one graph
 *
 * Every graph of a file has its own coordinate space and they all start at the
 * same origin, so this only ever compares a comment with nodes drawn in the same
 * graph. See `viewOf`.
 */

import { graphOf, viewOf } from "./functionGraph.js";
import { nodeBounds, rectContains, type Rect } from "./nodeBox.js";
import type { Registry } from "./nodes/index.js";
import type { Comment, NodeScript } from "./schema.js";

/** A comment, and the ids of everything drawn inside it. */
export interface CommentArea {
	comment: Comment;
	/** Nodes and nested comments, by id. */
	holds: Set<string>;
}

const boxOf = (comment: Comment): Rect => ({
	x: comment.x, y: comment.y, w: comment.w, h: comment.h,
});

/** What one comment is drawn around, within the graph it is drawn in. */
export function commentHolds(
	view: NodeScript, registry: Registry, comment: Comment,
): Set<string> {
	const holds = new Set<string>();
	const box = boxOf(comment);
	for (const node of view.nodes) {
		if (rectContains(box, nodeBounds(node, registry))) holds.add(node.id);
	}
	for (const other of view.comments) {
		if (other.id === comment.id) continue;
		if (rectContains(box, boxOf(other))) holds.add(other.id);
	}
	return holds;
}

/**
 * Every comment in the script, with what it holds, smallest box first.
 *
 * Smallest first because a node inside two nested comments belongs to the
 * *inner* one for the purpose of writing a header: the inner comment is the
 * more specific thing said about it, and printing both above one statement
 * would be two headings for one block.
 */
export function commentAreas(script: NodeScript, registry: Registry): CommentArea[] {
	const views = new Map<string | null, NodeScript>();
	const areas: CommentArea[] = [];

	for (const comment of script.comments) {
		const graph = graphOf(comment);
		let view = views.get(graph);
		if (!view) {
			view = viewOf(script, graph);
			views.set(graph, view);
		}
		areas.push({ comment, holds: commentHolds(view, registry, comment) });
	}

	return areas.sort((a, b) => a.comment.w * a.comment.h - b.comment.w * b.comment.h);
}

/**
 * The comment whose header belongs above each node's code, by node id.
 *
 * A node in no comment is absent. A node in several takes the smallest, which
 * `commentAreas` has already put first.
 *
 * A comment with nothing to say is skipped: an empty header would emit a bare
 * `--`, which is a line of noise rather than an explanation. So is one holding
 * no nodes — a note about nothing in particular is a legitimate thing to write
 * on a canvas and has no code to sit above.
 */
export function headersByNode(
	script: NodeScript, registry: Registry,
): Map<string, Comment> {
	const out = new Map<string, Comment>();
	for (const area of commentAreas(script, registry)) {
		if (area.comment.text.trim() === "") continue;
		for (const id of area.holds) {
			if (!out.has(id)) out.set(id, area.comment);
		}
	}
	return out;
}

/**
 * The `=` level a long-bracket comment needs to survive its own contents.
 *
 * `--[[ ... ]]` ends at the first `]]`, so a header mentioning `t[a[1]]` would
 * close the comment early and leave the rest of it as code. Luau allows any
 * number of `=` between the brackets, and the closer has to match — so the
 * level is the smallest that does not appear in the text.
 *
 * Nobody will ever see level 1. It exists because the alternative is generating
 * a file that does not parse, from a comment somebody wrote in good faith.
 */
export function bracketLevel(text: string): number {
	for (let level = 0; level < 16; level++) {
		if (!text.includes(`]${"=".repeat(level)}]`)) return level;
	}
	return 16;
}

/**
 * A comment's text as Luau.
 *
 * **One line stays `-- like this`**, because a block comment around six words is
 * ceremony, and a one-line header is what most comments are.
 *
 * **More than one becomes `--[[ … ]]`**, which is what the hand-written module
 * this mirrors uses for exactly the same thing: a heading with a paragraph under
 * it. Six `--` lines in a row is a wall; a block has a top and a bottom and
 * reads as one thing. The lines inside are indented a level, as they are there.
 *
 * That indentation is a **tab**, which `push` reads as one level relative to
 * wherever the comment lands and strips from the line — so this needs to know
 * neither how deep the block it is going into happens to be, nor whether the
 * project indents with spaces.
 */
export function commentLines(text: string): string[] {
	const lines = text.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trimEnd());
	if (lines.length === 1) return [`-- ${lines[0]}`.trimEnd()];

	const eq = "=".repeat(bracketLevel(text));
	return [
		`--[${eq}[`,
		...lines.map((line) => (line === "" ? "" : `\t${line}`)),
		`]${eq}]`,
	];
}
