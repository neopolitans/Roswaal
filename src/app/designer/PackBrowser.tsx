/**
 * The designer's front page: every node pack there is, as cards.
 *
 * A node is made *in* a pack, so choosing the pack comes first — the brief's
 * order, and the right one, because where a node lives decides who gets it. The
 * project's packs come first, since they are what can be changed; the built-in
 * library follows, one card per category, to look at and not to change.
 *
 * ## Looking before opening
 *
 * One search covers packs and the nodes in them, and a pack's card shows its
 * nodes in their colours. A click picks a card and shows everything in it
 * beside the list; a double-click, Enter or **Open** opens it. Opening a pack
 * is a change of screen, and somebody looking for which pack a node is in
 * should not have to make one per guess.
 *
 * ## What each card can do, and why a Luau pack is different
 *
 * A JSON pack can be duplicated, copied into another project, copied as JSON,
 * shown in the file manager and deleted, from its ⋯ menu. A `.nodedef.luau`
 * pack has the same actions except that its duplicate is *Save as JSON pack*:
 * the designer never rewrites a Luau pack, because the comments in one are the
 * reason somebody chose Luau, so an editable Luau pack is a JSON copy of it.
 *
 * Deleting asks first, naming the graphs that use the pack's nodes.
 */

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { errorMessage } from "../../core/errorMessage.js";
import { BUILTIN_NODES } from "../../core/nodes/index.js";
import { packTargets, runsOn } from "../../core/packs.js";
import type { NodeDef, Target } from "../../core/schema.js";
import { api, type PackFile } from "../api.js";
import { cx } from "../cx.js";
import { NOT_HERE, useHostCan } from "../host.js";
import { Icon } from "../icons.jsx";
import { Menu } from "../Menu.jsx";
import { useMedia } from "../Popout.jsx";
import { nodeColor } from "../palette.js";

/**
 * What the designer has open: a built-in category, or one of the project's
 * packs. `node` opens it at that node, and `fresh` starts a new one in it.
 */
export type OpenPack =
	| { kind: "builtin"; category: string; node?: string }
	| { kind: "project"; path: string; node?: string; fresh?: boolean };

export type Notify = (text: string, kind?: "ok" | "failed") => void;

const LAYOUT_KEY = "roswaal.designer.layout";
const SHOW_KEY = "roswaal.designer.show";
const FOLDED_KEY = "roswaal.designer.folded";

type Show = "all" | "project" | "builtin";
type Runs = "any" | Target;
type Section = "project" | "builtin";

function stored(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function store(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// The choice still applies to this visit.
	}
}

/** How a set of targets reads on a card. */
export function targetsLabel(targets: readonly Target[] | null): string {
	if (targets === null) return "Roblox and Lune";
	if (targets.length === 0) return "No target";
	return targets.map((t) => (t === "lune" ? "Lune" : "Roblox")).join(" and ") + " only";
}

/** The built-in library as packs: one per category, in the order it first appears. */
export function builtinPacks(): { category: string; defs: NodeDef[]; targets: Target[] | null }[] {
	const byCategory = new Map<string, NodeDef[]>();
	for (const def of BUILTIN_NODES) {
		const list = byCategory.get(def.category) ?? [];
		list.push(def);
		byCategory.set(def.category, list);
	}
	return [...byCategory].map(([category, defs]) => ({
		category,
		defs,
		targets: packTargets(defs),
	}));
}

/** One pack as the browser lists it, built-in or the project's. */
interface Listed {
	key: string;
	name: string;
	builtin: boolean;
	nodes: { id: string; title: string; color: string }[];
	targets: Target[] | null;
	file?: PackFile;
}

export interface PackBrowserProps {
	packs: PackFile[] | null;
	/** The project's custom nodes, for each pack's titles and colours. */
	defs: NodeDef[];
	/** What the project compiles for, which every pack's targets are checked against. */
	target: Target | null;
	noProject: boolean;
	onOpen: (open: OpenPack) => void;
	/** Something on disk changed; read the packs again. */
	onChanged: () => Promise<void>;
	notify: Notify;
	/** Where the search and the browser's buttons go: a cluster of the window's chrome. */
	actionsSlot?: HTMLElement | null;
}

