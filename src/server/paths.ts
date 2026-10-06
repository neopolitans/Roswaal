/**
 * Paths inside a project: joining one onto the root without leaving it, and
 * writing one the same way whichever machine produced it.
 *
 * Path arithmetic only. Nothing here reads or writes the disk; see `files.ts`
 * for the helpers that do.
 */

import { normalisePath } from "../core/rojoPaths.js";
import { confineTo } from "./confine.js";
import { UserError } from "./errors.js";
import { path } from "./host.js";

/**
 * A path with forward slashes, whatever produced it.
 *
 * **Both separators, not this machine's.** The paths that reach here come from
 * two places and only one of them is local: `path.join` and `path.relative`
 * give this platform's separator, and a request from an editor carries whatever
 * *that* machine calls a path -- which may be a backslash while the daemon is
 * on Linux.
 *
 * Splitting on `path.sep` handles the first and silently keeps the second, so
 * `scripts\Shared\Greeter.nodescript` would derive a graph called
 * `scriptsSharedGreeter` on a Linux daemon and `Greeter` on a Windows one.
 *
 * Every path the server turns round goes through here -- caller-supplied ones
 * in `assertPackPath`, `savePackNode`, `assertEditable`, `renameEntry` and
 * `graphNameFor`, and the ones `path.relative` makes in the walks, the tree
 * and the watcher -- so the separator stops mattering at the edge.
 *
 * The cost is that a backslash can no longer be part of a file name on a
 * platform that allows one. Roswaal will not write such a name (`renameEntry`
 * strips it, and so does `graphName`), so a file carrying one is a file it did
 * not make and could not have named.
 */
export function toPosix(p: string): string {
	return p.replace(/\\/g, "/");
}

/**
 * A path as somebody wrote it in a node map, made comparable with one the
 * project produced: forward slashes, no leading `./`, no trailing slash.
 */
export function tidyPath(p: string): string {
	return normalisePath(toPosix(p));
}

/** Refuses any path that would escape the project root. */
export function safeJoin(root: string, relPath: string): string {
	// Noted so the filesystem checks, on disk, that links do not lead out of it.
	confineTo(path.resolve(root));
	const abs = path.resolve(root, relPath);
	const rel = path.relative(root, abs);
	if (rel.startsWith("..") || path.isAbsolute(rel)) {
		throw new UserError(`Path escapes the project: ${relPath}`);
	}
	return abs;
}

/**
 * `safeJoin` for something the tree acts on: an entry *in* the project, never
 * the project folder itself.
 *
 * `""`, `"."` and `"src/.."` all join to the root, and handed to a delete that
 * is the whole project, `.git` included.
 */
export function entryPath(root: string, relPath: string): string {
	const abs = safeJoin(root, relPath);
	if (path.relative(root, abs) === "")
		throw new UserError("That is the project folder itself, not something in it.");
	return abs;
}

/** True when `abs` is `folder` or somewhere beneath it. */
export function isInside(abs: string, folder: string): boolean {
	const rel = path.relative(folder, abs);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Whether a folder named in `roswaal.json` stays inside the project: relative,
 * on any platform's reading of it, and never climbing above where it starts.
 * `src/../src` stays; `../shared`, `/etc` and `C:\Users` do not.
 */
export function staysInside(folder: string): boolean {
	if (/^[\\/]/.test(folder) || /^[A-Za-z]:/.test(folder)) return false;
	let depth = 0;
	for (const segment of folder.split(/[\\/]+/)) {
		if (segment === "..") depth--;
		else if (segment !== "" && segment !== ".") depth++;
		if (depth < 0) return false;
	}
	return true;
}
