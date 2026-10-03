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

import { VERSION } from "../cli/version.js";
import { fromBase64, toBase64 } from "../core/base64.js";
import { emptyFilesystemMap, emptyMap, type NodeMap } from "../core/nodemap.js";
import {
	describeInstance,
	fingerprint,
	outlinePlace,
	type PlaceOutline,
} from "../core/rbx/browse.js";
import { type RbxDocument, RbxError, type RbxInstance, readRbx } from "../core/rbx/index.js";
import { type PlaceReport, planPlaceUpdate } from "../core/rbx/placeExport.js";
import { emptyScript, type NodeDef, type NodeScript } from "../core/schema.js";
import { errorMessage, HttpError } from "./errors.js";
import { path } from "./host.js";
import { toPosix } from "./paths.js";
import {
	buildTree,
	type CompileStep,
	collectBinaries,
	collectMaps,
	collectProject,
	compileAll,
	compileMap,
	compileScript,
	copyPackBetween,
	createFolder,
	createPack,
	deleteEntry,
	deletePack,
	deletePackNode,
	duplicatePack,
	exportedTypes,
	exportPlace,
	findOrphanOutputs,
	findPlaceFile,
	findRojoProjects,
	graphName,
	graphOutputPath,
	importRojoProject,
	initProject,
	listPacks,
	locateFile,
	moveEntry,
	type OpenProject,
	openProject,
	packUsage,
	placeEntries,
	placeReport,
	readConfig,
	readLuaurcFiles,
	readMap,
	readPack,
	readPlaceBytes,
	readScript,
	readText,
	removeOutputs,
	renameEntry,
	safeJoin,
	savePackNode,
	scanProjectPacks,
	setPackRequires,
	writeConfig,
	writeLuaurcFile,
	writeMap,
	writeScript,
} from "./project.js";
import { fields, need, optionalQuery, query, type RouteRequest, realmOf, text } from "./request.js";
import { instancePathOf, modulesRequiredBy, projectInstances } from "./requires.js";
import { addFromWally, installGithub, installZip, packageUses, removePackage } from "./wally.js";

