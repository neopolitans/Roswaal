/**
 * What a script declares as its flow reaches it, in the order the file does.
 *
 * Two kinds of declaration live in a script. The top of the file, which
 * Roswaal arranges in bands -- services, requires, variables -- and the
 * flow, declared where the flow reaches it, in the author's order: a Declare
 * Local, a Declare Function, a type declared where it is used, and in an
 * older file imported as it was, the locals, functions and requires its Code
 * Blocks hold. Splitting the flow's by kind would misstate the order, so this
 * lists them as one list, read from the compiled file itself.
 *
 * And the names the file sets at its top level without `local`, by
 * assignment or `function foo()`: globals, which older files declare most of
 * their state with.
 *
 * Pure: the compiled Luau and its source map in, the lists out.
 */

import type { Binding, Expr, Stat } from "./luau/ast.js";
import { luauFile } from "./luau/file.js";

export type DeclarationKind = "type" | "local" | "function" | "require";

export interface FlowDeclaration {
	kind: DeclarationKind;
	name: string;
	/** The line of the generated file, from 1. */
	line: number;
	/** The node that wrote it: a Declare Local, a Code Block. */
	node: string;
	/**
	 * A local's type as the file gives it: its annotation, or a literal's
	 * kind and value. Read from the Luau, so a Code Block has one too.
	 */
	detail?: string;
}

export interface GlobalName {
	name: string;
	/** Where it is first set. */
	line: number;
	node?: string;
	/** \`function foo()\`, or \`foo = …\`. */
	how: "function" | "assignment";
}

const isRequire = (value: Expr | undefined): boolean =>
	value?.kind === "call" && value.callee.kind === "name" && value.callee.name === "require";

/**
 * The flow's declarations and the globals, in file order. Lines no node wrote
 * -- the services, the requires and variables Roswaal hoists -- are the top
 * of the file, not the flow, and are left out of the first list.
 */
export function scriptOrder(
	code: string,
	sourceMap: readonly { line: number; node: string }[],
): { flow: FlowDeclaration[]; globals: GlobalName[] } {
	const nodeAt = new Map(sourceMap.map((entry) => [entry.line, entry.node]));
	const starts: number[] = [0];
	for (let i = 0; i < code.length; i++) if (code[i] === "\n") starts.push(i + 1);
	const lineOf = (offset: number) => {
		let lo = 0;
		let hi = starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (starts[mid] <= offset) lo = mid;
			else hi = mid - 1;
		}
		return lo + 1;
	};

	let block: Stat[];
	try {
		block = luauFile(code).block;
	} catch {
		return { flow: [], globals: [] };
	}

	const flow: FlowDeclaration[] = [];
	const globals: GlobalName[] = [];
	const locals = new Set<string>();
	const seenGlobal = new Set<string>();
	const add = (kind: DeclarationKind, name: string, at: number, detail?: string) => {
		const line = lineOf(at);
		const node = nodeAt.get(line);
		if (node) flow.push({ kind, name, line, node, ...(detail ? { detail } : {}) });
	};
	const localDetail = (binding: Binding, value: Expr | undefined): string | undefined => {
		if (binding.type) return code.slice(binding.type.start, binding.type.end);
		switch (value?.kind) {
			case "number":
				return `number ${value.raw}`;
			case "boolean":
				return `boolean ${value.value}`;
			case "string":
				return "string";
			case "table":
				return "table";
			default:
				return undefined;
		}
	};
	const global = (name: string, at: number, how: GlobalName["how"]) => {
		if (locals.has(name) || seenGlobal.has(name)) return;
		seenGlobal.add(name);
		const line = lineOf(at);
		const node = nodeAt.get(line);
		globals.push({ name, line, how, ...(node ? { node } : {}) });
	};

	for (const stat of block) {
		switch (stat.kind) {
			case "local":
			case "const":
				stat.names.forEach((binding, i) => {
					locals.add(binding.name);
					const value = stat.values[i];
					if (isRequire(value)) add("require", binding.name, stat.start);
					else add("local", binding.name, stat.start, localDetail(binding, value));
				});
				break;
			case "localFunction":
				locals.add(stat.name.name);
				add("function", stat.name.name, stat.start);
				break;
			case "typeAlias":
				add("type", stat.name.name, stat.start);
				break;
			case "functionStat":
				// \`function foo()\` sets a global; \`function M.foo()\` sets a field.
				if (stat.path.length === 1 && !stat.method) {
					const name = stat.path[0].name;
					if (locals.has(name)) break;
					global(name, stat.start, "function");
					add("function", name, stat.start);
				}
				break;
			case "assign":
				for (const target of stat.targets)
					if (target.kind === "name") global(target.name, stat.start, "assignment");
				break;
			default:
				break;
		}
	}
	return { flow, globals };
}
