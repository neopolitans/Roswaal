/**
 * The mode strip: Editor, Design and Docs, after the mark in every window.
 *
 * Three links with a box behind the one you are in. A click moves the tab to
 * another mode in place (`switchMode`), and the box slides over from the one
 * you left. They are real links, so Ctrl- or Cmd-click, a middle click and
 * Shift-click still open a mode in a tab or window of its own, the way the
 * browser does for any link; a right-click, or a long press on an iPad, offers
 * the same as a menu.
 *
 * Not on a phone: the row there is already full, and the More menu carries the
 * other modes instead.
 */

import { type MouseEvent, useLayoutEffect, useRef, useState } from "react";

import { Icon, type IconName } from "./icons.jsx";
import { Menu } from "./Menu.jsx";
import { usePhone } from "./Popout.jsx";
import { MODES, previousMode, switchMode, usePageShowing } from "./pageHost.jsx";
import { type Page, pageHref } from "./pages.js";

export const MODE_GLYPH: Record<Page, IconName> = {
	editor: "graph",
	designer: "palette",
	docs: "document",
};

export const MODE_NAME: Record<Page, string> = {
	editor: "Editor",
	designer: "Design",
	docs: "Docs",
};

const MODE_HINT: Record<Page, string> = {
	editor: "the graph editor",
	designer: "Node Design, to make nodes of your own",
	docs: "the documentation",
};

/** A plain click: anything else is the browser's, to open a tab or a window. */
export function isPlainClick(e: {
	button: number;
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
}): boolean {
	return e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
}

export function ModeStrip({ current }: { current: Page }) {
	const phone = usePhone();
	const showing = usePageShowing();
	const strip = useRef<HTMLDivElement>(null);
	const [menu, setMenu] = useState<{ page: Page; x: number; y: number } | null>(null);

	// The box slides from the mode before, each time this page comes to the
	// front. It is drawn where it belongs and animated from where it was, so a
	// browser without the animation still has it in the right place.
	useLayoutEffect(() => {
		if (!showing) return;
		const from = previousMode();
		const box = strip.current?.querySelector<HTMLElement>(".mode-box");
		const was = strip.current?.querySelector<HTMLElement>(`[data-mode="${from}"]`);
		const is = strip.current?.querySelector<HTMLElement>(`[data-mode="${current}"]`);
		if (!from || from === current || !box || !was || !is || typeof box.animate !== "function") {
			return;
		}
		if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
		const shift = was.offsetLeft - is.offsetLeft;
		box.animate([{ transform: `translateX(${shift}px)` }, { transform: "translateX(0)" }], {
			duration: 320,
			easing: "cubic-bezier(0.32, 0.72, 0, 1)",
		});
	}, [showing, current]);

	if (phone) return null;

	const go = (page: Page) => (e: MouseEvent<HTMLAnchorElement>) => {
		if (!isPlainClick(e)) return;
		e.preventDefault();
		void switchMode(page);
	};

	return (
		<div className="tool-group mode-strip" role="navigation" aria-label="Mode" ref={strip}>
			<div className="mode-slots" style={{ ["--mode-at" as string]: MODES.indexOf(current) }}>
				<span className="mode-box" aria-hidden />
				{MODES.map((page) => (
					<a
						key={page}
						data-mode={page}
						className="mode-slot"
						href={pageHref(page)}
						aria-current={page === current ? "page" : undefined}
						aria-label={`${MODE_NAME[page]} Mode`}
						title={`${MODE_NAME[page]} Mode — ${MODE_HINT[page]}. Ctrl-click for a new tab.`}
						onClick={go(page)}
						onContextMenu={(e) => {
							e.preventDefault();
							setMenu({ page, x: e.clientX, y: e.clientY });
						}}
					>
						<Icon name={MODE_GLYPH[page]} size={16} />
					</a>
				))}
			</div>
			{menu && (
				<Menu
					at={{ x: menu.x, y: menu.y }}
					label={`${MODE_NAME[menu.page]} Mode`}
					onClose={() => setMenu(null)}
					sections={[
						{
							entries: [
								{
									label: `Switch to ${MODE_NAME[menu.page]} Mode`,
									icon: MODE_GLYPH[menu.page],
									current: menu.page === current,
									disabled: menu.page === current,
									run: () => void switchMode(menu.page),
								},
							],
						},
						{
							entries: [
								{
									label: "Open in New Tab",
									icon: "external",
									link: { href: pageHref(menu.page), target: "_blank" },
								},
							],
						},
					]}
				/>
			)}
		</div>
	);
}
