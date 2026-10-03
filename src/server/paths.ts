/**
 * Paths inside a project: joining one onto the root without leaving it, and
 * writing one the same way whichever machine produced it.
 *
 * Path arithmetic only. Nothing here reads or writes the disk; see `files.ts`
 * for the helpers that do.
 */

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
 * Splitting on `path.sep` handled the first and silently kept the second, so
 * `scripts\Shared\Greeter.nodescript` derived a graph called
 * `scriptsSharedGreeter` on a Linux daemon and `Greeter` on a Windows one. The
 * test for it had been passing since it was written, because it had only ever
 * run on Windows; the first CI run on Linux is what found this.
 *
 * Every caller-supplied path goes through here -- `assertPackPath`,
 * `savePackNode`, `assertEditable`, `renameEntry`, `graphNameFor` -- so the
 * separator stops mattering at the edge rather than at each of them.
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
	return toPosix(p).replace(/^\.\//, "").replace(/\/+$/, "");
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

/**
 * `safeJoin` for something the tree acts on: an entry *in* the project, never
 * the project folder itself.
 *
 * `""`, `"."` and `"src/.."` all join to the root, and handed to a delete that
 * is the whole project, `.git` included.
 */
export function entryPath(root: string, relPath: string): string {
	const abs = safeJoin(root, relPath);
	if (path.relative(root, abs) === "") throw new Error("That is the project folder itself, not something in it.");
	return abs;
}

/** True when `abs` is `folder` or somewhere beneath it. */
export function isInside(abs: string, folder: string): boolean {
	const rel = path.relative(folder, abs);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
