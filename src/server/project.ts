/**
 * Project I/O: reading and writing a Roswaal project on disk.
 *
 * A project is any directory containing a `roswaal.json`. Graphs live under
 * `sourceDir`, compiled Luau is written to `outDir`, and Rojo picks it up from
 * there — Roswaal never talks to Studio itself.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import {
	compile, hashString, serialiseScript, type CompileResult,
} from "../core/compiler/index.js";
import { LuauParseError, parseLuauData } from "../core/luauData.js";
import { isGenerated, recordGenerated } from "./manifest.js";
import { migrateScript } from "../core/migrate.js";
import {
	compileNodeMap, locateInDataModel, serialiseMap,
	type InstanceLocation, type MapDiagnostic, type MapNode, type NodeMap,
} from "../core/nodemap.js";
import { createRegistry, parseNodePack, type Registry } from "../core/nodes/index.js";
import {
	defaultConfig, SCHEMA_VERSION,
	type NodeDef, type NodeScript, type RoswaalConfig,
} from "../core/schema.js";

/**
 * Ownership key written into project files by an earlier build. Rojo refuses
 * to parse a project containing it, so its only remaining job is to identify a
 * file Roswaal wrote and should repair.
 */
const LEGACY_OWNERSHIP_KEY = "$roswaalGeneratedFrom";

const SKIP_DIRS = new Set([
	"node_modules", ".git", ".vscode", "dist", "build", "out", "Packages", "DevPackages",
]);

export interface TreeEntry {
	/** Path relative to the project root, with forward slashes. */
	path: string;
	name: string;
	kind: "directory" | "nodescript" | "nodemap" | "luau";
	/** Set on generated Luau: the graph it came from. */
	generatedFrom?: string;
	children?: TreeEntry[];
}

export interface OpenProject {
	root: string;
	config: RoswaalConfig;
	registry: Registry;
	packErrors: string[];
	packCount: number;
}

// ---------------------------------------------------------------------------
// Opening
// ---------------------------------------------------------------------------

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
	await fs.writeFile(
		path.join(root, "roswaal.json"),
		JSON.stringify({ ...config, schemaVersion: SCHEMA_VERSION }, null, 2) + "\n",
		"utf8",
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
				errors.push(...parsed.errors);
			} catch (err) {
				const detail =
					err instanceof LuauParseError ? err.message : (err as Error).message;
				errors.push(`${entry.name}: ${detail}`);
			}
		}
	}
	return { defs, errors };
}

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

export async function buildTree(project: OpenProject): Promise<TreeEntry[]> {
	const generated = await generatedIndex(project);
	// Empty folders are noise everywhere except under sourceDir, where one is a
	// folder the developer just created and is about to put a graph in.
	const keepEmptyUnder = [project.config.sourceDir, ...project.config.nodePaths];
	return walk(project.root, project.root, generated, keepEmptyUnder);
}

async function walk(
	root: string, dir: string, generated: Map<string, string>, keepEmptyUnder: string[],
): Promise<TreeEntry[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
	const out: TreeEntry[] = [];

	for (const entry of entries) {
		const abs = path.join(dir, entry.name);
		const rel = path.relative(root, abs).split(path.sep).join("/");

		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) continue;
			const children = await walk(root, abs, generated, keepEmptyUnder);
			const keep =
				children.length > 0 ||
				keepEmptyUnder.some((base) => rel === base || rel.startsWith(base + "/") || base.startsWith(rel + "/"));
			if (!keep) continue;
			out.push({ path: rel, name: entry.name, kind: "directory", children });
			continue;
		}
		const kind = classify(entry.name);
		if (!kind) continue;
		out.push({
			path: rel,
			name: entry.name,
			kind,
			...(generated.has(rel) ? { generatedFrom: generated.get(rel) } : {}),
		});
	}

	out.sort((a, b) => {
		if (a.kind === "directory" && b.kind !== "directory") return -1;
		if (b.kind === "directory" && a.kind !== "directory") return 1;
		return a.name.localeCompare(b.name);
	});
	return out;
}

