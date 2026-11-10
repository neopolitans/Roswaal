/**
 * A Properties panel pinned to one instance, in a window of its own.
 *
 * The docked Properties follows what is picked; a pin keeps what it shows and
 * leaves the docked one free, so several instances can be read side by side.
 * Not one of the layout's panels: those are a fixed set, one of each, and
 * there can be any number of these. Moved by its header and resized from its
 * edges, as a floating card is, and laid over the editor in a layer of its
 * own, under the menus and dialogs.
 */

import { type ReactNode, type PointerEvent as ReactPointerEvent, useState } from "react";
import { createPortal } from "react-dom";

import { PanelBody } from "./Cards.jsx";
import { trackPointer } from "./pointer.js";

export interface PinnedFrame {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Smallest a pinned window is dragged to, so its header and a row or two survive. */
const MIN = { w: 240, h: 160 };
const EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

/** Whether a press is on something in the header that is a control of its own. */
const onControl = (target: Element) =>
	target.closest("button, input, select, textarea, a, [draggable='true']") !== null;

export function PinnedWindow({
	title,
	frame,
	onFrame,
	children,
}: {
	title: string;
	frame: PinnedFrame;
	onFrame: (frame: PinnedFrame) => void;
	children: ReactNode;
}) {
	const [slot, setSlot] = useState<HTMLElement | null>(null);

	/** Held from the press, as FloatingCard's are: a window worked out move by move walks away. */
	const move = (e: ReactPointerEvent<HTMLElement>) => {
		if (e.button !== 0 || !(e.target instanceof Element) || onControl(e.target)) return;
		if (!e.target.closest(".card-head")) return;
		e.preventDefault();
		const from = frame;
		const [x0, y0] = [e.clientX, e.clientY];
		trackPointer(e, {
			move: (m) =>
				onFrame({
					...from,
					x: Math.min(Math.max(from.x + m.clientX - x0, 8 - from.w + 80), innerWidth - 80),
					y: Math.min(Math.max(from.y + m.clientY - y0, 0), innerHeight - 40),
				}),
		});
	};

	const resize = (e: ReactPointerEvent<HTMLElement>, edge: string) => {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		const from = frame;
		const [x0, y0] = [e.clientX, e.clientY];
		trackPointer(e, {
			move: (m) => {
				const dx = m.clientX - x0;
				const dy = m.clientY - y0;
				const next = { ...from };
				if (edge.includes("e")) next.w = Math.max(MIN.w, from.w + dx);
				if (edge.includes("s")) next.h = Math.max(MIN.h, from.h + dy);
				if (edge.includes("w")) {
					const take = Math.min(dx, from.w - MIN.w);
					next.x = from.x + take;
					next.w = from.w - take;
				}
				if (edge.includes("n")) {
					const take = Math.min(dy, from.h - MIN.h);
					next.y = from.y + take;
					next.h = from.h - take;
				}
				onFrame(next);
			},
		});
	};

	return createPortal(
		<section
			className="card float-panel pinned-window"
			style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
			onPointerDown={move}
		>
			<header className="card-head" title="Drag to move">
				<span className="card-title">{title}</span>
				<span className="card-slot" ref={setSlot} />
			</header>
			<div className="panel panel-properties card-body">
				<PanelBody slot={slot}>{children}</PanelBody>
			</div>
			{EDGES.map((edge) => (
				<div
					key={edge}
					className={`card-size ${edge}`}
					title="Drag to resize"
					onPointerDown={(e) => resize(e, edge)}
				/>
			))}
		</section>,
		document.body,
	);
}
