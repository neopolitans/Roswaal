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
	mapNodeRemove, mapNodeUpdate, type MapNode, type NodeMap,
} from "../core/nodemap.js";
import { newId } from "./store.js";

const HISTORY_LIMIT = 50;

export interface MapEditorProps {
	map: NodeMap;
	dirty: boolean;
	onChange: (next: NodeMap) => void;
}

export function MapEditor({ map, dirty, onChange }: MapEditorProps) {
	const [selected, setSelected] = useState<string>(map.root.id);
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
	const [history, setHistory] = useState<NodeMap[]>([]);

	const compiled = useMemo(() => compileNodeMap(map), [map]);
	const current = findMapNode(map.root, selected) ?? map.root;

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
				<h2>Instance</h2>
				<div className="map-fields">
					<label className="field">
						<span>Name</span>
						<input
							className="tb"
							value={current.name}
							onChange={(e) => updateNode(current.id, { name: e.target.value })}
						/>
					</label>

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

					<label className="field">
						<span>Path</span>
						<input
							className="tb"
							placeholder="src/systems"
							value={current.path ?? ""}
							title="A directory or file on disk whose contents fill this instance"
							onChange={(e) => updateNode(current.id, { path: e.target.value || undefined })}
						/>
					</label>

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
				</div>

				<div className="map-actions">
					<button className="tb" onClick={() => addChild(current.id, "Folder", "Folder")}>
						Add folder
					</button>
					{current.id === map.root.id && (
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
				<pre className="map-preview">{compiled.json}</pre>

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
				<span className="name">{node.name}</span>
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
