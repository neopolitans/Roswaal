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
import { createRegistry, parseNodePack, type Registry } from "../core/nodes/index.js";
import {
	defaultConfig, emptyScript, SCHEMA_VERSION,
	type NodeDef, type NodeScript, type RoswaalConfig,
} from "../core/schema.js";

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
			if (!entry.isFile() || !entry.name.endsWith(".nodedef.json")) continue;
			const file = path.join(abs, entry.name);
			try {
				const parsed = parseNodePack(JSON.parse(await fs.readFile(file, "utf8")), entry.name);
				defs.push(...parsed.defs);
				errors.push(...parsed.errors);
			} catch (err) {
				errors.push(`${entry.name}: ${(err as Error).message}`);
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
	return walk(project.root, project.root, generated);
}

async function walk(
	root: string, dir: string, generated: Map<string, string>,
): Promise<TreeEntry[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
	const out: TreeEntry[] = [];

	for (const entry of entries) {
		const abs = path.join(dir, entry.name);
		const rel = path.relative(root, abs).split(path.sep).join("/");

		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) continue;
			const children = await walk(root, abs, generated);
			// Directories that contain nothing Roswaal cares about are noise.
			if (children.length === 0) continue;
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
	return { ...emptyScript(parsed.name, parsed.id), ...parsed };
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

export async function moveEntry(
	project: OpenProject, from: string, toDir: string,
): Promise<string> {
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
	await fs.rm(safeJoin(project.root, relPath), { recursive: false });
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
	const run = spawnSync("stylua", ["-"], {
		cwd,
		input: code,
		encoding: "utf8",
		shell: process.platform === "win32",
	});
	if (run.error || run.status !== 0 || typeof run.stdout !== "string" || run.stdout === "") {
		styluaAvailable = false;
		return code;
	}
	styluaAvailable = true;
	return run.stdout;
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
