/**
 * What the release notes pages do, on whichever renderer draws them.
 *
 * Both renderers write the same markup for the release blocks
 * (`src/core/docs/releaseHtml.ts`) -- the published site into its files, the
 * Docs window into its own page -- and this wires it up for both, so the
 * dropdown cannot go one place on the site and another in the editor. Plain
 * DOM, on purpose: it only reads and marks what is already on the page.
 *
 * - **The versions dropdown** goes to the page chosen, and so do the links
 *   between release pages; `go` is how the renderer goes to a page.
 * - **One release on its minor version's page**: `#v0.144.2` marks that
 *   release's lines and scrolls to them. On the front page, an address from
 *   when every release was on it -- `release-notes.html#v0.119.0` -- is sent
 *   on to the page that release is on now.
 * - **New since your last visit**: what is newer than the release this browser
 *   last saw gets a dot -- lines, rows, the dropdown and the contents -- and
 *   the newest is remembered once a release notes page has been seen.
 */

const SEEN_KEY = "roswaal.docs.releasesSeen";

/** Where a link or a choice in the release notes leads: the page, and its address on the site. */
export interface ReleaseTarget {
	slug: string;
	href: string;
}

/** Newer, as versions compare: 0.10.0 after 0.9.3. */
export function newerVersion(a: string, b: string): boolean {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const x = pa[i] ?? 0;
		const y = pb[i] ?? 0;
		if (x !== y) return x > y;
	}
	return false;
}

/** The newest release this browser has seen the notes for, if it has seen any. */
export function releasesSeen(storage: Pick<Storage, "getItem">): string | null {
	try {
		return storage.getItem(SEEN_KEY);
	} catch {
		return null;
	}
}

/**
 * Marks what this browser has not seen: anything with a `data-version` or a
 * `data-release-newest` newer than the release it saw last, and the dropdown's
 * options with a dot in their words. A first visit marks nothing: every release
 * is new to somebody who has never looked, which is the same as none being.
 */
export function markNewReleases(root: ParentNode, seen: string | null): void {
	if (!seen) return;
	for (const el of root.querySelectorAll<HTMLElement>("[data-version], [data-release-newest]")) {
		const version = el.dataset.version ?? el.dataset.releaseNewest ?? "";
		const isNew = version !== "" && newerVersion(version, seen);
		if (el instanceof HTMLOptionElement) {
			if (isNew && !el.textContent?.endsWith(" •")) el.textContent = `${el.textContent} •`;
		} else {
			el.classList.toggle("is-new", isNew);
		}
	}
}

/** Remembers the newest release as seen, once a release notes page has been read. */
export function rememberReleases(storage: Pick<Storage, "setItem">, latest: string): void {
	try {
		storage.setItem(SEEN_KEY, latest);
	} catch {
		// Private windows and blocked storage: the dots just do not appear.
	}
}

/** The newest release there is, as the release notes page says. */
export function latestRelease(root: ParentNode): string | null {
	return root.querySelector<HTMLElement>(".docs-versions[data-latest]")?.dataset.latest ?? null;
}

/**
 * Marks one release's lines on its minor version's page and scrolls to its
 * line in the list of releases. False when this page does not have it.
 */
export function showRelease(root: ParentNode, version: string): boolean {
	const lines = [...root.querySelectorAll<HTMLElement>(`[data-version="${CSS.escape(version)}"]`)];
	if (lines.length === 0) return false;
	for (const line of root.querySelectorAll(".is-target")) line.classList.remove("is-target");
	for (const line of lines) line.classList.add("is-target");
	lines[0].scrollIntoView({ block: "center" });
	return true;
}

/**
 * Where an address from before the release notes had a page per minor
 * version should go: the page `#v0.119.0`'s release is on now, by the
 * dropdown's own options. Null when the address is not one of those, or the
 * release is not on any page.
 */
export function movedRelease(root: ParentNode, hash: string): ReleaseTarget | null {
	const old = /^#v(\d+\.\d+)\.\d+$/.exec(hash);
	if (!old) return null;
	const option = root.querySelector<HTMLOptionElement>(
		`select[data-release-versions] option[value$="/${CSS.escape(old[1])}"]`,
	);
	if (!option?.dataset.href) return null;
	return { slug: option.value, href: `${option.dataset.href}${hash}` };
}

/** Wires the release notes inside `root`. Returns a function that unwires them. */
export function wireReleasePages(
	root: HTMLElement,
	go: (target: ReleaseTarget) => void,
): () => void {
	const select = root.querySelector<HTMLSelectElement>("select[data-release-versions]");
	const onChange = () => {
		const option = select?.selectedOptions[0];
		if (option?.value) go({ slug: option.value, href: option.dataset.href ?? "" });
	};
	const onClick = (e: MouseEvent) => {
		if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
			return;
		const link = (e.target as Element).closest<HTMLAnchorElement>(
			".docs-minor a[data-doc-slug], .docs-minor-rows a[data-doc-slug], .docs-release-pager a[data-doc-slug]",
		);
		if (!link) return;
		e.preventDefault();
		go({ slug: link.dataset.docSlug ?? "", href: link.getAttribute("href") ?? "" });
	};
	select?.addEventListener("change", onChange);
	root.addEventListener("click", onClick);
	return () => {
		select?.removeEventListener("change", onChange);
		root.removeEventListener("click", onClick);
	};
}
