/**
 * What an extension says about itself.
 *
 * Small and loaded with the editor, so the editor can name an extension, say
 * which version it is, offer to turn it on and show its settings without
 * downloading it. What the extension does is behind `load`, a chunk of its
 * own that a browser with it turned off never fetches.
 */

import type { ComponentType } from "react";

/** One choice a setting offers: the value kept, and the word Settings shows. */
export interface SettingChoice {
	value: string;
	label: string;
}

/**
 * A setting an extension declares rather than draws. Settings draws it with
 * its own controls: a switch for a boolean; for a choice, buttons side by side
 * when there are four or fewer, and a dropdown when there are more.
 */
export type SettingDecl = {
	/** Its name in the extension's store: `outlineWidth`. */
	key: string;
	title: string;
	/** One or two sentences under the title. */
	help: string;
	/**
	 * The `Preferences` field it was kept in before it was the extension's,
	 * read once into the extension's store the first time that is read.
	 */
	legacy?: string;
} & (
	| {
			type: "boolean";
			default: boolean;
			/** What the switch says when on, and when off. */
			on: string;
			off: string;
	  }
	| { type: "choice"; default: string; choices: readonly SettingChoice[] }
);

/** Settings that belong together, under a small heading. */
export interface SettingGroup {
	title: string;
	settings: readonly SettingDecl[];
}

/** A page an extension adds to Settings, below its own. */
export interface ExtensionPage {
	/** Unique within the extension: `scene`. */
	id: string;
	title: string;
	/** The line under the title: what the page is for, and where it is kept. */
	note: string;
	/** Declared settings, which Settings draws. */
	groups?: readonly SettingGroup[];
	/**
	 * A page with controls of its own, for what is not a setting: signing in,
	 * clearing a download. A chunk of its own, loaded when the page is opened,
	 * and apart from the extension's, so opening Settings never downloads it.
	 */
	component?: () => Promise<{ default: ComponentType }>;
}

/** Something an extension puts in the editor, for its page to list. */
export interface ExtensionAddition {
	/** `A place tab`. */
	title: string;
	/** What it is, in a line. */
	what: string;
	/** `Tab`, `Panels`, `Settings`: a word for the kind. */
	kind: string;
}

/** One of an extension's own releases. */
export interface ExtensionRelease {
	version: string;
	/** The Roswaal version that shipped it. */
	roswaal: string;
	/** ISO date. */
	date: string;
	/** What changed, in a sentence or two. */
	text: string;
}

export interface ExtensionManifest<Module = unknown> {
	/** `placeViewer`: names its settings, its storage and its routes' owner. */
	id: string;
	/** `Place Viewer`. */
	name: string;
	/** Its own semver, apart from Roswaal's. */
	version: string;
	/** Preview while it may still change shape; Stable once it will not. */
	maturity: "preview" | "stable";
	/** One line on what it does. */
	description: string;
	/** What turning it off costs and keeps, under its switch. */
	offNote: string;
	/** Whether it is on in a browser that has never said. */
	defaultOn: boolean;
	/** The `Preferences` field its switch was kept in before it was an extension. */
	legacyOn?: string;
	/** What it adds to the editor, for its page to list. */
	adds: readonly ExtensionAddition[];
	/** Its pages in Settings, under its own. */
	pages: readonly ExtensionPage[];
	/** Its releases, newest first. */
	releases: readonly ExtensionRelease[];
	/** What it does with the daemon's events, by event name. */
	events?: Readonly<Record<string, (data: unknown) => void>>;
	/** The extension itself. */
	load(): Promise<Module>;
}
