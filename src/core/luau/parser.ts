/**
 * Luau, as a tree.
 *
 * Recursive descent over the lexer's tokens, following Luau's own grammar and
 * precedence: statements and expressions, `::` casts, if-expressions,
 * interpolated strings, attributes, and the whole type language — unions,
 * intersections, optionals, table types with indexers, function types,
 * generics and packs, `typeof`, singletons.
 *
 * ## Errors
 *
 * Collected, never thrown out of `parseChunk`. A statement that cannot be read
 * is reported at the token that stopped it and skipped to the next place a
 * statement can start, so one mistake does not hide the rest of the file.
 */

import type {
	Attribute, Binding, Block, Diagnostic, Expr, FunctionBody, GenericParam, Name,
	ParseResult, Span, Stat, TableField, TableIndexer, TableTypeProp, TypeNode, TypePack,
} from "./ast.js";
import { significant, tokenize, type Token } from "./lexer.js";

/** Binary operators: left and right binding power, as in Luau's parser. */
const BINARY: Record<string, [number, number]> = {
	"+": [6, 6], "-": [6, 6],
	"*": [7, 7], "/": [7, 7], "//": [7, 7], "%": [7, 7],
	"^": [10, 9],
	"..": [5, 4],
	"==": [3, 3], "~=": [3, 3], "<": [3, 3], "<=": [3, 3], ">": [3, 3], ">=": [3, 3],
	and: [2, 2],
	or: [1, 1],
};
const UNARY_POWER = 8;

const COMPOUND = new Set(["+=", "-=", "*=", "/=", "//=", "%=", "^=", "..="]);

/** Where a block stops: the parent statement takes it from here. */
const BLOCK_END = new Set(["end", "else", "elseif", "until"]);

/** Tokens a statement can start with, for skipping past a mistake. */
const STATEMENT_START = new Set([
	"local", "function", "if", "for", "while", "repeat", "return", "do", "break",
	"end", "else", "elseif", "until",
]);

/** Thrown inside the parser only, and caught at the statement it belongs to. */
class Stop extends Error {}

class Parser {
	private readonly tokens: Token[];
	private pos = 0;
	readonly errors: Diagnostic[] = [];

	constructor(src: string) {
		const all = tokenize(src);
		for (const bad of all) {
			if (bad.kind === "error") {
				this.errors.push({ start: bad.start, end: bad.end, message: bad.message ?? "Unreadable." });
			}
		}
		this.tokens = significant(all).filter((t) => t.kind !== "error");
	}

	// -- tokens ----------------------------------------------------------------

	private peek(ahead = 0): Token {
		return this.tokens[Math.min(this.pos + ahead, this.tokens.length - 1)];
	}

	private next(): Token {
		const token = this.peek();
		if (token.kind !== "eof") this.pos++;
		return token;
	}

	/** Whether the current token is this symbol or keyword. */
	private is(text: string, ahead = 0): boolean {
		const token = this.peek(ahead);
		return (token.kind === "symbol" || token.kind === "keyword") && token.text === text;
	}

	private isName(text?: string, ahead = 0): boolean {
		const token = this.peek(ahead);
		return token.kind === "name" && (text === undefined || token.text === text);
	}

	private accept(text: string): Token | undefined {
		return this.is(text) ? this.next() : undefined;
	}

	private fail(message: string, at: Token = this.peek()): never {
		this.errors.push({ start: at.start, end: at.end, message });
		throw new Stop();
	}

	private describe(token: Token): string {
		return token.kind === "eof" ? "the end of the code" : `"${token.text}"`;
	}

	private expect(text: string, what?: string): Token {
		// `Array<T>=` lexes its closer as `>=`: take the `>` and leave the `=`.
		if (text === ">" && this.is(">=")) {
			const token = this.peek();
			this.tokens[this.pos] = { ...token, text: "=", start: token.start + 1 };
			return { ...token, text: ">", end: token.start + 1 };
		}
		const token = this.accept(text);
		if (token) return token;
		return this.fail(`Expected "${text}"${what ? ` ${what}` : ""}, but found ${this.describe(this.peek())}.`);
	}

