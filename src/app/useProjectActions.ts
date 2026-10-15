/**
 * What the Project panel and the project menu do: open, create, rename, move
 * and delete entries; import a zip, a place or a Rojo project; add and remove
 * packages; open a folder, reopen one, reset the project.
 */

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toBase64 } from "../core/base64.js";
import { errorMessage } from "../core/errorMessage.js";
import type { ImportMode } from "../core/import/modes.js";
import { detectTarget } from "../core/import/modes.js";
import { projectNameProblem } from "../core/newProject.js";
import type { NodeScript, Target } from "../core/schema.js";
import {
	api,
	type NewProjectChoice,
	type ProjectInfo,
	type RojoProject,
	type TreeEntry,
	type WallyOutcome,
} from "./api.js";
import type { FormAnswers, FormField } from "./Dialog.jsx";
import {
	canMakeProject,
	canOpenDirectory,
	forgetRememberedFolder,
	makeProject,
	openDirectory,
	type RememberedFolder,
	readPlace,
	readZip,
} from "./host.js";
import { importableLuau } from "./importable.js";
import { setBeforeLeaving } from "./pages.js";
import type { SaveQueue } from "./saveQueue.js";
import { store } from "./store.js";
import { findTreeEntry } from "./treeEntry.js";
import type { Dialogs } from "./useDialogs.js";

