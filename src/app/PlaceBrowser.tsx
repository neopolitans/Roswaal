/**
 * The DataModel browser: the project's place as Studio's Explorer shows it.
 * And, in a panel of its own, the properties of an instance opened from it.
 *
 * Read-only. The host parses the place and answers with names and classes;
 * properties come one instance at a time, already formatted, so the editor
 * holds a list of names however large the place is.
 */

import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "../core/errorMessage.js";
import {
	classGlyph,
	groupProperties,
	isScriptClass,
	type PlaceInstanceInfo,
	type PlaceProperty,
} from "../core/rbx/browse.js";
import { api, type PlaceTree } from "./api.js";
import { PanelHead } from "./Cards.jsx";
import { cx } from "./cx.js";
import { Icon, type IconName } from "./icons.jsx";
import { depthStyle, Ident, SectionHead } from "./PanelParts.jsx";

/** Mirrors `TUCKED` in core/rbx/browse.ts, which the editor does not bundle. */
const TUCKED = 1;

/** Children listed before a "Show all" row, so a folder of parts opens at once. */
const CHILD_LIMIT = 200;

/** Matches listed for a filter; past this the filter wants narrowing. */
const MATCH_LIMIT = 300;

/** An instance the Properties panel is showing, by the version of the place it is in. */
export interface PlaceTarget {
	stamp: string;
	index: number;
	name: string;
	className: string;
	path: string[];
	/** Directly under the place: a service. */
	service: boolean;
	/** The project file that writes it, for a script. */
	file?: string;
}

export interface PlaceBrowserProps {
	/** The place file, project-relative. */
	file: string;
	/** Changes whenever the project tree is read again, which is when to look again. */
	refreshKey: unknown;
	/**
	 * Show this instance in the Properties panel, or clear it. `open` is a
	 * double-click or a double tap, which brings the panel out; a single one
	 * only changes it while it is already showing something.
	 */
	onInspect: (target: PlaceTarget | null, open: boolean) => void;
	/** The instance the Properties panel is showing, if any. */
	inspecting: number | null;
	/** Pick and show this instance: a reference followed from Properties. */
	reveal: { index: number; seq: number } | null;
}

type Loaded = Extract<PlaceTree, { stamp: string }>;

