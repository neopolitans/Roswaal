/**
 * The menu: every context menu and dropdown in the editor.
 *
 * A menu is a list of sections (`menuModel.ts`) handed to `<Menu>`, and the
 * menu does the rest the same way for all of them:
 *
 * - **It is drawn at the body, through a portal.** A `position: fixed` menu
 *   drawn inside a card is placed against the card, because a backdrop filter
 *   makes the card the box its fixed children are laid out in -- and it is
 *   clipped by the card's edges. Every card is glass, so every menu goes to
 *   the body.
 * - **It stays on screen** (`menuPlace.ts`), at the pointer or hanging from
 *   its button.
 * - **A press anywhere else, or Escape, closes it** (`dismiss.ts`), and focus
 *   goes back to where it was.
 * - **The keyboard works**: Up and Down move and wrap, Home and End jump,
 *   Enter or Space chooses, Tab leaves. Entries that cannot be chosen are
 *   passed over.
 * - **One look**, with a divider between sections that both have entries.
 *
 * `MenuSurface` is the first three on their own, for the node palette, whose
 * search and categories are its own. Not for settings that stay open while
 * they are changed -- that is `Popout` -- nor for a picker with a search box,
 * which is a dialog.
 */

import {
	Fragment,
	type KeyboardEvent,
	type MouseEvent,
	type PointerEvent,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";

import { cx } from "./cx.js";
import { useDismiss } from "./dismiss.js";
import { Icon } from "./icons.jsx";
import { LAYER } from "./layers.js";
import {
	isMenuKey,
	type MenuEntry,
	type MenuSection,
	nextEntry,
	shownSections,
} from "./menuModel.js";
import { type ButtonAnchor, type MenuAnchor, usePlacement } from "./menuPlace.js";

interface MenuSurfaceProps {
	at: MenuAnchor;
	/** What a screen reader announces: the file, the pin, the card. */
	label: string;
	className?: string;
	/** Escape closes it. Off where a field inside keeps Escape for itself. */
	escape?: boolean;
	onClose: () => void;
	onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
	children: ReactNode;
}

/** A menu's box: portal, placement and dismissal, with whatever is put in it. */
export function MenuSurface({
	at,
	label,
	className,
	escape = true,
	onClose,
	onKeyDown,
	children,
}: MenuSurfaceProps) {
	const root = useRef<HTMLDivElement>(null);
	// A press on the button that opened it is the button's to handle -- it
	// closes the menu by toggling -- rather than a press elsewhere, which
	// would close it first and let the button open it again.
	const opener = "element" in at ? at.element : null;
	const also = useMemo(() => ({ current: opener }), [opener]);
	useDismiss(root, onClose, { escape, also });
	const place = usePlacement(root, at);

	// Where focus was before the menu: read on the first render, ahead of
	// anything inside taking it -- the palette's search box is `autoFocus`.
	const [before] = useState(() => document.activeElement);
	// Focus comes in so the keyboard reaches the menu, unless something in it
	// took focus first, and goes back where it was when the menu goes --
	// unless something else has taken it since.
	useEffect(() => {
		if (!root.current?.contains(document.activeElement))
			root.current?.focus({ preventScroll: true });
		return () => {
			const now = document.activeElement;
			if (before instanceof HTMLElement && (now === null || now === document.body)) {
				before.focus({ preventScroll: true });
			}
		};
	}, [before]);

	return createPortal(
		<div
			ref={root}
			className={cx("menu", className)}
			role="menu"
			aria-label={label}
			tabIndex={-1}
			style={{ left: place.x, top: place.y, zIndex: LAYER.menu }}
			onKeyDown={onKeyDown}
		>
			{children}
		</div>,
		document.body,
	);
}

interface MenuProps {
	at: MenuAnchor;
	label: string;
	sections: MenuSection[];
	/** Above the entries: the pin a pin menu is about, the file being dropped. */
	head?: ReactNode;
	/** Below them: a note on what is missing and why. */
	foot?: ReactNode;
	/** Said instead of nothing when no section has an entry. */
	empty?: ReactNode;
	/** Sizing, where a menu needs its own. */
	className?: string;
	/** Focus the first entry on opening: the menu was opened from the keyboard. */
	focusFirst?: boolean;
	onClose: () => void;
}

export function Menu({
	at,
	label,
	sections,
	head,
	foot,
	empty,
	className,
	focusFirst = false,
	onClose,
}: MenuProps) {
	const shown = shownSections(sections);
	// An icon column only when something in the menu has an icon, and then for
	// every entry, so the words line up whichever entries have one.
	const gutter = shown.some((s) => s.entries.some((e) => e.icon || e.swatch || e.glyph));
	const body = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!focusFirst) return;
		const entries = entriesIn(body.current);
		const first = nextEntry(-1, entries.map(isChoosable), "ArrowDown");
		if (first >= 0) entries[first].focus({ preventScroll: true });
	}, [focusFirst]);

	const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		if (e.key === "Tab") {
			onClose();
			return;
		}
		if (!isMenuKey(e.key)) return;
		e.preventDefault();
		const entries = entriesIn(body.current);
		const to = nextEntry(
			entries.indexOf(document.activeElement as HTMLElement),
			entries.map(isChoosable),
			e.key,
		);
		if (to >= 0) entries[to].focus({ preventScroll: true });
	};

	return (
		<MenuSurface
			at={at}
			label={label}
			className={cx("menu--list", className)}
			onClose={onClose}
			onKeyDown={onKeyDown}
		>
			{head}
			<div className="menu-body" ref={body}>
				{shown.map((section, i) => (
					<Fragment key={section.label ?? i}>
						{i > 0 && <div className="menu-sep" role="separator" />}
						<div className="menu-section" role="group" aria-label={section.label}>
							{section.label && <div className="menu-label">{section.label}</div>}
							{section.content}
							{section.entries.map((entry) => (
								<Entry
									key={entry.key ?? entry.label}
									entry={entry}
									gutter={gutter}
									onClose={onClose}
								/>
							))}
						</div>
					</Fragment>
				))}
				{shown.length === 0 && empty && <div className="menu-empty">{empty}</div>}
			</div>
			{foot}
		</MenuSurface>
	);
}

