/**
 * What is in the DataModel, as far as the project knows -- the place's
 * instances, and the scripts and folders its node maps put there -- and what
 * code says about it: which child `ReplicatedStorage.Shared.Util` names, and
 * whether it is there.
 *
 * Code often reaches for things made while the game runs -- a character, a
 * player's GUI, a part spawned in Workspace -- so a name is only called
 * missing where what holds it is known to be settled: the containers a place
 * and a Rojo project fill before anything runs.
 */

import type { Block, Expr } from "./ast.js";
import { parseChunk } from "./parser.js";
import { stringValue } from "./infer.js";
import { targetOf, type RequireTarget } from "./requires.js";
import { contains, visitBlock } from "./visit.js";
import { ENGINE } from "../robloxEngine.js";

export interface InstanceNode {
	name: string;
	className: string;
	children: Map<string, InstanceNode>;
	/** Put there by the project's files through a node map, not read from the place. */
	fromProject?: boolean;
}

/** `[class, name, parent, flags]`, the place outline's node shape. */
export interface InstanceOutline {
	classes: string[];
	nodes: [number, string, number, number][];
}

/** A node from the project's files rather than the place: bit 2 of its flags. */
export const FROM_PROJECT = 2;

/** The DataModel, from an outline: its children are the services. */
export function indexFromOutline(outline: InstanceOutline): InstanceNode {
	const root: InstanceNode = { name: "game", className: "DataModel", children: new Map() };
	const made: InstanceNode[] = [];
	outline.nodes.forEach(([cls, name, parent, flags], i) => {
		const node: InstanceNode = {
			name,
			className: outline.classes[cls],
			children: new Map(),
			...(flags & FROM_PROJECT ? { fromProject: true } : {}),
		};
		made[i] = node;
		const holder = parent === -1 ? root : made[parent];
		// Two siblings of one name: the first is the one a path reaches.
		if (holder && !holder.children.has(name)) holder.children.set(name, node);
	});
	return root;
}

export function nodeAt(root: InstanceNode, path: readonly string[]): InstanceNode | undefined {
	let node: InstanceNode | undefined = root;
	for (const name of path) node = node?.children.get(name);
	return node;
}

/**
 * Containers a place and a Rojo project fill before the game runs. Workspace
 * and Players are not: characters, spawned parts and players' GUIs arrive
 * while it does, and a name missing there is ordinary.
 */
const SETTLED = new Set([
	"ReplicatedStorage", "ReplicatedFirst", "ServerScriptService", "ServerStorage",
	"StarterGui", "StarterPack", "StarterPlayer", "Lighting", "SoundService", "Teams",
]);

/** Whether a name is a property, method, event or callback of the class, or one above it. */
export function isMemberOf(className: string, name: string): boolean {
	for (let cls: string | undefined = className; cls; cls = ENGINE.classes[cls]?.superclass) {
		const c = ENGINE.classes[cls];
		if (!c) break;
		if (c.properties.some((m) => m.name === name) || c.methods.some((m) => m.name === name)
			|| c.events.some((m) => m.name === name) || c.callbacks.some((m) => m.name === name)) return true;
	}
	return false;
}

/** An instance path an expression names, absolute from `game`, when the code says. */
function pathOf(expr: Expr, src: string, block: Block, self: readonly string[] | undefined): string[] | undefined {
	const target = targetOf(expr, src, 0, block);
	return target ? absolute(target, self) : undefined;
}

function absolute(target: RequireTarget, self: readonly string[] | undefined): string[] | undefined {
	if (target.t !== "instance") return undefined;
	const out = target.from === "game" ? [] : self ? [...self] : undefined;
	if (!out) return undefined;
	for (const name of target.names) {
		if (name === "..") {
			if (out.pop() === undefined) return undefined;
		} else {
			out.push(name);
		}
	}
	return out;
}

export interface InstanceProblem {
	from: number;
	to: number;
	message: string;
}

/**
 * Names code reaches for under a settled container that neither the place nor
 * the project has: `Shared.Utill` beside `Shared.Util`. `self` is the file's
 * own instance path, for `script.Parent`; without it only paths from `game`
 * and services are checked.
 */