	private expectName(what: string): Name {
		const token = this.peek();
		if (token.kind !== "name") this.fail(`Expected ${what}, but found ${this.describe(token)}.`);
		this.next();
		return { name: token.text, start: token.start, end: token.end };
	}

	private get last(): Token {
		return this.tokens[Math.max(0, this.pos - 1)];
	}

	private span(start: number): Span {
		return { start, end: this.last.end };
	}

	// -- blocks ----------------------------------------------------------------

	parseChunk(): Block {
		const block = this.block();
		if (this.peek().kind !== "eof") {
			const token = this.peek();
			this.errors.push({
				start: token.start, end: token.end,
				message: `${this.describe(token)} does not close anything here.`,
			});
		}
		return block;
	}

	private block(): Block {
		const out: Block = [];
		for (;;) {
			const token = this.peek();
			if (token.kind === "eof" || (token.kind === "keyword" && BLOCK_END.has(token.text))) return out;
			try {
				const stat = this.statement();
				out.push(stat);
				this.accept(";");
				if (stat.kind === "return") {
					const after = this.peek();
					if (after.kind !== "eof" && !(after.kind === "keyword" && BLOCK_END.has(after.text))) {
						this.errors.push({
							start: after.start, end: after.end,
							message: "Nothing can follow a return in the same block.",
						});
					}
					return out;
				}
			} catch (error) {
				if (!(error instanceof Stop)) throw error;
				this.recover();
			}
		}
	}

	/** Skips to where the next statement can start, taking at least one token. */
	private recover(): void {
		this.next();
		for (;;) {
			const token = this.peek();
			if (token.kind === "eof") return;
			if (token.kind === "keyword" && STATEMENT_START.has(token.text)) return;
			this.next();
		}
	}

	// -- statements ------------------------------------------------------------

	private statement(): Stat {
		const start = this.peek().start;
		const attributes = this.attributes();
		const token = this.peek();

		if (token.kind === "keyword") {
			switch (token.text) {
				case "local": return this.local(start, attributes);
				case "function": return this.functionStat(start, attributes);
				case "if": return this.ifStat(start);
				case "while": {
					this.next();
					const condition = this.expr();
					this.expect("do", "after the while condition");
					const body = this.block();
					this.expect("end", "to close the while");
					return { kind: "while", condition, body, ...this.span(start) };
				}
				case "do": {
					this.next();
					const body = this.block();
					this.expect("end", "to close the do");
					return { kind: "do", body, ...this.span(start) };
				}
				case "for": return this.forStat(start);
				case "repeat": {
					this.next();
					const body = this.block();
					this.expect("until", "to close the repeat");
					const condition = this.expr();
					return { kind: "repeat", body, condition, ...this.span(start) };
				}
				case "return": {
					this.next();
					const next = this.peek();
					const values = next.kind === "eof" || this.is(";") || (next.kind === "keyword" && BLOCK_END.has(next.text))
						? []
						: this.exprList();
					return { kind: "return", values, ...this.span(start) };
				}
				case "break":
					this.next();
					return { kind: "break", ...this.span(start) };
			}
		}
		if (attributes.length > 0) this.fail("An attribute must be followed by a function.");

		if (token.kind === "name") {
			// Contextual words, which are names everywhere else.
			if (token.text === "continue" && !this.continuesAsExpression(1)) {
				this.next();
				return { kind: "continue", ...this.span(start) };
			}
			if (token.text === "type" && (this.isName(undefined, 1) || this.is("function", 1))) {
				return this.typeStat(start, false);
			}
			if (token.text === "export" && this.isName("type", 1)) {
				this.next();
				return this.typeStat(start, true);
			}
			if (token.text === "const" && this.isName(undefined, 1)) {
				this.next();
				const names = this.bindings();
				this.expect("=", "after a const's name");
				const values = this.exprList();
				return { kind: "const", names, values, ...this.span(start) };
			}
		}

		return this.exprStat(start);
	}

