/**
 * A card: one or more panels as tabs, under a header that is the card's handle.
 *
 * The header is the workspace's, not the panel's. It says what the card is --
 * its title, or a tab for each panel in it -- and carries the card's own
 * controls, fold and the menu. What a panel used to put in its own heading
 * (the project's name and its Files | DataModel switch, Variables' Add) it now
 * hands to the header through `PanelHead`, so a panel in a tab still has its
 * controls where a reader looks for them, and nothing is said twice.
 *
 * Script analysis is the exception: its bar is already a header, with its
 * counts and its own chevron, and is the status pill itself at the foot of the
 * window. Its card has no header of its own.
 */

import {
	type CSSProperties,
	createContext,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useContext,
	useState,
} from "react";
import { createPortal } from "react-dom";

import { cx } from "./cx.js";
import { Icon } from "./icons.jsx";
import { type Card, PANEL_TITLES, type PanelId } from "./panels.js";

/** Panels whose own bar is their header. */
export const HEADLESS: ReadonlySet<PanelId> = new Set<PanelId>(["analysis"]);

/** Where a panel's header controls go: its card's header, or nowhere. */
const HeadSlot = createContext<HTMLElement | null>(null);

/**
 * What a panel puts in its card's header: a word beside the title, such as
 * the project's name, and its own controls. Rendered into the header, which
 * is drawn by whoever holds the panel; nothing where there is no header.
 *
 * `lead` is what runs on from the title and takes the room between it and
 * the controls: the Code panel's tabs, one per open field. Its buttons are
 * controls like any other, so pressing one neither drags the card nor folds
 * it, and the strip's empty end is still the card's handle.
 */
export function PanelHead({
	sub,
	lead,
	children,
}: {
	sub?: string;
	lead?: ReactNode;
	children?: ReactNode;
}) {
	const slot = useContext(HeadSlot);
	if (!slot) return null;
	return createPortal(
		<>
			{sub && (
				<span className="card-sub" title={sub}>
					{sub}
				</span>
			)}
			{lead && <span className="card-lead">{lead}</span>}
			{children && <span className="card-tools">{children}</span>}
		</>,
		slot,
	);
}

/**
 * A panel's body, wired to its slot in a header. For the places that draw a
 * header of their own around one panel -- a phone's drawer.
 */
export function PanelBody({ slot, children }: { slot: HTMLElement | null; children: ReactNode }) {
	return <HeadSlot.Provider value={slot}>{children}</HeadSlot.Provider>;
}

/** Whether a press on a header is on something of the panel's, not the card's handle. */
export function onControl(target: EventTarget | null): boolean {
	return (
		target instanceof Element &&
		target.closest("button:not(.card-tab), input, select, textarea, a, label, .segmented") !== null
	);
}

export interface CardViewProps {
	card: Card;
	contents: Partial<Record<PanelId, ReactNode>>;
	/** The card last used, marked by its header. */
	focus: boolean;
	/** A press on the header, or on one tab (`alone`), which may become a drag. */
	onGrab?: (panel: PanelId, alone: boolean, event: ReactPointerEvent<HTMLElement>) => void;
	onShow: (panel: PanelId) => void;
	onFold: (folded: boolean) => void;
	/** Opens the card's menu by this button. Absent, there is no menu. */
	onMenu?: (panel: PanelId, anchor: HTMLElement) => void;
	className?: string;
	style?: CSSProperties;
	/** Drawn last, inside the card: a window's resize handles. */
	children?: ReactNode;
}

export function CardView({
	card,
	contents,
	focus,
	onGrab,
	onShow,
	onFold,
	onMenu,
	className,
	style,
	children,
}: CardViewProps) {
	// One slot per tab, kept in state so a panel's `PanelHead` renders once its
	// slot exists. The tabs not showing keep theirs, hidden, so switching tabs
	// does not remount anything.
	const [slots, setSlots] = useState<Partial<Record<PanelId, HTMLElement>>>({});
	const keep = (id: PanelId) => (element: HTMLElement | null) => {
		if (element && slots[id] !== element) setSlots((was) => ({ ...was, [id]: element }));
	};
	const headless = HEADLESS.has(card.head) && card.tabs.length === 1;
	const many = card.tabs.length > 1;

	return (
		<section
			className={cx(
				"card",
				`card-${card.head}`,
				headless && "headless",
				card.folded && "folded",
				focus && "focus",
				className,
			)}
			data-card={card.head}
			data-active={card.active}
			style={style}
			// A headless card's handle is its own bar.
			onPointerDown={
				headless && onGrab
					? (e) => {
							if (e.target instanceof Element && e.target.closest(".bar") && !onControl(e.target))
								onGrab(card.head, false, e);
						}
					: undefined
			}
		>
			{!headless && (
				<header
					className="card-head"
					title={onGrab ? "Drag to move. Double-click to fold." : undefined}
					onPointerDown={(e) => {
						if (!onGrab || onControl(e.target)) return;
						const tab =
							e.target instanceof Element ? e.target.closest<HTMLElement>(".card-tab") : null;
						onGrab(tab ? (tab.dataset.panel as PanelId) : card.active, tab !== null && many, e);
					}}
					onDoubleClick={(e) => {
						if (!onControl(e.target) && !(e.target as Element).closest(".card-tab"))
							onFold(!card.folded);
					}}
				>
					{many ? (
						<span className="card-tabs" role="tablist">
							{card.tabs.map((id) => (
								<button
									key={id}
									type="button"
									role="tab"
									aria-selected={id === card.active}
									className={cx("card-tab", id === card.active && "on")}
									data-panel={id}
									onClick={() => onShow(id)}
								>
									{PANEL_TITLES[id]}
								</button>
							))}
						</span>
					) : (
						<span className="card-title">{PANEL_TITLES[card.active]}</span>
					)}
					{card.tabs.map((id) => (
						<span key={id} className="card-slot" hidden={id !== card.active} ref={keep(id)} />
					))}
					<button
						type="button"
						className="tb icon-only card-fold"
						title={card.folded ? "Unfold" : "Fold"}
						aria-expanded={!card.folded}
						onClick={() => onFold(!card.folded)}
					>
						<Icon name="chevron" size={14} rotate={card.folded ? -90 : 0} />
					</button>
					{onMenu && (
						<button
							type="button"
							className="tb icon-only card-more"
							title="Move, separate or close"
							onClick={(e) => onMenu(card.active, e.currentTarget)}
						>
							<Icon name="more" size={15} />
						</button>
					)}
				</header>
			)}
			{card.tabs.map((id) => (
				<div
					key={id}
					className={cx("panel", `panel-${id}`, "card-body")}
					hidden={id !== card.active || (card.folded && !headless)}
				>
					<HeadSlot.Provider value={slots[id] ?? null}>{contents[id]}</HeadSlot.Provider>
				</div>
			))}
			{children}
		</section>
	);
}
