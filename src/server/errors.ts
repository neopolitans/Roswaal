/**
 * The errors the project layer throws on purpose, and the one answer both
 * hosts give for any error at all.
 *
 * The rule is STYLE.md's: a known problem is 4xx, and anything unexpected is
 * 500. "Known" has to be written down somewhere a host can test for it, or
 * every error looks like the caller's fault -- which is what answering 400 for
 * everything did, and why a bug in Roswaal read in the editor as a mistake in
 * the request. This is where it is written down.
 */

import { errorMessage } from "../core/errorMessage.js";
import { LuauParseError } from "../core/luauData.js";
import { RbxError } from "../core/rbx/dom.js";
import { ZipError } from "../core/unzip.js";

/**
 * A mistake in what was asked: a name that is taken, a path outside the
 * project, a file of the wrong kind. Answered 400 with its message, which is
 * written for the person who asked.
 */
export class UserError extends Error {
	override name = "UserError";
}

/** Fields an error answer may carry beside its message, for a client to act on. */
export interface ErrorDetails {
	/** A stable name for the problem, for a client that does something about it. */
	code?: string;
	/** `project-changed`: the project the daemon is serving now. */
	root?: string;
	/** `not-a-project`: the folder or archive that was not one. */
	name?: string;
}

/** What every error answer looks like, on the daemon and in the web worker. */
export interface ErrorBody extends ErrorDetails {
	error: string;
}

/** An error that knows the HTTP status it should be answered with. */
export class HttpError extends Error {
	override name = "HttpError";

	constructor(
		readonly status: number,
		message: string,
		readonly details: ErrorDetails = {},
	) {
		super(message);
	}
}

export { errorMessage };

/**
 * Filesystem codes that describe the request rather than the machine: asking
 * for a file that is not there, or making one that already is.
 */
const REQUEST_CODES: Readonly<Record<string, number>> = {
	ENOENT: 404,
	EEXIST: 409,
	ENOTDIR: 400,
	EISDIR: 400,
	ENOTEMPTY: 409,
	EINVAL: 400,
};

/**
 * The status and body for an error, whichever host is answering.
 *
 * Known problems keep their own status: an `HttpError` its own, a
 * `UserError` 400, a file that is not what it claims to be -- a place, a pack,
 * JSON that will not parse, or a zip it cannot read -- 422, and a filesystem refusal its matching 4xx.
 * Anything else is a bug and answers 500.
 */
export function errorResponse(err: unknown): { status: number; body: ErrorBody } {
	const error = errorMessage(err);
	if (err instanceof HttpError) return { status: err.status, body: { error, ...err.details } };
	if (err instanceof UserError) return { status: 400, body: { error } };
	if (err instanceof RbxError || err instanceof ZipError || err instanceof LuauParseError || err instanceof SyntaxError) {
		return { status: 422, body: { error } };
	}
	const code = (err as { code?: unknown } | null)?.code;
	if (typeof code === "string" && REQUEST_CODES[code] !== undefined) {
		return { status: REQUEST_CODES[code], body: { error, code } };
	}
	return { status: 500, body: { error } };
}