export function PackBrowser({
	packs,
	defs,
	target,
	noProject,
	onOpen,
	onChanged,
	notify,
	actionsSlot = null,
}: PackBrowserProps) {
	// Copying a pack between projects needs a second project to copy to, which
	// needs a filesystem holding more than this one. `inspect` is that
	// question: a daemon with no folder picker can still be given a path.
	const canUseOtherProjects = useHostCan("inspect");
	const canReveal = useHostCan("reveal");
	// Below this the browser's own row is drawn in the page rather than in the
	// window's chrome, which has the mark and the other windows to hold.
	const narrow = useMedia("(max-width: 899px)");
	const [layout, setLayout] = useState<"grid" | "list">(() =>
		stored(LAYOUT_KEY) === "list" ? "list" : "grid",
	);
	const [show, setShow] = useState<Show>(() => {
		const value = stored(SHOW_KEY);
		return value === "project" || value === "builtin" ? value : "all";
	});
	const [runs, setRuns] = useState<Runs>("any");
	const [query, setQuery] = useState("");
	const [folded, setFolded] = useState<Section[]>(() =>
		(stored(FOLDED_KEY) ?? "")
			.split(",")
			.filter((s): s is Section => s === "project" || s === "builtin"),
	);
	const [selected, setSelected] = useState<string | null>(null);
	const [menu, setMenu] = useState<{ key: string; button: HTMLElement } | null>(null);
	const [confirming, setConfirming] = useState<{
		pack: PackFile;
		usage: { graph: string; count: number }[];
	} | null>(null);
	const [naming, setNaming] = useState<string | null>(null);
	const [importing, setImporting] = useState<{
		root: string;
		target: Target;
		packs: PackFile[];
		done: Set<string>;
	} | null>(null);
	const search = useRef<HTMLInputElement>(null);

	const byId = useMemo(() => new Map(defs.map((def) => [def.id, def])), [defs]);
	const project = useMemo<Listed[]>(
		() =>
			(packs ?? []).map((file) => ({
				key: `project:${file.path}`,
				name: file.name,
				builtin: false,
				nodes: file.nodes.map((id) => {
					const def = byId.get(id);
					return {
						id,
						title: def?.title ?? id,
						color: nodeColor(def ?? { category: "Custom" }),
					};
				}),
				targets: file.targets,
				file,
			})),
		[packs, byId],
	);
	const builtins = useMemo<Listed[]>(
		() =>
			builtinPacks().map((b) => ({
				key: `builtin:${b.category}`,
				name: b.category,
				builtin: true,
				nodes: b.defs.map((def) => ({ id: def.id, title: def.title, color: nodeColor(def) })),
				targets: b.targets,
			})),
		[],
	);
	const names = useMemo(() => new Set((packs ?? []).map((p) => p.name)), [packs]);

	const needle = query.trim().toLowerCase();
	const hits = (pack: Listed) =>
		needle === "" ? [] : pack.nodes.filter((n) => n.title.toLowerCase().includes(needle));
	const matches = (pack: Listed) => {
		if (runs !== "any" && pack.targets !== null && !pack.targets.includes(runs)) return false;
		if (needle === "") return true;
		return pack.name.toLowerCase().includes(needle) || hits(pack).length > 0;
	};
	const shownProject = show === "builtin" ? [] : project.filter(matches);
	const shownBuiltins = show === "project" ? [] : builtins.filter(matches);
	const peek = [...project, ...builtins].find((p) => p.key === selected) ?? null;

	const open = (pack: Listed, extra: { node?: string; fresh?: boolean } = {}) => {
		if (pack.file) onOpen({ kind: "project", path: pack.file.path, ...extra });
		else onOpen({ kind: "builtin", category: pack.name, node: extra.node });
	};

	// `/` finds, as it does on most pages with one search; Ctrl K is the docs'.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const typing = (e.target as HTMLElement | null)?.closest?.(
				"input, textarea, [contenteditable]",
			);
			if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) {
				e.preventDefault();
				search.current?.focus();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const chooseLayout = (next: "grid" | "list") => {
		setLayout(next);
		store(LAYOUT_KEY, next);
	};
	const chooseShow = (next: Show) => {
		setShow(next);
		store(SHOW_KEY, next);
	};
	const fold = (section: Section) => {
		const next = folded.includes(section)
			? folded.filter((s) => s !== section)
			: [...folded, section];
		setFolded(next);
		store(FOLDED_KEY, next.join(","));
	};

	const create = async () => {
		if (naming === null) return;
		try {
			const { pack } = await api.createPack(naming);
			setNaming(null);
			await onChanged();
			onOpen({ kind: "project", path: pack.path });
		} catch (err) {
			notify(errorMessage(err), "failed");
		}
	};

	const startImport = async () => {
		try {
			const { path: root } = await api.browseForProject();
			if (!root) return;
			const scanned = await api.scanPacks(root);
			if (scanned.packs.length === 0) {
				notify(`${root} has no node packs.`, "failed");
				return;
			}
			setImporting({ ...scanned, done: new Set() });
		} catch (err) {
			notify(errorMessage(err), "failed");
		}
	};

	// Runs a menu action, saying what went wrong if it did.
	const act = (fn: () => Promise<void>) => () => {
		setMenu(null);
		void fn().catch((err: Error) => notify(err.message, "failed"));
	};

	const openMenu = (key: string, button: HTMLElement) => {
		setMenu((m) => (m?.button === button ? null : { key, button }));
	};

	const bar = (
		<>
			<div className={cx("tool-group", "packs-search-group")}>
				<label className="packs-search">
					<Icon name="search" size={14} />
					<input
						ref={search}
						placeholder="Search packs and nodes"
						aria-label="Search packs and nodes"
						value={query}
						autoComplete="off"
						spellCheck={false}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => e.key === "Escape" && setQuery("")}
					/>
					{query === "" ? (
						<kbd>/</kbd>
					) : (
						<button
							type="button"
							className="packs-clear"
							aria-label="Clear the search"
							onClick={() => setQuery("")}
						>
							<Icon name="close" size={12} />
						</button>
					)}
				</label>
			</div>
			<div className="tool-group">
				<div className="segmented">
					<button className={layout === "grid" ? "on" : ""} onClick={() => chooseLayout("grid")}>
						Grid
					</button>
					<button className={layout === "list" ? "on" : ""} onClick={() => chooseLayout("list")}>
						List
					</button>
				</div>
				{/* Hidden rather than disabled: a tooltip explaining that there is
				    no second project on a volume holding one would not help anybody. */}
				{canUseOtherProjects && (
					<button
						className="tb with-icon"
						disabled={noProject}
						title="Copy a pack in from another project"
						onClick={() => void startImport()}
					>
						<Icon name="folderOpen" size={15} />
						Import…
					</button>
				)}
				{naming === null ? (
					<button
						className="tb primary with-icon"
						disabled={noProject}
						onClick={() => setNaming("")}
					>
						<Icon name="newFile" size={15} />
						New pack
					</button>
				) : (
					<form
						className="packs-naming"
						onSubmit={(e) => {
							e.preventDefault();
							void create();
						}}
					>
						<input
							className="tb"
							autoFocus
							placeholder="Pack name"
							value={naming}
							onChange={(e) => setNaming(e.target.value)}
							onKeyDown={(e) => e.key === "Escape" && setNaming(null)}
						/>
						<button className="tb primary" type="submit">
							Create
						</button>
						<button className="tb" type="button" onClick={() => setNaming(null)}>
							Cancel
						</button>
					</form>
				)}
			</div>
		</>
	);

	const sectionHead = (section: Section, label: string, shown: number, total: number) => {
		const isOpen = !folded.includes(section);
		return (
			<div className="packs-section">
				<span>{label}</span>
				<span className="packs-count">
					{needle === "" && runs === "any" ? total : `${shown} of ${total}`}
				</span>
				<button
					type="button"
					className="tb packs-fold"
					aria-expanded={isOpen}
					onClick={() => fold(section)}
				>
					<Icon name="chevron" size={13} />
					{isOpen ? "Fold" : "Show"}
				</button>
			</div>
		);
	};

	const card = (pack: Listed) => {
		const file = pack.file;
		const missing = file ? file.requires.filter((name) => !names.has(name)) : [];
		const found = hits(pack);
		const props = {
			key: pack.key,
			pack,
			found,
			target,
			missing,
			selected: selected === pack.key,
			onPick: () => setSelected((s) => (s === pack.key ? null : pack.key)),
			onOpen: () => open(pack),
			onNewNode: () => open(pack, { fresh: true }),
			onSaveJson: act(async () => {
				if (!file) return;
				const { pack: copy } = await api.duplicatePack(file.path);
				await onChanged();
				notify(`${copy.name} is an editable copy of ${file.name}.`);
			}),
			onMenu: (anchor: HTMLElement) => openMenu(pack.key, anchor),
		};
		return layout === "list" ? <PackRow {...props} /> : <PackCard {...props} />;
	};

	const menuPack = menu ? project.find((p) => p.key === menu.key)?.file : undefined;

	return (
		<div
			className={cx(
				"pack-browser",
				narrow && "pack-browser-narrow",
				peek && "pack-browser-peeking",
			)}
		>
			{narrow || !actionsSlot ? (
				<div className="packs-bar">{bar}</div>
			) : (
				createPortal(bar, actionsSlot)
			)}

			<aside className="packs-filters" aria-label="Filters">
				<div className="card-head">
					<span className="card-title">Packs</span>
				</div>
				<div className="packs-filter-groups">
					<span className="packs-filter-head">Show</span>
					<Filter
						on={show === "all"}
						count={project.length + builtins.length}
						onPick={() => chooseShow("all")}
					>
						All
					</Filter>
					<Filter
						on={show === "project"}
						count={project.length}
						onPick={() => chooseShow("project")}
					>
						This project
					</Filter>
					<Filter
						on={show === "builtin"}
						count={builtins.length}
						onPick={() => chooseShow("builtin")}
					>
						Built in
					</Filter>
					<span className="packs-filter-head">Runs on</span>
					<span className="packs-filter-rule" aria-hidden />
					<Filter on={runs === "any"} onPick={() => setRuns("any")}>
						Anything
					</Filter>
					<Filter on={runs === "roblox"} onPick={() => setRuns("roblox")}>
						Roblox
					</Filter>
					<Filter on={runs === "lune"} onPick={() => setRuns("lune")}>
						Lune
					</Filter>
				</div>
			</aside>

			<div className="packs-main">
				{show !== "builtin" && (
					<>
						{sectionHead("project", "This project", shownProject.length, project.length)}
						{!folded.includes("project") &&
							(noProject ? (
								<p className="packs-none">
									No project is open. Open one in the editor, then reload this page.
								</p>
							) : packs === null ? (
								<p className="packs-none">Reading packs…</p>
							) : (
								<>
									<div className={cx("packs-grid", layout === "list" && "packs-list")}>
										{shownProject.map(card)}
										{needle === "" && layout === "grid" && (
											<div className="packs-ghosts">
												<button type="button" className="packs-ghost" onClick={() => setNaming("")}>
													<strong>
														<Icon name="plus" size={15} />
														New pack
													</strong>
													<span>A JSON pack in .roswaal/nodes</span>
												</button>
												{canUseOtherProjects && (
													<button
														type="button"
														className="packs-ghost"
														onClick={() => void startImport()}
													>
														<strong>
															<Icon name="folderOpen" size={15} />
															Import…
														</strong>
														<span>From another project</span>
													</button>
												)}
											</div>
										)}
									</div>
									{shownProject.length === 0 && (needle !== "" || runs !== "any") && (
										<p className="packs-none">No pack or node in this project matches.</p>
									)}
									{project.length === 0 && layout === "list" && (
										<p className="packs-none">
											No packs yet. Make one, or import one from another project.
										</p>
									)}
								</>
							))}
					</>
				)}

				{show !== "project" && (
					<>
						{sectionHead("builtin", "Built in", shownBuiltins.length, builtins.length)}
						{!folded.includes("builtin") &&
							(shownBuiltins.length === 0 ? (
								<p className="packs-none">No built-in pack or node matches.</p>
							) : (
								<div
									className={cx(
										"packs-grid",
										layout === "list" ? "packs-list" : "packs-grid-builtin",
									)}
								>
									{shownBuiltins.map(card)}
								</div>
							))}
					</>
				)}
			</div>

			{peek && (
				<aside className="packs-peek" aria-label={peek.name}>
					<div className="card-head">
						<span className="card-title">{peek.name}</span>
						<span className="card-slot">
							<span className="card-sub">
								{peek.builtin
									? "Built in"
									: peek.file?.format === "luau"
										? "Luau · read-only"
										: "JSON"}
							</span>
						</span>
						<button
							type="button"
							className="tb icon-only"
							title="Close"
							aria-label="Close"
							onClick={() => setSelected(null)}
						>
							<Icon name="close" size={14} />
						</button>
					</div>
					<div className="packs-peek-body">
						<p className="packs-peek-about">
							{peek.builtin
								? "Ships with Roswaal. Open it to read each node's logic; duplicate one to change it."
								: peek.file?.path}
						</p>
						<div className="packs-meta">
							<TargetChip targets={peek.targets} target={target} />
							<span>
								{peek.nodes.length} node{peek.nodes.length === 1 ? "" : "s"}
							</span>
						</div>
						{peek.file && peek.file.requires.length > 0 && (
							<p className="packs-requires">Built from {peek.file.requires.join(", ")}</p>
						)}
						{[...hits(peek), ...peek.nodes.filter((n) => !hits(peek).includes(n))].map((node) => (
							<button
								key={node.id}
								type="button"
								className={cx("packs-peek-node", hits(peek).includes(node) && "packs-hit")}
								onClick={() => open(peek, { node: node.id })}
							>
								<i style={{ background: node.color }} />
								{node.title}
								<span className="packs-peek-open">Open</span>
							</button>
						))}
					</div>
					<div className="packs-peek-actions">
						<button type="button" className="tb primary" onClick={() => open(peek)}>
							Open pack
						</button>
						{peek.file &&
							(peek.file.format === "luau" ? (
								<button
									type="button"
									className="tb"
									onClick={act(async () => {
										const file = peek.file as PackFile;
										const { pack: copy } = await api.duplicatePack(file.path);
										await onChanged();
										notify(`${copy.name} is an editable copy of ${file.name}.`);
									})}
								>
									Save as JSON
								</button>
							) : (
								<button
									type="button"
									className="tb with-icon"
									onClick={() => open(peek, { fresh: true })}
								>
									<Icon name="plus" size={13} />
									New node
								</button>
							))}
						{peek.file && (
							<button
								type="button"
								className="tb icon-only packs-more"
								title="Duplicate, copy, show in folder, delete"
								aria-label="More"
								onClick={(e) => openMenu(peek.key, e.currentTarget)}
							>
								<Icon name="more" size={15} />
							</button>
						)}
					</div>
				</aside>
			)}

			{menu && menuPack && (
				<Menu
					at={{ element: menu.button, align: "end" }}
					label={menuPack.name}
					onClose={() => setMenu(null)}
					sections={[
						{
							entries: [
								{
									label: menuPack.format === "luau" ? "Save as JSON pack" : "Duplicate",
									icon: "duplicate",
									run: act(async () => {
										const { pack: copy } = await api.duplicatePack(menuPack.path);
										await onChanged();
										notify(`${copy.name} is a copy of ${menuPack.name}.`);
									}),
								},
								canUseOtherProjects && {
									label: "Copy to another project…",
									icon: "external",
									run: act(async () => {
										const { path: root } = await api.browseForProject();
										if (!root) return;
										await api.exportPack(menuPack.path, root);
										notify(`${menuPack.name} was copied to ${root}.`);
									}),
								},
								{
									label: "Copy JSON",
									icon: "copy",
									run: act(async () => {
										const { nodes } = await api.readPack(menuPack.path);
										const document =
											menuPack.requires.length > 0
												? { requires: menuPack.requires, nodes }
												: { nodes };
										await navigator.clipboard.writeText(JSON.stringify(document, null, 2));
										notify(`${menuPack.name} was copied as JSON.`);
									}),
								},
								{
									label: "Show in file manager",
									icon: "folder",
									disabled: !canReveal,
									title: canReveal ? undefined : NOT_HERE,
									run: act(async () => {
										await api.reveal(menuPack.path);
									}),
								},
							],
						},
						{
							entries: [
								{
									label: "Delete…",
									icon: "remove",
									danger: true,
									run: act(async () => {
										const { usage } = await api.packUsage(menuPack.path);
										setConfirming({ pack: menuPack, usage });
									}),
								},
							],
						},
					]}
				/>
			)}

			{confirming && (
				<div className="docs-backdrop" onPointerDown={() => setConfirming(null)}>
					<div
						className="pack-dialog"
						role="alertdialog"
						onPointerDown={(e) => e.stopPropagation()}
					>
						<strong>Delete {confirming.pack.name}?</strong>
						<p>
							{confirming.usage.length === 0
								? "No graph uses its nodes."
								: `${confirming.usage.reduce((n, u) => n + u.count, 0)} of its nodes are placed in ` +
									`${confirming.usage.map((u) => u.graph.split("/").pop()).join(", ")}, and will show as unknown.`}
						</p>
						<div className="pack-dialog-row">
							<button type="button" className="tb" autoFocus onClick={() => setConfirming(null)}>
								Keep
							</button>
							<button
								type="button"
								className="tb danger"
								onClick={() => {
									const doomed = confirming.pack;
									setConfirming(null);
									if (selected === `project:${doomed.path}`) setSelected(null);
									void api
										.deletePack(doomed.path)
										.then(onChanged)
										.then(() => notify(`${doomed.name} was deleted.`))
										.catch((err: Error) => notify(err.message, "failed"));
								}}
							>
								Delete
							</button>
						</div>
					</div>
				</div>
			)}

			{importing && (
				<div className="docs-backdrop" onPointerDown={() => setImporting(null)}>
					<div className="pack-import" onPointerDown={(e) => e.stopPropagation()}>
						<div className="pack-import-head">
							<strong>Import from {importing.root}</strong>
							<span className="spacer" />
							<button className="tb" onClick={() => setImporting(null)} title="Close">
								<Icon name="close" size={15} />
							</button>
						</div>
						<ul>
							{importing.packs.map((pack) => {
								const done = importing.done.has(pack.path);
								return (
									<li key={pack.path}>
										<span className="name">{pack.name}</span>
										<span className="badge">{pack.format === "luau" ? "Luau" : "JSON"}</span>
										<span className="count">{pack.nodes.length} nodes</span>
										<TargetChip targets={pack.targets} target={target} />
										<span className="spacer" />
										{pack.errors.length > 0 ? (
											<span className="badge warn" title={pack.errors.join("\n")}>
												Has problems
											</span>
										) : (
											<button
												className="tb"
												disabled={done}
												onClick={async () => {
													try {
														await api.importPack(importing.root, pack.path);
														setImporting((m) =>
															m ? { ...m, done: new Set([...m.done, pack.path]) } : m,
														);
														await onChanged();
														notify(`${pack.name} is in this project now.`);
													} catch (err) {
														notify(errorMessage(err), "failed");
													}
												}}
											>
												{done ? "Imported" : "Import"}
											</button>
										)}
									</li>
								);
							})}
						</ul>
					</div>
				</div>
			)}
		</div>
	);
}

