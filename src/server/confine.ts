/**
 * The folders the daemon keeps itself inside: every project root it works in.
 *
 * `safeJoin` keeps a path inside its root by its spelling. On disk that is not
 * the whole answer: a symbolic link inside a project can lead anywhere, and a
 * repository can carry one -- `src` pointing at a home folder, or a `.luau`
 * that is a link to something somebody would rather keep. So every root a path
 * is joined to is noted here, and the Node binding of the project layer
 * (`host.ts`) checks, before anything is read, written or removed under one,
 * that what the path names on disk is inside it too.
 *
 * Only the noting lives here, so the web build -- whose volume has no links --
 * can carry it without carrying `node:fs`.
 */

const roots = new Set<string>();

/** Notes `root` (already resolved) as a folder whatever is under it must stay inside. */
export function confineTo(root: string): void {
	roots.add(root);
}

/** Every root noted so far. */
export function confinedRoots(): ReadonlySet<string> {
	return roots;
}
