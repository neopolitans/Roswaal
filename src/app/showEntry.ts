/**
 * Asking the Project panel to show a file or folder: unfold the heading and
 * the folders above it, select it, and scroll it into view.
 *
 * An event rather than a prop, because the asker -- a path chip in the map
 * editor -- sits in the centre of the window, far from the panel, and wants
 * nothing back.
 */

export const SHOW_ENTRY = "roswaal:show-entry";

export function showEntry(path: string): void {
	window.dispatchEvent(new CustomEvent<string>(SHOW_ENTRY, { detail: path }));
}
