/**
 * Wires up the attributions browser that `attributionsHtml` draws: search, the
 * usage filters, a name in the Simple grid opening it in Advanced, and the
 * licence buttons.
 *
 * Shared by the static documentation (bundled into `docs.js`, see
 * `scripts/lib/docsToggle.mjs`) and the editor's docs window, as the other
 * attach modules are. The DOM only -- no editor view -- so the static site
 * stays light: there a licence opens in a dialog drawn from the page's own
 * licence folds, and the editor passes `openLicence` to show it in its
 * read-only editor view instead (`LicenceView.tsx`).
 */

export interface AttributionsOptions {
	/**
	 * Opens a licence by its key, given the button that asked, to hand focus
	 * back to. Absent, the browser opens its own dialog.
	 */
	openLicence?: (key: string, from: HTMLElement) => void;
}

/**
 * Whether an entry shows: its usage is the one picked, or all are, and every
 * word searched for is somewhere in what it says.
 */
export function rowMatches(
	row: { usage?: string; search?: string },
	usage: string,
	query: string,
): boolean {
	if (usage !== "all" && row.usage !== usage) return false;
	const text = row.search ?? "";
	return query
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.every((word) => text.includes(word));
}

/** What the line over the list says about what it shows. */
export function summaryText(shown: number, total: number, holders: number): string {
	if (shown === total) return `${total} entries from ${holders} rights holders`;
	if (shown === 0) return `None of ${total} match`;
	return `Showing ${shown} of ${total}, from ${holders} ${holders === 1 ? "holder" : "holders"}`;
}

/** Attaches every browser under `root`; returns what undoes it. */
export function attachAttributions(
	root: ParentNode,
	options: AttributionsOptions = {},
): () => void {
	const undo: (() => void)[] = [];
	for (const box of root.querySelectorAll<HTMLElement>("[data-attributions]")) {
		undo.push(attachOne(box, options));
	}
	return () => {
		for (const fn of undo) fn();
	};
}

function attachOne(box: HTMLElement, options: AttributionsOptions): () => void {
	const tools = box.querySelector<HTMLElement>(".attr-tools");
	const search = box.querySelector<HTMLInputElement>(".attr-search input");
	const summary = box.querySelector<HTMLElement>(".attr-summary");
	const empty = box.querySelector<HTMLElement>(".attr-empty");
	const advanced = box.querySelector<HTMLInputElement>("#attr-view-advanced");
	const rows = [...box.querySelectorAll<HTMLElement>(".attr-row")];
	const groups = [...box.querySelectorAll<HTMLElement>(".attr-holder")];
	const chips = [...box.querySelectorAll<HTMLButtonElement>(".attr-chip")];
	const jumps = [...box.querySelectorAll<HTMLElement>("[data-jump]")];
	if (tools) tools.hidden = false;

	let query = "";
	let usage = "all";

	const apply = () => {
		let shown = 0;
		for (const row of rows) {
			const matches = rowMatches(row.dataset, usage, query);
			row.hidden = !matches;
			if (matches) shown++;
		}
		for (const group of groups) {
			group.hidden = !group.querySelector(".attr-row:not([hidden])");
		}
		for (const jump of jumps) {
			const group = box.querySelector<HTMLElement>(`#${jump.dataset.jump}`);
			jump.hidden = group?.hidden ?? false;
		}
		for (const chip of chips)
			chip.setAttribute("aria-pressed", String(chip.dataset.usage === usage));
		if (summary) {
			const holders = groups.filter((group) => !group.hidden).length;
			summary.textContent = summaryText(shown, rows.length, holders);
		}
		if (empty) empty.hidden = shown > 0;
	};

	const onInput = () => {
		query = (search?.value ?? "").trim().toLowerCase();
		apply();
	};
	search?.addEventListener("input", onInput);

	const onClick = (event: Event) => {
		const target = event.target instanceof Element ? event.target : null;
		const chip = target?.closest<HTMLButtonElement>(".attr-chip");
		if (chip && box.contains(chip)) {
			usage = chip.dataset.usage ?? "all";
			apply();
			return;
		}
		const pick = target?.closest<HTMLButtonElement>(".attr-pick");
		if (pick && box.contains(pick)) {
			reveal(pick.dataset.pick ?? "");
			return;
		}
		const licence = target?.closest<HTMLButtonElement>(".attr-licence");
		if (licence && box.contains(licence)) {
			const key = licence.dataset.licence ?? "";
			if (options.openLicence) options.openLicence(key, licence);
			else void openDialog(box, key, licence);
		}
	};
	box.addEventListener("click", onClick);

	/** A name picked in Simple: Advanced, everything showing, and that entry found. */
	const reveal = (anchor: string) => {
		if (advanced) advanced.checked = true;
		query = "";
		usage = "all";
		if (search) search.value = "";
		apply();
		const row = box.querySelector<HTMLElement>(`#${anchor}`);
		if (!row) return;
		row.scrollIntoView({ block: "center" });
		row.classList.add("attr-found");
		window.setTimeout(() => row.classList.remove("attr-found"), 1600);
		const link = row.querySelector<HTMLElement>(".attr-name a");
		(link ?? row).focus({ preventScroll: true });
	};

	apply();
	return () => {
		search?.removeEventListener("input", onInput);
		box.removeEventListener("click", onClick);
	};
}

