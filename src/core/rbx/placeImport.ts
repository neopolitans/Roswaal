/**
 * Turning a place into a project: which scripts come out, where each one goes,
 * and the node map that tells Rojo where they belong.
 *
 * Pure: a document in, files out. Both hosts write the result the same way.
 *
 * ## Two kinds of script
 *
 * **Rojo-syncable** scripts sit where a Rojo project can put them back: under
 * a service (or a StarterPlayer script container), through Folders and other
 * scripts only, with names a file system and Rojo can both hold. They are
 * written under `outDir` in Rojo's own layout, and the node map points each
 * service at its folder.
 *
 * **Place-only** scripts are everything else -- most often a script inside a
 * part, a model or a GUI. Rojo cannot sync one without owning its parents, so
 * they go under `place/`, which no Rojo path reaches, and are written back into
 * the place file itself when it is exported.
 *
 * ## Nothing in the place is at risk from Rojo
 *
 * Every service in the generated map ignores instances it does not know, and
 * every folder written for a place instance that has children of its own says
 * the same in an `init.meta.json`. A `rojo serve` against the imported project
 * adds and updates scripts; it never deletes a part it was not told about.
 *
 * ## Duplicates
 *
 * A place often holds the same script many times over -- one per door, per
 * coin, per kill brick. With `dedupe` on, place-only scripts with identical
 * class and source become one file, listed against every instance that holds
 * a copy. Rojo-syncable scripts are never merged: Rojo maps one file to one
 * instance.
 */

import { type MapNode, type NodeMap, serialiseMap } from "../nodemap.js";
import { scriptSuffix } from "../rojoPaths.js";
import { SCHEMA_VERSION } from "../schema.js";
import { isScript, pathOf, type RbxDocument, type RbxInstance, stringProp, walk } from "./dom.js";

export type ImportScope = "rojo" | "all";

export interface PlaceImportOptions {
	/** Rojo-syncable scripts only, or place-only scripts as well. */
	scope: ImportScope;
	/** One file for identical place-only scripts. */
	dedupe: boolean;
	/** Where Rojo-syncable scripts go; the project's `outDir`. */
	outDir: string;
	/** The place file, as the project will hold it, relative to its root. */
	placeFile: string;
	/** The project name, for the node map and the Rojo project. */
	name: string;
}

/** One script in the place, and where it could go. */
export interface PlaceScript {
	inst: RbxInstance;
	className: string;
	source: string;
	/** Names from the service down, the script's own last. */
	path: string[];
	/** Why Rojo cannot sync it, or undefined when it can. */
	placeOnly?: string;
}

export interface PlaceSurvey {
	scripts: PlaceScript[];
	/** Scripts Rojo could sync. */
	rojo: number;
	/** Scripts only the place can hold. */
	placeOnly: number;
	/** Different scripts, counting identical copies once. */
	distinct: number;
	/** Scripts that appear more than once, and the most copies of any one. */
	duplicated: number;
	mostCopies: number;
	/** Place-only files after identical copies are merged. */
	placeOnlyDistinct: number;
}

/** A script file and every instance in the place it stands for. */
export interface PlaceLink {
	file: string;
	className: string;
	instances: { path: string[]; id?: string }[];
}

/** `.roswaal/place.json`: which file is which script, for export and the browser. */
export interface PlaceLinks {
	schemaVersion: number;
	place: string;
	scripts: PlaceLink[];
}

export interface PlaceImport {
	/** Project-relative path to text, every file the import writes. */
	files: Record<string, string>;
	/** The map, already in `files`; returned for callers that compile it. */
	map: NodeMap;
	links: PlaceLinks;
	/** Scripts left in the place, and why. */
	skipped: { path: string; reason: string }[];
}

export const LINKS_FILE = ".roswaal/place.json";
export const PLACE_DIR = "place";

/** Containers under a service that Rojo projects map directly. */
const ROOT_CONTAINERS = new Set(["StarterPlayerScripts", "StarterCharacterScripts"]);

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/**
 * Why a name cannot be a file or folder name Rojo reads back as itself, or
 * undefined when it can.
 */
