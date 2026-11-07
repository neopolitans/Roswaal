/**
 * When a touch control fades: a while after the last touch in its area lets
 * go, and never while one is held. A touch wakes it at once. The control
 * works the same faded, so the touch that wakes it is not wasted.
 */

/** How long a control sits untouched before it fades, in milliseconds. */
export const FADE_AFTER = 3000;

/** The timer a fader keeps, which a test can stand in for. */
export interface FadeTimers {
	set(run: () => void, ms: number): unknown;
	clear(handle: unknown): void;
}

export interface Fader {
	/** A touch in the area has come down: awake until it lets go. */
	down(id: number): void;
	/** A touch has let go or been cancelled: the wait starts once none is left. */
	up(id: number): void;
	/** Stops the wait, for when the control goes. */
	stop(): void;
}

const TIMERS: FadeTimers = {
	set: (run, ms) => setTimeout(run, ms),
	clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * A fader for one control's area. `show` hears only changes, faded or not;
 * the control starts awake and the wait starts at once.
 */
export function fader(
	show: (faded: boolean) => void,
	after = FADE_AFTER,
	timers: FadeTimers = TIMERS,
): Fader {
	const held = new Set<number>();
	let faded = false;
	let wait: unknown = null;
	const become = (now: boolean) => {
		if (now === faded) return;
		faded = now;
		show(now);
	};
	const cancel = () => {
		if (wait !== null) timers.clear(wait);
		wait = null;
	};
	const start = () => {
		cancel();
		wait = timers.set(() => {
			wait = null;
			if (held.size === 0) become(true);
		}, after);
	};
	start();
	return {
		down(id) {
			held.add(id);
			cancel();
			become(false);
		},
		up(id) {
			if (!held.delete(id) || held.size > 0) return;
			start();
		},
		stop: cancel,
	};
}
