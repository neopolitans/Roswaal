/**
 * The whole project gathered up for an export: its text files, and its places
 * and models as base64.
 */

import { toBase64 } from "../core/base64.js";
import type { OpenProject } from "./config.js";
import { walkFiles } from "./files.js";
import { fs } from "./host.js";

/**
 * The extensions a Roswaal project is made of: the graphs, the maps, the
 * packs, the config, the generated Luau and the Rojo project beside it.
 */
const EXPORTABLE = [".nodescript", ".nodemap", ".luau", ".lua", ".json", ".toml", ".md", ".txt"];

/**
 * Every text file in the project, for handing the whole thing over at once.
 *
 * What the hosted editor downloads as a zip, and the only way work done in a
 * browser tab leaves it.
 *
 * **By extension, deliberately.** The alternative -- everything under the root
 * that is not in `SKIP_DIRS` -- would read a `.rbxm` or a PNG as UTF-8 and hand
 * back something that is not the file. Anything else in the directory is
 * somebody else's, and a zip that quietly corrupts it is worse than one that
 * does not contain it.
 */
export async function collectProject(project: OpenProject): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	const accept = (name: string) => EXPORTABLE.some((suffix) => name.endsWith(suffix));
	for (const file of await walkFiles(project.root, { accept })) {
		// Gone since the walk listed it: there is nothing to hand over.
		const text = await fs.readFile(file.abs, "utf8").catch(() => null);
		if (text !== null) out[file.path] = text;
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
	const accept = (name: string) => /\.rbx[lm]x?$/i.test(name);
	for (const file of await walkFiles(project.root, { accept })) {
		// Gone since the walk listed it, as above.
		const bytes = await fs.readFile(file.abs).catch(() => null);
		if (bytes !== null) out[file.path] = toBase64(bytes);
	}
	return out;
}
