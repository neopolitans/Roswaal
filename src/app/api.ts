/** Thin wrapper over the daemon's HTTP API. */

import type { NodeDef, NodeScript, RoswaalConfig, ScriptClass } from "../core/schema.js";
import type { Diagnostic } from "../core/compiler/index.js";
import type { InstanceLocation, MapDiagnostic, NodeMap } from "../core/nodemap.js";

export interface TreeEntry {
	path: string;
	name: string;
	kind: "directory" | "nodescript" | "nodemap" | "luau";
	generatedFrom?: string;
	children?: TreeEntry[];
}

export interface ProjectInfo {
	root: string;
	config: RoswaalConfig;
	packErrors: string[];
	tree: TreeEntry[];
}

/** A node pack on disk. The daemon's copy is in `src/server/project.ts`. */
export interface PackFile {
	path: string;
	name: string;
	format: "json" | "luau";
	nodes: string[];
	errors: string[];
}

/** A type a module graph exports. The daemon's copy is in `src/server/project.ts`. */
export interface ExportedType {
	graph: string;
	name: string;
	location: InstanceLocation | null;
}

export interface MapOutcome {
	mapPath: string;
	outputPath: string;
	written: boolean;
	skipped?: string;
	diagnostics: MapDiagnostic[];
	json: string;
}

export interface CompileOutcome {
	scriptPath: string;
	outputPath: string;
	written: boolean;
	skipped?: string;
	/** Files this graph used to write and no longer does, now deleted. */
	superseded?: string[];
	diagnostics: Diagnostic[];
	sourceMap: { line: number; node: string }[];
	code: string;
}

/**
 * One file's turn in a project compile, pushed over the event stream while the
 * compile is still running rather than returned when it finishes.
 *
 * Declared here rather than imported from `src/server`: this file is the whole
 * description of the wire, and the editor bundle does not depend on the daemon's
 * source. The daemon's copy is in `src/server/project.ts`, where the states are
 * documented and decided.
 */
export interface CompileStep {
	index: number;
	total: number;
	scriptPath: string;
	state: "working" | "wrote" | "skipped" | "failed" | "checked";
	note?: string;
}

/**
 * The project this tab believes is open, sent with every request that writes.
 *
 * The daemon serves one project at a time and can be pointed at another one
 * while this tab is still open on the old one. Without this the tab went on
 * autosaving into whatever repository the daemon had moved to, which is how two
 * stray graphs ended up in `examples/demo`. The daemon refuses a mismatch, so
 * the worst case is a save that does not happen and says why.
 */
let projectRoot: string | null = null;

/** Thrown when the daemon has moved to a different project under this tab. */
export class ProjectChangedError extends Error {
	constructor(message: string, readonly root: string) {
		super(message);
		this.name = "ProjectChangedError";
	}
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, {
		...init,
		headers: {
			"Content-Type": "application/json",
			...(projectRoot ? { "X-Roswaal-Project": projectRoot } : {}),
			...init?.headers,
		},
	});
	const payload = await response.json().catch(() => ({ error: response.statusText }));
	if (!response.ok) {
		const body = payload as { error?: string; code?: string; root?: string };
		if (body.code === "project-changed") {
			throw new ProjectChangedError(body.error ?? "The project changed.", body.root ?? "");
		}
		throw new Error(body.error ?? "Request failed");
	}
	return payload as T;
}

const post = <T>(url: string, body: unknown) =>
	request<T>(url, { method: "POST", body: JSON.stringify(body) });

