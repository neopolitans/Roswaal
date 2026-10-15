/**
 * What an expression in hand-written Luau holds, as one type name, as far as
 * the code and the engine catalogue say: `hull.CFrame` is a CFrame when
 * `hull` is a BasePart, `Vector3.new(1, 2, 3)` a Vector3, `4` a number.
 *
 * Shared by hover, which describes the member after a dot or colon, and the
 * argument check, which compares what a call is given with what it takes.
 * What a name holds is the caller's to say (`NameType`): a local the file
 * declares, a name the graph types, a global.
 *
 * Unknown is undefined, and unknown is never a problem: a guess at a type
 * would be a warning that lies.
 */

import { CLASSES, DATATYPES } from "../robloxData.js";
import { ENGINE } from "../robloxEngine.js";
import { propertiesOf } from "../robloxProperties.js";
import type { Expr } from "./ast.js";
import { classOfCall, methodsOf } from "./infer.js";

const CLASS_SET = new Set(CLASSES);
const DATATYPE_SET = new Set(DATATYPES);

/** What a bare name holds, where it is read. */
export type NameType = (name: Extract<Expr, { kind: "name" }>) => string | undefined;

/** `BasePart?`, `(CFrame)` → the one name; anything more than a name, undefined. */
export function bareTypeName(text: string | undefined): string | undefined {
	const bare = (text ?? "")
		.trim()
		.replace(/^\((.*)\)$/, "$1")
		.replace(/\?$/, "")
		.trim();
	return /^[A-Za-z_]\w*$/.test(bare) ? bare : undefined;
}

/** Whether a type name is an engine class (an instance) rather than a datatype or a primitive. */
export function isClassType(type: string): boolean {
	return CLASS_SET.has(type);
}

const ARITHMETIC = new Set(["+", "-", "*", "/", "//", "%", "^"]);
const COMPARISON = new Set(["==", "~=", "<", "<=", ">", ">="]);

/** The type `expr` holds, from `src` it was parsed out of. */
export function typeOfExpr(expr: Expr, src: string, nameType: NameType): string | undefined {
	const of = (e: Expr) => typeOfExpr(e, src, nameType);
	switch (expr.kind) {
		case "number":
			return "number";
		case "string":
		case "interpolated":
			return "string";
		case "boolean":
			return "boolean";
		case "paren":
			return of(expr.inner);
		case "cast":
			return bareTypeName(src.slice(expr.type.start, expr.type.end));
		case "unary":
			if (expr.op === "not") return "boolean";
			if (expr.op === "#") return "number";
			return expr.op === "-" && of(expr.operand) === "number" ? "number" : undefined;
		case "binary": {
			if (expr.op === "..") return "string";
			if (COMPARISON.has(expr.op)) return "boolean";
			if (ARITHMETIC.has(expr.op)) {
				const left = of(expr.left);
				return left === "number" && of(expr.right) === "number" ? "number" : undefined;
			}
			if (expr.op === "or") {
				const left = of(expr.left);
				return left && left === of(expr.right) ? left : undefined;
			}
			return undefined;
		}
		case "name":
			return nameType(expr);
		case "index": {
			const owner = of(expr.object);
			if (!owner) return undefined;
			const name = expr.name.name;
			if (CLASS_SET.has(owner))
				return bareTypeName(propertiesOf(owner).find((p) => p.name === name)?.type);
			return bareTypeName(ENGINE.datatypes[owner]?.properties.find((p) => p.name === name)?.type);
		}
		case "call": {
			// `Vector3.new(…)`, `CFrame.lookAt(…)`: a datatype's constructor.
			const callee = expr.callee;
			if (
				callee.kind === "index" &&
				callee.object.kind === "name" &&
				DATATYPE_SET.has(callee.object.name) &&
				nameType(callee.object) === undefined
			) {
				const owner = callee.object.name;
				const made = ENGINE.datatypes[owner]?.constructors.some((c) => c.name === callee.name.name);
				return made ? owner : undefined;
			}
			return classOfCall(expr);
		}
		case "methodCall": {
			const owner = of(expr.object);
			if (!owner) return undefined;
			const name = expr.method.name;
			if (CLASS_SET.has(owner)) {
				const named = classOfCall(expr);
				if (named) return named;
				return bareTypeName(methodsOf(owner).find((m) => m.name === name)?.returns);
			}
			return bareTypeName(ENGINE.datatypes[owner]?.methods.find((m) => m.name === name)?.returns);
		}
		default:
			return undefined;
	}
}
