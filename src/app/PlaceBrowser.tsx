/**
 * The DataModel browser: the project's place as Studio's Explorer shows it,
 * and the properties of whatever is picked.
 *
 * Read-only. The host parses the place and answers with names and classes;
 * properties come one instance at a time, already formatted, so the editor
 * holds a list of names however large the place is.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type PlaceTree } from "./api.js";
import type { PlaceInstanceInfo, PlaceProperty } from "../core/rbx/browse.js";
import { Icon } from "./icons.jsx";

/** Mirrors `TUCKED` in core/rbx/browse.ts, which the editor does not bundle. */
const TUCKED = 1;

/** Children listed before a "Show all" row, so a folder of parts opens at once. */
const CHILD_LIMIT = 200;

/** Matches listed for a filter; past this the filter wants narrowing. */
const MATCH_LIMIT = 300;

export interface PlaceBrowserProps {
	/** The place file, project-relative. */
	file: string;
	/** Changes whenever the project tree is read again, which is when to look again. */
	refreshKey: unknown;
	/** Opens a project file: the Luau that writes a script. */
	onOpenFile: (path: string) => void;
	/** The graph a Luau file is generated from, when it is. */
	graphFor: (path: string) => string | undefined;
}

type Loaded = Extract<PlaceTree, { stamp: string }>;

