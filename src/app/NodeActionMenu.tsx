/**
 * The node context menu: a small menu about *that node*, asked the way a pin's
 * is, with the palette one entry away for when the next node is what you
 * wanted after all.
 *
 * Every node can be pinned, so Realign leaves it where it is (0.182.0). A node
 * that can move to the Variables panel -- a Get Service, a require, a local, a
 * named result -- can also be promoted, in the familiar words the pin menu
 * uses: "Promote to Variable".
 */

import type { Registry } from "../core/nodes/index.js";
import type { NodeScript } from "../core/schema.js";
import { Menu } from "./Menu.jsx";
import type { MenuEntry } from "./menuModel.js";
import { setPinned } from "./edits.js";
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
			sections={[
				{
					entries: [
						{
							label: node?.pinned ? "Unpin" : "Pin",
							title: node?.pinned
								? "Realign lays this node out with the rest again."
								: "Realign leaves this node where it is, and lays the rest out round it.",
							run: () => store.edit((s) => setPinned(s, target.nodeId, !node?.pinned)),
						},
					],
				},
				{ entries: promote },
				{ entries: [{ label: "Add Node Here…", run: onAddNode }] },
			]}
			onClose={onClose}
		/>
	);
}
