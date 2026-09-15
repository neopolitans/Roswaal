/**
 * A Roswaal project held in memory, shaped like a filesystem.
 *
 * This is what the hosted editor compiles against. It implements the slice of
 * `node:fs/promises` that `src/server/filesystem.ts` declares, faithfully
 * enough that `project.ts` cannot tell the difference — which is the point of
 * the exercise. The tree walk, the pack loader, the orphan sweep and the
 * hand-edit guard all run here unchanged, so the playground enforces the same
 * rules about what Roswaal owns as the daemon does.
 *
 * **Faithful where it is load-bearing, and only there.** Files are strings,
 * because every file Roswaal reads or writes is text. There are no modes, no
 * links, no timestamps and no watchers. What it does copy exactly is the
 * *failure* behaviour: `readFile` on a path that is not there rejects, `rm`
 * rejects unless told `force`, `writeFile` into a directory that does not exist
 * rejects. Those are the answers `project.ts` reads — most of its filesystem
 * calls end in `.catch(() => null)` and treat the rejection as the information
 * — so a volume that resolved where Node rejects would not fail, it would
 * quietly report an empty project.
 *
 * Errors carry Node's `code` and are worded the way Node words them, because
 * some of them reach the editor's status panel as text.
 */

import type { DirEntry, FileStat, ProjectFs } from "../server/filesystem.js";

import { dirname, resolve } from "./posixPath.js";

/** A whole volume as plain data: absolute posix path to file contents. */
export type VolumeSnapshot = Record<string, string>;

class VolumeError extends Error {
	constructor(readonly code: string, message: string) {
		super(message);
		this.name = "Error";
	}
}

const enoent = (call: string, target: string) =>
	new VolumeError("ENOENT", `ENOENT: no such file or directory, ${call} '${target}'`);
const eisdir = (call: string, target: string) =>
	new VolumeError("EISDIR", `EISDIR: illegal operation on a directory, ${call} '${target}'`);
const enotdir = (call: string, target: string) =>
	new VolumeError("ENOTDIR", `ENOTDIR: not a directory, ${call} '${target}'`);
const eexist = (call: string, target: string) =>
	new VolumeError("EEXIST", `EEXIST: file already exists, ${call} '${target}'`);

const FILE: FileStat = { isDirectory: () => false, isFile: () => true };
const DIRECTORY: FileStat = { isDirectory: () => true, isFile: () => false };

export class Volume implements ProjectFs {
	/** Absolute posix path to contents. Directories are not in here. */
	private readonly files = new Map<string, string>();
	/** Every directory that exists, including the ancestors of every file. */
	private readonly dirs = new Set<string>(["/"]);

	constructor(snapshot: VolumeSnapshot = {}) {
		this.mount(snapshot);
	}

	// -------------------------------------------------------------------------
	// Outside the filesystem interface: getting a project in and out
	// -------------------------------------------------------------------------

	/**
	 * Writes a snapshot in wholesale, making the directories it implies.
	 *
	 * How the playground gets its starting project: the demo is baked into the
	 * bundle as one of these at build time. Additive rather than replacing, so
	 * a caller can mount a project and then a second thing beside it.
	 */
	mount(snapshot: VolumeSnapshot): void {
		for (const [target, contents] of Object.entries(snapshot)) {
			const full = resolve(target);
			this.makeDirs(dirname(full));
			this.files.set(full, contents);
		}
	}

	/**
	 * Everything in the volume, for handing a project back to the developer who
	 * made it. Sorted, so two snapshots of the same project compare equal.
	 */
	snapshot(prefix = "/"): VolumeSnapshot {
		const root = resolve(prefix);
		const within = root === "/" ? "/" : root + "/";
		const out: VolumeSnapshot = {};
		for (const target of [...this.files.keys()].sort()) {
			if (target === root || target.startsWith(within)) out[target] = this.files.get(target)!;
		}
		return out;
	}

	/** Makes a directory and every ancestor it needs. */
	private makeDirs(target: string): void {
		let at = resolve(target);
		while (!this.dirs.has(at)) {
			this.dirs.add(at);
			const parent = dirname(at);
			if (parent === at) break;
			at = parent;
		}
	}

	/** Everything at or under a directory, the directory itself included. */
	private under(target: string): { files: string[]; dirs: string[] } {
		const within = target === "/" ? "/" : target + "/";
		return {
			files: [...this.files.keys()].filter((p) => p === target || p.startsWith(within)),
			dirs: [...this.dirs].filter((p) => p === target || p.startsWith(within)),
		};
	}

	// -------------------------------------------------------------------------
	// ProjectFs
	// -------------------------------------------------------------------------

	async stat(target: string): Promise<FileStat> {
		const full = resolve(target);
		if (this.files.has(full)) return FILE;
		if (this.dirs.has(full)) return DIRECTORY;
		throw enoent("stat", full);
	}

