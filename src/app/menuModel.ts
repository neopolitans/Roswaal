/**
 * What a menu holds, and the decisions about it that need no browser.
 *
 * Every context menu and dropdown in the editor is a list of sections handed
 * to `<Menu>` (`Menu.tsx`). The rules that make them read alike live here,
 * pure, so they are tested once rather than looked at in eleven menus:
 *
 * - **A divider goes between two sections that both have something in them.**
 *   An entry that only applies sometimes is written `cond && entry`, so a
 *   section can end up empty -- under Compile Content, nothing in the tree
 *   menu's first section applies but New folder -- and an empty section must
 *   leave no divider behind, at the top, the bottom or doubled in the middle.
 * - **The arrow keys skip what cannot be chosen**, and wrap, as a native menu
 *   does.
 */

import type { MouseEvent, ReactNode } from "react";

import type { IconName } from "./icons.jsx";

/** One line of a menu. */
export interface MenuEntry {
	/** Unique within the menu. The label when left out; two Split Struct Pin rows need one. */
	key?: string;
	label: string;
	/** Drawn where the editor already draws this command with an icon. */
	icon?: IconName;
	/** A colour dot in the icon's place: a node's category, a comment's colour. */
	swatch?: string;
	/** Something else in the icon's place: an open tab's own icon, coloured by its kind. */
	glyph?: ReactNode;
	/** Quiet words at the right: a shortcut, a mode, `pure`. */
	hint?: ReactNode;
	/** Its tooltip: what it makes, or why it cannot be done here. */
	title?: string;
	/** Destroys something. Drawn in red, and kept in the last section. */
	danger?: boolean;
	/** Shown and not chosen: something this copy of Roswaal cannot do, or not yet. */
	disabled?: boolean;
	/** A setting the entry turns on and off, and whether it is on. */
	checked?: boolean;
	/** The one that is in use now: the document on screen, in a list of them. */
	current?: boolean;
	/** Opens a page. Drawn as a link, so a middle-click still opens a tab. */
	link?: { href: string; target?: string; rel?: string };
	/** What choosing it does. The menu closes afterwards either way. */
	run?: (e: MouseEvent) => void;
}

/** Entries that belong together. */
export interface MenuSection {
	/** A heading over the section: the card menu's Closed. */
	label?: string;
	/** Something that is not an entry, above the entries: the More menu's Manual | Dynamic. */
	content?: ReactNode;
	/** `cond && entry` for an entry that only sometimes applies. */
	entries: (MenuEntry | false | null | undefined)[];
}

/** A section with its absent entries gone. */
export interface ShownSection {
	label?: string;
	content?: ReactNode;
	entries: MenuEntry[];
}

/**
 * The sections that have something to show, in order. A divider is drawn
 * before each one but the first, which is the whole of the divider rule.
 */
export function shownSections(sections: readonly MenuSection[]): ShownSection[] {
	const out: ShownSection[] = [];
	for (const section of sections) {
		const entries = section.entries.filter((e): e is MenuEntry => Boolean(e));
		if (entries.length === 0 && section.content === undefined) continue;
		out.push({ label: section.label, content: section.content, entries });
	}
	return out;
}

/** The keys that move through a menu. Enter and Space are the entry's own, as a button's. */
export type MenuKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

export function isMenuKey(key: string): key is MenuKey {
	return key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End";
}

/**
 * Where a key moves to, among `enabled.length` entries, from `from` -- `-1`
 * when nothing has focus yet, so the first Down lands on the first entry and
 * the first Up on the last. `-1` back when nothing can be chosen at all.
 */
export function nextEntry(from: number, enabled: readonly boolean[], key: MenuKey): number {
	const count = enabled.length;
	if (!enabled.some(Boolean)) return -1;
	const first = enabled.indexOf(true);
	const last = enabled.lastIndexOf(true);
	if (key === "Home") return first;
	if (key === "End") return last;
	const step = key === "ArrowDown" ? 1 : -1;
	let at = from < 0 ? (step > 0 ? -1 : count) : from;
	for (let tried = 0; tried < count; tried++) {
		at = (at + step + count) % count;
		if (enabled[at]) return at;
	}
	return -1;
}
