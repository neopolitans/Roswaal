/**
 * What a local in hand-written code holds, as far as the code itself says.
 *
 * Not a type checker. It answers the questions completion and hover ask, from
 * what is written at the declaration and nothing further:
 *
 * - `local part: Part` — the written type.
 * - `local part = Instance.new("Part")`, `game:GetService("Players")`,
 *   `x:FindFirstChildOfClass("Humanoid")`, `thing :: Model` — the class the
 *   call or cast names.
 * - `local scores = { Anne = 500, ["James"] = 300 }` — the keys a table
 *   constructor writes, so `scores.` can offer them.
 *
 * Anything else is unknown, and unknown offers nothing: a guess at what a
 * value holds would be a completion list that lies.
 */

import type { Expr } from "./ast.js";
import { CLASSES } from "../robloxData.js";

export interface Held {
	/** A Roblox class the value is an instance of. */
	className?: string;
	/** The keys of a table written out in the declaration. */
	keys?: string[];
}

const CLASS_SET = new Set(CLASSES);
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Calls on an instance whose string argument names the class they return. */
const CLASS_METHODS = new Set([
	"GetService", "FindFirstChildOfClass", "FindFirstChildWhichIsA",
	"FindFirstAncestorOfClass", "FindFirstAncestorWhichIsA",
]);

/** A quoted string's text, for the simple strings class names are written as. */
export function stringValue(expr: Expr | undefined): string | undefined {
	if (!expr || expr.kind !== "string") return undefined;
	const raw = expr.raw;
	if ((raw.startsWith("\"") || raw.startsWith("'")) && raw.length >= 2) return raw.slice(1, -1);
	return undefined;
}

/** A class name from a written type: `Part`, `Part?`, `(Model)`. */
export function classOfTypeText(text: string | undefined): string | undefined {
	const bare = (text ?? "").trim().replace(/^\((.*)\)$/, "$1").replace(/\?$/, "").trim();
	return CLASS_SET.has(bare) ? bare : undefined;
}

/** The class a call names, when it is one of the calls that name one. */
export function classOfCall(expr: Expr): string | undefined {
	if (expr.kind === "call" && expr.callee.kind === "index" && expr.callee.object.kind === "name"
		&& expr.callee.object.name === "Instance" && expr.callee.name.name === "new") {
		const name = stringValue(expr.args[0]);
		return name && CLASS_SET.has(name) ? name : undefined;
	}
	if (expr.kind === "methodCall" && CLASS_METHODS.has(expr.method.name)) {
		const name = stringValue(expr.args[0]);
		return name && CLASS_SET.has(name) ? name : undefined;
	}
	return undefined;
}

/** The keys a dot can reach: the ones that are names. */
export function dotKeys(held: Held): string[] {
	return (held.keys ?? []).filter((key) => IDENTIFIER.test(key));
}

/** What a declaration says its value holds. */
export function heldBy(typeText: string | undefined, value: Expr | undefined): Held {
	const written = classOfTypeText(typeText);
	if (written) return { className: written };
	let expr = value;
	while (expr && expr.kind === "paren") expr = expr.inner;
	if (!expr) return {};

	if (expr.kind === "cast" && expr.type.kind === "reference") {
		return CLASS_SET.has(expr.type.name) ? { className: expr.type.name } : {};
	}
	const called = classOfCall(expr);
	if (called) return { className: called };

	if (expr.kind === "table") {
		const keys: string[] = [];
		for (const field of expr.fields) {
			const key = field.kind === "named"
				? field.name.name
				: field.kind === "keyed" ? stringValue(field.key) : undefined;
			// Every string key: brackets reach `["two words"]`, and a dot only
			// the ones that are names — `dotKeys` is that narrower list.
			if (key !== undefined && !keys.includes(key)) keys.push(key);
		}
		return { keys };
	}
	return {};
}
