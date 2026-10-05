/** Public compiler surface. */

import { retypeClassReads } from "../classReads.js";
import { headersByNode } from "../comments.js";
import { checkLuau } from "../luau/check.js";
import type { SpecifierContext } from "../modules.js";
import type { Registry } from "../nodes/index.js";
import type { Comment, NodeScript, ScriptClass, Target } from "../schema.js";
import { syncScriptCalls } from "../scriptCalls.js";
import { type Diagnostic, type EmitResult, emit, hashString } from "./emit.js";
import { validate } from "./validate.js";

export type { Diagnostic, EmitResult } from "./emit.js";
export { emit, hashString } from "./emit.js";
export { GraphIndex } from "./graph.js";
export { validate } from "./validate.js";

export interface CompileResult {
	code: string;
	diagnostics: Diagnostic[];
	sourceMap: { line: number; node: string }[];
	sourceHash: string;
	outputHash: string;
	/** Filename the result should be written as, relative to the out directory. */
	fileName: string;
	ok: boolean;
}

/**
 * What the project decides about the generated file, as opposed to what the
 * graph decides.
 *
 * One field so far. It is a separate type from `EmitOptions` because those
 * other two switches are the logic compiler talking to itself about templates,
 * and nothing calling `compile` has any business setting them.
 */
export interface CompileOptions {
	/** One level of indentation. See `indentUnit` in the schema. */
	indent?: string;
	/** Write comment headers above the code their nodes produce. */
	comments?: boolean;
	/** Drop a cast a branch proved by class hierarchy. See the project config. */
	castsByHierarchy?: boolean;
	/**
	 * The project's `.luaurc` alias map, for checking a module's specifier.
	 *
	 * A project fact rather than a graph one, so it arrives here rather than
	 * being read off the script. Absent, an alias is checked for shape only —
	 * which is every caller that has no project: a template, a test, a preview
	 * of a graph nobody has opened.
	 */
	specifiers?: SpecifierContext;
}

export function compile(
	source: NodeScript,
	registry: Registry,
	options: CompileOptions = {},
): CompileResult {
	// Hashed as saved; compiled with every wired Class Name followed and every
	// Script Function on its function's current signature, so a file edited by
	// hand cannot carry a stale class or signature into the build.
	const headers = options.comments ? headersByNode(source, registry) : undefined;
	const sourceHash = hashString(semanticJson(source, { headers }));
	const script = syncScriptCalls(retypeClassReads(source));
	const structural = validate(script, registry);
	const emitted: EmitResult = emit(script, registry, sourceHash, {
		indent: options.indent,
		comments: options.comments,
		castsByHierarchy: options.castsByHierarchy,
		specifiers: options.specifiers,
	});

	const diagnostics = [...structural, ...emitted.diagnostics];
	if (!diagnostics.some((d) => d.severity === "error")) {
		diagnostics.push(...unparsedOutput(emitted));
	}
	const ok = !diagnostics.some((d) => d.severity === "error");

	return {
		code: emitted.code,
		diagnostics,
		sourceMap: emitted.sourceMap,
		sourceHash,
		outputHash: emitted.outputHash,
		fileName: outputFileName(script),
		ok,
	};
}

/**
 * The generated file read back with the Luau parser.
 *
 * A graph that passed every other check should always produce Luau that
 * parses, so a failure here is a bug in the compiler, not in the graph. It is
 * an error all the same, so a broken file is never written; and it is only
 * asked once nothing else has failed, so a typo in Custom Code is reported
 * once, by the check that knows which node it is in.
 */
function unparsedOutput(emitted: EmitResult): Diagnostic[] {
	const problem = checkLuau(emitted.code, "block", { wholeFile: true })[0];
	if (problem === undefined) return [];
	const node = emitted.sourceMap.find((entry) => entry.line === problem.line)?.node;
	return [
		{
			severity: "error",
			message:
				`The Luau written for this graph does not parse (line ${problem.line}: ${problem.message}). ` +
				"This is a bug in Roswaal — please report it with the graph.",
			...(node !== undefined ? { node } : {}),
		},
	];
}

/**
 * Rojo decides what a file becomes from its extension, so the script class and
 * run context have to be encoded in the name rather than the contents.
 */
export function outputFileName(script: NodeScript): string {
	const base = script.name;
	if (script.target === "lune") return `${base}.luau`;
	switch (script.scriptClass) {
		case "ModuleScript":
			return `${base}.luau`;
		case "LocalScript":
			return `${base}.client.luau`;
		case "Script":
			return script.runContext === "Client" ? `${base}.client.luau` : `${base}.server.luau`;
	}
}

/**
 * A stable projection of a graph, hashed into the generated file's
 * `roswaal-source` line.
 *
 * Covered: the script's own settings (name, class, run context, target, mode
 * line), its variables and modules in declaration order, every node's id,
 * definition, label, literals and config, and every link. When comment headers
 * are written, `headers` adds each header's text and the ids of the nodes it
 * heads — what a comment changes in the file, rather than where it is drawn.
 *
 * Not covered: positions, sizes, colours and comments that write no header.
 * Nudging a node must not change the hash, or every cosmetic tidy-up would
 * show as a diff in compiled files. Two things positions do decide are left
 * out for that reason, and changing them changes the output without changing
 * the hash: the order of hoisted Functions and of Script Starts, which are
 * written top to bottom as drawn.
 *
 * The `headers` field is added only when there is a header, so a graph with
 * none hashes exactly as it did before headers counted.
 */