	/** Whether the name at `ahead - 1` is being used as a value, not a statement word. */
	private continuesAsExpression(ahead: number): boolean {
		const next = this.peek(ahead);
		if (next.kind === "string") return true;
		return next.kind === "symbol" && ["(", ".", "[", ":", "=", ",", "{"].includes(next.text)
			|| (next.kind === "symbol" && COMPOUND.has(next.text));
	}

	private attributes(): Attribute[] {
		const out: Attribute[] = [];
		while (this.is("@")) {
			const at = this.next();
			if (this.accept("[")) {
				// `@[name, name(args)]`: kept by name; the arguments are skipped.
				let depth = 1;
				let name = "";
				while (depth > 0 && this.peek().kind !== "eof") {
					const token = this.next();
					if (token.text === "[") depth++;
					else if (token.text === "]") depth--;
					else if (!name && token.kind === "name") name = token.text;
				}
				out.push({ name, ...this.span(at.start) });
				continue;
			}
			const name = this.expectName("an attribute name after @");
			out.push({ name: name.name, ...this.span(at.start) });
		}
		return out;
	}

	private local(start: number, attributes: Attribute[]): Stat {
		this.next();
		if (this.accept("function")) {
			const name = this.expectName("a function name");
			const func = this.functionBody(start);
			return { kind: "localFunction", name, func, attributes, ...this.span(start) };
		}
		if (attributes.length > 0) this.fail("An attribute must be followed by a function.");
		const names = this.bindings();
		const values = this.accept("=") ? this.exprList() : [];
		return { kind: "local", names, values, attributes, ...this.span(start) };
	}

	private bindings(): Binding[] {
		const out: Binding[] = [];
		do {
			const name = this.expectName("a name");
			const type = this.accept(":") ? this.type() : undefined;
			out.push({ name: name.name, ...(type ? { type } : {}), ...this.span(name.start) });
		} while (this.accept(","));
		return out;
	}

	private functionStat(start: number, attributes: Attribute[]): Stat {
		this.next();
		const path = [this.expectName("a function name")];
		while (this.accept(".")) path.push(this.expectName("a name after the dot"));
		const method = this.accept(":") ? this.expectName("a method name after the colon") : undefined;
		const func = this.functionBody(start);
		return { kind: "function", path, ...(method ? { method } : {}), func, attributes, ...this.span(start) };
	}

	private ifStat(start: number): Stat {
		this.next();
		const clauses: { condition: Expr; body: Block }[] = [];
		const condition = this.expr();
		this.expect("then", "after the if condition");
		clauses.push({ condition, body: this.block() });
		let orElse: Block | undefined;
		for (;;) {
			if (this.accept("elseif")) {
				const next = this.expr();
				this.expect("then", "after the elseif condition");
				clauses.push({ condition: next, body: this.block() });
				continue;
			}
			if (this.accept("else")) orElse = this.block();
			break;
		}
		this.expect("end", "to close the if");
		return { kind: "if", clauses, ...(orElse ? { orElse } : {}), ...this.span(start) };
	}

	private forStat(start: number): Stat {
		this.next();
		const first = this.bindings();
		if (first.length === 1 && this.accept("=")) {
			const from = this.expr();
			this.expect(",", "between the loop's start and end");
			const to = this.expr();
			const step = this.accept(",") ? this.expr() : undefined;
			this.expect("do", "after the for loop's range");
			const body = this.block();
			this.expect("end", "to close the for loop");
			return { kind: "numericFor", variable: first[0], from, to, ...(step ? { step } : {}), body, ...this.span(start) };
		}
		this.expect("in", "after the loop's names");
		const values = this.exprList();
		this.expect("do", "after what the loop walks");
		const body = this.block();
		this.expect("end", "to close the for loop");
		return { kind: "genericFor", variables: first, values, body, ...this.span(start) };
	}

