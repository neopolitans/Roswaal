/**
 * What the project layer runs on, bound to Node.
 *
 * **This is the swap point.** `project.ts` and `manifest.ts` import their
 * filesystem, their path arithmetic and their formatter from here and from
 * nowhere else, so pointing this one module somewhere else moves the whole
 * project layer somewhere else. The web build does exactly that — see
 * `src/web/host.ts`, and the `roswaalWebHost` plugin in `vite.config.ts` that
 * substitutes it.
 *
 * It is re-exports rather than anything cleverer on purpose. There is no
 * registry to initialise, no `install()` for an entry point to forget, and no
 * mutable binding that could be read before it is set: which host a bundle got
 * is decided when the bundle is built, and a module graph that reaches
 * `node:fs` is a module graph that was built for Node.
 *
 * The one thing the filesystem does besides Node's own is keep to the
 * project: see `confined` below.
 */

import nodeFs from "node:fs/promises";
import nodePath from "node:path";

import { confinedRoots } from "./confine.js";
import { UserError } from "./errors.js";
import type { Formatter, ProjectFs, ProjectPath } from "./filesystem.js";
import { formatLuau as styluaFormatter } from "./format.js";

/** True when `abs` is `folder` or somewhere beneath it, by spelling. */
function within(abs: string, folder: string): boolean {
	const rel = nodePath.relative(folder, abs);
	return rel === "" || (!rel.startsWith("..") && !nodePath.isAbsolute(rel));
}

/** The innermost project root `target` is under, by spelling, if any. */
function rootOf(target: string): string | undefined {
	const abs = nodePath.resolve(target);
	let best: string | undefined;
	for (const root of confinedRoots()) {
		if (within(abs, root) && (best === undefined || root.length > best.length)) best = root;
	}
	return best;
}

/**
 * Refuses `target` if, on disk, it leads out of the project it is spelled
 * inside: through a symbolic link anywhere along it, or to a link whose end is
 * missing. A path that does not exist yet is judged by the nearest folder
 * above it that does, so a write cannot land through a linked folder either.
 *
 * Links that stay inside the project are followed as ever. A path under no
 * project -- the folder somebody is choosing to open -- is not this check's.
 *
 * `own` is for removing something: the link itself may go, since that removes
 * only the link, but nothing goes *through* one.
 */
async function confined(target: string, own = false): Promise<void> {
	const root = rootOf(target);
	if (root === undefined) return;
	const realRoot = await nodeFs.realpath(root).catch(() => null);
	// No root on disk: whatever was asked for fails on its own.
	if (realRoot === null) return;
	const shown = nodePath.relative(root, nodePath.resolve(target)) || ".";
	let at = nodePath.resolve(own ? nodePath.dirname(target) : target);
	for (;;) {
		const found = await nodeFs.lstat(at).catch(() => null);
		if (found) {
			const real = await nodeFs.realpath(at).catch(() => null);
			if (real === null) {
				throw new UserError(
					`${shown} goes through a link to something that is not there, so Roswaal will not use it.`,
				);
			}
			if (!within(real, realRoot)) {
				throw new UserError(
					`${shown} leads outside the project through a link, so Roswaal will not use it.`,
				);
			}
			return;
		}
		if (within(root, at) || at === nodePath.dirname(at)) return;
		at = nodePath.dirname(at);
	}
}

/**
 * Node's `fs`, keeping to the project.
 *
 * Typed as the interface rather than inferred, so the check runs both ways:
 * Node's own `fs` has to satisfy what the project layer asks for, and the
 * project layer cannot quietly start using something the memory volume has
 * never heard of.
 */
export const fs: ProjectFs = {
	stat: async (target) => (await confined(target), nodeFs.stat(target)),
	readFile: (async (target: string, encoding?: "utf8") => {
		await confined(target);
		return encoding ? nodeFs.readFile(target, encoding) : nodeFs.readFile(target);
	}) as ProjectFs["readFile"],
	writeFile: (async (target: string, data: string | Uint8Array, encoding?: "utf8") => {
		await confined(target);
		return encoding ? nodeFs.writeFile(target, data, encoding) : nodeFs.writeFile(target, data);
	}) as ProjectFs["writeFile"],
	mkdir: async (target, options) => (await confined(target), nodeFs.mkdir(target, options)),
	readdir: (async (target: string, options?: { withFileTypes: true }) => {
		await confined(target);
		return options ? nodeFs.readdir(target, options) : nodeFs.readdir(target);
	}) as ProjectFs["readdir"],
	rm: async (target, options) => (await confined(target, true), nodeFs.rm(target, options)),
	access: async (target) => (await confined(target), nodeFs.access(target)),
	rename: async (from, to) => {
		await confined(from, true);
		await confined(to);
		return nodeFs.rename(from, to);
	},
	copyFile: async (from, to) => {
		await confined(from);
		await confined(to);
		return nodeFs.copyFile(from, to);
	},
};

export const path: ProjectPath = nodePath;

export const formatLuau: Formatter = styluaFormatter;
