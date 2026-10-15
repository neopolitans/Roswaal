/**
 * The Refactor panel (0.183.0): Realign, and the changes that rewire a graph
 * without changing what it compiles to, in one place. The toolbar's Refactor
 * button opens it over the top of the graph, and it docks under the Inspector.
 *
 * Each acts on the selection when there is more than one node in it,
 * otherwise on the graph on screen. Split into rows always takes the graph's
 * chain from its start. See `core/refactor.ts`.
 */

import { useMemo } from "react";

import type { GraphId } from "../core/functionGraph.js";
import { refactorCounts } from "../core/refactor.js";
import type { NodeScript } from "../core/schema.js";
import { PanelHead } from "./Cards.jsx";
import { cx } from "./cx.js";
import { Icon, type IconName } from "./icons.jsx";
import type { RefactorChange } from "./useGraphCommands.js";

export interface RefactorPanelProps {
	script: NodeScript;
	graph: GraphId;
	selection: ReadonlySet<string>;
	/** The graph is being compiled and must not be edited. */
	locked: boolean;
	realignAfter: boolean;
	onRealign: () => void;
	onChange: (change: RefactorChange) => void;
	onRealignAfter: (value: boolean) => void;
}

function Action(props: {
	icon: IconName;
	label: string;
	hint: string;
	keys?: string;
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<button className="refactor-act" disabled={props.disabled} onClick={props.onClick}>
			<Icon name={props.icon} size={16} />
			<span className="refactor-text">
				<span className="refactor-label">{props.label}</span>
				<span className="refactor-hint">{props.hint}</span>
			</span>
			{props.keys && <kbd>{props.keys}</kbd>}
		</button>
	);
}

export function RefactorPanel(props: RefactorPanelProps) {
	const { script, graph, selection } = props;
	const counts = useMemo(
		() => refactorCounts(script, graph, selection),
		[script, graph, selection],
	);
	const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
	return (
		<div className={cx("inspector refactor", props.locked && "editing-locked")}>
			<PanelHead
				sub={counts.selected > 1 ? plural(counts.selected, "node", "selected nodes") : "Graph"}
			/>
			<div className="inspector-body">
				<Action
					icon="layout"
					label="Realign"
					hint="Lay out along the flow; pinned nodes stay put"
					keys="Ctrl+Shift+L"
					disabled={props.locked}
					onClick={props.onRealign}
				/>
				<Action
					icon="straighten"
					label="Split into rows"
					hint="A Sequence after the start, the chain cut into rows by width"
					disabled={props.locked}
					onClick={() => props.onChange("rows")}
				/>
				<Action
					icon="duplicate"
					label="A Get per reader"
					hint={
						counts.perReader > 0
							? `${plural(counts.perReader, "Get is", "Gets are")} read by several nodes`
							: "Every Get has one reader"
					}
					disabled={props.locked || counts.perReader === 0}
					onClick={() => props.onChange("perReader")}
				/>
				<Action
					icon="graph"
					label="Share Gets"
					hint={
						counts.shared > 0
							? `${plural(counts.shared, "Get reads", "Gets read")} what another does`
							: "No two Gets read the same thing"
					}
					disabled={props.locked || counts.shared === 0}
					onClick={() => props.onChange("shareGets")}
				/>
				<label className="check-row" title="Realign what a change touched after it.">
					<input
						type="checkbox"
						checked={props.realignAfter}
						onChange={(e) => props.onRealignAfter(e.target.checked)}
					/>
					<span>Realign after each change</span>
				</label>
			</div>
		</div>
	);
}
