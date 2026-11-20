/**
 * The project's place outline, held for naming the class at an Instance
 * node's path: what lets a path typed into one come out typed as the Part it
 * reaches rather than as any Instance.
 *
 * Kept whenever the DataModel browser reads the place, and read once in the
 * background when a project with a place opens, so a lookup never waits.
 */

import { useSyncExternalStore } from "react";

import {
	type InstanceNode,
	type InstanceOutline,
	indexFromOutline,
} from "../core/luau/instances.js";
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

/** The outline in hand, for a reference's picker; none until the place has been read. */
export function currentOutline(): PlaceOutline | null {
	return outline;
}

/**
 * The class at a root and path: the project's instances first, where the
 * project and the place are merged and the project wins (it is what Rojo
 * syncs in), then the place's own outline.
 */
export function placeClassAt(root: string, path: string): string | undefined {
	if (project) {
		const found = classAtPath(project, root, path);
		if (found) return found;
	}
	return outline ? classAtPath(outline, root, path) : undefined;
}

// -- The DataModel as the project knows it: the place, and what the node maps
// put there. What an Instance node's path is checked against and browsed in.

let project: InstanceOutline | null = null;
let index: InstanceNode | null = null;
const listeners = new Set<() => void>();

/** Reads the project's instances again: as a project opens, and when its tree changes. */
export function readInstances(): void {
	api
		.instances()
		.then(({ outline: read }) => {
			project = read;
			index = indexFromOutline(read);
		})
		.catch(() => {
			project = null;
			index = null;
		})
		.finally(() => {
			for (const listener of listeners) listener();
		});
}

/** The DataModel as the project knows it, for a component: drawn again when it is read again. */
export function useInstanceIndex(): InstanceNode | null {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		() => index,
		() => null,
	);
}
