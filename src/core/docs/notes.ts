/**
 * The heading a note carries: an icon and a word saying what kind it is.
 *
 * After Docusaurus's admonitions. The kind used to be only a coloured edge,
 * which said "this is set apart" and nothing about why -- so every note opened
 * with a bold sentence doing the job a label does in one word.
 *
 * In core so the editor's panel and the static site draw the same heading.
 */

import type { NoteKind } from "./site.js";

export const NOTE_LABELS: Record<NoteKind, string> = {
	info: "Info",
	good: "Tip",
	warn: "Warning",
	danger: "Danger",
};

/** 16px, stroked in the note's own colour. */
const ICONS: Record<NoteKind, string> = {
	info: '<circle cx="8" cy="8" r="6.5"/><path d="M8 7.2v3.8M8 4.9v.1"/>',
	good: '<path d="M5.6 10.4a4 4 0 1 1 4.8 0V12H5.6z"/><path d="M6.2 14.2h3.6"/>',
	warn: '<path d="M8 1.9 14.6 13.6H1.4z"/><path d="M8 6.4v3.2M8 11.6v.1"/>',
	danger:
		'<path d="M5.3 1.5h5.4l3.8 3.8v5.4l-3.8 3.8H5.3l-3.8-3.8V5.3z"/><path d="M8 4.9v3.8M8 11v.1"/>',
};

/** The heading's markup, identical in both renderers. */
export function noteHeadHtml(kind: NoteKind): string {
	return (
		`<p class="docs-note-head">` +
		`<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" ` +
		`stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
		`${ICONS[kind]}</svg>${NOTE_LABELS[kind]}</p>`
	);
}
