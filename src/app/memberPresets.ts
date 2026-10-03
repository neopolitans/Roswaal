/**
 * Node-menu entries for the members of what a graph names: `input.throttle`.
 */

import type { NodeScript } from "../core/schema.js";
import type { Registry } from "../core/nodes/index.js";
import { membersOfType } from "../core/members.js";
import type { ExportedType } from "./api.js";
import type { Preset } from "./NodeMenu.jsx";
import { pinColor } from "./palette.js";
import { requiredTypes } from "./projectTypes.js";
import { configText } from "./nodeConfig.js";

/**
 * One entry per member of anything the graph names: `input.throttle`.
 *
 * Built from the presets rather than beside them, so whatever is offered as a
 * value is offered with its members: a variable, a local, a parameter. Only
 * where the type says what it holds — a declared table type, a required
 * module's, or a Roblox class — since the rest have no members to name.
 *
 * Marked `deep`, which keeps them out of the menu until somebody types: a
 * `BasePart` local has two hundred properties and a list you scroll is not a
 * shortcut. See `Preset.deep`.
 */
export function memberPresets(
	base: Preset[],
	script: NodeScript,
	registry: Registry,
	projectTypes: ExportedType[],
): Preset[] {
	const external = new Map(
		requiredTypes(script, projectTypes)
			.filter((entry) => entry.fields && entry.fields.length > 0)
			.map((entry) => [entry.type, entry.fields!] as const),
	);
	// The whole file: a type is declared once for it, and a link is found by
	// node id whichever graph it is drawn in.
	const lookup = { script, registry, external };

	const out: Preset[] = [];
	for (const preset of base) {
		// The getters, and only them: a Set has nothing to read a member off.
		if (!MEMBER_SOURCES.has(preset.defId)) continue;
		const owner = configText(preset, "name") ?? preset.title.replace(/^Get /, "");
		for (const field of membersOfType(lookup, configText(preset, "type"))) {
			out.push({
				key: `${preset.key}.${field.name}`,
				title: `${owner}.${field.name}`,
				category: preset.category,
				summary: `Reads the ${field.type} member "${field.name}" of ${owner}.`,
				defId: preset.defId,
				config: preset.config,
				color: pinColor(field.type, "data"),
				member: { name: field.name, type: field.type },
				deep: true,
			});
		}
	}
	return out;
}

/** What a `name.member` entry can read a member off. */
const MEMBER_SOURCES = new Set(["variable.get", "local.get", "function.getParam"]);
