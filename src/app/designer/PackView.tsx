/**
 * One pack, open: its nodes down the side, and the chosen one beside them.
 *
 * A JSON pack's node opens in the node editor. A built-in category and a Luau
 * pack open the same way but draw the node rather than editing it, and say why
 * — a missing button reads as a missing feature, and a greyed one with its
 * reason reads as a rule.
 *
 * ## Leaving a node with edits in it
 *
 * The designer has no undo history across nodes, so choosing another node with
 * edits unsaved asks first, in the list itself, rather than throwing the edits
 * away or keeping a hidden draft nobody can find again.
 *
 * ## What a node's logic can be built from
 *
 * The built-ins, the rest of this pack, and the nodes of the packs this one
 * **requires**, which are listed and edited here. A required pack the project
 * does not have is marked, and the node editor says so; a node already built
 * from it keeps the template it compiled to, so it still works where it is
 * placed — it just cannot be recompiled until the pack is back.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import type { LogicGraph } from "../../core/compiler/logic.js";
import { previewOf, previewSvg, type PreviewOptions } from "../../core/docs/preview.js";
import { BUILTIN_NODES, parseNodePack } from "../../core/nodes/index.js";
import { namespaceFor } from "../../core/packs.js";
import type { NodeDef, Target } from "../../core/schema.js";
import { api, type PackFile } from "../api.js";
import { Icon } from "../icons.jsx";
import { NODE } from "../layers.js";
import { nodeColor, pinColor } from "../palette.js";
import type { PackNode } from "./draft.js";
import { NodeEditor } from "./NodeEditor.jsx";
import { useCompact } from "../Workspace.jsx";
import { targetsLabel, type Notify, type OpenPack } from "./PackBrowser.jsx";

const PREVIEW: PreviewOptions = { geometry: NODE, nodeColor, pinColor, scale: 2 };

/** What is in the main area: a saved node by id, a new node, or nothing chosen. */
type Chosen = { id: string } | { fresh: number } | null;

export interface PackViewProps {
	open: OpenPack;
	packs: PackFile[];
	target: Target | null;
	onBack: () => void;
	/** The pack changed on disk; read the pack list again. */
	onChanged: () => Promise<void>;
	notify: Notify;
}

