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