export const api = {
	/** Called whenever a project is opened, so writes can be guarded. */
	setProjectRoot: (root: string | null) => {
		projectRoot = root;
	},

	health: () => request<{ ok: boolean; project: string | null }>("/api/health"),

	/** What the daemon already has open, if `roswaal serve` opened one. */
	currentProject: () =>
		request<({ open: false } | ({ open: true } & ProjectInfo))>("/api/project"),
	/** What is at a path, before committing to opening it. */
	inspectProject: (root: string) =>
		request<{ root: string; exists: boolean; directory: boolean; initialised: boolean }>(
			`/api/project/inspect?root=${encodeURIComponent(root)}`,
		),
	/**
	 * Asks the daemon to open the OS folder picker. Resolves with `null` when
	 * the developer cancels, which is an answer rather than a failure.
	 *
	 * Rejects with a 501 on a machine that has no dialog to show — a daemon over
	 * SSH, or a Linux box with neither zenity nor kdialog. The caller drops the
	 * button rather than offering something that cannot work twice.
	 */
	browseForProject: (startIn?: string) =>
		post<{ path: string | null }>("/api/project/browse", { startIn }),
	openProject: (root: string) => post<ProjectInfo>("/api/project/open", { root }),
	initProject: (root: string) => post<ProjectInfo>("/api/project/init", { root }),
	saveConfig: (config: RoswaalConfig) =>
		request<{ config: RoswaalConfig }>("/api/project/config", {
			method: "PUT",
			body: JSON.stringify(config),
		}),

	tree: () => request<{ tree: TreeEntry[] }>("/api/tree"),
	customNodes: () => request<{ custom: NodeDef[]; errors: string[] }>("/api/nodes"),

	readScript: (path: string) =>
		request<{ script: NodeScript }>(`/api/script?path=${encodeURIComponent(path)}`),
	writeScript: (path: string, script: NodeScript) =>
		request<{ ok: true }>("/api/script", {
			method: "PUT",
			body: JSON.stringify({ path, script }),
		}),
	createScript: (dir: string, name: string, scriptClass: ScriptClass) =>
		post<{ path: string; script: NodeScript }>("/api/script/create", { dir, name, scriptClass }),
	moveScript: (from: string, toDir: string) =>
		post<{ path: string }>("/api/script/move", { from, toDir }),
	deleteScript: (path: string) => post<{ ok: true }>("/api/script/delete", { path }),

	readMap: (path: string) =>
		request<{ map: NodeMap }>(`/api/map?path=${encodeURIComponent(path)}`),
	writeMap: (path: string, map: NodeMap) =>
		request<{ ok: true }>("/api/map", { method: "PUT", body: JSON.stringify({ path, map }) }),
	createMap: (dir: string, name: string) =>
		post<{ path: string; map: NodeMap }>("/api/map/create", { dir, name }),
	compileMap: (opts: { path?: string; write?: boolean; force?: boolean }) =>
		post<{ results: MapOutcome[] }>("/api/map/compile", opts),

	createFolder: (path: string) => post<{ path: string }>("/api/folder/create", { path }),
	/** Generated files whose graph has moved or gone. */
	orphans: () => request<{ orphans: string[] }>("/api/orphans"),
	removeOrphans: (paths: string[]) =>
		post<{ removed: number }>("/api/orphans/remove", { paths }),

	/** The project's node packs, and the directory a new one belongs in. */
	packs: () => request<{ packs: PackFile[]; dir: string }>("/api/packs"),
	/** Adds a designed node to a JSON pack, or replaces the one with its id. */
	savePackNode: (path: string, def: NodeDef) =>
		request<{ pack: PackFile; packs: NodeDef[] }>("/api/packs/node", {
			method: "PUT",
			body: JSON.stringify({ path, def }),
		}),

	/** Every type the project's module graphs export, and where each module lands. */
	exportedTypes: () => request<{ types: ExportedType[] }>("/api/types"),
	/** Where a file lands in the DataModel, per the project's node maps. */
	resolve: (path: string) =>
		request<{ location: InstanceLocation | null }>(`/api/resolve?path=${encodeURIComponent(path)}`),
	/** Shows a file in the OS file manager. Empty path reveals the project root. */
	reveal: (path?: string) => post<{ ok: true }>("/api/entry/reveal", { path }),
	/** Hands a file to VS Code. Resolves with the editor it found. */
	openInEditor: (path: string) => post<{ editor: string }>("/api/entry/edit", { path }),
	renameEntry: (path: string, name: string) =>
		post<{ path: string }>("/api/entry/rename", { path, name }),

	readSource: (path: string) =>
		request<{ text: string }>(`/api/source?path=${encodeURIComponent(path)}`),

	compile: (opts: { path?: string; write?: boolean; force?: boolean }) =>
		post<{ results: CompileOutcome[] }>("/api/compile", opts),
};
