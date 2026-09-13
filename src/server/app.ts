/**
 * The Roswaal daemon.
 *
 * It owns the filesystem and the compiler; the editor is a client. That split
 * is what lets dynamic compiling be a file watcher calling the same compileScript()
 * the manual button calls, rather than a second code path that can drift.
 *
 * Exported rather than self-starting, so the CLI can run it in-process instead
 * of shelling out to a second copy of itself.
 */

import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	buildTree, collectMaps, compileAll, compileMap, compileScript, copyPackBetween, createFolder,
	createPack, deletePackNode,
	deleteEntry, deletePack, duplicatePack, exportedTypes, graphName, initProject, listPacks,
	moveEntry, openProject, packUsage, readConfig, readMap, readPack, readScript, readText,
	savePackNode, scanProjectPacks, setPackRequires,
	findOrphanOutputs, locateFile, removeOutputs, renameEntry, safeJoin,
	writeConfig, writeMap, writeScript,
	type OpenProject,
} from "./project.js";
import { broadcastCompile, broadcastProject, streamEvents } from "./events.js";
import { chooseDirectory, NoPickerError } from "./browse.js";
import { openInEditor, revealInFileManager } from "./reveal.js";
import { VERSION } from "../cli/version.js";
import { DynamicCompiler } from "./watcher.js";
import { emptyMap, type NodeMap } from "../core/nodemap.js";
import { emptyScript, type NodeDef, type NodeScript, type RoswaalConfig } from "../core/schema.js";

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

/**
 * Loopback names. Everything the daemon will answer to, and nothing else.
 *
 * `localhost` is in here because that is what Vite serves the editor on in
 * development, and it resolves to loopback everywhere that matters.
 */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** The host part of a `Host:` or an `Origin:`, without its port or scheme. */
function hostnameOf(value: string): string {
	const withoutScheme = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
	// An IPv6 literal keeps its brackets; everything else splits on the colon.
	const bracketed = withoutScheme.match(/^\[[^\]]+\]/);
	return (bracketed ? bracketed[0] : withoutScheme.split(":")[0]).toLowerCase();
}

/**
 * Whether to refuse a request outright, and why. `null` means let it through.
 *
 * The daemon listens on 127.0.0.1, which stops anything on the network reaching
 * it — but not the browser already running on this machine. Every page the
 * developer has open can reach a loopback port, and `cors()` used to answer all
 * of them with "yes, read the response". That was enough for any website to run
 * this against a developer with the daemon up:
 *
 *     POST /api/project/init  { root: "C:/Users/someone" }
 *     GET  /api/source?path=...
 *
 * `safeJoin` keeps every path inside the project root, but the *root* is
 * whatever the caller asked for, so that pair is an arbitrary file read — and
 * `init` writes a `roswaal.json` wherever it is pointed. Roswaal is a local
 * tool; nothing needs cross-origin access, so nothing gets it.
 *
 * Two checks, because they stop different things:
 *
 *  - **Host**, against DNS rebinding. A page on `evil.com` whose DNS is made to
 *    answer 127.0.0.1 is *same-origin* with the daemon as far as the browser is
 *    concerned, so it sends no `Origin` at all and an origin check never fires.
 *    What it cannot forge is `Host`, which still says `evil.com`.
 *  - **Origin**, against the ordinary cross-origin case. A browser always sends
 *    it on a cross-origin request and a page cannot suppress or spoof it.
 *
 * A request with no `Origin` is allowed: that is curl, the CLI, and anything
 * else that is not a browser, none of which a hostile page can impersonate.
 *
 * Residual, and deliberate: any *loopback* origin is accepted, so a different
 * server on the developer's own machine is trusted. Pinning the port would
 * break Vite on 4470 talking to the daemon on 4471, and a hostile server
 * already running locally is a threat this cannot answer anyway.
 */
export function refusesConnection(
	host: string | undefined, origin: string | undefined,
): string | null {
	if (host !== undefined && !LOOPBACK.has(hostnameOf(host))) {
		return `Roswaal only answers on localhost. This request asked for "${host}".`;
	}
	if (origin !== undefined && origin !== "" && !LOOPBACK.has(hostnameOf(origin))) {
		return `Roswaal does not serve other origins. This request came from "${origin}".`;
	}
	return null;
}

const app = express();

