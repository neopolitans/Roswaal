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
 * All three are pages of the bundle wherever it is served, the docs included:
 * the hosted site's `docs.html` is the same docs window the daemon serves.
 * The site's static documentation under `docs/` is a separate set of pages,
 * and its own mode strip leaves for the app by loading it -- the editor keeps
 * a note of where it was for that, and for a reload. See `editorSession.ts`.
 *
 * A switch holds the page being left on screen, untouched, until the page
 * coming is ready with its own bar; then the new page fades in over it. The
 * mark and the strip are a copy over both meanwhile, whose box slides as the
 * page fades. Done by hand rather than as a view transition, which pictures
 * the pages: a frosted cluster pictured on its own came out a flat box, and
 * the page coming was pictured before it had loaded.
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

import {
	currentPage,
	mayLeaveTab,
	type Page,
	pageAt,
	pageHref,
	runBeforeLeaving,
} from "./pages.js";

/** In the strip's order, which is the order they are kept in the document too. */
export const MODES: readonly Page[] = ["editor", "designer", "docs"];

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

/**
 * A switch under way: the page being left, the one coming, and where the mark
 * and the strip are on screen, for the copy of them that flies over both.
 *
 * The page being left stays as it was until the one coming says it is ready
 * -- its own bar drawn, and for the editor its project and its graphs back --
 * and only then does the new page fade in over it, with the copy's box
 * sliding across as it does. See `PageHost`.
 */
interface Switch {
	from: Page;
	to: Page;
	fading: boolean;
	mark: DOMRect | null;
	strip: DOMRect | null;
}
let switching: Switch | null = null;

/**
 * Pages whose bar is drawn. Node Design and the docs draw theirs as they
 * mount; the editor says when it has, through `setPageReady`.
 */
const ready = new Set<Page>(["designer", "docs"]);

/** What `PageHost` draws from, replaced whole on every change. */
let state: { showing: Page; switching: Switch | null } = { showing, switching };

function emit(): void {
	state = { showing, switching };
	for (const listener of listeners) listener();
}

/**
 * The page this tab loaded on, and the mode the tab was in before that load:
 * the static docs' strip leaves a note of it. Only a strip on the page that
 * loaded slides from there, and only until the first switch in place.
 */
const loadedOn: Page = showing;
let loadedFrom: Page | null = takeModeFrom();
/**
 * When that slide began, or null until a strip starts it. The editor draws
 * its strip twice as it loads -- in the frame it shows while it finds its
 * project, then in its toolbar -- and the second carries on from the first.
 */
let slidFrom: number | null = null;

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

function snapshot() {
	return state;
}

/** The page in front. */
export function showingPage(): Page {
	return showing;
}

/**
 * Where a strip on `page` slides its box from as the tab loads, and when the
 * slide began; null when it does not slide.
 */
export function loadSlide(page: Page): { from: Page; at: number } | null {
	if (page !== loadedOn || loadedFrom === null || loadedFrom === page) return null;
	slidFrom ??= performance.now();
	return { from: loadedFrom, at: slidFrom };
}

/** Whether a page is mounted, though perhaps not in front. */
export function isAlive(page: Page): boolean {
	return mounted && visited.has(page);
}

/** The editor has drawn its bar: its project is open, or it has none to open. */
export function setPageReady(page: Page): void {
	if (ready.has(page)) return;
	ready.add(page);
	emit();
}

/** Where a page's mark or strip is, if it is drawn: not on a phone. */
function rectOf(page: Page, cluster: "mark-group" | "mode-strip"): DOMRect | null {
	const found = document.querySelector<HTMLElement>(
		`.page-layer[data-page="${page}"] .${cluster}:not(.docs-bar-frame *)`,
	);
	const rect = found?.getBoundingClientRect();
	return rect && rect.width > 0 ? rect : null;
}

function begin(page: Page): void {
	if (switching) finish();
	const from = showing;
	const mark = rectOf(from, "mark-group");
	const strip = rectOf(from, "mode-strip");
	loadedFrom = null;
	showing = page;
	visited.add(page);
	document.title = TITLE[page];
	switching = { from, to: page, fading: false, mark, strip };
	emit();
}

function finish(): void {
	if (!switching) return;
	switching = null;
	emit();
}

/**
 * Goes to a mode in this tab: in place when this document has it, and
 * otherwise by loading it, after anything that must happen first.
 */
