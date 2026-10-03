/**
 * Compiling: a graph to Luau and a node map to a Rojo project file, written
 * only where Roswaal still owns the file.
 *
 * Owning is the hard part. Generated Luau carries a hash of its own body, so a
 * file somebody has edited by hand is refused rather than overwritten; a Rojo
 * project file is JSON, which cannot carry one, so `manifest.ts` records
 * ownership instead. Files on disk that are already generated are
 * `outputs.ts`.
 */

import { formatLuau, fs, path } from "./host.js";

import { compile, hashString, type CompileResult } from "../core/compiler/index.js";
import { compileNodeMap, type MapDiagnostic, type MapNode, type NodeMap } from "../core/nodemap.js";
import { formatLike, parseProject, sameProject } from "../core/rojoImport.js";
import { indentUnit } from "../core/schema.js";
import type { LuaurcSource } from "../core/luaurc.js";
import type { OpenProject } from "./config.js";
import { collectScripts, readMap, readScript } from "./documents.js";
import { errorMessage } from "./errors.js";
import { readLuaurcFiles, specifierContext } from "./luaurc.js";
import { isGenerated, recordGenerated } from "./manifest.js";
import { generatedIndex, outputPathFor, removeEmptyFolders } from "./outputs.js";
import { safeJoin } from "./paths.js";

/**
 * Ownership key written into project files by an earlier build. Rojo refuses
 * to parse a project containing it, so its only remaining job is to identify a
 * file Roswaal wrote and should repair.
 */
const LEGACY_OWNERSHIP_KEY = "$roswaalGeneratedFrom";

export interface CompileOutcome {
	scriptPath: string;
	outputPath: string;
	written: boolean;
	/** Set when the write was refused, e.g. the target was edited by hand. */
	skipped?: string;
	/**
	 * Files this graph used to produce and no longer does, now deleted.
	 *
	 * Reported rather than silent. Deleting is deleting even when it is
	 * obviously right, and "moved Config.luau to Tank/Config.luau" is a line
	 * somebody may need to find later.
	 */
	superseded?: string[];
	diagnostics: CompileResult["diagnostics"];
	sourceMap: CompileResult["sourceMap"];
	code: string;
}

/**
 * The graph that already wrote this file in the current compile, if any.
 *
 * Two graphs with the same name compile to the same path, and the second used
 * to overwrite the first and report `wrote` for both — the compile said
 * "1202 of 1202 written" while 1200 of them were the same file. Pure, so the
 * decision is testable without a filesystem; the map is threaded through
 * `compileAll` so a single-file compile has no opinion about it.
 */
export function outputCollision(
	claimed: Map<string, string> | undefined, outputPath: string, relPath: string,
): string | null {
	const owner = claimed?.get(outputPath);
	return owner !== undefined && owner !== relPath ? owner : null;
}

/**
 * Files this graph used to write and no longer does.
 *
 * Renaming a graph, dragging it into another folder, or switching it between
 * Script and ModuleScript all change **where** it compiles to while leaving the
 * graph itself the same graph. Without this the old file stays exactly where it
 * was, Rojo goes on syncing it, and the game ends up with two copies of the
 * module — one of which nothing is maintaining.
 *
 * Safe to act on without asking, unlike `findOrphanOutputs`, and the difference
 * is worth being precise about. That one looks for anything unaccounted for,
 * which can catch a file somebody put there deliberately, so it reports and
 * waits. This only names files whose own header says **this exact graph**
 * produced them, at the moment that graph has just produced a different one.
 * There is no judgement in it: the file says who owns it, and the owner moved.
 *
 * Pure, and exported, for the reason the rest of this file's decisions are: the
 * consequence is a deleted file, and a rule with that consequence should be
 * checkable without a temporary directory and a project to put in it.
 */
export function supersededOutputs(
	generated: Map<string, string>, graphId: string, keepPath: string,
): string[] {
	const out: string[] = [];
	for (const [outPath, owner] of generated) {
		if (owner === graphId && outPath !== keepPath) out.push(outPath);
	}
	return out.sort();
}