/** What the actions need from the editor around them. */
export interface ProjectActionsContext {
	project: ProjectInfo | null;
	ask: Dialogs["ask"];
	notify: Dialogs["notify"];
	saves: SaveQueue;
	writeGraph: (path: string, script: NodeScript) => Promise<void>;
	loadProject: (
		root: string,
		init?: boolean | NewProjectChoice,
		quiet?: boolean,
	) => Promise<boolean>;
	refreshTree: () => Promise<void>;
	openEntry: (entry: TreeEntry) => Promise<void>;
	setIntroOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Whether statements kept as code share Code Blocks: offered for Tidy and
 * Modern, the modes that do it, starting from what the graph was given before.
 */
function codeRunsField(before: boolean | undefined): FormField {
	return {
		id: "codeRuns",
		kind: "check",
		label: "Keep code that runs on in one Code Block",
		value: before ?? true,
		when: { id: "mode", value: ["tidy", "modern"] },
	};
}

/** The import mode a dialog's answer names; Tidy for anything else. */
function modeOf(answer: unknown): ImportMode {
	return answer === "verbatim" || answer === "modern" || answer === "nodes" ? answer : "tidy";
}

export function useProjectActions(context: ProjectActionsContext) {
	const {
		project,
		ask,
		notify,
		saves,
		writeGraph,
		loadProject,
		refreshTree,
		openEntry,
		setIntroOpen,
	} = context;

	/**
	 * The tree's handlers are hoisted out of the render, and `ProjectTree` is
	 * memoised, because otherwise **the tree re-renders on every frame of a
	 * drag**. This component subscribes to the document store, so moving a node
	 * re-renders it sixty times a second, and it renders the tree — which with
	 * a folder of 1200 graphs open cost 16ms a frame on its own: 4.2ms became
	 * 20.7ms, and dragging visibly stuttered.
	 *
	 * Memoising only works if every prop is stable, which is what these are
	 * for. They depend on `editor.path` and `mapDoc`, which change when you open
	 * a document and not while you are dragging in one.
	 */
	const onTreeOpen = useCallback((entry: TreeEntry) => void openEntry(entry), [openEntry]);

	/**
	 * Import as graphs over many files, reached from here because it is
	 * declared further down. `rojo` is a whole Rojo project's import, whose
	 * summary leads with the map.
	 */
	const importManyRef = useRef<(entries: TreeEntry[], rojo?: { lead: string }) => Promise<boolean>>(
		async () => false,
	);

	/**
	 * Which project file to import, and how much of it, in one form. A
	 * project can have a file per place, so several are a dropdown, with
	 * `default.project.json` first as the one Rojo reads unasked.
	 *
	 * The file only is a node map, and the project's Luau stays hand-written,
	 * which the tree already lists; with Luau as graphs, the map and then every
	 * hand-written Luau file in the folders it syncs, read into graphs.
	 */
	const pickRojoImport = useCallback(
		async (projects: RojoProject[], offered?: "zip" | "folder") => {
			const sorted = [...projects].sort(
				(a, b) =>
					Number(b.file === "default.project.json") - Number(a.file === "default.project.json") ||
					a.file.localeCompare(b.file),
			);
			const where = offered ? `The ${offered}` : "This project";
			const answer = await ask({
				kind: "form",
				title: "Import Rojo project",
				message:
					(sorted.length === 1
						? `${where} has ${sorted[0].file}${sorted[0].mappedBy ? `, which ${sorted[0].mappedBy} writes already` : ""}.`
						: `${where} has ${sorted.length} Rojo project files.`) +
					" Its Luau stays hand-written unless you import it as graphs, and no file is changed.",
				fields: [
					...(sorted.length > 1
						? [
								{
									id: "file",
									kind: "select" as const,
									label: "Project file",
									value: sorted[0].file,
									options: sorted.map((p) => ({ value: p.file, label: p.file })),
								},
							]
						: []),
					{
						id: "scope",
						kind: "choice",
						label: "Import",
						value: "file",
						options: [
							{ value: "file", label: "Project File Only" },
							{ value: "whole", label: "Project File + Luau as Graphs" },
						],
					},
				],
				confirmLabel: "Import",
			});
			if (typeof answer !== "string") return null;
			const chosen = JSON.parse(answer) as FormAnswers;
			const file = sorted.length > 1 ? String(chosen.file) : sorted[0].file;
			return {
				project: sorted.find((p) => p.file === file) ?? sorted[0],
				whole: chosen.scope === "whole",
			};
		},
		[ask],
	);

	/**
	 * Project → Import Rojo project…: a `*.project.json` in the root, read into
	 * a node map, which is then opened, and with the whole project, its Luau
	 * read into graphs. The project file and the Luau are not changed.
	 *
	 * `offered` is the same, asked unprompted after a zip or a folder opens
	 * with a project file no map writes: it says where the file came from, and
	 * says nothing at all when there is none.
	 */
	const importRojo = useCallback(
		async (offered?: "zip" | "folder") => {
			try {
				const { projects } = await api.rojoProjects();
				const open = projects.filter((p) => !p.mappedBy);
				if (open.length === 0 && offered) return;
				if (projects.length === 0) {
					notify(
						"No Rojo project to import",
						"There is no *.project.json in the project's root folder.",
					);
					return;
				}
				// A file a map already writes can still have its Luau imported.
				const picked = await pickRojoImport(offered ? open : projects, offered);
				if (!picked) return;
				const { project: chosen, whole } = picked;
				if (chosen.mappedBy && !whole) {
					notify("Already imported", `${chosen.file} is written by ${chosen.mappedBy} already.`);
					return;
				}

				let lead: string;
				let mapPath: string;
				if (chosen.mappedBy) {
					mapPath = chosen.mappedBy;
					lead = `${chosen.file} already has its map.`;
				} else {
					const out = await api.importRojo(chosen.file);
					mapPath = out.mapPath;
					lead =
						(out.takenOver
							? `The map writes ${out.file} now. Compiling leaves the file as it is until the map changes.`
							: `${out.file} is left as it is: the map would write it differently. Compile the map with force to take it over.`) +
						(out.problems.length > 0 ? ` ${out.problems.join(" ")}` : "");
				}
				await refreshTree();
				await openEntry({ path: mapPath, name: mapPath.split("/").pop()!, kind: "nodemap" });
				if (!whole) {
					notify("Rojo project imported", lead);
					return;
				}

				// Read from the daemon, not the tree in hand: the map was just added.
				const { tree } = await api.tree();
				const entries = importableLuau(tree, new Set(chosen.paths));
				if (entries.length === 0) {
					notify(
						"Rojo project imported",
						`${lead} The folders it syncs hold no hand-written Luau to import.`,
					);
					return;
				}
				if (!(await importManyRef.current(entries, { lead }))) {
					notify(
						"Rojo project imported",
						`${lead} Its Luau was not imported; Import folder as graphs does that later.`,
					);
				}
			} catch (err) {
				notify("Could not import the Rojo project", errorMessage(err));
			}
		},
		[notify, refreshTree, openEntry, pickRojoImport],
	);

	/**
	 * Adding a package from the menu on wally.toml: from the Wally registry,
	 * from a zip, or -- in the installed editor -- from a GitHub repository.
	 * What happened is said in one notice: the line written, what was
	 * installed, and why the rest was not, with the zip as the way round it.
	 */
	const packageZipInput = useRef<HTMLInputElement>(null);
	const packageZipFor = useRef<string | undefined>(undefined);
	const reportPackage = useCallback(
		(out: WallyOutcome) => {
			const said: string[] = [];
			if (out.line) said.push(`${out.line.alias} = "${out.line.spec}" is in wally.toml.`);
			if (out.installed.length) said.push(`Installed ${out.installed.join(", ")}.`);
			if (out.problem) {
				said.push(out.problem);
				if (out.line && !out.installed.length) {
					said.push("Download the package's zip and use Insert its zip on it in the project tree.");
				}
			}
			notify(
				out.problem
					? out.installed.length
						? "Package partly installed"
						: "Package not installed"
					: "Package added",
				said.join(" "),
			);
		},
		[notify],
	);
	const onTreePackage = useCallback(
		async (how: "wally" | "zip" | "github" | "remove", entry?: TreeEntry) => {
			try {
				if (how === "remove" && entry?.kind === "package") {
					// `wally.toml/<realm>/<alias>`: the realm is in the entry's path.
					const realm = entry.path.split("/")[1] ?? "shared";
					const { uses } = await api.wallyUses(entry.name, realm);
					const ok = await ask({
						kind: "confirm",
						title: `Remove ${entry.name}?`,
						message: uses.length
							? `It comes out of wally.toml and Packages/, with any package only it needed. These still require it, and will fail to:`
							: `It comes out of wally.toml and Packages/, with any package only it needed. Nothing in the project requires it.`,
						...(uses.length ? { items: uses } : {}),
						confirmLabel: "Remove",
						danger: true,
					});
					if (ok !== true) return;
					const out = await api.wallyRemove(entry.name, realm);
					await refreshTree();
					const said = [
						out.removed.length
							? `Removed ${out.removed.join(", ")} from Packages/_Index.`
							: "Its line is out of wally.toml; nothing was installed to remove.",
						...(out.kept
							? [
									`${out.kept} is code put there in place of Wally's, so it was left. Delete it from the tree if nothing needs it.`,
								]
							: []),
					];
					notify(`${entry.name} removed`, said.join(" "));
					return;
				}
				if (how === "zip") {
					// A missing package's zip keeps the name wally.toml gives it.
					packageZipFor.current = entry?.kind === "package" ? entry.name : undefined;
					packageZipInput.current?.click();
					return;
				}
				if (how === "wally") {
					const answer = await ask({
						kind: "form",
						title: "Add from Wally",
						message:
							"A package from the Wally registry: scope/name, or scope/name@version. It goes into wally.toml, then installs with what it depends on.",
						fields: [
							{ id: "spec", kind: "text", label: "Package", value: "" },
							{ id: "alias", kind: "text", label: "Required as (optional)", value: "" },
							{
								id: "realm",
								kind: "select",
								label: "Realm",
								value: "shared",
								options: [
									{ value: "shared", label: "Shared (Packages)" },
									{ value: "server", label: "Server (ServerPackages)" },
									{ value: "dev", label: "Dev (DevPackages)" },
								],
							},
						],
						confirmLabel: "Add",
					});
					if (typeof answer !== "string") return;
					const chosen = JSON.parse(answer) as FormAnswers;
					const out = await api.wallyAdd(
						String(chosen.spec),
						chosen.realm as "shared" | "server" | "dev",
						String(chosen.alias) || undefined,
					);
					await refreshTree();
					reportPackage(out);
					return;
				}
				const answer = await ask({
					kind: "form",
					title: "Insert GitHub repo",
					message:
						"A repository to vendor into Packages/: owner/repo, or owner/repo@branch. Not added to wally.toml.",
					fields: [
						{ id: "repo", kind: "text", label: "Repository", value: "" },
						{ id: "alias", kind: "text", label: "Required as (optional)", value: "" },
					],
					confirmLabel: "Insert",
				});
				if (typeof answer !== "string") return;
				const chosen = JSON.parse(answer) as FormAnswers;
				const out = await api.wallyGithub(String(chosen.repo), String(chosen.alias) || undefined);
				await refreshTree();
				reportPackage(out);
			} catch (err) {
				notify("Could not add the package", errorMessage(err));
			}
		},
		[ask, notify, refreshTree, reportPackage],
	);
	const onPackageZip = useCallback(
		async (file: File) => {
			try {
				const bytes = new Uint8Array(await file.arrayBuffer());
				const out = await api.wallyZip(toBase64(bytes), file.name, packageZipFor.current);
				await refreshTree();
				reportPackage(out);
			} catch (err) {
				notify("Could not insert that zip", errorMessage(err));
			}
		},
		[notify, refreshTree, reportPackage],
	);

	/**
	 * The tree as last read, for the DataModel browser's handlers: through a
	 * ref, so they stay the same functions and the memoised browser does not
	 * render again every time the tree is read.
	 */
	const projectTreeRef = useRef<TreeEntry[]>([]);
	projectTreeRef.current = project?.tree ?? [];

	/** A file the DataModel browser names: the Luau that writes a script, or its graph. */
	const onPlaceOpenFile = useCallback(
		(path: string) => {
			// Luau the tree leaves out -- a Wally package under Packages/ -- still
			// opens: reading it goes by path, not by the tree.
			const entry =
				findTreeEntry(projectTreeRef.current, path) ??
				(/\.luau?$/.test(path)
					? { path, name: path.split("/").pop()!, kind: "luau" as const }
					: undefined);
			if (entry)
				void openEntry(entry).catch((err: Error) =>
					notify("Could not open that file", err.message),
				);
			else notify("Not in the project", `${path} is not in the project tree.`);
		},
		[openEntry, notify],
	);
	const placeGraphFor = useCallback(
		(path: string) => findTreeEntry(projectTreeRef.current, path)?.generatedFrom,
		[],
	);

	/** A function under a graph in the tree: its file first, then its graph. */
	const onTreeOpenFunction = useCallback(
		async (path: string, id: string) => {
			try {
				if (!store.isOpen(path)) {
					const { script } = await api.readScript(path);
					store.open(path, script);
				}
				if (!store.openFunction(path, id)) {
					notify("Could not open that function", "It is no longer in the graph.");
				}
			} catch (err) {
				notify("Could not open that graph", errorMessage(err));
			}
		},
		[notify],
	);

	/**
	 * Writes everything at or under `path` that has edits not yet on disk.
	 *
	 * Before a move or a rename, so the file that moves is the graph on screen,
	 * and so that no write still waiting for the old path lands there afterwards
	 * and brings the file back.
	 */
	const flushUnder = useCallback(
		async (path: string) => {
			await saves.flushUnder(path);
			// Still dirty means an earlier write failed and nothing is queued for it.
			for (const { path: open, script } of store.unsaved()) {
				if (open === path || open.startsWith(path + "/")) await writeGraph(open, script);
			}
		},
		[saves, writeGraph],
	);

	/**
	 * Before this tab becomes Node Design or the docs, on a screen where the
	 * pages share one: every graph with edits the autosave has not reached yet,
	 * and the node map if it has them. Leaving mid-pause used to be closing a
	 * tab; now it is a button, and the last edit must not be what it costs.
	 */
	useEffect(() => {
		setBeforeLeaving(async () => {
			await saves.flushAll();
			for (const { path, script } of store.unsaved()) await writeGraph(path, script);
			for (const map of store.unsavedMaps()) await api.writeMap(map.path, map.map);
		});
		return () => setBeforeLeaving(null);
	}, [saves, writeGraph]);

	/**
	 * Points every open document at where its file went.
	 *
	 * A tab kept its old path when a graph was moved, so its next autosave wrote
	 * the graph back where it had been. A folder move carries every tab under it;
	 * a graph moved or renamed itself is read back, because its name comes from
	 * its file name.
	 */
	const followMove = useCallback(async (from: string, to: string) => {
		const moved = (path: string) =>
			path === from ? to : path.startsWith(from + "/") ? to + path.slice(from.length) : null;

		for (const path of store.openPaths()) {
			const next = moved(path);
			if (next === null) continue;
			const script = path === from ? (await api.readScript(next)).script : undefined;
			store.rename(path, next, script);
		}
		store.moveSides(moved);
	}, []);

	const onTreeMove = useCallback(
		async (from: string[], toDir: string) => {
			try {
				for (const path of from) {
					await flushUnder(path);
					const { path: moved } = await api.moveScript(path, toDir);
					await followMove(path, moved);
				}
			} catch (err) {
				notify("Could not move that", errorMessage(err));
			}
			await refreshTree();
		},
		[refreshTree, flushUnder, followMove, notify],
	);

	/**
	 * Export Project: the menu that takes the project out, as a zip or as its
	 * place alone. See `ExportMenu.tsx`.
	 */
	const [exportOpen, setExportOpen] = useState(false);

	/**
	 * Throw away what this browser is holding and start from the demo.
	 *
	 * Asked first, and in the strongest terms the dialog has: there is no
	 * recycle bin behind this and no copy anywhere else. The offer to download
	 * first is in the message rather than in a second button, because a dialog
	 * with two ways to say yes is a dialog people click through.
	 *
	 * Reloads rather than putting the demo back in place. Every open document
	 * names a graph that is about to stop existing, and reconciling each one is
	 * more code and more ways to be wrong than starting the page again.
	 */
	/**
	 * A folder on the developer's own disk, in the browser.
	 *
	 * The project layer is pointed at it and then opened the ordinary way, so
	 * everything after this line is the same code path as opening a project on a
	 * machine — including the tree, the packs and where the compiler writes.
	 */
	const openFolder = useCallback(async () => {
		try {
			const picked = await openDirectory();
			// Cancelling the picker is an answer. Nothing to report.
			if (!picked) return;

			if ("root" in picked) {
				await loadProject(picked.root);
				await importRojo("folder");
				return;
			}

			/**
			 * The folder is not a project yet, and making it one writes into it.
			 *
			 * The same two things `roswaal init` writes, said plainly, because the
			 * folder in question is one somebody picked and may well be the root of
			 * a game they have been working on for a year.
			 */
			const ok = await ask({
				kind: "confirm",
				title: `Set up ${picked.notAProject} as a Roswaal project?`,
				message:
					"It has no roswaal.json yet. Roswaal will add one, along with a " +
					".roswaal folder for your graphs and node packs. Nothing else in the " +
					"folder is touched, and no code is compiled until you ask.",
				confirmLabel: "Set it up",
			});
			if (ok !== true) return;

			const made = await picked.initialise();
			await loadProject(made.root);
			await importRojo("folder");
		} catch (err) {
			notify("That folder could not be opened", errorMessage(err));
		}
	}, [ask, loadProject, notify, importRojo]);

	/**
	 * A project from a zip, in place of the one this browser holds.
	 *
	 * The file is picked first and the question asked after, so the question
	 * can name what is coming in -- and because Safari will not open a file
	 * picker from anything but the tap itself, so asking first would lose it.
	 * Nothing is replaced until the yes.
	 */
	const importZip = useCallback(
		async (file: File) => {
			try {
				const preview = await readZip(file);
				const ok = await ask({
					kind: "confirm",
					title: `Open ${preview.name}?`,
					message:
						`It replaces the project kept in this browser. Export that one first ` +
						`if you want to keep it.`,
					confirmLabel: "Open it",
				});
				if (ok !== true) return;

				const { pick, skipped } = await preview.open();
				let root: string;
				if ("root" in pick) {
					root = pick.root;
				} else {
					const setUp = await ask({
						kind: "confirm",
						title: `Set up ${pick.notAProject} as a Roswaal project?`,
						message:
							"It has no roswaal.json. Roswaal will add one, along with a .roswaal " +
							"folder for your graphs and node packs.",
						confirmLabel: "Set it up",
					});
					if (setUp !== true) return;
					root = (await pick.initialise()).root;
				}
				await loadProject(root);
				setIntroOpen(false);
				// One dialog at a time: each replaces the last, so the notice is
				// answered before the offer is made.
				if (skipped.length > 0) {
					const shown = skipped.slice(0, 6).map((one) => `${one.path} (${one.reason})`);
					if (skipped.length > shown.length)
						shown.push(`and ${skipped.length - shown.length} more`);
					await ask({
						kind: "notice",
						title: `${skipped.length} file${skipped.length === 1 ? "" : "s"} left out`,
						message: `The browser keeps a project's text files. Not brought in: ${shown.join(", ")}.`,
					});
				}
				await importRojo("zip");
			} catch (err) {
				notify("That zip could not be opened", errorMessage(err));
			}
		},
		[ask, loadProject, notify, importRojo],
	);

	/**
	 * A project made from a place, in place of the one this browser holds.
	 *
	 * Picked first and asked after, as a zip is, so the menu can show what is
	 * in the place before anything is chosen: how many scripts Rojo can sync,
	 * how many only the place can hold, and what merging copies would save.
	 */
	const importPlace = useCallback(
		async (file: File) => {
			try {
				const preview = await readPlace(file);
				const merged = preview.placeOnlyDistinct < preview.placeOnly;
				const fields: FormField[] = [
					{ id: "name", kind: "text", label: "Project name", value: preview.name },
				];
				if (preview.placeOnly > 0) {
					fields.push({
						id: "scope",
						kind: "choice",
						label: "Scripts",
						value: "rojo",
						options: [
							{ value: "rojo", label: `Only those Rojo can sync (${preview.rojo})` },
							{ value: "all", label: `All of them, the rest under place/ (${preview.scripts})` },
						],
					});
					if (merged) {
						fields.push({
							id: "dedupe",
							kind: "check",
							label: `Merge identical copies: ${preview.placeOnlyDistinct} files, not ${preview.placeOnly}`,
							value: true,
							when: { id: "scope", value: "all" },
						});
					}
				}
				const answer = await ask({
					kind: "form",
					title: `Open ${preview.file}?`,
					message:
						(preview.placeOnly > 0
							? `${preview.scripts} scripts: ${preview.rojo} Rojo can sync, ${preview.placeOnly} only the place can hold. `
							: `${preview.scripts} scripts, all of which Rojo can sync. `) +
						`It replaces the project kept in this browser; export that one first to keep it.`,
					fields,
					confirmLabel: "Open it",
				});
				if (typeof answer !== "string") return;
				const chosen = JSON.parse(answer) as FormAnswers;
				const { root, leftInPlace } = await preview.open({
					name: String(chosen.name || preview.name),
					scope: chosen.scope === "all" ? "all" : "rojo",
					dedupe: chosen.dedupe === true,
				});
				await loadProject(root);
				setIntroOpen(false);
				if (leftInPlace > 0) {
					notify(
						`${leftInPlace} script${leftInPlace === 1 ? "" : "s"} left in the place`,
						"Only the place can hold them. Open it again with All to bring them in.",
					);
				}
			} catch (err) {
				notify("That place could not be opened", errorMessage(err));
			}
		},
		[ask, loadProject, notify],
	);

	/**
	 * A project from nothing: a Rojo project with a first graph, and a place
	 * when asked for. What it holds is `core/newProject.ts`'s.
	 *
	 * The web build makes it in place of the browser's project, or in an empty
	 * folder it asks for; the daemon makes it at a path, which it is given here
	 * because that is the one thing a browser cannot produce for it.
	 */
	const newProject = useCallback(async () => {
		const inBrowser = canMakeProject();
		const fields: FormField[] = [
			inBrowser
				? { id: "name", kind: "text", label: "Project name", value: "My Game" }
				: { id: "folder", kind: "text", label: "Folder, empty or not there yet", value: "" },
			{
				id: "target",
				kind: "choice",
				label: "For",
				value: "roblox",
				options: [
					{ value: "roblox", label: "Roblox, with Rojo" },
					{ value: "lune", label: "Lune" },
				],
			},
			{
				id: "place",
				kind: "check",
				label: "Include a place: place.rbxlx, with a baseplate and a spawn",
				value: true,
				when: { id: "target", value: "roblox" },
			},
		];
		if (inBrowser && canOpenDirectory()) {
			fields.push({
				id: "where",
				kind: "choice",
				label: "Where",
				value: "browser",
				options: [
					{ value: "browser", label: "In this browser, in place of its project" },
					{ value: "folder", label: "In an empty folder on this computer…" },
				],
			});
		}
		const answer = await ask({
			kind: "form",
			title: "New project",
			message:
				"Rojo's three folders and a Main graph that prints Hello world, compiled and ready. " +
				(inBrowser
					? "In this browser it replaces the project kept here; export that one first to keep it."
					: "The folder is made if it is not there, and refused if it has files in it."),
			fields,
			confirmLabel: "Make it",
		});
		if (typeof answer !== "string") return;
		const chosen = JSON.parse(answer) as FormAnswers;
		const target: Target = chosen.target === "lune" ? "lune" : "roblox";
		const place = target === "roblox" && chosen.place === true;
		try {
			if (!inBrowser) {
				const folder = String(chosen.folder ?? "").trim();
				if (folder === "") throw new Error("Name the folder the project goes in.");
				if (await loadProject(folder, { target, place })) setIntroOpen(false);
				return;
			}
			const where = chosen.where === "folder" ? "folder" : "browser";
			const name = String(chosen.name ?? "").trim();
			const problem = where === "browser" ? projectNameProblem(name) : null;
			if (problem) throw new Error(problem);
			const made = await makeProject({ name, target, place, where });
			if (!made) return;
			await loadProject(made.root);
			setIntroOpen(false);
		} catch (err) {
			notify("The project could not be made", errorMessage(err));
		}
	}, [ask, loadProject, notify, setIntroOpen]);

	/**
	 * The folder from last time, reopened.
	 *
	 * Separate from the picker because there is nothing to pick: the browser
	 * still has the handle and only wants permission confirmed. Declining is an
	 * answer, so a `null` says nothing rather than reporting a failure.
	 */
	/**
	 * Opens a folder the browser remembers, asking for permission if it must.
	 *
	 * Answers whether it opened, the same as `switchProject` does and for the
	 * same reason: the introduction panel offers these as cards and stays open
	 * to say so when one does not.
	 */
	const reopenFolder = useCallback(
		async (folder: RememberedFolder): Promise<boolean> => {
			try {
				const opened = await folder.open();
				// Refusing the permission prompt is an answer, not a failure.
				if (!opened) return false;
				if ("root" in opened) return loadProject(opened.root, false, true);
				return false;
			} catch (err) {
				notify(`${folder.name} could not be reopened`, errorMessage(err));
				return false;
			}
		},
		[loadProject, notify],
	);

	const resetProject = useCallback(async () => {
		const ok = await ask({
			kind: "confirm",
			title: "Start again from the demo?",
			message:
				"Everything in this browser goes: every graph you have made or changed, and " +
				"every file compiled from them. Nothing is kept, and there is no copy " +
				"elsewhere unless you have exported one.",
			confirmLabel: "Throw it away",
			danger: true,
		});
		if (ok !== true) return;

		try {
			await api.resetProject();
			// And stop offering the folder from last time: a reset that put the
			// demo back and then reopened somebody's project on the next load
			// would not be a reset.
			await forgetRememberedFolder();
			window.location.reload();
		} catch (err) {
			notify("The project could not be reset", errorMessage(err));
		}
	}, [ask, notify]);

	const onTreeReveal = useCallback(
		async (target: string) => {
			try {
				await api.reveal(target);
			} catch (err) {
				notify("Could not show that file", errorMessage(err));
			}
		},
		[notify],
	);

	/**
	 * Where a new document lands, and how the dialog says so.
	 *
	 * A "New graph" button that silently drops the file into a folder you
	 * clicked ten minutes ago is worse than one that always uses the root, so
	 * the destination goes in the dialog's label. Then there is no state to
	 * remember and no surprise to undo.
	 */
	const inDir = useCallback(
		(dir: string | null) => {
			const source = project?.config.sourceDir ?? "";
			// The tree shows the compiled output as well as the graphs, and
			// clicking about in it sets the target like anything else. A graph
			// written into `outDir` would be deleted by the next compile, so
			// anything outside the source directory falls back to its root.
			// The check belongs here rather than in the tree: this is the one
			// place both the button and the menu pass through.
			const usable = dir !== null && (dir === source || dir.startsWith(source + "/"));
			return usable ? dir : source;
		},
		[project],
	);

	const createGraphIn = useCallback(
		async (dir: string) => {
			const name = await ask({
				kind: "prompt",
				title: "New graph",
				label: "Name",
				hint: `Created in ${dir}`,
				value: "Untitled",
				icon: "newFile",
			});
			if (typeof name !== "string") return;
			try {
				const created = await api.createScript(dir, name, "Script");
				await refreshTree();
				store.open(created.path, created.script);
			} catch (err) {
				notify("Could not create that graph", errorMessage(err));
			}
		},
		[ask, notify, refreshTree],
	);

	const createMapIn = useCallback(
		async (dir: string) => {
			const name = await ask({
				kind: "prompt",
				title: "New node map",
				label: "Name",
				hint: `Created in ${dir}`,
				value: "Tree",
				icon: "map",
			});
			if (typeof name !== "string") return;
			try {
				const created = await api.createMap(dir, name);
				await refreshTree();
				store.openSide({
					kind: "map",
					doc: { path: created.path, map: created.map, dirty: false },
				});
			} catch (err) {
				notify("Could not create that map", errorMessage(err));
			}
		},
		[ask, notify, refreshTree],
	);

	const importLuauFile = useCallback(
		async (entry: TreeEntry) => {
			// The risks are the developer's to take on, so they are named before
			// anything is written, every time, beside the settings that narrow them.
			let detected: Target | undefined;
			try {
				detected = detectTarget((await api.readSource(entry.path)).text);
			} catch {
				detected = undefined;
			}
			const projectTarget = project?.config.target ?? "roblox";
			// Asked only when the file and the project disagree.
			const conflict = detected !== undefined && detected !== projectTarget;
			// Imported before: offered again with the settings it was given.
			const again = entry.graph;
			const before = again
				? await api
						.readScript(again)
						.then((r) => r.script.importedAs)
						.catch(() => undefined)
				: undefined;
			const graphName = again?.split("/").pop();
			const answer = await ask({
				kind: "form",
				title: again ? `Reimport ${entry.name} as a graph?` : `Import ${entry.name} as a graph?`,
				message: again
					? `This replaces ${graphName}, and any change made to it since.`
					: "Turning Luau into a graph can be made safer but never certain. Test the graph before you rely on it.",
				points: [
					"It can compile and still behave differently, such as a call running at another moment.",
					"Comments become comment boxes. Spacing and formatting are the compiler's.",
					"What has no node stays as Luau text, which the graph does not check.",
				],
				fields: [
					{
						id: "locals",
						kind: "choice",
						label: "File-level locals become",
						value: before?.locals ?? "variable",
						options: [
							{ value: "variable", label: "Script variables" },
							{ value: "local", label: "Declare Locals" },
						],
					},
					{
						id: "mode",
						kind: "choice",
						label: "Reads as (every mode behaves the same)",
						value: before?.mode ?? "tidy",
						options: [
							{ value: "tidy", label: "Tidy" },
							{ value: "verbatim", label: "Verbatim" },
							{ value: "modern", label: "Modern" },
							{ value: "nodes", label: "Node-Prioritized" },
						],
					},
					codeRunsField(before?.codeRuns),
					...(conflict
						? [
								{
									id: "target",
									kind: "choice" as const,
									label: `Runtime (the file requires @lune/, the project is ${projectTarget === "roblox" ? "Roblox" : "Lune"})`,
									value: "lune",
									options: [
										{ value: "lune", label: "Lune" },
										{ value: "roblox", label: "Roblox" },
									],
								},
							]
						: []),
				],
				confirmLabel: again ? "Reimport" : "Import",
				icon: "graph",
			});
			if (typeof answer !== "string") return;
			const chosen = JSON.parse(answer) as FormAnswers;
			try {
				const out = await api.importScript(entry.path, {
					locals: chosen.locals === "local" ? "local" : "variable",
					mode: modeOf(chosen.mode),
					target: conflict
						? chosen.target === "roblox"
							? "roblox"
							: "lune"
						: (detected ?? undefined),
					...(again ? { replace: true } : {}),
					codeRuns: chosen.codeRuns === true,
				});
				await refreshTree();
				store.open(out.path, out.script);
				const { statements, asNodes, asCode, findings, rewrites, comments, services } = out.report;
				const kept = asCode.map((c) => `${c.construct} ×${c.count}`).join(", ");
				const boxed = comments.kept + comments.moved;
				const lines = [
					`${asNodes} of ${statements} statements are nodes.${kept ? ` Kept as code: ${kept}.` : ""}`,
					...(services > 0 ? [`Services declared: ${services}.`] : []),
					...(rewrites > 0 ? [`Written in newer syntax: ${rewrites}.`] : []),
					...(boxed > 0 || comments.dropped > 0
						? [
								`Comments boxed: ${boxed}${comments.moved > 0 ? ` (${comments.moved} from line ends)` : ""}.` +
									(comments.dropped > 0
										? ` Left out, with nothing after them: ${comments.dropped}.`
										: ""),
							]
						: []),
					...findings.map((f) => `Line ${f.line}: ${f.message}`),
					`${entry.name} is unchanged; compiling over it shows what changes and asks first.`,
				];
				notify(`${entry.name} ${again ? "reimported" : "imported"}`, lines.join(" "));
			} catch (err) {
				notify(`Could not import ${entry.name}`, errorMessage(err));
			}
		},
		[ask, notify, refreshTree, project],
	);

	/**
	 * Hand-written Luau files, each read into a graph with the same settings.
	 * A file imported before is imported over its graph, as Reimport does. Each
	 * file's runtime is the one its requires say, else the project's.
	 *
	 * `rojo`: the files of a whole Rojo project, whose map is already open and
	 * whose summary leads this one's. False when the settings were cancelled.
	 */
	const importMany = useCallback(
		async (entries: TreeEntry[], rojo?: { lead: string }): Promise<boolean> => {
			const again = entries.filter((e) => e.graph).length;
			const answer = await ask({
				kind: "form",
				title: `Import ${entries.length} Luau file${entries.length === 1 ? "" : "s"} as graphs?`,
				message:
					"Turning Luau into a graph can be made safer but never certain. Test the graphs before you rely on them." +
					(again > 0
						? ` ${again === 1 ? "One was" : `${again} were`} imported before: ${again === 1 ? "its graph is" : "their graphs are"} replaced, with any change made since.`
						: ""),
				points: [
					"It can compile and still behave differently, such as a call running at another moment.",
					"Comments become comment boxes. Spacing and formatting are the compiler's.",
					"What has no node stays as Luau text, which the graph does not check.",
				],
				fields: [
					{
						id: "locals",
						kind: "choice",
						label: "File-level locals become",
						value: "variable",
						options: [
							{ value: "variable", label: "Script variables" },
							{ value: "local", label: "Declare Locals" },
						],
					},
					{
						id: "mode",
						kind: "choice",
						label: "Reads as (every mode behaves the same)",
						value: "tidy",
						options: [
							{ value: "tidy", label: "Tidy" },
							{ value: "verbatim", label: "Verbatim" },
							{ value: "modern", label: "Modern" },
							{ value: "nodes", label: "Node-Prioritized" },
						],
					},
					codeRunsField(undefined),
				],
				confirmLabel: "Import",
				icon: "graph",
			});
			if (typeof answer !== "string") return false;
			const chosen = JSON.parse(answer) as FormAnswers;
			const locals = chosen.locals === "local" ? "local" : "variable";
			const mode = modeOf(chosen.mode);
			let statements = 0;
			let asNodes = 0;
			// Counted as they succeed: a graph the daemon would not import over is
			// among the failures, not the replaced.
			let replaced = 0;
			let first: { path: string; script: NodeScript } | undefined;
			const failed: string[] = [];
			for (const entry of entries) {
				try {
					const target = await api
						.readSource(entry.path)
						.then((r) => detectTarget(r.text))
						.catch(() => undefined);
					const out = await api.importScript(entry.path, {
						locals,
						mode,
						...(target ? { target } : {}),
						...(entry.graph ? { replace: true } : {}),
						codeRuns: chosen.codeRuns === true,
					});
					statements += out.report.statements;
					asNodes += out.report.asNodes;
					if (entry.graph) replaced++;
					first ??= out;
					// An open tab of a graph imported over shows the new one.
					if (store.isOpen(out.path)) store.reload(out.path, out.script);
				} catch (err) {
					// By path from a whole project, where every folder can have an init.luau.
					failed.push(`${rojo ? entry.path : entry.name}: ${errorMessage(err)}`);
				}
			}
			await refreshTree();
			// A whole project's map is open already, and is the place to start.
			if (first && !rojo) store.open(first.path, first.script);
			const done = entries.length - failed.length;
			notify(
				rojo ? "Rojo project imported" : `${done} of ${entries.length} files imported`,
				[
					...(rojo ? [rojo.lead, `${done} of ${entries.length} Luau files are graphs now.`] : []),
					`${asNodes} of ${statements} statements are nodes.`,
					...(replaced > 0 ? [`Imported again over their graphs: ${replaced}.`] : []),
					...failed.map((f) => `Not imported, ${f}`),
					"The files are unchanged; compiling over one shows what changes and asks first.",
				].join(" "),
			);
			return true;
		},
		[ask, notify, refreshTree],
	);
	importManyRef.current = importMany;

	/**
	 * Import selection as graphs, and Import folder as graphs. One file is
	 * Import as graph, with its own report.
	 */
	const importLuauFiles = useCallback(
		async (entries: TreeEntry[]) => {
			if (entries.length === 0) return;
			if (entries.length === 1) return importLuauFile(entries[0]);
			await importMany(entries);
		},
		[importLuauFile, importMany],
	);

	const onTreeNewFolder = useCallback(
		async (parentDir: string) => {
			const name = await ask({
				kind: "prompt",
				title: "New folder",
				label: "Name",
				hint: `Created in ${parentDir || "the project root"}`,
				value: "NewFolder",
				icon: "newFolder",
			});
			if (typeof name !== "string") return;
			try {
				await api.createFolder(`${parentDir}/${name}`.replace(/^\//, ""));
				await refreshTree();
			} catch (err) {
				notify("Something went wrong", errorMessage(err));
			}
		},
		[ask, notify, refreshTree],
	);

	const onTreeRename = useCallback(
		async (target: string) => {
			const currentName = target.split("/").pop() ?? "";
			const name = await ask({
				kind: "prompt",
				title: "Rename",
				label: "New name",
				value: currentName,
				confirmLabel: "Rename",
			});
			if (typeof name !== "string" || name === currentName) return;
			try {
				await flushUnder(target);
				const { path: renamed } = await api.renameEntry(target, name);
				await refreshTree();
				// Keep the tab, its history and its viewport: the file was renamed,
				// the graph was not touched. Closing and reopening would be simpler
				// and would throw all three away for an operation that changed
				// nothing about the document. A folder takes its open graphs with it.
				await followMove(target, renamed);
			} catch (err) {
				notify("Something went wrong", errorMessage(err));
			}
		},
		[ask, notify, refreshTree, flushUnder, followMove],
	);

	const onTreeDelete = useCallback(
		async (paths: string[]) => {
			const label = paths.length === 1 ? "this" : `these ${paths.length}`;
			const ok = await ask({
				kind: "confirm",
				title: "Delete",
				message: `Delete ${label}? This cannot be undone from Roswaal.`,
				items: paths,
				confirmLabel: "Delete",
				danger: true,
			});
			if (ok !== true) return;
			try {
				for (const target of paths) {
					// A write still waiting for something being deleted would bring
					// it back; one already under way is let finish first.
					saves.drop(target);
					await saves.flushUnder(target);
					await api.deleteScript(target);
					// Every tab of every file it took: function tabs, and everything
					// inside a folder. A deleted file elsewhere in the tree is no
					// reason to close the graph somebody is looking at.
					store.closePath(target);
				}
				await refreshTree();
			} catch (err) {
				notify("Something went wrong", errorMessage(err));
			}
		},
		[ask, notify, refreshTree, saves],
	);

	return {
		createGraphIn,
		createMapIn,
		importLuauFile,
		importLuauFiles,
		exportOpen,
		importPlace,
		importRojo,
		importZip,
		inDir,
		newProject,
		onPackageZip,
		onPlaceOpenFile,
		onTreeDelete,
		onTreeMove,
		onTreeNewFolder,
		onTreeOpen,
		onTreeOpenFunction,
		onTreePackage,
		onTreeRename,
		onTreeReveal,
		openFolder,
		packageZipInput,
		placeGraphFor,
		reopenFolder,
		resetProject,
		setExportOpen,
		followMove,
	};
}
