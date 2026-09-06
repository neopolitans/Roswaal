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
import { broadcastProject, streamEvents } from "./events.js";
import { openInEditor, revealInFileManager } from "./reveal.js";
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

/**
 * The project a request believes it is talking to.
 *
 * One editor tab, one daemon, one project — and the daemon can be pointed at a
 * different project while a tab is still open on the old one. When that
 * happened the tab went on autosaving its document against whatever root the
 * daemon now served, and the graph was written into the wrong repository. Two
 * stray files turned up in `examples/demo` that way, and nothing had gone
 * wrong from either side's point of view.
 *
 * So every request that writes carries the root it thinks is open, and a
 * mismatch is refused rather than obeyed. The header is what the daemon itself
 * handed the client, so an exact comparison is right: normalising here would
 * only invent ways for two spellings of the same path to disagree.
 *
 * A client that sends no header is an older one, and is let through — the guard
 * is a safety net for a race, not an authentication scheme.
 */
const PROJECT_HEADER = "x-roswaal-project";

/**
 * Deliberately changes the project, so it cannot be asked to match the old one.
 *
 * Paths are relative to the `/api` mount, because that is what `req.path` is
 * inside the middleware — spelling them in full here would have matched nothing
 * and quietly locked the editor out of switching projects at all.
 */
const SWITCHES_PROJECT = new Set(["/project/open", "/project/init"]);

/**
 * Whether this request must be refused because it belongs to another project.
 *
 * A pure decision, exported so it can be tested: an integration test would have
 * to bind a port, and what is actually worth pinning down is which requests the
 * guard lets through. Getting that wrong in either direction is bad — too
 * strict and the editor cannot switch projects at all, too loose and the bug it
 * exists for comes back.
 */
export function refusesRequest(
	method: string, routePath: string, claimed: string | undefined, open: string | null,
): boolean {
	// Reading is harmless: the worst case is showing the new project's files,
	// which is what the tab is about to be told to do anyway.
	if (method === "GET" || method === "HEAD") return false;
	// The two routes whose whole job is to change the answer, and shutdown,
	// which is not about a project at all.
	if (SWITCHES_PROJECT.has(routePath) || routePath === "/shutdown") return false;
	// No claim means an older client. The guard is a safety net for a race, not
	// an authentication scheme, so it does not lock anyone out.
	if (!claimed || !open) return false;
	return claimed !== open;
}

app.use("/api", (req, res, next) => {
	const claimed = req.header(PROJECT_HEADER);
	if (!refusesRequest(req.method, req.path, claimed, current?.root ?? null)) return next();

	res.status(409).json({
		code: "project-changed",
		root: current!.root,
		error:
			`This editor is open on ${claimed}, and the daemon is now serving ` +
			`${current!.root}. Nothing was written. Reload to follow the daemon, or ` +
			`point it back at the project you were working in.`,
	});
});

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

/**
 * What is at a path, before anything is opened.
 *
 * The picker used to offer Open and Initialise side by side and let the
 * developer guess which one their directory wanted. Asking first means one
 * button that says the right thing, and a typo reported as a typo rather than
 * as a failure to open.
 */
app.get("/api/project/inspect", route(async (req) => {
	const root = path.resolve(requireQuery(req, "root"));
	const stat = await fs.promises.stat(root).catch(() => null);
	if (!stat) return { root, exists: false as const, directory: false, initialised: false };
	if (!stat.isDirectory()) {
		return { root, exists: true as const, directory: false, initialised: false };
	}
	const initialised = fs.existsSync(path.join(root, "roswaal.json"));
	return { root, exists: true as const, directory: true, initialised };
}));

app.post("/api/project/open", route(async (req) => {
	const root = String((req.body as { root?: string }).root ?? "");
	if (!root) throw new HttpError(400, "Provide a project root.");
	current = await openProject(root);
	syncHotReload();
	broadcastProject(current.root);
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
	broadcastProject(current.root);
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

/**
 * Hands a file to the developer's own editor.
 *
 * Roswaal owns the graphs; it does not want to own the Luau somebody wrote by
 * hand, and showing that file read-only while offering no way out of the
 * read-only view is a dead end. The daemon is the only part that can reach the
 * shell, and it resolves the path against the project root before spawning
 * anything — see `openInEditor`, which never goes through a shell.
 */
app.post("/api/entry/edit", route(async (req) => {
	const p = project();
	const relPath = String((req.body as { path?: string }).path ?? "");
	if (!relPath) throw new HttpError(400, "Provide a path.");
	const editor = await openInEditor(safeJoin(p.root, relPath));
	return { editor };
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
		/**
		 * The asset filenames carry a content hash, so they can be cached hard.
		 * `index.html` is the one file that must not be: it is what names the
		 * current hashes, and a cached copy pins the browser to whichever build
		 * it was fetched with. Rebuilding then changes nothing on screen — the
		 * editor keeps running an old bundle and reports an old version number,
		 * which is a confusing way to find out you are debugging yesterday.
		 */
		const noCacheHtml = (res: express.Response, filePath: string) => {
			if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
		};

		app.use(express.static(staticDir, { setHeaders: noCacheHtml }));
		app.get(/^(?!\/api\/).*/, (_req, res) => {
			res.setHeader("Cache-Control", "no-cache");
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
