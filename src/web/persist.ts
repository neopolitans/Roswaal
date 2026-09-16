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

import type { VolumeSnapshot } from "./volume.js";

/** Somewhere a document survives a reload. */
export interface SnapshotStore {
	read(): Promise<string | null>;
	write(text: string): Promise<void>;
	clear(): Promise<void>;
}

/** What is written, so a future format can tell what it is reading. */
interface Document {
	format: 1;
	/** The version that wrote it, for a bug report rather than for logic. */
	version: string;
	files: VolumeSnapshot;
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
}

/** What a restore hands back: the files, and the directories among them. */
export interface RestoredVolume {
	files: VolumeSnapshot;
	dirs: string[];
}

export interface Persistence {
	/** The stored project, or `null` when there is not one to restore. */
	restore(): Promise<RestoredVolume | null>;
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

	async function writeNow(): Promise<void> {
		const take = pending;
		pending = null;
		if (!take || stopped) return;

		const taken = take();
		const document: Document = {
			format: 1, version, files: taken.files, dirs: taken.dirs,
		};
		try {
			await store.write(JSON.stringify(document));
			failure = null;
		} catch (err) {
			// Reported once and then left alone. A quota that is full will be full
			// again in four hundred milliseconds, and a retry loop writing a whole
			// project each time is a good way to make a slow tab a stuck one.
			failure = (err as Error).message || "The browser refused to store it.";
			stopped = true;
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
				return {
					files: parsed.files,
					// Absent on a document written before directories were kept.
					dirs: Array.isArray(parsed.dirs)
						? parsed.dirs.filter((at): at is string => typeof at === "string")
						: [],
				};
			} catch (err) {
				failure = (err as Error).message || "The stored project could not be read.";
				return null;
			}
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
 * The origin private filesystem, as a single document.
 *
 * Every call opens the directory again rather than holding a handle: this runs
 * a handful of times a minute at most, and a stored handle is a thing that can
 * go stale while a tab is asleep.
 */
export function opfsStore(name = "project.json"): SnapshotStore {
	async function directory(): Promise<FileSystemDirectoryHandle> {
		return navigator.storage.getDirectory();
	}

	return {
		async read() {
			try {
				const handle = await (await directory()).getFileHandle(name);
				return await (await handle.getFile()).text();
			} catch {
				// Absent is the common case and not a failure: it is what a first
				// visit looks like. A refusal reads the same way here, and the
				// consequence — start from the demo — is the same.
				return null;
			}
		},

		async write(text) {
			const handle = await (await directory()).getFileHandle(name, { create: true });
			const writable = await handle.createWritable();
			await writable.write(text);
			await writable.close();
		},

		async clear() {
			await (await directory()).removeEntry(name).catch(() => {});
		},
	};
}
