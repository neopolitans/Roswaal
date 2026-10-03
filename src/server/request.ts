/**
 * Reading a request: its body's fields, its query parameters, and the 400 for
 * one that is missing or not what it should be.
 *
 * Shared by every route in `routes.ts`, so a missing argument is refused the
 * same way whichever route it was sent to.
 */

import type { WallyRealm } from "../core/wally.js";
import { HttpError } from "./errors.js";

/** A request, reduced to the two things any of these handlers reads. */
export interface RouteRequest {
	query?: Record<string, string | undefined>;
	body?: unknown;
}

/** The request body's fields, any of which may be missing. */
export function fields<T>(req: RouteRequest): Partial<T> {
	const body = req.body;
	return (typeof body === "object" && body !== null ? body : {}) as Partial<T>;
}

/**
 * A field the route cannot do without, or a 400 naming it.
 *
 * `hint` is what the caller is told instead of the bare name, where a sentence
 * says more: "Which package? Pass its `spec`, scope/name."
 */
export function need<T>(value: T | null | undefined, name: string, hint?: string): T {
	if (value === undefined || value === null || value === "") {
		throw new HttpError(400, hint ?? `Missing "${name}".`);
	}
	return value;
}

/** A value that is text, or undefined when it is anything else. */
export function text(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

/** A required query parameter, or a 400 naming it. */
export function query(req: RouteRequest, name: string): string {
	return need(text(req.query?.[name]), name);
}

/** An optional query parameter, which must be one of `allowed` when it is given. */
export function optionalQuery<T extends string>(req: RouteRequest, name: string, allowed: readonly T[]): T | undefined {
	const value = req.query?.[name];
	if (value === undefined || value === "") return undefined;
	if (!(allowed as readonly string[]).includes(value)) {
		throw new HttpError(400, `"${name}" is ${allowed.join(" or ")}, not "${value}".`);
	}
	return value as T;
}

const REALMS: readonly WallyRealm[] = ["shared", "server", "dev"];

/** A Wally realm from a request, or undefined for the default; anything else is a 400. */
export function realmOf(value: unknown): WallyRealm | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value === "string" && (REALMS as readonly string[]).includes(value)) return value as WallyRealm;
	throw new HttpError(400, `"realm" is ${REALMS.join(", ")} or nothing, not "${String(value)}".`);
}
