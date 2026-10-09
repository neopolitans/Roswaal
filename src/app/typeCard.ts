/**
 * The card a type chip opens: what the type is, from the Creator Documentation,
 * and a link to its page. The code editor's hover card, opened from a node.
 *
 * One card at a time, hung in the page's body rather than inside the canvas, so
 * the canvas's zoom does not shrink it and a node's edge does not clip it. It
 * opens after the same pause the code editor's does, stays while the pointer
 * moves from the chip onto it — it holds a link, so it has to be reachable —
 * and closes shortly after the pointer leaves both. On touch a tap opens it
 * and a tap anywhere else closes it.
 */

import { aboutType } from "../core/luau/hover.js";
import { hoverCard } from "./luauHover.js";

const OPEN_DELAY = 350;
const CLOSE_DELAY = 200;

let card: HTMLElement | null = null;
let owner: HTMLElement | null = null;
let openTimer: number | undefined;
let closeTimer: number | undefined;

function clearTimers(): void {
	window.clearTimeout(openTimer);
	window.clearTimeout(closeTimer);
}

/** Closes the card now, whichever chip opened it. */
export function closeTypeCard(): void {
	clearTimers();
	card?.remove();
	card = null;
	owner = null;
	document.removeEventListener("pointerdown", onOutside, true);
}

function onOutside(event: PointerEvent): void {
	const target = event.target as Node | null;
	if (target && (card?.contains(target) || owner?.contains(target))) return;
	closeTypeCard();
}

function open(chip: HTMLElement, type: string): void {
	const hover = aboutType(type);
	if (!hover || !chip.isConnected) return;
	closeTypeCard();

	const dom = document.createElement("div");
	dom.className = "type-card";
	dom.setAttribute("role", "tooltip");
	dom.append(hoverCard(hover));
	dom.addEventListener("pointerenter", () => window.clearTimeout(closeTimer));
	dom.addEventListener("pointerleave", (e) => {
		if (e.pointerType !== "touch") scheduleClose();
	});
	document.body.append(dom);

	// Under the chip, kept on screen: above it when there is no room below.
	const at = chip.getBoundingClientRect();
	const size = dom.getBoundingClientRect();
	const margin = 8;
	const left = Math.min(Math.max(margin, at.left), window.innerWidth - size.width - margin);
	const below = at.bottom + 6;
	const top =
		below + size.height + margin <= window.innerHeight
			? below
			: Math.max(margin, at.top - 6 - size.height);
	dom.style.left = `${left}px`;
	dom.style.top = `${top}px`;

	card = dom;
	owner = chip;
	document.addEventListener("pointerdown", onOutside, true);
}

function scheduleClose(): void {
	window.clearTimeout(openTimer);
	window.clearTimeout(closeTimer);
	closeTimer = window.setTimeout(closeTypeCard, CLOSE_DELAY);
}

/** Handlers for a chip naming `type`. Spread onto the element. */
export function typeCardHandlers(type: string) {
	return {
		onPointerEnter(e: React.PointerEvent<HTMLElement>) {
			if (e.pointerType === "touch") return;
			const chip = e.currentTarget;
			clearTimers();
			if (owner === chip) return;
			openTimer = window.setTimeout(() => open(chip, type), card ? 0 : OPEN_DELAY);
		},
		onPointerLeave(e: React.PointerEvent<HTMLElement>) {
			if (e.pointerType === "touch") return;
			scheduleClose();
		},
		// A tap: the chip is inside a node, so the press must not start a drag
		// of the node, and a second tap closes what the first opened.
		onPointerDown(e: React.PointerEvent<HTMLElement>) {
			if (e.pointerType !== "touch") return;
			e.stopPropagation();
			const chip = e.currentTarget;
			if (owner === chip) closeTypeCard();
			else open(chip, type);
		},
	};
}