function Filter({
	on,
	count,
	onPick,
	children,
}: {
	on: boolean;
	count?: number;
	onPick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			className={cx("packs-filter", on && "packs-filter-on")}
			aria-pressed={on}
			onClick={onPick}
		>
			{children}
			{count !== undefined && <span className="packs-count">{count}</span>}
		</button>
	);
}

/** What a pack runs on, marked when the project compiles for something else. */
function TargetChip({
	targets,
	target,
}: {
	targets: readonly Target[] | null;
	target: Target | null;
}) {
	const fits = target === null || runsOn(targets, target);
	const only = targets?.length === 1 ? targets[0] : null;
	return (
		<span
			className={cx("runtime-chip", only && `runtime-chip-${only}`, !fits && "runtime-chip-warn")}
			title={
				fits
					? "Runs on what this project compiles for."
					: "This project compiles for something these nodes do not run on."
			}
		>
			{targetsLabel(targets)}
		</span>
	);
}

interface PackItemProps {
	pack: Listed;
	/** The nodes the search found in it. */
	found: Listed["nodes"];
	target: Target | null;
	/** Packs it requires that this project does not have. */
	missing: string[];
	selected: boolean;
	onPick: () => void;
	onOpen: () => void;
	onNewNode: () => void;
	onSaveJson: () => void;
	onMenu: (anchor: HTMLElement) => void;
}

