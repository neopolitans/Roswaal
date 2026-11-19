/**
 * The class a node names itself, which its header's icon shows: from its own
 * settings, as its output pin reads them, and never off a wire.
 */

import { describe, expect, it } from "vitest";

import { NODE } from "../src/app/layers.js";
import { nodeColor, pinColor } from "../src/app/palette.js";
import { DEFAULTS } from "../src/app/preferences.js";
import { previewOf, previewSvg } from "../src/core/docs/preview.js";
import { nodeWidth } from "../src/core/nodeBox.js";
import { nodeClassOf } from "../src/core/nodeClass.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { GraphNode } from "../src/core/schema.js";

const registry = createRegistry();
const classOf = (def: string, node: Parameters<typeof nodeClassOf>[1] = {}) =>
	nodeClassOf(registry.get(def), node);
const text = (v: string) => ({ t: "string" as const, v });

describe("the class a node names", () => {
	it("is Get Service's service", () => {
		expect(classOf("roblox.getService", { literals: { service: text("ReplicatedStorage") } })).toBe(
			"ReplicatedStorage",
		);
		// Its pin's own default, before anybody picks.
		expect(classOf("roblox.getService")).toBe("Players");
	});

	it("is a Service Function's service", () => {
		expect(
			classOf("roblox.serviceValue", { config: { service: "RunService", method: "IsServer" } }),
		).toBe("RunService");
	});

	it("is the class New Instance makes, and a Find First's", () => {
		expect(classOf("roblox.instanceNew", { literals: { className: text("RemoteEvent") } })).toBe(
			"RemoteEvent",
		);
		expect(
			classOf("instance.findFirstChildWhichIsA", { literals: { className: text("Humanoid") } }),
		).toBe("Humanoid");
	});

	it("is the class a wired Class Name is known to carry, and nothing when it is not known", () => {
		expect(
			classOf("roblox.instanceNew", {
				literals: { className: text("Part") },
				config: { wiredClass: "Attachment" },
			}),
		).toBe("Attachment");
		expect(classOf("roblox.instanceNew", { config: { wiredClass: "" } })).toBeUndefined();
	});

	it("widens a wide node by the icon's room, and only a node with a tab", () => {
		const make = registry.get("roblox.instanceNew")!;
		// The same node under an id that names no class: only the icon differs.
		const plain = { ...make, id: "test.plainNew" };
		const node: GraphNode = {
			id: "n",
			def: make.id,
			x: 0,
			y: 0,
			label: "Make the remote this whole module waits on",
			literals: { className: text("RemoteEvent") },
		};
		expect(nodeWidth(make, node, true) - nodeWidth(plain, node, true)).toBe(NODE.classIcon);
		// A truncating node keeps its width; the title gives the room.
		expect(nodeWidth(make, node, false)).toBe(nodeWidth(plain, node, false));
	});

	it("is drawn in the docs' pictures: after the tab, or in a value's glyph's place", () => {
		const options = { geometry: NODE, nodeColor, pinColor };
		const made = previewSvg(
			previewOf(registry.get("roblox.instanceNew")!, {}, { className: text("RemoteEvent") }),
			options,
		);
		expect(made).toContain('class="node-class"');
		expect(made).not.toContain("has-class");

		const service = previewSvg(
			previewOf(registry.get("roblox.getService")!, {}, { service: text("ReplicatedStorage") }),
			options,
		);
		expect(service).toContain('class="node-class"');
		// The glyph stays for a reader who turns the icons off, hidden unless a stylesheet says.
		expect(service).toContain('class="node-glyph has-class" display="none"');

		const branch = previewSvg(previewOf(registry.get("flow.branch")!), options);
		expect(branch).not.toContain("node-class");
	});

	it("is shown on nodes and not in pickers until Settings says", () => {
		expect(DEFAULTS.nodeClassIcons).toBe(true);
		expect(DEFAULTS.pickerClassIcons).toBe(false);
	});

	it("is nothing for Instance, Folder, a name with no icon, or a node that names no class", () => {
		expect(
			classOf("roblox.instanceNew", { literals: { className: text("Folder") } }),
		).toBeUndefined();
		expect(
			classOf("roblox.instanceNew", { literals: { className: text("NoSuchClass") } }),
		).toBeUndefined();
		expect(classOf("flow.branch")).toBeUndefined();
	});
});
