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

import { constants as fsConstants } from "node:fs";
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
 * Not following a link at the end of a path, where the system has the flag:
 * macOS and Linux. Windows has no such flag; there a link at the end is caught
 * by the check after opening, below.
 */
const NO_FOLLOW = fsConstants.O_NOFOLLOW ?? 0;

/**
 * Opens a file inside the project, closing the gap between checking where a
 * path leads and using it (F3).
 *
 * `confined` checks the path, and then the file is opened -- and a program on
 * this computer that swapped a folder along it for a link in between could
 * have it open something outside the project. So the file is opened without
 * following a link at its end, then the path is checked again, and the file
 * that was opened has to be the very one the path now leads to: the same
 * device and the same file number. A swap and a swap back between the two
 * checks is the window left, which Node gives no way to close. A file opened
 * to be written is not emptied until all of that has passed, so a lost race
 * cannot empty a file outside the project.
 */
async function openConfined(target: string, flags: number): Promise<nodeFs.FileHandle> {
	await confined(target);
	// Opened at where the path leads now, so a link inside the project is still
	// followed; a link appearing at that place after this is not.
	const real = await whereItLeads(target);
	let handle: nodeFs.FileHandle;
	try {
		handle = await nodeFs.open(real, flags | NO_FOLLOW, 0o666);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ELOOP") throw changedWhileOpening(target);
		throw err;
	}
	try {
		await confined(target);
		const [opened, now] = await Promise.all([handle.stat(), nodeFs.stat(target)]);
		if (opened.dev !== now.dev || opened.ino !== now.ino) throw changedWhileOpening(target);
		return handle;
	} catch (err) {
		await handle.close();
		throw err;
	}
}

/** The real path `target` leads to; for a file not made yet, its real folder and its name. */
async function whereItLeads(target: string): Promise<string> {
	try {
		return await nodeFs.realpath(target);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
		return nodePath.join(
			await nodeFs.realpath(nodePath.dirname(target)),
			nodePath.basename(target),
		);
	}
}

function changedWhileOpening(target: string): UserError {
	const root = rootOf(target);
	const shown = root ? nodePath.relative(root, nodePath.resolve(target)) : target;
	return new UserError(`${shown} changed while it was being opened, so Roswaal will not use it.`);
}

/**
 * Node's `fs`, keeping to the project.
 *
 * Reading and writing a file go through `openConfined`. The rest -- making a
 * folder, renaming, removing -- have no form in Node that works on something
 * already opened, so they check and then act.
 *
 * Typed as the interface rather than inferred, so the check runs both ways:
 * Node's own `fs` has to satisfy what the project layer asks for, and the
 * project layer cannot quietly start using something the memory volume has
 * never heard of.
 */
export const fs: ProjectFs = {
	stat: async (target) => (await confined(target), nodeFs.stat(target)),
	readFile: (async (target: string, encoding?: "utf8") => {
		const handle = await openConfined(target, fsConstants.O_RDONLY);
		try {
			return encoding ? await handle.readFile(encoding) : await handle.readFile();
		} finally {
			await handle.close();
		}
	}) as ProjectFs["readFile"],
	writeFile: (async (target: string, data: string | Uint8Array, encoding?: "utf8") => {
		// Created if it is not there, but not emptied until openConfined has passed it.
		const handle = await openConfined(target, fsConstants.O_WRONLY | fsConstants.O_CREAT);
		try {
			await handle.truncate(0);
			if (encoding) await handle.writeFile(data, encoding);
			else await handle.writeFile(data);
		} finally {
			await handle.close();
		}
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
