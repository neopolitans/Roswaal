/**
 * The project's place outline, held for naming the class at an Instance
 * node's path: what lets a path typed into one come out typed as the Part it
 * reaches rather than as any Instance.
 *
 * Kept whenever the DataModel browser reads the place, and read once in the
 * background when a project with a place opens, so a lookup never waits.
 */

import { classAtPath, type PlaceOutline } from "../core/rbx/browse.js";
import { api } from "./api.js";

let outline: PlaceOutline | null = null;

/** The outline as last read, or none: a project without a place, or another project. */
export function rememberOutline(next: PlaceOutline | null): void {
	outline = next;
}

/** Reads the outline in the background; a place that cannot be read leaves none. */
export function readOutline(): void {
	api
		.place()
		.then((answer) => rememberOutline(answer.file === null ? null : answer.outline))
		.catch(() => rememberOutline(null));
}

/** The class the place holds at a root and path, from the outline in hand. */
export function placeClassAt(root: string, path: string): string | undefined {
	return outline ? classAtPath(outline, root, path) : undefined;
}
