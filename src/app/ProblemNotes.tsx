/**
 * What is wrong with a node, written out under it.
 *
 * The count in a node's corner says that something is wrong; this says what,
 * where it is, without a trip to the problems list. Errors, and the warnings
 * that ask for attention: the same ones the corner marks.
 *
 * A layer of its own above every node rather than a child of the node it is
 * about. A node is a stacking context, so nothing inside it can rise above the
 * node placed next to it: a note drawn inside its node would be covered by
 * whatever sat below, and a problem is the one thing on a canvas that must not
 * be hidden. Only the panels and menus around the canvas are above this.
 *
 * It does not take the pointer. A note sits over whatever is below its node,
 * and a note that caught clicks would make that node impossible to grab.
 */

import type { Diagnostic } from "../core/compiler/index.js";
import { nodeBounds } from "../core/nodeBox.js";
import type { Registry } from "../core/nodes/index.js";
import type { NodeScript } from "../core/schema.js";
import { cx } from "./cx.js";
import { LAYER } from "./layers.js";

/** The diagnostics a node is marked for, grouped by node, errors first. */
export function problemsByNode(diagnostics: readonly Diagnostic[]): Map<string, Diagnostic[]> {
	const map = new Map<string, Diagnostic[]>();
	for (const d of diagnostics) {
		if (!d.node) continue;
		if (d.severity === "warning" && !d.attention) continue;
		const list = map.get(d.node) ?? [];
		list.push(d);
		map.set(d.node, list);
	}
	for (const list of map.values()) {
		list.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
	}
	return map;
}

/** How far below its node a note hangs. */
const GAP = 6;

export function ProblemNotes(props: {
	script: NodeScript;
	registry: Registry;
	problems: ReadonlyMap<string, Diagnostic[]>;
	selection: ReadonlySet<string>;
	wideNodes: boolean;
}) {
	const { script, registry, problems, selection, wideNodes } = props;
	if (problems.size === 0) return null;
	return (
		<>
			{script.nodes.map((node) => {
				const list = problems.get(node.id);
				if (!list?.length) return null;
				const box = nodeBounds(node, registry, wideNodes);
				const first = list[0];
				const more = list.length - 1;
				return (
					<div
						key={node.id}
						className={cx("problem-note", first.severity === "warning" && "warn")}
						role="note"
						style={{
							left: box.x,
							top: box.y + box.h + GAP,
							maxWidth: Math.max(box.w + 40, 240),
							// The selected node's note over its neighbours', when two meet.
							zIndex: LAYER.problem + (selection.has(node.id) ? 1 : 0),
						}}
					>
						{first.message}
						{more > 0 && <span className="more"> and {more} more in the problems list</span>}
					</div>
				);
			})}
		</>
	);
}
