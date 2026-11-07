/**
 * The camera's fly speed, as a multiple of its walk: what Shift+scroll and the
 * bar's Speed field both set, kept to the same limits.
 */

export const SPEED_MIN = 0.05;
export const SPEED_MAX = 50;
/** The field's step: a twentieth, the same as its least. */
export const SPEED_STEP = 0.05;
/** What a notch of Shift+scroll multiplies the speed by, or divides it by. */
export const SPEED_NOTCH = 1.25;

/** A speed within the limits. */
export function clampSpeed(speed: number): number {
	return Math.max(SPEED_MIN, Math.min(SPEED_MAX, speed));
}

/** A speed as the field shows it: to two places at most, with no trailing noughts. */
export function speedText(speed: number): string {
	return String(Number(speed.toFixed(2)));
}

/**
 * What the field's text sets the speed to: null while it is not yet a speed
 * worth taking, empty or nought, as it is halfway through typing.
 */
export function readSpeed(text: string): number | null {
	if (text.trim() === "") return null;
	const n = Number(text);
	if (!Number.isFinite(n) || n <= 0) return null;
	return clampSpeed(n);
}
