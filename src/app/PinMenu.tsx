/**
 * The pin context menu.
 *
 * Right-clicking a pin asks what can be done to *that pin*, which is a
 * different question from "what node do I want next" — and answering the
 * second when you asked the first is why the node palette opening on a pin
 * felt wrong. This is the small menu; the palette is still what the node body
 * and the canvas open.
 *
 * The wording is the familiar one on purpose. A developer who already knows
 * node graphs should find the entry they already know by the name they already
 * know, and "Promote to Variable" is not a phrase to improve on.
 */

import type { Registry } from "../core/nodes/index.js";
import { literalOnlyPins } from "../core/nodes/index.js";
import { pinTypeText } from "../core/nodes/variables.js";
import type { NodeScript, PinDef } from "../core/schema.js";
import { cx } from "./cx.js";
import { canPromoteToVariable, pinLinkCount, splitModesFor } from "./edits.js";
import { Menu } from "./Menu.jsx";
import type { MenuEntry } from "./menuModel.js";
import { pinColor } from "./palette.js";

export interface PinMenuTarget {
	/** Viewport position; the menu is `position: fixed`. */
	screen: { x: number; y: number };
	nodeId: string;
	pin: PinDef;
	side: "in" | "out";
}

export interface PinMenuProps {
	target: PinMenuTarget;
	script: NodeScript;
	registry: Registry;
	onPromote: () => void;
	onBreakLinks: () => void;
	/** Break this pin into components, in the named mode. */
	onSplit: (mode: string) => void;
	/** Put the named parent pin back together. */
	onRecombine: (parent: string) => void;
	onClose: () => void;
}

export function PinMenu({
	target,
	script,
	registry,
	onPromote,
	onBreakLinks,
	onSplit,
	onRecombine,
	onClose,
}: PinMenuProps) {
	const links = pinLinkCount(script, target.nodeId, target.pin.id, target.side);

	// Three kinds of thing to do, each its own section: make it a variable,
	// change its shape, take its wires away. The one that undoes work is last.
	const variable: MenuEntry[] = [];
	const shape: MenuEntry[] = [];
	const wires: MenuEntry[] = [];

	if (canPromoteToVariable(script, registry, target.nodeId, target.pin, target.side)) {
		variable.push({ label: "Promote to Variable", run: onPromote });
	}

	// Split and Recombine, in the familiar wording. A pin is only ever one
	// or the other, so they never both appear.
	const node = script.nodes.find((n) => n.id === target.nodeId);
	const parent = target.pin.part?.parent;

	if (node && parent === undefined) {
		for (const mode of splitModesFor(target.pin)) {
			shape.push({
				key: `split:${mode.id}`,
				label: "Split Struct Pin",
				// Only worth naming the mode when there is a choice to make.
				hint: splitModesFor(target.pin).length > 1 ? mode.name : undefined,
				run: () => onSplit(mode.id),
			});
		}
	}

	if (node && parent !== undefined) {
		shape.push({ label: "Recombine Struct Pin", run: () => onRecombine(parent) });
	}

	if (links > 0) {
		wires.push({
			label: links === 1 ? "Break Link" : `Break ${links} Links`,
			hint: "Shift-click",
			run: onBreakLinks,
		});
	}

	// An empty menu should still answer the question that opened it. The
	// literal-only case is the one worth spelling out: that pin looks like every
	// other value pin and behaves differently, and this is the only place the
	// editor gets to say so before the compiler does.
	function emptyReason(): string {
		const node = script.nodes.find((n) => n.id === target.nodeId);
		const def = node && registry.get(node.def);
		if (def && literalOnlyPins(def).has(target.pin.id)) {
			return "Typed in directly — this becomes part of the generated code, so it takes no wire and no variable.";
		}
		if (target.pin.kind === "exec") return "Nothing to do to an unwired execution pin.";
		if (target.side === "out") return "Nothing to do to an unwired output.";
		return "Nothing to do to this pin yet.";
	}

	const typeLabel = target.pin.kind === "exec" ? "execution" : pinTypeText(target.pin);

	return (
		<Menu
			at={target.screen}
			label={`${target.pin.name || target.pin.id}, ${typeLabel}`}
			className="pin-menu"
			head={
				<div className="pin-head">
					<span
						className={cx("swatch", target.pin.kind)}
						style={{ background: pinColor(target.pin.type, target.pin.kind) }}
					/>
					<span className="name">{target.pin.name || target.pin.id}</span>
					<span className="type">{typeLabel}</span>
				</div>
			}
			sections={[{ entries: variable }, { entries: shape }, { entries: wires }]}
			empty={emptyReason()}
			onClose={onClose}
		/>
	);
}
