/**
 * The call the cursor is inside, and which of its parameters it is on.
 *
 * Typing `Instance.new(` shows `className: string` above the completion list,
 * and after the comma, `parent: Instance?`. The call is found from the tokens
 * before the cursor — the innermost bracket still open — so it works in code
 * that does not parse yet, which is all code while its call is being typed.
 *
 * Known calls: a datatype's constructors and functions (`Vector3.new`,
 * `CFrame.lookAt`), and a service's methods on a local the code says holds
 * that service (`players:GetPlayerByUserId(`).
 */

import { classOfGlobal, heldBy, methodsOf } from "./infer.js";
import { significant, tokenize } from "./lexer.js";
import { localsAt } from "./scope.js";
import { SERVICE_METHODS } from "../robloxMembers.js";
import { DATATYPE_STATICS } from "../robloxStatics.js";

export interface Parameter {
	name: string;
	type: string;
}

export interface Signature {
	/** What is being called: `Instance.new`, `players:GetPlayerByUserId`. */
	label: string;
	params: Parameter[];
	/** The parameter the cursor is on; past the last one, the last one. */
	active: number;
	returns?: string;
}

/** `(a: T, b: U) +2 more` into its parameters, splitting only top-level commas. */
function paramsOf(detail: string): Parameter[] {
	const inner = detail.replace(/\s*\+\d+ more$/, "").trim().replace(/^\(/, "").replace(/\)$/, "");
	if (inner.trim() === "") return [];
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < inner.length; i++) {
		const c = inner[i];
		if (c === "(" || c === "{" || c === "[" || c === "<") depth++;
		else if (c === ")" || c === "}" || c === "]" || (c === ">" && inner[i - 1] !== "-")) depth--;
		else if (c === "," && depth === 0) {
			parts.push(inner.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(inner.slice(start));
	return parts.map((part) => {
		const at = part.indexOf(":");
		return at < 0
			? { name: part.trim(), type: "" }
			: { name: part.slice(0, at).trim(), type: part.slice(at + 1).trim() };
	});
}

export function signatureAt(src: string, pos: number, roblox = true): Signature | null {
	if (!roblox) return null;
	const tokens = significant(tokenize(src.slice(0, pos))).filter((t) => t.kind !== "eof");

	// The brackets still open at the cursor. A comma counts for the innermost
	// one only, so `f(g(a, b), |` is on f's second parameter.
	const open: { index: number; paren: boolean; commas: number }[] = [];
	tokens.forEach((token, index) => {
		if (token.kind !== "symbol") return;
		if (token.text === "(" || token.text === "{" || token.text === "[") {
			open.push({ index, paren: token.text === "(", commas: 0 });
		} else if (token.text === ")" || token.text === "}" || token.text === "]") {
			open.pop();
		} else if (token.text === "," && open.length > 0) {
			open[open.length - 1].commas++;
		}
	});
	const call = [...open].reverse().find((frame) => frame.paren);
	if (!call || open[open.length - 1] !== call) return null;

	const name = tokens[call.index - 1];
	const separator = tokens[call.index - 2];
	const owner = tokens[call.index - 3];
	if (name?.kind !== "name" || separator?.kind !== "symbol" || owner?.kind !== "name") return null;

	if (separator.text === ".") {
		const item = DATATYPE_STATICS[owner.text]?.find((s) => s.name === name.text && s.kind !== "constant");
		if (!item) return null;
		const params = paramsOf(item.detail);
		return {
			label: `${owner.text}.${name.text}`,
			params,
			active: Math.min(call.commas, Math.max(0, params.length - 1)),
		};
	}

	if (separator.text === ":") {
		const local = localsAt(src, owner.start).find((n) => n.name === owner.text);
		const className = local ? heldBy(local.typeText, local.value).className : classOfGlobal(owner.text);
		const method = className ? SERVICE_METHODS[className]?.find((m) => m.name === name.text) : undefined;
		if (!method) {
			// Any class's method, found up the hierarchy: `existing:IsA(`.
			const found = className ? methodsOf(className).find((m) => m.name === name.text) : undefined;
			if (!found) return null;
			const params = paramsOf(found.detail);
			return {
				label: `${owner.text}:${name.text}`,
				params,
				active: Math.min(call.commas, Math.max(0, params.length - 1)),
				...(found.returns ? { returns: found.returns } : {}),
			};
		}
		const params = method.params.map((p) => ({
			name: p.name,
			type: `${p.enum ? `Enum.${p.enum}` : p.type}${p.optional ? "?" : ""}`,
		}));
		return {
			label: `${owner.text}:${name.text}`,
			params,
			active: Math.min(call.commas, Math.max(0, params.length - 1)),
			...(method.returns ? { returns: method.returns } : {}),
		};
	}
	return null;
}
