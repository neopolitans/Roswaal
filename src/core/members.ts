/**
 * What **Get Member** can offer, for the value wired into it.
 *
 * The question is answered from the *pin*, not from the value: a wire carries a
 * type, and the type is what knows its members. `Get Local: input` gives a pin
 * typed `Input`, `Input` is declared a few nodes away as a table of fields, and
 * those fields are the list. Nothing is inferred beyond that — a pin typed
 * `any` offers nothing, and offering nothing is the answer that sends somebody
 * to Get Field, which is the node for a table nobody can make promises about.
 *
 * Three places a type's members can come from, in the order they are looked
 * for:
 *
 * 1. **This graph's own declared types**, read off the Declare Type nodes.
 * 2. **A required module's exported types**, which arrive as a map because
 *    reading another graph is the daemon's job rather than the compiler's.
 * 3. **A Roblox class**, whose properties the engine fixes — only in a graph
 *    that compiles to Roblox, since a Lune program has no `BasePart`.
 *
 * In core rather than in the editor because both ends need the same answer: the
 * picker offers a member, and the compiler refuses one the type does not have.
 * Two opinions about what `Input` holds would mean a list that offers a field
 * the build then rejects.
 */

import type { NodeScript } from "./schema.js";
import type { Registry } from "./nodes/index.js";
import { resolveNodePins } from "./nodes/index.js";
import { declaredTypeFields, type TypeField } from "./typeFields.js";
import { propertiesOf } from "./robloxProperties.js";

export interface MemberLookup {
	/** The graph the node is in, as a script. */
	script: Pick<NodeScript, "nodes" | "links" | "target">;
	registry: Registry;
	/**
	 * Types a required module exports, by the name this graph writes them as —
	 * `Config.Tuning`. Absent in the compiler, which does not read other
	 * graphs; the editor has them from the daemon.
	 */
	external?: ReadonlyMap<string, readonly TypeField[]>;
}

/**
 * The type a pin receives, as the graph writes it, or nothing.
 *
 * The *source* pin's type, because that is where a value's type is decided: an
 * input pin is typed `any` on Get Member and says nothing about what arrived.
 */
export function typeInto(
	lookup: MemberLookup, nodeId: string, pinId: string,
): string | undefined {
	const link = lookup.script.links.find((l) => l.to.node === nodeId && l.to.pin === pinId);
	if (!link) return undefined;
	const from = lookup.script.nodes.find((n) => n.id === link.from.node);
	if (!from) return undefined;
	const def = lookup.registry.get(from.def);
	if (!def) return undefined;
	const pins = resolveNodePins(def, from.config, from.literals);
	const pin = pins.outputs.find((p) => p.id === link.from.pin);
	const type = pin?.type?.trim();
	return type === "" || type === undefined ? undefined : type;
}

/**
 * The members of a named type, in the order they were declared.
 *
 * A type that is not a table of fixed fields gives an empty list, and so does
 * one nothing here knows about. The two are the same answer on purpose: Get
 * Member has nothing to offer either way, and the difference — whether the name
 * is declared at all — is the compiler's to report, not the picker's.
 */
export function membersOfType(
	lookup: MemberLookup, typeName: string | undefined,
): readonly TypeField[] {
	const name = typeName?.trim();
	if (!name || name === "any" || name === "table") return [];
	// `Model?` holds the same members as `Model`; the option is about whether
	// there is a value, not about what one contains.
	const bare = name.endsWith("?") ? name.slice(0, -1).trim() : name;

	const declared = declaredTypeFields(lookup.script).get(bare);
	if (declared) return declared;

	const external = lookup.external?.get(bare);
	if (external) return external;

	// Roblox's own, and only where a Roblox build is what is being written.
	if (lookup.script.target !== "lune") return propertiesOf(bare);
	return [];
}

/** What Get Member offers for the value wired into it. */
export function membersFor(lookup: MemberLookup, nodeId: string): readonly TypeField[] {
	return membersOfType(lookup, typeInto(lookup, nodeId, "object"));
}
