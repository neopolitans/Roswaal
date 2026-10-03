/**
 * The whole project gathered up for an export: its text files, and its places
 * and models as base64.
 */

import { fs, path } from "./host.js";

import { toBase64 } from "../core/base64.js";
import type { OpenProject } from "./config.js";
import { SKIP_DIRS } from "./files.js";
import { toPosix } from "./paths.js";

/**
 * Every text file in the project, for handing the whole thing over at once.
 *
 * What the hosted editor downloads as a zip, and the only way work done in a
 * browser tab leaves it.
 *
 * **By extension, deliberately.** The alternative -- everything under the root
 * that is not in `SKIP_DIRS` -- would read a `.rbxm` or a PNG as UTF-8 and hand
 * back something that is not the file. These are the extensions a Roswaal
 * project is made of: the graphs, the maps, the packs, the config, the
 * generated Luau and the Rojo project beside it. Anything else in the directory
 * is somebody else's, and a zip that quietly corrupts it is worse than one that
 * does not contain it.
 */
const EXPORTABLE = [
	".nodescript", ".nodemap", ".luau", ".lua", ".json", ".toml", ".md", ".txt",
];

export async function collectProject(project: OpenProject): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	const stack = [project.root];

	while (stack.length) {
		const dir = stack.pop()!;
		for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
			const abs = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!SKIP_DIRS.has(entry.name)) stack.push(abs);
				continue;
			}
			if (!EXPORTABLE.some((suffix) => entry.name.endsWith(suffix))) continue;
			const text = await fs.readFile(abs, "utf8").catch(() => null);
			if (text !== null) out[toPosix(path.relative(project.root, abs))] = text;
		}
	}
	return out;
}

/**
 * The places and models in a project, base64-encoded, for the export: the one
 * kind of binary file a project keeps, and the reason `collectProject` is not
 * the whole of it.
 */
export async function collectBinaries(project: OpenProject): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	const stack = [project.root];
	while (stack.length) {
		const dir = stack.pop()!;
		for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
			const abs = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!SKIP_DIRS.has(entry.name)) stack.push(abs);
				continue;
			}
			if (!/\.rbx[lm]x?$/i.test(entry.name)) continue;
			const bytes = await fs.readFile(abs).catch(() => null);
			if (bytes !== null) out[toPosix(path.relative(project.root, abs))] = toBase64(bytes);
		}
	}
	return out;
}
