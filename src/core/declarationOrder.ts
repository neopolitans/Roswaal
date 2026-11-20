/**
 * Moving a declaration up or down the top of the file, from the Variables
 * panel, and whether the move is safe.
 *
 * Services, modules and variables are lists in the graph already, so a move
 * reorders the list and the Luau follows. Each move is one of three:
 *
 * - **safe**, done at once: a service (fetching one has no effect), or a
 *   variable whose value is plain;
 * - **asks**: the move changes when something runs, though nothing breaks --
 *   a require runs its module, a value that calls something runs the call;
 * - **refused**, with the reason and the rows involved: a variable above one
 *   its value uses, or a module out of its band.
 *
 * Pure, so the panel and the tests ask the same question.
 */

import { parseInstancePath } from "./modules.js";
import { isService } from "./roblox.js";
import type { NodeScript, ScriptModule, ScriptVariable } from "./schema.js";

export type Where = "before" | "after";
export type ReorderKind = "service" | "module" | "variable";

export interface MoveCheck {
	ok: boolean;
	/** Why not, when refused. */
	reason?: string;
	/** The rows the refusal is about, to light up. */
	needs?: string[];
	/** Why it asks first, when the move changes when something runs. */
	asks?: string;
}

/** `list` with `id` moved to just before or after `target`. */
export function moveIn<T>(
	list: readonly T[],
	key: (item: T) => string,
	id: string,
	target: string,
	where: Where,
): T[] {
	const moving = list.find((item) => key(item) === id);
	if (moving === undefined || id === target) return [...list];
	const rest = list.filter((item) => key(item) !== id);
	const at = rest.findIndex((item) => key(item) === target);
	if (at < 0) return [...list];
	rest.splice(where === "before" ? at : at + 1, 0, moving);
	return rest;
}

/**
 * The band a module's require is written in: "free" when it needs nothing
 * above it (a string, or through `script`), else the service it reads.
 */
export function moduleBand(module: ScriptModule): string {
	const parsed = parseInstancePath(module.specifier);
	if (!parsed || !("path" in parsed)) return "free";
	const root = parsed.path.root;
	return isService(root) ? root : "free";
}

function checkModule(script: NodeScript, id: string, target: string): MoveCheck {
	const modules = script.modules ?? [];
	const moving = modules.find((m) => m.id === id);
	const onto = modules.find((m) => m.id === target);
	if (!moving || !onto) return { ok: false, reason: "That is not a module here." };
	const band = moduleBand(moving);
	if (band !== moduleBand(onto)) {
		return {
			ok: false,
			reason:
				band === "free"
					? `${moving.name} needs nothing above it, so it stays with the requires before the services. Changing its path is what moves it.`
					: `${moving.name} is required through ${band}, so it stays under ${band}. Changing its path is what moves it.`,
			needs: [onto.id],
		};
	}
	return {
		ok: true,
		asks: "A require runs its module the first time, so this changes which module runs first.",
	};
}

/** The names a variable's starting value reads, when it is Luau rather than a plain value. */
function namesRead(variable: ScriptVariable): Set<string> {
	if (variable.default.t !== "raw") return new Set();
	return new Set(variable.default.v.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
}

/** Whether a starting value runs something: a call, or a new instance. */
function runsSomething(variable: ScriptVariable): boolean {
	return variable.default.t === "raw" && /[(:]/.test(variable.default.v);
}

function checkVariable(script: NodeScript, id: string, target: string, where: Where): MoveCheck {
	const next = moveIn(script.variables, (v) => v.id, id, target, where);
	for (let i = 0; i < next.length; i++) {
		const reads = namesRead(next[i]);
		const later = next.slice(i + 1).filter((v) => reads.has(v.name));
		if (later.length > 0) {
			return {
				ok: false,
				reason: `${next[i].name} uses ${later.map((v) => v.name).join(" and ")}, which would then be declared below it.`,
				needs: [next[i].id, ...later.map((v) => v.id)].filter((n) => n !== id),
			};
		}
	}
	const moving = script.variables.find((v) => v.id === id);
	return moving && runsSomething(moving)
		? {
				ok: true,
				asks: `${moving.name}'s starting value runs something, so it would run at a different moment.`,
			}
		: { ok: true };
}

/** Whether moving `id` before or after `target` is safe, asks first, or is refused. */
export function checkMove(
	script: NodeScript,
	kind: ReorderKind,
	id: string,
	target: string,
	where: Where,
): MoveCheck {
	if (id === target) return { ok: false, reason: "That is where it is." };
	if (kind === "service") return { ok: true };
	if (kind === "module") return checkModule(script, id, target);
	return checkVariable(script, id, target, where);
}

/** The graph with the move made: the list reordered, so the Luau follows. */
export function reorder(
	script: NodeScript,
	kind: ReorderKind,
	id: string,
	target: string,
	where: Where,
): NodeScript {
	if (kind === "service")
		return { ...script, services: moveIn(script.services ?? [], (s) => s, id, target, where) };
	if (kind === "module")
		return { ...script, modules: moveIn(script.modules ?? [], (m) => m.id, id, target, where) };
	return { ...script, variables: moveIn(script.variables, (v) => v.id, id, target, where) };
}
