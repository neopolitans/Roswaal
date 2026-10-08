/**
 * Where the editor was, kept across a page load in the same tab.
 *
 * Moving between the editor and Node Design never unloads the editor -- see
 * `pageHost.tsx` -- but the hosted site's docs are pages of their own, and so
 * is a reload. Before the page goes, the editor writes down its graph tabs,
 * the one in front, where each was looking and the Code panel's tabs; when the
 * same project opens again in this tab, they are put back.
 *
 * `sessionStorage`, so it belongs to the tab: a second tab opened on the same
 * project starts as it always has. Read once and then cleared, so a session is
 * only ever put back by the load that follows it.
 */

import type { CodeTab } from "./CodePanel.jsx";
import type { View } from "./geometry.js";

export const SESSION_KEY = "roswaal-editor-session";

export interface EditorSession {
	root: string;
	tabs: { path: string; graph: string | null; view: View }[];
	active: string | null;
	code: Record<string, { tabs: CodeTab[]; active: string | null }>;
}

export function keepSession(session: EditorSession): void {
	try {
		sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
	} catch {
		// Storage refused: the editor opens as it did before there was one.
	}
}

/** The session kept for this project, if there is one; taken, so once only. */
export function takeSession(root: string): EditorSession | null {
	let raw: string | null = null;
	try {
		raw = sessionStorage.getItem(SESSION_KEY);
		sessionStorage.removeItem(SESSION_KEY);
	} catch {
		return null;
	}
	return parseSession(raw, root);
}

/** A kept session, if the text is one and it is for this project. */
export function parseSession(raw: string | null, root: string): EditorSession | null {
	if (!raw) return null;
	try {
		const session = JSON.parse(raw) as Partial<EditorSession>;
		if (session.root !== root || !Array.isArray(session.tabs)) return null;
		return {
			root,
			tabs: session.tabs.filter(
				(t) =>
					typeof t?.path === "string" &&
					(t.graph === null || typeof t.graph === "string") &&
					typeof t.view?.x === "number" &&
					typeof t.view?.y === "number" &&
					typeof t.view?.zoom === "number",
			),
			active: typeof session.active === "string" ? session.active : null,
			code: session.code && typeof session.code === "object" ? session.code : {},
		};
	} catch {
		return null;
	}
}
