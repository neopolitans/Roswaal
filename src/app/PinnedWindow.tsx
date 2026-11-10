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

import {
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";

import { PanelBody } from "./Cards.jsx";
import { Icon } from "./icons.jsx";
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

/** A frame moved back into the browser's window: all of it across, and its header down. */
function inReach(frame: PinnedFrame): PinnedFrame {
	return {
		...frame,
		x: Math.min(Math.max(frame.x, 0), Math.max(0, innerWidth - frame.w)),
		y: Math.min(Math.max(frame.y, 0), Math.max(0, innerHeight - 40)),
	};
}

/** Whether a press is on something in the header that is a control of its own. */
const onControl = (target: Element) =>
	target.closest("button, input, select, textarea, a, [draggable='true']") !== null;

export function PinnedWindow({
	title,
	frame,
	onFrame,
	onDock,
	children,
}: {
	title: string;
	frame: PinnedFrame;
	onFrame: (frame: PinnedFrame) => void;
	/** Into the Properties panel, under what it follows. */
	onDock: () => void;
	children: ReactNode;
}) {
	const [slot, setSlot] = useState<HTMLElement | null>(null);
	// The frame while it is being dragged, held here and handed up once, on
	// release: handed up every move, the whole editor drew again each frame.
	const [live, setLive] = useState<PinnedFrame | null>(null);
	// Kept in reach of the browser's window: a window made while it was full
	// screen came back off the edge when it was not.
	const [, setViewport] = useState(0);
	useEffect(() => {
		const again = () => setViewport((n) => n + 1);
		addEventListener("resize", again);
		return () => removeEventListener("resize", again);
	}, []);
	const shown = inReach(live ?? frame);
	const follow = (next: PinnedFrame, last: { frame: PinnedFrame }) => {
		last.frame = next;
		setLive(next);
	};
	const settle = (last: { frame: PinnedFrame }) => {
		onFrame(last.frame);
		setLive(null);
	};

	/** Held from the press, as FloatingCard's are: a window worked out move by move walks away. */
	const move = (e: ReactPointerEvent<HTMLElement>) => {
		if (e.button !== 0 || !(e.target instanceof Element) || onControl(e.target)) return;
		if (!e.target.closest(".card-head")) return;
		e.preventDefault();
		const from = shown;
		const last = { frame: from };
		const [x0, y0] = [e.clientX, e.clientY];
		trackPointer(e, {
			move: (m) =>
				follow(
					{
						...from,
						x: from.x + m.clientX - x0,
						y: from.y + m.clientY - y0,
					},
					last,
				),
			end: () => settle(last),
		});
	};

	const resize = (e: ReactPointerEvent<HTMLElement>, edge: string) => {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		const from = shown;
		const last = { frame: from };
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
				follow(next, last);
			},
			end: () => settle(last),
		});
	};

	return createPortal(
		<section
			className="card float-panel pinned-window"
			style={{ left: shown.x, top: shown.y, width: shown.w, height: shown.h }}
			onPointerDown={move}
		>
			<header className="card-head" title="Drag to move">
				<span className="card-title">{title}</span>
				<span className="card-slot" ref={setSlot} />
				<button
					type="button"
					className="tb icon-only"
					title="Dock in the Properties panel, under what it follows"
					aria-label="Dock in Properties"
					onClick={onDock}
				>
					<Icon name="panelRight" size={14} />
				</button>
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

/**
 * A pin docked in the Properties panel, under the instance the panel follows:
 * its own header, which the Properties it holds fills, folded or open, and a
 * button to float it in a window again.
 */
export function DockedPin({ onFloat, children }: { onFloat: () => void; children: ReactNode }) {
	const [slot, setSlot] = useState<HTMLElement | null>(null);
	const [open, setOpen] = useState(true);
	// Docked under a long Properties, it would land out of sight: brought into view.
	const here = useRef<HTMLElement>(null);
	// A block, so it returns nothing: Chromium's scrollIntoView returns a promise now,
	// which React would take for the effect's cleanup and call.
	useEffect(() => {
		void here.current?.scrollIntoView({ block: "nearest" });
	}, []);
	return (
		<section className="docked-pin" ref={here}>
			<header className="docked-pin-head">
				<button
					type="button"
					className="tb icon-only"
					title={open ? "Fold" : "Unfold"}
					aria-expanded={open}
					onClick={() => setOpen(!open)}
				>
					<Icon name="chevron" size={14} rotate={open ? 0 : -90} />
				</button>
				<Icon name="pin" size={13} />
				<span className="docked-pin-slot" ref={setSlot} />
				<button
					type="button"
					className="tb icon-only"
					title="Float in a window of its own"
					aria-label="Float in a window"
					onClick={onFloat}
				>
					<Icon name="expandContent" size={13} />
				</button>
			</header>
			<div className="docked-pin-body" hidden={!open}>
				<PanelBody slot={slot}>{children}</PanelBody>
			</div>
		</section>
	);
}
