/**
 * The emitter's lexical scope, its output line, and the names every part of it
 * shares.
 *
 * A leaf: it imports nothing from the emitter's other modules, so each of them
 * can use it without a cycle.
 */

export interface OutLine {
	text: string;
	indent: number;
	node?: string;
}

/** Lexical scope: which node outputs are bound to which locals, and where. */
export class Scope {
	bindings = new Map<string, string>();
	/**
	 * Values Luau already knows more about here than their declared type says,
	 * and the classes it knows them to be.
	 *
	 * Written by a Branch on Is A, and read by an implicit Cast. Keyed by where
	 * the value came *from* — a node and a pin — rather than by the text it
	 * compiles to, because the text can be a local in one place and an inlined
	 * expression in another and it is the same value either way.
	 *
	 * Scoped exactly as bindings are, which is the whole point: a narrowing
	 * holds inside the arm that tested for it and nowhere else. The False arm of
	 * the same Branch gets a fresh scope and knows nothing.
	 */
	narrowings = new Map<string, Set<string>>();
	/**
	 * What opened this scope. A `function` is a function or handler body, which
	 * runs when it is called rather than where it is written — so a loop
	 * enclosing the declaration does not enclose the body.
	 */
	constructor(readonly parent?: Scope, readonly kind: "block" | "loop" | "function" = "block") {}

	lookup(key: string): string | undefined {
		return this.bindings.get(key) ?? this.parent?.lookup(key);
	}

	/** The classes this value is known to be here, innermost test first. */
	narrowedTo(key: string): Set<string> | undefined {
		return this.narrowings.get(key) ?? this.parent?.narrowedTo(key);
	}

	/** Whether `break` and `continue` are allowed here: a loop, short of a function. */
	inLoop(): boolean {
		if (this.kind === "loop") return true;
		if (this.kind === "function") return false;
		return this.parent?.inLoop() ?? false;
	}
}

/** Variadic input pins are numbered: a0, a1, a2. */
export const VARIADIC_PIN = /^a\d+$/;

/** The identifier an input pin is bound to while its logic compiles. */
export const logicInputName = (pinId: string) => `__rsw_in_${pinId}`;
/** The identifier an output pin is assigned to while its logic compiles. */
export const logicOutputName = (pinId: string) => `__rsw_out_${pinId}`;
