/**
 * Work for the GPU handed over a little at a time.
 *
 * A place's textures arrive together -- its materials, its Decals' images, its
 * Sky -- and uploading them all in one go held the page for as long as that
 * took. Jobs here run in turn, as many as fit in `budget` milliseconds, and
 * the rest wait for the next frame, so input and panels are answered between.
 * A job may be async; the next starts once it has settled.
 */
export interface Trickle {
	add(job: () => unknown): void;
	/** Jobs not yet run. */
	readonly waiting: number;
}

export function trickle({
	budget = 8,
	later = (run: () => void) => requestAnimationFrame(() => run()),
	now = () => performance.now(),
}: {
	budget?: number;
	/** Calls `run` at the next turn: the next frame, by default. */
	later?: (run: () => void) => void;
	now?: () => number;
} = {}): Trickle {
	const queue: (() => unknown)[] = [];
	let running = false;
	const drain = async () => {
		running = true;
		while (queue.length > 0) {
			const start = now();
			do {
				const job = queue.shift() as () => unknown;
				try {
					await job();
				} catch {
					// One job's failure is its own: the rest still run.
				}
			} while (queue.length > 0 && now() - start < budget);
			if (queue.length > 0) await new Promise<void>((resolve) => later(resolve));
		}
		running = false;
	};
	return {
		add(job) {
			queue.push(job);
			if (!running) void drain();
		},
		get waiting() {
			return queue.length;
		},
	};
}
