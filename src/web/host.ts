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

export const fs: ProjectFs = volume;

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