	private typeStat(start: number, exported: boolean): Stat {
		this.next(); // `type`
		if (this.accept("function")) {
			const name = this.expectName("a type function's name");
			const func = this.functionBody(start);
			return { kind: "typeFunction", exported, name, func, ...this.span(start) };
		}
		const name = this.expectName("a type name");
		const generics = this.is("<") ? this.genericParams(true) : [];
		this.expect("=", "after the type's name");
		const type = this.type();
		return { kind: "typeAlias", exported, name, generics, type, ...this.span(start) };
	}

	private exprStat(start: number): Stat {
		const target = this.suffixed();
		if (this.is("=") || this.is(",")) {
			const targets = [target];
			while (this.accept(",")) targets.push(this.suffixed());
			for (const t of targets) this.assignable(t);
			this.expect("=", "in the assignment");
			const values = this.exprList();
			return { kind: "assign", targets, values, ...this.span(start) };
		}
		const op = this.peek();
		if (op.kind === "symbol" && COMPOUND.has(op.text)) {
			this.assignable(target);
			this.next();
			const value = this.expr();
			return { kind: "compoundAssign", op: op.text, target, value, ...this.span(start) };
		}
		if (target.kind !== "call" && target.kind !== "methodCall") {
			this.errors.push({
				start: target.start, end: target.end,
				message: "This is a value on its own. A statement must call something or assign to something.",
			});
			throw new Stop();
		}
		return { kind: "call", call: target, ...this.span(start) };
	}

	private assignable(target: Expr): void {
		if (target.kind === "name" || target.kind === "index" || target.kind === "indexExpr") return;
		this.errors.push({ start: target.start, end: target.end, message: "This cannot be assigned to." });
		throw new Stop();
	}

	// -- functions -------------------------------------------------------------

	private functionBody(start: number): FunctionBody {
		const generics = this.is("<") ? this.genericParams(false) : [];
		this.expect("(", "to open the parameters");
		const params: Binding[] = [];
		let varargs: FunctionBody["varargs"];
		if (!this.is(")")) {
			do {
				if (this.is("...")) {
					const dots = this.next();
					const type = this.accept(":") ? this.varargType() : undefined;
					varargs = { ...(type ? { type } : {}), ...this.span(dots.start) };
					break;
				}
				const name = this.expectName("a parameter name");
				const type = this.accept(":") ? this.type() : undefined;
				params.push({ name: name.name, ...(type ? { type } : {}), ...this.span(name.start) });
			} while (this.accept(","));
		}
		this.expect(")", "to close the parameters");
		const returns = this.accept(":") ? this.returnType() : undefined;
		const body = this.block();
		this.expect("end", "to close the function");
		return { generics, params, ...(varargs ? { varargs } : {}), ...(returns ? { returns } : {}), body, ...this.span(start) };
	}

	/** `...: T` or `...: T...`: the type of a function's varargs. */
	private varargType(): TypeNode {
		if (this.isName() && this.is("...", 1)) {
			const name = this.next();
			this.next();
			return { kind: "reference", name: name.text, args: [], ...this.span(name.start) };
		}
		return this.type();
	}

	private genericParams(defaults: boolean): GenericParam[] {
		this.expect("<");
		const out: GenericParam[] = [];
		if (!this.is(">")) {
			do {
				const name = this.expectName("a generic name");
				const pack = !!this.accept("...");
				let defaultType: TypeNode | TypePack | undefined;
				if (defaults && this.accept("=")) defaultType = pack ? this.typeOrPack() : this.type();
				out.push({ name: name.name, pack, ...(defaultType ? { defaultType } : {}), ...this.span(name.start) });
			} while (this.accept(","));
		}
		this.expect(">", "to close the generics");
		return out;
	}

	// -- expressions -----------------------------------------------------------