export function PackView({ open, packs, target, onBack, onChanged, notify }: PackViewProps) {
	const [defs, setDefs] = useState<NodeDef[] | null>(null);
	/** Each node's saved logic graph, by id, which the loader's defs leave out. */
	const [logicById, setLogicById] = useState<Map<string, LogicGraph>>(new Map());
	const [chosen, setChosen] = useState<Chosen>(null);
	const [dirty, setDirty] = useState(false);
	const [pending, setPending] = useState<Chosen | "back" | undefined>(undefined);
	/**
	 * On a phone or a tablet the node list is a drawer over the editor, as the
	 * editor's panels are: beside it, it left a phone's editor sixty pixels
	 * wide. Out to begin with, since nothing is open until a node is picked.
	 */
	const compact = useCompact();
	const [listOpen, setListOpen] = useState(true);
	const [requiredDefs, setRequiredDefs] = useState<NodeDef[]>([]);

	const pack = open.kind === "project" ? packs.find((p) => p.path === open.path) : undefined;
	const title = open.kind === "builtin" ? open.category : (pack?.name ?? open.path);
	const readOnly =
		open.kind === "builtin"
			? "Built-in nodes are part of Roswaal, and are here to look at rather than change."
			: pack?.format === "luau"
				? "A Luau pack is written by hand and opens read-only. Save as JSON pack makes an editable copy."
				: null;

	const load = useCallback(async (): Promise<{ defs: NodeDef[]; logic: Map<string, LogicGraph> }> => {
		if (open.kind === "builtin") {
			return { defs: BUILTIN_NODES.filter((def) => def.category === open.category), logic: new Map() };
		}
		const { nodes } = await api.readPack(open.path);
		const logic = new Map<string, LogicGraph>();
		for (const node of nodes) {
			if (typeof node.id === "string" && node.logic && typeof node.logic === "object") {
				logic.set(node.id, node.logic as LogicGraph);
			}
		}
		return { defs: parseNodePack({ nodes }, open.path).defs, logic };
	}, [open]);

	const apply = (found: { defs: NodeDef[]; logic: Map<string, LogicGraph> }) => {
		setDefs(found.defs);
		setLogicById(found.logic);
	};

	useEffect(() => {
		setDefs(null);
		setChosen(null);
		load().then(
			(found) => {
				apply(found);
				if (found.defs[0]) setChosen({ id: found.defs[0].id });
			},
			(err: Error) => notify(err.message, "failed"),
		);
	}, [load, notify]);

	const requires = pack?.requires ?? [];
	const requiresKey = requires.join("|");
	const missingRequires = useMemo(
		() => requires.filter((name) => !packs.some((p) => p.name === name)),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[requiresKey, packs],
	);

	// The required packs' nodes, for the logic's node menu and its compiler.
	useEffect(() => {
		let cancelled = false;
		const paths = requires
			.map((name) => packs.find((p) => p.name === name)?.path)
			.filter((p): p is string => p !== undefined);
		Promise.all(paths.map((path) => api.readPack(path).then(({ nodes }) => parseNodePack({ nodes }, path).defs))).then(
			(lists) => !cancelled && setRequiredDefs(lists.flat()),
			(err: Error) => notify(err.message, "failed"),
		);
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [requiresKey, packs, notify]);

	/** Moves somewhere else, asking first when the node has edits in it. */
	const go = (next: Chosen | "back") => {
		if (dirty && !readOnly) {
			setPending(next);
			return;
		}
		setPending(undefined);
		setDirty(false);
		if (next === "back") onBack();
		else setChosen(next);
	};

	const current = chosen && "id" in chosen ? defs?.find((def) => def.id === chosen.id) : undefined;
	const original = useMemo<PackNode | null>(() => {
		if (!current) return null;
		const logic = logicById.get(current.id);
		return logic ? { ...current, logic } : current;
	}, [current, logicById]);
	const svg = useMemo(() => (readOnly && current ? previewSvg(previewOf(current), PREVIEW) : ""), [readOnly, current]);
	const onDirty = useCallback((value: boolean) => setDirty(value), []);

	// This pack's other nodes can be built from too.
	const buildableDefs = useMemo(
		() => [...(defs ?? []).filter((d) => d.id !== current?.id), ...requiredDefs],
		[defs, current, requiredDefs],
	);

	const afterSave = async (saved: NodeDef) => {
		apply(await load());
		setDirty(false);
		setChosen({ id: saved.id });
		await onChanged();
	};

	const afterDelete = async () => {
		const found = await load();
		apply(found);
		setDirty(false);
		setChosen(found.defs[0] ? { id: found.defs[0].id } : null);
		await onChanged();
	};

	const setRequires = async (next: string[]) => {
		if (!pack) return;
		try {
			await api.setPackRequires(pack.path, next);
			await onChanged();
		} catch (err) {
			notify((err as Error).message, "failed");
		}
	};

	return (
		<div className={`pack-view${compact ? " compact" : ""}`}>
			{compact && (
				<div className="pack-compact-bar">
					<button
						className={`tb with-icon${listOpen ? " on" : ""}`}
						aria-expanded={listOpen}
						onClick={() => setListOpen((open) => !open)}
					>
						<Icon name="chevron" size={14} rotate={listOpen ? 90 : -90} />
						{title}
					</button>
					<span className="pack-compact-current">{current?.title ?? ""}</span>
				</div>
			)}
			{compact && listOpen && <div className="pack-scrim" onClick={() => setListOpen(false)} />}
			<aside
				className={`pack-nodes${compact ? (listOpen ? " drawer drawer-open" : " drawer") : ""}`}
				inert={compact && !listOpen}
			>
				<button className="tb with-icon pack-back" onClick={() => go("back")}>
					<Icon name="chevron" size={14} rotate={90} />
					Node packs
				</button>
				<h1>{title}</h1>
				<div className="pack-badges">
					<span className="badge">
						{open.kind === "builtin" ? "Built in" : pack?.format === "luau" ? "Luau · read-only" : "JSON"}
					</span>
					{pack && <span className="badge">{targetsLabel(pack.targets)}</span>}
				</div>
				{readOnly && <p className="hint">{readOnly}</p>}
				{target && pack?.targets && !pack.targets.includes(target) && (
					<p className="designer-failed">
						This project compiles for {target === "lune" ? "Lune" : "Roblox"}, and these nodes do not run there.
					</p>
				)}

				{pack && !readOnly && (
					<div className="pack-requires" title="Packs whose nodes this pack's logic can be built from">
						<span className="tool-label">Requires</span>
						{requires.length === 0 && <span className="hint">Nothing else</span>}
						{requires.map((name) => (
							<span
								key={name}
								className={`badge${missingRequires.includes(name) ? " warn" : ""}`}
								title={missingRequires.includes(name) ? "This project does not have it" : undefined}
							>
								{name}
								<button
									className="badge-remove"
									aria-label={`Stop requiring ${name}`}
									onClick={() => void setRequires(requires.filter((r) => r !== name))}
								>
									×
								</button>
							</span>
						))}
						{packs.some((p) => p.path !== pack.path && !requires.includes(p.name)) && (
							<select
								className="tb"
								value=""
								onChange={(e) => e.target.value && void setRequires([...requires, e.target.value])}
							>
								<option value="">Add…</option>
								{packs
									.filter((p) => p.path !== pack.path && !requires.includes(p.name))
									.map((p) => (
										<option key={p.path} value={p.name}>
											{p.name}
										</option>
									))}
							</select>
						)}
					</div>
				)}

				{pending !== undefined && (
					<div className="pack-confirm">
						<p>This node has edits that are not saved.</p>
						<button
							className="tb danger"
							onClick={() => {
								const next = pending;
								setPending(undefined);
								setDirty(false);
								if (next === "back") onBack();
								else setChosen(next);
							}}
						>
							Discard them
						</button>
						<button className="tb" onClick={() => setPending(undefined)}>Keep editing</button>
					</div>
				)}

				<button
					className="tb primary with-icon"
					disabled={readOnly !== null}
					title={readOnly ?? "A new node in this pack"}
					onClick={() => {
						go({ fresh: Date.now() });
						setListOpen(false);
					}}
				>
					<Icon name="newFile" size={15} />
					New node
				</button>

				{defs === null ? (
					<p className="hint">Reading…</p>
				) : defs.length === 0 ? (
					<p className="hint">No nodes yet.</p>
				) : (
					<ul>
						{defs.map((def) => (
							<li key={def.id}>
								<button
									className={`pack-node${current?.id === def.id ? " on" : ""}`}
									onClick={() => {
										if (current?.id !== def.id) go({ id: def.id });
										setListOpen(false);
									}}
								>
									<span className="swatch" style={{ background: nodeColor(def) }} />
									<span className="title">{def.title}</span>
									<span className="id">{def.id}</span>
								</button>
							</li>
						))}
					</ul>
				)}
			</aside>

			{readOnly || !pack ? (
				<section className="designer-stage">
					{current ? (
						<>
							<div className="designer-stage-node" dangerouslySetInnerHTML={{ __html: svg }} />
							{current.summary && <p className="hint">{current.summary}</p>}
						</>
					) : null}
				</section>
			) : chosen === null ? (
				<section className="designer-stage">
					<p className="hint">{defs && defs.length === 0 ? "Make the first node with New node." : ""}</p>
				</section>
			) : (
				<NodeEditor
					key={"id" in chosen ? `node:${chosen.id}` : `new:${chosen.fresh}`}
					packPath={pack.path}
					original={original}
					requiredDefs={buildableDefs}
					missingRequires={missingRequires}
					target={target}
					namespace={namespaceFor(pack.name)}
					otherIds={(defs ?? []).map((d) => d.id).filter((id) => id !== current?.id)}
					onSaved={(saved) => void afterSave(saved)}
					onDeleted={() => void afterDelete()}
					onDirty={onDirty}
					notify={notify}
				/>
			)}
		</div>
	);
}