export async function switchMode(page: Page): Promise<void> {
	if (page === showing) return;
	if (mounted) {
		lastUrl[showing] = window.location.pathname + window.location.search + window.location.hash;
		window.history.pushState(null, "", lastUrl[page] ?? pageHref(page));
		begin(page);
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

/** How long the box takes to slide; the page's fade, in `theme.css`, is shorter. */
export const SLIDE_MS = 320;

export function PageHost({ render }: { render: (page: Page) => ReactNode }) {
	const { showing: page, switching: change } = useSyncExternalStore(subscribe, snapshot, snapshot);
	const isReady = change ? ready.has(change.to) : false;

	useEffect(() => {
		mounted = true;
		document.title = TITLE[showing];
		// Back and Forward between modes, which `switchMode` pushed.
		const onPop = () => {
			const next = pageAt(window.location.pathname);
			if (next !== showing) begin(next);
		};
		window.addEventListener("popstate", onPop);
		return () => {
			mounted = false;
			window.removeEventListener("popstate", onPop);
		};
	}, []);

	// The new page fades in once it is ready, and not before: until then the
	// page being left stays on screen as it was. Two frames first, so the new
	// page has been drawn at nothing and the fade has somewhere to start.
	useEffect(() => {
		if (!change || change.fading || !isReady) return;
		const reduced =
			typeof window.matchMedia === "function" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (reduced) {
			finish();
			return;
		}
		let frame = requestAnimationFrame(() => {
			frame = requestAnimationFrame(() => {
				if (switching !== change) return;
				switching = { ...change, fading: true };
				emit();
			});
		});
		return () => cancelAnimationFrame(frame);
	}, [change, isReady]);

	useEffect(() => {
		if (!change?.fading) return;
		const done = window.setTimeout(() => {
			if (switching === change) finish();
		}, SLIDE_MS + 40);
		return () => window.clearTimeout(done);
	}, [change]);

	return (
		<>
			{MODES.filter((one) => visited.has(one)).map((one) => (
				<div
					key={one}
					className="page-layer"
					data-page={one}
					data-showing={one === page ? "" : undefined}
					data-leaving={change?.from === one ? "" : undefined}
					data-entering={change?.to === one ? "" : undefined}
					data-fading={change?.to === one && change.fading ? "" : undefined}
					inert={one !== page}
				>
					<Showing.Provider value={one === page}>{render(one)}</Showing.Provider>
				</div>
			))}
			{change && <Flight change={change} />}
		</>
	);
}

/**
 * The mark and the strip, over both pages while one gives way to the other.
 *
 * Copied from the page being left, so it is the same pixels, and drawn where
 * those were; each page's own are hidden meanwhile. Its box is on the mode
 * being left until the new page is ready, then slides to it as the page fades
 * in. When the copy goes, the new page's own strip is under it, the same.
 */
function Flight({ change }: { change: Switch }) {
	const holder = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const into = holder.current;
		if (!into) return;
		into.replaceChildren();
		for (const [cluster, rect] of [
			["mark-group", change.mark],
			["mode-strip", change.strip],
		] as const) {
			if (!rect) continue;
			const original = document.querySelector<HTMLElement>(
				`.page-layer[data-page="${change.from}"] .${cluster}:not(.docs-bar-frame *)`,
			);
			if (!original) continue;
			const copy = original.cloneNode(true) as HTMLElement;
			copy.removeAttribute("role");
			Object.assign(copy.style, {
				left: `${rect.left}px`,
				top: `${rect.top}px`,
				width: `${rect.width}px`,
				height: `${rect.height}px`,
			});
			into.append(copy);
		}
		// Built once per switch: the fade only moves the box, below.
	}, [change.from, change.to, change.mark, change.strip]);

	useLayoutEffect(() => {
		const slots = holder.current?.querySelector<HTMLElement>(".mode-slots");
		if (!slots) return;
		slots.style.setProperty(
			"--mode-at",
			String(MODES.indexOf(change.fading ? change.to : change.from)),
		);
		for (const slot of slots.querySelectorAll<HTMLElement>(".mode-slot")) {
			const here = slot.dataset.mode === (change.fading ? change.to : change.from);
			if (here) slot.setAttribute("aria-current", "page");
			else slot.removeAttribute("aria-current");
		}
	}, [change.fading, change.from, change.to]);

	return <div className="mode-flight" aria-hidden ref={holder} />;
}