function semanticJson(script: NodeScript, layout: { headers?: Map<string, Comment> } = {}): string {
	const nodes = [...script.nodes]
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((n) => ({
			id: n.id,
			def: n.def,
			label: n.label ?? null,
			literals: sortKeys(n.literals ?? {}),
			config: sortKeys((n.config ?? {}) as Record<string, unknown>),
		}));
	const links = [...script.links]
		.map((l) => `${l.from.node}/${l.from.pin}->${l.to.node}/${l.to.pin}`)
		.sort();

	return JSON.stringify({
		schemaVersion: script.schemaVersion,
		name: script.name,
		scriptClass: script.scriptClass,
		runContext: script.runContext ?? null,
		target: script.target,
		typecheck: script.typecheck,
		variables: (script.variables ?? []).map((v) => ({
			id: v.id,
			name: v.name,
			type: v.type,
			default: v.default,
			description: v.description ?? null,
			...(v.const === true ? { const: true } : {}),
		})),
		// Modules change the generated file, so they have to change the hash
		// that decides whether it needs rewriting.
		modules: (script.modules ?? []).map((m) => ({
			id: m.id,
			name: m.name,
			specifier: m.specifier,
			members: m.members ?? null,
			description: m.description ?? null,
		})),
		nodes,
		links,
		...headerProjection(layout.headers),
	});
}

/** Each written header's text and the nodes it heads, ordered by comment id. */
function headerProjection(headers: Map<string, Comment> | undefined): {
	headers?: { text: string; nodes: string[] }[];
} {
	if (headers === undefined || headers.size === 0) return {};
	const byComment = new Map<string, { text: string; nodes: string[] }>();
	for (const [nodeId, comment] of headers) {
		const entry = byComment.get(comment.id) ?? { text: comment.text, nodes: [] };
		entry.nodes.push(nodeId);
		byComment.set(comment.id, entry);
	}
	return {
		headers: [...byComment]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([, entry]) => ({ text: entry.text, nodes: entry.nodes.sort() })),
	};
}

/** Canonical on-disk form: sorted keys and stable ordering, for sane diffs. */
export function serialiseScript(script: NodeScript): string {
	const ordered = {
		schemaVersion: script.schemaVersion,
		kind: script.kind,
		id: script.id,
		name: script.name,
		scriptClass: script.scriptClass,
		...(script.runContext ? { runContext: script.runContext } : {}),
		target: script.target,
		typecheck: script.typecheck,
		// Declaration order is the author's and shows up in the generated file,
		// so this is the one list that is not sorted on the way to disk.
		variables: (script.variables ?? []).map((v) => ({
			id: v.id,
			name: v.name,
			type: v.type,
			default: v.default,
			...(v.description ? { description: v.description } : {}),
			...(v.const === true ? { const: true } : {}),
		})),
		// Declaration order is the author's here too: it is the order the requires
		// come out in, which a reader of the generated file sees.
		...((script.modules ?? []).length > 0
			? {
					modules: (script.modules ?? []).map((m) => ({
						id: m.id,
						name: m.name,
						specifier: m.specifier,
						...(m.members && m.members.length > 0 ? { members: m.members } : {}),
						...(m.description ? { description: m.description } : {}),
					})),
				}
			: {}),
		nodes: [...script.nodes]
			.sort((a, b) => a.id.localeCompare(b.id))
			.map((n) => ({
				id: n.id,
				def: n.def,
				x: round(n.x),
				y: round(n.y),
				...(n.graph ? { graph: n.graph } : {}),
				...(n.inner ? { inner: { x: round(n.inner.x), y: round(n.inner.y) } } : {}),
				...(n.label ? { label: n.label } : {}),
				...(n.literals && Object.keys(n.literals).length ? { literals: sortKeys(n.literals) } : {}),
				...(n.config && Object.keys(n.config).length
					? { config: sortKeys(n.config as Record<string, unknown>) }
					: {}),
			})),
		links: [...script.links]
			.sort((a, b) => a.id.localeCompare(b.id))
			.map((l) => ({ id: l.id, from: l.from, to: l.to })),
		comments: [...script.comments]
			.sort((a, b) => a.id.localeCompare(b.id))
			.map((c) => ({
				id: c.id,
				x: round(c.x),
				y: round(c.y),
				w: round(c.w),
				h: round(c.h),
				text: c.text,
				...(c.color ? { color: c.color } : {}),
				...(c.graph ? { graph: c.graph } : {}),
			})),
	};
	return JSON.stringify(ordered, null, 2) + "\n";
}

function round(n: number): number {
	return Math.round(n * 100) / 100;
}

function sortKeys<T extends Record<string, unknown>>(obj: T): T {
	const out: Record<string, unknown> = {};
	for (const key of Object.keys(obj).sort()) out[key] = obj[key];
	return out as T;
}

export type { NodeScript, ScriptClass, Target };