export { type ErrorBody, errorResponse, HttpError, UserError } from "./errors.js";
export type { RouteRequest } from "./request.js";

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
		root: string;
		exists: boolean;
		directory: boolean;
		initialised: boolean;
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
	/**
	 * A GitHub repository's archive, `ref` a branch, tag or commit, or "" for
	 * the default branch. The
	 * daemon's alone: GitHub's archive download refuses a web page, so the
	 * hosted editor cannot fetch one and does not offer to.
	 */
	githubDownload?(owner: string, repo: string, ref: string): Promise<Uint8Array>;
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

	/**
	 * The place last read, kept while its bytes stay the same: the DataModel
	 * browser asks for one instance at a time, and parsing the place for each
	 * would cost more than every answer together.
	 */
	private place: LoadedPlace | null = null;

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
			throw new HttpError(
				501,
				`This copy of Roswaal cannot do that: no ${name} is available here.`,
			);
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
			place: await findPlaceFile(project.root, project.config),
		};
	}

	/** The project's place, parsed, from the cache while its bytes are unchanged. */
	private async loadPlace(project: OpenProject, file: string): Promise<LoadedPlace> {
		const bytes = await readPlaceBytes(project, file);
		const stamp = `${file}:${fingerprint(bytes)}`;
		if (this.place?.root === project.root && this.place.stamp === stamp) return this.place;
		const doc = readRbx(bytes);
		const { outline, order } = outlinePlace(doc);
		const index = new Map(order.map((inst, i) => [inst, i]));
		this.place = { root: project.root, stamp, doc, outline, order, index };
		return this.place;
	}

	/** The route table, gathered from one method per area. */
	private build(): Record<string, RouteHandler> {
		return {
			...this.projectRoutes(),
			...this.placeRoutes(),
			...this.luauRoutes(),
			...this.packageRoutes(),
			...this.documentRoutes(),
			...this.entryRoutes(),
			...this.packRoutes(),
			...this.compileRoutes(),
		};
	}

	/** What is serving, the open project, its settings, and the demos. */
	private projectRoutes(): Record<string, RouteHandler> {
		return {
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
				const { dir, into } = fields<{ dir: string; into: string }>(req);
				const demo = need(text(dir), "dir", "Which demo? Pass its `dir`.");
				const where = need(text(into), "into", "Where should it go? Pass `into`.");
				return { root: await this.ability("duplicateDemo")(demo, where) };
			},

			/**
			 * What is serving, and what it can do.
			 *
			 * The capability list is the editor's, not a diagnostic: it hides the
			 * controls behind anything absent rather than offering them and
			 * failing on the click. Names, not a boolean each, so a host that
			 * gains one does not need this shape changed.
			 */
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
				const root = need(fields<{ root: string }>(req).root, "root", "Provide a project root.");
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
				const { startIn } = fields<{ startIn: string }>(req);
				return { path: await this.ability("browse")(startIn) };
			},

			"POST /project/init": async (req) => {
				const root = need(fields<{ root: string }>(req).root, "root", "Provide a project root.");
				await initProject(root);
				return this.described(await this.open(root, true));
			},

			"PUT /project/config": async (req) => {
				const project = this.project();
				// Checked before it is written, and written before the reload reads it.
				await writeConfig(project.root, req.body);
				return { config: (await this.reload()).config };
			},

			"GET /tree": async () => {
				const project = this.project();
				return {
					tree: await buildTree(project),
					place: await findPlaceFile(project.root, project.config),
				};
			},

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
		};
	}

	/** The project's place file, for the DataModel browser. */
	private placeRoutes(): Record<string, RouteHandler> {
		return {
			/**
			 * The project's place as a tree, for the DataModel browser: classes
			 * and names only, and which project file writes each script -- the
			 * match Modify RBXL makes. `stamp` names this version of the file,
			 * for asking about one instance of it. A place that will not read
			 * is a 422 saying why.
			 */
			"GET /place": async () => {
				const project = this.project();
				const file = await findPlaceFile(project.root, project.config);
				if (!file) return { file: null };
				let loaded: LoadedPlace;
				try {
					loaded = await this.loadPlace(project, file);
				} catch (err) {
					if (!(err instanceof RbxError)) throw err;
					throw new HttpError(422, `${file} could not be read: ${errorMessage(err)}`, {
						code: "place-unreadable",
					});
				}
				const scripts: Record<number, string> = {};
				planPlaceUpdate(loaded.doc, await placeEntries(project), (inst, owner) => {
					const i = loaded.index.get(inst);
					if (i !== undefined) scripts[i] = owner;
				});
				return { file, stamp: loaded.stamp, outline: loaded.outline, scripts };
			},

			/**
			 * One instance's properties, as text. A 409 when the place has
			 * changed since `stamp`, since an index into the old tree names
			 * something else in the new one.
			 */
			"GET /place/instance": async (req) => {
				const project = this.project();
				const file = await findPlaceFile(project.root, project.config);
				if (!file) throw new HttpError(404, "The project has no place file.");
				const loaded = await this.loadPlace(project, file);
				if (query(req, "stamp") !== loaded.stamp)
					throw new HttpError(409, "The place file has changed. Reload it.");
				const index = Number(query(req, "index"));
				const inst = loaded.order[index];
				if (!inst) throw new HttpError(404, `No instance ${index} in the place.`);
				return describeInstance(inst, index, (other) => loaded.index.get(other));
			},

			/**
			 * The DataModel as the project knows it: the place's instances and
			 * what the node maps' files add, for instance-aware lint, hover and
			 * completion. Answers without a place too, from the files alone.
			 */
			"GET /instances": async () => {
				const project = this.project();
				const file = await findPlaceFile(project.root, project.config);
				let place: PlaceOutline | null = null;
				// A place that will not read leaves the files' instances to answer with.
				if (file)
					place = await this.loadPlace(project, file).then(
						(p) => p.outline,
						() => null,
					);
				return { outline: await projectInstances(project, place) };
			},
		};
	}

	/** What Luau and graphs can see: modules, types, locations and `.luaurc`. */
	private luauRoutes(): Record<string, RouteHandler> {
		return {
			/**
			 * The modules a Luau file's locals hold -- `local Flux =
			 * require(Packages.Flux)` -- followed to what each gives back, for
			 * hover to describe `Flux.new`. `text` is the file as the editor
			 * has it, when that differs from the disk.
			 */
			"POST /luau/modules": async (req) => {
				const { path: given, text: edited } = fields<{ path: string; text: string }>(req);
				const file = need(given, "path", "Which file? Pass its `path`.");
				const project = this.project();
				// A graph's code runs from the file it compiles to.
				const runsFrom = file.endsWith(".nodescript")
					? ((await graphOutputPath(project, file)) ?? file)
					: file;
				return {
					modules: await modulesRequiredBy(project, runsFrom, edited),
					// Where the file is in the DataModel, for `script.Parent`.
					self: await instancePathOf(project, runsFrom),
				};
			},

			"GET /types": async () => ({ types: await exportedTypes(this.project()) }),

			"GET /resolve": async (req) => ({
				location: await locateFile(this.project(), query(req, "path")),
			}),

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
				const { dir, text: contents } = fields<{ dir: string; text: string }>(req);
				if (typeof contents !== "string") throw new HttpError(400, "text is required");
				await writeLuaurcFile(this.project(), typeof dir === "string" ? dir : "", contents);
				return { files: await readLuaurcFiles(this.project()) };
			},
		};
	}

	/** Wally packages, vendored code, and Rojo project files read into maps. */
	private packageRoutes(): Record<string, RouteHandler> {
		return {
			/**
			 * Adds `scope/name[@version]` to wally.toml and installs it, with what
			 * it depends on, from the Wally registry -- asking it as little as it
			 * can. What could not be installed is said, not retried.
			 */
			"POST /wally/add": async (req) => {
				const { spec, realm, alias } = fields<{ spec: string; realm: string; alias: string }>(req);
				const wanted = need(spec, "spec", "Which package? Pass its `spec`, scope/name.");
				return addFromWally(this.project(), wanted, realmOf(realm), alias);
			},

			/** A package from a zip: a Wally package where `wally install` puts one, anything else vendored. */
			"POST /wally/zip": async (req) => {
				const { data, alias, realm, fileName } = fields<{
					data: string;
					alias: string;
					realm: string;
					fileName: string;
				}>(req);
				const bytes = fromBase64(need(data, "data", "Pass the zip as base64 `data`."));
				return installZip(this.project(), bytes, { alias, realm: realmOf(realm), fileName });
			},

			/** Files that still require a Wally package, before it is removed. */
			"GET /wally/uses": async (req) => ({
				uses: await packageUses(
					this.project(),
					query(req, "alias"),
					realmOf(req.query?.realm) ?? "shared",
				),
			}),

			/** Takes a Wally dependency out, with the `_Index` folders only it kept. */
			"POST /wally/remove": async (req) => {
				const { alias, realm } = fields<{ alias: string; realm: string }>(req);
				const name = need(alias, "alias", "Which package? Pass its `alias`.");
				return removePackage(this.project(), name, realmOf(realm));
			},

			/** A GitHub repository, vendored into Packages/. The daemon's alone; see `githubDownload`. */
			"POST /wally/github": async (req) => {
				const { repo, alias } = fields<{ repo: string; alias: string }>(req);
				const named = need(repo, "repo", "Which repository? Pass `repo`, owner/repo.");
				return installGithub(this.project(), named, this.ability("githubDownload"), alias);
			},

			/**
			 * The Rojo project files in the project's root, and which already
			 * have a map writing them: what Import Rojo project offers.
			 */
			"GET /rojo/projects": async () => ({ projects: await findRojoProjects(this.project()) }),

			/** Reads a Rojo project file into a node map. See `importRojoProject`. */
			"POST /rojo/import": async (req) => {
				const file = need(
					fields<{ file: string }>(req).file,
					"file",
					"Which project file? Pass its `file`.",
				);
				return importRojoProject(this.project(), file);
			},
		};
	}

	/** Graphs and node maps: reading, saving and creating them. */
	private documentRoutes(): Record<string, RouteHandler> {
		return {
			"GET /script": async (req) => ({
				script: await readScript(this.project(), query(req, "path")),
			}),

			"PUT /script": async (req) => {
				const { path: relPath, script } = fields<{ path: string; script: NodeScript }>(req);
				await writeScript(this.project(), need(relPath, "path"), need(script, "script"));
				return { ok: true };
			},

			"POST /script/create": async (req) => {
				const project = this.project();
				const { dir, name, scriptClass } = fields<{
					dir: string;
					name: string;
					scriptClass: NodeScript["scriptClass"];
				}>(req);
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
				const { from, toDir } = fields<{ from: string; toDir: string }>(req);
				return { path: await moveEntry(this.project(), need(from, "from"), need(toDir, "toDir")) };
			},

			"POST /script/delete": async (req) => {
				await deleteEntry(this.project(), String(fields<{ path: string }>(req).path ?? ""));
				return { ok: true };
			},

			"GET /map": async (req) => ({ map: await readMap(this.project(), query(req, "path")) }),

			"PUT /map": async (req) => {
				const { path: relPath, map } = fields<{ path: string; map: NodeMap }>(req);
				await writeMap(this.project(), need(relPath, "path"), need(map, "map"));
				return { ok: true };
			},

			"POST /map/create": async (req) => {
				const project = this.project();
				const { dir, name } = fields<{ dir: string; name: string }>(req);
				const safeName = graphName(name ?? "Tree") || "Tree";
				const relPath = path.posix.join(dir ?? project.config.sourceDir, `${safeName}.nodemap`);
				// A map describes where files end up, and that question has a
				// different shape per runtime. The project already says which
				// one it is, so a new map starts as the kind that project needs
				// rather than as the kind Roblox needed.
				const map =
					project.config.target === "lune"
						? emptyFilesystemMap(safeName, newId(), newId)
						: emptyMap(safeName, newId(), newId);
				await writeMap(project, relPath, map);
				return { path: relPath, map };
			},
		};
	}

	/** Folders and entries in the tree, and handing one to the machine. */
	private entryRoutes(): Record<string, RouteHandler> {
		return {
			"POST /folder/create": async (req) => {
				const relPath = need(fields<{ path: string }>(req).path, "path", "Provide a path.");
				return { path: await createFolder(this.project(), relPath) };
			},

			"POST /entry/reveal": async (req) => {
				const project = this.project();
				const { path: relPath } = fields<{ path: string }>(req);
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
				const relPath = need(fields<{ path: string }>(req).path, "path", "Provide a path.");
				return { editor: await this.ability("edit")(safeJoin(project.root, relPath)) };
			},

			"POST /entry/rename": async (req) => {
				const { path: relPath, name } = fields<{ path: string; name: string }>(req);
				return {
					path: await renameEntry(this.project(), need(relPath, "path"), need(name, "name")),
				};
			},

			"GET /source": async (req) => ({
				text: await readText(this.project(), query(req, "path")),
			}),
		};
	}

	/** Node packs, for the designer: listing, editing, and moving between projects. */
	private packRoutes(): Record<string, RouteHandler> {
		return {
			/**
			 * Custom node packs only. The editor bundles the built-in definitions,
			 * because their pin derivation and display rules are code and cannot
			 * survive a round trip through JSON.
			 *
			 * **The project says which ones are packs; this does not work it out.**
			 * A filter for definitions that look like data matches most of the
			 * built-in library, and copies of those shadow the real ones in the
			 * editor, losing every field that is a function.
			 */
			"GET /nodes": async () => {
				const project = this.project();
				return { custom: project.packs, errors: project.packErrors };
			},

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
				const pack = await createPack(this.project(), fields<{ name: string }>(req).name ?? "");
				await this.reload();
				return { pack };
			},

			"POST /packs/duplicate": async (req) => {
				const relPath = need(fields<{ path: string }>(req).path, "path", "Provide a path.");
				const pack = await duplicatePack(this.project(), relPath);
				await this.reload();
				return { pack };
			},

			"GET /packs/usage": async (req) => ({
				usage: await packUsage(this.project(), query(req, "path")),
			}),

			"POST /packs/delete": async (req) => {
				const relPath = need(fields<{ path: string }>(req).path, "path", "Provide a path.");
				await deletePack(this.project(), relPath);
				await this.reload();
				return { ok: true };
			},

			/** Another project's packs, to import from. Reading, so harmless. */
			"GET /packs/scan": async (req) => scanProjectPacks(query(req, "root")),

			"POST /packs/import": async (req) => {
				const { root, path: relPath } = fields<{ root: string; path: string }>(req);
				const from = await scanProjectPacks(need(root, "root"));
				const fromConfig = await readConfig(from.root);
				const pack = await copyPackBetween(
					{ root: from.root, config: fromConfig },
					need(relPath, "path"),
					this.project(),
				);
				await this.reload();
				return { pack };
			},

			"POST /packs/export": async (req) => {
				const { root, path: relPath } = fields<{ root: string; path: string }>(req);
				const to = await scanProjectPacks(need(root, "root"));
				const toConfig = await readConfig(to.root);
				return {
					pack: await copyPackBetween(this.project(), need(relPath, "path"), {
						root: to.root,
						config: toConfig,
					}),
				};
			},

			/**
			 * Writes one designed node into a pack, and reopens the project so the
			 * editor has it immediately — a node you cannot place until you restart
			 * is a node you have to take on trust.
			 */
			"PUT /packs/node": async (req) => {
				const {
					path: relPath,
					def,
					replaces,
				} = fields<{ path: string; def: NodeDef; replaces: string }>(req);
				const written = await savePackNode(
					this.project(),
					need(relPath, "path"),
					need(def, "def"),
					replaces,
				);
				return { pack: written, packs: (await this.reload()).packs };
			},

			"POST /packs/requires": async (req) => {
				const { path: relPath, requires } = fields<{ path: string; requires: string[] }>(req);
				if (!Array.isArray(requires))
					throw new HttpError(400, "Provide a path and a requires list.");
				const pack = await setPackRequires(this.project(), need(relPath, "path"), requires);
				await this.reload();
				return { pack };
			},

			"POST /packs/node/delete": async (req) => {
				const { path: relPath, id } = fields<{ path: string; id: string }>(req);
				const pack = await deletePackNode(this.project(), need(relPath, "path"), need(id, "id"));
				await this.reload();
				return { pack };
			},
		};
	}

	/** Compiling, what it leaves behind, and the whole project handed over. */
	private compileRoutes(): Record<string, RouteHandler> {
		return {
			"POST /compile": async (req) => {
				const project = this.project();
				const {
					path: relPath,
					write,
					force,
				} = fields<{ path: string; write: boolean; force: boolean }>(req);
				// Only the whole-project walk narrates itself. One file has nothing
				// to report a position in, and the POST answering is the news.
				const results = relPath
					? [await compileScript(project, relPath, { write, force })]
					: await compileAll(project, { write, force }, this.hooks.compileStep);
				return { results };
			},

			"POST /map/compile": async (req) => {
				const project = this.project();
				const {
					path: relPath,
					write,
					force,
				} = fields<{ path: string; write: boolean; force: boolean }>(req);
				const targets = relPath ? [relPath] : await collectMaps(project);
				const results = [];
				for (const target of targets)
					results.push(await compileMap(project, target, { write, force }));
				return { results };
			},

			/**
			 * Generated files whose graph has moved or gone. Reported rather than
			 * removed: deleting files is not something to do behind somebody's back.
			 */
			"GET /orphans": async () => ({ orphans: await findOrphanOutputs(this.project()) }),

			"POST /orphans/remove": async (req) => {
				const { paths } = fields<{ paths: string[] }>(req);
				return { removed: await removeOutputs(this.project(), paths ?? []) };
			},

			/**
			 * The whole project, as text, for the editor to zip and hand over.
			 *
			 * On both hosts, not just the hosted one. It costs nothing on the
			 * daemon -- where the answer is a directory somebody already has --
			 * and a route that only exists on one of them is a route that only
			 * works on one of them, which is the arrangement this whole file
			 * exists to avoid.
			 *
			 * `place=modify` writes the project's scripts into its place; the
			 * report says what went in and what could not.
			 */
			"GET /export": async (req) => {
				const project = this.project();
				const modify = optionalQuery(req, "place", ["modify"]) === "modify";
				const binaries = await collectBinaries(project);
				const placeFile = await findPlaceFile(project.root, project.config);
				let place: { file: string; report?: PlaceReport } | undefined = placeFile
					? { file: placeFile }
					: undefined;
				if (placeFile && modify) {
					const written = await exportPlace(project);
					if (written) {
						binaries[written.file] = toBase64(written.bytes);
						place = { file: written.file, report: placeReport(written.update) };
					}
				}
				return {
					name: path.posix.basename(toPosix(project.root)) || "project",
					files: await collectProject(project),
					binaries,
					...(place ? { place } : {}),
				};
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

interface LoadedPlace {
	root: string;
	stamp: string;
	doc: RbxDocument;
	outline: PlaceOutline;
	order: RbxInstance[];
	index: Map<RbxInstance, number>;
}

/** Kept out of the handlers so the id source is one line to find and to change. */
function newId(): string {
	return globalThis.crypto.randomUUID();
}
