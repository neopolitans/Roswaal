/**
 * A `ProjectFs` over a folder on the developer's actual disk.
 *
 * This is the one that stops the hosted editor being a demonstration. The
 * volume in memory proves the project layer does not need a disk; this gives it
 * *their* disk, through the File System Access API, with nothing installed.
 * Roswaal writes the `.luau` where Rojo is already watching for it.
 *
 * **Every call is real. Nothing is cached.** A cache would be faster and would
 * need invalidating, and there is nothing here to invalidate from: the API has
 * no change notification at all, so a branch switch or a `git pull` happens
 * silently underneath. The daemon has a watcher for exactly that; this has
 * nothing, and a stale cache would mean compiling a graph that is no longer on
 * disk and reporting that it worked. Slow and right beats fast and lying, and
 * if it turns out to be too slow that is a thing to measure rather than guess.
 *
 * Paths are posix and rooted at the folder's own name — `/my-game/src/...` —
 * so what the editor shows as the project root is what the developer called the
 * folder rather than an invented mount point.
 */

import type { DirEntry, FileStat, ProjectFs } from "../server/filesystem.js";

import { resolve } from "./posixPath.js";

const FILE: FileStat = { isDirectory: () => false, isFile: () => true };
const DIRECTORY: FileStat = { isDirectory: () => true, isFile: () => false };

class DirectoryError extends Error {
	constructor(
		readonly code: string,
		message: string,
	) {
		super(message);
		this.name = "Error";
	}
}

const enoent = (call: string, target: string) =>
	new DirectoryError("ENOENT", `ENOENT: no such file or directory, ${call} '${target}'`);
const eisdir = (call: string, target: string) =>
	new DirectoryError("EISDIR", `EISDIR: illegal operation on a directory, ${call} '${target}'`);

export class DirectoryFs implements ProjectFs {
	/**
	 * @param root the picked folder
	 * @param mount where it appears, which is `/` plus the folder's own name
	 */
	constructor(
		private readonly root: FileSystemDirectoryHandle,
		readonly mount: string,
	) {}

	/** The path's segments below the mount, or null when it escapes it. */
	private segments(target: string): string[] | null {
		const full = resolve(target);
		if (full === this.mount) return [];
		if (!full.startsWith(this.mount + "/")) return null;
		return full
			.slice(this.mount.length + 1)
			.split("/")
			.filter((part) => part !== "");
	}

	/** Walks to the directory holding a path, without creating anything. */
	private async parentOf(
		target: string,
		create = false,
	): Promise<{ parent: FileSystemDirectoryHandle; name: string } | null> {
		const parts = this.segments(target);
		if (parts === null || parts.length === 0) return null;

		let at: FileSystemDirectoryHandle = this.root;
		for (const part of parts.slice(0, -1)) {
			const next = await at.getDirectoryHandle(part, { create }).catch(() => null);
			if (!next) return null;
			at = next;
		}
		return { parent: at, name: parts[parts.length - 1] };
	}

	private async directoryAt(target: string): Promise<FileSystemDirectoryHandle | null> {
		const parts = this.segments(target);
		if (parts === null) return null;

		let at: FileSystemDirectoryHandle = this.root;
		for (const part of parts) {
			const next = await at.getDirectoryHandle(part).catch(() => null);
			if (!next) return null;
			at = next;
		}
		return at;
	}

	private async fileAt(target: string): Promise<FileSystemFileHandle | null> {
		const found = await this.parentOf(target);
		if (!found) return null;
		return found.parent.getFileHandle(found.name).catch(() => null);
	}

	// -------------------------------------------------------------------------

	async stat(target: string): Promise<FileStat> {
		if (await this.fileAt(target)) return FILE;
		if (await this.directoryAt(target)) return DIRECTORY;
		throw enoent("stat", resolve(target));
	}

	async readFile(target: string, encoding: "utf8"): Promise<string>;
	async readFile(target: string): Promise<Uint8Array>;
	async readFile(target: string, encoding?: "utf8"): Promise<string | Uint8Array> {
		const handle = await this.fileAt(target);
		if (!handle) {
			const asDirectory = await this.directoryAt(target);
			throw asDirectory ? eisdir("read", resolve(target)) : enoent("open", resolve(target));
		}
		return readFresh(handle, (file) =>
			encoding === "utf8" ? file.text() : file.arrayBuffer().then((b) => new Uint8Array(b)),
		);
	}

	async writeFile(target: string, data: string, encoding: "utf8"): Promise<void>;
	async writeFile(target: string, data: Uint8Array): Promise<void>;
	async writeFile(target: string, data: string | Uint8Array, _encoding?: "utf8"): Promise<void> {
		const found = await this.parentOf(target);
		if (!found) throw enoent("open", resolve(target));
		const handle = await found.parent.getFileHandle(found.name, { create: true }).catch(() => null);
		if (!handle) throw enoent("open", resolve(target));

		const writable = await handle.createWritable();
		await writable.write(typeof data === "string" ? data : (data as BlobPart));
		await writable.close();
	}

	async mkdir(target: string, options: { recursive: boolean }): Promise<string | undefined> {
		const parts = this.segments(target);
		if (parts === null) throw enoent("mkdir", resolve(target));
		if (parts.length === 0) return undefined;

		let at = this.root;
		for (const [index, part] of parts.entries()) {
			const last = index === parts.length - 1;
			// Without `recursive`, only the final segment may be created; a missing
			// one above it is the error `mkdir` is supposed to give.
			const create = options.recursive || last;
			const next = await at.getDirectoryHandle(part, { create }).catch(() => null);
			if (!next) throw enoent("mkdir", resolve(target));
			at = next;
		}
		return resolve(target);
	}

