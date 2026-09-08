/**
 * What the selected nodes compile to.
 *
 * ## Why this reads the real output rather than compiling the selection
 *
 * The obvious implementation is to build a script out of the selected nodes and
 * compile that. It is also the wrong one: a selection is an arbitrary subgraph,
 * usually with no entry point and with inputs that come from nodes outside it,
 * so compiling it standalone produces a page of diagnostics about a script
 * nobody wrote and Luau that is not what the file contains.
 *
 * So this shows the **actual generated file**, with the lines those nodes
 * produced picked out of it. That is the question worth answering — "which of
 * this is mine" — and it cannot be wrong, because it is the output.
 *
 * ## The source map, finally consumed
 *
 * `EmitResult.sourceMap` has existed since the emitter did and nothing read it;
 * `NOTES.md` has called it the highest-value unused thing in the compiler for
 * several releases. This is its first consumer. The eventual one is Studio
 * runtime errors pointing back at a node, which is the same lookup in the other
 * direction — so the mapping earns its keep here first and is exercised by
 * something before anything depends on it.
 *
 * ## Pure nodes have no lines of their own
 *
 * A pure value with one consumer is spliced into its use site, so it produces
 * no line and appears nowhere in the map. Selecting three arithmetic nodes and
 * being told "nothing" would be a bug report rather than an answer, so the
 * walk below follows their wires forward to whatever *did* emit a line, and
 * says so.
 */

import { useMemo, useState } from "react";

import type { NodeScript } from "../core/schema.js";
import type { Registry } from "../core/nodes/index.js";
import { nodeTitle } from "../core/nodes/index.js";
import { highlightLuau } from "./highlight.js";
import { Icon } from "./icons.jsx";
import { LAYER } from "./layers.js";

/** Unattributed lines longer than this are folded away. */
const CONTEXT = 2;

export interface SelectionPreviewProps {
	script: NodeScript;
	registry: Registry;
	selection: ReadonlySet<string>;
	/** The generated file, exactly as it would be written. */
	code: string;
	sourceMap: { line: number; node: string }[];
	onClose: () => void;
}

export interface Row {
	/** 1-based line in the generated file. */
	line: number;
	tokens: { text: string; cls: string }[];
	/** Emitted by a selected node. */
	mine: boolean;
	/** Emitted by a node a selected pure node feeds into. */
	downstream: boolean;
}

export function SelectionPreview(props: SelectionPreviewProps) {
	const [showAll, setShowAll] = useState(false);

	const { rows, direct, inlined } = useMemo(() => analyse(props), [props]);

	const anything = rows.some((r) => r.mine || r.downstream);
	const shown = showAll ? rows : fold(rows);

	return (
		<div className="docs-backdrop" style={{ zIndex: LAYER.menu + 1 }} onPointerDown={props.onClose}>
			<div
				className="docs preview-luau"
				onPointerDown={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if (e.key === "Escape") {
						e.preventDefault();
						props.onClose();
					}
				}}
				tabIndex={-1}
				ref={(el) => el?.focus()}
			>
				<div className="docs-head">
					<Icon name="terminal" size={16} />
					<strong>Selection preview</strong>
					<span className="sub">
						{props.selection.size} node{props.selection.size === 1 ? "" : "s"}
						{direct > 0 && ` · ${direct} line${direct === 1 ? "" : "s"}`}
					</span>
					<span className="spacer" />
					<label className="preview-toggle" title="Show the whole generated file, not just what these nodes produced">
						<input
							type="checkbox"
							checked={showAll}
							onChange={(e) => setShowAll(e.target.checked)}
						/>
						Whole file
					</label>
					<button className="tb" onClick={props.onClose} title="Close (Esc)">
						<Icon name="close" size={15} />
					</button>
				</div>

				<div className="preview-body">
					{!anything && (
						<p className="preview-note">
							These nodes produced no lines of their own, and nothing they feed into
							did either. That usually means they are not reachable from Script Start
							or a function — a node nothing runs is not compiled.
						</p>
					)}

					{inlined.length > 0 && (
						<p className="preview-note">
							{inlined.length === 1 ? "This node is pure" : "Some of these nodes are pure"},
							so {inlined.length === 1 ? "its value is" : "their values are"} written
							straight into the line that uses{" "}
							{inlined.length === 1 ? "it" : "them"} rather than onto a line of{" "}
							{inlined.length === 1 ? "its" : "their"} own:{" "}
							<strong>{inlined.join(", ")}</strong>. The lines below are where
							{inlined.length === 1 ? " it ends" : " they end"} up.
						</p>
					)}

					<pre className="preview-code">
						{shown.map((row, i) =>
							row === null ? (
								<span className="fold" key={`fold-${i}`}>
									⋯
								</span>
							) : (
								<span
									key={row.line}
									className={`ln${row.mine ? " mine" : ""}${row.downstream ? " downstream" : ""}`}
								>
									<span className="num">{row.line}</span>
									<span className="text">
										{row.tokens.length === 0
											? " "
											: row.tokens.map((t, j) => (
													<span key={j} className={t.cls}>
														{t.text}
													</span>
												))}
									</span>
								</span>
							),
						)}
					</pre>
				</div>
			</div>
		</div>
	);
}