function classify(name: string): TreeEntry["kind"] | null {
	if (name.endsWith(".nodescript")) return "nodescript";
	if (name.endsWith(".nodemap")) return "nodemap";
	if (name.endsWith(".luau") || name.endsWith(".lua")) return "luau";
	return null;
}

/** Maps generated Luau back to the graph that produced it, via the header. */
async function generatedIndex(project: OpenProject): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	const outDir = path.join(project.root, project.config.outDir);
	const stack = [outDir];

	while (stack.length) {
		const dir = stack.pop()!;
		const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
		for (const entry of entries) {
			const abs = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!SKIP_DIRS.has(entry.name)) stack.push(abs);
				continue;
			}
			if (!entry.name.endsWith(".luau") && !entry.name.endsWith(".lua")) continue;
			const head = (await fs.readFile(abs, "utf8").catch(() => "")).slice(0, 512);
			const match = /^-- roswaal-graph: (.+)$/m.exec(head);
			if (match) {
				map.set(path.relative(project.root, abs).split(path.sep).join("/"), match[1].trim());
			}
		}
	}
	return map;
}

// ---------------------------------------------------------------------------
// Graphs
// ---------------------------------------------------------------------------

export async function readScript(project: OpenProject, relPath: string): Promise<NodeScript> {
	const abs = safeJoin(project.root, relPath);
	const parsed = JSON.parse(await fs.readFile(abs, "utf8")) as NodeScript;
	if (parsed.schemaVersion > SCHEMA_VERSION) {
		throw new Error(
			`${relPath} was written by a newer version of Roswaal (schema ${parsed.schemaVersion}).`,
		);
	}
	return migrateScript(parsed).script;
}

export async function writeScript(
	project: OpenProject, relPath: string, script: NodeScript,
): Promise<void> {
	const abs = safeJoin(project.root, relPath);
	await fs.mkdir(path.dirname(abs), { recursive: true });
	await fs.writeFile(abs, serialiseScript(script), "utf8");
}

export async function readText(project: OpenProject, relPath: string): Promise<string> {
	return fs.readFile(safeJoin(project.root, relPath), "utf8");
}

// ---------------------------------------------------------------------------
// Node maps
// ---------------------------------------------------------------------------

export async function readMap(project: OpenProject, relPath: string): Promise<NodeMap> {
	const abs = safeJoin(project.root, relPath);
	const parsed = JSON.parse(await fs.readFile(abs, "utf8")) as NodeMap;
	if (parsed.schemaVersion > SCHEMA_VERSION) {
		throw new Error(
			`${relPath} was written by a newer version of Roswaal (schema ${parsed.schemaVersion}).`,
		);
	}
	return parsed;
}

export async function writeMap(
	project: OpenProject, relPath: string, map: NodeMap,
): Promise<void> {
	const abs = safeJoin(project.root, relPath);
	await fs.mkdir(path.dirname(abs), { recursive: true });
	await fs.writeFile(abs, serialiseMap(map), "utf8");
}

export interface MapOutcome {
	mapPath: string;
	outputPath: string;
	written: boolean;
	skipped?: string;
	diagnostics: MapDiagnostic[];
	json: string;
}

/**
 * Compiles a node map to a Rojo project file.
 *
 * There is no hand-edit guard here, unlike generated Luau: a project file is
 * small, frequently hand-tuned, and Rojo itself rewrites it. Overwriting one
 * silently would be worse, so an existing file that Roswaal did not write is
 * refused outright rather than hashed.
 */