/**
 * Before anything is parsed, so a refused request costs a header read.
 *
 * This replaced `cors()`, which was not merely loose but unnecessary: in
 * development Vite proxies `/api` to the daemon server-side, and in production
 * the daemon serves the editor itself. The browser never makes a cross-origin
 * request to it, so there was never anything for CORS to permit.
 */
app.use((req, res, next) => {
	const refusal = refusesConnection(req.headers.host, req.headers.origin);
	if (refusal) {
		res.status(403).json({ error: refusal });
		return;
	}
	next();
});

app.use(express.json({ limit: "32mb" }));

/**
 * One project open at a time. The editor is a single window over a single
 * repository, so a session registry would be ceremony without a purpose.
 */
let current: OpenProject | null = null;

const dynamic = new DynamicCompiler();

/**
 * Starts or stops the watcher to match the project's compile mode.
 *
 * The stored value is still `"hot"` — what a person reads changed, what a
 * committed `roswaal.json` holds did not.
 */
function syncDynamicCompile(): void {
	if (current?.config.compileMode === "hot") dynamic.start(current);
	else dynamic.stop();
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
	syncDynamicCompile();
	broadcastProject(current.root);
	return {
		root: current.root,
		config: current.config,
		packErrors: current.packErrors,
		tree: await buildTree(current),
	};
}));

/**
 * Opens the operating system's folder picker and returns what was chosen.
 *
 * On the daemon because a browser cannot produce a filesystem path — see
 * `browse.ts`. Answers `{ path: null }` on cancel, which is an ordinary
 * outcome and not a 4xx; the editor simply does nothing.
 *
 * Deliberately does not open the project. Choosing a folder and opening it are
 * two decisions, and the picker's own inspection — Open versus Initialise —
 * belongs between them.
 */
app.post("/api/project/browse", route(async (req) => {
	const { startIn } = req.body as { startIn?: string };
	try {
		return { path: await chooseDirectory(typeof startIn === "string" ? startIn : undefined) };
	} catch (err) {
		// 501: the machine cannot do this, which is not the caller's fault and
		// not worth retrying. The editor drops the button and says why.
		if (err instanceof NoPickerError) throw new HttpError(501, err.message);
		throw err;
	}
}));

app.post("/api/project/init", route(async (req) => {
	const root = String((req.body as { root?: string }).root ?? "");
	if (!root) throw new HttpError(400, "Provide a project root.");
	await initProject(root);
	current = await openProject(root);
	syncDynamicCompile();
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
	syncDynamicCompile();
	return { config: current.config };
}));

app.get("/api/tree", route(async () => ({ tree: await buildTree(project()) })));

/**
 * Custom node packs only. The editor bundles the built-in definitions, because
 * their pin derivation and display rules are code and cannot survive a round
 * trip through JSON.
 *
 * **The project says which ones are packs; this does not work it out.** It used
 * to, with a filter for definitions that were not builtin-handled and had no
 * pin derivation — which is most of the built-in library. So the editor was
 * handed 215 function-less copies of nodes it already had, they shadowed the
 * real ones by loading last, and every field that was a function quietly
 * stopped existing for exactly those nodes. It cost an afternoon to find,
 * because the copies are correct in every way a reader would check.
 */