export const PlaceBrowser = memo(function PlaceBrowser(props: PlaceBrowserProps) {
	const { file, refreshKey, onOpenFile, graphFor } = props;
	const [place, setPlace] = useState<Loaded | null>(null);
	const [problem, setProblem] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
	const [showAll, setShowAll] = useState<ReadonlySet<number>>(new Set());
	const [tucked, setTucked] = useState(false);
	const [filter, setFilter] = useState("");
	const [selected, setSelected] = useState<number | null>(null);
	const [info, setInfo] = useState<PlaceInstanceInfo | null>(null);
	const treeRef = useRef<HTMLDivElement>(null);
	/** The version of the file on screen: a new one renumbers everything. */
	const stampRef = useRef<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const answer = await api.place();
			if (answer.file === null) {
				setPlace(null);
				setProblem("The project has no place file.");
			} else if ("error" in answer) {
				setPlace(null);
				setProblem(`${answer.file} could not be read: ${answer.error}`);
			} else {
				if (stampRef.current !== null && stampRef.current !== answer.stamp) {
					setOpen(new Set());
					setShowAll(new Set());
					setSelected(null);
					setInfo(null);
				}
				stampRef.current = answer.stamp;
				setPlace(answer);
				setProblem(null);
			}
		} catch (err) {
			setProblem((err as Error).message);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load, file, refreshKey]);

	const nodes = place?.outline.nodes;
	const classes = place?.outline.classes;

	/** Children of each node, and the roots, in the outline's order. */
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

	// The picked instance's properties, asked for when it changes.
	useEffect(() => {
		if (!place || selected === null) {
			setInfo(null);
			return;
		}
		let live = true;
		api.placeInstance(place.stamp, selected).then(
			(answer) => live && setInfo(answer),
			() => {
				// 409: the file changed under the browser. Read it again.
				if (live) void load();
			},
		);
		return () => {
			live = false;
		};
	}, [place, selected, load]);

	/** Picks an instance and opens every folder above it, so it can be seen. */
	const reveal = useCallback((index: number) => {
		if (!nodes) return;
		setSelected(index);
		const above: number[] = [];
		for (let p = nodes[index][2]; p !== -1; p = nodes[p][2]) above.push(p);
		// Past the first children of a big folder too, or it stays unseen.
		setOpen((prev) => new Set([...prev, ...above]));
		setShowAll((prev) => new Set([...prev, ...above]));
		if (nodes[index][3] & TUCKED) setTucked(true);
	}, [nodes]);

	// Keep the picked row in view when it was picked from somewhere else.
	useEffect(() => {
		if (selected === null) return;
		treeRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
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
			if (out.length === MATCH_LIMIT) out.push({ kind: "more", depth: 0, text: `First ${MATCH_LIMIT} shown. Narrow the filter to see the rest.` });
			return out;
		}
		const add = (index: number, depth: number) => {
			out.push({ kind: "node", index, depth });
			if (!open.has(index)) return;
			const kids = children.get(index) ?? [];
			const shown = showAll.has(index) ? kids : kids.slice(0, CHILD_LIMIT);
			for (const kid of shown) add(kid, depth + 1);
			if (shown.length < kids.length) {
				out.push({ kind: "more", depth: depth + 1, parent: index, text: `Show all ${kids.length}` });
			}
		};
		const roots = children.get(-1) ?? [];
		const hidden = roots.filter((i) => nodes[i][3] & TUCKED);
		for (const root of roots) if (!(nodes[root][3] & TUCKED)) add(root, 0);
		if (hidden.length) {
			out.push({
				kind: "tucked", depth: 0,
				text: tucked ? `Hide ${hidden.length} empty services` : `${hidden.length} more services, all empty`,
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

	const scriptFile = selected === null ? undefined : place.scripts[selected];

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
								style={{ paddingLeft: 6 + row.depth * 13 + 20 }}
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
					const owner = place.scripts[i];
					return (
						<div
							key={i}
							data-index={i}
							role="treeitem"
							aria-selected={selected === i}
							aria-expanded={kids && !row.match ? isOpen : undefined}
							className={`tree-row place-row${selected === i ? " selected" : ""}`}
							style={{ paddingLeft: 6 + row.depth * 13 }}
							title={row.match ? pathTo(nodes!, i).join(".") : `${name} (${cls})`}
							onClick={() => (row.match ? reveal(i) : setSelected(i))}
							onDoubleClick={() => {
								if (owner) onOpenFile(owner);
								else if (kids && !row.match) toggle(setOpen, i);
							}}
						>
							{kids && !row.match ? (
								<span
									className="place-twist"
									onClick={(e) => {
										e.stopPropagation();
										toggle(setOpen, i);
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
							{row.match && parent !== -1 && <span className="place-where">{nodes![parent][1]}</span>}
							<span className="place-class">{cls}</span>
						</div>
					);
				})}
			</div>

			{selected !== null && (
				<div className="place-props">
					<div className="place-props-head">
						<ClassIcon className={classOf(selected)} service={nodes![selected][2] === -1} open={false} />
						<span className="place-props-name">{nodes![selected][1]}</span>
						<span className="place-class">{classOf(selected)}</span>
					</div>
					<div className="place-path">{pathTo(nodes!, selected).join(" › ")}</div>
					{info?.summary && <p className="place-summary">{info.summary}</p>}
					{scriptFile ? (
						<div className="place-owner">
							<button className="tb" onClick={() => onOpenFile(scriptFile)} title={scriptFile}>
								Open {scriptFile.split("/").pop()}
							</button>
							{graphFor(scriptFile) && (
								<button className="tb" onClick={() => onOpenFile(graphFor(scriptFile)!)} title={graphFor(scriptFile)}>
									Open its graph
								</button>
							)}
						</div>
					) : (
						isScriptClass(classOf(selected)) && (
							<p className="place-summary">No project file writes this script.</p>
						)
					)}
					{info && info.index === selected ? (
						<Properties properties={info.properties} onPick={reveal} />
					) : (
						<p className="place-note">Reading…</p>
					)}
				</div>
			)}
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

const isScriptClass = (cls: string) => cls === "Script" || cls === "LocalScript" || cls === "ModuleScript";

/** The glyph the project tree uses for the same thing, and a cube for the rest. */
function ClassIcon({ className, service, open }: { className: string; service: boolean; open: boolean }) {
	if (isScriptClass(className)) {
		const tone = className === "Script" ? "server" : className === "LocalScript" ? "local" : "module";
		return <Icon name="luauScript" size={15} className={`kind luau tree-script-${tone}`} />;
	}
	if (service) return <Icon name={open ? "folderOpen" : "folder"} size={15} className="kind tree-folder-special" />;
	if (className === "Folder") return <Icon name={open ? "folderOpen" : "folder"} size={15} className="kind tree-folder-plain" />;
	return <Icon name="instance" size={15} className="kind place-instance" />;
}

/** Studio's Properties headings, in its order; anything else after, by name. */
const CATEGORY_ORDER = ["Data", "Appearance", "Text", "Image", "Behavior", "Part", "Transform", "Pivot", "Collision", "Assembly", "Character", "Physics", "Surface"];
const LAST = ["Other", "Tags", "Attributes"];

function Properties({ properties, onPick }: { properties: PlaceProperty[]; onPick: (index: number) => void }) {
	const groups = useMemo(() => {
		const by = new Map<string, PlaceProperty[]>();
		for (const p of properties) {
			const list = by.get(p.category);
			if (list) list.push(p);
			else by.set(p.category, [p]);
		}
		const rank = (c: string) => {
			const i = CATEGORY_ORDER.indexOf(c);
			if (i !== -1) return i;
			const j = LAST.indexOf(c);
			return j === -1 ? CATEGORY_ORDER.length : CATEGORY_ORDER.length + 1 + j;
		};
		return [...by].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
	}, [properties]);

	if (properties.length === 0) return <p className="place-note">No properties Roswaal reads.</p>;
	return (
		<div className="place-groups">
			{groups.map(([category, list]) => (
				<div className="place-group" key={category}>
					<div className="place-group-name">{category}</div>
					{category === "Tags" ? (
						<div className="place-tags">
							{list.map((p) => <span className="place-tag" key={p.name}>{p.name}</span>)}
						</div>
					) : (
						list.map((p) => (
							<div className="place-prop" key={p.name} title={`${p.name}: ${p.type}`}>
								<span className="place-prop-name">{p.name}</span>
								<span className="place-prop-value">
									{p.color && <span className="place-swatch" style={{ background: p.color }} />}
									{p.ref !== undefined ? (
										<button className="place-ref" onClick={() => onPick(p.ref!)}>{p.value}</button>
									) : (
										p.value
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
