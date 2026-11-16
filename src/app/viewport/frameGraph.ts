/**
 * The Rendering panel's frame-time graph: the last frames drawn, each its
 * interval since it was wanted and, where the browser times them, the GPU's
 * passes, kept in a ring the controller fills a frame at a time and the panel
 * draws a few times a second.
 */

/** Frames the graph holds: four seconds at 60 a second. */
export const FRAME_HISTORY = 240;

/** The guides drawn across the graph: a frame at 60 and at 30 a second. */
export const FRAME_GUIDES = [1000 / 60, 1000 / 30];

/** The heights the graph's top steps through, in milliseconds. */
const TOPS = [40, 80, 160, 320];

/** One frame: milliseconds, NaN for what was not timed. */
export interface FrameSample {
	interval: number;
	/** Of the page's time, issuing the frame. */
	page: number;
	shadows: number;
	scene: number;
	post: number;
}

export class FrameHistory {
	private readonly rows: Float32Array[];
	private next = 0;
	private filled = 0;
	/** Counts every frame added, so a reader knows when to draw again. */
	version = 0;

	constructor(readonly size = FRAME_HISTORY) {
		this.rows = Array.from({ length: 5 }, () => new Float32Array(size).fill(Number.NaN));
	}

	push(sample: FrameSample): void {
		const at = this.next;
		this.rows[0][at] = sample.interval;
		this.rows[1][at] = sample.page;
		this.rows[2][at] = sample.shadows;
		this.rows[3][at] = sample.scene;
		this.rows[4][at] = sample.post;
		this.next = (at + 1) % this.size;
		this.filled = Math.min(this.size, this.filled + 1);
		this.version++;
	}

	get length(): number {
		return this.filled;
	}

	/** The `i`th frame held, oldest first. */
	at(i: number): FrameSample {
		const k = (this.next - this.filled + i + this.size) % this.size;
		return {
			interval: this.rows[0][k],
			page: this.rows[1][k],
			shadows: this.rows[2][k],
			scene: this.rows[3][k],
			post: this.rows[4][k],
		};
	}

	/** Every frame held, oldest first. */
	samples(): FrameSample[] {
		return Array.from({ length: this.filled }, (_, i) => this.at(i));
	}

	clear(): void {
		for (const row of this.rows) row.fill(Number.NaN);
		this.next = 0;
		this.filled = 0;
		this.version++;
	}
}

/** A frame's GPU time, its passes added; NaN where not timed. */
export function gpuTotal(s: FrameSample): number {
	return s.shadows + s.scene + s.post;
}

/**
 * The graph's top, in milliseconds: the first step holding the slowest frame,
 * so a hitch shows whole and both guides show while frames are quick.
 */
export function graphTop(samples: readonly FrameSample[]): number {
	let most = 0;
	for (const s of samples) {
		for (const v of [s.interval, gpuTotal(s), s.page]) if (v > most) most = v;
	}
	return TOPS.find((top) => most <= top) ?? TOPS[TOPS.length - 1];
}

/** Where `ms` stands on a graph `height` high whose top is `top`: from its top edge, clamped. */
export function graphY(ms: number, top: number, height: number): number {
	const v = Number.isFinite(ms) ? Math.min(Math.max(ms, 0), top) : 0;
	return height - (v / top) * height;
}

/** A frame wanted within this many milliseconds of the last is one of a run: the view moving. */
export const FRAME_RUN = 50;

/**
 * The time between two frames, as the graph shows it: since the one before
 * while the view keeps drawing, so a slow frame while moving is a hitch; and
 * since it was wanted after the view was left idle, so the idle time is not.
 */
export function frameInterval(now: number, last: number, wanted: number): number {
	return Math.max(0, wanted - last <= FRAME_RUN ? now - last : now - wanted);
}
