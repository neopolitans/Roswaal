/**
 * The DataModel browser: the project's place as Studio's Explorer shows it.
 * And, in a panel of its own, the properties of an instance opened from it.
 *
 * The host parses the place and answers with names and classes; properties
 * come one instance at a time, already formatted, so the editor holds a list
 * of names however large the place is.
 *
 * Read-only unless Modify DataModel Instances is on. Then a property the host
 * offers an edit for is changed in Properties, and the host writes it into
 * the place file.
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
import type { CFrameEdit, PropertyEdit } from "../core/rbx/edit.js";
import { isSubclassOf } from "../core/roblox.js";
import { readOnlyToScripts } from "../core/robloxEngine.js";
import { api, type PlaceTree } from "./api.js";
import { PanelHead } from "./Cards.jsx";
import { cx } from "./cx.js";
import { Icon, type IconName } from "./icons.jsx";
import { AddButton, depthStyle, Ident, SectionHead } from "./PanelParts.jsx";
import { currentOutline, rememberOutline } from "./placeOutline.js";
import type { Dialogs } from "./useDialogs.js";
import { ValuePicker } from "./ValuePicker.jsx";

/** Mirrors `TUCKED` in core/rbx/browse.ts, which the editor does not bundle. */
const TUCKED = 1;

/** Children listed before a "Show all" row, so a folder of parts opens at once. */
const CHILD_LIMIT = 200;

/** Matches listed for a filter; past this the filter wants narrowing. */
const MATCH_LIMIT = 300;

/**
 * Versions of the place a property change here wrote. A change renames
 * nothing, so the outline of one of these is the outline on screen, and
 * reading it again keeps what was open and picked.
 */
const writtenStamps = new Set<string>();

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
	/** Studio had the place open when it was read. */
	studio?: boolean;
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
	/** The version of the place a property change last wrote: read it again. */
	written?: string | null;
}

type Loaded = Extract<PlaceTree, { stamp: string }>;

export const PlaceBrowser = memo(function PlaceBrowser(props: PlaceBrowserProps) {
	const { file, refreshKey, onInspect, inspecting, reveal: revealRequest, written } = props;
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
				if (
					stampRef.current !== null &&
					stampRef.current !== answer.stamp &&
					!writtenStamps.has(answer.stamp)
				) {
					setOpen(new Set());
					setShowAll(new Set());
					setSelected(null);
					onInspect(null, false);
				}
				stampRef.current = answer.stamp;
				setPlace(answer);
				rememberOutline(answer.outline);
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
	}, [load, file, refreshKey, written]);

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
				...(place!.studio ? { studio: true } : {}),
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
	/** Modify DataModel Instances is on: properties the host can write are changed here. */
	editable?: boolean;
	/** Asks before the first change to the place; resolves to whether to go on. */
	confirmEdit?: (target: PlaceTarget) => Promise<boolean>;
	/** A change was written: the place's new version, and the backup kept first, if one was. */
	onWritten?: (stamp: string, backup?: string) => void;
	/** For an attribute's name and type, and a tag's name, as one is added. */
	ask?: Dialogs["ask"];
}

