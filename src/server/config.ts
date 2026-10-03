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
import { writeTextAtomically } from "./files.js";

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
}

export async function openProject(root: string): Promise<OpenProject> {
	const resolved = path.resolve(root);
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
	};
}

/** A project's `roswaal.json`, or the defaults when it has none. */
export async function readConfig(root: string): Promise<RoswaalConfig> {
	const file = path.join(root, "roswaal.json");
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
		path.join(root, "roswaal.json"),
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

/** Creates roswaal.json and the source directory if they are not there yet. */
export async function initProject(root: string): Promise<RoswaalConfig> {
	const resolved = path.resolve(root);
	const config = await readConfig(resolved);
	await fs.mkdir(path.join(resolved, config.sourceDir), { recursive: true });
	await fs.mkdir(path.join(resolved, config.nodePaths[0] ?? ".roswaal/nodes"), { recursive: true });
	await writeConfig(resolved, config);
	return config;
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
