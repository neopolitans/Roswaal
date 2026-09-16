/**
 * The checkboxes a documentation page puts beside the thing they change.
 *
 * The settings popover is for what a reader sets once and forgets. This is for
 * a choice that only makes sense while looking at the page it belongs to — the
 * pre-release notes are worth a thought while reading the release notes and at
 * no other moment.
 *
 * What it does is two lines: read the preference into the box, and write it
 * back when the box changes. Everything visible follows from an attribute on
 * the article, so *what* a preference hides is decided in the stylesheet rather
 * than here — this file would otherwise need to know about release notes.
 *
 * ## Why this file has no imports
 *
 * Delivered two ways from one source, exactly as `toolbarLink.ts` is. The
 * in-app Docs window has React and its own preferences already; the published
 * site has a bundled script and nothing else, and a closure over anything
 * outside these functions would not survive that trip.
 *
 * ## It is an enhancement, never a requirement
 *
 * Without it every fold is drawn, which is the honest fallback: a reader with
 * no JavaScript sees the whole history rather than a checkbox that does
 * nothing. Hiding is the enhancement, not the content.
 */

const KEY = "roswaal.preferences";

/** The preferences, or an empty set. Never throws: storage can refuse. */
function read(): Record<string, unknown> {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw === null) return {};
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === "object" && parsed !== null
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function write(pref: string, value: boolean): void {
	try {
		localStorage.setItem(KEY, JSON.stringify({ ...read(), [pref]: value }));
	} catch {
		// A private window, or storage switched off. The page has already
		// changed; it simply will not remember next time.
	}
}

/**
 * Puts the answer on the document, where the stylesheet can see it.
 *
 * An attribute rather than a class per preference, so a second toggle needs
 * nothing here — only a rule that reads its own name.
 */
export function applyDocsToggle(root: Document | HTMLElement, pref: string, on: boolean): void {
	const host = root instanceof Document ? root.documentElement : root;
	host.setAttribute(`data-${pref.toLowerCase()}`, on ? "on" : "off");
}

/** Wire one checkbox. Returns the undo, for a panel that unmounts. */
export function attachDocsToggle(box: HTMLInputElement): () => void {
	const pref = box.dataset.pref;
	if (!pref) return () => {};

	const stored = read()[pref];
	const on = typeof stored === "boolean" ? stored : false;
	box.checked = on;
	applyDocsToggle(box.ownerDocument, pref, on);

	const onChange = () => {
		write(pref, box.checked);
		applyDocsToggle(box.ownerDocument, pref, box.checked);
	};

	box.addEventListener("change", onChange);
	return () => box.removeEventListener("change", onChange);
}

/** Every toggle on the page. What the static site's script runs. */
export function attachDocsToggles(root: ParentNode): void {
	for (const box of Array.from(root.querySelectorAll<HTMLInputElement>(".docs-toggle [data-pref]"))) {
		attachDocsToggle(box);
	}
}
