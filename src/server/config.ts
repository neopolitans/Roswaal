/**
 * Opening a project: `roswaal.json`, read and written, and the node packs it
 * loads.
 *
 * A project is any directory containing a `roswaal.json`. Graphs live under
 * `sourceDir`, compiled Luau is written to `outDir`, and Rojo picks it up from
 * there; Roswaal never talks to Studio itself. Everything else a project does
 * is in the modules beside this one, which `project.ts` gathers.
 */

import { fs, path } from "./host.js";

import { LuauParseError, parseLuauData } from "../core/luauData.js";
import { createRegistry, parseNodePack, type Registry } from "../core/nodes/index.js";
import { defaultConfig, SCHEMA_VERSION, type NodeDef, type RoswaalConfig } from "../core/schema.js";
import { errorMessage, UserError } from "./errors.js";
import { exists, writeTextAtomically } from "./files.js";

/** The file that makes a folder a Roswaal project. */
const CONFIG_FILE = "roswaal.json";

export interface OpenProject {
	root: string;
	config: RoswaalConfig;
	registry: Registry;
	/**
	 * The definitions this project's node packs contributed, on their own.
	 *
	 * Kept apart from the registry because the editor has to be told which ones
	 * are packs — it bundles the built-ins itself, and their pin derivation and
	 * display rules are code that cannot survive a round trip through JSON.
	 * Working that out by inspecting the registry is what went wrong before: a
	 * filter for "looks like data" matched most of the built-in library, so the
	 * editor was handed 215 function-less copies of nodes it already had, and
	 * they shadowed the real ones.
	 */
	packs: NodeDef[];
	packErrors: string[];
	packCount: number;
	/**
	 * Whether the folder has a `roswaal.json`. Any directory opens -- with the
	 * defaults, when it has none -- and what to do with one that is not a
	 * project yet is the caller's to decide: the daemon's picker offers to
	 * initialise it, `roswaal serve` refuses it, the web worker asks.
	 */
	initialised: boolean;
}

/** Opens the project at `root`, which must be a directory. See `initialised`. */
export async function openProject(root: string): Promise<OpenProject> {
	const resolved = path.resolve(root);
	// Missing and unreadable are the same answer here: not something to open.
	const stat = await fs.stat(resolved).catch(() => null);
	if (!stat?.isDirectory()) throw new UserError(`Not a directory: ${resolved}`);

	const config = await readConfig(resolved);
	const { defs, errors } = await loadNodePacks(resolved, config);

	return {
		root: resolved,
		config,
		registry: createRegistry(defs),
		packs: defs,
		packErrors: errors,
		packCount: defs.length,
		initialised: await isInitialised(resolved),
	};
}

/** Whether `root` is a Roswaal project: whether it has a `roswaal.json`. */
export async function isInitialised(root: string): Promise<boolean> {
	return exists(path.join(root, CONFIG_FILE));
}

/** A project's `roswaal.json`, or the defaults when it has none. */
export async function readConfig(root: string): Promise<RoswaalConfig> {
	const file = path.join(root, CONFIG_FILE);
	// Absent is a folder that is not a project yet; `openProject` says which.
	const raw = await fs.readFile(file, "utf8").catch(() => null);
	if (raw === null) return defaultConfig();
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		throw new UserError(`roswaal.json is not valid JSON: ${errorMessage(err)}`);
	}
	return parseConfig(parsed);
}

/**
 * Writes `roswaal.json`, after checking it is one: a config that would not
 * read back is refused here rather than found by the next `roswaal serve`.
 */
export async function writeConfig(root: string, config: unknown): Promise<RoswaalConfig> {
	const checked = parseConfig(config);
	await writeTextAtomically(
		path.join(root, CONFIG_FILE),
		JSON.stringify({ ...checked, schemaVersion: SCHEMA_VERSION }, null, 2) + "\n",
	);
	return checked;
}

const TARGETS: readonly string[] = ["roblox", "lune"];
const COMPILE_MODES: readonly string[] = ["manual", "hot"];
const INDENT_STYLES: readonly string[] = ["tab", "space"];

/**
 * A config as `roswaal.json` holds it, checked and with defaults filled in.
 *
 * The one reading of the file's shape, for reading it and for writing it, so
 * the two cannot disagree. A key that is absent takes its default; a key that
 * is there must be the right kind of thing, because `nodePaths: null` read as
 * a project would fail somewhere far from the file that caused it. Keys this
 * does not know are kept, so a newer Roswaal's settings survive an older one.
 * An optional key set to `null` is taken as absent.
 */
