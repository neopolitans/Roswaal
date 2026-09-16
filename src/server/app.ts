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
import sea from "node:sea";

import { ApiSession, HttpError, type RouteRequest } from "./routes.js";
import { broadcastCompile, broadcastProject, streamEvents } from "./events.js";
import { chooseDirectory, NoPickerError } from "./browse.js";
import { openInEditor, revealInFileManager } from "./reveal.js";
import { DynamicCompiler } from "./watcher.js";
import { DEMO_PROJECTS } from "../core/demoProjects.js";

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

const dynamic = new DynamicCompiler();

/**
 * Starts or stops the watcher to match the project's compile mode.
 *
 * The stored value is still `"hot"` — what a person reads changed, what a
 * committed `roswaal.json` holds did not.
 */
function syncDynamicCompile(): void {
	if (session.current?.config.compileMode === "hot") dynamic.start(session.current);
	else dynamic.stop();
}

/**
 * The API itself, which is not Express's and does not live here.
 *
 * `routes.ts` holds every handler, and this file is what puts them on a socket:
 * the loopback guard, the project guard, the event stream, the static editor.
 * The same table is mounted by the worker behind the hosted editor with a
 * volume in memory underneath it, so there is one description of what Roswaal
 * does and two ways to reach it.
 */

/**
 * Where Roswaal itself is installed, for finding the demo projects.
 *
 * `ROSWAAL_HOME` when the launcher set it, and otherwise walked up from this
 * module until a directory with `examples/` in it turns up. Two answers because
 * there are two ways to be running: through `bin/roswaal`, which exports it,
 * and straight from source with `tsx`, which does not.
 *
 * Null when neither finds one, which is a real case — an npm install that
 * packed the CLI and not the examples — and the panel then offers no demos
 * rather than paths that are not there.
 */
function installRoot(): string | null {
	const declared = process.env.ROSWAAL_HOME;
	if (declared && fs.existsSync(path.join(declared, "examples"))) return declared;

	let at = path.dirname(fileURLToPath(import.meta.url));
	for (let up = 0; up < 6; up += 1) {
		if (fs.existsSync(path.join(at, "examples"))) return at;
		const parent = path.dirname(at);
		if (parent === at) break;
		at = parent;
	}
	return null;
}

const session = new ApiSession({
	/** Everything the daemon can do that a browser tab cannot. */
	capabilities: {
		inspect: async (root) => {
			const stat = await fs.promises.stat(root).catch(() => null);
			if (!stat) return { root, exists: false, directory: false, initialised: false };
			if (!stat.isDirectory()) return { root, exists: true, directory: false, initialised: false };
			return {
				root,
				exists: true,
				directory: true,
				initialised: fs.existsSync(path.join(root, "roswaal.json")),
			};
		},
		/**
		 * Copy a demo into a directory of the developer's own.
		 *
		 * Named after the demo, and never over the top of something already
		 * there — a second copy becomes `lune-demo-2`. Taking a demo is meant
		 * to be safe twice, and a copy that silently replaced an earlier one
		 * would lose whatever had been done to it.
		 */
		duplicateDemo: async (dir, into) => {
			const home = installRoot();
			if (home === null) throw new HttpError(501, "This copy of Roswaal has no demos.");
			if (!DEMO_PROJECTS.some((one) => one.dir === dir)) {
				throw new HttpError(404, `There is no demo called "${dir}".`);
			}
			const from = path.join(home, "examples", dir);
			if (!fs.existsSync(path.join(from, "roswaal.json"))) {
				throw new HttpError(404, `The "${dir}" demo is not in this install.`);
			}

			const parent = path.resolve(into);
			if (!fs.existsSync(parent)) throw new HttpError(400, `There is no directory at ${parent}.`);

			let root = path.join(parent, dir);
			for (let n = 2; fs.existsSync(root); n += 1) root = path.join(parent, `${dir}-${n}`);

			// `.roswaal` and everything else. `recursive` copies the dot
			// directory too, which is where the graphs are -- a copy without it
			// would be the generated Luau and nothing to regenerate it from.
			await fs.promises.cp(from, root, { recursive: true });
			return root;
		},

		browse: async (startIn) => {
			try {
				return await chooseDirectory(startIn);
			} catch (err) {
				// 501: the machine cannot do this, which is not the caller's fault
				// and not worth retrying. The editor drops the button and says why.
				if (err instanceof NoPickerError) throw new HttpError(501, err.message);
				throw err;
			}
		},
		reveal: revealInFileManager,
		edit: openInEditor,
	},
	projectChanged: (project, { switched }) => {
		syncDynamicCompile();
		// Only a real switch is broadcast. Reopening the same project because its
		// packs moved is not news another tab needs, and telling it so would close
		// every document it has open.
		if (switched) broadcastProject(project.root);
	},
	compileStep: broadcastCompile,
	/** The demos that shipped with this copy, by folder name. */
	demos: async () => {
		const home = installRoot();
		if (home === null) return {};
		const out: Record<string, string> = {};
		for (const demo of DEMO_PROJECTS) {
			const root = path.join(home, "examples", demo.dir);
			if (fs.existsSync(path.join(root, "roswaal.json"))) out[demo.dir] = root;
		}
		return out;
	},
});