	private exprList(): Expr[] {
		const out = [this.expr()];
		while (this.accept(",")) out.push(this.expr());
		return out;
	}

	expr(limit = 0): Expr {
		const start = this.peek().start;
		let left: Expr;
		const token = this.peek();
		if (token.text === "not" && token.kind === "keyword" || (token.kind === "symbol" && (token.text === "-" || token.text === "#"))) {
			this.next();
			const operand = this.expr(UNARY_POWER);
			left = { kind: "unary", op: token.text, operand, ...this.span(start) };
		} else {
			left = this.asExpr();
		}
		for (;;) {
			const op = this.peek();
			const power = (op.kind === "symbol" || op.kind === "keyword") ? BINARY[op.text] : undefined;
			if (!power || power[0] <= limit) return left;
			this.next();
			const right = this.expr(power[1]);
			left = { kind: "binary", op: op.text, left, right, ...this.span(start) };
		}
	}

	/** A simple expression, then any `::` casts on it. */
	private asExpr(): Expr {
		const start = this.peek().start;
		let value = this.simple();
		while (this.accept("::")) {
			const type = this.type();
			value = { kind: "cast", value, type, ...this.span(start) };
		}
		return value;
	}

	private simple(): Expr {
		const token = this.peek();
		const start = token.start;
		switch (token.kind) {
			case "number":
				this.next();
				return { kind: "number", raw: token.text, ...this.span(start) };
			case "string":
				this.next();
				return { kind: "string", raw: token.text, ...this.span(start) };
			case "interpSimple":
			case "interpBegin":
				return this.interpolated();
			case "keyword":
				switch (token.text) {
					case "nil": this.next(); return { kind: "nil", ...this.span(start) };
					case "true": this.next(); return { kind: "boolean", value: true, ...this.span(start) };
					case "false": this.next(); return { kind: "boolean", value: false, ...this.span(start) };
					case "function": {
						this.next();
						return { kind: "function", func: this.functionBody(start), attributes: [], ...this.span(start) };
					}
					case "if": return this.ifExpr();
				}
				break;
			case "symbol":
				if (token.text === "...") {
					this.next();
					return { kind: "varargs", ...this.span(start) };
				}
				if (token.text === "{") return this.table();
				if (token.text === "@") {
					const attributes = this.attributes();
					if (!this.is("function")) this.fail("An attribute must be followed by a function.");
					this.next();
					return { kind: "function", func: this.functionBody(start), attributes, ...this.span(start) };
				}
				break;
		}
		return this.suffixed();
	}

	private interpolated(): Expr {
		const start = this.peek().start;
		const first = this.next();
		if (first.kind === "interpSimple") {
			return { kind: "interpolated", parts: [first.text.slice(1, -1)], values: [], ...this.span(start) };
		}
		const parts = [first.text.slice(1, -1)];
		const values: Expr[] = [];
		for (;;) {
			values.push(this.expr());
			const token = this.peek();
			if (token.kind === "interpMid") {
				this.next();
				parts.push(token.text.slice(1, -1));
				continue;
			}
			if (token.kind === "interpEnd") {
				this.next();
				parts.push(token.text.slice(1, -1));
				return { kind: "interpolated", parts, values, ...this.span(start) };
			}
			this.fail(`Expected "}" to close the interpolated value, but found ${this.describe(token)}.`);
		}
	}

	private ifExpr(): Expr {
		const start = this.next().start;
		const clauses: { condition: Expr; value: Expr }[] = [];
		const condition = this.expr();
		this.expect("then", "after the if-expression's condition");
		clauses.push({ condition, value: this.expr() });
		while (this.accept("elseif")) {
			const next = this.expr();
			this.expect("then", "after the elseif condition");
			clauses.push({ condition: next, value: this.expr() });
		}
		this.expect("else", "— an if-expression always has an else");
		const orElse = this.expr();
		return { kind: "ifElse", clauses, orElse, ...this.span(start) };
	}

