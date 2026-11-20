/**
 * Names Roswaal will not create, because Windows reads them as something else
 * (RAS-0013).
 *
 * - A device name, with or without an extension: `con.luau` is the console,
 *   not a file.
 * - A colon: `x.luau:hidden` is a second stream inside `x.luau`.
 * - A trailing dot or space: Windows drops them, so `src.` is `src`.
 * - On Windows, an 8.3 short name such as `SOURCE~1`, which can stand for a
 *   longer name beside it.
 *
 * Refused on every system for the first three, not only on Windows: a project
 * is shared, and a file named `con.luau` on a Mac cannot be checked out by a
 * teammate on Windows. Short names only mean something there.
 *
 * Pure, so both hosts and the tests ask the same question.
 */

const DEVICE = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)(\.|$)/i;
const SHORT_NAME = /^[^~.]{1,6}~[0-9]+(\.[^.]{0,3})?$/;

/** Why `name`, one step of a path, is not one Roswaal makes, or null when it is fine. */
export function nameProblem(name: string, windows: boolean): string | null {
	if (name === "" || name === "." || name === "..") return null;
	if (DEVICE.test(name))
		return `"${name}" is a name Windows keeps for a device. Give it another name.`;
	if (name.includes(":"))
		return `"${name}" has a colon, which Windows reads as a hidden stream. Give it another name.`;
	if (/[. ]$/.test(name))
		return `"${name}" ends in a dot or a space, which Windows drops. Give it another name.`;
	if (windows && SHORT_NAME.test(name))
		return `"${name}" is shaped like a Windows short name, which can stand for another file. Give it another name.`;
	return null;
}

/** The first problem with any step of `rel`, a path inside the project. */
export function pathProblem(rel: string, windows: boolean): string | null {
	for (const step of rel.split(/[\\/]/)) {
		const problem = nameProblem(step, windows);
		if (problem) return problem;
	}
	return null;
}

/**
 * A path as a case-insensitive file system sees it: lower case, and each
 * step without the trailing dots and spaces Windows drops. For guards that
 * refuse a place by its name, so `SRC/x` and `src./x` are refused as `src/x`.
 */
export function pathKey(rel: string): string {
	return rel
		.replace(/\\/g, "/")
		.split("/")
		.map((step) => (step === "." || step === ".." ? step : step.replace(/[. ]+$/, "")))
		.join("/")
		.toLowerCase();
}
