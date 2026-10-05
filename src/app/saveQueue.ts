/**
 * Autosave, one pending write per file.
 *
 * Autosave used to live in an effect keyed to the document on screen, so its
 * timer belonged to the screen rather than to the file. Switching tabs inside
 * the pause cancelled the write and left the tab behind dirty with nothing
 * scheduled; closing it threw the edit away; leaving a node map for anything
 * else did the same to the map.
 *
 * Here a write belongs to its path. It keeps its timer whatever the screen
 * does next, a newer edit to the same file replaces it, and only two things
 * cancel it: the file being deleted, and the project going away.
 *
 * Writes to one path run one at a time, in order, so a slow write cannot land
 * after a newer one and put the older graph back.
 */

/** A write, ready to run. Rejects when it failed. */
export type Write = () => Promise<void>;

interface Pending {
	write: Write;
	timer: ReturnType<typeof setTimeout>;
}

export class SaveQueue {
	private pending = new Map<string, Pending>();
	private running = new Map<string, Promise<void>>();

	/**
	 * @param delay how long a file is left alone before it is written, read on
	 *   every edit so a changed preference applies at once
	 * @param failed told about a write that failed when nobody was waiting on
	 *   it; one asked for by `flush` rejects there instead
	 */
	constructor(
		private readonly delay: () => number,
		private readonly failed: (error: Error) => void,
	) {}

	/** Writes `path` after the pause, replacing whatever was waiting for it. */
	put(path: string, write: Write): void {
		const waiting = this.pending.get(path);
		if (waiting) clearTimeout(waiting.timer);
		const timer = setTimeout(() => {
			this.flush(path).catch((error: Error) => this.failed(error));
		}, this.delay());
		this.pending.set(path, { write, timer });
	}

	/** True while anything is waiting or being written. */
	busy(): boolean {
		return this.pending.size > 0 || this.running.size > 0;
	}

	/** True while a write to `path` is waiting or being written. */
	has(path: string): boolean {
		return this.pending.has(path) || this.running.has(path);
	}

	/** Writes `path` now, if anything is waiting for it, and waits for it to land. */
	flush(path: string): Promise<void> {
		const waiting = this.pending.get(path);
		if (waiting) {
			clearTimeout(waiting.timer);
			this.pending.delete(path);
		}
		const before = this.running.get(path) ?? Promise.resolve();
		if (!waiting) return before;

		const run = before.then(waiting.write);
		// What the next write to this path waits for: that this one has
		// finished, not that it worked. Its failure is reported once, by
		// whoever started it.
		const settled: Promise<void> = run
			.catch(() => undefined)
			.finally(() => {
				if (this.running.get(path) === settled) this.running.delete(path);
			});
		this.running.set(path, settled);
		return run;
	}

	/** Writes everything at or under `prefix`: before a move, so the file that moves is current. */
	async flushUnder(prefix: string): Promise<void> {
		for (const path of [...this.pending.keys(), ...this.running.keys()]) {
			if (isUnder(path, prefix)) await this.flush(path);
		}
	}

	/** Writes everything, and rejects with the first failure after trying them all. */
	async flushAll(): Promise<void> {
		const paths = new Set([...this.pending.keys(), ...this.running.keys()]);
		const results = await Promise.allSettled([...paths].map((path) => this.flush(path)));
		const failure = results.find((result) => result.status === "rejected");
		if (failure) throw (failure as PromiseRejectedResult).reason;
	}

	/**
	 * Forgets what is waiting at or under `prefix` without writing it: for a
	 * file that has just been deleted, which a late write would bring back.
	 * `""` forgets everything.
	 */
	drop(prefix: string): void {
		for (const [path, waiting] of this.pending) {
			if (prefix === "" || isUnder(path, prefix)) {
				clearTimeout(waiting.timer);
				this.pending.delete(path);
			}
		}
	}
}

function isUnder(path: string, prefix: string): boolean {
	return path === prefix || path.startsWith(`${prefix}/`);
}
