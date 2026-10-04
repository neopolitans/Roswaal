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
/** When each was last opened, by root. Apart from the list, which predates it. */
const OPENED_KEY = "roswaal.recentOpened";

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
		const opened = Object.fromEntries(
			Object.entries(openedTimes()).filter(([key]) => next.includes(key)),
		);
		opened[root] = Date.now();
		localStorage.setItem(OPENED_KEY, JSON.stringify(opened));
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

function openedTimes(): Record<string, number> {
	try {
		const raw = JSON.parse(localStorage.getItem(OPENED_KEY) ?? "{}") as unknown;
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
		return Object.fromEntries(
			Object.entries(raw).filter(
				(entry): entry is [string, number] => typeof entry[1] === "number",
			),
		);
	} catch {
		return {};
	}
}

/** When a recent project was last opened, or null for one opened before this was kept. */
export function openedAt(root: string): number | null {
	return openedTimes()[root] ?? null;
}

/** How long ago, as a card says it: "just now", "2 hours ago", "yesterday", "3 weeks ago". */
export function sinceOpened(at: number, now = Date.now()): string {
	const minutes = Math.max(0, Math.round((now - at) / 60_000));
	if (minutes < 2) return "just now";
	if (minutes < 60) return `${minutes} minutes ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
	const days = Math.round(hours / 24);
	if (days === 1) return "yesterday";
	if (days < 7) return `${days} days ago`;
	const weeks = Math.round(days / 7);
	if (days < 30) return weeks === 1 ? "last week" : `${weeks} weeks ago`;
	const months = Math.round(days / 30);
	if (months < 12) return months === 1 ? "last month" : `${months} months ago`;
	return "over a year ago";
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
