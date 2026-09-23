/**
 * What the code editor says about the name under the pointer.
 *
 * `Instance.new("Part")` returns a Part, and hovering `new` says so, with what
 * a Part is and a link to its page. The same for a class written as a string,
 * a class or datatype named in the code, a datatype's constructor or constant,
 * a local whose declaration says what it holds, and a property read off one.
 *
 * Pure, and in core, so it can be tested without an editor: the editor only
 * draws what this returns.
 */

import { heldBy, stringValue } from "./infer.js";
import { tokenize } from "./lexer.js";
import { localsAt } from "./scope.js";
import { CLASSES, DATATYPES } from "../robloxData.js";
import { propertiesOf } from "../robloxProperties.js";
import { CLASS_SUMMARIES, DATATYPE_STATICS, DATATYPE_SUMMARIES } from "../robloxStatics.js";

export interface Hover {
	/** The span of source the hover describes. */
	from: number;
	to: number;
	/** One line of Luau-ish signature: `Instance.new(className: string) → Part`. */
	code: string;
	summary?: string;
	link?: { label: string; href: string };
}

const DOCS = "https://create.roblox.com/docs/reference/engine";
const CLASS_SET = new Set(CLASSES);
const DATATYPE_SET = new Set(DATATYPES);

/** Calls whose first string argument is a class name. */
const CLASS_CALL = /(Instance\.new|:IsA|:FindFirstChildOfClass|:FindFirstChildWhichIsA|:FindFirstAncestorOfClass|:FindFirstAncestorWhichIsA|:GetService)\s*\(\s*$/;

function classLink(name: string): Hover["link"] {
	return { label: `${name} - Roblox Creator Docs`, href: `${DOCS}/classes/${name}` };
}

function datatypeLink(name: string): Hover["link"] {
	return { label: `${name} - Roblox Creator Docs`, href: `${DOCS}/datatypes/${name}` };
}

function aboutClass(name: string, from: number, to: number, code = `class ${name}`): Hover {
	return { from, to, code, summary: CLASS_SUMMARIES[name], link: classLink(name) };
}

const isWordChar = (c: string | undefined) => !!c && /[A-Za-z0-9_]/.test(c);

export function hoverAt(src: string, pos: number, roblox = true): Hover | null {
	// A class written as the string a call is given: `Instance.new("Part")`.
	if (roblox) {
		const token = tokenize(src).find((t) => t.kind === "string" && t.start < pos && pos < t.end);
		if (token) {
			const name = stringValue({ kind: "string", raw: token.text, start: token.start, end: token.end });
			if (name && CLASS_SET.has(name) && CLASS_CALL.test(src.slice(0, token.start))) {
				return aboutClass(name, token.start, token.end);
			}
			return null;
		}
	}

	let from = pos;
	let to = pos;
	while (isWordChar(src[from - 1])) from--;
	while (isWordChar(src[to])) to++;
	if (from === to || !/^[A-Za-z_]/.test(src.slice(from, to))) return null;
	const word = src.slice(from, to);

	// After a dot: a datatype's constructor or constant, or a local's property.
	if (src[from - 1] === ".") {
		let ownerFrom = from - 1;
		while (isWordChar(src[ownerFrom - 1])) ownerFrom--;
		const owner = src.slice(ownerFrom, from - 1);

		const local = localsAt(src, ownerFrom).find((n) => n.name === owner);
		if (local) {
			const held = heldBy(local.typeText, local.value);
			if (roblox && held.className) {
				const property = propertiesOf(held.className).find((p) => p.name === word);
				if (property) {
					return {
						from, to,
						code: `${held.className}.${word}: ${property.enum ?? property.type ?? "unknown"}`,
						summary: property.summary,
						link: classLink(held.className),
					};
				}
			}
			return null;
		}

		const item = roblox ? DATATYPE_STATICS[owner]?.find((s) => s.name === word) : undefined;
		if (item) {
			// `Instance.new("Part")` returns the class it is given.
			if (owner === "Instance" && word === "new") {
				const called = /^\s*\(\s*["']([A-Za-z0-9_]+)["']/.exec(src.slice(to))?.[1];
				if (called && CLASS_SET.has(called)) {
					return aboutClass(called, from, to, `Instance.new${item.detail} → ${called}`);
				}
			}
			const code = item.kind === "constant"
				? `${owner}.${word}: ${item.detail}`
				: `${owner}.${word}${item.detail}`;
			return { from, to, code, summary: item.summary, link: datatypeLink(owner) };
		}
		return null;
	}

	// A local of the code's own: what it was declared as. Its own declaration
	// has not finished where its name is written, so the end of that line is
	// asked too — hovering `local tbl = { … }` describes `tbl`.
	const lineEnd = src.indexOf("\n", to);
	const local = localsAt(src, from).find((n) => n.name === word)
		?? localsAt(src, lineEnd < 0 ? src.length : lineEnd).find((n) => n.name === word);
	if (local) {
		const held = heldBy(local.typeText, local.value);
		const shown = local.typeText ?? held.className ?? (held.keys ? "table" : undefined);
		const code = `${local.kind === "parameter" ? "parameter" : "local"} ${word}${shown ? `: ${shown}` : ""}`;
		if (roblox && held.className) return aboutClass(held.className, from, to, code);
		return { from, to, code };
	}

	if (roblox && CLASS_SET.has(word)) return aboutClass(word, from, to);
	if (roblox && DATATYPE_SET.has(word)) {
		return { from, to, code: `datatype ${word}`, summary: DATATYPE_SUMMARIES[word], link: datatypeLink(word) };
	}
	return null;
}