export async function compileMap(
	project: OpenProject, relPath: string, opts: { write?: boolean; force?: boolean } = {},
): Promise<MapOutcome> {
	const map = await readMap(project, relPath);
	const result = compileNodeMap(map);
	result.diagnostics.push(...(await checkMapPaths(project, map)));

	const outcome: MapOutcome = {
		mapPath: relPath,
		outputPath: result.outputPath,
		written: false,
		diagnostics: result.diagnostics,
		json: result.json,
	};

	if (!opts.write) return outcome;
	if (!result.ok) {
		outcome.skipped = "The map has errors, so no project file was written.";
		return outcome;
	}

	const abs = safeJoin(project.root, result.outputPath);
	const existing = await fs.readFile(abs, "utf8").catch(() => null);
	// An earlier build stamped ownership into the document itself, which Rojo
	// rejects outright. A file carrying that stamp is still ours, and
	// overwriting it is what repairs the project.
	const legacyStamp = existing?.includes(LEGACY_OWNERSHIP_KEY) === true;

	if (
		existing !== null && !opts.force && !legacyStamp &&
		!(await isGenerated(project.root, result.outputPath))
	) {
		outcome.skipped =
			`${result.outputPath} was not generated by Roswaal. Compile with force to take it over, ` +
			"or point the map's output somewhere else.";
		return outcome;
	}

	await fs.mkdir(path.dirname(abs), { recursive: true });
	await fs.writeFile(abs, result.json, "utf8");
	await recordGenerated(project.root, result.outputPath, relPath);
	outcome.written = true;
	return outcome;
}

/**
 * Checks that every `$path` in a map points at something.
 *
 * This is the difference between a map that works and one that looks like it
 * does: Rojo does not complain about a path that is not there, it just builds
 * an empty instance. You find out in Studio, staring at a folder with nothing
 * in it and no idea why.
 *
 * Lives here rather than in compileNodeMap because it needs the filesystem,
 * and the core compiler deliberately has none.
 */
export async function checkMapPaths(
	project: OpenProject, map: NodeMap,
): Promise<MapDiagnostic[]> {
	const out: MapDiagnostic[] = [];
	const paths: { node: MapNode; path: string }[] = [];

	const visit = (node: MapNode) => {
		if (node.path) paths.push({ node, path: node.path });
		node.children.forEach(visit);
	};
	visit(map.root);

	for (const { node, path: relPath } of paths) {
		const abs = path.resolve(project.root, relPath);
		const stat = await fs.stat(abs).catch(() => null);
		if (!stat) {
			out.push({
				severity: "error",
				message:
					`"${node.name}" points at ${relPath}, which is not on disk. Rojo will build an ` +
					"empty instance rather than complain, so this is the only warning you get.",
				node: node.id,
			});
			continue;
		}
		if (stat.isDirectory()) {
			const entries = await fs.readdir(abs).catch(() => []);
			if (entries.length === 0) {
				out.push({
					severity: "warning",
					message: `"${node.name}" points at ${relPath}, which is empty.`,
					node: node.id,
				});
			}
		}
	}

	// One path nested inside another means the inner content is synced twice,
	// once under each instance. Usually a mistake, and always fixable with an
	// ignore glob on the outer one.
	for (const outer of paths) {
		for (const inner of paths) {
			if (outer === inner) continue;
			if (!inner.path.startsWith(outer.path.replace(/\/+$/, "") + "/")) continue;
			out.push({
				severity: "warning",
				message:
					`"${inner.node.name}" (${inner.path}) sits inside "${outer.node.name}" ` +
					`(${outer.path}), so its contents appear under both. Add an ignore path on ` +
					`"${outer.node.name}" to keep them apart.`,
				node: outer.node.id,
			});
		}
	}

	return out;
}

/**
 * Where a file in the project ends up in the DataModel.
 *
 * A graph resolves through its compiled output rather than its own path,
 * because that is the file the node map actually points at. Both are tried, so
 * a map aimed straight at the graphs directory works too.
 */
