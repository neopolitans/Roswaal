/**
 * Where the project's files land in the DataModel, by the node maps, and the
 * types its module graphs export from there.
 */

import { locateInDataModel, type InstanceLocation } from "../core/nodemap.js";
import { isModuleScript } from "../core/schema.js";
import { fieldsOfDeclaration, type TypeField } from "../core/typeFields.js";
import type { OpenProject } from "./config.js";
import { collectMaps, collectScripts, readMap, readScript } from "./documents.js";
import { graphOutputPath } from "./outputs.js";

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
		// A graph that will not compile still has a source path worth trying.
		const output = await graphOutputPath(project, relPath);
		if (output) candidates.unshift(output);
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

/** A type a module in the project exports, and where that module lands. */
export interface ExportedType {
	/** The graph declaring it. */
	graph: string;
	name: string;
	/** Where the graph's module sits in the DataModel, when a node map says. */
	location: InstanceLocation | null;
	/**
	 * The fields it holds, when it is a table of fixed ones.
	 *
	 * Sent with the name because only this side can read the other graph: Get
	 * Member offers `Config.Tuning`'s fields in a graph that has required it,
	 * and the compiler in the browser has no way to open the file that
	 * declares them. Empty for a union, a function type or a dictionary, which
	 * have no fixed fields to offer.
	 */
	fields?: TypeField[];
}

/**
 * Every type a ModuleScript graph in the project exports.
 *
 * What another graph can name after requiring that module — `Config.Tuning` —
 * so the editor can offer it rather than leave it to be remembered and typed.
 * Only module graphs declaring an exported type are located, since locating
 * one means compiling it to learn its file name.
 */
export async function exportedTypes(project: OpenProject): Promise<ExportedType[]> {
	const out: ExportedType[] = [];
	for (const relPath of await collectScripts(project)) {
		const script = await readScript(project, relPath).catch(() => null);
		if (!script || !isModuleScript(script)) continue;

		const declared = new Map<string, TypeField[]>();
		for (const node of script.nodes) {
			if (node.def !== "type.declareTop" && node.def !== "type.declareHere") continue;
			const config = (node.config ?? {}) as {
				name?: string; export?: boolean; shape?: string; definition?: string;
				fields?: { name?: string; type?: string }[];
			};
			const name = (config.name ?? "").trim();
			if (config.export !== false && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
				declared.set(name, fieldsOfDeclaration(node.def, config));
			}
		}
		if (declared.size === 0) continue;

		const location = await locateFile(project, relPath).catch(() => null);
		for (const [name, fields] of declared) out.push({ graph: relPath, name, location, fields });
	}
	return out;
}
