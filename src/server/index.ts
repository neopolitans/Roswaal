/**
 * The Roswaal daemon.
 *
 * It owns the filesystem and the compiler; the editor is a client. Keeping the
 * split here means hot reloading later is a file watcher calling the same
 * compileScript() the manual button already calls, rather than a second code
 * path.
 */

import cors from "cors";
import express from "express";
import path from "node:path";

import {
	buildTree, compileAll, compileScript, deleteEntry, initProject, moveEntry,
	openProject, readScript, readText, writeConfig, writeScript,
	type OpenProject,
} from "./project.js";
import { emptyScript, type NodeScript, type RoswaalConfig } from "../core/schema.js";

const PORT = Number(process.env.ROSWAAL_PORT ?? 4471);

const app = express();
app.use(cors());
app.use(express.json({ limit: "32mb" }));

/**
 * One project open at a time. The editor is a single window over a single
 * repository, so a session registry would be ceremony without a purpose.
 */
let current: OpenProject | null = null;

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
	res.json({ ok: true, project: current?.root ?? null });
});

app.post("/api/project/open", route(async (req) => {
	const root = String((req.body as { root?: string }).root ?? "");
	if (!root) throw new HttpError(400, "Provide a project root.");
	current = await openProject(root);
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

app.listen(PORT, () => {
	// eslint-disable-next-line no-console
	console.log(`Roswaal daemon listening on http://127.0.0.1:${PORT}`);
});

function cryptoId(): string {
	return globalThis.crypto.randomUUID();
}
