/**
 * Choosing a folder in the project, as a Save As dialog does: a path of steps
 * to go back up, the folders where you are, and New folder beside them.
 *
 * A click picks a folder; a double-click, or its arrow, goes into it. Folders
 * show the Explorer's icons, so ReplicatedStorage reads as the service it
 * becomes, and a folder a node map syncs carries the map's mark.
 */

import { useMemo, useRef, useState } from "react";

import { isService } from "../core/roblox.js";
import { normalisePath } from "../core/rojoPaths.js";
import type { TreeEntry } from "./api.js";
import { cx } from "./cx.js";
import { ExplorerIcon } from "./ExplorerIcon.jsx";
import { Icon } from "./icons.jsx";
import { entryAt } from "./mapDisk.js";
import { realmClass, ScriptIcon } from "./ScriptIcon.jsx";

export interface FolderPickerProps {
	tree: readonly TreeEntry[];
	/** The folders at the top, before you go into any: the project's own. */
	roots: readonly string[];
	/** The folder picked now. */
	value: string;
	onPick: (path: string) => void;
	/** Makes a folder in the one you are in. Absent, there is no New folder. */
	onNewFolder?: (parent: string) => void;
	/** Files that can be picked too, listed after the folders: Syncs from's model files. */
	files?: (name: string) => boolean;
	/**
	 * Where the list starts, in place of `roots`: one folder, named in the
	 * path of steps (Graphs). Going into a folder picks it too, as a Save As
	 * dialog's folder is the one you are in.
	 */
	base?: { path: string; label: string };
	/**
	 * Makes a folder where you are, named in the list: the picker shows it at
	 * once and picks it. Used where a second dialog cannot open over the first.
	 */
	onCreateFolder?: (parent: string, name: string) => Promise<void>;
}

const parentOf = (path: string): string => {
	const at = normalisePath(path);
	const slash = at.lastIndexOf("/");
	return slash === -1 ? "" : at.slice(0, slash);
};

const subfolders = (entry: TreeEntry | undefined): TreeEntry[] =>
	(entry?.children ?? [])
		.filter((one) => one.kind === "directory")
		.sort((a, b) => a.name.localeCompare(b.name));

/** A folder's icon: the service it is named for, or a Folder; the map's mark when one syncs it. */
export function FolderIcon({ entry, top }: { entry: TreeEntry; top?: boolean }) {
	// A script with children: its script's icon, as the project tree draws it.
	if (entry.script && entry.realm)
		return (
			<ScriptIcon
				kind="nodescript"
				realm={entry.realm}
				size={15}
				className={cx("kind nodescript", realmClass(entry.realm))}
			/>
		);
	const named = !top && isService(entry.name);
	const icon = (
		<ExplorerIcon className={named ? entry.name : "Folder"} service={named} open={false} />
	);
	if (!entry.syncedBy) return icon;
	return (
		<span className="tree-badged" title={`Synced by ${entry.syncedBy.split("/").pop()}`}>
			{icon}
			<span className="tree-map-badge" aria-hidden="true">
				<Icon name="map" size={10} />
			</span>
		</span>
	);
}

