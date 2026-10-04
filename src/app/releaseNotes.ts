/**
 * The release notes' tools, on whichever page draws them.
 *
 * Both renderers produce the same markup for the `release` and `releaseTools`
 * blocks -- the published site from `html.ts`, the Docs window from React --
 * and this wires it up for both, so a filter cannot behave one way on the site
 * and another in the editor. Plain DOM, on purpose: the filters only show and
 * hide what is already on the page.
 *
 * - **Search and filter chips** hide the entries that do not match, then the
 *   releases with none left, then the folds with none left, and open the folds
 *   that still have something in them. Clearing puts the folds back as they were.
 * - **The jump bar** opens a fold and scrolls to it. It never touches the
 *   address: in the Docs window the hash is the page.
 * - **New since your last visit**: releases newer than the one this browser
 *   last saw get a dot, and the newest is then remembered.
 */

const SEEN_KEY = "roswaal.docs.releasesSeen";

type Kind = "all" | "added" | "changed" | "fixed" | "breaking";
type Surface = "any" | "editor" | "designer" | "docs";

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

/** Opens the folds around an element and scrolls to it. */
export function revealRelease(target: Element): void {
	for (let at: Element | null = target; at; at = at.parentElement) {
		if (at instanceof HTMLDetailsElement) at.open = true;
	}
	target.scrollIntoView({ block: "start" });
}

/**
 * Marks the releases this browser has not seen, then remembers the newest.
 * A first visit marks none: every release is new to somebody who has never
 * looked, which is the same as none being.
 */
export function markNewReleases(
	root: ParentNode,
	storage: Pick<Storage, "getItem" | "setItem">,
): void {
	const releases = [...root.querySelectorAll<HTMLElement>(".docs-release[data-version]")];
	const newest = releases
		.map((r) => r.dataset.version ?? "")
		.reduce((best, v) => (best === "" || newerVersion(v, best) ? v : best), "");
	if (newest === "") return;
	let seen: string | null = null;
	try {
		seen = storage.getItem(SEEN_KEY);
	} catch {
		return;
	}
	if (seen) {
		for (const release of releases) {
			if (newerVersion(release.dataset.version ?? "", seen)) release.classList.add("is-new");
		}
	}
	try {
		storage.setItem(SEEN_KEY, newest);
	} catch {
		// Private windows and blocked storage: the dots just do not appear.
	}
}

/** Wires the tools inside `root` (the article). Returns a function that unwires them. */
export function wireReleaseNotes(root: HTMLElement): () => void {
	const tools = root.querySelector<HTMLElement>("[data-release-tools]");
	if (!tools) return () => {};
	const search = tools.querySelector<HTMLInputElement>(".docs-release-search");
	const count = tools.querySelector<HTMLElement>(".docs-release-count");
	const folds = [...root.querySelectorAll<HTMLDetailsElement>("details.docs-details")];
	const wasOpen = new Map(folds.map((fold) => [fold, fold.open]));
	let kind: Kind = "all";
	let surface: Surface = "any";

	const apply = () => {
		const query = (search?.value ?? "").trim().toLowerCase();
		const active = query !== "" || kind !== "all" || surface !== "any";
		let shown = 0;
		for (const release of root.querySelectorAll<HTMLElement>(".docs-release")) {
			const tags = (release.dataset.tags ?? "").split(" ");
			let visible = surface === "any" || tags.includes(surface);
			if (kind === "breaking" && !tags.includes("breaking")) visible = false;
			const head =
				(release.querySelector(".docs-release-head")?.textContent ?? "").toLowerCase() +
				" " +
				(release.querySelector(".docs-release-headline")?.textContent ?? "").toLowerCase();
			const wholeMatch = query !== "" && head.includes(query);
			let entries = 0;
			for (const section of release.querySelectorAll<HTMLElement>(".docs-release-section")) {
				const sectionKind = section.dataset.kind ?? "";
				const kindFits = kind === "all" || kind === "breaking" || sectionKind === kind;
				let inSection = 0;
				for (const entry of section.querySelectorAll<HTMLElement>("li")) {
					const fits =
						visible &&
						kindFits &&
						(query === "" || wholeMatch || (entry.textContent ?? "").toLowerCase().includes(query));
					entry.hidden = !fits;
					if (fits) inSection++;
				}
				section.hidden = inSection === 0;
				entries += inSection;
			}
			const releaseShown = visible && (!active || entries > 0 || (wholeMatch && kind === "all"));
			release.hidden = !releaseShown;
			// The notes from before 0.59.2 are hidden by the page's own toggle,
			// so they are not counted while it is off.
			const tucked =
				document.documentElement.dataset.showprereleasenotes === "off" &&
				!!release.closest("[data-prerelease]");
			if (releaseShown && !tucked) shown++;
		}
		for (const fold of folds) {
			const any = !!fold.querySelector(".docs-release:not([hidden])");
			fold.hidden = active && !any;
			fold.open = active ? any : (wasOpen.get(fold) ?? false);
		}
		if (count)
			count.textContent = active ? `${shown} ${shown === 1 ? "release" : "releases"} match` : "";
		tools.classList.toggle("is-filtering", active);
	};

	const onInput = () => apply();
	const onClick = (e: Event) => {
		const target = e.target as HTMLElement;
		const chip = target.closest<HTMLButtonElement>("[data-kind-filter], [data-surface-filter]");
		if (chip) {
			const group = chip.parentElement;
			for (const other of group?.querySelectorAll("button") ?? [])
				other.classList.toggle("on", other === chip);
			if (chip.dataset.kindFilter) kind = chip.dataset.kindFilter as Kind;
			if (chip.dataset.surfaceFilter) surface = chip.dataset.surfaceFilter as Surface;
			apply();
			return;
		}
		const jump = target.closest<HTMLElement>("[data-jump]");
		if (jump) {
			e.preventDefault();
			const fold = root.querySelector(`[id="${jump.dataset.jump}"]`);
			if (fold) revealRelease(fold);
		}
	};
	search?.addEventListener("input", onInput);
	tools.addEventListener("click", onClick);
	return () => {
		search?.removeEventListener("input", onInput);
		tools.removeEventListener("click", onClick);
	};
}
