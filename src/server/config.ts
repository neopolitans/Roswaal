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
	if (!stat?.isDirectory()) throw new Error(`Not a directory: ${resolved}`);

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

export async function readConfig(root: string): Promise<RoswaalConfig> {
	const file = path.join(root, "roswaal.json");
	const raw = await fs.readFile(file, "utf8").catch(() => null);
	if (raw === null) return defaultConfig();
	try {
		return { ...defaultConfig(), ...(JSON.parse(raw) as Partial<RoswaalConfig>) };
	} catch (err) {
		throw new Error(`roswaal.json is not valid JSON: ${(err as Error).message}`);
	}
}

export async function writeConfig(root: string, config: RoswaalConfig): Promise<void> {
	await writeTextAtomically(
		path.join(root, "roswaal.json"),
		JSON.stringify({ ...config, schemaVersion: SCHEMA_VERSION }, null, 2) + "\n",
	);
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
