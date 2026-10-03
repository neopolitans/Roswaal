/**
 * Keeping the volume across a reload.
 *
 * The playground held everything in memory, so a refresh — or a tab restored by
 * the browser after a crash, or an accidental Ctrl+W — took the work with it.
 * Downloading a zip is the way out, but it is a thing you have to remember to
 * do, and the people most likely to lose an hour are the ones who did not know
 * there was anything to remember.
 *
 * The origin private filesystem is the store. It is per-origin and invisible to
 * the developer's own filesystem, which is the right shape for this: the
 * playground's project is not a project on their disk and should not pretend to
 * be one. Slice 5 is where the editor reaches a real directory.
 *
 * **The whole volume, as one document, debounced.** Not because it is elegant
 * but because it is the shape that cannot half-fail: a project is a few dozen
 * kilobytes of text, one write either lands or does not, and what comes back is
 * either a project or nothing. Mirroring file-by-file would be faster to write
 * and would eventually leave somebody with four of their six graphs.
 *
 * The store is an interface so the decisions here — when to write, what to do
 * when writing fails, what a missing document means — can be tested without a
 * browser. `opfsStore()` is the real one, and it is eleven lines.
 */

import { errorMessage } from "../server/errors.js";

import type { VolumeSnapshot } from "./volume.js";

/** Somewhere a document survives a reload. */
export interface SnapshotStore {
	read(): Promise<string | null>;
	write(text: string): Promise<void>;
	clear(): Promise<void>;
	/**
	 * Binary files -- a place, a model -- kept apart from the document.
	 *
	 * A place is megabytes, and the document is rewritten on every settled
	 * change; carrying the place in it would write megabytes each time a node
	 * moved. These are written only when a binary file changed. A store without
	 * them keeps text alone, as every store did before places came in.
	 */
	readBinaries?(): Promise<Record<string, Uint8Array>>;
	writeBinaries?(files: Record<string, Uint8Array>): Promise<void>;
}

/** What is written, so a future format can tell what it is reading. */
interface Document {
	format: 1;
	/** The version that wrote it, for a bug report rather than for logic. */
	version: string;
	/** Text files only: binaries are kept beside the document. */
	files: Record<string, string>;
	/**
	 * The directories, including the ones no file implies.
	 *
	 * `files` is keyed by path, so a directory with nothing in it cannot
	 * appear in it — and a folder somebody made and had not put anything in
	 * yet did not survive a reload. It came back as nothing at all, and the
	 * project that remembered it said "Not a directory".
	 *
	 * Optional, and absent on a document written before this: those restore
	 * exactly as they did, with the directories their files imply.
	 */
	dirs?: string[];
	/**
	 * Where the project sits on the volume: `/demo`, or `/<name>` for one
	 * that came in as a zip. Absent on a document written before import
	 * existed, which was always the demo's.
	 */
	root?: string;
}

/** What a restore hands back: the files, and the directories among them. */
export interface RestoredVolume {
	files: VolumeSnapshot;
	dirs: string[];
	root?: string;
	/** The volume's `binaryStamp`: a change says the binaries need writing. */
	binaryStamp?: number;
}

export interface Persistence {
	/** The stored project, or `null` when there is not one to restore. */
	restore(): Promise<RestoredVolume | null>;
	/**
	 * Says that the binaries now on the volume, at `binaryStamp`, are the ones
	 * the store already holds: the restore just mounted them.
	 *
	 * Without it the first write of a session took every binary to be new and
	 * wrote megabytes of place back over itself -- on the first settled edit,
	 * which is when a tab is often closed.
	 */
	restoredAt(binaryStamp: number): void;
	/** Notes that the volume changed. Writes settle rather than happening at once. */
	touch(snapshot: () => RestoredVolume): void;
	/** Finishes any pending write. */
	flush(): Promise<void>;
	/** Forgets the stored project and stops writing. For "start again". */
	forget(): Promise<void>;
	/** Set when the store refused, so the editor can say persistence is off. */
	readonly failure: string | null;
}

/**
 * How long a burst of writes settles for.
 *
 * Autosave already debounces in the editor, so this is the second one: the
 * quantum that matters is "the developer stopped doing things", not "a
 * keystroke happened". Long enough that dragging a node does not write the
 * project on every frame, short enough that closing the tab a moment after a
 * change keeps it.
 */