function unsafeName(name: string): string | undefined {
	if (name === "") return "it has no name";
	if (/[<>:"/\\|?*\x00-\x1f]/.test(name)) return "its name has a character a file name cannot hold";
	if (/^\s|[\s.]$/.test(name)) return "its name starts with a space or ends with a space or a dot";
	if (RESERVED.test(name)) return "its name is reserved on Windows";
	// Dots are fine -- package folders carry versions -- except where Rojo would
	// read the end of the name as one of its own suffixes.
	if (/\.(server|client|meta|model|project|luau?|json|txt|csv|rbxmx?|toml)$/i.test(name)) {
		return "its name ends like a file type Rojo reads";
	}
	if (name.toLowerCase() === "init") return "it is called init, which Rojo reserves";
	return undefined;
}

/** Siblings whose names match, ignoring case: Rojo and the disk cannot tell them apart. */
function hasTwin(inst: RbxInstance): boolean {
	const siblings = inst.parent ? inst.parent.children : [];
	const lower = inst.name.toLowerCase();
	let seen = 0;
	for (const s of siblings) if (s.name.toLowerCase() === lower && ++seen > 1) return true;
	return false;
}

function serviceOf(inst: RbxInstance): RbxInstance | null {
	let cur: RbxInstance | null = inst;
	while (cur?.parent) cur = cur.parent;
	return cur?.service ? cur : null;
}

/** Why Rojo cannot sync this script, or undefined when it can. */
function whyPlaceOnly(script: RbxInstance): string | undefined {
	const service = serviceOf(script);
	if (!service) return "it is not under a service";
	const chain: RbxInstance[] = [];
	for (let cur: RbxInstance | null = script; cur && cur !== service; cur = cur.parent) chain.unshift(cur);
	// A StarterPlayer script container straight under its service is a root too.
	const start = chain.length > 1 && ROOT_CONTAINERS.has(chain[0].className) ? 1 : 0;
	for (let i = start; i < chain.length - 1; i++) {
		const a = chain[i];
		if (a.className !== "Folder" && !isScript(a)) return `it is inside ${a.className} "${a.name}"`;
	}
	for (const a of chain) {
		const unsafe = unsafeName(a.name);
		if (unsafe) return `"${a.name}" cannot be a file name: ${unsafe}`;
		if (hasTwin(a)) return `"${a.name}" shares its name with a sibling`;
	}
	return undefined;
}

export function surveyPlace(doc: RbxDocument): PlaceSurvey {
	const scripts: PlaceScript[] = [];
	for (const inst of walk(doc.roots)) {
		if (!isScript(inst)) continue;
		scripts.push({
			inst,
			className: inst.className,
			source: stringProp(inst, "Source") ?? "",
			path: pathOf(inst),
			placeOnly: whyPlaceOnly(inst),
		});
	}
	const copies = new Map<string, number>();
	for (const s of scripts) {
		const key = `${s.className}\0${s.source}`;
		copies.set(key, (copies.get(key) ?? 0) + 1);
	}
	const counts = [...copies.values()];
	const placeOnlyKeys = new Set(scripts.filter((s) => s.placeOnly).map((s) => `${s.className}\0${s.source}`));
	return {
		scripts,
		rojo: scripts.filter((s) => !s.placeOnly).length,
		placeOnly: scripts.filter((s) => s.placeOnly).length,
		distinct: copies.size,
		duplicated: counts.filter((n) => n > 1).length,
		mostCopies: counts.length ? Math.max(...counts) : 0,
		placeOnlyDistinct: placeOnlyKeys.size,
	};
}

/** RunContext as Rojo writes it in a meta file. */
const RUN_CONTEXT = ["Legacy", "Server", "Client", "Plugin"];

/** The properties Rojo's file name cannot say, for a script's meta file. */
function scriptMeta(inst: RbxInstance): Record<string, unknown> | undefined {
	const properties: Record<string, unknown> = {};
	const runContext = inst.props.get("RunContext");
	if (inst.className === "Script" && runContext && typeof runContext.value === "number" && runContext.value !== 0) {
		properties.RunContext = RUN_CONTEXT[runContext.value] ?? runContext.value;
	}
	if (inst.props.get("Disabled")?.value === true) properties.Disabled = true;
	return Object.keys(properties).length ? properties : undefined;
}

/**
 * A name made safe for a file system, for place-only scripts: `place/` is not
 * read back by Rojo, so the name only has to be writable and distinct.
 */
function safeSegment(name: string): string {
	let s = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/^\s+|[\s.]+$/g, "");
	if (s === "") s = "_";
	if (RESERVED.test(s)) s = `_${s}`;
	return s;
}

const uniqueIn = (taken: Set<string>, name: string): string => {
	let candidate = name;
	for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${name} (${n})`;
	taken.add(candidate.toLowerCase());
	return candidate;
};

const json = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";

export function planImport(survey: PlaceSurvey, options: PlaceImportOptions): PlaceImport {
	const files: Record<string, string> = {};
	const links: PlaceLink[] = [];
	const skipped: { path: string; reason: string }[] = [];
	const idOf = (inst: RbxInstance): string | undefined => {
		const id = inst.props.get("UniqueId")?.value;
		return typeof id === "string" ? id : undefined;
	};

	// ---- Rojo-syncable scripts, in Rojo's layout under outDir.
	const rojo = survey.scripts.filter((s) => !s.placeOnly);
	const imported = new Set(rojo.map((s) => s.inst));
	/** A Folder whose whole subtree is imported scripts and such folders. */
	const isFolderOfImports = (inst: RbxInstance): boolean =>
		inst.className === "Folder" && inst.children.length > 0 &&
		inst.children.every((c) => imported.has(c) || isFolderOfImports(c));
	const scriptsWithChildren = new Set(rojo.map((s) => s.inst).filter((i) => i.children.length > 0));
	/** Folders written for place instances, so each can get its meta file once. */
	const folders = new Map<string, RbxInstance>();
	const services = new Map<string, { service: RbxInstance; container?: RbxInstance }>();

	for (const s of rojo) {
		const segments = [...s.path];
		const dir = segments.slice(0, -1);
		const hasChildren = scriptsWithChildren.has(s.inst);
		const file = hasChildren
			? `${options.outDir}/${segments.join("/")}/init${scriptSuffix(s.className)}`
			: `${options.outDir}/${dir.join("/")}/${s.inst.name}${scriptSuffix(s.className)}`;
		files[file] = s.source;
		const meta = scriptMeta(s.inst);
		// Children the import leaves in the place are kept by saying so.
		const keepsOthers = hasChildren && !s.inst.children.every((c) => imported.has(c) || scriptsWithChildren.has(c) || isFolderOfImports(c));
		if (meta || keepsOthers) {
			const metaFile = hasChildren
				? `${options.outDir}/${segments.join("/")}/init.meta.json`
				: `${options.outDir}/${dir.join("/")}/${s.inst.name}.meta.json`;
			files[metaFile] = json({
				...(meta ? { properties: meta } : {}),
				...(keepsOthers ? { ignoreUnknownInstances: true } : {}),
			});
		}
		links.push({ file, className: s.className, instances: [{ path: s.path, id: idOf(s.inst) }] });

		// Every folder between the root container and the script.
		const service = serviceOf(s.inst)!;
		const first = s.inst.parent === service ? undefined : ancestorBelow(s.inst, service);
		const container = first && ROOT_CONTAINERS.has(first.className) ? first : undefined;
		const key = container ? `${service.name}/${container.name}` : service.name;
		services.set(key, { service, container });
		for (let cur = s.inst.parent; cur && cur !== service && cur !== container; cur = cur.parent) {
			folders.set(`${options.outDir}/${pathOf(cur).join("/")}`, cur);
		}
	}

	const written = new Set(folders.values());
	for (const [dir, folder] of folders) {
		if (scriptsWithChildren.has(folder)) continue;
		// A folder holding anything the import leaves in the place keeps it.
		if (!folder.children.every((c) => imported.has(c) || written.has(c))) {
			files[`${dir}/init.meta.json`] = json({ ignoreUnknownInstances: true });
		}
	}

	// ---- Place-only scripts, mirrored under place/.
	if (options.scope === "all") {
		const placeOnly = survey.scripts.filter((s) => s.placeOnly);
		const groups = new Map<string, PlaceScript[]>();
		for (const s of placeOnly) {
			const key = options.dedupe ? `${s.className}\0${s.source}` : `${groups.size}`;
			const group = groups.get(key);
			if (group) group.push(s);
			else groups.set(key, [s]);
		}
		/** Names taken per directory, lower-cased. */
		const taken = new Map<string, Set<string>>();
		const claim = (dir: string, name: string): string => {
			let set = taken.get(dir);
			if (!set) taken.set(dir, (set = new Set()));
			return uniqueIn(set, name);
		};
		/** The mirrored directory for an instance, each segment made unique once. */
		const dirs = new Map<RbxInstance, string>();
		const dirOf = (inst: RbxInstance | null): string => {
			if (!inst) return PLACE_DIR;
			const known = dirs.get(inst);
			if (known) return known;
			const parent = dirOf(inst.parent);
			const dir = `${parent}/${claim(parent, safeSegment(inst.name))}`;
			dirs.set(inst, dir);
			return dir;
		};

		// A merged file is named for its script, and -- when several merged
		// scripts share that name, as a dozen called "Script" will -- for where
		// its copies live as well: "Script (Street Light)", not "Script (7)".
		const shared = [...groups.values()].filter((g) => g.length > 1);
		const sharedNames = new Map<string, number>();
		for (const g of shared) sharedNames.set(mostCommonName(g), (sharedNames.get(mostCommonName(g)) ?? 0) + 1);
		const sharedName = (group: PlaceScript[]): string => {
			const name = mostCommonName(group);
			if ((sharedNames.get(name) ?? 0) < 2) return name;
			return `${name} (${mostCommonOf(group.map((s) => s.inst.parent?.name ?? ""))})`;
		};

		for (const group of groups.values()) {
			const [first] = group;
			let file: string;
			if (group.length > 1) {
				const dir = `${PLACE_DIR}/Shared`;
				file = `${dir}/${claim(dir, safeSegment(sharedName(group)))}${scriptSuffix(first.className)}`;
			} else {
				const dir = dirOf(first.inst.parent);
				file = `${dir}/${claim(dir, safeSegment(first.inst.name) + scriptSuffix(first.className))}`;
			}
			files[file] = first.source;
			links.push({
				file,
				className: first.className,
				instances: group.map((s) => ({ path: s.path, id: idOf(s.inst) })),
			});
		}
	} else {
		for (const s of survey.scripts) if (s.placeOnly) skipped.push({ path: s.path.join("."), reason: s.placeOnly });
	}

	const map = buildMap(options, services);
	const linkFile: PlaceLinks = { schemaVersion: 1, place: options.placeFile, scripts: links };
	files[`.roswaal/scripts/${options.name}.nodemap`] = serialiseMap(map);
	files[LINKS_FILE] = json(linkFile);
	return { files, map, links: linkFile, skipped };
}

function ancestorBelow(inst: RbxInstance, service: RbxInstance): RbxInstance | undefined {
	let cur: RbxInstance | null = inst;
	while (cur && cur.parent !== service) cur = cur.parent;
	return cur ?? undefined;
}

function mostCommonName(group: PlaceScript[]): string {
	return mostCommonOf(group.map((s) => s.inst.name));
}

/** The value that appears most, the first by name among a tie. */
function mostCommonOf(values: string[]): string {
	const counts = new Map<string, number>();
	for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
	return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

/**
 * A DataModel map with one node per service that holds imported scripts, each
 * pointing at its folder and ignoring what it does not know.
 */
function buildMap(
	options: PlaceImportOptions,
	services: Map<string, { service: RbxInstance; container?: RbxInstance }>,
): NodeMap {
	const byService = new Map<string, MapNode>();
	const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase();
	for (const [key, { service, container }] of [...services].sort(([a], [b]) => a.localeCompare(b))) {
		let node = byService.get(service.name);
		if (!node) {
			node = { id: `place-${slug(service.name)}`, name: service.name, children: [] };
			byService.set(service.name, node);
		}
		if (container) {
			node.children.push({
				id: `place-${slug(key)}`,
				name: container.name,
				className: container.className,
				path: `${options.outDir}/${key}`,
				ignoreUnknown: true,
				children: [],
			});
		} else {
			node.path = `${options.outDir}/${service.name}`;
			node.ignoreUnknown = true;
		}
	}
	return {
		schemaVersion: SCHEMA_VERSION,
		kind: "map",
		id: "place-map",
		name: options.name,
		output: "default.project.json",
		root: { id: "place-root", name: "DataModel", className: "DataModel", children: [...byService.values()] },
	};
}