/** The Properties panel: one instance of the place, read from the host. */
export const PlaceProperties = memo(function PlaceProperties(props: PlacePropertiesProps) {
	const { target, onPick, onOpenFile, graphFor, onClose, editable, confirmEdit, onWritten, ask } =
		props;
	const [info, setInfo] = useState<PlaceInstanceInfo | null>(null);
	const [problem, setProblem] = useState<string | null>(null);
	/** The property being written, and the last change refused, by property name. */
	const [busy, setBusy] = useState<string | null>(null);
	const [refused, setRefused] = useState<{ name: string; message: string } | null>(null);
	const [backup, setBackup] = useState<string | null>(null);
	// The version a change is made against: the last one written here, or the target's.
	const stamp = useRef(target.stamp);
	useEffect(() => {
		stamp.current = target.stamp;
	}, [target.stamp]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: another instance clears the last refusal.
	useEffect(() => setRefused(null), [target.index]);

	const begin = useCallback(
		async () => (confirmEdit ? confirmEdit(target) : false),
		[confirmEdit, target],
	);
	/** One change written, under `label` for its busy mark and its refusal. */
	const run = useCallback(
		async (
			label: string,
			write: (
				stamp: string,
			) => Promise<{ stamp: string; instance: PlaceInstanceInfo; backup?: string }>,
		) => {
			setBusy(label);
			setRefused(null);
			try {
				const answer = await write(stamp.current);
				writtenStamps.add(answer.stamp);
				stamp.current = answer.stamp;
				setInfo(answer.instance);
				if (answer.backup) setBackup(answer.backup);
				onWritten?.(answer.stamp, answer.backup);
			} catch (err) {
				setRefused({ name: label, message: errorMessage(err) });
			} finally {
				setBusy(null);
			}
		},
		[onWritten],
	);
	const commit = useCallback(
		async (property: PlaceProperty, value: unknown) => {
			const edit = property.edit;
			if (!edit) return;
			await run(property.name, (s) =>
				edit.attribute
					? api.placeAttribute(s, target.index, { name: edit.stored, value })
					: api.placeProperty(s, target.index, edit.stored, value),
			);
		},
		[run, target.index],
	);
	const addAttribute = useCallback(async () => {
		if (!ask || !(await begin())) return;
		const answer = await ask({
			kind: "form",
			title: "Add an attribute",
			message: `Added to ${target.name} in the place file, with Studio's default value.`,
			fields: [
				{ id: "name", kind: "text", label: "Name", value: "" },
				{
					id: "type",
					kind: "choice",
					label: "Type",
					value: "string",
					options: ["string", "number", "boolean", "Vector3", "Color3"].map((value) => ({
						value,
						label: value,
					})),
				},
			],
			confirmLabel: "Add",
		});
		if (typeof answer !== "string") return;
		const { name, type } = JSON.parse(answer) as { name?: string; type?: string };
		await run(ATTRIBUTES, (s) =>
			api.placeAttribute(s, target.index, { name: String(name ?? "").trim(), add: type }),
		);
	}, [ask, begin, run, target.index, target.name]);
	const removeAttribute = useCallback(
		async (name: string) => {
			if (await begin())
				await run(name, (s) => api.placeAttribute(s, target.index, { name, remove: true }));
		},
		[begin, run, target.index],
	);
	const addTag = useCallback(async () => {
		if (!ask || !(await begin())) return;
		const tag = await ask({
			kind: "prompt",
			title: "Add a tag",
			label: "Tag",
			hint: `Added to ${target.name} in the place file.`,
			confirmLabel: "Add",
		});
		if (typeof tag === "string") await run(TAGS, (s) => api.placeTag(s, target.index, tag));
	}, [ask, begin, run, target.index, target.name]);
	const removeTag = useCallback(
		async (tag: string) => {
			if (await begin()) await run(TAGS, (s) => api.placeTag(s, target.index, tag, true));
		},
		[begin, run, target.index],
	);

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
				{editable && target.studio && (
					<p className="place-summary place-studio">
						Studio has this place open. Its next save puts back the values it has.
					</p>
				)}
				{editable && backup && (
					<p className="place-summary" title={backup}>
						Backup: {backup.split("/").pop()}
					</p>
				)}
				{problem ? (
					<p className="place-note">{problem}</p>
				) : info && info.index === target.index ? (
					<Properties
						properties={info.properties}
						onPick={onPick}
						path={target.path}
						className={target.className}
						edits={
							editable
								? {
										busy,
										refused,
										begin,
										commit,
										...(info.attributes && ask ? { addAttribute, removeAttribute } : {}),
										...(info.tags && ask ? { addTag, removeTag } : {}),
									}
								: undefined
						}
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

/** What Properties needs to change values, when Modify DataModel Instances is on. */
interface Edits {
	busy: string | null;
	refused: { name: string; message: string } | null;
	begin: () => Promise<boolean>;
	commit: (property: PlaceProperty, value: unknown) => Promise<void>;
	/** Where the place keeps attributes Roswaal can rewrite: adding and removing them. */
	addAttribute?: () => Promise<void>;
	removeAttribute?: (name: string) => Promise<void>;
	/** Where the place keeps the instance's tags. */
	addTag?: () => Promise<void>;
	removeTag?: (tag: string) => Promise<void>;
}

/** The busy and refusal labels for changes that are not one property's. */
const ATTRIBUTES = "::attributes";
const TAGS = "::tags";

function Properties({
	properties,
	onPick,
	path,
	className,
	edits,
}: {
	properties: PlaceProperty[];
	onPick: (index: number) => void;
	path: string[];
	className: string;
	edits?: Edits;
}) {
	const groups = useMemo(() => {
		const found = groupProperties(properties);
		// Shown empty where one can be added, so there is somewhere to add it.
		for (const [category, can] of [
			["Attributes", edits?.addAttribute],
			["Tags", edits?.addTag],
		] as const) {
			if (can && !found.some(([c]) => c === category)) found.push([category, []]);
		}
		return found;
	}, [properties, edits?.addAttribute, edits?.addTag]);
	const [shut, setShut] = useState<ReadonlySet<string>>(new Set());

	if (groups.length === 0) return <p className="place-note">No properties Roswaal reads.</p>;
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
					>
						{category === "Attributes" && edits?.addAttribute && (
							<AddButton title="Add an attribute" onClick={() => void edits.addAttribute?.()} />
						)}
						{category === "Tags" && edits?.addTag && (
							<AddButton title="Add a tag" onClick={() => void edits.addTag?.()} />
						)}
					</SectionHead>
					{edits?.refused &&
						((category === "Attributes" && edits.refused.name === ATTRIBUTES) ||
							(category === "Tags" && edits.refused.name === TAGS)) && (
							<p className="place-prop-refused" role="alert">
								{edits.refused.message}
							</p>
						)}
					{shut.has(category) ? null : category === "Tags" ? (
						<div className="place-tags">
							{list.map((p) => (
								<span className="place-tag" key={p.name}>
									{p.name}
									{edits?.removeTag && (
										<button
											className="place-tag-remove"
											title={`Remove the tag ${p.name}`}
											aria-label={`Remove the tag ${p.name}`}
											disabled={edits.busy !== null}
											onClick={() => void edits.removeTag?.(p.name)}
										>
											<Icon name="close" size={10} />
										</button>
									)}
								</span>
							))}
						</div>
					) : (
						list.map((p) => (
							<div
								className={cx(
									"place-prop",
									edits && p.edit && "place-prop-editable",
									category === "Attributes" &&
										edits?.removeAttribute &&
										!/^RBX/i.test(p.name) &&
										"place-prop--removable",
								)}
								key={p.name}
								title={
									category !== "Attributes" && readOnlyToScripts(className, p.name)
										? `${p.name}: ${p.type}. Drag onto a graph for a Get Member. Read-only: a script can read it, not set it.`
										: `${p.name}: ${p.type}. Drag onto a graph for a Get Member; hold Ctrl as you drop to set it.`
								}
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
									{edits && p.edit ? (
										<PropEditor
											key={`${p.name}:${p.value}`}
											property={p}
											edit={p.edit}
											busy={edits.busy === p.name}
											begin={edits.begin}
											commit={(value) => edits.commit(p, value)}
											onGo={p.ref !== undefined ? () => onPick(p.ref!) : undefined}
										/>
									) : (
										<>
											{p.color && <span className="place-swatch" style={{ background: p.color }} />}
											{p.ref !== undefined ? (
												<button className="place-ref" onClick={() => onPick(p.ref!)}>
													<Icon name="instance" size={12} />
													{p.value}
												</button>
											) : (
												<PropValue value={p.value} />
											)}
										</>
									)}
								</span>
								{category === "Attributes" && edits?.removeAttribute && !/^RBX/i.test(p.name) && (
									<button
										className="place-prop-remove"
										title={`Remove the attribute ${p.name}`}
										aria-label={`Remove the attribute ${p.name}`}
										disabled={edits.busy !== null}
										onClick={() => void edits.removeAttribute?.(p.name)}
									>
										<Icon name="close" size={11} />
									</button>
								)}
								{edits?.refused?.name === p.name && (
									<span className="place-prop-refused" role="alert">
										{edits.refused.message}
									</span>
								)}
							</div>
						))
					)}
				</div>
			))}
		</div>
	);
}

/** A value as it is first put in its field: a float to the digits it holds. */
function fieldText(edit: PropertyEdit, type: string): string {
	const v = edit.value;
	if (edit.kind === "color") return (v as number[]).join(", ");
	if (edit.kind === "number" && type === "Float32")
		return String(Number((v as number).toPrecision(7)));
	return String(v);
}

/** What a field holds, as the value to write; or why it is not one. */
function parseField(
	edit: PropertyEdit,
	name: string,
	text: string,
): { value: unknown } | { why: string } {
	const t = text.trim();
	switch (edit.kind) {
		case "string":
			return { value: text };
		case "color": {
			const parts = t
				.split(/[\s,]+/)
				.filter(Boolean)
				.map(Number);
			return parts.length === 3 && parts.every((c) => Number.isInteger(c) && c >= 0 && c <= 255)
				? { value: parts }
				: { why: `${name} is three numbers from 0 to 255` };
		}
		default: {
			const n = Number(t);
			if (t === "" || !Number.isFinite(n)) return { why: `${name} is a number` };
			if (edit.kind !== "number" && !Number.isInteger(n))
				return { why: `${name} is a whole number` };
			return { value: n };
		}
	}
}

const hexOf = (rgb: number[]) => `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

/** A component as it is first put in its field: whole, or a float to the digits it holds. */
const componentText = (n: number, whole: boolean) =>
	whole ? String(n) : String(Number(n.toPrecision(7)));

/** The degrees of an orientation, to the thousandth Properties shows. */
const degrees = (n: number) => {
	const r = Math.round(n * 1000) / 1000;
	return Object.is(r, -0) ? 0 : r;
};

interface FieldRow {
	/** "Position" or "Orientation", for a CFrame; a vector's one row has none. */
	label?: string;
	fields: string[];
	texts: string[];
	whole: boolean[];
}

/**
 * A vector's components, or a CFrame's position and orientation, a field
 * each. Enter in any of them writes them all, Escape puts them back, and
 * leaving the group writes them. A CFrame's orientation is sent only when it
 * was changed, so moving a part keeps its rotation exactly.
 */
function FieldsEditor({
	property,
	edit,
	commit,
	onDone,
}: {
	property: PlaceProperty;
	edit: PropertyEdit;
	commit: (value: unknown) => Promise<void>;
	onDone: () => void;
}) {
	const group = useRef<HTMLDivElement>(null);
	const settled = useRef(false);
	const [why, setWhy] = useState<string | null>(null);

	const rows: FieldRow[] =
		edit.kind === "cframe"
			? (() => {
					const cf = edit.value as CFrameEdit;
					return [
						{
							label: "Position",
							fields: ["X", "Y", "Z"],
							texts: cf.position.map((n) => componentText(n, false)),
							whole: [false, false, false],
						},
						{
							label: "Orientation",
							fields: ["X", "Y", "Z"],
							texts: cf.orientation.map((n) => String(degrees(n))),
							whole: [false, false, false],
						},
					];
				})()
			: [
					{
						fields: edit.fields ?? [],
						texts: (edit.value as number[]).map((n, i) => componentText(n, !!edit.whole?.[i])),
						whole: (edit.fields ?? []).map((_, i) => !!edit.whole?.[i]),
					},
				];
	const initial = rows.flatMap((row) => row.texts);

	const finish = () => {
		if (settled.current || !group.current) return;
		const texts = [...group.current.querySelectorAll("input")].map((input) => input.value.trim());
		if (texts.every((t, i) => t === initial[i])) {
			settled.current = true;
			onDone();
			return;
		}
		const labels = rows.flatMap((row) =>
			row.fields.map((f) => (row.label ? `${row.label} ${f}` : f)),
		);
		const wholes = rows.flatMap((row) => row.whole);
		const numbers: number[] = [];
		for (const [i, t] of texts.entries()) {
			const n = Number(t);
			if (t === "" || !Number.isFinite(n)) return setWhy(`${labels[i]} is a number`);
			if (wholes[i] && !Number.isInteger(n)) return setWhy(`${labels[i]} is a whole number`);
			numbers.push(n);
		}
		settled.current = true;
		onDone();
		if (edit.kind === "cframe") {
			const turned = texts.slice(3).some((t, i) => t !== initial[3 + i]);
			void commit({
				position: numbers.slice(0, 3),
				...(turned ? { orientation: numbers.slice(3, 6) } : {}),
			});
		} else {
			void commit(numbers);
		}
	};

	let first = true;
	return (
		<div
			ref={group}
			className="place-fields"
			onBlur={(e) => {
				if (!group.current?.contains(e.relatedTarget as Node | null)) finish();
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") finish();
				else if (e.key === "Escape") {
					settled.current = true;
					onDone();
				}
			}}
		>
			{rows.map((row) => (
				<div className="place-fields-row" key={row.label ?? "value"}>
					{row.label && <span className="place-fields-label">{row.label}</span>}
					<div className={cx("place-fields-grid", row.fields.length === 4 && "place-fields-four")}>
						{row.fields.map((field, i) => {
							const focus = first;
							first = false;
							return (
								<label className="place-field" key={field}>
									<span>{field}</span>
									<input
										className="tb place-edit-field"
										autoFocus={focus}
										defaultValue={row.texts[i]}
										inputMode="decimal"
										spellCheck={false}
										aria-label={`${property.name} ${row.label ? `${row.label} ` : ""}${field}`}
										onFocus={(e) => e.currentTarget.select()}
										onChange={() => setWhy(null)}
									/>
								</label>
							);
						})}
					</div>
				</div>
			))}
			{why && <span className="place-prop-refused">{why}</span>}
		</div>
	);
}

/** Where a reference's picker says it points at nothing. */
const NOTHING = "none";

/**
 * What a reference may point at: every instance in the place of the class
 * the property takes, by its path, grouped under its service, and nothing.
 * A Model's PrimaryPart offers the place's BaseParts; an ObjectValue's Value
 * offers everything.
 */
function RefPicker({
	edit,
	current,
	onPick,
	onClose,
}: {
	edit: PropertyEdit;
	current: number | undefined;
	onPick: (index: number | null) => void;
	onClose: () => void;
}) {
	const outline = currentOutline();
	const found = useMemo(() => {
		const paths: string[] = [];
		const options: string[] = [NOTHING];
		const rootOf: number[] = [];
		outline?.nodes.forEach(([cls, name, parent], i) => {
			paths[i] = parent < 0 ? name : `${paths[parent]}.${name}`;
			rootOf[i] = parent < 0 ? i : rootOf[parent];
			if (isSubclassOf(outline.classes[cls], edit.refClass)) options.push(String(i));
		});
		return { paths, rootOf, options };
	}, [outline, edit.refClass]);
	const node = (value: string) => outline?.nodes[Number(value)];
	return (
		<ValuePicker
			what={edit.stored}
			options={found.options}
			value={current === undefined ? NOTHING : String(current)}
			groupOf={(value) =>
				value === NOTHING ? "Nothing" : found.paths[found.rootOf[Number(value)]]
			}
			groupsFirst={["Nothing"]}
			labelOf={(value) => {
				if (value === NOTHING) return "None";
				const path = found.paths[Number(value)];
				const root = found.paths[found.rootOf[Number(value)]];
				return path === root ? path : path.slice(root.length + 1);
			}}
			detailOf={(value) =>
				value === NOTHING
					? `${edit.stored} points at nothing`
					: `${found.paths[Number(value)]} · ${outline?.classes[node(value)?.[0] ?? 0] ?? ""}`
			}
			onPick={(value) => {
				// Enter on text that matches nothing hands back the text: no instance.
				if (value === NOTHING) onPick(null);
				else if (found.options.includes(value)) onPick(Number(value));
			}}
			onClose={onClose}
		/>
	);
}

/**
 * A value that can be changed: a box to tick, a list to pick from, or the
 * value itself to click and type over. Enter or leaving the field writes it;
 * Escape puts it back. Asks first, through `begin`, the first time.
 */
function PropEditor({
	property,
	edit,
	busy,
	begin,
	commit,
	onGo,
}: {
	property: PlaceProperty;
	edit: PropertyEdit;
	busy: boolean;
	begin: () => Promise<boolean>;
	commit: (value: unknown) => Promise<void>;
	/** For a reference that points at something: go to it, as one that cannot be changed does. */
	onGo?: () => void;
}) {
	const [editing, setEditing] = useState(false);
	const [why, setWhy] = useState<string | null>(null);
	const colour = useRef<HTMLInputElement>(null);
	// Enter or Escape settles the field; the blur that may follow its removal does not again.
	const settled = useRef(false);
	const start = async () => {
		if (busy || !(await begin())) return;
		settled.current = false;
		setEditing(true);
	};

	// The colour picker's change, not its input: one write when it closes,
	// not one for every colour dragged through.
	useEffect(() => {
		const input = colour.current;
		if (!input) return;
		const picked = () => {
			const hex = input.value.slice(1);
			const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
			if (rgb.join() !== (edit.value as number[]).join()) void commit(rgb);
		};
		input.addEventListener("change", picked);
		return () => input.removeEventListener("change", picked);
	}, [edit.value, commit]);

	if (edit.kind === "ref") {
		return (
			<span className="place-ref-edit">
				<button className="place-edit" disabled={busy} onClick={start}>
					{edit.value === "" ? (
						<span className="place-empty">none</span>
					) : (
						<>
							<Icon name="instance" size={12} />
							{edit.value as string}
						</>
					)}
				</button>
				{onGo && (
					<button
						className="place-ref place-ref-go"
						title={`Go to ${edit.value}`}
						aria-label={`Go to ${edit.value}`}
						onClick={onGo}
					>
						<Icon name="chevron" size={12} rotate={-90} />
					</button>
				)}
				{editing && (
					<RefPicker
						edit={edit}
						current={property.ref}
						onPick={(index) => {
							setEditing(false);
							if (index !== (property.ref ?? null)) void commit(index);
						}}
						onClose={() => setEditing(false)}
					/>
				)}
			</span>
		);
	}

	if (edit.kind === "bool") {
		const on = edit.value === true;
		return (
			<button
				className={cx("place-bool place-edit", on && "on")}
				disabled={busy}
				aria-pressed={on}
				onClick={async () => {
					if (await begin()) await commit(!on);
				}}
			>
				<i aria-hidden>{on ? "✓" : ""}</i>
				{String(on)}
			</button>
		);
	}

	if (edit.kind === "vector" || edit.kind === "cframe") {
		if (!editing) {
			return (
				<button className="place-edit" disabled={busy} onClick={start}>
					<PropValue value={property.value} />
				</button>
			);
		}
		return (
			<FieldsEditor
				property={property}
				edit={edit}
				commit={commit}
				onDone={() => setEditing(false)}
			/>
		);
	}

	if (edit.kind === "enum") {
		if (!editing) {
			return (
				<button className="place-edit" disabled={busy} onClick={start}>
					<PropValue value={property.value} />
				</button>
			);
		}
		return (
			<select
				className="tb place-edit-field"
				autoFocus
				value={edit.value as number}
				onChange={(e) => {
					setEditing(false);
					void commit(Number(e.target.value));
				}}
				onBlur={() => setEditing(false)}
				onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
			>
				{(edit.items ?? []).map((item) => (
					<option key={item.value} value={item.value}>
						{item.name}
					</option>
				))}
			</select>
		);
	}

	const swatch =
		edit.kind === "color" ? (
			<input
				ref={colour}
				type="color"
				className="place-colour"
				value={hexOf(edit.value as number[])}
				disabled={busy}
				aria-label={`Pick ${property.name}`}
				onClick={async (e) => {
					// Asked first; the picker opens on the next click.
					if (!(await begin())) e.preventDefault();
				}}
				onChange={() => {}}
			/>
		) : null;

	if (!editing) {
		return (
			<>
				{swatch}
				<button className="place-edit" disabled={busy} onClick={start}>
					{edit.kind === "string" && property.value === "" ? (
						<span className="place-empty">empty</span>
					) : (
						<PropValue value={property.value} />
					)}
				</button>
			</>
		);
	}

	const initial = fieldText(edit, property.type);
	const finish = (text: string) => {
		if (settled.current) return;
		if (text === initial) {
			settled.current = true;
			setEditing(false);
			return;
		}
		const parsed = parseField(edit, property.name, text);
		if ("why" in parsed) {
			setWhy(parsed.why);
			return;
		}
		settled.current = true;
		setEditing(false);
		void commit(parsed.value);
	};
	return (
		<>
			{swatch}
			<input
				className="tb place-edit-field"
				autoFocus
				defaultValue={initial}
				inputMode={edit.kind === "string" ? "text" : edit.kind === "number" ? "decimal" : "numeric"}
				spellCheck={false}
				aria-label={property.name}
				aria-invalid={why ? true : undefined}
				title={why ?? undefined}
				onFocus={(e) => e.currentTarget.select()}
				onChange={() => setWhy(null)}
				onKeyDown={(e) => {
					if (e.key === "Enter") finish(e.currentTarget.value);
					else if (e.key === "Escape") {
						settled.current = true;
						setEditing(false);
					}
				}}
				onBlur={(e) => finish(e.currentTarget.value)}
			/>
			{why && <span className="place-prop-refused">{why}</span>}
		</>
	);
}
