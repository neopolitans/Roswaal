/**
 * The Roswaal API, as a table of handlers rather than a web server.
 *
 * These were Express routes in `app.ts`, and moving them out is what lets the
 * hosted editor exist. The daemon mounts this table on Express; the worker
 * behind the playground calls it directly. Neither has an opinion about what a
 * project is — the rules live in `project.ts`, and `project.ts` runs on a
 * filesystem it is handed (`./host.js`), so there is one implementation of the
 * API and one implementation of the rules underneath it.
 *
 * That matters more than the tidiness. The alternative was a second, browser-
 * shaped copy of these forty-odd handlers, and the two would have disagreed the
 * first time either changed — about which write is refused, about what counts
 * as a pack, about what the tree shows. The web build would then be a tool that
 * behaves *almost* like Roswaal, which is worse for a developer trying it out
 * than one that plainly is not Roswaal at all.
 *
 * What is **not** here is anything that needs a machine: the OS folder picker,
 * revealing a file, handing one to an editor, and inspecting a path before a
 * project is opened. Those arrive as `capabilities`, and a host that cannot do
 * one simply does not pass it — the route then answers 501, which the editor
 * already knows how to read as "drop the button" rather than as a failure.
 */

import { emptyFilesystemMap, emptyMap, type NodeMap } from "../core/nodemap.js";
import { emptyScript, type NodeDef, type NodeScript, type RoswaalConfig } from "../core/schema.js";
import { VERSION } from "../cli/version.js";

import { path } from "./host.js";
import {
	buildTree, collectMaps, collectProject, compileAll, compileMap, compileScript, copyPackBetween, createFolder,
	createPack, deleteEntry, deletePack, deletePackNode, duplicatePack, exportedTypes, findOrphanOutputs,
	graphName, initProject, listPacks, locateFile, moveEntry, openProject, packUsage, readConfig,
	readLuaurcFiles, readMap, readPack, readScript, readText, removeOutputs, renameEntry, safeJoin,
	savePackNode, scanProjectPacks, setPackRequires, writeConfig, writeLuaurcFile, writeMap,
	writeScript,
	type CompileStep, type OpenProject,
} from "./project.js";

export class HttpError extends Error {
	constructor(readonly status: number, message: string) {
		super(message);
	}
}

/** A request, reduced to the two things any of these handlers reads. */
export interface RouteRequest {
	query?: Record<string, string | undefined>;
	body?: unknown;
}

export type RouteHandler = (req: RouteRequest) => Promise<unknown>;

/**
 * What the machine underneath can do, when there is one.
 *
 * Every member is optional and every absence is answered with a 501 rather than
 * an error, because "this machine cannot do that" is not the caller's fault and
 * is not worth retrying. The daemon passes all four. A browser tab passes none,
 * and the editor drops the buttons — which is the behaviour it already had for
 * a daemon running over SSH with no dialog to show.
 */
export interface HostCapabilities {
	inspect?(root: string): Promise<{
		root: string; exists: boolean; directory: boolean; initialised: boolean;
	}>;
	browse?(startIn?: string): Promise<string | null>;
	/**
	 * Throws the project away so the host can start from its own beginning.
	 *
	 * Only a host whose project is *its* copy has any business offering this.
	 * The daemon does not pass it: there, the project is a directory somebody
	 * owns, and "start again" would mean deleting their work.
	 */
	reset?(): Promise<void>;
	reveal?(abs: string): Promise<void>;
	edit?(abs: string): Promise<string>;
	/**
	 * Copy a demo that shipped with Roswaal into a project of somebody's own.
	 *
	 * The demos are files on disk beside the tool, and opening one puts the
	 * editor straight onto them — so the first thing anybody does to try a demo
	 * is edit the copy every other user of that install will get. Worse, it is
	 * a copy under version control here, so the edit turns up in `git status`
	 * as a change to the repository rather than as somebody's own work.
	 *
	 * So a demo is taken rather than opened. `dir` is the folder name in
	 * `DEMO_PROJECTS`; `into` is where the developer wants it. What comes back
	 * is the new root, which is what then gets opened.
	 */
	duplicateDemo?(dir: string, into: string): Promise<string>;
}

