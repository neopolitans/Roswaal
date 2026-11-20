/**
 * Picking an Instance node's path from the DataModel as the project knows it:
 * the place, with what the node maps put there drawn as the instance each
 * becomes -- a graph as the script it compiles to, a script with children
 * as a folder of them -- and what only the place has tagged so.
 *
 * Opened from the node's path, at In and the step clicked. The head is the
 * whole path, typed into or stepped back along; the columns are the last
 * three levels. A click picks and goes in; Enter keeps what is typed, found
 * or not, for instances made while the game runs.
 */

import { useMemo, useState } from "react";
import { pathSteps } from "../core/instancePathFace.js";
import type { InstanceNode } from "../core/luau/instances.js";
import { isService } from "../core/roblox.js";
import { cx } from "./cx.js";
import { ExplorerIcon } from "./ExplorerIcon.jsx";
import { MenuSurface } from "./Menu.jsx";
import { useInstanceIndex } from "./placeOutline.js";

/** Where a root starts in the DataModel: none for `script` and `shared`, which depend on where it runs. */
export function rootNode(index: InstanceNode | null, root: string): InstanceNode | null {
	if (!index) return null;
	if (root === "game") return index;
	if (root === "workspace") return index.children.get("Workspace") ?? null;
	return index.children.get(root) ?? null;
}

/** The nodes along `steps` from `base`, as far as they are found. */
export function walkSteps(base: InstanceNode | null, steps: readonly string[]): InstanceNode[] {
	const out: InstanceNode[] = [];
	let at = base;
	for (const step of steps) {
		at = at?.children.get(step) ?? null;
		if (!at) break;
		out.push(at);
	}
	return out;
}

/** Only the place has it: the project's files do not put it there. */
const placeOnly = (node: InstanceNode) => !node.fromProject && !node.inProject;

const byName = (a: InstanceNode, b: InstanceNode) => a.name.localeCompare(b.name);

export function InstanceBrowser({
	at,
	root,
	path,
	step,
	onPick,
	onClose,
}: {
	at: Element;
	root: string;
	path: string;
	/** The step clicked on the node, to open at: its index in the path. */
	step?: number;
	onPick: (root: string, path: string) => void;
	onClose: () => void;
}) {
	const index = useInstanceIndex();
	const [within, setWithin] = useState(root);
	const [focus, setFocus] = useState<string[]>(() => {
		const steps = pathSteps(path);
		return step === undefined ? steps : steps.slice(0, step + 1);
	});
	const [typed, setTyped] = useState<string | null>(null);

	const base = rootNode(index, within);
	const chain = useMemo(() => walkSteps(base, focus), [base, focus]);
	const shownPath = [within, ...focus].join(".");

	const pick = (nextRoot: string, steps: string[]) => {
		setWithin(nextRoot);
		setFocus(steps);
		setTyped(null);
		onPick(nextRoot, steps.join("."));
	};

	// The columns: the last three levels down to the focus, each listing its
	// children with the next step lit.
	const levels: { holder: InstanceNode; lit?: string; depth: number }[] = [];
	if (base) {
		const holders = [base, ...chain];
		for (let i = Math.max(0, holders.length - 3); i < holders.length; i++)
			levels.push({ holder: holders[i], lit: focus[i], depth: i });
	}
	const last = chain[chain.length - 1] ?? base;
	const found = chain.length === focus.length;

	const keep = () => {
		const text = (typed ?? shownPath).trim();
		const [head = "", ...rest] = pathSteps(text);
		const isRoot = head === "game" || head === "script" || head === "workspace" || isService(head);
		pick(isRoot ? head : within, isRoot ? rest : [head, ...rest].filter(Boolean));
		onClose();
	};

	return (
		<MenuSurface
			at={{ element: at, align: "start" }}
			label="Pick an instance"
			className="ib"
			onClose={onClose}
		>
			<div className="ib-head">
				<input
					className="tb ib-path"
					aria-label="Path"
					value={typed ?? shownPath}
					spellCheck={false}
					onChange={(e) => setTyped(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							keep();
						}
					}}
				/>
				<div className="ib-crumbs">
					{within !== "game" && within !== "script" && (
						<>
							<button
								type="button"
								className="ib-step"
								onClick={() => {
									// Up to game, keeping the place: In becomes a step.
									setFocus([within === "workspace" ? "Workspace" : within, ...focus]);
									setWithin("game");
								}}
							>
								game
							</button>
							<span className="ib-sep">›</span>
						</>
					)}
					<button
						type="button"
						className={cx("ib-step", focus.length === 0 && "here")}
						onClick={() => pick(within, [])}
					>
						{within}
					</button>
					{focus.map((name, i) => (
						<span key={`${i}:${name}`} className="ib-step-wrap">
							<span className="ib-sep">›</span>
							<button
								type="button"
								className={cx(
									"ib-step",
									i === focus.length - 1 && "here",
									i >= chain.length && "missing",
								)}
								onClick={() => pick(within, focus.slice(0, i + 1))}
							>
								{name}
							</button>
						</span>
					))}
				</div>
			</div>
			{!base ? (
				<p className="ib-note">
					{within === "script" || within === "shared"
						? `${within} depends on where the graph runs, so there is nothing to browse. Type the path.`
						: index
							? `${within} is not in the project or the place. Type the path, or pick from game.`
							: "Reading the project's instances…"}
				</p>
			) : (
				<div className="ib-columns">
					{levels.map(({ holder, lit, depth }) => {
						const kids = [...holder.children.values()].sort(byName);
						return (
							<div
								key={`${depth}:${holder.name}`}
								className="ib-column"
								role="listbox"
								aria-label={holder.name}
							>
								{kids.length === 0 && <div className="ib-none">{holder.name} has no children.</div>}
								{kids.map((kid) => {
									const steps = [...focus.slice(0, depth), kid.name];
									// Choosing a service from game makes it In, as the node's own picker would.
									const top = holder === index && within === "game";
									return (
										<button
											type="button"
											role="option"
											aria-selected={kid.name === lit}
											key={kid.name}
											className={cx("ib-item", kid.name === lit && "on")}
											title={`${kid.name}, ${kid.className}${placeOnly(kid) ? ", only in the place" : ""}`}
											onClick={() =>
												top && isService(kid.name) ? pick(kid.name, []) : pick(within, steps)
											}
										>
											<ExplorerIcon
												className={kid.className}
												service={holder === index}
												open={false}
											/>
											<span className="ib-name">{kid.name}</span>
											{placeOnly(kid) && <span className="ib-tag">place</span>}
										</button>
									);
								})}
							</div>
						);
					})}
					{found && last && last !== base && last.children.size === 0 && levels.length < 3 && (
						<div className="ib-column">
							<div className="ib-none">{last.name} has no children.</div>
						</div>
					)}
				</div>
			)}
			<p className="ib-foot">Type a path, or pick. Enter keeps what is typed, found or not.</p>
		</MenuSurface>
	);
}