/**
 * The static site's licence dialog: the page's own fold for that licence --
 * its source, its hash and its numbered text -- in a modal, or this build's
 * notices file, read and numbered the same way.
 */
async function openDialog(box: HTMLElement, key: string, from: HTMLElement): Promise<void> {
	const doc = box.ownerDocument;
	const fold = doc.getElementById(`licence-${key}`);
	if (key !== "notices" && !fold) return;
	if (typeof HTMLDialogElement === "undefined") {
		fold?.scrollIntoView();
		return;
	}

	const dialog = doc.createElement("dialog");
	dialog.className = "attr-dialog";
	const head = doc.createElement("div");
	head.className = "attr-dialog-head";
	const title = doc.createElement("h2");
	const close = doc.createElement("button");
	close.type = "button";
	close.className = "tb";
	close.textContent = "Close";
	close.addEventListener("click", () => dialog.close());
	head.append(title, close);
	dialog.append(head);

	let text = "";
	const actions = doc.createElement("div");
	actions.className = "licence-actions";

	if (key === "notices") {
		title.textContent = "Third-party notices";
		const href = box.dataset.notices ?? "";
		const note = doc.createElement("p");
		note.className = "licence-meta";
		note.textContent =
			"Every package this build bundles, each with its own licence file, copied as published.";
		dialog.append(note);
		try {
			const res = await fetch(href);
			if (!res.ok) throw new Error(String(res.status));
			text = await res.text();
			dialog.append(numbered(doc, text, "Third-party notices"));
		} catch {
			const failed = doc.createElement("p");
			failed.className = "licence-meta";
			failed.textContent = "The notices could not be read here. Open them as a file instead.";
			dialog.append(failed);
		}
		const open = doc.createElement("a");
		open.className = "tb";
		open.href = href;
		open.textContent = "Open as a file";
		actions.append(open);
	} else if (fold) {
		const name = fold.querySelector(".docs-details-title");
		// The fold's own title, its licence's label with it.
		if (name) title.append(...[...name.childNodes].map((node) => node.cloneNode(true)));
		const meta = fold.querySelector(".licence-meta");
		const lines = fold.querySelector(".licence-lines");
		if (meta) dialog.append(meta.cloneNode(true));
		if (lines) dialog.append(lines.cloneNode(true));
		text = [...(lines?.querySelectorAll("li") ?? [])].map((li) => li.textContent ?? "").join("\n");
		const original = meta?.querySelector<HTMLAnchorElement>("a");
		if (original) {
			const compare = doc.createElement("a");
			compare.className = "tb";
			compare.href = original.href;
			compare.textContent = "Compare with the original";
			actions.append(compare);
		}
	}

	if (text) {
		const copy = doc.createElement("button");
		copy.type = "button";
		copy.className = "tb";
		copy.textContent = "Copy text";
		copy.addEventListener("click", () => {
			navigator.clipboard.writeText(text).then(
				() => {
					copy.textContent = "Copied";
				},
				() => {
					copy.textContent = "Select it and copy";
				},
			);
		});
		actions.prepend(copy);
	}
	dialog.append(actions);
	dialog.addEventListener("close", () => {
		dialog.remove();
		from.focus();
	});
	// A click on the backdrop is a click on the dialog itself.
	dialog.addEventListener("click", (event) => {
		if (event.target === dialog) dialog.close();
	});
	box.append(dialog);
	dialog.showModal();
}

/** Text as numbered lines, the way the licence folds draw it. */
function numbered(doc: Document, text: string, label: string): HTMLOListElement {
	const list = doc.createElement("ol");
	list.className = "licence-lines";
	list.setAttribute("aria-label", label);
	for (const line of text.replace(/\n$/, "").split("\n")) {
		const item = doc.createElement("li");
		item.textContent = line;
		list.append(item);
	}
	return list;
}
