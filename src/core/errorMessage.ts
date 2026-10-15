/**
 * The message of anything thrown.
 *
 * In core because every host and the editor need it, and `(err as Error).message`
 * is wrong whenever something throws a string or an object.
 */

/** The message of anything thrown, which is not always an `Error`. */
export function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/**
 * Whether `err` is the engine running out of stack: a `RangeError` in V8 and
 * Safari, an `InternalError` ("too much recursion") in Firefox.
 *
 * The parser and the compiler limit how deep they go, so this is the guard
 * behind those limits: a reader of Luau or a graph that still recurses too far
 * says so as a problem rather than throwing out of a check or a compile.
 */
export function isStackOverflow(err: unknown): boolean {
	if (err instanceof RangeError) return /call stack/i.test(err.message);
	return err instanceof Error && err.name === "InternalError" && /recursion/i.test(err.message);
}