/** Wraps a handler so a thrown error becomes a clean JSON response. */
function route(handler: (req: RouteRequest) => Promise<unknown>): express.RequestHandler {
	return (req, res) => {
		const asRequest: RouteRequest = {
			query: req.query as Record<string, string | undefined>,
			body: req.body,
		};
		handler(asRequest).then(
			(value) => res.json(value),
			(err: Error) => {
				const status = err instanceof HttpError ? err.status : 400;
				res.status(status).json({ error: err.message });
			},
		);
	};
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
	if (!refusesRequest(req.method, req.path, claimed, session.current?.root ?? null)) return next();

	res.status(409).json({
		code: "project-changed",
		root: session.current!.root,
		error:
			`This editor is open on ${claimed}, and the daemon is now serving ` +
			`${session.current!.root}. Nothing was written. Reload to follow the daemon, or ` +
			`point it back at the project you were working in.`,
	});
});

// ---------------------------------------------------------------------------
// The API
// ---------------------------------------------------------------------------

/**
 * Every route in `routes.ts`, put on Express under `/api`.
 *
 * A loop rather than forty-odd registrations, so a route added to the table is
 * served by the daemon and by the hosted editor without either being edited.
 * The table's keys are `"METHOD /path"` with the path relative to this mount —
 * which is also what `req.path` is inside the guard above, so the two agree by
 * construction rather than by being kept in step.
 */
for (const [key, handler] of Object.entries(session.routes)) {
	const [method, routePath] = key.split(" ");
	const mount = `/api${routePath}`;
	switch (method) {
		case "GET": app.get(mount, route(handler)); break;
		case "POST": app.post(mount, route(handler)); break;
		case "PUT": app.put(mount, route(handler)); break;
		case "DELETE": app.delete(mount, route(handler)); break;
		default: throw new Error(`Unsupported method in the route table: ${key}`);
	}
}

// ---------------------------------------------------------------------------
// Dynamic compiling
// ---------------------------------------------------------------------------

app.get("/api/events", (req, res) => streamEvents(dynamic, req, res));

// The route keeps its path, and the reply its field names: both are the
// contract a running editor is already speaking. Only what a person reads
// changed.
app.get("/api/hot/status", (_req, res) => {
	res.json({ running: dynamic.running, mode: session.current?.config.compileMode ?? null });
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

	if (options.root) await session.openAt(options.root);

	/**
	 * The built editor, carried inside the executable.
	 *
	 * A packaged build has no `dist/` beside it -- it has no beside -- so the
	 * editor and the documentation travel in the binary itself, as assets, and
	 * are served from memory. Four files and under two megabytes, which is what
	 * makes this worth doing at all: the localhost editor is one bundle, one
	 * stylesheet and the page that names them.
	 *
	 * First, because a build that has them should use them rather than looking
	 * for a directory it will not find.
	 */
	if (mountEmbeddedEditor(app)) {
		await listen();
		return;
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

	await listen();

	function listen(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const server = app.listen(port, "127.0.0.1", () => {
				options.onListening?.(port);
				resolve();
			});
			server.on("error", reject);
		});
	}
}

/**
 * The editor's own files, when they are inside the executable.
 *
 * `index.html` is always there in a packaged build, so it is the one asked for
 * to decide whether there are any. `getRawAsset` throws for a name that was
 * not embedded rather than answering null, which is why every read here is
 * wrapped: asking is the only way to find out.
 */
function embeddedAsset(name: string): Buffer | null {
	if (!sea.isSea()) return null;
	try {
		return Buffer.from(sea.getRawAsset(name));
	} catch {
		return null;
	}
}

/** What a browser should be told each kind of file is. */
const CONTENT_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
	".png": "image/png",
	".ico": "image/x-icon",
	".map": "application/json; charset=utf-8",
};

/**
 * Serve the editor out of the binary, if this is a build that carries it.
 *
 * Answers whether it did, so the caller can fall back to a directory on disk.
 * The single-page fallback is the same rule the filesystem mount uses: anything
 * that is not `/api/` and does not name a file is the application's own route
 * -- `/docs`, `/designer` -- and gets the page that knows how to draw it.
 */
function mountEmbeddedEditor(app: express.Express): boolean {
	if (embeddedAsset("index.html") === null) return false;

	app.get(/^(?!\/api\/).*/, (req, res) => {
		const wanted = decodeURIComponent(req.path).replace(/^\/+/, "");
		const asset = wanted === "" ? null : embeddedAsset(wanted);

		if (asset !== null) {
			const dot = wanted.lastIndexOf(".");
			const type = dot === -1 ? undefined : CONTENT_TYPES[wanted.slice(dot).toLowerCase()];
			if (type) res.setHeader("Content-Type", type);
			// The asset names carry a content hash, so they can be cached hard.
			// `index.html` cannot: it is what names the current hashes.
			res.setHeader(
				"Cache-Control",
				wanted.endsWith(".html") ? "no-cache" : "public, max-age=31536000, immutable",
			);
			res.send(asset);
			return;
		}

		const page = embeddedAsset("index.html");
		if (page === null) {
			res.status(404).send("Not found");
			return;
		}
		res.setHeader("Content-Type", CONTENT_TYPES[".html"]);
		res.setHeader("Cache-Control", "no-cache");
		res.send(page);
	});

	return true;
}

/**
 * Whether this copy has an editor to serve at all.
 *
 * A single-file build has none: `dist/` is resolved beside the CLI on disk, and
 * a packaged executable has nothing beside it. That is the honest shape of such
 * a build rather than a fault -- the CLI commands are self-contained and the
 * editor is a few megabytes of web application -- but `serve` must say so, or
 * it starts, prints a URL, and answers 404 on it.
 */
export function hasBundledEditor(): boolean {
	if (embeddedAsset("index.html") !== null) return true;
	const dir = defaultStaticDir();
	return dir !== null && fs.existsSync(path.join(dir, "index.html"));
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
	return session.current !== null;
}

