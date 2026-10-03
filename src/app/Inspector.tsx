/**
 * Node inspector.
 *
 * Most nodes need nothing here — their inputs are edited on the node itself.
 * It exists for the handful whose *shape* is data: function signatures, module
 * exports, connect handler parameters. Those cannot be expressed as pins
 * because the pins are what they define.
 *
 * This file is the panel: which node, its heading, summary and label. What
 * each kind of node shows below that is `InspectorSections.tsx`.
 */

import { nodeTitle, type Registry } from "../core/nodes/index.js";
import type { Comment, GraphNode, NodeDef, NodeScript } from "../core/schema.js";
import { useEditBurst } from "./editBurst.js";
import { renameNode, updateComment } from "./edits.js";
import { Field, InspectorSections } from "./InspectorSections.jsx";
import {
	COMMENT_COLORS, COMMENT_DEFAULT_COLOR, commentColor, nodeColor, readHexColor,
} from "./palette.js";
import { store } from "./store.js";

/**
 * Abbreviations whose full stop is not the end of a sentence.
 *
 * One `e.g.` in the whole library today, which is exactly the sort of thing
 * that is fine until the day somebody writes another and the panel starts
 * truncating a node's description to four words.
 */
const NOT_A_FULL_STOP = /(?:\be\.g|\bi\.e|\betc|\bvs|\bcf|\bapprox)\.$/i;

/**
 * The opening of a node's summary, short enough for a side panel.
 *
 * Summaries are written for the reference page, where a paragraph is right —
 * what the node does, when to reach for it, what it refuses. Beside the graph
 * that paragraph is a wall, and the rest of it is one click away.
 *
 * **Sentences until it has said something, rather than one sentence.** Plenty
 * of summaries open with a label instead of a description — "Escape hatch.",
 * "if / else.", "By name." — and stopping at the first full stop would put
 * those in the panel alone, which is worse than the wall. So it keeps taking
 * sentences until what it has is long enough to be a description.
 *
 * Splitting prose into sentences is famously not solvable in general. This has
 * to be right only about what occurs here: abbreviations, and full stops inside
 * code spans — `Vector3.new` must not end a sentence, and a stop between
 * backticks is never a boundary.
 */
const ENOUGH_SAID = 45;

export function briefSummary(text: string): string {
	const boundaries = /[.!?](?=\s)/g;
	let match: RegExpExecArray | null;
	while ((match = boundaries.exec(text)) !== null) {
		const upto = text.slice(0, match.index + 1);
		if (NOT_A_FULL_STOP.test(upto)) continue;
		// An odd number of backticks means the stop is inside a code span.
		if ((upto.match(/`/g) ?? []).length % 2 === 1) continue;
		if (upto.length >= ENOUGH_SAID) return upto;
	}
	return text;
}

/** Where a node's page lives in the docs window. */
function docsHref(nodeId: string): string {
	return `/docs#${encodeURIComponent(`node/${nodeId}`)}`;
}

export interface InspectorProps {
	/**
	 * The graph is being compiled and refuses edits. The store is what actually
	 * refuses them -- see `EditorState.locked` -- so this exists so the panel
	 * does not sit there looking like it accepted one.
	 */
	locked?: boolean;
	script: NodeScript;
	registry: Registry;
	selection: ReadonlySet<string>;
}

export function Inspector({ script, registry, selection, locked }: InspectorProps) {
	if (selection.size !== 1) return null;
	const id = [...selection][0];
	const comment = script.comments.find((c) => c.id === id);
	if (comment) return <CommentInspector comment={comment} locked={locked} />;
	const node = script.nodes.find((n) => n.id === id);
	if (!node) return null;
	const def = registry.get(node.def);
	if (!def) return null;

	return (
		<div className={`inspector${locked ? " editing-locked" : ""}`}>
			<h2>Node</h2>
			<div className="inspector-body">
				<div className="node-heading" style={{ background: nodeColor(def) }}>
					{def.title}
				</div>
				{def.summary && (
					<p className="summary">
						{briefSummary(def.summary)}{" "}
						{/* Named window, so it reuses the docs the toolbar opens rather
						    than stacking up a tab per node. */}
						<a className="docs-link" href={docsHref(def.id)} target="roswaal-docs">
							See docs page
						</a>
					</p>
				)}

				<LabelField node={node} def={def} />

				<InspectorSections node={node} def={def} script={script} />
			</div>
		</div>
	);
}

/**
 * The node's label.
 *
 * The placeholder is what the node is called *now*, which for a named node is
 * its function or variable name rather than the definition's title — so an
 * empty field reads as "this is already fine" instead of as a suggestion to
 * type the name a second time.
 */
function LabelField({ node, def }: { node: GraphNode; def: NodeDef }) {
	const typing = useEditBurst();
	return (
		<Field label="Label">
			<input
				className="tb"
				placeholder={nodeTitle(def, node)}
				value={node.label ?? ""}
				onChange={(e) => typing.edit((s) => renameNode(s, node.id, e.target.value))}
				{...typing.field}
			/>
		</Field>
	);
}

/**
 * A selected comment.
 *
 * The panel had nothing for one, which was fine while a comment was a box with
 * text in it — the text is edited on the canvas, where it is read. A colour is
 * different: it is a property of the comment with nowhere on the comment to put
 * it, which is exactly what this panel is for.
 *
 * The heading is the comment's own colour rather than a category's, because a
 * comment has no category and the swatch is the thing being edited.
 */
function CommentInspector({ comment, locked }: { comment: Comment; locked?: boolean }) {
	const current = comment.color ?? COMMENT_DEFAULT_COLOR;
	const set = (color: string | undefined) =>
		store.edit((s) => updateComment(s, comment.id, { color }));

	return (
		<div className={`inspector${locked ? " editing-locked" : ""}`}>
			<h2>Node</h2>
			<div className="inspector-body">
				<div className="node-heading" style={{ background: commentColor(comment.color) }}>
					Comment
				</div>
				<p className="summary">
					A note on the canvas. Double-click its header to write in it; drag it to take
					what it encloses with it.
				</p>

				<Field
					label="Colour"
					hint="Two comments the same colour are saying they are about the same thing, which is why this is a short list rather than a picker."
				>
					<div className="swatches">
						{COMMENT_COLORS.map((choice) => (
							<button
								key={choice.hex}
								className={`swatch${choice.hex === current ? " on" : ""}`}
								style={{ background: `#${choice.hex}` }}
								title={choice.name}
								aria-label={choice.name}
								aria-pressed={choice.hex === current}
								onClick={() =>
									set(choice.hex === COMMENT_DEFAULT_COLOR ? undefined : choice.hex)
								}
							/>
						))}
					</div>
				</Field>

				<Field label="Or a hex" hint="Six digits, or three. The hash is optional.">
					<input
						className="tb"
						defaultValue={current}
						placeholder={COMMENT_DEFAULT_COLOR}
						key={current}
						onBlur={(e) => {
							const hex = readHexColor(e.target.value);
							// A value that is not a colour leaves the comment as it was,
							// and the field goes back to saying what the colour is. A
							// half-typed hex is not an error worth a message.
							if (hex) set(hex === COMMENT_DEFAULT_COLOR ? undefined : hex);
							else e.target.value = current;
						}}
					/>
				</Field>
			</div>
		</div>
	);
}


