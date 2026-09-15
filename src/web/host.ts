/**
 * What the project layer runs on in a browser tab.
 *
 * The counterpart to `src/server/host.ts`, and the module the web build puts in
 * its place. Everything `project.ts` does to a project it does through these
 * three exports, so substituting them moves the project layer off the disk and
 * into a volume in memory without `project.ts` being aware of it.
 *
 * One volume per bundle, the way the daemon has one project open at a time. The
 * editor is a single window over a single project, and a registry of them would
 * be ceremony without a purpose here for the same reason it is there.
 */

import type { Formatter, ProjectFs, ProjectPath } from "../server/filesystem.js";

import { posixPath } from "./posixPath.js";
import { Volume } from "./volume.js";

/**
 * Exported by name as well as through `fs`, because the worker needs the
 * volume's own methods — mounting the starting project, and handing a finished
 * one back — which are not part of the filesystem interface.
 */
export const volume = new Volume();

/**
 * Which filesystem the project layer is actually talking to.
 *
 * The volume to begin with, and a folder on the developer's own disk once they
 * hand one over. `project.ts` imports `fs` once, at module load, so this cannot
 * be a reassignment — it is a delegate, and the binding it forwards to is what
 * changes.
 *
 * One at a time, deliberately. Two projects open at once would mean two
 * registries, two sets of packs and two answers to "which project is this
 * request about", which is the arrangement the daemon avoids by serving one
 * project and the reason it has a guard for tabs that disagree.
 */
let backing: ProjectFs = volume;

/** Points the project layer at a different filesystem. */
export function useFilesystem(next: ProjectFs): void {
	backing = next;
}

/** True while the project lives in memory rather than on somebody's disk. */
export function usingVolume(): boolean {
	return backing === volume;
}

export const fs: ProjectFs = {
	stat: (target) => backing.stat(target),
	readFile: (target, encoding) => backing.readFile(target, encoding),
	writeFile: (target, data, encoding) => backing.writeFile(target, data, encoding),
	mkdir: (target, options) => backing.mkdir(target, options),
	readdir: ((target: string, options?: { withFileTypes: true }) =>
		options ? backing.readdir(target, options) : backing.readdir(target)) as ProjectFs["readdir"],
	rm: (target, options) => backing.rm(target, options),
	access: (target) => backing.access(target),
	rename: (from, to) => backing.rename(from, to),
	copyFile: (from, to) => backing.copyFile(from, to),
};

export const path: ProjectPath = posixPath;

/**
 * Generated Luau, unformatted.
 *
 * stylua is a program, and there is nowhere to run one. The emitter's output is
 * correct either way — formatting is about making generated files look like the
 * rest of somebody's codebase, which is a thing that matters on disk, in a
 * repository, next to code a person wrote.
 */
export const formatLuau: Formatter = (_cwd, code) => code;
