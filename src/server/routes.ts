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
import { graphNameOf, importLuau, LARGEST_IMPORT } from "../core/import/fromLuau.js";
import type { ImportMode, TopLevelLocals } from "../core/import/modes.js";
import { NEW_PLACE_FILE } from "../core/newProject.js";
import { emptyFilesystemMap, emptyMap, type NodeMap } from "../core/nodemap.js";
import {
	type AttributeEntry,
	attributeEntries,
	attributeNameProblem,
	attributeValue,
	defaultAttribute,
	encodeAttributes,
	encodeTags,
	NEW_ATTRIBUTE_TYPES,
	robloxOwn,
	tagProblem,
	tagsOf,
} from "../core/rbx/attributes.js";
import { blankPlaceBytes, blankPlaceXml } from "../core/rbx/blankPlace.js";
import {
	describeInstance,
	fingerprint,
	outlinePlace,
	type PlaceOutline,
	propertyEdit,
} from "../core/rbx/browse.js";
import { ADDED_IF_MISSING, storedValue, withEmptyString, writeProperty } from "../core/rbx/edit.js";
import {
	pathOf,
	type RbxDocument,
	RbxError,
	type RbxInstance,
	readRbx,
	walk,
} from "../core/rbx/index.js";
import {
	changeInstances,
	changeProblem,
	type InstanceChange,
	type InstanceRef,
} from "../core/rbx/instances.js";
import { readLighting } from "../core/rbx/lighting.js";
import { type PlaceReport, planPlaceUpdate } from "../core/rbx/placeExport.js";
import { buildPlaceScene, type PlaceScene, SCENE_KINDS } from "../core/rbx/scene.js";
import { convertPlace, leftOutOf, placeFormatOf } from "../core/rbx/serialize.js";
import { legacyBinaryUniqueId } from "../core/rbx/uniqueId.js";
import { emptyScript, type NodeDef, type NodeScript, type Target } from "../core/schema.js";
import { servicesUsed } from "../core/servicesUsed.js";
import { errorMessage, HttpError, UserError } from "./errors.js";
import { exists, walkFiles } from "./files.js";
import { fs, path } from "./host.js";
import { makeGraphFolders } from "./mapFolders.js";
import { createProject } from "./newProject.js";
import { importGraphPath } from "./outputs.js";
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
	exportedModuleFunctions,
	exportedTypes,
	exportPlace,
	findOrphanOutputs,
	findPlaceFile,
	findRojoProjects,
	graphName,
	graphOutputPath,
	importRojoProject,
	initProject,
	linkedFiles,
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
	renameInLinks,
	safeJoin,
	savePackNode,
	scanProjectPacks,
	setPackRequires,
	staleGraphs,
	unlinkUnder,
	unsyncedGraphs,
	writeConfig,
	writeLuaurcFile,
	writeMap,
	writePlaceFile,
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
		/** A folder with nothing in it, where a new project can go. */
		empty?: boolean;
		/** What it compiles for, when it is a project whose roswaal.json reads. */
		target?: Target;
		/** How many graphs it has, likewise. */
		graphs?: number;
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

	/**
	 * The stamp of each place file as a property change last wrote it. A
	 * change to a file that still holds what was written needs no new backup;
	 * one that has changed since -- Studio saved it, or it was never written
	 * here -- is copied first.
	 */
	private placeWrites = new Map<string, string>();

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
		// A project opened with a map of its own -- one imported from Rojo, one
		// made elsewhere -- gets the graph folders its synced folders want, as a
		// new project starts with. A folder that cannot be written opens anyway.
		if (switched) await makeGraphFolders(this.current).catch(() => []);
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

	/**
	 * One change written into the project's place: the instance at `index` in
	 * the version `stamp` names, the stored property and value `change` gives
	 * for it, a backup first unless this session wrote the file last, and the
	 * instance as it now is. A 409 when the place has changed since `stamp`.
	 */
	private async changePlace(
		body: { stamp?: string; index?: number },
		change: (inst: RbxInstance, loaded: LoadedPlace) => { stored: string; value: unknown },
	) {
		const project = this.project();
		const file = await findPlaceFile(project.root, project.config);
		if (!file) throw new HttpError(404, "The project has no place file.");
		const stamp = need(text(body.stamp), "stamp");
		const before = await readPlaceBytes(project, file);
		const loaded = await this.loadPlace(project, file);
		if (stamp !== loaded.stamp || loaded.stamp !== `${file}:${fingerprint(before)}`)
			throw new HttpError(409, "The place file has changed. Reload it.");
		const inst = typeof body.index === "number" ? loaded.order[body.index] : undefined;
		if (!inst) throw new HttpError(404, `No instance ${body.index} in the place.`);

		let after: Uint8Array;
		try {
			const { stored, value } = change(inst, loaded);
			// A place that keeps no attributes or tags for the class gets the
			// empty property Studio would have written, and then the value.
			let bytes = before;
			let doc = loaded.doc;
			let target = inst;
			const missing = ADDED_IF_MISSING.get(stored);
			if (!inst.props.has(stored) && missing) {
				bytes = withEmptyString(before, loaded.doc, inst.className, stored, missing);
				doc = readRbx(bytes);
				const again = doc.instances.find((other) => other.ref === inst.ref);
				if (!again) throw new RbxError(`"${inst.name}" was lost giving it ${stored}`);
				target = again;
			}
			after = writeProperty(bytes, doc, target, stored, value);
		} catch (err) {
			if (err instanceof RbxError) throw new HttpError(422, errorMessage(err));
			throw err;
		}
		const { now, backup } = await this.savePlace(project, file, before, after, loaded);
		const index = now.order.findIndex((other) => other.ref === inst.ref);
		return {
			stamp: now.stamp,
			instance: describeInstance(now.order[index], index, (other) => now.index.get(other)),
			...(backup ? { backup } : {}),
		};
	}

	/**
	 * `after` written over the place, which held `before` when it was read as
	 * `loaded`: a backup first unless this session wrote the file last, and the
	 * place as it now is.
	 */
	private async savePlace(
		project: OpenProject,
		file: string,
		before: Uint8Array,
		after: Uint8Array,
		loaded: LoadedPlace,
	): Promise<{ now: LoadedPlace; backup: string | undefined }> {
		const key = path.join(project.root, file);
		const backup = await writePlaceFile(
			project,
			file,
			before,
			after,
			this.placeWrites.get(key) !== loaded.stamp,
		);
		const now = await this.loadPlace(project, file);
		this.placeWrites.set(key, now.stamp);
		return { now, backup };
	}

	/** The place as the DataModel browser is given it. See `GET /place`. */
	private async placeAnswer(project: OpenProject, file: string, loaded: LoadedPlace) {
		const scripts: Record<number, string> = {};
		planPlaceUpdate(loaded.doc, await placeEntries(project), (inst, owner) => {
			const i = loaded.index.get(inst);
			if (i !== undefined) scripts[i] = owner;
		});
		// Studio keeps a lock file beside a place it has open.
		const studio = await exists(path.join(project.root, `${file}.lock`));
		return {
			file,
			stamp: loaded.stamp,
			outline: loaded.outline,
			scripts,
			...(studio ? { studio } : {}),
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

			/**
			 * A project from nothing, in a folder that is empty or not there yet,
			 * named after the folder. Refused anywhere with files in it: that is
			 * what Initialise is for.
			 */
			"POST /project/new": async (req) => {
				const body = fields<{ root: string; target: string; place: boolean }>(req);
				const root = need(body.root, "root", "Provide a folder for the new project.");
				if (body.target !== "roblox" && body.target !== "lune") {
					throw new UserError('A new project is for "roblox" or "lune".');
				}
				const resolved = path.resolve(root);
				await createProject(resolved, {
					name: path.basename(resolved),
					target: body.target,
					place: body.target === "roblox" && body.place === true,
				});
				return this.described(await this.open(resolved, true));
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
				return this.placeAnswer(project, file, loaded);
			},

			/**
			 * Adds a place to a project that has none: the place a new project
			 * starts with, at `place.rbxl` -- or at the file roswaal.json's
			 * `place` names, in that file's format, when it is not there yet.
			 * A 409 when the project has a place already, or is for Lune.
			 */
			"POST /place/new": async () => {
				const project = this.project();
				if (project.config.target !== "roblox")
					throw new HttpError(
						409,
						"A Lune project has no place: there is no DataModel to put one in.",
					);
				if (await findPlaceFile(project.root, project.config))
					throw new HttpError(409, "The project has a place file already.");
				const file = project.config.place ?? NEW_PLACE_FILE;
				const abs = safeJoin(project.root, file);
				await fs.mkdir(path.dirname(abs), { recursive: true });
				await fs.writeFile(
					abs,
					/\.rbxlx$/i.test(file) ? new TextEncoder().encode(blankPlaceXml()) : blankPlaceBytes(),
				);
				return { file };
			},

			/**
			 * A place file the developer has, as the project's place: kept under
			 * its own name, or at the file roswaal.json's `place` names, in that
			 * file's format. Read first, so a file that is not a place is refused
			 * before anything is written. A 409 when the project has a place
			 * already, or is for Lune.
			 */
			"POST /place/import": async (req) => {
				const project = this.project();
				if (project.config.target !== "roblox")
					throw new HttpError(
						409,
						"A Lune project has no place: there is no DataModel to put one in.",
					);
				if (await findPlaceFile(project.root, project.config))
					throw new HttpError(409, "The project has a place file already.");
				const { data, fileName } = fields<{ data: string; fileName: string }>(req);
				const name = path.basename(need(fileName, "fileName", "Pass the file's name.")).trim();
				if (!/\.rbxlx?$/i.test(name))
					throw new UserError(`${name} is not a place: choose a .rbxl or .rbxlx file.`);
				const bytes = fromBase64(need(data, "data", "Pass the place as base64 `data`."));
				try {
					readRbx(bytes);
				} catch (error) {
					if (error instanceof RbxError)
						throw new UserError(`${name} could not be read: ${error.message}.`);
					throw error;
				}
				const file = project.config.place ?? name;
				const abs = safeJoin(project.root, file);
				await fs.mkdir(path.dirname(abs), { recursive: true });
				await fs.writeFile(abs, convertPlace(bytes, placeFormatOf(file)).bytes);
				return { file };
			},

			/**
			 * Changes one property of one instance, in the place file itself.
			 * Only a property the instance's answer offers an `edit` for, with a
			 * value that property can hold; anything else is a 422 saying why,
			 * and the file is left as it was. A 409 when the place has changed
			 * since `stamp`.
			 *
			 * The file as it was is copied under `.roswaal/backups/` first,
			 * unless it still holds what the last change here wrote. Answers
			 * with the new stamp and the instance as it now is: the outline is
			 * the same, since no name changes.
			 */
			"POST /place/property": async (req) => {
				const body = fields<{ stamp: string; index: number; property: string; value: unknown }>(
					req,
				);
				const property = need(text(body.property), "property");
				// A rename moves the paths the project's links go by.
				let renamed: { from: string[]; to: string[] } | undefined;
				const answer = await this.changePlace(body, (inst, loaded) => {
					const edit = propertyEdit(inst, property);
					if (!edit) throw new HttpError(422, `${property} cannot be changed here.`);
					const value = storedValue(
						edit,
						inst.props.get(property)!,
						body.value,
						(index) => loaded.order[index],
					);
					if (property === "Name") {
						const from: string[] = [];
						for (let cur: RbxInstance | null = inst; cur; cur = cur.parent) from.unshift(cur.name);
						renamed = { from, to: [...from.slice(0, -1), body.value as string] };
					}
					return { stored: property, value };
				});
				if (renamed) await renameInLinks(this.project(), renamed.from, renamed.to);
				return answer;
			},

			/**
			 * Changes, adds or removes one attribute, in the place file itself:
			 * `value` for a new value, `add` with a type to add one, `remove`.
			 * The whole list is written back, every other attribute as it was.
			 */
			"POST /place/attribute": async (req) => {
				const body = fields<{
					stamp: string;
					index: number;
					name: string;
					value?: unknown;
					add?: string;
					remove?: boolean;
				}>(req);
				const name = text(body.name) ?? "";
				return this.changePlace(body, (inst) => {
					const blob = inst.props.get("AttributesSerialize")?.value;
					const entries = blob instanceof Uint8Array ? attributeEntries(blob) : [];
					if (!entries)
						throw new HttpError(
							422,
							`The place keeps no attributes Roswaal can rewrite for ${inst.name}.`,
						);
					let next: AttributeEntry[];
					if (robloxOwn(name))
						throw new HttpError(422, `${name} is Roblox’s own, and is left as it is.`);
					if (body.remove === true) {
						if (!entries.some((e) => e.name === name))
							throw new HttpError(404, `No attribute ${name}.`);
						next = entries.filter((e) => e.name !== name);
					} else if (body.add !== undefined) {
						const type = NEW_ATTRIBUTE_TYPES[body.add];
						if (type === undefined)
							throw new HttpError(422, `An attribute is not added as a ${body.add}.`);
						const problem = attributeNameProblem(name);
						if (problem) throw new HttpError(422, problem);
						if (entries.some((e) => e.name === name))
							throw new HttpError(409, `${inst.name} has an attribute ${name} already.`);
						next = [...entries, { name, type, value: defaultAttribute(type) }];
					} else {
						const entry = entries.find((e) => e.name === name);
						if (!entry) throw new HttpError(404, `No attribute ${name}.`);
						next = entries.map((e) =>
							e === entry ? { ...e, value: attributeValue(e, body.value) } : e,
						);
					}
					return { stored: "AttributesSerialize", value: encodeAttributes(next) };
				});
			},

			/** Adds or removes one tag, in the place file itself. */
			"POST /place/tag": async (req) => {
				const body = fields<{ stamp: string; index: number; tag: string; remove?: boolean }>(req);
				const tag = (body.tag ?? "").trim();
				return this.changePlace(body, (inst) => {
					const blob = inst.props.get("Tags")?.value;
					const tags = blob instanceof Uint8Array ? tagsOf(blob) : [];
					if (body.remove === true) {
						if (!tags.includes(tag)) throw new HttpError(404, `${inst.name} is not tagged ${tag}.`);
						return { stored: "Tags", value: encodeTags(tags.filter((t) => t !== tag)) };
					}
					const problem = tagProblem(tag, tags);
					if (problem) throw new HttpError(422, problem);
					return { stored: "Tags", value: encodeTags([...tags, tag]) };
				});
			},

			/**
			 * Adds, deletes, moves or duplicates an instance, in the place file
			 * itself: the instance at `index`, which an add makes a `className`
			 * named `name` in and a move puts in the instance at `parent`. What
			 * Studio would refuse is a 422 saying why, and the file is left as it
			 * was; a 409 when the place has changed since `stamp`.
			 *
			 * Deleting scripts the project's files write is a 409 with code
			 * `linked-scripts` naming them, until asked again with `unlink`: their
			 * links go, and the files stay. A move takes the links with it.
			 * Answers with the place as `GET /place` does, and `index`, where
			 * the instance made or moved now is.
			 */
			"POST /place/instance": async (req) => {
				const body = fields<{
					stamp: string;
					kind: string;
					index: number;
					parent?: number;
					className?: string;
					name?: string;
					unlink?: boolean;
				}>(req);
				const project = this.project();
				const file = await findPlaceFile(project.root, project.config);
				if (!file) throw new HttpError(404, "The project has no place file.");
				const stamp = need(text(body.stamp), "stamp");
				const before = await readPlaceBytes(project, file);
				const loaded = await this.loadPlace(project, file);
				if (stamp !== loaded.stamp || loaded.stamp !== `${file}:${fingerprint(before)}`)
					throw new HttpError(409, "The place file has changed. Reload it.");
				const at = (index: unknown) => {
					const inst = typeof index === "number" ? loaded.order[index] : undefined;
					if (inst?.ref === undefined)
						throw new HttpError(404, `No instance ${index} in the place.`);
					return inst;
				};
				const inst = at(body.index);
				let change: InstanceChange;
				switch (body.kind) {
					case "add":
						change = {
							kind: "add",
							parent: inst.ref!,
							className: need(text(body.className), "className"),
							name: text(body.name) ?? "",
						};
						break;
					case "move":
						change = { kind: "move", target: inst.ref!, parent: at(body.parent).ref! };
						break;
					case "delete":
					case "duplicate":
						change = { kind: body.kind, target: inst.ref! };
						break;
					default:
						throw new HttpError(400, "`kind` is add, delete, move or duplicate.");
				}

				// The scripts a deletion takes that the project's files write.
				const owners = new Set<string>();
				const ids = new Set<string>();
				if (change.kind === "delete") {
					// Refused first, so nobody is asked about links for a deletion that cannot happen.
					const problem = changeProblem({ kind: "delete", target: inst });
					if (problem) throw new HttpError(422, problem);
					const doomed = new Set(walk([inst]));
					planPlaceUpdate(loaded.doc, await placeEntries(project), (script, owner) => {
						if (doomed.has(script)) owners.add(owner);
					});
					for (const script of doomed) {
						const id = script.props.get("UniqueId")?.value;
						if (typeof id === "string") ids.add(id).add(legacyBinaryUniqueId(id));
					}
					if (owners.size && body.unlink !== true) {
						const links = await linkedFiles(project);
						const files = [...owners].sort();
						throw new HttpError(409, `Deleting ${inst.name} unlinks ${files.join(", ")}.`, {
							code: "linked-scripts",
							linked: files.filter((f) => links.has(f)),
							placed: files.filter((f) => !links.has(f)),
						});
					}
				}

				let after: Uint8Array;
				let focus: InstanceRef | undefined;
				try {
					({ bytes: after, ref: focus } = changeInstances(before, change));
				} catch (err) {
					if (err instanceof RbxError) throw new HttpError(422, errorMessage(err));
					throw err;
				}
				const from = pathOf(inst);
				const { now, backup } = await this.savePlace(project, file, before, after, loaded);
				if (change.kind === "delete" && owners.size) await unlinkUnder(project, from, ids);
				if (change.kind === "move")
					await renameInLinks(project, from, [...pathOf(at(body.parent)), inst.name]);
				const index =
					focus === undefined ? -1 : now.order.findIndex((other) => other.ref === focus);
				return {
					...(await this.placeAnswer(project, file, now)),
					...(index === -1 ? {} : { index }),
					...(backup ? { backup } : {}),
				};
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
			 * The place's Workspace for the viewport: one instance buffer per
			 * shape, as base64, built once per version of the place, with its
			 * lighting and Studio's saved camera. A 409 when the place has
			 * changed since `stamp`, as for an instance.
			 */
			"GET /place/scene": async (req) => {
				const project = this.project();
				const file = await findPlaceFile(project.root, project.config);
				if (!file) throw new HttpError(404, "The project has no place file.");
				const loaded = await this.loadPlace(project, file);
				if (query(req, "stamp") !== loaded.stamp)
					throw new HttpError(409, "The place file has changed. Reload it.");
				const workspace = loaded.doc.roots.find((r) => r.className === "Workspace");
				loaded.scene ??= buildPlaceScene(workspace, (inst) => loaded.index.get(inst));
				const scene = loaded.scene;
				const encode = (from: PlaceScene["kinds"]) => {
					const out: Record<string, { data: string; count: number }> = {};
					for (const k of SCENE_KINDS) {
						const { data, count } = from[k];
						out[k] = {
							data: toBase64(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)),
							count,
						};
					}
					return out;
				};
				return {
					...scene,
					kinds: encode(scene.kinds),
					translucent: encode(scene.translucent),
					lighting: readLighting(loaded.doc),
				};
			},

			/**
			 * The DataModel as the project knows it: the place's instances and
			 * what the node maps' files add, for instance-aware lint, hover and
			 * completion. Answers without a place too, from the files alone.
			 */
			/**
			 * The services the project's Luau reaches -- its files, and the
			 * scripts inside the place -- for DataModel, which lists those and the
			 * ones holding something, and keeps the rest behind Add Service.
			 */
			"GET /place/services": async () => {
				const project = this.project();
				const used = new Set<string>();
				const take = (source: string) => {
					for (const name of servicesUsed(source)) used.add(name);
				};
				const luau = await walkFiles(project.root, { accept: (n) => /\.(luau|lua)$/.test(n) });
				for (const file of luau) take(await fs.readFile(file.abs, "utf8").catch(() => ""));
				const place = await findPlaceFile(project.root, project.config);
				if (place) {
					const loaded = await this.loadPlace(project, place).catch(() => null);
					const text = new TextDecoder();
					for (const inst of loaded?.doc.instances ?? []) {
						const source = inst.props.get("Source")?.value;
						if (source instanceof Uint8Array) take(text.decode(source));
						else if (typeof source === "string") take(source);
					}
				}
				return { used: [...used].sort() };
			},

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

			// Types and functions together: both are what a module exports, and
			// both change when somebody edits one.
			"GET /types": async () => {
				const project = this.project();
				const [types, functions] = await Promise.all([
					exportedTypes(project),
					exportedModuleFunctions(project),
				]);
				return { types, functions };
			},

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
				const { spec, realm, alias, choose } = fields<{
					spec: string;
					realm: string;
					alias: string;
					choose: boolean;
				}>(req);
				const wanted = need(spec, "spec", "Which package? Pass its `spec`, scope/name.");
				// `choose`: with no version given and more than one listed, answer
				// the versions rather than install the newest.
				return addFromWally(this.project(), wanted, realmOf(realm), alias, {
					choose: choose === true,
				});
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
				const imported = await importRojoProject(this.project(), file);
				// The map's synced folders get their graph folders, as a new project's do.
				await makeGraphFolders(this.project()).catch(() => []);
				return imported;
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

			/**
			 * A `.luau` file as a new graph, beside the graphs, where compiling it
			 * would write that same file back.
			 *
			 * The file itself is left alone, and compiling over it is refused
			 * until it is taken over with force, as with any file Roswaal did not
			 * write. A graph already at the path is never replaced: it may be the
			 * one you built by hand.
			 */
			"POST /script/import": async (req) => {
				const project = this.project();
				const body = fields<{
					path: string;
					locals?: TopLevelLocals;
					mode?: ImportMode;
					target?: Target;
					/** Import over the graph an earlier import of this file made. */
					replace?: boolean;
					/** Statements kept as code share Code Blocks. */
					codeRuns?: boolean;
				}>(req);
				const luauPath = need(body.path, "path");
				const fileName = path.posix.basename(luauPath);
				const { name, scriptClass } = graphNameOf(fileName);
				const relPath = importGraphPath(project, luauPath);
				const source = await readText(project, luauPath);
				if (source.length > LARGEST_IMPORT)
					throw new HttpError(
						422,
						`${fileName} is larger than ${LARGEST_IMPORT / 1024 / 1024} MiB, more than Roswaal imports as a graph.`,
					);
				// Whether anything is there is asked apart from reading it. A graph
				// that cannot be read -- not JSON, or from a newer Roswaal -- is
				// still somebody's graph, not a free path.
				const taken = await exists(safeJoin(project.root, relPath));
				const existing = taken ? await readScript(project, relPath).catch(() => null) : null;
				if (taken && !existing)
					throw new HttpError(
						409,
						`${relPath} is there but cannot be read as a graph, so it is not imported over. Move or rename it first.`,
					);
				if (existing && !body.replace)
					throw new HttpError(
						409,
						`${relPath} already exists. Move or rename it to import ${fileName}.`,
					);
				// Only over a graph an import made, and only while the file is
				// still the one written by hand: once the graph is compiled over
				// it, the file is the graph's.
				if (existing && existing.asWritten !== true)
					throw new HttpError(
						409,
						`${relPath} was not imported from ${fileName}, so it is not imported over. Move or rename it first.`,
					);
				if (existing && /^-- roswaal-graph: /m.test(source.slice(0, 512)))
					throw new HttpError(
						409,
						`${fileName} is compiled from ${relPath} now. Change the graph instead.`,
					);

				const result = importLuau(source, {
					name,
					scriptClass,
					target: body.target ?? project.config.target,
					locals: body.locals,
					mode: body.mode,
					...(body.codeRuns !== undefined ? { codeRuns: body.codeRuns } : {}),
					idPrefix: newId().slice(0, 8),
				});
				if (!result.ok)
					throw new HttpError(422, `${fileName} could not be read as Luau. ${result.error}`);
				await writeScript(project, relPath, result.script);
				return { path: relPath, script: result.script, report: result.report };
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
					skipUnchanged,
				} = fields<{ path: string; write: boolean; force: boolean; skipUnchanged: boolean }>(req);
				// Only the whole-project walk narrates itself. One file has nothing
				// to report a position in, and the POST answering is the news.
				const results = relPath
					? [
							await compileScript(project, relPath, {
								write,
								force,
								skipUnchanged: skipUnchanged === true,
							}),
						]
					: await compileAll(project, { write, force }, this.hooks.compileStep);
				return { results };
			},

			"POST /map/compile": async (req) => {
				const project = this.project();
				const {
					path: relPath,
					write,
					force,
					sync,
					merge,
				} = fields<{ path: string; write: boolean; force: boolean; sync: boolean; merge: boolean }>(
					req,
				);
				const targets = relPath ? [relPath] : await collectMaps(project);
				const results = [];
				for (const target of targets)
					results.push(await compileMap(project, target, { write, force, sync, merge }));
				return { results };
			},

			/**
			 * Generated files whose graph has moved or gone. Reported rather than
			 * removed: deleting files is not something to do behind somebody's back.
			 */
			"GET /orphans": async () => ({
				orphans: await findOrphanOutputs(this.project()),
				// And graphs whose Luau goes where no node map syncs it.
				unsynced: await unsyncedGraphs(this.project()),
			}),

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
			 * report says what went in and what could not. `format` saves the
			 * place as `.rbxl` or `.rbxlx`: one in the other format is converted,
			 * goes in under its new name, and `leftOut` names the kinds of
			 * property the conversion could not carry. `convertLoses` says the
			 * same for the format the place is not in, whichever was asked for,
			 * so the menu can warn before anyone picks it.
			 *
			 * `stale` lists the graphs whose Luau is older than the graph, for
			 * the menu to offer to compile first.
			 */
			"GET /export": async (req) => {
				const project = this.project();
				const modify = optionalQuery(req, "place", ["modify"]) === "modify";
				const format = optionalQuery(req, "format", ["rbxl", "rbxlx"]);
				const binaries = await collectBinaries(project);
				const placeFile = await findPlaceFile(project.root, project.config);
				let place:
					| {
							file: string;
							report?: PlaceReport;
							savedAs?: string;
							leftOut?: [string, number][];
							convertLoses?: [string, number][];
					  }
					| undefined = placeFile ? { file: placeFile } : undefined;
				if (placeFile && modify) {
					const written = await exportPlace(project);
					if (written) {
						binaries[written.file] = toBase64(written.bytes);
						place = { file: written.file, report: placeReport(written.update) };
					}
				}
				if (place && binaries[place.file] !== undefined) {
					const bytes = fromBase64(binaries[place.file]!);
					const own = placeFormatOf(place.file);
					try {
						place.convertLoses = leftOutOf(bytes);
						if (format && format !== own) {
							const converted = convertPlace(bytes, format);
							const savedAs = place.file.replace(/\.rbxlx?$/i, `.${format}`);
							delete binaries[place.file];
							binaries[savedAs] = toBase64(converted.bytes);
							place.savedAs = savedAs;
							place.leftOut = converted.leftOut;
						}
					} catch (err) {
						if (!(err instanceof RbxError)) throw err;
						throw new HttpError(
							422,
							`${place.file} could not be saved as .${format}: ${errorMessage(err)}`,
						);
					}
				}
				return {
					name: path.posix.basename(toPosix(project.root)) || "project",
					files: await collectProject(project),
					binaries,
					...(place ? { place } : {}),
					stale: await staleGraphs(project),
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
	/** The viewport's buffers, built the first time they are asked for. */
	scene?: PlaceScene;
}

/** Kept out of the handlers so the id source is one line to find and to change. */
function newId(): string {
	return globalThis.crypto.randomUUID();
}