export async function locateFile(
	project: OpenProject, relPath: string,
): Promise<InstanceLocation | null> {
	const candidates = [relPath];

	if (relPath.endsWith(".nodescript")) {
		try {
			const script = await readScript(project, relPath);
			const result = compile(script, project.registry);
			const within = path.posix.dirname(
				toPosix(path.relative(project.config.sourceDir, relPath)),
			);
			candidates.unshift(
				path.posix.normalize(
					path.posix.join(project.config.outDir, within, result.fileName),
				),
			);
		} catch {
			// A graph that will not compile still has a source path worth trying.
		}
	}

	for (const mapPath of await collectMaps(project)) {
		const map = await readMap(project, mapPath);
		for (const candidate of candidates) {
			const found = locateInDataModel(map, candidate);
			if (found) return found;
		}
	}
	return null;
}

/**
 * Generated files with no graph behind them any more.
 *
 * Moving or renaming a graph writes its output somewhere new and leaves the old
 * file sitting there. Rojo has no way to know it is stale, so it syncs it, and
 * you get the same module in two places — which is confusing in exactly the way
 * that is hard to trace back to a rename.
 */
export async function findOrphanOutputs(project: OpenProject): Promise<string[]> {
	const expected = new Set<string>();
	for (const relPath of await collectScripts(project)) {
		try {
			const script = await readScript(project, relPath);
			const result = compile(script, project.registry);
			const within = path.posix.dirname(
				toPosix(path.relative(project.config.sourceDir, relPath)),
			);
			expected.add(
				path.posix.normalize(
					path.posix.join(project.config.outDir, within, result.fileName),
				),
			);
		} catch {
			// A graph that will not read cannot vouch for its output, so leave
			// anything it might own alone.
			return [];
		}
	}

	const orphans: string[] = [];
	for (const [output] of await generatedIndex(project)) {
		if (!expected.has(output)) orphans.push(output);
	}
	return orphans.sort();
}

export async function removeOutputs(project: OpenProject, paths: string[]): Promise<number> {
	let removed = 0;
	for (const relPath of paths) {
		// Only ever delete something we can still see is generated.
		const abs = safeJoin(project.root, relPath);
		const head = (await fs.readFile(abs, "utf8").catch(() => "")).slice(0, 512);
		if (!head.includes("roswaal-graph:")) continue;
		await fs.rm(abs, { force: true });
		removed++;
	}
	return removed;
}

export async function collectMaps(project: OpenProject): Promise<string[]> {
	const out: string[] = [];
	const stack = [path.join(project.root, project.config.sourceDir)];
	while (stack.length) {
		const dir = stack.pop()!;
		for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
			const abs = path.join(dir, entry.name);
			if (entry.isDirectory()) stack.push(abs);
			else if (entry.name.endsWith(".nodemap")) {
				out.push(toPosix(path.relative(project.root, abs)));
			}
		}
	}
	return out.sort();
}

// ---------------------------------------------------------------------------
// Folders and entries
// ---------------------------------------------------------------------------

/**
 * Refuses a structural edit inside the output directory.
 *
 * Everything under outDir is generated: a folder made there is not a source
 * folder, and a graph moved there is not moved at all — the next compile
 * writes it back where it came from and leaves an orphan behind. Saying so is
 * kinder than letting it look like it worked.
 */
