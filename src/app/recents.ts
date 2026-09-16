/**
 * The projects this browser has opened, and the one it had open last.
 *
 * Typing an absolute path into a text field is fine once and tiresome the
 * fourth time, and a repository you work in is a repository you come back to.
 * Per-browser rather than in the config: which projects *you* have open is not
 * something to commit.
 *
 * ## Why this is its own module
 *
 * It lived in `App.tsx` while the editor was the only thing that wanted it.
 * The introduction panel opens on all three surfaces and offers the same list
 * on each, so Docs and Node Design read it too — and a list the editor wrote
 * and the other two reimplemented would be three answers to one question.
 *
 * Nothing here talks to a host. These are paths somebody typed or picked, and
 * whether one is still there is the daemon's to say when it is asked to open
 * it; a list that quietly dropped a project because a drive was unplugged
 * would be a list that forgets your work for you.
 */

const LAST_PROJECT_KEY = "roswaal.lastProject";
const RECENT_KEY = "roswaal.recentProjects";

/**
 * Six. Long enough to hold the projects somebody is actually moving between,
 * short enough that the carousel is a row rather than a history.
 */
const RECENT_LIMIT = 6;

export function recentProjects(): string[] {
	try {
		const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
		return Array.isArray(raw) ? raw.filter((r): r is string => typeof r === "string") : [];
	} catch {
		// A private window, cleared site data, or somebody's extension. An
		// empty list is the honest answer and the panel simply has no Recent.
		return [];
	}
}

/** Moves a root to the front of the list, keeping it short and unique. */
export function remember(root: string): void {
	try {
		localStorage.setItem(LAST_PROJECT_KEY, root);
		const next = [root, ...recentProjects().filter((r) => r !== root)].slice(0, RECENT_LIMIT);
		localStorage.setItem(RECENT_KEY, JSON.stringify(next));
	} catch {
		// Storage refused. The project is open either way; it just will not be
		// on the list next time, which is a worse session and not a broken one.
	}
}

/** Drops one from the list, for a path that is no longer there. */
export function forget(root: string): void {
	try {
		localStorage.setItem(RECENT_KEY, JSON.stringify(recentProjects().filter((r) => r !== root)));
		if (localStorage.getItem(LAST_PROJECT_KEY) === root) {
			localStorage.removeItem(LAST_PROJECT_KEY);
		}
	} catch {
		// As above.
	}
}

/** The project open when the tab was last closed, for reopening it. */
export function lastProject(): string | null {
	try {
		return localStorage.getItem(LAST_PROJECT_KEY);
	} catch {
		return null;
	}
}

export function forgetLastProject(): void {
	try {
		localStorage.removeItem(LAST_PROJECT_KEY);
	} catch {
		// As above.
	}
}

/** The last segment of a path, which is what anyone actually calls a project. */
export function projectName(root: string): string {
	const parts = root.split(/[\\/]/).filter((p) => p.length > 0);
	return parts[parts.length - 1] ?? root;
}

/**
 * Enough of the path to tell two projects apart, from the end.
 *
 * The end rather than the start: `V:\Infinite Studios\roswaal-node-scripter\`
 * is the same for every project in a repository and the part that differs is
 * always last. Truncating the other way round would show the identical half.
 */
export function projectTail(root: string, segments = 2): string {
	const separator = root.includes("\\") ? "\\" : "/";
	const parts = root.split(/[\\/]/).filter((p) => p.length > 0);
	if (parts.length <= segments) return root;
	return "…" + separator + parts.slice(-segments).join(separator);
}