export function parseConfig(value: unknown): RoswaalConfig {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new UserError("roswaal.json must be an object of settings.");
	}
	const given: Record<string, unknown> = { ...value };
	for (const key of ["place", "rojoProject", "castsByHierarchy"]) {
		if (given[key] === null) delete given[key];
	}
	const config = { ...defaultConfig(), ...given } as Record<string, unknown>;
	const wrong = (key: string, kind: string) =>
		new UserError(`roswaal.json: "${key}" must be ${kind}.`);

	for (const key of ["sourceDir", "outDir"]) {
		if (typeof config[key] !== "string" || config[key] === "") throw wrong(key, "a folder path");
	}
	for (const key of ["place", "rojoProject"]) {
		if (config[key] !== undefined && typeof config[key] !== "string") throw wrong(key, "a file path");
	}
	for (const key of ["format", "comments"]) {
		if (typeof config[key] !== "boolean") throw wrong(key, "true or false");
	}
	if (config.castsByHierarchy !== undefined && typeof config.castsByHierarchy !== "boolean") {
		throw wrong("castsByHierarchy", "true or false");
	}
	const nodePaths = config.nodePaths;
	if (!Array.isArray(nodePaths) || nodePaths.some((dir) => typeof dir !== "string" || dir === "")) {
		throw wrong("nodePaths", "a list of folder paths");
	}
	if (!TARGETS.includes(config.target as string)) throw wrong("target", `one of ${TARGETS.join(", ")}`);
	if (!COMPILE_MODES.includes(config.compileMode as string)) {
		throw wrong("compileMode", `one of ${COMPILE_MODES.join(", ")}`);
	}
	if (!INDENT_STYLES.includes(config.indentStyle as string)) {
		throw wrong("indentStyle", `one of ${INDENT_STYLES.join(", ")}`);
	}
	if (typeof config.indentWidth !== "number" || !Number.isFinite(config.indentWidth)) {
		throw wrong("indentWidth", "a number");
	}
	// Every key the interface names has now been checked above.
	return config as unknown as RoswaalConfig;
}

export interface InitOptions {
	/**
	 * A pack to write into the first node path as `example.nodedef.luau`, for
	 * somebody starting from nothing to read. `roswaal init` passes one; a
	 * folder an editor was pointed at gets only what it needs.
	 */
	examplePack?: string;
}

/** What `initProject` did: the config it settled on, and each path made or found. */
export interface InitOutcome {
	config: RoswaalConfig;
	/** Project-relative, in the order they were seen to. */
	steps: { path: string; created: boolean }[];
}

/**
 * Makes a folder a Roswaal project: `roswaal.json`, the graphs directory and
 * the first node path.
 *
 * Anything already there is kept rather than overwritten, the config
 * included, and the directories are the ones that config names -- so running
 * it in a project that has moved its graphs does not make the default folder
 * beside them. One implementation for `roswaal init`, the daemon's Initialise
 * and the web editor's, so the three cannot make different projects.
 */
export async function initProject(root: string, options: InitOptions = {}): Promise<InitOutcome> {
	const resolved = path.resolve(root);
	const steps: InitOutcome["steps"] = [];
	const ensure = async (rel: string, make: () => Promise<unknown>) => {
		const there = await exists(path.join(resolved, rel));
		if (!there) await make();
		steps.push({ path: rel, created: !there });
	};

	await fs.mkdir(resolved, { recursive: true });
	const config = await readConfig(resolved);
	await ensure(CONFIG_FILE, () => writeConfig(resolved, config));
	await ensure(config.sourceDir, () => fs.mkdir(path.join(resolved, config.sourceDir), { recursive: true }));
	const nodes = config.nodePaths[0] ?? ".roswaal/nodes";
	await ensure(nodes, () => fs.mkdir(path.join(resolved, nodes), { recursive: true }));
	const example = options.examplePack;
	if (example !== undefined) {
		const rel = path.posix.join(nodes, "example.nodedef.luau");
		await ensure(rel, () => fs.writeFile(path.join(resolved, rel), example, "utf8"));
	}
	return { config, steps };
}

async function loadNodePacks(
	root: string, config: RoswaalConfig,
): Promise<{ defs: NodeDef[]; errors: string[] }> {
	const defs: NodeDef[] = [];
	const errors: string[] = [];

	for (const dir of config.nodePaths) {
		const abs = path.join(root, dir);
		const entries = await fs.readdir(abs, { withFileTypes: true }).catch(() => []);
		for (const entry of entries) {
			if (!entry.isFile()) continue;
			const isJson = entry.name.endsWith(".nodedef.json");
			const isLuau = entry.name.endsWith(".nodedef.luau") || entry.name.endsWith(".nodedef.lua");
			if (!isJson && !isLuau) continue;

			const file = path.join(abs, entry.name);
			try {
				const text = await fs.readFile(file, "utf8");
				// Luau packs are parsed, never executed: a pack is data a project
				// pulls in from somewhere, and running it would mean running a
				// stranger's code every time a project is opened.
				const source = isLuau ? parseLuauData(text) : JSON.parse(text);
				const parsed = parseNodePack(source, entry.name);
				defs.push(...parsed.defs);
				errors.push(...parsed.errors, ...parsed.warnings);
			} catch (err) {
				const detail =
					err instanceof LuauParseError ? err.message : (err as Error).message;
				errors.push(`${entry.name}: ${detail}`);
			}
		}
	}
	return { defs, errors };
}
