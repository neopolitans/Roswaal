/**
 * The Roswaal daemon.
 *
 * It owns the filesystem and the compiler; the editor is a client. That split
 * is what lets hot reload be a file watcher calling the same compileScript()
 * the manual button calls, rather than a second code path that can drift.
 *
 * Exported rather than self-starting, so the CLI can run it in-process instead
 * of shelling out to a second copy of itself.
 */

import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	buildTree, collectMaps, compileAll, compileMap, compileScript, createFolder,
	deleteEntry, initProject, moveEntry, openProject, readMap, readScript, readText,
	findOrphanOutputs, locateFile, removeOutputs, renameEntry, safeJoin,
	writeConfig, writeMap, writeScript,
	type OpenProject,
} from "./project.js";
import { streamEvents } from "./events.js";
import { revealInFileManager } from "./reveal.js";
import { VERSION } from "../cli/version.js";
import { HotReloader } from "./watcher.js";
import { emptyMap, type NodeMap } from "../core/nodemap.js";
import { emptyScript, type NodeScript, type RoswaalConfig } from "../core/schema.js";

export const DEFAULT_PORT = 4471;

/** Delay before exiting on shutdown, so the caller sees a reply, not a reset. */
const SHUTDOWN_DELAY_MS = 150;

export interface DaemonOptions {
	port?: number;
	/** Project to open before listening. Optional; the editor can open one too. */
	root?: string;
	/** Directory holding the built editor, served at "/" when it exists. */
	staticDir?: string;
	onListening?: (port: number) => void;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "32mb" }));

/**
 * One project open at a time. The editor is a single window over a single
 * repository, so a session registry would be ceremony without a purpose.
 */
let current: OpenProject | null = null;

const hot = new HotReloader();

/** Starts or stops the watcher to match the project's compile mode. */
function syncHotReload(): void {
	if (current?.config.compileMode === "hot") hot.start(current);
	else hot.stop();
}

function project(): OpenProject {
	if (!current) throw new HttpError(409, "No project is open. Open one first.");
	return current;
}

class HttpError extends Error {
	constructor(readonly status: number, message: string) {
		super(message);
	}
}

/** Wraps an async handler so a thrown error becomes a clean JSON response. */
function route<T>(handler: (req: express.Request) => Promise<T>): express.RequestHandler {
	return (req, res) => {
		handler(req).then(
			(value) => res.json(value),
			(err: Error) => {
				const status = err instanceof HttpError ? err.status : 400;
				res.status(status).json({ error: err.message });
			},
		);
	};
}

