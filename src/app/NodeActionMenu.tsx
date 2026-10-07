/**
 * The node context menu, for a node that has something to promote.
 *
 * Right-clicking a node otherwise opens the palette, which answers "what node
 * do I want next". A node that can move to the Variables panel -- a Get
 * Service, a require, a local, a named result -- has a question of its own,
 * asked the way a pin's is: a small menu about *that node*, with the palette
 * one entry away for when the next node is what you wanted after all.
 *
 * The wording is the familiar one, as the pin menu's is: "Promote to Variable".
 */

import type { Registry } from "../core/nodes/index.js";
import type { NodeScript } from "../core/schema.js";
import { Menu } from "./Menu.jsx";
import type { MenuEntry } from "./menuModel.js";
import { promotionsFor } from "./promote.js";
import { store } from "./store.js";

export interface NodeMenuTarget {
	/** Viewport position; the menu is `position: fixed`. */
	screen: { x: number; y: number };
	/** Where the palette would place a node, for Add Node Here. */
	world: { x: number; y: number };
	nodeId: string;
}

export function NodeActionMenu({
	target,
	script,
	registry,
	onAddNode,
	onClose,
}: {
	target: NodeMenuTarget;
	script: NodeScript;
	registry: Registry;
	/** Opens the palette where the menu was. */
	onAddNode: () => void;
	onClose: () => void;
}) {
	const promote: MenuEntry[] = promotionsFor(script, registry, target.nodeId).map((p) => ({
		label: p.label,
		title: p.title,
		run: () => store.edit((s) => p.run(s)),
	}));
	const node = script.nodes.find((n) => n.id === target.nodeId);
	const title = (node && registry.get(node.def)?.title) ?? "Node";

	return (
		<Menu
			at={target.screen}
			label={title}
			className="node-action-menu"
			sections={[{ entries: promote }, { entries: [{ label: "Add Node Here…", run: onAddNode }] }]}
			onClose={onClose}
		/>
	);
}
