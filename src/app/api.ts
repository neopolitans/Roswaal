/** Thin wrapper over the daemon's HTTP API. */

import type { NodeDef, NodeScript, RoswaalConfig, ScriptClass, Target } from "../core/schema.js";
import type { Diagnostic } from "../core/compiler/index.js";
import type { InstanceLocation, MapDiagnostic, NodeMap } from "../core/nodemap.js";
import type { FunctionInfo } from "../core/functionGraph.js";
import type { LuaurcSource } from "../core/luaurc.js";
import type { TypeField } from "../core/typeFields.js";

export interface TreeEntry {
	path: string;
	name: string;
	kind: "directory" | "nodescript" | "nodemap" | "luau" | "luaurc";
	generatedFrom?: string;
	/** A graph's functions, as the file on disk has them. */
	functions?: FunctionInfo[];
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
	/** The targets all of its nodes run on, or null when they run on both. */
	targets: Target[] | null;
	requires: string[];
}

/** A type a module graph exports. The daemon's copy is in `src/server/project.ts`. */
export interface ExportedType {
	graph: string;
	name: string;
	location: InstanceLocation | null;
	/** Its fields, when it is a table of fixed ones. What Get Member offers. */
	fields?: TypeField[];
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

/**
 * How a request reaches whatever is serving the API.
 *
 * `fetch` to the daemon on a developer's machine; a message to a worker holding
 * the project in memory on the hosted editor. It answers a `Response` either
 * way, which is not a formality — it means everything below this line, the
 * error shape and the project guard included, is the same code in both.
 */
export type Transport = (url: string, init: RequestInit) => Promise<Response>;

/** What the editor needs of the daemon's event stream. `EventSource` fits it. */
export interface EventStream {
	addEventListener(type: string, handler: (event: MessageEvent) => void): void;
	close(): void;
}

let transport: Transport = (url, init) => fetch(url, init);
let openStream: () => EventStream = () => new EventSource("/api/events");

/**
 * Points the editor at something other than a daemon on localhost.
 *
 * Called once, before anything renders, by the hosted editor's entry point —
 * see `src/web/main.tsx`. The daemon build never calls it and keeps `fetch`.
 */
export function useTransport(next: { request: Transport; events: () => EventStream }): void {
	transport = next.request;
	openStream = next.events;
}

/** The daemon's event stream, or whatever is standing in for it. */
export function openEventStream(): EventStream {
	return openStream();
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await transport(url, {
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

	/** What is serving, and what it can do — see `host.ts`. */
	health: () => request<{
		ok: boolean; project: string | null; version: string; capabilities: string[];
	}>("/api/health"),

	/**
	 * The demo projects this host has, keyed by the folder name in
	 * `DEMO_PROJECTS`. Asked when the panel opens rather than on load: it
	 * costs the host a stat per demo and nobody is waiting on the answer.
	 */
	demos: () => request<{ demos: Record<string, string> }>("/api/demos"),

	/**
	 * Take a copy of a demo into `into`, and answer with the new root.
	 *
	 * A copy rather than opening what shipped: the demos are files beside the
	 * tool, and editing one changes what the next person to try it sees.
	 */
	duplicateDemo: (dir: string, into: string) =>
		post<{ root: string }>("/api/demos/duplicate", { dir, into }),

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
	/** Throws away what the host has stored. The caller reloads afterwards. */
	resetProject: () => post<{ ok: true }>("/api/reset", {}),
	/** The whole project as text, for `zip.ts` to turn into a download. */
	exportProject: () =>
		request<{ name: string; files: Record<string, string> }>("/api/export"),
	/** Generated files whose graph has moved or gone. */
	orphans: () => request<{ orphans: string[] }>("/api/orphans"),
	removeOrphans: (paths: string[]) =>
		post<{ removed: number }>("/api/orphans/remove", { paths }),

	/** The project's node packs, the directory a new one belongs in, and its target. */
	packs: () => request<{ packs: PackFile[]; dir: string; target: Target }>("/api/packs"),
	/** One pack's nodes as its file writes them. */
	readPack: (path: string) =>
		request<{ pack: PackFile; nodes: Record<string, unknown>[] }>(
			`/api/packs/read?path=${encodeURIComponent(path)}`,
		),
	/** A new, empty JSON pack in the project's first node path. */
	createPack: (name: string) => post<{ pack: PackFile }>("/api/packs/create", { name }),
	/** A copy beside it in its own namespace; for a Luau pack, the editable JSON copy. */
	duplicatePack: (path: string) => post<{ pack: PackFile }>("/api/packs/duplicate", { path }),
	/** The graphs placing this pack's nodes, for the question before deleting it. */
	packUsage: (path: string) =>
		request<{ usage: { graph: string; count: number }[] }>(
			`/api/packs/usage?path=${encodeURIComponent(path)}`,
		),
	deletePack: (path: string) => post<{ ok: true }>("/api/packs/delete", { path }),
	/** Another project's packs, and what that project compiles for. */
	scanPacks: (root: string) =>
		request<{ root: string; target: Target; packs: PackFile[] }>(
			`/api/packs/scan?root=${encodeURIComponent(root)}`,
		),
	importPack: (root: string, path: string) =>
		post<{ pack: PackFile }>("/api/packs/import", { root, path }),
	exportPack: (path: string, root: string) =>
		post<{ pack: PackFile }>("/api/packs/export", { root, path }),
	/** Adds a designed node to a JSON pack, or replaces the one with its id. */
	savePackNode: (path: string, def: NodeDef, replaces?: string) =>
		request<{ pack: PackFile; packs: NodeDef[] }>("/api/packs/node", {
			method: "PUT",
			body: JSON.stringify({ path, def, replaces }),
		}),
	/** The packs a pack's logic can be built from, by name. */
	setPackRequires: (path: string, requires: string[]) =>
		post<{ pack: PackFile }>("/api/packs/requires", { path, requires }),
	/** Takes one node out of a JSON pack. */
	deletePackNode: (path: string, id: string) =>
		post<{ pack: PackFile }>("/api/packs/node/delete", { path, id }),

	/** Every type the project's module graphs export, and where each module lands. */
	exportedTypes: () => request<{ types: ExportedType[] }>("/api/types"),
	/**
	 * Every `.luaurc` in the project, as text.
	 *
	 * Text rather than a parsed map so the parser has one home: the panel that
	 * shows a file's complaints shows the ones the compiler saw, and a file
	 * nobody can parse still says so rather than arriving as an empty object.
	 */
	luaurcFiles: () => request<{ files: LuaurcSource[] }>("/api/luaurc"),
	/** Writes one whole, and hands back the project's files as they now are. */
	writeLuaurc: (dir: string, text: string) =>
		request<{ files: LuaurcSource[] }>("/api/luaurc", {
			method: "PUT",
			body: JSON.stringify({ dir, text }),
		}),

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
