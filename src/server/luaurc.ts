/**
 * The project's `.luaurc` files: read for the editor and the compiler, and
 * written whole when the editor changes one.
 */

import { chainFor, type LuaurcSource, parseLuaurc } from "../core/luaurc.js";
import type { SpecifierContext } from "../core/modules.js";
import type { OpenProject } from "./config.js";
import { walkFiles } from "./files.js";
import { fs, path } from "./host.js";
import { safeJoin } from "./paths.js";

/**
 * Every `.luaurc` in the project, as the editor needs to see them.
 *
 * All of them at once rather than the chain for one script, because the editor
 * holds several graphs open and a round trip per script would be a round trip
 * per keystroke in a specifier field. The chain for a given file is arithmetic
 * on this list, which `luaurcFor` does without asking anything.
 *
 * Read as *text* and parsed on the other side, so the parser has one home and
 * the panel that shows a broken file shows the same complaint the compiler
 * saw. The alternative -- parsing here and sending a map -- loses the file's
 * own problems on the way through JSON.
 */
export async function readLuaurcFiles(project: OpenProject): Promise<LuaurcSource[]> {
	const out: LuaurcSource[] = [];
	for (const file of await walkFiles(project.root, { accept: (name) => name === ".luaurc" })) {
		// Gone since the walk listed it: then it configures nothing.
		const text = await fs.readFile(file.abs, "utf8").catch(() => null);
		if (text === null) continue;
		const dir = path.posix.dirname(file.path);
		out.push({ dir: dir === "." ? "" : dir, text });
	}

	// Nearest last here; `luaurcFor` reverses what it takes. Sorted so two runs
	// of the same project produce the same list -- readdir order is the
	// filesystem's business and a panel that reorders itself is a panel that
	// looks like it is doing something.
	out.sort((a, b) => a.dir.localeCompare(b.dir));
	return out;
}

/**
 * Writes one, creating the directory if it is not there.
 *
 * Whole-file, and only ever what the caller handed over: a `.luaurc` is the
 * developer's file, it may carry `languageMode` and settings that are none of
 * our business, and a writer that rebuilt it from the aliases it knew about
 * would silently drop the rest.
 */
export async function writeLuaurcFile(
	project: OpenProject,
	dir: string,
	text: string,
): Promise<void> {
	const abs = safeJoin(project.root, dir === "" ? ".luaurc" : `${dir}/.luaurc`);
	await fs.mkdir(path.dirname(abs), { recursive: true });
	await fs.writeFile(abs, text, "utf8");
}

/**
 * What the compiler should be told about aliases, for one graph.
 *
 * `hasLuaurc` is the whole set rather than this graph's chain, deliberately: a
 * project with a `.luaurc` in one corner is a project that uses alias maps, so
 * a name nothing defines is a typo wherever it is written. A project with none
 * at all may be generating one, and that is the case this refuses to call an
 * error.
 */
export function specifierContext(sources: LuaurcSource[], relPath: string): SpecifierContext {
	const files = sources.map((file) => parseLuaurc(file.dir, file.text));
	return { luaurc: chainFor(files, relPath), hasLuaurc: files.length > 0 };
}