export function instanceProblems(src: string, root: InstanceNode, self?: readonly string[]): InstanceProblem[] {
	const parsed = parseChunk(src);
	if (parsed.errors.length > 0) return [];
	const block = parsed.value;
	const out: InstanceProblem[] = [];
	const check = (holderExpr: Expr, name: string, from: number, to: number, how: "index" | "wait") => {
		const path = pathOf(holderExpr, src, block, self);
		if (!path || path.length === 0 || !SETTLED.has(path[0])) return;
		const holder = nodeAt(root, path);
		if (!holder || holder.children.has(name) || name === "Parent") return;
		if (how === "index" && isMemberOf(holder.className, name)) return;
		const where = path.join(".");
		out.push({
			from, to,
			message: how === "wait"
				? `Nothing called "${name}" is in ${where}, in the place or the project. WaitForChild will wait for it.`
				: `${where} has no child called "${name}" in the place or the project, and ${holder.className} has no member of that name.`,
		});
	};
	visitBlock(block, {
		expr: (expr) => {
			if (expr.kind === "index") {
				check(expr.object, expr.name.name, expr.name.start, expr.name.end, "index");
			} else if (expr.kind === "methodCall" && expr.method.name === "WaitForChild" && expr.args[0]?.kind === "string") {
				const name = stringValue(expr.args[0]);
				if (name !== undefined) check(expr.object, name, expr.args[0].start, expr.args[0].end, "wait");
			}
		},
	});
	return out;
}

/** The instance a name in code stands for, at `pos`: for hover. */
export function instanceAt(
	src: string, pos: number, root: InstanceNode, self?: readonly string[],
): { from: number; to: number; path: string[]; node: InstanceNode } | undefined {
	const parsed = parseChunk(src);
	if (parsed.errors.length > 0) return undefined;
	const block = parsed.value;
	let found: { from: number; to: number; expr: Expr } | undefined;
	visitBlock(block, {
		stat: () => !found,
		expr: (expr) => {
			if (found) return false;
			if (expr.kind === "index" && contains(expr.name, pos)) {
				found = { from: expr.name.start, to: expr.name.end, expr };
			} else if (expr.kind === "methodCall" && (expr.method.name === "WaitForChild" || expr.method.name === "FindFirstChild")
				&& expr.args[0]?.kind === "string" && contains(expr.args[0], pos)) {
				found = { from: expr.args[0].start, to: expr.args[0].end, expr };
			}
			return !found;
		},
	});
	if (!found) return undefined;
	const path = pathOf(found.expr, src, block, self);
	const node = path ? nodeAt(root, path) : undefined;
	return path && node ? { from: found.from, to: found.to, path, node } : undefined;
}

/**
 * The children of the instance a chain of names ends at, for completion:
 * `ReplicatedStorage.Shared.` gives Shared's children. The chain is read from
 * the text before the cursor, since code being typed does not parse; its
 * first name is a local, looked up in the text above, or `game` or `script`.
 */
export function childrenOfChain(
	src: string, pos: number, chain: readonly string[], root: InstanceNode, self?: readonly string[],
): InstanceNode[] {
	if (chain.length === 0) return [];
	const [head, ...rest] = chain;
	let base: string[] | undefined;
	if (head === "game") base = [];
	else if (head === "workspace") base = ["Workspace"];
	else if (head === "script") base = self ? [...self] : undefined;
	else {
		// The local's own declaration, read from the text above the cursor.
		const before = src.slice(0, pos);
		const decl = new RegExp(`local\\s+${head}\\s*(?::[^=\\n]+)?=\\s*([^\\n]+)`, "g");
		let last: RegExpExecArray | null = null;
		for (let m = decl.exec(before); m; m = decl.exec(before)) last = m;
		if (last) {
			const parsed = parseChunk(`local __ = ${last[1]}`);
			const stat = parsed.value[0];
			const value = stat && stat.kind === "local" ? stat.values[0] : undefined;
			const target = value ? targetOf(value, before) : undefined;
			base = target ? absolute(target, self) : undefined;
		}
	}
	if (!base) return [];
	const node = nodeAt(root, [...base, ...rest.map((n) => (n === "Parent" ? ".." : n))].reduce<string[]>((acc, n) => {
		if (n === "..") acc.pop();
		else acc.push(n);
		return acc;
	}, []));
	return node ? [...node.children.values()] : [];
}
