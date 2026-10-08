/**
 * The three modes in one tab: the editor, Node Design and the docs.
 *
 * They are one bundle, so moving between them need not load anything. The
 * host keeps every page it has shown mounted, and shows one: the others stay
 * laid out at full size, invisible and inert, so the editor comes back with
 * its tabs, its camera, its undo history and the Code panel exactly as they
 * were -- nothing to save and read back, because nothing was put away.
 *
 * Invisible rather than `display: none` because a canvas that is measured at
 * nothing refits itself to nothing, and comes back looking somewhere else.
 *
 * The docs are only a page of the bundle under the daemon. The hosted site's
 * docs are their own static pages, which read without JavaScript, so going to
 * them is a real navigation -- `switchMode` does that one the old way, after
 * the editor has written what it must and kept a note of where it was. See
 * `editorSession.ts`.
 *
 * A page's window-wide shortcuts would hear keys meant for the page in front,
 * so each asks `useShowing` first.
 */

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useRef,
	useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";

import {
	currentPage,
	IS_STATIC_HOST,
	mayLeaveTab,
	type Page,
	pageAt,
	pageHref,
	runBeforeLeaving,
} from "./pages.js";

/** In the strip's order, which is the order they are kept in the document too. */
export const MODES: readonly Page[] = ["editor", "designer", "docs"];

/** Whether this document can show a page without loading another. */
export function inBundle(page: Page, staticHost: boolean = IS_STATIC_HOST): boolean {
	return page !== "docs" || !staticHost;
}

const TITLE: Record<Page, string> = {
	editor: "Roswaal",
	designer: "Node Design",
	docs: "Roswaal docs",
};

/**
 * The mode a strip was last looking at, kept across a navigation so the one on
 * the next page can slide its box over from there. Read once, then cleared.
 */
export const MODE_FROM_KEY = "roswaal-mode-from";

let showing: Page = typeof window === "undefined" ? "editor" : currentPage();
let mounted = false;
const visited = new Set<Page>([showing]);
const listeners = new Set<() => void>();
/** Where each page was last, so coming back to the docs finds the same article. */
const lastUrl: Partial<Record<Page, string>> = {};
/** The mode before this one, for the box to slide from. */
let cameFrom: Page | null = takeModeFrom();

function takeModeFrom(): Page | null {
	try {
		const from = sessionStorage.getItem(MODE_FROM_KEY);
		sessionStorage.removeItem(MODE_FROM_KEY);
		return from === "editor" || from === "designer" || from === "docs" ? from : null;
	} catch {
		return null;
	}
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => void listeners.delete(listener);
}

/** The page in front. */
export function showingPage(): Page {
	return showing;
}

/** The mode shown before this one, if there was one in this tab. */
export function previousMode(): Page | null {
	return cameFrom;
}

/** Whether a page is mounted, though perhaps not in front. */
export function isAlive(page: Page): boolean {
	return mounted && visited.has(page);
}

function setShowing(page: Page): void {
	if (page === showing) return;
	cameFrom = showing;
	showing = page;
	visited.add(page);
	document.title = TITLE[page];
	for (const listener of listeners) listener();
}

/**
 * Runs a change of page as a view transition where there is one: the whole
 * page crossfades, and the mark and the strip, on the same pixels in every
 * mode, hold still in it. See the note at `@view-transition` in `theme.css`.
 */
function transition(update: () => void): void {
	const reduced =
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const start = (document as Document & { startViewTransition?: (update: () => void) => unknown })
		.startViewTransition;
	if (reduced || typeof start !== "function") {
		update();
		return;
	}
	start.call(document, () => flushSync(update));
}

/**
 * Goes to a mode in this tab: in place when this document has it, and
 * otherwise by loading it, after anything that must happen first.
 */
export async function switchMode(page: Page): Promise<void> {
	if (page === showing) return;
	if (mounted && inBundle(page)) {
		lastUrl[showing] = window.location.pathname + window.location.search + window.location.hash;
		window.history.pushState(null, "", lastUrl[page] ?? pageHref(page));
		transition(() => setShowing(page));
		return;
	}
	if (!mayLeaveTab()) return;
	await runBeforeLeaving();
	try {
		sessionStorage.setItem(MODE_FROM_KEY, showing);
	} catch {
		// Only the slide is lost.
	}
	window.location.assign(pageHref(page));
}

/**
 * How the editor opens a project, while it is alive behind another mode.
 *
 * The projects panel in Node Design or the docs used to point the daemon at a
 * project and then load the editor, which adopted it. With the editor kept,
 * that would change the project out from under the tabs it has open, so the
 * panel asks the editor to do it, the way its own panel does.
 */
let editorOpener: ((root: string) => Promise<boolean>) | null = null;

export function setEditorOpener(open: ((root: string) => Promise<boolean>) | null): void {
	editorOpener = open;
}

/** The editor's way to open a project, if it is mounted behind this mode. */
export function liveEditorOpener(): ((root: string) => Promise<boolean>) | null {
	return isAlive("editor") ? editorOpener : null;
}

/** Whether the page this is drawn in is the one in front. */
const Showing = createContext(true);

export function usePageShowing(): boolean {
	return useContext(Showing);
}

/**
 * For a window-wide listener: whether its page is in front at the moment the
 * key arrives, read without re-subscribing every time the answer changes.
 */
export function useShowing(): () => boolean {
	const showingNow = useContext(Showing);
	const ref = useRef(showingNow);
	useLayoutEffect(() => {
		ref.current = showingNow;
	}, [showingNow]);
	return useCallback(() => ref.current, []);
}

/**
 * Runs when this page comes back to the front, and not when it first mounts:
 * the moment to ask whether anything changed while another page was showing.
 */
export function useOnShown(effect: () => void): void {
	const showingNow = useContext(Showing);
	const was = useRef(showingNow);
	const latest = useRef(effect);
	useLayoutEffect(() => {
		latest.current = effect;
	});
	useEffect(() => {
		if (showingNow && !was.current) latest.current();
		was.current = showingNow;
	}, [showingNow]);
}

export function PageHost({ render }: { render: (page: Page) => ReactNode }) {
	const page = useSyncExternalStore(subscribe, showingPage, showingPage);

	useEffect(() => {
		mounted = true;
		document.title = TITLE[showing];
		// Back and Forward between modes, which `switchMode` pushed.
		const onPop = () => {
			const next = pageAt(window.location.pathname);
			if (next !== showing && inBundle(next)) transition(() => setShowing(next));
		};
		window.addEventListener("popstate", onPop);
		return () => {
			mounted = false;
			window.removeEventListener("popstate", onPop);
		};
	}, []);

	return (
		<>
			{MODES.filter((one) => visited.has(one) && inBundle(one)).map((one) => (
				<div
					key={one}
					className="page-layer"
					data-page={one}
					data-showing={one === page ? "" : undefined}
					inert={one !== page}
				>
					<Showing.Provider value={one === page}>{render(one)}</Showing.Provider>
				</div>
			))}
		</>
	);
}