/** A click picks it, and the peek shows what is in it; a double-click or Enter opens it. */
function pickable({ onPick, onOpen }: PackItemProps) {
	return {
		role: "button",
		tabIndex: 0,
		onClick: (e: React.MouseEvent) => {
			if ((e.target as HTMLElement).closest("button")) return;
			onPick();
		},
		onDoubleClick: (e: React.MouseEvent) => {
			if ((e.target as HTMLElement).closest("button")) return;
			onOpen();
		},
		onKeyDown: (e: React.KeyboardEvent) => {
			if (e.target !== e.currentTarget) return;
			if (e.key === "Enter") onOpen();
			if (e.key === " ") {
				e.preventDefault();
				onPick();
			}
		},
	};
}

/** The problems a pack's card owns up to: its own, and packs it needs that are not here. */
function Problems({ pack, missing }: { pack: Listed; missing: string[] }) {
	const errors = pack.file?.errors ?? [];
	return (
		<>
			{errors.length > 0 && (
				<span className="runtime-chip runtime-chip-warn" title={errors.join("\n")}>
					{errors.length} problem{errors.length === 1 ? "" : "s"}
				</span>
			)}
			{missing.length > 0 && (
				<span
					className="runtime-chip runtime-chip-warn"
					title="Its nodes' logic is built from these, and this project does not have them."
				>
					Needs {missing.join(", ")}
				</span>
			)}
		</>
	);
}

