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

import { useEffect, useRef } from "react";

import type { NodeScript, PinDef } from "../core/schema.js";
import type { Registry } from "../core/nodes/index.js";
import { literalOnlyPins } from "../core/nodes/index.js";
import { canPromoteToVariable, pinLinkCount, splitModesFor } from "./edits.js";
import { LAYER } from "./layers.js";
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

interface Entry {
	key: string;
	label: string;
	hint?: string;
	onPick: () => void;
}

export function PinMenu(props: PinMenuProps) {
	const { target, script, registry, onClose } = props;
	const root = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const onDown = (e: MouseEvent) => {
			if (!root.current?.contains(e.target as Node)) onClose();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		// Deferred so the click that opened the menu does not close it again.
		const id = window.setTimeout(() => window.addEventListener("mousedown", onDown), 0);
		window.addEventListener("keydown", onKey, true);
		return () => {
			window.clearTimeout(id);
			window.removeEventListener("mousedown", onDown);
			window.removeEventListener("keydown", onKey, true);
		};
	}, [onClose]);

	const links = pinLinkCount(script, target.nodeId, target.pin.id, target.side);

	const entries: Entry[] = [];

	if (canPromoteToVariable(script, registry, target.nodeId, target.pin, target.side)) {
		entries.push({
			key: "promote",
			label: "Promote to Variable",
			onPick: () => {
				props.onPromote();
				onClose();
			},
		});
	}

	// Split and Recombine, in the familiar wording. A pin is only ever one
	// or the other, so they never both appear.
	const node = script.nodes.find((n) => n.id === target.nodeId);
	const parent = target.pin.part?.parent;

	if (node && parent === undefined) {
		for (const mode of splitModesFor(target.pin)) {
			entries.push({
				key: `split:${mode.id}`,
				label: "Split Struct Pin",
				// Only worth naming the mode when there is a choice to make.
				hint: splitModesFor(target.pin).length > 1 ? mode.name : undefined,
				onPick: () => {
					props.onSplit(mode.id);
					onClose();
				},
			});
		}
	}

	if (node && parent !== undefined) {
		entries.push({
			key: "recombine",
			label: "Recombine Struct Pin",
			onPick: () => {
				props.onRecombine(parent);
				onClose();
			},
		});
	}

	if (links > 0) {
		entries.push({
			key: "break",
			label: links === 1 ? "Break Link" : `Break ${links} Links`,
			hint: "Shift-click",
			onPick: () => {
				props.onBreakLinks();
				onClose();
			},
		});
	}

	/**
	 * An empty menu should still answer the question that opened it. The
	 * literal-only case is the one worth spelling out: that pin looks like every
	 * other value pin and behaves differently, and this is the only place the
	 * editor gets to say so before the compiler does.
	 */
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

	// Keep the menu on screen when a pin near an edge is the one clicked.
	const style = {
		zIndex: LAYER.menu,
		left: Math.min(target.screen.x, window.innerWidth - 240),
		top: Math.min(target.screen.y, window.innerHeight - 160),
	};

	const typeLabel = target.pin.kind === "exec" ? "execution" : target.pin.type ?? "any";

	return (
		<div className="menu pin-menu" ref={root} style={style}>
			<div className="pin-head">
				<span
					className={`swatch ${target.pin.kind}`}
					style={{ background: pinColor(target.pin.type, target.pin.kind) }}
				/>
				<span className="name">{target.pin.name || target.pin.id}</span>
				<span className="type">{typeLabel}</span>
			</div>
			<div className="items">
				{entries.map((entry) => (
					<div key={entry.key} className="item" onClick={entry.onPick}>
						<span>{entry.label}</span>
						{entry.hint && <span className="hint">{entry.hint}</span>}
					</div>
				))}
				{entries.length === 0 && <div className="empty">{emptyReason()}</div>}
			</div>
		</div>
	);
}