	async readdir(target: string): Promise<string[]>;
	async readdir(target: string, options: { withFileTypes: true }): Promise<DirEntry[]>;
	async readdir(target: string, options?: { withFileTypes: true }): Promise<string[] | DirEntry[]> {
		const handle = await this.directoryAt(target);
		if (!handle) throw enoent("scandir", resolve(target));

		const found: { name: string; isDirectory: boolean }[] = [];
		for await (const entry of handle.values()) {
			found.push({ name: entry.name, isDirectory: entry.kind === "directory" });
		}
		// Sorted, as the memory volume is, so the two answer alike.
		found.sort((a, b) => a.name.localeCompare(b.name));

		if (!options?.withFileTypes) return found.map((entry) => entry.name);
		return found.map((entry) => ({
			name: entry.name,
			isDirectory: () => entry.isDirectory,
			isFile: () => !entry.isDirectory,
		}));
	}

	async rm(target: string, options: { recursive?: boolean; force?: boolean } = {}): Promise<void> {
		const found = await this.parentOf(target);
		if (!found) {
			if (options.force) return;
			throw enoent("unlink", resolve(target));
		}
		try {
			await found.parent.removeEntry(found.name, { recursive: options.recursive === true });
		} catch {
			if (options.force) return;
			// A directory refused for want of `recursive` reads as EISDIR, which is
			// what `deleteEntry` expects to see.
			if (await this.directoryAt(target)) throw eisdir("rm", resolve(target));
			throw enoent("unlink", resolve(target));
		}
	}

	async access(target: string): Promise<void> {
		await this.stat(target);
	}

	/**
	 * There is no rename in this API, so this is a copy and a delete.
	 *
	 * Not atomic, and a large folder is a slow move. Worth knowing rather than
	 * worth avoiding: it is what dragging a folder in the tree does, and the
	 * alternative is refusing an operation the tool has always had.
	 */
	async rename(from: string, to: string): Promise<void> {
		if (resolve(from) === resolve(to)) return;
		// Copying a folder into itself would find its own copy on every pass
		// and nest on the real disk until the browser gave up.
		if (resolve(to).startsWith(`${resolve(from)}/`)) {
			throw new DirectoryError(
				"EINVAL",
				`EINVAL: invalid argument, rename '${resolve(from)}' -> '${resolve(to)}'`,
			);
		}

		if (await this.fileAt(from)) {
			await this.copyFile(from, to);
			await this.rm(from);
			return;
		}
		if (!(await this.directoryAt(from))) throw enoent("rename", resolve(from));

		await this.copyTree(from, to);
		await this.rm(from, { recursive: true });
	}

	/** Bytes, not text: a project may hold a `.rbxm` or a PNG this must not touch. */
	async copyFile(from: string, to: string): Promise<void> {
		const source = await this.fileAt(from);
		if (!source) throw enoent("copyfile", resolve(from));

		const found = await this.parentOf(to);
		if (!found) throw enoent("copyfile", resolve(to));
		const handle = await found.parent.getFileHandle(found.name, { create: true }).catch(() => null);
		if (!handle) throw enoent("copyfile", resolve(to));

		const bytes = await readFresh(source, (file) => file.arrayBuffer());
		const writable = await handle.createWritable();
		await writable.write(bytes);
		await writable.close();
	}

	private async copyTree(from: string, to: string): Promise<void> {
		await this.mkdir(to, { recursive: true });
		for (const entry of await this.readdir(from, { withFileTypes: true })) {
			const source = `${resolve(from)}/${entry.name}`;
			const dest = `${resolve(to)}/${entry.name}`;
			if (entry.isDirectory()) await this.copyTree(source, dest);
			else await this.copyFile(source, dest);
		}
	}
}

/** Whether this browser can hand over a folder at all. Chrome and Edge can. */
export function canOpenDirectory(): boolean {
	return (
		typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function"
	);
}

/** Where a picked folder is mounted: its own name, so the editor shows that. */
export function mountFor(handle: FileSystemDirectoryHandle): string {
	const name = handle.name.replace(/[/\\]/g, "").trim();
	return "/" + (name === "" ? "project" : name);
}

/**
 * Reads a file, taking a fresh snapshot if the one in hand went stale.
 *
 * `getFile()` is a snapshot, and reading it after the file has been written
 * throws "the state had changed since it was read from disk". With Dynamic
 * compiling that is ordinary: an edit saves the graph and rewrites its Luau,
 * and a read of either can land between the snapshot and the bytes -- as can
 * any other program writing the same folder, a daemon serving it among them.
 * The file is fine; the snapshot is old. So the read is asked again, a few
 * times, before anything is reported, and the error that is reported is the
 * last real one.
 */
async function readFresh<T>(
	handle: FileSystemFileHandle,
	read: (file: File) => Promise<T>,
): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await read(await handle.getFile());
		} catch (error) {
			const stale =
				error instanceof DOMException &&
				(error.name === "InvalidStateError" || error.name === "NotReadableError");
			if (!stale || attempt >= 4) throw error;
			await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
		}
	}
}
