/**
 * Walking the tree, typed.
 *
 * Every reader of the tree that wants "each call", "each index", "each
 * function statement" walks it here, so the shape of each node is written
 * down once and a new kind of node is added to one switch. Walking with
 * `Object.values` and a cast, as each reader once did, met a function
 * expression where it expected a function statement and threw.
 *
 * Not a rewriter, and not a scope walk: `scope.ts` decides which blocks a
 * point is inside; this only says what is in the tree.
 */

import type { Block, Expr, FunctionBody, Span, Stat, TableField, TypeNode, TypePack } from "./ast.js";

/**
 * What a walk calls at each node. Each is optional; returning `false` from
 * one leaves that node's children out, which is how a search that has found
 * what it wanted stops descending.
 */
export interface Visitor {
	stat?(stat: Stat): boolean | void;
	expr?(expr: Expr): boolean | void;
	type?(type: TypeNode): boolean | void;
	/** A function's body, from a statement or an expression, before what is in it. */
	func?(func: FunctionBody): boolean | void;
}

/** Calls the visitor at every node of `block`, parents before children, in source order. */
export function visitBlock(block: Block, visitor: Visitor): void {
	for (const stat of block) visitStat(stat, visitor);
}

export function visitStat(stat: Stat, visitor: Visitor): void {
	if (visitor.stat?.(stat) === false) return;
	const exprs = (list: readonly Expr[]) => {
		for (const expr of list) visitExpr(expr, visitor);
	};
	switch (stat.kind) {
		case "local":
		case "const":
			for (const binding of stat.names) if (binding.type) visitType(binding.type, visitor);
			exprs(stat.values);
			return;
		case "localFunction":
		case "functionStat":
		case "typeFunction":
			visitFunction(stat.func, visitor);
			return;
		case "assign":
			exprs(stat.targets);
			exprs(stat.values);
			return;
		case "compoundAssign":
			visitExpr(stat.target, visitor);
			visitExpr(stat.value, visitor);
			return;
		case "callStat":
			visitExpr(stat.call, visitor);
			return;
		case "do":
			visitBlock(stat.body, visitor);
			return;
		case "while":
			visitExpr(stat.condition, visitor);
			visitBlock(stat.body, visitor);
			return;
		case "repeat":
			visitBlock(stat.body, visitor);
			visitExpr(stat.condition, visitor);
			return;
		case "if":
			for (const clause of stat.clauses) {
				visitExpr(clause.condition, visitor);
				visitBlock(clause.body, visitor);
			}
			if (stat.orElse) visitBlock(stat.orElse, visitor);
			return;
		case "numericFor":
			if (stat.variable.type) visitType(stat.variable.type, visitor);
			visitExpr(stat.from, visitor);
			visitExpr(stat.to, visitor);
			if (stat.step) visitExpr(stat.step, visitor);
			visitBlock(stat.body, visitor);
			return;
		case "genericFor":
			for (const binding of stat.variables) if (binding.type) visitType(binding.type, visitor);
			exprs(stat.values);
			visitBlock(stat.body, visitor);
			return;
		case "return":
			exprs(stat.values);
			return;
		case "typeAlias":
			for (const generic of stat.generics) if (generic.defaultType) visitTypeOrPack(generic.defaultType, visitor);
			visitType(stat.type, visitor);
			return;
		case "break":
		case "continue":
			return;
	}
}

export function visitExpr(expr: Expr, visitor: Visitor): void {
	if (visitor.expr?.(expr) === false) return;
	switch (expr.kind) {
		case "interpolated":
			for (const value of expr.values) visitExpr(value, visitor);
			return;
		case "function":
			visitFunction(expr.func, visitor);
			return;
		case "table":
			for (const field of expr.fields) visitField(field, visitor);
			return;
		case "index":
			visitExpr(expr.object, visitor);
			return;
		case "indexExpr":
			visitExpr(expr.object, visitor);
			visitExpr(expr.key, visitor);
			return;
		case "call":
			visitExpr(expr.callee, visitor);
			for (const arg of expr.args) visitExpr(arg, visitor);
			return;
		case "methodCall":
			visitExpr(expr.object, visitor);
			for (const arg of expr.args) visitExpr(arg, visitor);
			return;
		case "paren":
			visitExpr(expr.inner, visitor);
			return;
		case "unary":
			visitExpr(expr.operand, visitor);
			return;
		case "binary":
			visitExpr(expr.left, visitor);
			visitExpr(expr.right, visitor);
			return;
		case "cast":
			visitExpr(expr.value, visitor);
			visitType(expr.type, visitor);
			return;
		case "ifElse":
			for (const clause of expr.clauses) {
				visitExpr(clause.condition, visitor);
				visitExpr(clause.value, visitor);
			}
			visitExpr(expr.orElse, visitor);
			return;
		case "nil":
		case "boolean":
		case "number":
		case "string":
		case "varargs":
		case "name":
			return;
	}
}

function visitField(field: TableField, visitor: Visitor): void {
	if (field.kind === "keyed") visitExpr(field.key, visitor);
	visitExpr(field.value, visitor);
}

export function visitFunction(func: FunctionBody, visitor: Visitor): void {
	if (visitor.func?.(func) === false) return;
	for (const generic of func.generics) if (generic.defaultType) visitTypeOrPack(generic.defaultType, visitor);
	for (const param of func.params) if (param.type) visitType(param.type, visitor);
	if (func.varargs?.type) visitType(func.varargs.type, visitor);
	if (func.returns) visitPack(func.returns, visitor);
	visitBlock(func.body, visitor);
}

export function visitType(type: TypeNode, visitor: Visitor): void {
	if (visitor.type?.(type) === false) return;
	switch (type.kind) {
		case "reference":
			for (const arg of type.args) visitTypeOrPack(arg, visitor);
			return;
		case "typeof":
			visitExpr(type.expr, visitor);
			return;
		case "tableType":
			for (const prop of type.props) visitType(prop.type, visitor);
			if (type.indexer) {
				visitType(type.indexer.key, visitor);
				visitType(type.indexer.value, visitor);
			}
			if (type.array) visitType(type.array, visitor);
			return;
		case "functionType":
			visitPack(type.params, visitor);
			visitPack(type.returns, visitor);
			return;
		case "union":
		case "intersection":
			for (const member of type.types) visitType(member, visitor);
			return;
		case "optional":
		case "parenType":
			visitType(type.inner, visitor);
			return;
		case "singleton":
			return;
	}
}

function visitPack(pack: TypePack, visitor: Visitor): void {
	for (const type of pack.types) visitType(type, visitor);
	if (pack.tail?.kind === "variadic") visitType(pack.tail.type, visitor);
}

function visitTypeOrPack(node: TypeNode | TypePack, visitor: Visitor): void {
	if (node.kind === "pack") visitPack(node, visitor);
	else visitType(node, visitor);
}

/** Whether `offset` is inside `span`, its ends included: a cursor just after a name is on it. */
export function contains(span: Span, offset: number): boolean {
	return span.start <= offset && offset <= span.end;
}