	async readFile(target: string, _encoding: "utf8"): Promise<string> {
		const full = resolve(target);
		const contents = this.files.get(full);
		if (contents !== undefined) return contents;
		throw this.dirs.has(full) ? eisdir("read", full) : enoent("open", full);
	}

	async writeFile(target: string, data: string, _encoding: "utf8"): Promise<void> {
		const full = resolve(target);
		if (this.dirs.has(full)) throw eisdir("open", full);
		// Node will not create the parent for you, and neither will this: every
		// writer in `project.ts` mkdirs first, and the one that stops doing so
		// should find out here rather than by writing into nowhere.
		const parent = dirname(full);
		if (!this.dirs.has(parent)) throw enoent("open", full);
		this.files.set(full, data);
	}

	async mkdir(target: string, options: { recursive: boolean }): Promise<string | undefined> {
		const full = resolve(target);
		if (this.files.has(full)) throw eexist("mkdir", full);
		if (this.dirs.has(full)) {
			if (options.recursive) return undefined;
			throw eexist("mkdir", full);
		}
		if (!options.recursive && !this.dirs.has(dirname(full))) throw enoent("mkdir", full);
		this.makeDirs(full);
		return full;
	}

	async readdir(target: string): Promise<string[]>;
	async readdir(target: string, options: { withFileTypes: true }): Promise<DirEntry[]>;
	async readdir(
		target: string, options?: { withFileTypes: true },
	): Promise<string[] | DirEntry[]> {
		const full = resolve(target);
		if (this.files.has(full)) throw enotdir("scandir", full);
		if (!this.dirs.has(full)) throw enoent("scandir", full);

		const within = full === "/" ? "/" : full + "/";
		const names = new Map<string, boolean>();
		const collect = (paths: Iterable<string>, isDirectory: boolean) => {
			for (const path of paths) {
				if (path === full || !path.startsWith(within)) continue;
				const rest = path.slice(within.length);
				const slash = rest.indexOf("/");
				// A nested path contributes its first segment, which is a directory
				// whether or not anything ever made it explicitly.
				names.set(slash === -1 ? rest : rest.slice(0, slash), slash === -1 ? isDirectory : true);
			}
		};
		collect(this.files.keys(), false);
		collect(this.dirs, true);

		// Sorted, where Node's order is the filesystem's. Everything in
		// `project.ts` that cares sorts for itself; the rest gets to be
		// reproducible for free.
		const sorted = [...names.entries()].sort((a, b) => a[0].localeCompare(b[0]));
		if (!options?.withFileTypes) return sorted.map(([name]) => name);
		return sorted.map(([name, isDirectory]) => ({
			name,
			isDirectory: () => isDirectory,
			isFile: () => !isDirectory,
		}));
	}

	async rm(target: string, options: { recursive?: boolean; force?: boolean } = {}): Promise<void> {
		const full = resolve(target);
		const isFile = this.files.has(full);
		const isDir = this.dirs.has(full);

		if (!isFile && !isDir) {
			if (options.force) return;
			throw enoent("unlink", full);
		}
		if (isFile) {
			this.files.delete(full);
			return;
		}
		if (!options.recursive) throw eisdir("rm", full);

		const { files, dirs } = this.under(full);
		for (const path of files) this.files.delete(path);
		for (const path of dirs) this.dirs.delete(path);
	}

	async access(target: string): Promise<void> {
		const full = resolve(target);
		if (!this.files.has(full) && !this.dirs.has(full)) throw enoent("access", full);
	}

	async rename(from: string, to: string): Promise<void> {
		const source = resolve(from);
		const dest = resolve(to);
		if (source === dest) return;

		if (this.files.has(source)) {
			if (!this.dirs.has(dirname(dest))) throw enoent("rename", dest);
			this.files.set(dest, this.files.get(source)!);
			this.files.delete(source);
			return;
		}
		if (!this.dirs.has(source)) throw enoent("rename", source);

		// A directory moves with everything under it, which is what makes
		// dragging a folder in the tree work.
		const { files, dirs } = this.under(source);
		this.makeDirs(dest);
		for (const path of files) {
			this.files.set(dest + path.slice(source.length), this.files.get(path)!);
			this.files.delete(path);
		}
		for (const path of dirs) {
			if (path === source) continue;
			this.dirs.add(dest + path.slice(source.length));
			this.dirs.delete(path);
		}
		this.dirs.delete(source);
	}

	async copyFile(from: string, to: string): Promise<void> {
		const source = resolve(from);
		const dest = resolve(to);
		const contents = this.files.get(source);
		if (contents === undefined) throw enoent("copyfile", source);
		if (!this.dirs.has(dirname(dest))) throw enoent("copyfile", dest);
		this.files.set(dest, contents);
	}
}