/**
 * Which lines belong to the selection, and which pure nodes had none.
 *
 * Two passes. The first attributes lines directly. The second only runs for
 * selected nodes that got nothing, and follows their data wires forward — a
 * pure node's value has to surface in *somebody's* statement, and that
 * statement is the honest answer to "what does this compile to".
 */
export function analyse(props: SelectionPreviewProps): {
	rows: Row[];
	direct: number;
	inlined: string[];
} {
	const selected = props.selection;
	const highlighted = highlightLuau(props.code);

	const byLine = new Map<number, string>();
	for (const entry of props.sourceMap) byLine.set(entry.line, entry.node);

	const mineLines = new Set<number>();
	const emitted = new Set<string>();
	for (const [line, node] of byLine) {
		if (!selected.has(node)) continue;
		mineLines.add(line);
		emitted.add(node);
	}

	// The pure ones: selected, and nowhere in the map.
	const inlinedIds = [...selected].filter((id) => !emitted.has(id));
	const downstreamLines = new Set<number>();
	const inlined: string[] = [];

	for (const id of inlinedIds) {
		const reached = surfacesIn(props.script, props.registry, id);
		const lines = [...byLine].filter(([, node]) => reached.has(node)).map(([line]) => line);
		if (lines.length === 0) continue;
		for (const line of lines) if (!mineLines.has(line)) downstreamLines.add(line);

		const node = props.script.nodes.find((n) => n.id === id);
		const def = node && props.registry.get(node.def);
		inlined.push(node ? nodeTitle(def, node) : id);
	}

	const rows: Row[] = highlighted.map((tokens, i) => ({
		line: i + 1,
		tokens,
		mine: mineLines.has(i + 1),
		downstream: downstreamLines.has(i + 1),
	}));

	return { rows, direct: mineLines.size, inlined };
}

/**
 * The nodes whose statements an inlined value actually surfaces in.
 *
 * The walk goes forward along data wires and **stops at the first node that is
 * not pure**, because that node is the one with a line — its statement is where
 * the expression was spliced. A chain of pure nodes is walked through, since
 * none of them emitted anything either.
 *
 * Following every link instead would run off down the execution chain and mark
 * every statement after the one that used the value, which is a much larger and
 * quite untrue answer: the value does not appear in any of them.
 *
 * Visited-set guarded because this runs on the graph as it is — mid-edit, and
 * possibly containing the data-wire loop the compiler would refuse.
 */
function surfacesIn(script: NodeScript, registry: Registry, start: string): Set<string> {
	const found = new Set<string>();
	const walked = new Set<string>([start]);
	const queue = [start];

	while (queue.length > 0) {
		const id = queue.pop()!;
		for (const link of script.links) {
			if (link.from.node !== id) continue;

			const consumer = script.nodes.find((n) => n.id === link.to.node);
			if (!consumer) continue;
			const def = registry.get(consumer.def);

			if (def?.pure) {
				// Also inlined, so keep going: its own consumer holds the line.
				if (walked.has(consumer.id)) continue;
				walked.add(consumer.id);
				queue.push(consumer.id);
			} else {
				found.add(consumer.id);
			}
		}
	}
	return found;
}

/**
 * Collapses long runs of lines nobody selected.
 *
 * A few lines of context either side is what makes an extracted line readable —
 * it is the difference between `end` and knowing which block ended. Beyond
 * that, the rest of the file is noise the "Whole file" switch is for.
 */
export function fold(rows: Row[]): (Row | null)[] {
	const keep = new Set<number>();
	rows.forEach((row, i) => {
		if (!row.mine && !row.downstream) return;
		for (let j = Math.max(0, i - CONTEXT); j <= Math.min(rows.length - 1, i + CONTEXT); j++) {
			keep.add(j);
		}
	});

	const out: (Row | null)[] = [];
	let folding = false;
	rows.forEach((row, i) => {
		if (keep.has(i)) {
			out.push(row);
			folding = false;
		} else if (!folding) {
			out.push(null);
			folding = true;
		}
	});
	return out;
}
