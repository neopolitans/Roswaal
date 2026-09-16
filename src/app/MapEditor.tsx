/**
 * The node map editor.
 *
 * A `.nodemap` is a tree, not a graph, so this is a tree editor rather than a
 * canvas: the shape of the DataModel on the left, the selected instance's
 * properties and the Rojo project file it will produce on the right. Seeing
 * the generated JSON next to the tree is the point — it is the thing you would
 * otherwise be hand-editing.
 */

import { useMemo, useState } from "react";

import {
	COMMON_SERVICES, CONTAINER_CLASSES, compileNodeMap, findMapNode, mapNodeParent,
	isFilesystemMap, mapNodeRemove, mapNodeUpdate, type MapNode, type NodeMap,
} from "../core/nodemap.js";
import type { TreeEntry } from "./api.js";
import { Icon } from "./icons.jsx";
import { newId } from "./store.js";

const HISTORY_LIMIT = 50;

export interface MapEditorProps {
	map: NodeMap;
	dirty: boolean;
	/** The project tree, used to tell whether a $path actually resolves. */
	tree: TreeEntry[];
	onChange: (next: NodeMap) => void;
}

/** Every path in the project, so a $path can be checked as it is typed. */
function collectPaths(entries: TreeEntry[], into = new Set<string>()): Set<string> {
	for (const entry of entries) {
		into.add(entry.path);
		if (entry.children) collectPaths(entry.children, into);
	}
	return into;
}