export interface SessionHooks {
	capabilities?: HostCapabilities;
	/**
	 * The open project changed. `switched` separates "a different project is now
	 * open", which every tab needs to hear about, from "the same project was
	 * reloaded because its packs moved", which is nobody else's business.
	 */
	projectChanged?(project: OpenProject, info: { switched: boolean }): void;
	/** One file's turn in a whole-project compile, while it is still running. */
	compileStep?(step: CompileStep): void;
	/**
	 * Where this host keeps the demo projects, if it has them.
	 *
	 * A hook rather than a capability: a capability is something the editor
	 * offers a button for and disables with a reason, and there is nothing to
	 * say about a host that ships no demos except to not offer any. The daemon
	 * has them on disk beside itself and the playground has them on its volume;
	 * which ones exist is the host's to answer because it is the only one that
	 * can see them.
	 *
	 * Returns roots keyed by the folder name in `DEMO_PROJECTS`, so the names
	 * and the runtime chips stay in core and only the paths come from here.
	 */
	demos?(): Promise<Record<string, string>>;
}

/**
 * One project open at a time. The editor is a single window over a single
 * repository, so a session registry would be ceremony without a purpose.
 */
export class ApiSession {
	current: OpenProject | null = null;

	readonly routes: Readonly<Record<string, RouteHandler>>;

	constructor(private readonly hooks: SessionHooks = {}) {
		this.routes = this.build();
	}

	/** The project this request is about, or a 409 saying there is not one. */
	private project(): OpenProject {
		if (!this.current) throw new HttpError(409, "No project is open. Open one first.");
		return this.current;
	}

	/** The capabilities this host passed, by name, for the editor to read. */
	private abilities(): string[] {
		const given = this.hooks.capabilities ?? {};
		return (Object.keys(given) as (keyof HostCapabilities)[])
			.filter((name) => given[name] !== undefined)
			.sort();
	}

	private ability<K extends keyof HostCapabilities>(name: K): NonNullable<HostCapabilities[K]> {
		const able = this.hooks.capabilities?.[name];
		if (!able) {
			throw new HttpError(501, `This copy of Roswaal cannot do that: no ${name} is available here.`);
		}
		return able as NonNullable<HostCapabilities[K]>;
	}

	/** Opens a project and tells the host, which is the only way `current` moves. */
	private async open(root: string, switched: boolean): Promise<OpenProject> {
		this.current = await openProject(root);
		this.hooks.projectChanged?.(this.current, { switched });
		return this.current;
	}

	/** Reopens the project in place, so a pack change reaches the palette at once. */
	private async reload(): Promise<OpenProject> {
		return this.open(this.project().root, false);
	}

	/**
	 * Opens a project without a request having asked for it.
	 *
	 * For a host that knows which project it is serving before anything is
	 * listening: `roswaal serve <dir>` on the command line, and the playground
	 * mounting its starting project before the editor is rendered. Goes through
	 * the same path a request would, so the hooks fire either way.
	 */
	async openAt(root: string): Promise<OpenProject> {
		return this.open(root, true);
	}

	private async described(project: OpenProject) {
		return {
			root: project.root,
			config: project.config,
			packErrors: project.packErrors,
			tree: await buildTree(project),
		};
	}

