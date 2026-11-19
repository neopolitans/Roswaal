/**
 * The Roblox class a node names itself, for the class icon in its header.
 *
 * Only a class the node's own settings say, never one read off a wire: an icon
 * that came and went as wires changed would be noise, and moving pins under it
 * worse. So: Get Service's service, Service Function and Value's, New Instance
 * and the Find Firsts' class, Instance (path)'s, Local Player's Player. Read the
 * way the node already reads it -- the pins it derives, or its own config -- so
 * the icon and the output pin cannot say different things.
 *
 * Nothing for Instance, Folder or a class the catalogue has no icon for: an
 * icon that says nothing is clutter.
 */

import { classIconOf } from "./classIcons.js";
import { CLASS_TYPED, instancePathClass } from "./nodes/library.js";
import { isInstanceClass } from "./roblox.js";
import type { GraphNode, NodeDef } from "./schema.js";
import { SERVICE_CALL, SERVICE_VALUE, serviceOf } from "./serviceCalls.js";

/** Nodes whose own output pin is narrowed to the class they name. */
const BY_OUTPUT = new Set(["roblox.getService", "players.localPlayer"]);

export function nodeClassOf(
	def: Pick<NodeDef, "id" | "outputs" | "derivePins"> | undefined,
	node: Pick<GraphNode, "config" | "literals">,
): string | undefined {
	if (!def) return undefined;
	let name: string | undefined;
	if (def.id === SERVICE_CALL || def.id === SERVICE_VALUE) name = serviceOf(node.config);
	else if (def.id === "roblox.instancePath") name = instancePathClass(node.config);
	else if (CLASS_TYPED.has(def.id) || BY_OUTPUT.has(def.id)) {
		const outputs = def.derivePins?.(node.config ?? {}, node.literals)?.outputs ?? def.outputs;
		name = outputs.find((pin) => isInstanceClass(pin.type) && pin.type !== "Instance")?.type;
	}
	if (!name || name === "Instance" || name === "Folder" || !classIconOf(name)) return undefined;
	return name;
}