/** The entries drawn in a menu's body, in the order the keyboard moves through them. */
function entriesIn(body: HTMLElement | null): HTMLElement[] {
	return [...(body?.querySelectorAll<HTMLElement>(".menu-item") ?? [])];
}

/**
 * `aria-disabled` rather than `disabled`, here and on the entry: a disabled
 * button takes no pointer events in some browsers, and then its tooltip --
 * the only place that says why it cannot be chosen -- never shows.
 */
function isChoosable(element: HTMLElement): boolean {
	return element.getAttribute("aria-disabled") !== "true";
}

interface EntryProps {
	entry: MenuEntry;
	/** Keep the icon's space when this entry has none. */
	gutter: boolean;
	onClose: () => void;
}

function Entry({ entry, gutter, onClose }: EntryProps) {
	const glyph = entry.icon ? (
		<Icon name={entry.icon} size={15} className="menu-icon" />
	) : entry.swatch ? (
		<span className="menu-swatch" style={{ background: entry.swatch }} />
	) : (
		(entry.glyph ?? (gutter ? <span className="menu-icon-space" /> : null))
	);
	const props = {
		className: cx(
			"menu-item",
			entry.danger && "menu-item--danger",
			entry.checked && "menu-item--checked",
			entry.current && "menu-item--current",
		),
		role: entry.checked === undefined ? "menuitem" : "menuitemcheckbox",
		"aria-checked": entry.checked,
		"aria-current": entry.current || undefined,
		"aria-disabled": entry.disabled || undefined,
		title: entry.title,
		tabIndex: -1,
		// The pointer moves focus, as it moves the highlight in a native menu,
		// so the keyboard carries on from wherever the pointer left it.
		onPointerMove: (e: PointerEvent<HTMLElement>) => {
			if (!entry.disabled && document.activeElement !== e.currentTarget) {
				e.currentTarget.focus({ preventScroll: true });
			}
		},
		onClick: (e: MouseEvent<HTMLElement>) => {
			if (entry.disabled) {
				e.preventDefault();
				return;
			}
			entry.run?.(e);
			onClose();
		},
	};
	const inside = (
		<>
			{glyph}
			<span className="menu-text">{entry.label}</span>
			{entry.hint !== undefined && <span className="menu-hint">{entry.hint}</span>}
		</>
	);
	return entry.link ? (
		<a {...props} href={entry.link.href} target={entry.link.target} rel={entry.link.rel}>
			{inside}
		</a>
	) : (
		<button type="button" {...props}>
			{inside}
		</button>
	);
}

interface MenuButtonProps {
	/** What the button shows: words, or a glyph. */
	label: ReactNode;
	/** Its tooltip, and the menu's name to a screen reader. */
	title: string;
	sections: MenuSection[];
	side?: ButtonAnchor["side"];
	align?: ButtonAnchor["align"];
}

/** A toolbar button with a menu hanging from it. */
export function MenuButton({ label, title, sections, side, align }: MenuButtonProps) {
	const [button, setButton] = useState<HTMLButtonElement | null>(null);
	// Opened by a key press, which reaches `onClick` with no pointer behind
	// it (`detail` 0): the first entry takes focus, as a native menu's does.
	const [open, setOpen] = useState<{ byKey: boolean } | null>(null);
	return (
		<>
			<button
				ref={setButton}
				type="button"
				className={cx("tb with-icon", open && "on")}
				title={title}
				aria-haspopup="menu"
				aria-expanded={open !== null}
				onClick={(e) => setOpen((was) => (was ? null : { byKey: e.detail === 0 }))}
			>
				{label}
				<Icon name="chevron" size={14} />
			</button>
			{open && button && (
				<Menu
					at={{ element: button, side, align }}
					label={title}
					sections={sections}
					focusFirst={open.byKey}
					onClose={() => setOpen(null)}
				/>
			)}
		</>
	);
}
