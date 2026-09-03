/**
 * Terminal styling, hand-rolled because it is thirty lines and a dependency
 * here would be the only thing the CLI needs at runtime.
 *
 * Colour is suppressed when stdout is not a TTY or NO_COLOR is set, so piping
 * `roswaal check` into another program gives it plain text.
 */

/** Built from a code point rather than written literally, so the source stays
 *  plain ASCII and no editor or transport can eat the escape. */
const ESC = String.fromCharCode(27);
const SGR_PATTERN = new RegExp(ESC + "\\[[0-9;]*m", "g");

const enabled =
	process.env.NO_COLOR === undefined &&
	process.env.TERM !== "dumb" &&
	process.stdout.isTTY === true;

function sgr(open: number, close: number) {
	const start = `${ESC}[${open}m`;
	const end = `${ESC}[${close}m`;
	return (text: string): string => (enabled ? `${start}${text}${end}` : text);
}

export const bold = sgr(1, 22);
/** Dim is a style, not a colour — worth remembering when reaching for grey. */
export const dim = sgr(2, 22);
export const red = sgr(31, 39);
export const green = sgr(32, 39);
export const yellow = sgr(33, 39);
export const blue = sgr(34, 39);
export const cyan = sgr(36, 39);

/** A boxed startup banner, so several terminals can be told apart at a glance. */
export function banner(lines: string[]): void {
	const width = Math.max(...lines.map(visibleLength));
	console.log(blue("┌" + "─".repeat(width + 2) + "┐"));
	for (const line of lines) {
		const pad = " ".repeat(width - visibleLength(line));
		console.log(`${blue("│")} ${line}${pad} ${blue("│")}`);
	}
	console.log(blue("└" + "─".repeat(width + 2) + "┘"));
}

/** Length without ANSI escapes, so padding lines up when colour is on. */
export function visibleLength(text: string): number {
	return text.replace(SGR_PATTERN, "").length;
}
