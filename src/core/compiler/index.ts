/** Public compiler surface. */

import type { NodeScript, ScriptClass, Target } from "../schema.js";
import type { Registry } from "../nodes/index.js";
import type { SpecifierContext } from "../modules.js";
import { emit, hashString, type Diagnostic, type EmitResult } from "./emit.js";
import { validate } from "./validate.js";
import { retypeClassReads } from "../classReads.js";

export { validate } from "./validate.js";
export { emit, hashString } from "./emit.js";
export type { Diagnostic, EmitResult } from "./emit.js";
export { GraphIndex } from "./graph.js";
export * from "./luau.js";

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
	source: NodeScript, registry: Registry, options: CompileOptions = {},
): CompileResult {
	// Hashed as saved; compiled with every wired Class Name followed, so a file
	// edited by hand cannot carry a stale class into the build.
	const sourceHash = hashString(semanticJson(source));
	const script = retypeClassReads(source);
	const structural = validate(script, registry);
	const emitted: EmitResult = emit(script, registry, sourceHash, {
		indent: options.indent,
		comments: options.comments,
		specifiers: options.specifiers,
	});

	const diagnostics = [...structural, ...emitted.diagnostics];
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

export function scriptClassFor(fileName: string): { name: string; scriptClass: ScriptClass } {
	const base = fileName.replace(/\.luau?$/i, "");
	if (base.endsWith(".client")) return { name: base.slice(0, -7), scriptClass: "LocalScript" };
	if (base.endsWith(".server")) return { name: base.slice(0, -7), scriptClass: "Script" };
	return { name: base, scriptClass: "ModuleScript" };
}

/**
 * A stable projection of everything that affects the generated Luau, with
 * layout deliberately excluded. Nudging a node must not change the output
 * hash, or every cosmetic tidy-up would show as a diff in compiled files.
 */
export function semanticJson(script: NodeScript): string {
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
			id: v.id, name: v.name, type: v.type, default: v.default,
			description: v.description ?? null,
		})),
		// Modules change the generated file, so they have to change the hash
		// that decides whether it needs rewriting.
		modules: (script.modules ?? []).map((m) => ({
			id: m.id, name: m.name, specifier: m.specifier,
			members: m.members ?? null, description: m.description ?? null,
		})),
		nodes,
		links,
	});
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
				...(n.config && Object.keys(n.config).length ? { config: sortKeys(n.config as Record<string, unknown>) } : {}),
			})),
		links: [...script.links]
			.sort((a, b) => a.id.localeCompare(b.id))
			.map((l) => ({ id: l.id, from: l.from, to: l.to })),
		comments: [...script.comments]
			.sort((a, b) => a.id.localeCompare(b.id))
			.map((c) => ({
				id: c.id, x: round(c.x), y: round(c.y), w: round(c.w), h: round(c.h),
				text: c.text, ...(c.color ? { color: c.color } : {}),
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

export type { NodeScript, Target, ScriptClass };