const SETTLE_MS = 400;

export function persistence(store: SnapshotStore, version: string): Persistence {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let pending: (() => RestoredVolume) | null = null;
	let writing: Promise<void> = Promise.resolve();
	let stopped = false;
	let failure: string | null = null;
	// The stamp the stored binaries match: set by a restore, and by each write
	// of them. Undefined until one or the other, when they are written on the
	// first write.
	let writtenStamp: number | undefined;
	// Whether the restore read the stored binaries, so they can be trusted as written.
	let binariesRestored = false;

	async function writeNow(): Promise<void> {
		const take = pending;
		pending = null;
		if (!take || stopped) return;

		const taken = take();
		const text: Record<string, string> = {};
		const binaries: Record<string, Uint8Array> = {};
		for (const [at, contents] of Object.entries(taken.files)) {
			if (typeof contents === "string") text[at] = contents;
			else binaries[at] = contents;
		}
		const document: Document = {
			format: 1, version, files: text, dirs: taken.dirs,
			...(taken.root ? { root: taken.root } : {}),
		};
		try {
			await store.write(JSON.stringify(document));
			if (store.writeBinaries && (writtenStamp === undefined || taken.binaryStamp !== writtenStamp)) {
				await store.writeBinaries(binaries);
				writtenStamp = taken.binaryStamp;
			}
			failure = null;
		} catch (err) {
			// Reported once and then left alone. A quota that is full will be full
			// again in four hundred milliseconds, and a retry loop writing a whole
			// project each time is a good way to make a slow tab a stuck one.
			failure = errorMessage(err) || "The browser refused to store it.";
			stopped = true;
		}
	}

	// The stored binaries, or none -- and then they are written again on the first write.
	async function readBinaries(): Promise<Record<string, Uint8Array>> {
		if (!store.readBinaries) return {};
		try {
			const binaries = await store.readBinaries();
			binariesRestored = true;
			return binaries;
		} catch {
			// The text still restores; a place that would not read is written
			// again from the volume rather than trusted.
			return {};
		}
	}

	return {
		async restore() {
			try {
				const text = await store.read();
				if (text === null) return null;
				const parsed = JSON.parse(text) as Partial<Document>;
				// A document from a format nobody here understands is not a project.
				// Better to start from the demo than to mount half of something.
				if (parsed.format !== 1 || typeof parsed.files !== "object" || !parsed.files) {
					return null;
				}
				const binaries = await readBinaries();
				return {
					files: { ...parsed.files, ...binaries },
					// Absent on a document written before directories were kept.
					dirs: Array.isArray(parsed.dirs)
						? parsed.dirs.filter((at): at is string => typeof at === "string")
						: [],
					...(typeof parsed.root === "string" && parsed.root.startsWith("/")
						? { root: parsed.root }
						: {}),
				};
			} catch (err) {
				failure = errorMessage(err) || "The stored project could not be read.";
				return null;
			}
		},

		restoredAt(binaryStamp) {
			if (binariesRestored) writtenStamp = binaryStamp;
		},

		touch(snapshot) {
			if (stopped) return;
			pending = snapshot;
			if (timer !== null) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = null;
				writing = writing.then(writeNow);
			}, SETTLE_MS);
		},

		async flush() {
			if (timer !== null) {
				clearTimeout(timer);
				timer = null;
				writing = writing.then(writeNow);
			}
			await writing;
		},

		async forget() {
			// Stopped first, so a write already settling cannot put the project
			// back a moment after it was cleared.
			stopped = true;
			if (timer !== null) clearTimeout(timer);
			timer = null;
			pending = null;
			await writing;
			await store.clear();
		},

		get failure() {
			return failure;
		},
	};
}

/**
 * The origin private filesystem, as a single document and a set of binaries.
 *
 * Every call opens the directory again rather than holding a handle: this runs
 * a handful of times a minute at most, and a stored handle is a thing that can
 * go stale while a tab is asleep. `root` is there for a test to hand in a
 * directory of its own.
 */