export function MapEditor({ map, dirty, tree, onChange }: MapEditorProps) {
	const [selected, setSelected] = useState<string>(map.root.id);
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
	const [history, setHistory] = useState<NodeMap[]>([]);

	const compiled = useMemo(() => compileNodeMap(map), [map]);
	const known = useMemo(() => collectPaths(tree), [tree]);
	const current = findMapNode(map.root, selected) ?? map.root;

	/**
	 * Rojo builds an empty instance for a path that is not there rather than
	 * complaining, so an unresolved path has to be visible here or it is not
	 * visible anywhere until you are staring at Studio.
	 */
	const pathResolves = (value: string | undefined): boolean | null => {
		if (!value) return null;
		return known.has(value.replace(/^\.\//, "").replace(/\/+$/, ""));
	};

	function commit(next: NodeMap) {
		setHistory((h) => [...h.slice(-HISTORY_LIMIT), map]);
		onChange(next);
	}

	function undo() {
		setHistory((h) => {
			const previous = h[h.length - 1];
			if (previous) onChange(previous);
			return h.slice(0, -1);
		});
	}

	function updateNode(id: string, patch: Partial<MapNode>) {
		commit({ ...map, root: mapNodeUpdate(map.root, id, (node) => ({ ...node, ...patch })) });
	}

	/** Which kind of map this is, which decides most of what the panel shows. */
	const filesystem = isFilesystemMap(map);

	/**
	 * A file, whose name carries no extension.
	 *
	 * `.luau` follows from the node being a file, so a name typed with one is
	 * warned about rather than honoured — see `validateFilesystem`.
	 */
	function addFile(parentId: string) {
		const child: MapNode = { id: newId(), name: "module", file: true, children: [] };
		commit({
			...map,
			root: mapNodeUpdate(map.root, parentId, (node) => ({
				...node,
				children: [...node.children, child],
			})),
		});
		setSelected(child.id);
	}

	function addChild(parentId: string, className: string | undefined, name: string) {
		const child: MapNode = { id: newId(), name, className, children: [] };
		commit({
			...map,
			root: mapNodeUpdate(map.root, parentId, (node) => ({
				...node,
				children: [...node.children, child],
			})),
		});
		setSelected(child.id);
	}

	function remove(id: string) {
		if (id === map.root.id) return;
		const parent = mapNodeParent(map.root, id);
		commit({ ...map, root: mapNodeRemove(map.root, id) });
		setSelected(parent?.id ?? map.root.id);
	}

	return (
		<div className="map-editor">
			<div className="map-tree">
				<div className="map-bar">
					<span className={dirty ? "dirty" : undefined}>{map.name}</span>
					<span style={{ flex: 1 }} />
					<button className="tb" disabled={history.length === 0} onClick={undo}>
						Undo
					</button>
				</div>
				<MapRow
					node={map.root}
					depth={0}
					selected={selected}
					collapsed={collapsed}
					onSelect={setSelected}
					onToggle={(id) => {
						const next = new Set(collapsed);
						if (next.has(id)) next.delete(id);
						else next.add(id);
						setCollapsed(next);
					}}
				/>
			</div>

			<div className="map-side">
				<h2>This map</h2>
				<label className="field">
					<span>Describes</span>
					<select
						className="tb"
						value={map.target ?? "roblox"}
						title="What this map is a map of. A DataModel has services and compiles to a Rojo project file; a filesystem has directories and files and compiles to neither."
						onChange={(e) =>
							commit({ ...map, target: e.target.value === "lune" ? "lune" : undefined })
						}
					>
						<option value="roblox">A DataModel — Roblox</option>
						<option value="lune">A filesystem — Lune</option>
					</select>
				</label>

				<h2>{filesystem ? (current.file ? "File" : "Directory") : "Instance"}</h2>
				<div className="map-fields">
					<label className="field">
						<span>Name</span>
						<input
							className="tb"
							value={current.name}
							onChange={(e) => updateNode(current.id, { name: e.target.value })}
						/>
					</label>

					{filesystem && current.id !== map.root.id && (
						<label className="field">
							<span>Kind</span>
							<select
								className="tb"
								value={current.file ? "file" : "directory"}
								onChange={(e) =>
									updateNode(current.id, { file: e.target.value === "file" || undefined })
								}
							>
								<option value="directory">Directory</option>
								<option value="file">File — a .luau Roswaal writes</option>
							</select>
						</label>
					)}

					{!filesystem && (
					<label className="field">
						<span>Class</span>
						<select
							className="tb"
							value={current.className ?? ""}
							onChange={(e) =>
								updateNode(current.id, { className: e.target.value || undefined })
							}
						>
							<option value="">(service — Rojo infers it)</option>
							{CONTAINER_CLASSES.map((c) => (
								<option key={c}>{c}</option>
							))}
							{current.id === map.root.id && <option>DataModel</option>}
						</select>
					</label>
					)}

					{!filesystem && (
					<label className="field">
						<span>Path</span>
						<span className="path-field">
							<input
								className="tb"
								placeholder="src/systems"
								value={current.path ?? ""}
								title="A directory or file on disk whose contents fill this instance"
								onChange={(e) => updateNode(current.id, { path: e.target.value || undefined })}
							/>
							{pathResolves(current.path) === false && (
								<span className="path-missing" title="Nothing is at this path. Rojo will build an empty instance.">
									<Icon name="warning" size={14} />
									not found
								</span>
							)}
						</span>
					</label>
					)}

					{!filesystem && (
					<label className="field">
						<span>Ignore unknown</span>
						<input
							type="checkbox"
							checked={current.ignoreUnknown ?? false}
							onChange={(e) =>
								updateNode(current.id, { ignoreUnknown: e.target.checked || undefined })
							}
						/>
					</label>
					)}
				</div>

				{!filesystem && (
				<ListField
					label="Ignore paths"
					hint="Globs under this instance's path that Rojo should skip, e.g. shared/** — how you stop a nested mapping syncing twice."
					values={current.ignorePaths ?? []}
					placeholder="shared/**"
					onChange={(next) =>
						updateNode(current.id, { ignorePaths: next.length ? next : undefined })
					}
				/>
				)}

				<div className="map-actions">
					{filesystem ? (
						<>
							<button
								className="tb"
								disabled={current.file === true}
								onClick={() => addChild(current.id, undefined, "folder")}
							>
								Add directory
							</button>
							<button
								className="tb"
								disabled={current.file === true}
								onClick={() => addFile(current.id)}
							>
								Add file
							</button>
						</>
					) : (
						<button className="tb" onClick={() => addChild(current.id, "Folder", "Folder")}>
							Add folder
						</button>
					)}
					{!filesystem && current.id === map.root.id && (
						<select
							className="tb"
							value=""
							onChange={(e) => e.target.value && addChild(current.id, undefined, e.target.value)}
						>
							<option value="">Add service…</option>
							{COMMON_SERVICES.map((s) => (
								<option key={s}>{s}</option>
							))}
						</select>
					)}
					<button
						className="tb"
						disabled={current.id === map.root.id}
						onClick={() => remove(current.id)}
					>
						Delete
					</button>
				</div>

				{filesystem ? (
					<>
						<h2>The layout</h2>
						{/* A Lune program has no DataModel, so there is no project
						    file to write. What compiling this does is check that
						    the layout is one Luau can require through -- which is
						    the part Rojo was doing incidentally. */}
						<p className="summary">
							Directories and files, as they sit on disk. Nothing is written when this is
							compiled — a Lune program has no project file, so what compiling does is
							check the layout holds together.
						</p>
					</>
				) : (
					<>
						<h2>Project file</h2>
						<p className="summary">
							Written to <code>{map.output}</code> when this map is compiled.
						</p>
						<label className="field">
							<span>Output</span>
							<input
								className="tb"
								value={map.output}
								onChange={(e) => commit({ ...map, output: e.target.value })}
							/>
						</label>
						<ListField
							label="Project-wide ignores"
							hint="Passed to Rojo as globIgnorePaths, unanchored."
							values={map.globIgnorePaths ?? []}
							placeholder="**/*.spec.luau"
							onChange={(next) =>
								commit({ ...map, globIgnorePaths: next.length ? next : undefined })
							}
						/>
						<pre className="map-preview">{compiled.json}</pre>
					</>
				)}

				{compiled.diagnostics.length > 0 && (
					<div className="map-diagnostics">
						{compiled.diagnostics.map((d, i) => (
							<div key={i} className={`entry ${d.severity}`}>
								<span className="sev">{d.severity}</span>
								<span>{d.message}</span>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

/** A small editable list of strings, for the two kinds of ignore glob. */
function ListField({
	label, hint, values, placeholder, onChange,
}: {
	label: string;
	hint: string;
	values: string[];
	placeholder: string;
	onChange: (next: string[]) => void;
}) {
	return (
		<div className="map-list">
			<div className="map-list-head">
				<span>{label}</span>
				<button className="tb" onClick={() => onChange([...values, ""])}>
					Add
				</button>
			</div>
			<p className="summary">{hint}</p>
			{values.map((value, i) => (
				<div className="map-list-row" key={i}>
					<input
						className="tb"
						value={value}
						placeholder={placeholder}
						onChange={(e) => {
							const next = [...values];
							next[i] = e.target.value;
							onChange(next);
						}}
					/>
					<button
						className="tb"
						title="Remove"
						onClick={() => onChange(values.filter((_, j) => j !== i))}
					>
						×
					</button>
				</div>
			))}
		</div>
	);
}

interface MapRowProps {
	node: MapNode;
	depth: number;
	selected: string;
	collapsed: ReadonlySet<string>;
	onSelect: (id: string) => void;
	onToggle: (id: string) => void;
}

function MapRow(props: MapRowProps) {
	const { node, depth } = props;
	const isCollapsed = props.collapsed.has(node.id);
	const hasChildren = node.children.length > 0;

	return (
		<>
			<div
				className={`map-row${props.selected === node.id ? " selected" : ""}`}
				style={{ paddingLeft: 8 + depth * 14 }}
				onClick={() => props.onSelect(node.id)}
			>
				<span
					className="glyph"
					onClick={(e) => {
						if (!hasChildren) return;
						e.stopPropagation();
						props.onToggle(node.id);
					}}
					style={{
						visibility: hasChildren ? "visible" : "hidden",
						transform: isCollapsed ? "none" : "rotate(90deg)",
					}}
				>
					▸
				</span>
				{/* The extension is shown and not stored: a file is `main` in the
				    map and `main.luau` on disk, and the row is where that is
				    least surprising to see. */}
				<span className="name">{node.name}</span>
				{node.file && <span className="class">.luau</span>}
				{node.className && <span className="class">{node.className}</span>}
				{node.path && <span className="path">{node.path}</span>}
			</div>
			{!isCollapsed &&
				node.children.map((child) => (
					<MapRow key={child.id} {...props} node={child} depth={depth + 1} />
				))}
		</>
	);
}