/** Up to this many of a pack's nodes on its card; the rest are counted. */
const PILLS = 6;

function PackCard(props: PackItemProps) {
	const { pack, found, target, missing, selected, onNewNode, onSaveJson, onMenu } = props;
	const file = pack.file;
	const luau = file?.format === "luau";

	if (pack.builtin) {
		const line =
			found.length > 0 ? found.map((n) => n.title) : pack.nodes.slice(0, 3).map((n) => n.title);
		return (
			<div
				className={cx("packs-card", "packs-card-builtin", selected && "packs-selected")}
				style={{ "--packs-stripe": pack.nodes[0]?.color } as React.CSSProperties}
				{...pickable(props)}
			>
				<span className="packs-name">{pack.name}</span>
				<span className={cx("packs-line", found.length > 0 && "packs-line-hit")}>
					{line.slice(0, 3).join(", ")}
					{line.length > 3
						? ` +${line.length - 3}`
						: pack.nodes.length > 3 && found.length === 0
							? "…"
							: ""}
				</span>
				<span className="packs-meta">
					<span>
						{pack.nodes.length} node{pack.nodes.length === 1 ? "" : "s"}
					</span>
					<TargetChip targets={pack.targets} target={target} />
				</span>
			</div>
		);
	}

	const ordered = [...found, ...pack.nodes.filter((n) => !found.includes(n))];
	const more = pack.nodes.length - Math.min(PILLS, ordered.length);
	return (
		<div className={cx("packs-card", selected && "packs-selected")} {...pickable(props)}>
			<div className="packs-head">
				<span className="packs-name">{pack.name}</span>
				<span
					className="runtime-chip"
					title={luau ? "Hand-written. The designer opens it read-only." : undefined}
				>
					{luau ? "Luau · read-only" : "JSON"}
				</span>
				<button
					type="button"
					className="tb icon-only packs-more"
					title="Duplicate, copy, show in folder, delete"
					aria-label="More"
					onClick={(e) => onMenu(e.currentTarget)}
				>
					<Icon name="more" size={15} />
				</button>
			</div>
			<div className="packs-path">{file?.path}</div>
			{pack.nodes.length > 0 && (
				<div className="packs-pills">
					{ordered.slice(0, PILLS).map((node) => (
						<span key={node.id} className={cx("packs-pill", found.includes(node) && "packs-hit")}>
							<i style={{ background: node.color }} />
							{node.title}
						</span>
					))}
					{more > 0 && <span className="packs-pill packs-pill-more">+{more} more</span>}
				</div>
			)}
			{file && file.requires.length > 0 && (
				<div className="packs-requires">Built from {file.requires.join(", ")}</div>
			)}
			<div className="packs-foot">
				<span>
					{pack.nodes.length} node{pack.nodes.length === 1 ? "" : "s"}
				</span>
				<TargetChip targets={pack.targets} target={target} />
				<Problems pack={pack} missing={missing} />
				<span className="spacer" />
				{luau ? (
					<button type="button" className="tb" onClick={onSaveJson}>
						Save as JSON
					</button>
				) : (
					<button type="button" className="tb with-icon" onClick={onNewNode}>
						<Icon name="plus" size={13} />
						New node
					</button>
				)}
			</div>
		</div>
	);
}