app.get("/api/nodes", route(async () => {
	const p = project();
	return { custom: p.packs, errors: p.packErrors };
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
	// The same function renaming uses, so a graph created as "My Graph" and one
	// renamed to it end up called the same thing.
	const safeName = graphName(name ?? "Untitled") || "Untitled";
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
/**
 * The node packs on disk, and where a new one would go.
 *
 * The designer asks so it can offer a destination rather than choosing one: a
 * node belongs in a pack somebody named, beside the other nodes of its kind.
 */
app.get("/api/packs", route(async () => {
	const p = project();
	return {
		packs: await listPacks(p),
		dir: p.config.nodePaths[0] ?? ".roswaal/nodes",
		// What a pack's targets are checked against on its card.
		target: p.config.target,
	};
}));

/** One pack's nodes, as the file writes them, for the designer to open. */
app.get("/api/packs/read", route(async (req) => {
	const { pack, nodes } = await readPack(project(), requireQuery(req, "path"));
	return { pack, nodes };
}));

/** Reopens the project after a pack changed, so the editor's palette follows. */
async function reloadPacks(): Promise<void> {
	current = await openProject(current!.root);
	syncDynamicCompile();
}

app.post("/api/packs/create", route(async (req) => {
	const { name } = req.body as { name?: string };
	const pack = await createPack(project(), name ?? "");
	await reloadPacks();
	return { pack };
}));

/** A copy beside it, in its own namespace. For a Luau pack, the editable JSON copy. */
app.post("/api/packs/duplicate", route(async (req) => {
	const { path: relPath } = req.body as { path?: string };
	if (!relPath) throw new HttpError(400, "Provide a path.");
	const pack = await duplicatePack(project(), relPath);
	await reloadPacks();
	return { pack };
}));

/** Which graphs use a pack's nodes, asked before deleting it. */
app.get("/api/packs/usage", route(async (req) => {
	return { usage: await packUsage(project(), requireQuery(req, "path")) };
}));

app.post("/api/packs/delete", route(async (req) => {
	const { path: relPath } = req.body as { path?: string };
	if (!relPath) throw new HttpError(400, "Provide a path.");
	await deletePack(project(), relPath);
	await reloadPacks();
	return { ok: true };
}));

/** Another project's packs, to import from. Reading, so harmless for any folder. */
app.get("/api/packs/scan", route(async (req) => {
	return scanProjectPacks(requireQuery(req, "root"));
}));

/** Copies a pack from another project into this one. */
app.post("/api/packs/import", route(async (req) => {
	const { root, path: relPath } = req.body as { root?: string; path?: string };
	if (!root || !relPath) throw new HttpError(400, "Provide both root and path.");
	const from = await scanProjectPacks(root);
	const fromConfig = await readConfig(from.root);
	const pack = await copyPackBetween({ root: from.root, config: fromConfig }, relPath, project());
	await reloadPacks();
	return { pack };
}));

/** Copies one of this project's packs into another project. */
app.post("/api/packs/export", route(async (req) => {
	const { root, path: relPath } = req.body as { root?: string; path?: string };
	if (!root || !relPath) throw new HttpError(400, "Provide both root and path.");
	const to = await scanProjectPacks(root);
	const toConfig = await readConfig(to.root);
	return { pack: await copyPackBetween(project(), relPath, { root: to.root, config: toConfig }) };
}));

/**
 * Writes one designed node into a pack, and reopens the project so the editor
 * has it immediately — a node you cannot place until you restart the daemon is
 * a node you have to take on trust.
 */
app.put("/api/packs/node", route(async (req) => {
	const { path: relPath, def, replaces } = req.body as { path?: string; def?: NodeDef; replaces?: string };
	if (!relPath || !def) throw new HttpError(400, "Provide both path and def.");

	const written = await savePackNode(project(), relPath, def, replaces);
	current = await openProject(current!.root);
	syncDynamicCompile();
	return { pack: written, packs: current.packs };
}));

/** The packs a pack's logic can be built from, by name. */
app.post("/api/packs/requires", route(async (req) => {
	const { path: relPath, requires } = req.body as { path?: string; requires?: string[] };
	if (!relPath || !Array.isArray(requires)) throw new HttpError(400, "Provide a path and a requires list.");
	const pack = await setPackRequires(project(), relPath, requires);
	await reloadPacks();
	return { pack };
}));

app.post("/api/packs/node/delete", route(async (req) => {
	const { path: relPath, id } = req.body as { path?: string; id?: string };
	if (!relPath || !id) throw new HttpError(400, "Provide both path and id.");
	const pack = await deletePackNode(project(), relPath, id);
	await reloadPacks();
	return { pack };
}));

/** The types the project's modules export, for the editor to offer by name. */
app.get("/api/types", route(async () => ({ types: await exportedTypes(project()) })));

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
	// Only the whole-project walk narrates itself. One file has nothing to
	// report a position in, and the POST answering is the news.
	const results = relPath
		? [await compileScript(p, relPath, { write, force })]
		: await compileAll(p, { write, force }, broadcastCompile);
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
// Dynamic compiling
// ---------------------------------------------------------------------------

app.get("/api/events", (req, res) => streamEvents(dynamic, req, res));

// The route keeps its path, and the reply its field names: both are the
// contract a running editor is already speaking. Only what a person reads
// changed.
app.get("/api/hot/status", (_req, res) => {
	res.json({ running: dynamic.running, mode: current?.config.compileMode ?? null });
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
		syncDynamicCompile();
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