function requireQuery(req: express.Request, name: string): string {
	const value = req.query[name];
	if (typeof value !== "string" || value === "") {
		throw new HttpError(400, `Missing "${name}".`);
	}
	return value;
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

app.get("/api/health", (_req, res) => {
	res.json({ ok: true, project: current?.root ?? null, version: VERSION });
});

/**
 * The project the daemon already has open, if any. `roswaal serve` opens one
 * before listening, so the editor should adopt it rather than asking the
 * developer to name a directory they are already standing in.
 */
app.get("/api/project", route(async () => {
	if (!current) return { open: false as const };
	return {
		open: true as const,
		root: current.root,
		config: current.config,
		packErrors: current.packErrors,
		tree: await buildTree(current),
	};
}));

app.post("/api/project/open", route(async (req) => {
	const root = String((req.body as { root?: string }).root ?? "");
	if (!root) throw new HttpError(400, "Provide a project root.");
	current = await openProject(root);
	syncHotReload();
	return {
		root: current.root,
		config: current.config,
		packErrors: current.packErrors,
		tree: await buildTree(current),
	};
}));

app.post("/api/project/init", route(async (req) => {
	const root = String((req.body as { root?: string }).root ?? "");
	if (!root) throw new HttpError(400, "Provide a project root.");
	await initProject(root);
	current = await openProject(root);
	syncHotReload();
	return {
		root: current.root,
		config: current.config,
		packErrors: current.packErrors,
		tree: await buildTree(current),
	};
}));

app.put("/api/project/config", route(async (req) => {
	const p = project();
	const config = req.body as RoswaalConfig;
	await writeConfig(p.root, config);
	current = await openProject(p.root);
	syncHotReload();
	return { config: current.config };
}));

app.get("/api/tree", route(async () => ({ tree: await buildTree(project()) })));

/**
 * Custom node packs only. The editor bundles the built-in definitions, because
 * their pin derivation is code and cannot survive a round trip through JSON.
 */
app.get("/api/nodes", route(async () => {
	const p = project();
	const custom = [...p.registry.values()].filter(
		(def) => def.compilesTo.kind !== "builtin" && !def.derivePins,
	);
	return { custom, errors: p.packErrors };
}));

// ---------------------------------------------------------------------------
// Graphs
// ---------------------------------------------------------------------------

app.get("/api/script", route(async (req) => {
	return { script: await readScript(project(), requireQuery(req, "path")) };
}));

app.put("/api/script", route(async (req) => {
	const { path: relPath, script } = req.body as { path: string; script: NodeScript };
	if (!relPath || !script) throw new HttpError(400, "Provide both path and script.");
	await writeScript(project(), relPath, script);
	return { ok: true };
}));

app.post("/api/script/create", route(async (req) => {
	const p = project();
	const { dir, name, scriptClass } = req.body as {
		dir?: string; name?: string; scriptClass?: NodeScript["scriptClass"];
	};
	const safeName = (name ?? "Untitled").replace(/[^A-Za-z0-9_ -]/g, "").trim() || "Untitled";
	const targetDir = dir ?? p.config.sourceDir;
	const relPath = path.posix.join(targetDir, `${safeName}.nodescript`);

	const script = emptyScript(safeName, cryptoId());
	script.target = p.config.target;
	if (scriptClass) script.scriptClass = scriptClass;
	// A new graph is useless without somewhere for execution to start.
	script.nodes.push({
		id: cryptoId(),
		def: scriptClass === "ModuleScript" ? "module.exports" : "script.begin",
		x: 120,
		y: 160,
	});

	await writeScript(p, relPath, script);
	return { path: relPath, script };
}));

app.post("/api/script/move", route(async (req) => {
	const { from, toDir } = req.body as { from: string; toDir: string };
	return { path: await moveEntry(project(), from, toDir) };
}));

app.post("/api/script/delete", route(async (req) => {
	await deleteEntry(project(), String((req.body as { path: string }).path));
	return { ok: true };
}));

// ---------------------------------------------------------------------------
// Node maps
// ---------------------------------------------------------------------------

app.get("/api/map", route(async (req) => {
	return { map: await readMap(project(), requireQuery(req, "path")) };
}));

app.put("/api/map", route(async (req) => {
	const { path: relPath, map } = req.body as { path: string; map: NodeMap };
	if (!relPath || !map) throw new HttpError(400, "Provide both path and map.");
	await writeMap(project(), relPath, map);
	return { ok: true };
}));

app.post("/api/map/create", route(async (req) => {
	const p = project();
	const { dir, name } = req.body as { dir?: string; name?: string };
	const safeName = (name ?? "Tree").replace(/[^A-Za-z0-9_ -]/g, "").trim() || "Tree";
	const relPath = path.posix.join(dir ?? p.config.sourceDir, `${safeName}.nodemap`);
	const map = emptyMap(safeName, cryptoId(), cryptoId);
	await writeMap(p, relPath, map);
	return { path: relPath, map };
}));

app.post("/api/map/compile", route(async (req) => {
	const p = project();
	const { path: relPath, write, force } = req.body as {
		path?: string; write?: boolean; force?: boolean;
	};
	const targets = relPath ? [relPath] : await collectMaps(p);
	const results = [];
	for (const target of targets) results.push(await compileMap(p, target, { write, force }));
	return { results };
}));

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

app.post("/api/folder/create", route(async (req) => {
	const { path: relPath } = req.body as { path: string };
	if (!relPath) throw new HttpError(400, "Provide a path.");
	return { path: await createFolder(project(), relPath) };
}));

/**
 * Shows a file in the OS file manager. The editor is a web page and cannot do
 * this itself, which is the whole reason the daemon owns it.
 */
/**
 * Where a file sits in the DataModel, so the editor can turn a file dragged
 * onto the canvas into a require with the path already filled in.
 */
app.get("/api/resolve", route(async (req) => {
	return { location: await locateFile(project(), requireQuery(req, "path")) };
}));

app.post("/api/entry/reveal", route(async (req) => {
	const p = project();
	const { path: relPath } = req.body as { path?: string };
	await revealInFileManager(relPath ? safeJoin(p.root, relPath) : p.root);
	return { ok: true };
}));

app.post("/api/entry/rename", route(async (req) => {
	const { path: relPath, name } = req.body as { path: string; name: string };
	if (!relPath || !name) throw new HttpError(400, "Provide both path and name.");
	return { path: await renameEntry(project(), relPath, name) };
}));

app.get("/api/source", route(async (req) => {
	return { text: await readText(project(), requireQuery(req, "path")) };
}));

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

app.post("/api/compile", route(async (req) => {
	const p = project();
	const { path: relPath, write, force } = req.body as {
		path?: string; write?: boolean; force?: boolean;
	};
	const results = relPath
		? [await compileScript(p, relPath, { write, force })]
		: await compileAll(p, { write, force });
	return { results };
}));

/**
 * Generated files whose graph has moved or gone. Reported rather than removed:
 * deleting files is not something to do behind somebody's back.
 */
app.get("/api/orphans", route(async () => {
	return { orphans: await findOrphanOutputs(project()) };
}));

app.post("/api/orphans/remove", route(async (req) => {
	const { paths } = req.body as { paths?: string[] };
	const removed = await removeOutputs(project(), paths ?? []);
	return { removed };
}));

// ---------------------------------------------------------------------------
// Hot reload
// ---------------------------------------------------------------------------

app.get("/api/events", (req, res) => streamEvents(hot, req, res));

app.get("/api/hot/status", (_req, res) => {
	res.json({ running: hot.running, mode: current?.config.compileMode ?? null });
});

/**
 * How `roswaal stop` and `roswaal restart` work.
 *
 * An HTTP call rather than a PID file and a platform-specific kill: there is no
 * stale pid to reason about when a daemon dies unexpectedly, and no divergence
 * between Windows and everything else. The reply is sent before the process
 * exits, on a short delay, so the caller reads a clean answer instead of a
 * dropped connection it would have to interpret.
 */
app.post("/api/shutdown", (_req, res) => {
	res.json({ ok: true, stopping: true });
	setTimeout(() => process.exit(0), SHUTDOWN_DELAY_MS);
});

// ---------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------

export async function startDaemon(options: DaemonOptions = {}): Promise<void> {
	const port = options.port ?? DEFAULT_PORT;

	if (options.root) {
		current = await openProject(options.root);
		syncHotReload();
	}

	// The built editor, when there is one. In development Vite serves it instead
	// and proxies /api here, so this is simply absent.
	const staticDir = options.staticDir ?? defaultStaticDir();
	if (staticDir && fs.existsSync(path.join(staticDir, "index.html"))) {
		app.use(express.static(staticDir));
		app.get(/^(?!\/api\/).*/, (_req, res) => {
			res.sendFile(path.join(staticDir, "index.html"));
		});
	}

	await new Promise<void>((resolve, reject) => {
		const server = app.listen(port, "127.0.0.1", () => {
			options.onListening?.(port);
			resolve();
		});
		server.on("error", reject);
	});
}

/** The bundled editor sits next to the bundled CLI, one level up from it. */
function defaultStaticDir(): string | null {
	try {
		const here = path.dirname(fileURLToPath(import.meta.url));
		return path.resolve(here, "..", "dist");
	} catch {
		return null;
	}
}

export function isProjectOpen(): boolean {
	return current !== null;
}

function cryptoId(): string {
	return globalThis.crypto.randomUUID();
}