async function removeSupersededOutputs(
	project: OpenProject, graphId: string, keepPath: string,
): Promise<string[]> {
	const stale = supersededOutputs(await generatedIndex(project), graphId, keepPath);
	for (const relPath of stale) {
		await fs.rm(safeJoin(project.root, relPath), { force: true });
		await removeEmptyFolders(project, relPath);
	}
	return stale;
}

export async function compileScript(
	project: OpenProject,
	relPath: string,
	opts: {
		write?: boolean;
		force?: boolean;
		/** Output paths already written this compile, keyed to the graph that did. */
		claimed?: Map<string, string>;
		/**
		 * The project's `.luaurc` files, read once by a caller compiling many.
		 *
		 * Read here when nobody hands them over, because one graph compiled on
		 * its own still has to know what `@roact` means -- and a project compile
		 * would otherwise walk the tree once per script.
		 */
		luaurc?: LuaurcSource[];
	} = {},
): Promise<CompileOutcome> {
	const script = await readScript(project, relPath);
	const sources = opts.luaurc ?? await readLuaurcFiles(project);
	const result = compile(script, project.registry, {
		indent: indentUnit(project.config),
		comments: project.config.comments,
		castsByHierarchy: project.config.castsByHierarchy === true,
		specifiers: specifierContext(sources, relPath),
	});

	// Formatting happens before the output hash is stamped, so the hash always
	// describes the bytes that actually land on disk.
	const formatted = project.config.format
		? formatLuau(project.root, result.code, project.config)
		: result.code;
	const code = stampOutputHash(formatted);

	const outcome: CompileOutcome = {
		scriptPath: relPath,
		outputPath: outputPathFor(project, relPath, result.fileName),
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

	// Checked before the hand-edit guard, because a file the last graph wrote
	// thirty milliseconds ago passes that guard perfectly.
	const clash = outputCollision(opts.claimed, outcome.outputPath, relPath);
	if (clash) {
		outcome.skipped =
			`${outcome.outputPath} was already written by ${clash} in this compile. ` +
			`Both graphs are named "${script.name}", and a graph's own name is what it ` +
			"compiles to — rename one of them.";
		// An error rather than a skip, so it is counted with the failures and the
		// panel does not offer to overwrite: overwriting is what already happened,
		// and doing it again just picks a different winner.
		outcome.diagnostics = [
			...outcome.diagnostics,
			{ severity: "error", message: outcome.skipped },
		];
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
	// After the write, not before: if writing fails, the file the graph used to
	// produce is the only one left and deleting it first would lose both.
	outcome.superseded = await removeSupersededOutputs(project, script.id, outcome.outputPath);
	// Claimed only once it is actually on disk, so a graph that was refused does
	// not take the name away from the next one.
	opts.claimed?.set(outcome.outputPath, relPath);
	return outcome;
}

/**
 * One file's turn in a project compile, reported as it happens.
 *
 * `compileAll` returns everything at once, at the end, which makes a slow
 * project look exactly like a stuck one. These are pushed per file so the
 * status panel can show the walk rather than only its result — and the useful
 * part is *which file* and *what happened to it*, not that something is
 * happening, which is why this carries a path and a verdict rather than a
 * percentage.
 */
export interface CompileStep {
	/** 1-based position in the walk, and how long the walk is. */
	index: number;
	total: number;
	scriptPath: string;
	/**
	 * `working` is sent before the file is compiled and is the only state that
	 * is not a verdict. It is the one that distinguishes slow from stuck, so it
	 * is sent even though the verdict usually follows within milliseconds.
	 */
	state: "working" | "wrote" | "skipped" | "failed" | "checked";
	/** Why, on `skipped` and `failed`. Nothing to add on the other three. */
	note?: string;
}

/**
 * What a finished outcome should be called.
 *
 * Split out and exported because the alternative is the editor deciding for
 * itself what "written: false, no skip reason" means, and the two would
 * disagree the first time a case was added here. Pure, so it is tested
 * directly rather than through a compile.
 *
 * The distinction that matters is **skipped versus failed**: a skipped file has
 * something the developer can do about it — overwrite the hand edit — and the
 * panel offers that. A failed one has an error in the graph, and offering to
 * overwrite it would write nothing.
 */
export function describeOutcome(outcome: CompileOutcome): Pick<CompileStep, "state" | "note"> {
	if (outcome.written) return { state: "wrote" };

	const error = outcome.diagnostics.find((d) => d.severity === "error");
	if (error) return { state: "failed", note: outcome.skipped ?? error.message };
	if (outcome.skipped) return { state: "skipped", note: outcome.skipped };

	// Nothing written, nothing wrong: this was a check rather than a compile.
	return { state: "checked" };
}

export async function compileAll(
	project: OpenProject,
	opts: { write?: boolean; force?: boolean } = {},
	onStep?: (step: CompileStep) => void,
): Promise<CompileOutcome[]> {
	const scripts = await collectScripts(project);
	const out: CompileOutcome[] = [];
	const total = scripts.length;
	// What each output file was written by, so the second graph to claim a path
	// is refused rather than quietly overwriting the first. Per compile, not per
	// project: a file left over from last time is the hand-edit guard's problem.
	const claimed = new Map<string, string>();
	// Once for the whole project, rather than a tree walk per graph.
	const luaurc = await readLuaurcFiles(project);

	for (const [i, rel] of scripts.entries()) {
		const where = { index: i + 1, total, scriptPath: rel };
		onStep?.({ ...where, state: "working" });
		try {
			const outcome = await compileScript(project, rel, { ...opts, claimed, luaurc });
			out.push(outcome);
			onStep?.({ ...where, ...describeOutcome(outcome) });
		} catch (err) {
			const message = errorMessage(err);
			out.push({
				scriptPath: rel,
				outputPath: "",
				written: false,
				skipped: message,
				diagnostics: [{ severity: "error", message }],
				sourceMap: [],
				code: "",
			});
			// Reported rather than derived from the outcome above: a throw is a
			// failure whatever the synthesised outcome happens to look like.
			onStep?.({ ...where, state: "failed", note: message });
		}
	}
	return out;
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
	if (hashBody(parts.body) !== parts.declaredHash) {
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

/**
 * The hash of a generated file's body, ignoring how its lines happen to end.
 *
 * Roswaal writes LF. Git on Windows checks the same file out as CRLF, and the
 * hash in the header no longer described the bytes on disk — so cloning a
 * repository and compiling it refused every generated file as "edited by hand",
 * on a file nobody had touched. The hash is meant to answer "has someone
 * changed this code", and a line ending applied by version control is not
 * someone changing the code.
 *
 * Normalising rather than re-stamping, because the file on disk is not ours to
 * rewrite just to make our own hash agree with it. Existing hashes are
 * unaffected: they were computed over LF, and this is a no-op on LF.
 */
function hashBody(body: string): string {
	return hashString(body.replace(/\r\n/g, "\n"));
}

/** Recomputes the output hash after formatting and rewrites the header line. */
export function stampOutputHash(code: string): string {
	const parts = splitGenerated(code);
	if (!parts) return code;
	return code.replace(
		/^-- roswaal-output: .*$/m,
		`-- roswaal-output: ${hashBody(parts.body)}`,
	);
}


export interface MapOutcome {
	mapPath: string;
	outputPath: string;
	/** The project file says what the map says: written, or already so. */
	written: boolean;
	/** It already said so, and was left as it was. */
	unchanged?: boolean;
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
	// Worked out after the path check, not before. `result.ok` is the map's own
	// verdict, and a `$path` that is not on disk is an error the map cannot see —
	// counting it only in the list let the file be written anyway.
	const ok = result.ok && !result.diagnostics.some((d) => d.severity === "error");

	const outcome: MapOutcome = {
		mapPath: relPath,
		outputPath: result.outputPath,
		written: false,
		diagnostics: result.diagnostics,
		json: result.json,
	};

	if (!opts.write) return outcome;
	if (!ok) {
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

	// A file that already says the same thing is left alone, however it is
	// laid out: a project taken over from a hand-written one keeps its own
	// formatting until the map changes, and then keeps its indent and endings.
	const said = existing === null ? undefined : parseProject(existing);
	if (said !== undefined && sameProject(said, JSON.parse(result.json))) {
		await recordGenerated(project.root, result.outputPath, relPath);
		outcome.written = true;
		outcome.unchanged = true;
		return outcome;
	}

	await fs.mkdir(path.dirname(abs), { recursive: true });
	await fs.writeFile(abs, formatLike(result.json, existing), "utf8");
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