	private build(): Record<string, RouteHandler> {
		const query = (req: RouteRequest, name: string): string => {
			const value = req.query?.[name];
			if (typeof value !== "string" || value === "") {
				throw new HttpError(400, `Missing "${name}".`);
			}
			return value;
		};
		const body = <T>(req: RouteRequest): T => (req.body ?? {}) as T;

		return {
			// -----------------------------------------------------------------
			// Project
			// -----------------------------------------------------------------

			/**
			 * What is serving, and what it can do.
			 *
			 * The capability list is the editor's, not a diagnostic: it hides the
			 * controls behind anything absent rather than offering them and
			 * failing on the click. Names, not a boolean each, so a host that
			 * gains one does not need this shape changed.
			 */
			/**
			 * The demo projects this host can open, by folder name.
			 *
			 * Its own route rather than a field on `/health`, which every page
			 * asks for on load: finding out costs a stat per demo and the
			 * answer is only wanted when somebody opens the panel.
			 */
			"GET /demos": async () => ({
				demos: this.hooks.demos ? await this.hooks.demos() : {},
			}),

			/**
			 * Take a copy of a demo, and answer with where it went.
			 *
			 * A copy rather than opening the original, so trying a demo cannot
			 * change what the next person who tries it will see.
			 */
			"POST /demos/duplicate": async (req) => {
				const body = req.body as { dir?: unknown; into?: unknown };
				if (typeof body.dir !== "string" || body.dir === "") {
					throw new HttpError(400, "Which demo? Pass its `dir`.");
				}
				if (typeof body.into !== "string" || body.into === "") {
					throw new HttpError(400, "Where should it go? Pass `into`.");
				}
				return { root: await this.ability("duplicateDemo")(body.dir, body.into) };
			},

			"GET /health": async () => ({
				ok: true,
				project: this.current?.root ?? null,
				version: VERSION,
				capabilities: this.abilities(),
			}),

			/**
			 * The project the host already has open. `roswaal serve` opens one
			 * before listening and the playground mounts one before starting, so
			 * the editor should adopt it rather than asking for a directory the
			 * developer is already standing in.
			 */
			"GET /project": async () => {
				if (!this.current) return { open: false as const };
				return { open: true as const, ...(await this.described(this.current)) };
			},

			"GET /project/inspect": async (req) =>
				this.ability("inspect")(path.resolve(query(req, "root"))),

			"POST /project/open": async (req) => {
				const { root } = body<{ root?: string }>(req);
				if (!root) throw new HttpError(400, "Provide a project root.");
				return this.described(await this.open(root, true));
			},

			/**
			 * Opens the operating system's folder picker and returns what was
			 * chosen. Answers `{ path: null }` on cancel, which is an ordinary
			 * outcome and not a 4xx; the editor simply does nothing.
			 *
			 * Deliberately does not open the project. Choosing a folder and
			 * opening it are two decisions, and the picker's own inspection —
			 * Open versus Initialise — belongs between them.
			 */
			"POST /project/browse": async (req) => {
				const { startIn } = body<{ startIn?: string }>(req);
				return { path: await this.ability("browse")(startIn) };
			},

			"POST /project/init": async (req) => {
				const { root } = body<{ root?: string }>(req);
				if (!root) throw new HttpError(400, "Provide a project root.");
				await initProject(root);
				return this.described(await this.open(root, true));
			},

			"PUT /project/config": async (req) => {
				const project = this.project();
				await writeConfig(project.root, body<RoswaalConfig>(req));
				return { config: (await this.reload()).config };
			},

			"GET /tree": async () => ({ tree: await buildTree(this.project()) }),

			/**
			 * Custom node packs only. The editor bundles the built-in definitions,
			 * because their pin derivation and display rules are code and cannot
			 * survive a round trip through JSON.
			 *
			 * **The project says which ones are packs; this does not work it out.**
			 * It used to, with a filter for definitions that were not
			 * builtin-handled and had no pin derivation — which is most of the
			 * built-in library. So the editor was handed 215 function-less copies
			 * of nodes it already had, they shadowed the real ones by loading last,
			 * and every field that was a function quietly stopped existing.
			 */
			"GET /nodes": async () => {
				const project = this.project();
				return { custom: project.packs, errors: project.packErrors };
			},

			// -----------------------------------------------------------------
			// Graphs
			// -----------------------------------------------------------------

			"GET /script": async (req) => ({
				script: await readScript(this.project(), query(req, "path")),
			}),

			"PUT /script": async (req) => {
				const { path: relPath, script } = body<{ path?: string; script?: NodeScript }>(req);
				if (!relPath || !script) throw new HttpError(400, "Provide both path and script.");
				await writeScript(this.project(), relPath, script);
				return { ok: true };
			},

			"POST /script/create": async (req) => {
				const project = this.project();
				const { dir, name, scriptClass } =
					body<{ dir?: string; name?: string; scriptClass?: NodeScript["scriptClass"] }>(req);
				// The same function renaming uses, so a graph created as "My Graph"
				// and one renamed to it end up called the same thing.
				const safeName = graphName(name ?? "Untitled") || "Untitled";
				const relPath = path.posix.join(dir ?? project.config.sourceDir, `${safeName}.nodescript`);

				const script = emptyScript(safeName, newId());
				script.target = project.config.target;
				if (scriptClass) script.scriptClass = scriptClass;
				// A new graph is useless without somewhere for execution to start.
				script.nodes.push({
					id: newId(),
					def: scriptClass === "ModuleScript" ? "module.exports" : "script.begin",
					x: 120,
					y: 160,
				});

				await writeScript(project, relPath, script);
				return { path: relPath, script };
			},

			"POST /script/move": async (req) => {
				const { from, toDir } = body<{ from: string; toDir: string }>(req);
				return { path: await moveEntry(this.project(), from, toDir) };
			},

			"POST /script/delete": async (req) => {
				await deleteEntry(this.project(), String(body<{ path?: string }>(req).path ?? ""));
				return { ok: true };
			},

			// -----------------------------------------------------------------
			// Node maps
			// -----------------------------------------------------------------

			"GET /map": async (req) => ({ map: await readMap(this.project(), query(req, "path")) }),

			"PUT /map": async (req) => {
				const { path: relPath, map } = body<{ path?: string; map?: NodeMap }>(req);
				if (!relPath || !map) throw new HttpError(400, "Provide both path and map.");
				await writeMap(this.project(), relPath, map);
				return { ok: true };
			},

			"POST /map/create": async (req) => {
				const project = this.project();
				const { dir, name } = body<{ dir?: string; name?: string }>(req);
				const safeName = (name ?? "Tree").replace(/[^A-Za-z0-9_ -]/g, "").trim() || "Tree";
				const relPath = path.posix.join(dir ?? project.config.sourceDir, `${safeName}.nodemap`);
				// A map describes where files end up, and that question has a
				// different shape per runtime. The project already says which
				// one it is, so a new map starts as the kind that project needs
				// rather than as the kind Roblox needed.
				const map = project.config.target === "lune"
					? emptyFilesystemMap(safeName, newId(), newId)
					: emptyMap(safeName, newId(), newId);
				await writeMap(project, relPath, map);
				return { path: relPath, map };
			},

			"POST /map/compile": async (req) => {
				const project = this.project();
				const { path: relPath, write, force } =
					body<{ path?: string; write?: boolean; force?: boolean }>(req);
				const targets = relPath ? [relPath] : await collectMaps(project);
				const results = [];
				for (const target of targets) results.push(await compileMap(project, target, { write, force }));
				return { results };
			},

			// -----------------------------------------------------------------
			// Folders and entries
			// -----------------------------------------------------------------

			"POST /folder/create": async (req) => {
				const { path: relPath } = body<{ path?: string }>(req);
				if (!relPath) throw new HttpError(400, "Provide a path.");
				return { path: await createFolder(this.project(), relPath) };
			},

			"POST /entry/reveal": async (req) => {
				const project = this.project();
				const { path: relPath } = body<{ path?: string }>(req);
				await this.ability("reveal")(relPath ? safeJoin(project.root, relPath) : project.root);
				return { ok: true };
			},

			/**
			 * Hands a file to the developer's own editor.
			 *
			 * Roswaal owns the graphs; it does not want to own the Luau somebody
			 * wrote by hand, and showing that file read-only while offering no way
			 * out of the read-only view is a dead end.
			 */
			"POST /entry/edit": async (req) => {
				const project = this.project();
				const relPath = String(body<{ path?: string }>(req).path ?? "");
				if (!relPath) throw new HttpError(400, "Provide a path.");
				return { editor: await this.ability("edit")(safeJoin(project.root, relPath)) };
			},

			"POST /entry/rename": async (req) => {
				const { path: relPath, name } = body<{ path?: string; name?: string }>(req);
				if (!relPath || !name) throw new HttpError(400, "Provide both path and name.");
				return { path: await renameEntry(this.project(), relPath, name) };
			},

			"GET /source": async (req) => ({
				text: await readText(this.project(), query(req, "path")),
			}),

			// -----------------------------------------------------------------
			// Node packs
			// -----------------------------------------------------------------

			/**
			 * The node packs on disk, and where a new one would go. The designer
			 * asks so it can offer a destination rather than choosing one.
			 */
			"GET /packs": async () => {
				const project = this.project();
				return {
					packs: await listPacks(project),
					dir: project.config.nodePaths[0] ?? ".roswaal/nodes",
					// What a pack's targets are checked against on its card.
					target: project.config.target,
				};
			},

			"GET /packs/read": async (req) => {
				const { pack, nodes } = await readPack(this.project(), query(req, "path"));
				return { pack, nodes };
			},

			"POST /packs/create": async (req) => {
				const { name } = body<{ name?: string }>(req);
				const pack = await createPack(this.project(), name ?? "");
				await this.reload();
				return { pack };
			},

			"POST /packs/duplicate": async (req) => {
				const { path: relPath } = body<{ path?: string }>(req);
				if (!relPath) throw new HttpError(400, "Provide a path.");
				const pack = await duplicatePack(this.project(), relPath);
				await this.reload();
				return { pack };
			},

			"GET /packs/usage": async (req) => ({
				usage: await packUsage(this.project(), query(req, "path")),
			}),

			"POST /packs/delete": async (req) => {
				const { path: relPath } = body<{ path?: string }>(req);
				if (!relPath) throw new HttpError(400, "Provide a path.");
				await deletePack(this.project(), relPath);
				await this.reload();
				return { ok: true };
			},

			/** Another project's packs, to import from. Reading, so harmless. */
			"GET /packs/scan": async (req) => scanProjectPacks(query(req, "root")),

			"POST /packs/import": async (req) => {
				const { root, path: relPath } = body<{ root?: string; path?: string }>(req);
				if (!root || !relPath) throw new HttpError(400, "Provide both root and path.");
				const from = await scanProjectPacks(root);
				const fromConfig = await readConfig(from.root);
				const pack = await copyPackBetween(
					{ root: from.root, config: fromConfig }, relPath, this.project(),
				);
				await this.reload();
				return { pack };
			},

			"POST /packs/export": async (req) => {
				const { root, path: relPath } = body<{ root?: string; path?: string }>(req);
				if (!root || !relPath) throw new HttpError(400, "Provide both root and path.");
				const to = await scanProjectPacks(root);
				const toConfig = await readConfig(to.root);
				return {
					pack: await copyPackBetween(this.project(), relPath, { root: to.root, config: toConfig }),
				};
			},

			/**
			 * Writes one designed node into a pack, and reopens the project so the
			 * editor has it immediately — a node you cannot place until you restart
			 * is a node you have to take on trust.
			 */
			"PUT /packs/node": async (req) => {
				const { path: relPath, def, replaces } =
					body<{ path?: string; def?: NodeDef; replaces?: string }>(req);
				if (!relPath || !def) throw new HttpError(400, "Provide both path and def.");
				const written = await savePackNode(this.project(), relPath, def, replaces);
				return { pack: written, packs: (await this.reload()).packs };
			},

			"POST /packs/requires": async (req) => {
				const { path: relPath, requires } =
					body<{ path?: string; requires?: string[] }>(req);
				if (!relPath || !Array.isArray(requires)) {
					throw new HttpError(400, "Provide a path and a requires list.");
				}
				const pack = await setPackRequires(this.project(), relPath, requires);
				await this.reload();
				return { pack };
			},

			"POST /packs/node/delete": async (req) => {
				const { path: relPath, id } = body<{ path?: string; id?: string }>(req);
				if (!relPath || !id) throw new HttpError(400, "Provide both path and id.");
				const pack = await deletePackNode(this.project(), relPath, id);
				await this.reload();
				return { pack };
			},

			// -----------------------------------------------------------------
			// Types and resolution
			// -----------------------------------------------------------------

			"GET /types": async () => ({ types: await exportedTypes(this.project()) }),

			"GET /resolve": async (req) => ({
				location: await locateFile(this.project(), query(req, "path")),
			}),

			// -----------------------------------------------------------------
			// `.luaurc`
			// -----------------------------------------------------------------

			/**
			 * Every `.luaurc` in the project, as text.
			 *
			 * All of them rather than the chain for one script: the editor keeps
			 * several graphs open and asks which aliases are in scope on every
			 * keystroke in a specifier field, and `chainFor` turns this into that
			 * answer without a round trip.
			 */
			"GET /luaurc": async () => ({ files: await readLuaurcFiles(this.project()) }),

			/**
			 * Writes one, whole.
			 *
			 * The caller sends the file's whole text because a `.luaurc` is the
			 * developer's: it may carry `languageMode` and settings that are none
			 * of our business, and rebuilding it from the aliases we understood
			 * would drop the rest without saying so.
			 */
			"PUT /luaurc": async (req) => {
				const body = req.body as { dir?: unknown; text?: unknown };
				if (typeof body.text !== "string") throw new HttpError(400, "text is required");
				const dir = typeof body.dir === "string" ? body.dir : "";
				await writeLuaurcFile(this.project(), dir, body.text);
				return { files: await readLuaurcFiles(this.project()) };
			},

			// -----------------------------------------------------------------
			// Compilation
			// -----------------------------------------------------------------

			"POST /compile": async (req) => {
				const project = this.project();
				const { path: relPath, write, force } =
					body<{ path?: string; write?: boolean; force?: boolean }>(req);
				// Only the whole-project walk narrates itself. One file has nothing
				// to report a position in, and the POST answering is the news.
				const results = relPath
					? [await compileScript(project, relPath, { write, force })]
					: await compileAll(project, { write, force }, this.hooks.compileStep);
				return { results };
			},

			/**
			 * Generated files whose graph has moved or gone. Reported rather than
			 * removed: deleting files is not something to do behind somebody's back.
			 */
			/**
			 * The whole project, as text, for the editor to zip and hand over.
			 *
			 * On both hosts, not just the hosted one. It costs nothing on the
			 * daemon -- where the answer is a directory somebody already has --
			 * and a route that only exists on one of them is a route that only
			 * works on one of them, which is the arrangement this whole file
			 * exists to avoid.
			 */
			/**
			 * Forgets what the host has stored. The caller reloads afterwards:
			 * the editor is holding open documents that name graphs which are
			 * about to stop existing, and a reload is a shorter answer than
			 * reconciling every one of them.
			 */
			"POST /reset": async () => {
				await this.ability("reset")();
				return { ok: true };
			},

			"GET /export": async () => {
				const project = this.project();
				return { name: path.posix.basename(project.root) || "project", files: await collectProject(project) };
			},

			"GET /orphans": async () => ({ orphans: await findOrphanOutputs(this.project()) }),

			"POST /orphans/remove": async (req) => {
				const { paths } = body<{ paths?: string[] }>(req);
				return { removed: await removeOutputs(this.project(), paths ?? []) };
			},
		};
	}

	/**
	 * Runs one request. Unknown routes are a 404 rather than a throw, because
	 * both hosts have to answer something and "there is no such route" is an
	 * answer the editor can report.
	 */
	async handle(method: string, routePath: string, req: RouteRequest = {}): Promise<unknown> {
		const handler = this.routes[`${method.toUpperCase()} ${routePath}`];
		if (!handler) throw new HttpError(404, `No such route: ${method} ${routePath}`);
		return handler(req);
	}
}

/** Kept out of the handlers so the id source is one line to find and to change. */
function newId(): string {
	return globalThis.crypto.randomUUID();
}
