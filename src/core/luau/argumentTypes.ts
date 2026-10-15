/**
 * Arguments of the wrong type, in hand-written Luau: a method called on an
 * object whose type is known, given a value whose type is known, where the
 * engine catalogue says the method takes something else --
 * `hull.CFrame:PointToObjectSpace(leftTrack.Position.X)` hands a number to a
 * method that takes Vector3s.
 *
 * Only what is certain is said. An argument or a parameter of a type this
 * cannot read, an enum, a class given where another class is taken (it may
 * be narrower than its type says) and a number for a string or the other way
 * round (the engine converts those) are all left alone.
 */

import { isService } from "../roblox.js";
import { CLASSES, DATATYPES } from "../robloxData.js";
import { ENGINE, type EngineClass, type EngineParam } from "../robloxEngine.js";
import type { Expr } from "./ast.js";
import type { SyntaxProblem } from "./check.js";
import { bareTypeName, isClassType, type NameType, typeOfExpr } from "./exprType.js";
import { luauFile } from "./file.js";
import { classOfGlobal, heldBy } from "./infer.js";
import { lineIndex } from "./lexer.js";
import { localsInFile } from "./scope.js";
import { visitBlock } from "./visit.js";

const CLASS_SET = new Set(CLASSES);
const DATATYPE_SET = new Set(DATATYPES);
const NUMERIC = new Set(["number", "int", "int64", "int32", "int16", "float", "double"]);
/** What an expression is read behind when it does not parse as statements. */
const AS_VALUE = "return ";

/** The parameters the catalogue gives a method of a class or a datatype. */
function methodParams(owner: string, name: string): EngineParam[] | undefined {
	const datatype = ENGINE.datatypes[owner];
	if (datatype) return datatype.methods.find((m) => m.name === name)?.params;
	const walked = new Set<string>();
	for (let at: string | undefined = owner; at && !walked.has(at); ) {
		walked.add(at);
		const found: EngineClass | undefined = ENGINE.classes[at];
		const method = found?.methods.find((m) => m.name === name);
		if (method) return method.params;
		at = found?.superclass;
	}
	return undefined;
}

/** A type any value of which is fine, or one this cannot judge. */
function unjudged(type: string): boolean {
	return (
		type === "" ||
		type === "any" ||
		type === "Variant" ||
		type === "Object" ||
		/[|&<>{}()\[\],]/.test(type) ||
		ENGINE.enums[type] !== undefined
	);
}

const known = (type: string) =>
	type === "number" ||
	type === "string" ||
	type === "boolean" ||
	DATATYPE_SET.has(type) ||
	CLASS_SET.has(type);

/** Whether an argument of type `given` fits a parameter of type `taken`; undefined when it cannot be said. */
export function fits(taken: string, given: string): boolean | undefined {
	const want = NUMERIC.has(taken) ? "number" : taken;
	const have = NUMERIC.has(given) ? "number" : given;
	if (want === have) return true;
	if (unjudged(want) || !known(want) || !known(have)) return undefined;
	if (want === "Instance" && CLASS_SET.has(have)) return true;
	if ((want === "string" && have === "number") || (want === "number" && have === "string"))
		return undefined;
	if (CLASS_SET.has(want) && CLASS_SET.has(have)) return undefined;
	return false;
}

/**
 * The argument problems in `src`: a block of statements, or one expression.
 * `locals` is what the graph says names in scope hold, by type as written.
 */
export function argumentProblems(
	src: string,
	kind: "block" | "expression",
	locals: ReadonlyMap<string, string> = new Map(),
): SyntaxProblem[] {
	const shift = kind === "expression" ? AS_VALUE.length : 0;
	const text = kind === "expression" ? `${AS_VALUE}${src}` : src;
	const file = luauFile(text);
	if (file.errors.length > 0) return [];
	const at = lineIndex(src);
	const nameType: NameType = (name) => {
		const local = (localsInFile(text, name.start) ?? []).find((n) => n.name === name.name);
		if (local) return heldBy(local.typeText, local.value).className ?? bareTypeName(local.typeText);
		const graph = locals.get(name.name);
		if (graph !== undefined) return bareTypeName(graph);
		return classOfGlobal(name.name) ?? (name.name === "script" ? "LuaSourceContainer" : undefined);
	};
	const out: SyntaxProblem[] = [];
	const check = (call: Extract<Expr, { kind: "methodCall" }>) => {
		const owner = typeOfExpr(call.object, text, nameType);
		if (!owner || !(isClassType(owner) || isService(owner) || DATATYPE_SET.has(owner))) return;
		const params = methodParams(owner, call.method.name);
		if (!params) return;
		call.args.forEach((arg, i) => {
			// `...: Tuple<Vector3>` takes any number, each of the one type.
			const last = params[params.length - 1];
			const rest = last?.name === "..." ? /^Tuple<(\w+)>$/.exec(last.type)?.[1] : undefined;
			const param = i < params.length - (rest ? 1 : 0) ? params[i] : undefined;
			const taken = param ? (bareTypeName(param.type) ?? param.type) : rest;
			if (!taken) return;
			const given = typeOfExpr(arg, text, nameType);
			if (!given || fits(taken, given) !== false) return;
			const from = arg.start - shift;
			out.push({
				message: `${owner}:${call.method.name} takes a ${taken} here, and this is a ${given}.`,
				line: at(Math.max(0, from)).line,
				from,
				to: Math.max(arg.end - shift, from + 1),
			});
		});
	};
	visitBlock(file.block, {
		expr(e) {
			if (e.kind === "methodCall") check(e);
		},
	});
	return out;
}