export const PlaceBrowser = memo(function PlaceBrowser(props: PlaceBrowserProps) {
	const { file, refreshKey, onInspect, inspecting, reveal: revealRequest } = props;
	const [place, setPlace] = useState<Loaded | null>(null);
	const [problem, setProblem] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
	const [showAll, setShowAll] = useState<ReadonlySet<number>>(new Set());
	const [tucked, setTucked] = useState(false);
	const [filter, setFilter] = useState("");
	const [selected, setSelected] = useState<number | null>(null);
	const treeRef = useRef<HTMLDivElement>(null);
	// The version of the file on screen: a new one renumbers everything.
	const stampRef = useRef<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const answer = await api.place();
			if (answer.file === null) {
				setPlace(null);
				setProblem("The project has no place file.");
			} else {
				if (stampRef.current !== null && stampRef.current !== answer.stamp) {
					setOpen(new Set());
					setShowAll(new Set());
					setSelected(null);
					onInspect(null, false);
				}
				stampRef.current = answer.stamp;
				setPlace(answer);
				setProblem(null);
			}
		} catch (err) {
			// An unreadable place answers with an error, whose message names the file.
			setPlace(null);
			setProblem(errorMessage(err));
		} finally {
			setLoading(false);
		}
	}, [onInspect]);

	useEffect(() => {
		void load();
	}, [load, file, refreshKey]);

	const nodes = place?.outline.nodes;
	const classes = place?.outline.classes;

	// Children of each node, and the roots, in the outline's order.
	const children = useMemo(() => {
		const map = new Map<number, number[]>();
		nodes?.forEach(([, , parent], i) => {
			const list = map.get(parent);
			if (list) list.push(i);
			else map.set(parent, [i]);
		});
		return map;
	}, [nodes]);

	const classOf = (i: number) => classes![nodes![i][0]];

	const targetOf = useCallback(
		(index: number): PlaceTarget => {
			const [cls, name, parent] = nodes![index];
			const owner = place!.scripts[index];
			return {
				stamp: place!.stamp,
				index,
				name,
				className: classes![cls],
				path: pathTo(nodes!, index),
				service: parent === -1,
				...(owner ? { file: owner } : {}),
			};
		},
		[nodes, classes, place],
	);

	// Picks an instance, and shows it in Properties when that is open or asked for.
	const pick = useCallback(
		(index: number, openPanel: boolean) => {
			setSelected(index);
			if (openPanel || inspecting !== null) onInspect(targetOf(index), openPanel);
		},
		[inspecting, onInspect, targetOf],
	);

	// Picks an instance and opens every folder above it, so it can be seen.
	const reveal = useCallback(
		(index: number, openPanel = false) => {
			if (!nodes) return;
			pick(index, openPanel);
			const above: number[] = [];
			for (let p = nodes[index][2]; p !== -1; p = nodes[p][2]) above.push(p);
			// Past the first children of a big folder too, or it stays unseen.
			setOpen((prev) => new Set([...prev, ...above]));
			setShowAll((prev) => new Set([...prev, ...above]));
			if (nodes[index][3] & TUCKED) setTucked(true);
		},
		[nodes, pick],
	);

	// Shift+click on an arrow: the instance and every descendant with children
	// open, or all of them shut, as Studio's Explorer does. Which, by the
	// instance clicked.
	const toggleDeep = (index: number) => {
		const all: number[] = [];
		const stack = [index];
		while (stack.length > 0) {
			const at = stack.pop()!;
			const kids = children.get(at);
			if (!kids || kids.length === 0) continue;
			all.push(at);
			stack.push(...kids);
		}
		setOpen((prev) => {
			const opening = !prev.has(index);
			const next = new Set(prev);
			for (const i of all) {
				if (opening) next.add(i);
				else next.delete(i);
			}
			return next;
		});
	};

	// A reference followed in Properties: shown here, and there.
	useEffect(() => {
		if (revealRequest && nodes && revealRequest.index < nodes.length)
			reveal(revealRequest.index, true);
		// Only a new request; `reveal` changes with every pick.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [revealRequest]);

	// Keep the picked row in view when it was picked from somewhere else.
	useEffect(() => {
		if (selected === null) return;
		treeRef.current
			?.querySelector(`[data-index="${selected}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [selected, filter]);

	const rows = useMemo(() => {
		if (!nodes) return [];
		const out: Row[] = [];
		const needle = filter.trim().toLowerCase();
		if (needle) {
			for (let i = 0; i < nodes.length && out.length < MATCH_LIMIT; i++) {
				const [cls, name] = nodes[i];
				if (name.toLowerCase().includes(needle) || classes![cls].toLowerCase() === needle) {
					out.push({ kind: "node", index: i, depth: 0, match: true });
				}
			}
			if (out.length === MATCH_LIMIT)
				out.push({
					kind: "more",
					depth: 0,
					text: `First ${MATCH_LIMIT} shown. Narrow the filter to see the rest.`,
				});
			return out;
		}
		const add = (index: number, depth: number) => {
			out.push({ kind: "node", index, depth });
			if (!open.has(index)) return;
			const kids = children.get(index) ?? [];
			const shown = showAll.has(index) ? kids : kids.slice(0, CHILD_LIMIT);
			for (const kid of shown) add(kid, depth + 1);
			if (shown.length < kids.length) {
				out.push({
					kind: "more",
					depth: depth + 1,
					parent: index,
					text: `Show all ${kids.length}`,
				});
			}
		};
		const roots = children.get(-1) ?? [];
		const hidden = roots.filter((i) => nodes[i][3] & TUCKED);
		for (const root of roots) if (!(nodes[root][3] & TUCKED)) add(root, 0);
		if (hidden.length) {
			out.push({
				kind: "tucked",
				depth: 0,
				text: tucked
					? `Hide ${hidden.length} empty services`
					: `${hidden.length} more services, all empty`,
			});
			if (tucked) for (const root of hidden) add(root, 0);
		}
		return out;
	}, [nodes, classes, children, open, showAll, tucked, filter]);

	if (!place) {
		return (
			<div className="place-browser">
				<p className="place-note">{loading ? `Reading ${file}…` : problem}</p>
			</div>
		);
	}

	return (
		<div className="place-browser">
			<div className="place-browser-head">
				<input
					className="tb place-filter"
					type="search"
					placeholder="Filter by name or class"
					value={filter}
					spellCheck={false}
					onChange={(e) => setFilter(e.target.value)}
				/>
				<button
					className="tb icon-only"
					title={`Read ${file} again`}
					disabled={loading}
					onClick={() => void load()}
				>
					<Icon name="refresh" size={15} />
				</button>
			</div>

			<div className="tree place-tree" ref={treeRef} role="tree">
				{rows.map((row, n) => {
					if (row.kind !== "node") {
						return (
							<div
								key={`more-${n}`}
								className="tree-row place-more"
								style={{ ...depthStyle(row.depth), paddingLeft: 6 + row.depth * 13 + 20 }}
								onClick={() => {
									if (row.kind === "tucked") setTucked((t) => !t);
									else if (row.parent !== undefined) setShowAll((s) => new Set(s).add(row.parent!));
								}}
							>
								<span className="label">{row.text}</span>
							</div>
						);
					}
					const i = row.index;
					const [, name, parent] = nodes![i];
					const cls = classOf(i);
					const kids = children.get(i)?.length ?? 0;
					const isOpen = open.has(i);
					return (
						<div
							key={i}
							data-index={i}
							role="treeitem"
							aria-selected={selected === i}
							aria-expanded={kids && !row.match ? isOpen : undefined}
							className={cx(
								"tree-row place-row",
								selected === i && "selected",
								inspecting === i && "open-doc",
							)}
							style={depthStyle(row.depth)}
							title={`${row.match ? pathTo(nodes!, i).join(".") : name} (${cls}). Double-click for its properties; drag onto a graph for an Instance node.`}
							draggable
							onDragStart={(e) => dragOut(e, { path: pathTo(nodes!, i), className: cls })}
							onClick={() => (row.match ? reveal(i) : pick(i, false))}
							onDoubleClick={() => (row.match ? reveal(i, true) : pick(i, true))}
						>
							{kids && !row.match ? (
								<span
									className="place-twist"
									title="Shift+click to open or close everything inside"
									onClick={(e) => {
										e.stopPropagation();
										if (e.shiftKey) toggleDeep(i);
										else toggle(setOpen, i);
									}}
									onDoubleClick={(e) => e.stopPropagation()}
								>
									<Icon name="chevron" size={14} className="twist" rotate={isOpen ? 0 : -90} />
								</span>
							) : (
								<span className="place-twist" />
							)}
							<ClassIcon className={cls} service={parent === -1} open={isOpen} />
							<span className="label">{name}</span>
							{row.match && parent !== -1 && (
								<span className="place-where">{nodes![parent][1]}</span>
							)}
							<span className="place-class">{cls}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
});

export interface PlacePropertiesProps {
	target: PlaceTarget;
	/** A reference was followed: show that instance instead. */
	onPick: (index: number) => void;
	onOpenFile: (path: string) => void;
	/** The graph a Luau file is generated from, when it is. */
	graphFor: (path: string) => string | undefined;
	onClose: () => void;
}

/** The Properties panel: one instance of the place, read from the host. */
export const PlaceProperties = memo(function PlaceProperties(props: PlacePropertiesProps) {
	const { target, onPick, onOpenFile, graphFor, onClose } = props;
	const [info, setInfo] = useState<PlaceInstanceInfo | null>(null);
	const [problem, setProblem] = useState<string | null>(null);

	useEffect(() => {
		let live = true;
		setProblem(null);
		api.placeInstance(target.stamp, target.index).then(
			(answer) => live && setInfo(answer),
			(err: Error) => live && setProblem(err.message),
		);
		return () => {
			live = false;
		};
	}, [target.stamp, target.index]);

	const graph = target.file ? graphFor(target.file) : undefined;
	return (
		<div className="place-properties">
			<PanelHead sub={target.name}>
				<button
					className="tb icon-only"
					title="Stop showing this instance"
					aria-label="Close"
					onClick={onClose}
				>
					<Icon name="close" size={14} />
				</button>
			</PanelHead>
			<div className="place-props">
				<div
					className="place-props-head"
					draggable
					title="Drag onto a graph for an Instance node at this path, or into Code Block"
					onDragStart={(e) => dragOut(e, { path: target.path, className: target.className })}
				>
					<Ident
						name={target.name}
						kind={target.service ? `${target.className} · service` : target.className}
						color={badgeColor(target.className, target.service)}
						icon={classGlyph(target.className, target.service, false).icon as IconName}
					/>
				</div>
				<div className="place-path">{target.path.join(" › ")}</div>
				{info?.summary && info.index === target.index && (
					<p className="place-summary">{withCode(info.summary)}</p>
				)}
				{target.file ? (
					<div className="place-owner">
						<button className="tb" onClick={() => onOpenFile(target.file!)} title={target.file}>
							Open {target.file.split("/").pop()}
						</button>
						{graph && (
							<button className="tb" onClick={() => onOpenFile(graph)} title={graph}>
								Open its graph
							</button>
						)}
					</div>
				) : (
					isScriptClass(target.className) && (
						<p className="place-summary">No project file writes this script.</p>
					)
				)}
				{problem ? (
					<p className="place-note">{problem}</p>
				) : info && info.index === target.index ? (
					<Properties
						properties={info.properties}
						onPick={onPick}
						path={target.path}
						className={target.className}
					/>
				) : (
					<p className="place-note">Reading…</p>
				)}
			</div>
		</div>
	);
});

type Row =
	| { kind: "node"; index: number; depth: number; match?: boolean }
	| { kind: "more" | "tucked"; depth: number; parent?: number; text: string };

function toggle(set: (f: (s: ReadonlySet<number>) => ReadonlySet<number>) => void, i: number) {
	set((prev) => {
		const next = new Set(prev);
		if (next.has(i)) next.delete(i);
		else next.add(i);
		return next;
	});
}

function pathTo(nodes: readonly [number, string, number, number][], index: number): string[] {
	const names: string[] = [];
	for (let i = index; i !== -1; i = nodes[i][2]) names.unshift(nodes[i][1]);
	return names;
}

/** A class's badge: the colour the project tree draws its glyph in. */
function badgeColor(className: string, service: boolean): string {
	const { tone } = classGlyph(className, service, false);
	const script = /tree-script-(\w+)/.exec(tone);
	if (script) return `var(--tree-script-${script[1]})`;
	if (tone === "tree-folder-special" || tone === "tree-folder-plain") return `var(--${tone})`;
	return "var(--fg-faint)";
}

/** Engine summaries mark code with backticks; show it as code rather than as backticks. */
function withCode(text: string): ReactNode[] {
	return text.split("`").map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part));
}

/** A value as it reads best: true and false as a box, an enum's number set back. */
function PropValue({ value }: { value: string }) {
	if (value === "true" || value === "false") {
		const on = value === "true";
		return (
			<span className={cx("place-bool", on && "on")}>
				<i aria-hidden>{on ? "✓" : ""}</i>
				{value}
			</span>
		);
	}
	const item = /^(.+) \((-?\d+)\)$/.exec(value);
	if (item) {
		return (
			<>
				{item[1]} <span className="place-enum-value">{item[2]}</span>
			</>
		);
	}
	return <>{value}</>;
}

/** The glyph the project tree uses for the same thing, and a cube for the rest. */
function ClassIcon({
	className,
	service,
	open,
}: {
	className: string;
	service: boolean;
	open: boolean;
}) {
	const { icon, tone } = classGlyph(className, service, open);
	return <Icon name={icon as IconName} size={15} className={cx("kind", tone)} />;
}

/** What a drag out of Properties carries: the instance, and the property or attribute. */
export const PROPERTY_DRAG = "application/x-roswaal-property";

export interface PropertyDrag {
	path: string[];
	/** The instance's class, for the member's type on the node it makes. */
	className?: string;
	property?: string;
	attribute?: string;
}

function dragOut(e: React.DragEvent, payload: PropertyDrag) {
	e.dataTransfer.setData(PROPERTY_DRAG, JSON.stringify(payload));
	e.dataTransfer.effectAllowed = "copy";
}

function Properties({
	properties,
	onPick,
	path,
	className,
}: {
	properties: PlaceProperty[];
	onPick: (index: number) => void;
	path: string[];
	className: string;
}) {
	const groups = useMemo(() => groupProperties(properties), [properties]);
	const [shut, setShut] = useState<ReadonlySet<string>>(new Set());

	if (properties.length === 0) return <p className="place-note">No properties Roswaal reads.</p>;
	return (
		<div className="place-groups">
			{groups.map(([category, list]) => (
				<div className="place-group" key={category}>
					<SectionHead
						title={category}
						count={list.length}
						open={!shut.has(category)}
						onToggle={() =>
							setShut((was) => {
								const next = new Set(was);
								if (next.has(category)) next.delete(category);
								else next.add(category);
								return next;
							})
						}
					/>
					{shut.has(category) ? null : category === "Tags" ? (
						<div className="place-tags">
							{list.map((p) => (
								<span className="place-tag" key={p.name}>
									{p.name}
								</span>
							))}
						</div>
					) : (
						list.map((p) => (
							<div
								className="place-prop"
								key={p.name}
								title={`${p.name}: ${p.type}. Drag onto a graph for a Get Member; hold Ctrl as you drop to set it.`}
								draggable
								onDragStart={(e) =>
									dragOut(
										e,
										category === "Attributes"
											? { path, className, attribute: p.name }
											: { path, className, property: p.name },
									)
								}
							>
								<span className="place-prop-name">{p.name}</span>
								<span className="place-prop-value">
									{p.color && <span className="place-swatch" style={{ background: p.color }} />}
									{p.ref !== undefined ? (
										<button className="place-ref" onClick={() => onPick(p.ref!)}>
											<Icon name="instance" size={12} />
											{p.value}
										</button>
									) : (
										<PropValue value={p.value} />
									)}
								</span>
							</div>
						))
					)}
				</div>
			))}
		</div>
	);
}
