/**
 * What a Branch on Is A proves about a value, and whether an implicit Cast
 * inside it has anything left to say.
 *
 * Functions of the `Emitter` they read through; see `emitter.ts`.
 */

import { isSubclassOf } from "../roblox.js";
import { VARIADIC_PIN, type Scope } from "./emitScope.js";
import type { Emitter } from "./emitter.js";
import type { ResolvedNode } from "./graph.js";
import { isIdentifier } from "./luau.js";

/**
 * Where a data input's value comes from, as a key two nodes can agree on.
 *
 * A wire is identified by the pin it leaves, so an Is A and a Cast reading
 * the same For Each loop variable produce the same key. An unwired pin
 * falls back to its own literal, so `Is A` on a typed-in path and a Cast on
 * the same typed-in path also agree.
 */
function valueKey(e: Emitter, r: ResolvedNode, pinId: string): string | undefined {
	const link = e.index.sourceOf(r.node.id, pinId);
	if (link) return `${link.from.node}/${link.from.pin}`;
	const text = e.literalText(r, pinId);
	return text === "" ? undefined : `literal:${text}`;
}

/**
 * What a Branch's condition proves about the values it tests.
 *
 * Only Is A, and only the shapes whose meaning is unambiguous:
 *
 * - `x:IsA("BasePart")` — x is a BasePart.
 * - `a and b` — everything both operands prove, because both hold.
 * - `a or b` — only what *both* operands prove about the same value, as the
 *   union of their classes. This is the `Decal` or `Texture` case: either
 *   branch may be the one that fired, so the value is one of the two and
 *   nothing narrower. A value only one side mentions is not narrowed at all.
 *
 * Anything else contributes nothing, which is the safe direction: a missed
 * narrowing costs a redundant cast, and an invented one is a lie to the
 * typechecker.
 */
export function narrowingsOf(e: Emitter, r: ResolvedNode, pinId: string): Map<string, Set<string>> {
	const feeder = e.feederOf(r.node.id, pinId);
	if (!feeder) return new Map();
	return narrowingsFrom(e, feeder);
}

/**
 * Whether a Cast is claiming exactly what the enclosing arm already proved.
 *
 * Exactly, not merely compatibly, unless the project asks otherwise. A
 * narrowing of `Decal | Texture` and a Cast to `Decal` are different claims
 * — the value might be the other one. So the two sets of class names have to
 * match, which is a rule that can be stated in one sentence on the
 * documentation page and never surprises anybody by dropping a cast that
 * was doing work.
 *
 * With `castsByHierarchy` on, a cast is also dropped when every class the
 * branch proved derives from one the cast claims: `IsA("Part")` already
 * says the value is a `BasePart`. Still never the other way round — proving
 * `BasePart` says nothing about `Part`.
 */
export function alreadyNarrowed(e: Emitter, src: ResolvedNode, scope: Scope): boolean {
	const key = valueKey(e, src, "value");
	if (!key) return false;
	const known = scope.narrowedTo(key);
	if (!known) return false;

	const claimed = e.literalText(src, "type")
		.split("|")
		.map((part) => part.trim())
		.filter((part) => part !== "");
	if (claimed.length === 0) return false;
	if (claimed.length === known.size && claimed.every((part) => known.has(part))) return true;
	if (!e.options.castsByHierarchy) return false;
	return [...known].every((proved) => claimed.some((part) => isSubclassOf(proved, part)));
}

function narrowingsFrom(e: Emitter, node: ResolvedNode, depth = 0): Map<string, Set<string>> {
	const out = new Map<string, Set<string>>();
	if (depth > 8) return out;

	if (node.def.id === "instance.isA") {
		const key = valueKey(e, node, "instance");
		const className = e.literalText(node, "className");
		if (key && isIdentifier(className)) out.set(key, new Set([className]));
		return out;
	}

	const operands = node.inputs
		.filter((p) => VARIADIC_PIN.test(p.id))
		.map((p) => e.feederOf(node.node.id, p.id))
		.filter((f): f is ResolvedNode => f !== undefined);

	if (node.def.id === "logic.and") {
		for (const operand of operands) {
			for (const [key, classes] of narrowingsFrom(e, operand, depth + 1)) {
				const existing = out.get(key);
				if (existing) for (const c of classes) existing.add(c);
				else out.set(key, new Set(classes));
			}
		}
		return out;
	}

	if (node.def.id === "logic.or") {
		// Every operand has to say something about a value for the branch to
		// know anything about it, so this starts from the first and keeps
		// only what survives the rest.
		if (operands.length === 0) return out;
		let shared = narrowingsFrom(e, operands[0], depth + 1);
		for (const operand of operands.slice(1)) {
			const next = narrowingsFrom(e, operand, depth + 1);
			const merged = new Map<string, Set<string>>();
			for (const [key, classes] of shared) {
				const other = next.get(key);
				if (!other) continue;
				merged.set(key, new Set([...classes, ...other]));
			}
			shared = merged;
		}
		return shared;
	}

	return out;
}