	private table(): Expr {
		const start = this.next().start;
		const fields: TableField[] = [];
		while (!this.is("}")) {
			const fieldStart = this.peek().start;
			if (this.accept("[")) {
				const key = this.expr();
				this.expect("]", "to close the key");
				this.expect("=", "after the key");
				const value = this.expr();
				fields.push({ kind: "keyed", key, value, ...this.span(fieldStart) });
			} else if (this.isName() && this.is("=", 1)) {
				const name = this.expectName("a field name");
				this.next();
				const value = this.expr();
				fields.push({ kind: "named", name, value, ...this.span(fieldStart) });
			} else {
				const value = this.expr();
				fields.push({ kind: "positional", value, ...this.span(fieldStart) });
			}
			if (!this.accept(",") && !this.accept(";")) break;
		}
		this.expect("}", "to close the table");
		return { kind: "table", fields, ...this.span(start) };
	}

	/** A name or bracketed expression, then any fields, indexes and calls. */
	private suffixed(): Expr {
		const token = this.peek();
		const start = token.start;
		let value: Expr;
		if (token.kind === "name") {
			this.next();
			value = { kind: "name", name: token.text, ...this.span(start) };
		} else if (this.is("(")) {
			this.next();
			const inner = this.expr();
			this.expect(")", "to close the brackets");
			value = { kind: "paren", inner, ...this.span(start) };
		} else {
			return this.fail(`Expected a value, but found ${this.describe(token)}.`);
		}
		for (;;) {
			if (this.accept(".")) {
				const name = this.expectName("a field name after the dot");
				value = { kind: "index", object: value, name, ...this.span(start) };
			} else if (this.is("[")) {
				this.next();
				const key = this.expr();
				this.expect("]", "to close the index");
				value = { kind: "indexExpr", object: value, key, ...this.span(start) };
			} else if (this.is(":") && this.isName(undefined, 1)) {
				this.next();
				const method = this.expectName("a method name");
				const args = this.callArgs();
				value = { kind: "methodCall", object: value, method, args, ...this.span(start) };
			} else if (this.is("(") || this.is("{") || this.peek().kind === "string") {
				const args = this.callArgs();
				value = { kind: "call", callee: value, args, ...this.span(start) };
			} else {
				return value;
			}
		}
	}

	private callArgs(): Expr[] {
		if (this.peek().kind === "string") {
			const token = this.next();
			return [{ kind: "string", raw: token.text, start: token.start, end: token.end }];
		}
		if (this.is("{")) return [this.table()];
		this.expect("(", "to open the call's arguments");
		const args = this.is(")") ? [] : this.exprList();
		this.expect(")", "to close the call's arguments");
		return args;
	}

	// -- types -----------------------------------------------------------------

	/** A type: unions and intersections of simple types, each maybe `?`. */
	type(): TypeNode {
		const start = this.peek().start;
		// A leading `|` or `&` is allowed, for a type laid out one member a line.
		const leading = this.accept("|") ?? this.accept("&");
		const first = this.optionalType();
		const separator = leading?.text ?? (this.is("|") ? "|" : this.is("&") ? "&" : undefined);
		if (!separator || (!leading && !this.is(separator))) return first;
		const types = [first];
		while (this.accept(separator)) types.push(this.optionalType());
		return { kind: separator === "|" ? "union" : "intersection", types, ...this.span(start) };
	}

	private optionalType(): TypeNode {
		const start = this.peek().start;
		let type = this.simpleType();
		while (this.accept("?")) type = { kind: "optional", inner: type, ...this.span(start) };
		return type;
	}