function assertEditable(project: OpenProject, relPath: string, verb: string): void {
	const out = project.config.outDir.replace(/\/+$/, "");
	const normalised = toPosix(relPath).replace(/^\.\//, "");
	if (normalised !== out && !normalised.startsWith(out + "/")) return;

	throw new Error(
		`${out} holds generated files, so there is nothing to ${verb} there. ` +
			`Work in ${project.config.sourceDir}; the folders you make there appear under ` +
			`${out} when you compile.`,
	);
}

/**
 * Directories under sourceDir mirror directories under outDir, which Rojo turns
 * into Folder instances. Making one here is how you get a folder in the
 * DataModel without touching the project file.
 */
export async function createFolder(project: OpenProject, relPath: string): Promise<string> {
	assertEditable(project, relPath, "create a folder");
	const abs = safeJoin(project.root, relPath);
	if (await exists(abs)) throw new Error(`${relPath} already exists.`);
	await fs.mkdir(abs, { recursive: true });
	return relPath;
}

export async function renameEntry(
	project: OpenProject, relPath: string, newName: string,
): Promise<string> {
	assertEditable(project, relPath, "rename anything");
	const clean = newName.replace(/[\\/:*?"<>|]/g, "").trim();
	if (clean === "") throw new Error("A name cannot be empty.");

	const source = safeJoin(project.root, relPath);
	const destRel = path.posix.join(path.posix.dirname(toPosix(relPath)), clean);
	const dest = safeJoin(project.root, destRel);
	if (source === dest) return destRel;
	if (await exists(dest)) throw new Error(`${destRel} already exists.`);
	await fs.rename(source, dest);
	return destRel;
}

export async function moveEntry(
	project: OpenProject, from: string, toDir: string,
): Promise<string> {
	assertEditable(project, from, "move anything");
	assertEditable(project, toDir, "move anything");
	const source = safeJoin(project.root, from);
	const name = path.basename(from);
	const destRel = path.posix.join(toDir, name);
	const dest = safeJoin(project.root, destRel);
	if (source === dest) return destRel;
	if (await exists(dest)) throw new Error(`${destRel} already exists.`);
	await fs.mkdir(path.dirname(dest), { recursive: true });
	await fs.rename(source, dest);
	return destRel;
}

export async function deleteEntry(project: OpenProject, relPath: string): Promise<void> {
	// Recursive, because folders are now something the tree can create.
	await fs.rm(safeJoin(project.root, relPath), { recursive: true, force: false });
}

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

export interface CompileOutcome {
	scriptPath: string;
	outputPath: string;
	written: boolean;
	/** Set when the write was refused, e.g. the target was edited by hand. */
	skipped?: string;
	diagnostics: CompileResult["diagnostics"];
	sourceMap: CompileResult["sourceMap"];
	code: string;
}

export async function compileScript(
	project: OpenProject, relPath: string, opts: { write?: boolean; force?: boolean } = {},
): Promise<CompileOutcome> {
	const script = await readScript(project, relPath);
	const result = compile(script, project.registry);

	// Formatting happens before the output hash is stamped, so the hash always
	// describes the bytes that actually land on disk.
	const formatted = project.config.format ? formatLuau(project.root, result.code) : result.code;
	const code = stampOutputHash(formatted);

	const outputPath = path.posix.join(
		project.config.outDir,
		path.posix.dirname(toPosix(path.relative(project.config.sourceDir, relPath))),
		result.fileName,
	).replace(/\/\.\//g, "/");

	const outcome: CompileOutcome = {
		scriptPath: relPath,
		outputPath: path.posix.normalize(outputPath),
		written: false,
		diagnostics: result.diagnostics,
		sourceMap: result.sourceMap,
		code,
	};

	if (!opts.write) return outcome;
	if (!result.ok) {
		outcome.skipped = "The graph has errors, so no file was written.";
		return outcome;
	}

	const abs = safeJoin(project.root, outcome.outputPath);
	const guard = await checkHandEdited(abs);
	if (guard && !opts.force) {
		outcome.skipped = guard;
		return outcome;
	}

	await fs.mkdir(path.dirname(abs), { recursive: true });
	await fs.writeFile(abs, code, "utf8");
	outcome.written = true;
	return outcome;
}

export async function compileAll(
	project: OpenProject, opts: { write?: boolean; force?: boolean } = {},
): Promise<CompileOutcome[]> {
	const scripts = await collectScripts(project);
	const out: CompileOutcome[] = [];
	for (const rel of scripts) {
		try {
			out.push(await compileScript(project, rel, opts));
		} catch (err) {
			out.push({
				scriptPath: rel,
				outputPath: "",
				written: false,
				skipped: (err as Error).message,
				diagnostics: [{ severity: "error", message: (err as Error).message }],
				sourceMap: [],
				code: "",
			});
		}
	}
	return out;
}

async function collectScripts(project: OpenProject): Promise<string[]> {
	const out: string[] = [];
	const stack = [path.join(project.root, project.config.sourceDir)];
	while (stack.length) {
		const dir = stack.pop()!;
		for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
			const abs = path.join(dir, entry.name);
			if (entry.isDirectory()) stack.push(abs);
			else if (entry.name.endsWith(".nodescript")) {
				out.push(toPosix(path.relative(project.root, abs)));
			}
		}
	}
	return out.sort();
}

/**
 * Returns a warning when the target file no longer matches the output hash in
 * its own header, which means somebody edited generated code by hand. Roswaal
 * would rather refuse than quietly eat that work.
 */
async function checkHandEdited(abs: string): Promise<string | null> {
	const existing = await fs.readFile(abs, "utf8").catch(() => null);
	if (existing === null) return null;

	const parts = splitGenerated(existing);
	if (!parts) {
		return `${path.basename(abs)} was not generated by Roswaal. Delete it, or point outDir elsewhere.`;
	}
	if (hashString(parts.body) !== parts.declaredHash) {
		return `${path.basename(abs)} has been edited by hand since it was generated. Recompile with force to overwrite it.`;
	}
	return null;
}

/** Splits a generated file into its header hash and its body. */
export function splitGenerated(text: string): { declaredHash: string; body: string } | null {
	const lines = text.split("\n");
	const i = lines.findIndex((l) => l.startsWith("-- roswaal-output:"));
	if (i === -1) return null;
	return {
		declaredHash: lines[i].slice("-- roswaal-output:".length).trim(),
		body: lines.slice(i + 2).join("\n"),
	};
}

/** Recomputes the output hash after formatting and rewrites the header line. */
export function stampOutputHash(code: string): string {
	const parts = splitGenerated(code);
	if (!parts) return code;
	return code.replace(
		/^-- roswaal-output: .*$/m,
		`-- roswaal-output: ${hashString(parts.body)}`,
	);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

let styluaAvailable: boolean | null = null;

/**
 * Runs stylua over generated code when it is available.
 *
 * The emitter deliberately does not try to be a pretty-printer; it produces
 * correct Luau and lets the formatter the project already uses make it look
 * like the rest of the codebase.
 */
export function formatLuau(cwd: string, code: string): string {
	if (styluaAvailable === false) return code;

	// Each candidate is tried without a shell. Going through one would resolve
	// the .cmd shim for us, but it also means the arguments are concatenated
	// rather than passed, which Node now warns about — and we do not need it.
	const candidates =
		process.platform === "win32" ? ["stylua.exe", "stylua.cmd", "stylua.bat"] : ["stylua"];

	for (const command of candidates) {
		const run = spawnSync(command, ["-"], { cwd, input: code, encoding: "utf8" });
		if (run.error || run.status !== 0 || typeof run.stdout !== "string" || run.stdout === "") {
			continue;
		}
		styluaAvailable = true;
		return run.stdout;
	}

	// Remembered, so a project without stylua does not pay for the lookup on
	// every single file it compiles.
	styluaAvailable = false;
	return code;
}

// ---------------------------------------------------------------------------

function toPosix(p: string): string {
	return p.split(path.sep).join("/");
}

/** Refuses any path that would escape the project root. */
export function safeJoin(root: string, relPath: string): string {
	const abs = path.resolve(root, relPath);
	const rel = path.relative(root, abs);
	if (rel.startsWith("..") || path.isAbsolute(rel)) {
		throw new Error(`Path escapes the project: ${relPath}`);
	}
	return abs;
}

async function exists(abs: string): Promise<boolean> {
	return fs.access(abs).then(() => true, () => false);
}
