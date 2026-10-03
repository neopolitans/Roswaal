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

import { ENGINE, type EngineParam } from "../robloxEngine.js";
import { SERVICE_METHODS } from "../robloxMembers.js";
import { classOfGlobal, heldBy, membersInCode, methodsOf, type TableMember } from "./infer.js";
import { significant, tokenize } from "./lexer.js";
import { localsAt } from "./scope.js";

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

/** The engine's parameters, as the signature help shows them. */
function parametersOf(params: readonly EngineParam[]): Parameter[] {
	return params.map((p) => ({ name: p.name, type: p.type || "any" }));
}

/**
 * A datatype's constructor or function, from the engine catalogue: its first
 * signature, which is the one the completion list shows.
 */
function datatypeFunction(owner: string, name: string): readonly EngineParam[] | undefined {
	const datatype = ENGINE.datatypes[owner];
	if (!datatype) return undefined;
	return [...datatype.constructors, ...datatype.functions].find(
		(f) => f.name === name && !f.deprecated,
	)?.params;
}

export function signatureAt(
	src: string,
	pos: number,
	roblox = true,
	tableMembers: ReadonlyMap<string, TableMember[]> = new Map(),
): Signature | null {
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
		// A function put on a table, by the code or the graph: `Occupancy.value(`.
		const onTable = [
			...membersInCode(src, owner.text),
			...(tableMembers.get(owner.text) ?? []),
		].find((m) => m.name === name.text && m.kind === "function");
		if (onTable?.signature) {
			const params = onTable.signature.params.map((p) => ({ name: p.name, type: p.type ?? "" }));
			const returns = onTable.signature.returns;
			return {
				label: `${owner.text}.${name.text}`,
				params,
				active: Math.min(call.commas, Math.max(0, params.length - 1)),
				...(returns ? { returns } : {}),
			};
		}
		if (!roblox) return null;
		const found = datatypeFunction(owner.text, name.text);
		if (!found) return null;
		const params = parametersOf(found);
		return {
			label: `${owner.text}.${name.text}`,
			params,
			active: Math.min(call.commas, Math.max(0, params.length - 1)),
		};
	}

	if (separator.text === ":" && roblox) {
		const local = localsAt(src, owner.start).find((n) => n.name === owner.text);
		const className = local
			? heldBy(local.typeText, local.value).className
			: classOfGlobal(owner.text);
		const method = className
			? SERVICE_METHODS[className]?.find((m) => m.name === name.text)
			: undefined;
		if (!method) {
			// Any class's method, found up the hierarchy: `existing:IsA(`.
			const found = className ? methodsOf(className).find((m) => m.name === name.text) : undefined;
			const declared =
				found && ENGINE.classes[found.from]?.methods.find((m) => m.name === found.name);
			if (!found || !declared) return null;
			const params = parametersOf(declared.params);
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