export function FolderPicker({
	tree,
	roots,
	value,
	onPick,
	onNewFolder,
	files,
	base,
	onCreateFolder,
}: FolderPickerProps) {
	const tops = useMemo(
		() => roots.map((root) => entryAt(tree, root)).filter((one): one is TreeEntry => !!one),
		[tree, roots],
	);
	// Folders made here since the tree was read, by where they were made.
	const [made, setMade] = useState<string[]>([]);
	const [naming, setNaming] = useState<string | null>(null);
	const nameBox = useRef<HTMLInputElement>(null);
	const baseAt = base ? normalisePath(base.path) : null;
	// Start in the picked folder's parent, so it is in the list and lit. From a
	// base, in the picked folder itself, which is where you are.
	const [at, setAt] = useState<string | null>(() => {
		if (baseAt !== null) {
			const wanted = normalisePath(value);
			return wanted === baseAt || wanted.startsWith(`${baseAt}/`) ? wanted : baseAt;
		}
		const parent = parentOf(value);
		return parent && entryAt(tree, parent) ? parent : null;
	});
	const go = (path: string | null) => {
		setAt(path);
		setNaming(null);
		if (baseAt !== null && path !== null) onPick(path);
	};
	const madeIn = (dir: string): TreeEntry[] =>
		made
			.filter((one) => parentOf(one) === dir && !entryAt(tree, one))
			.map((one) => ({ path: one, name: one.split("/").pop() ?? one, kind: "directory" as const }));
	const here = at === null ? undefined : entryAt(tree, at);
	const pickable =
		at === null || !files
			? []
			: (here?.children ?? [])
					.filter((one) => one.kind !== "directory" && files(one.name))
					.sort((a, b) => a.name.localeCompare(b.name));
	const list =
		at === null
			? tops
			: [...subfolders(here), ...madeIn(normalisePath(at))]
					.sort((a, b) => a.name.localeCompare(b.name))
					.concat(pickable);
	const below = (path: string) =>
		baseAt === null ? path : path === baseAt ? "" : path.slice(baseAt.length + 1);
	const steps =
		at === null || below(normalisePath(at)) === "" ? [] : below(normalisePath(at)).split("/");
	const stepPath = (i: number) => {
		const tail = steps.slice(0, i + 1).join("/");
		return baseAt === null ? tail : `${baseAt}/${tail}`;
	};
	const picked = normalisePath(value);
	const create = async (name: string) => {
		const parent = at;
		const clean = name.trim();
		setNaming(null);
		if (parent === null || !clean || !onCreateFolder) return;
		const path = `${normalisePath(parent)}/${clean}`;
		await onCreateFolder(parent, clean);
		setMade((was) => [...was, path]);
		onPick(path);
	};

	return (
		<div className="folder-pick">
			<div className="fp-crumbs">
				<button
					type="button"
					className={cx("fp-step", (at === null || at === baseAt) && "here")}
					onClick={() => go(baseAt)}
				>
					{base?.label ?? "Project"}
				</button>
				{steps.map((step, i) => {
					const path = stepPath(i);
					return (
						<span key={path} className="fp-step-wrap">
							<span className="fp-sep" aria-hidden="true">
								›
							</span>
							<button
								type="button"
								className={cx("fp-step", i === steps.length - 1 && "here")}
								onClick={() => go(path)}
							>
								{step}
							</button>
						</span>
					);
				})}
				<span className="sp" />
				{(onNewFolder || onCreateFolder) && at !== null && (
					<button
						type="button"
						className="tb with-icon"
						onClick={() => {
							if (onCreateFolder) {
								setNaming("NewFolder");
								requestAnimationFrame(() => nameBox.current?.select());
							} else onNewFolder?.(at);
						}}
					>
						<Icon name="newFolder" size={13} />
						New folder
					</button>
				)}
			</div>
			<div className="fp-list" role="listbox" aria-label="Folders">
				{naming !== null && (
					<div className="fp-item fp-naming">
						<ExplorerIcon className="Folder" service={false} open={false} />
						<input
							ref={nameBox}
							className="tb"
							aria-label="New folder's name"
							value={naming}
							onChange={(e) => setNaming(e.target.value)}
							onKeyDown={(e) => {
								// Its own Enter and Esc: not the dialog's.
								e.stopPropagation();
								if (e.key === "Enter") void create(naming);
								if (e.key === "Escape") setNaming(null);
							}}
							onBlur={() => void create(naming)}
						/>
					</div>
				)}
				{list.length === 0 && naming === null && <div className="fp-none">No folders in here.</div>}
				{list.map((entry) => {
					const inner = entry.kind === "directory" && subfolders(entry).length > 0;
					return (
						<div
							key={entry.path}
							role="option"
							aria-selected={entry.path === picked}
							tabIndex={0}
							className={cx("fp-item", entry.path === picked && "on")}
							title={entry.path}
							onClick={() => onPick(entry.path)}
							onDoubleClick={() => (inner || baseAt !== null) && go(entry.path)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && baseAt === null) onPick(entry.path);
								else if (e.key === "ArrowRight" && inner) go(entry.path);
								else if (e.key === "ArrowLeft" && at !== null && at !== baseAt)
									go(parentOf(at) || baseAt);
							}}
						>
							{entry.kind === "directory" ? (
								<FolderIcon entry={entry} top={at === null} />
							) : (
								<ExplorerIcon className="Model" service={false} open={false} />
							)}
							<span className="fp-name">{entry.name}</span>
							{inner && (
								<button
									type="button"
									className="fp-in"
									title={`Into ${entry.name}`}
									aria-label={`Into ${entry.name}`}
									onClick={(e) => {
										e.stopPropagation();
										go(entry.path);
									}}
								>
									<Icon name="chevron" size={13} />
								</button>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