	private simpleType(): TypeNode {
		const token = this.peek();
		const start = token.start;
		if (token.kind === "string") {
			this.next();
			return { kind: "singleton", value: token.text, ...this.span(start) };
		}
		if (token.kind === "keyword") {
			if (token.text === "nil") {
				this.next();
				return { kind: "reference", name: "nil", args: [], ...this.span(start) };
			}
			if (token.text === "true" || token.text === "false") {
				this.next();
				return { kind: "singleton", value: token.text, ...this.span(start) };
			}
		}
		if (token.kind === "name") {
			if (token.text === "typeof" && this.is("(", 1)) {
				this.next();
				this.next();
				const expr = this.expr();
				this.expect(")", "to close typeof");
				return { kind: "typeof", expr, ...this.span(start) };
			}
			this.next();
			let prefix: string | undefined;
			let name = token.text;
			if (this.accept(".")) {
				prefix = name;
				name = this.expectName("a type name after the dot").name;
			}
			const args = this.is("<") ? this.typeArgs() : [];
			return { kind: "reference", ...(prefix ? { prefix } : {}), name, args, ...this.span(start) };
		}
		if (this.is("{")) return this.tableType();
		if (this.is("<")) {
			const generics = this.genericParams(false);
			return this.functionTypeFrom(start, generics, this.parenPack());
		}
		if (this.is("(")) {
			const pack = this.parenPack();
			if (this.is("->")) return this.functionTypeFrom(start, [], pack);
			if (pack.types.length === 1 && !pack.tail) {
				return { kind: "parenType", inner: pack.types[0], ...this.span(start) };
			}
			return this.fail("A list of types in brackets is only a type as a function's parameters or results.");
		}
		return this.fail(`Expected a type, but found ${this.describe(token)}.`);
	}

	private functionTypeFrom(start: number, generics: GenericParam[], params: TypePack): TypeNode {
		this.expect("->", "after a function type's parameters");
		const returns = this.returnPack();
		return { kind: "functionType", generics, params, returns, ...this.span(start) };
	}

	/** `(A, b: B, ...C)` — parameter names in a function type are allowed and dropped. */
	private parenPack(): TypePack {
		const start = this.expect("(").start;
		const types: TypeNode[] = [];
		let tail: TypePack["tail"];
		if (!this.is(")")) {
			do {
				if (this.is("...")) {
					this.next();
					tail = { kind: "variadic", type: this.type() };
					break;
				}
				if (this.isName() && this.is("...", 1)) {
					tail = { kind: "generic", name: this.next().text };
					this.next();
					break;
				}
				if (this.isName() && this.is(":", 1)) {
					this.next();
					this.next();
				}
				types.push(this.type());
			} while (this.accept(","));
		}
		this.expect(")", "to close the type list");
		return { kind: "pack", types, ...(tail ? { tail } : {}), ...this.span(start) };
	}

	/** What a function returns, after `:` or `->`: one type, or a pack. */
	private returnPack(): TypePack {
		const start = this.peek().start;
		if (this.is("(")) {
			const pack = this.parenPack();
			// `(A) -> B` returned from a function is a function type, not a pack.
			if (this.is("->")) {
				const fn = this.functionTypeFrom(start, [], pack);
				return { kind: "pack", types: [this.continueType(start, fn)], ...this.span(start) };
			}
			// `(A)?` or `(A) | B`: a bracketed type that goes on.
			if (pack.types.length === 1 && !pack.tail && (this.is("?") || this.is("|") || this.is("&"))) {
				const inner: TypeNode = { kind: "parenType", inner: pack.types[0], ...this.span(start) };
				return { kind: "pack", types: [this.continueType(start, inner)], ...this.span(start) };
			}
			return pack;
		}
		if (this.is("...")) {
			this.next();
			return { kind: "pack", types: [], tail: { kind: "variadic", type: this.type() }, ...this.span(start) };
		}
		if (this.isName() && this.is("...", 1)) {
			const name = this.next().text;
			this.next();
			return { kind: "pack", types: [], tail: { kind: "generic", name }, ...this.span(start) };
		}
		return { kind: "pack", types: [this.type()], ...this.span(start) };
	}

