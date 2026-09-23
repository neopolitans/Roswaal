/**
 * The shape of parsed Luau.
 *
 * Every node carries `start` and `end`, offsets into the source it came from,
 * so a message can point at the exact text and a tool can replace one node
 * and leave everything around it as it was.
 *
 * Deliberately close to the grammar rather than to any one use: the checks
 * on Custom Code, the scope walk for completions and the precedence rules the
 * emitter needs all read the same tree.
 */

export interface Span {
	start: number;
	end: number;
}

export interface Name extends Span {
	name: string;
}

/** A name being declared, with the type written beside it, if any. */
export interface Binding extends Span {
	name: string;
	type?: TypeNode;
}

export type Block = Stat[];

// -- statements --------------------------------------------------------------

export type Stat =
	| ({ kind: "local"; names: Binding[]; values: Expr[]; attributes: Attribute[] } & Span)
	| ({ kind: "const"; names: Binding[]; values: Expr[] } & Span)
	| ({ kind: "localFunction"; name: Name; func: FunctionBody; attributes: Attribute[] } & Span)
	| ({ kind: "function"; path: Name[]; method?: Name; func: FunctionBody; attributes: Attribute[] } & Span)
	| ({ kind: "assign"; targets: Expr[]; values: Expr[] } & Span)
	| ({ kind: "compoundAssign"; op: string; target: Expr; value: Expr } & Span)
	| ({ kind: "call"; call: Expr } & Span)
	| ({ kind: "do"; body: Block } & Span)
	| ({ kind: "while"; condition: Expr; body: Block } & Span)
	| ({ kind: "repeat"; body: Block; condition: Expr } & Span)
	| ({ kind: "if"; clauses: { condition: Expr; body: Block }[]; orElse?: Block } & Span)
	| ({ kind: "numericFor"; variable: Binding; from: Expr; to: Expr; step?: Expr; body: Block } & Span)
	| ({ kind: "genericFor"; variables: Binding[]; values: Expr[]; body: Block } & Span)
	| ({ kind: "return"; values: Expr[] } & Span)
	| ({ kind: "break" } & Span)
	| ({ kind: "continue" } & Span)
	| ({ kind: "typeAlias"; exported: boolean; name: Name; generics: GenericParam[]; type: TypeNode } & Span)
	| ({ kind: "typeFunction"; exported: boolean; name: Name; func: FunctionBody } & Span);

/** `@native`, or the bracketed form `@[deprecated]`. */
export interface Attribute extends Span {
	name: string;
}

// -- expressions -------------------------------------------------------------

export type Expr =
	| ({ kind: "nil" } & Span)
	| ({ kind: "boolean"; value: boolean } & Span)
	| ({ kind: "number"; raw: string } & Span)
	| ({ kind: "string"; raw: string } & Span)
	| ({ kind: "interpolated"; parts: string[]; values: Expr[] } & Span)
	| ({ kind: "varargs" } & Span)
	| ({ kind: "function"; func: FunctionBody; attributes: Attribute[] } & Span)
	| ({ kind: "table"; fields: TableField[] } & Span)
	| ({ kind: "name"; name: string } & Span)
	| ({ kind: "index"; object: Expr; name: Name } & Span)
	| ({ kind: "indexExpr"; object: Expr; key: Expr } & Span)
	| ({ kind: "call"; callee: Expr; args: Expr[] } & Span)
	| ({ kind: "methodCall"; object: Expr; method: Name; args: Expr[] } & Span)
	| ({ kind: "paren"; inner: Expr } & Span)
	| ({ kind: "unary"; op: string; operand: Expr } & Span)
	| ({ kind: "binary"; op: string; left: Expr; right: Expr } & Span)
	| ({ kind: "cast"; value: Expr; type: TypeNode } & Span)
	| ({ kind: "ifElse"; clauses: { condition: Expr; value: Expr }[]; orElse: Expr } & Span)
	| ({ kind: "error" } & Span);

export type TableField =
	| ({ kind: "positional"; value: Expr } & Span)
	| ({ kind: "named"; name: Name; value: Expr } & Span)
	| ({ kind: "keyed"; key: Expr; value: Expr } & Span);

export interface FunctionBody extends Span {
	generics: GenericParam[];
	params: Binding[];
	/** `...`, with its type if one is written. */
	varargs?: Span & { type?: TypeNode };
	returns?: TypePack;
	body: Block;
}

// -- types -------------------------------------------------------------------

export interface GenericParam extends Span {
	name: string;
	/** `T...` — a generic type pack. */
	pack: boolean;
	defaultType?: TypeNode | TypePack;
}

export type TypeNode =
	| ({ kind: "reference"; prefix?: string; name: string; args: (TypeNode | TypePack)[] } & Span)
	| ({ kind: "singleton"; value: string } & Span)
	| ({ kind: "typeof"; expr: Expr } & Span)
	| ({ kind: "tableType"; props: TableTypeProp[]; indexer?: TableIndexer; array?: TypeNode } & Span)
	| ({ kind: "functionType"; generics: GenericParam[]; params: TypePack; returns: TypePack } & Span)
	| ({ kind: "union"; types: TypeNode[] } & Span)
	| ({ kind: "intersection"; types: TypeNode[] } & Span)
	| ({ kind: "optional"; inner: TypeNode } & Span)
	| ({ kind: "parenType"; inner: TypeNode } & Span)
	| ({ kind: "errorType" } & Span);

export interface TableTypeProp extends Span {
	name: string;
	access?: "read" | "write";
	type: TypeNode;
}

export interface TableIndexer extends Span {
	access?: "read" | "write";
	key: TypeNode;
	value: TypeNode;
}

/**
 * A list of types with an optional tail: the parameters of a function type,
 * what a function returns, a generic pack argument.
 */
export interface TypePack extends Span {
	kind: "pack";
	types: TypeNode[];
	/** `...T` or `T...` at the end. */
	tail?: { kind: "variadic"; type: TypeNode } | { kind: "generic"; name: string };
}

export interface Diagnostic extends Span {
	message: string;
}

export interface ParseResult<T> {
	value: T;
	errors: Diagnostic[];
}