export function opfsStore(
	name = "project.json",
	root: () => Promise<FileSystemDirectoryHandle> = () => navigator.storage.getDirectory(),
): SnapshotStore {
	return {
		async read() {
			try {
				return await readText(await root(), name);
			} catch {
				// Absent is the common case and not a failure: it is what a first
				// visit looks like. A refusal reads the same way here, and the
				// consequence — start from the demo — is the same.
				return null;
			}
		},

		async write(text) {
			await writeText(await root(), name, text);
		},

		async clear() {
			const directory = await root();
			for (const entry of [name, BINARIES_POINTER, ...(await binaryFolders(directory))]) {
				// Already gone is what clearing wants.
				await directory.removeEntry(entry, { recursive: true }).catch(() => undefined);
			}
		},

		async readBinaries() {
			const directory = await root();
			const out: Record<string, Uint8Array> = {};
			const current = await currentBinaries(directory);
			if (current === null) return out;
			const folder = await directory.getDirectoryHandle(current);
			for await (const handle of folder.values()) {
				if (handle.kind !== "file") continue;
				const file = await (handle as FileSystemFileHandle).getFile();
				out[decodeURIComponent(handle.name)] = new Uint8Array(await file.arrayBuffer());
			}
			return out;
		},

		/**
		 * Replaces the stored binaries as a set: a place that went must not come
		 * back on reload.
		 *
		 * Written into a new folder first, and swapped in by rewriting the small
		 * pointer file once every byte is down. Removing the old set before
		 * writing the new one left a window -- megabytes long, and exactly when
		 * a closing tab flushes -- in which the stored place was gone.
		 */
		async writeBinaries(files) {
			const directory = await root();
			let next: string | null = null;
			if (Object.keys(files).length > 0) {
				next = `${BINARIES}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
				const folder = await directory.getDirectoryHandle(next, { create: true });
				for (const [at, bytes] of Object.entries(files)) {
					const handle = await folder.getFileHandle(encodeURIComponent(at), { create: true });
					const writable = await handle.createWritable();
					await writable.write(bytes as BlobPart);
					await writable.close();
				}
			}
			await writeText(directory, BINARIES_POINTER, JSON.stringify({ folder: next }));
			// Only now is the old set unreferenced, and any set a write abandoned
			// before its swap with it.
			for (const folder of await binaryFolders(directory)) {
				if (folder === next) continue;
				// Left behind is only space; the pointer no longer names it.
				await directory.removeEntry(folder, { recursive: true }).catch(() => undefined);
			}
		},
	};
}

/** A small file's text, read whole. Rejects when it is not there. */
async function readText(directory: FileSystemDirectoryHandle, file: string): Promise<string> {
	const handle = await directory.getFileHandle(file);
	return (await handle.getFile()).text();
}

/** A small file, written whole: the browser commits it when the writable closes. */
async function writeText(directory: FileSystemDirectoryHandle, file: string, text: string): Promise<void> {
	const handle = await directory.getFileHandle(file, { create: true });
	const writable = await handle.createWritable();
	await writable.write(text);
	await writable.close();
}

/**
 * The folder holding the binaries now: the one the pointer names, or the
 * plain `binaries` folder a store written before the pointer existed has.
 */
async function currentBinaries(directory: FileSystemDirectoryHandle): Promise<string | null> {
	// No pointer is a store from before it, or one with no binaries yet.
	const pointer = await readText(directory, BINARIES_POINTER).catch(() => null);
	if (pointer !== null) {
		let named: unknown;
		try {
			named = (JSON.parse(pointer) as { folder?: unknown } | null)?.folder;
		} catch {
			// A pointer that will not parse names nothing; the next write replaces it.
			return null;
		}
		return typeof named === "string" ? named : null;
	}
	const legacy = await directory.getDirectoryHandle(BINARIES).then(() => true, () => false);
	return legacy ? BINARIES : null;
}

/** Every folder of binaries in the store, current or not. */
async function binaryFolders(directory: FileSystemDirectoryHandle): Promise<string[]> {
	const out: string[] = [];
	for await (const handle of directory.values()) {
		if (handle.kind === "directory" && (handle.name === BINARIES || handle.name.startsWith(`${BINARIES}-`))) {
			out.push(handle.name);
		}
	}
	return out;
}

/** The folders beside the document that hold binary files, one per file. */
const BINARIES = "binaries";

/** Names the folder of binaries in use, so a new set is swapped in by one small write. */
const BINARIES_POINTER = "binaries.json";