/** One pack a row, for the list. */
function PackRow(props: PackItemProps) {
	const { pack, target, missing, selected, onMenu } = props;
	const file = pack.file;
	return (
		<div className={cx("packs-row", selected && "packs-selected")} {...pickable(props)}>
			<span className="packs-swatch" style={{ background: pack.nodes[0]?.color }} />
			<span className="packs-name">{pack.name}</span>
			<span className="packs-row-kind">
				<span className="runtime-chip">
					{pack.builtin ? "Built in" : file?.format === "luau" ? "Luau" : "JSON"}
				</span>
			</span>
			<span className="packs-row-count">
				{pack.nodes.length} node{pack.nodes.length === 1 ? "" : "s"}
			</span>
			<span className="packs-row-runs">
				<TargetChip targets={pack.targets} target={target} />
				<Problems pack={pack} missing={missing} />
			</span>
			{file ? (
				<span className="packs-path">{file.path}</span>
			) : (
				<span className="packs-line">
					{pack.nodes
						.slice(0, 4)
						.map((n) => n.title)
						.join(", ")}
				</span>
			)}
			{file ? (
				<button
					type="button"
					className="tb icon-only packs-more"
					title="Duplicate, copy, show in folder, delete"
					aria-label="More"
					onClick={(e) => onMenu(e.currentTarget)}
				>
					<Icon name="more" size={15} />
				</button>
			) : (
				<span />
			)}
		</div>
	);
}