	/** Returns get their own entry point: `: T` on a function uses the same rules. */
	private returnType(): TypePack {
		return this.returnPack();
	}

	/** Carries on a type already begun: `?`, then `|` or `&` members. */
	private continueType(start: number, first: TypeNode): TypeNode {
		let type = first;
		while (this.accept("?")) type = { kind: "optional", inner: type, ...this.span(start) };
		const separator = this.is("|") ? "|" : this.is("&") ? "&" : undefined;
		if (!separator) return type;
		const types = [type];
		while (this.accept(separator)) types.push(this.optionalType());
		return { kind: separator === "|" ? "union" : "intersection", types, ...this.span(start) };
	}

	private typeArgs(): (TypeNode | TypePack)[] {
		this.expect("<");
		const out: (TypeNode | TypePack)[] = [];
		if (!this.is(">")) {
			do out.push(this.typeOrPack());
			while (this.accept(","));
		}
		this.expect(">", "to close the type arguments");
		return out;
	}

	/** A generic argument: a type, `(A, B)`, `...T` or `T...`. */
	private typeOrPack(): TypeNode | TypePack {
		const start = this.peek().start;
		if (this.is("...")) {
			this.next();
			return { kind: "pack", types: [], tail: { kind: "variadic", type: this.type() }, ...this.span(start) };
		}
		if (this.isName() && this.is("...", 1)) {
			const name = this.next().text;
			this.next();
			return { kind: "pack", types: [], tail: { kind: "generic", name }, ...this.span(start) };
		}
		if (this.is("(")) {
			const pack = this.parenPack();
			if (this.is("->")) return this.continueType(start, this.functionTypeFrom(start, [], pack));
			if (pack.types.length === 1 && !pack.tail) {
				return this.continueType(start, { kind: "parenType", inner: pack.types[0], ...this.span(start) });
			}
			return pack;
		}
		return this.type();
	}

	private tableType(): TypeNode {
		const start = this.expect("{").start;
		const props: TableTypeProp[] = [];
		let indexer: TableIndexer | undefined;

		// `{ T }`: an array.
		const arrayLike = !this.is("}") && !this.is("[") && !(this.isName() && this.is(":", 1))
			&& !(this.isName("read") || this.isName("write")) ;
		if (arrayLike) {
			const array = this.type();
			this.expect("}", "to close the array type");
			return { kind: "tableType", props, array, ...this.span(start) };
		}

		while (!this.is("}")) {
			const fieldStart = this.peek().start;
			let access: "read" | "write" | undefined;
			if ((this.isName("read") || this.isName("write")) && (this.isName(undefined, 1) || this.is("[", 1))) {
				access = this.next().text as "read" | "write";
			}
			if (this.accept("[")) {
				// `["name"]: T` is a property with a quoted name; `[K]: V` is the indexer.
				if (this.peek().kind === "string" && this.is("]", 1)) {
					const name = this.next().text;
					this.next();
					this.expect(":", "after the property");
					props.push({ name, ...(access ? { access } : {}), type: this.type(), ...this.span(fieldStart) });
				} else {
					const key = this.type();
					this.expect("]", "to close the indexer's key");
					this.expect(":", "after the indexer's key");
					const value = this.type();
					indexer = { ...(access ? { access } : {}), key, value, ...this.span(fieldStart) };
				}
			} else {
				const name = this.expectName("a property name");
				this.expect(":", "after the property name");
				props.push({ name: name.name, ...(access ? { access } : {}), type: this.type(), ...this.span(fieldStart) });
			}
			if (!this.accept(",") && !this.accept(";")) break;
		}
		this.expect("}", "to close the table type");
		return { kind: "tableType", props, ...(indexer ? { indexer } : {}), ...this.span(start) };
	}
}

/** A whole file or a Custom Code body: a block of statements. */
export function parseChunk(src: string): ParseResult<Block> {
	const parser = new Parser(src);
	const value = parser.parseChunk();
	return { value, errors: parser.errors };
}
