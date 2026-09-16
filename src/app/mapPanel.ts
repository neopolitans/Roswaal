/**
 * Making the drawn map editor answer when you click it.
 *
 * The map pages draw the real panel — the tree, the Inspector, the project
 * file underneath. Drawn and left alone it is a screenshot, and a screenshot
 * of an editor answers "what does it look like" rather than the question the
 * page is for, which is **what does this row of my tree turn into**.
 *
 * So: select a row, and the Inspector fills with that node's values while the
 * lines it writes light up in the file. That is the correspondence the page
 * exists to explain, and it is something you point at rather than something
 * you describe.
 *
 * ## Why this file has no imports
 *
 * Delivered two ways from one source, exactly as `toolbarLink.ts` is. The
 * in-app Docs window calls it directly; `scripts/lib/mapPanel.mjs` bundles it
 * into the static site's script, which cannot import a module. A closure over
 * anything outside this function would not survive the trip.
 *
 * ## It is an enhancement, never a requirement
 *
 * Without it the panel is still fully drawn, with the first row selected, its
 * values in the Inspector and the whole project file below — which is a
 * correct and complete figure, just a fixed one. The clicking makes the
 * correspondence explorable; it is not what carries it.
 */

/** What a row carries about itself, written into `data-map-node` by core. */
interface Inspected {
	heading: string;
	name: string;
	class: string;
	kind: string;
	path: string;
	ignoreUnknown: boolean;
	ignorePaths: string[];
	root: boolean;
}

/**
 * Wire one figure. Returns the undo, for a panel that unmounts.
 *
 * Scoped to the figure rather than the document, so two maps on one page do
 * not drive each other's Inspector.
 */
export function attachMapPanel(figure: HTMLElement): () => void {
	const rows = Array.from(figure.querySelectorAll<HTMLElement>(".map-row[data-control]"));
	if (rows.length === 0) return () => {};

	const lines = Array.from(figure.querySelectorAll<HTMLElement>(".map-preview-line"));
	const heading = figure.querySelector<HTMLElement>("[data-map-heading]");

	// Untyped, because these are a mix of inputs, checkboxes and selects and
	// each use narrows to the one it wants.
	const fieldOf = (name: string) =>
		figure.querySelector<HTMLElement>(`[data-map-field="${name}"]`);

	/** The row the Inspector is showing. Core marks the first one. */
	let picked: string = rows.find((r) => r.classList.contains("selected"))?.dataset.control
		?? rows[0].dataset.control
		?? "";

	const read = (row: HTMLElement): Inspected | null => {
		const raw = row.dataset.mapNode;
		if (!raw) return null;
		try {
			return JSON.parse(raw) as Inspected;
		} catch {
			// A row that cannot say what it is simply does not drive the
			// Inspector. The figure stays on whatever it was showing.
			return null;
		}
	};

	/**
	 * Light the lines belonging to a node, and nothing else.
	 *
	 * `key` is the row under the pointer if there is one, and the selected row
	 * otherwise, so moving away puts the highlight back where the selection
	 * left it rather than clearing it.
	 */
	const paint = (key: string) => {
		for (const line of lines) {
			line.classList.toggle("lit", line.dataset.control === key);
		}
		for (const row of rows) {
			row.classList.toggle("lit", row.dataset.control === key && key !== picked);
		}
	};

	const fill = (row: HTMLElement) => {
		const one = read(row);
		if (!one) return;

		if (heading) heading.textContent = one.heading;

		const name = fieldOf("name");
		if (name instanceof HTMLInputElement) name.value = one.name;

		// A `<select>` showing one fixed answer needs its option rewritten.
		// Setting `value` alone would look for a matching option, find none,
		// and blank the control.
		const cls = fieldOf("class");
		if (cls instanceof HTMLSelectElement && cls.options.length > 0) {
			cls.options[0].textContent = one.class;
		}

		const kind = fieldOf("kind");
		if (kind instanceof HTMLSelectElement && kind.options.length > 0) {
			kind.options[0].textContent = one.kind;
			// The root of a filesystem map is the project directory, which is
			// neither a file nor a directory you chose -- the editor hides the
			// field rather than showing an answer that is not true.
			const label = kind.closest<HTMLElement>(".field");
			if (label) label.hidden = one.root;
		}

		const path = fieldOf("path");
		if (path instanceof HTMLInputElement) path.value = one.path;

		const ignore = fieldOf("ignoreUnknown");
		if (ignore instanceof HTMLInputElement) ignore.checked = one.ignoreUnknown;

		const list = figure.querySelector<HTMLElement>('[data-map-list="ignorePaths"]');
		if (list) {
			for (const old of Array.from(list.querySelectorAll(".map-list-row"))) old.remove();
			for (const value of one.ignorePaths) {
				const div = document.createElement("div");
				div.className = "map-list-row";
				const input = document.createElement("input");
				input.className = "tb";
				input.readOnly = true;
				input.value = value;
				const remove = document.createElement("button");
				remove.className = "tb";
				remove.disabled = true;
				remove.textContent = "×";
				div.append(input, remove);
				list.append(div);
			}
		}
	};

	/**
	 * Bring the lines a row writes into view.
	 *
	 * The project file sits at the foot of the Inspector, as it does in the
	 * editor, which on a figure this size puts it below the fold and inside a
	 * box with its own scrollbar. Lighting lines the reader cannot see is worse
	 * than not lighting them.
	 *
	 * Every scroller between the line and the figure is moved, innermost first,
	 * because there are two: the project file scrolls inside the Inspector, and
	 * the Inspector scrolls inside the panel. Centring rather than nudging to
	 * the edge -- a stanza is several lines and the reader wants the ones around
	 * it too.
	 *
	 * Never `scrollIntoView`: that would move the whole page, which is the one
	 * thing somebody who clicked a row in a figure did not ask for.
	 */
	const reveal = (key: string) => {
		const target = lines.find((line) => line.dataset.control === key);
		if (!target) return;

		let box: HTMLElement | null = target.parentElement;
		while (box && box !== figure) {
			// A pixel of slack: a box can be a hair taller than its content
			// through rounding without being a scroller.
			if (box.scrollHeight > box.clientHeight + 1) {
				const outer = box.getBoundingClientRect();
				const at = target.getBoundingClientRect();
				const top = at.top - outer.top + box.scrollTop;
				box.scrollTop = Math.max(0, top - (box.clientHeight - at.height) / 2);
			}
			box = box.parentElement;
		}
	};

	const pick = (key: string) => {
		const row = rows.find((r) => r.dataset.control === key);
		if (!row) return;
		const first = picked === key;
		picked = key;
		for (const one of rows) one.classList.toggle("selected", one === row);
		fill(row);
		paint(key);
		// Not on the opening selection: the figure should start at the top of
		// the Inspector, where its first field is, rather than scrolled to the
		// project file before anybody has asked anything.
		if (!first) reveal(key);
	};

	/**
	 * Fold a row's children away, as the editor's disclosure arrow does.
	 *
	 * Depth comes from the indent core wrote, because that is the only place
	 * the drawn tree records its shape — the rows are siblings in the markup,
	 * not nested, exactly as the editor renders them.
	 */
	const depthOf = (row: HTMLElement) => parseInt(row.style.paddingLeft || "8", 10);

	const folded = new Set<string>();

	const refold = () => {
		let hideBelow: number | null = null;
		for (const row of rows) {
			const depth = depthOf(row);
			if (hideBelow !== null && depth > hideBelow) {
				row.hidden = true;
				continue;
			}
			hideBelow = null;
			row.hidden = false;
			const key = row.dataset.control ?? "";
			if (folded.has(key)) hideBelow = depth;
		}
	};

	const keyAt = (target: EventTarget | null): string | null => {
		if (!(target instanceof Element)) return null;
		const part = target.closest<HTMLElement>("[data-control]");
		return part && figure.contains(part) ? part.dataset.control ?? null : null;
	};

	// Both of these say what the state *is* for wherever the pointer now is,
	// rather than reacting to having entered something. Reacting left the
	// previous answer on screen whenever the pointer moved onto a piece of the
	// panel that is not a part -- which is most of it.
	const onOver = (e: Event) => {
		paint(keyAt(e.target) ?? picked);
	};

	const onLeave = () => {
		paint(picked);
		shine(null);
	};

	const onClick = (e: Event) => {
		const target = e.target;
		if (target instanceof Element) {
			const glyph = target.closest<HTMLElement>(".glyph");
			const row = glyph?.closest<HTMLElement>(".map-row");
			if (glyph && row && glyph.style.visibility !== "hidden") {
				const key = row.dataset.control ?? "";
				if (folded.has(key)) folded.delete(key);
				else folded.add(key);
				glyph.style.transform = folded.has(key) ? "none" : "rotate(90deg)";
				refold();
				return;
			}
		}
		const key = keyAt(e.target);
		if (key !== null) pick(key);
	};

	// -- the legend, which is the other axis ------------------------------
	//
	// Two pairings live on this figure and they are deliberately separate.
	// `data-control` is a node: a tree row and the lines it writes. `data-part`
	// is a piece of the panel: a legend entry and the control it names. A
	// reader hovering "Path" in the legend wants the Path field lit, not a
	// different instance selected.

	const parts = Array.from(figure.querySelectorAll<HTMLElement>("[data-part]"));

	const shine = (part: string | null) => {
		for (const one of parts) {
			one.classList.toggle("shown", part !== null && one.dataset.part === part);
		}
		figure.classList.toggle("pointing", part !== null);
	};

	/**
	 * What the pointer is asking about, which is not the same as what lights.
	 *
	 * The tree body and the project file both light — hovering "The tree" in
	 * the legend should ring the whole tree — but neither may *trigger*,
	 * because the reader is inside them the whole time they are using the
	 * other pairing. Hovering a row to watch its lines light, and having the
	 * project file dim for being the part you are not pointing at, is the
	 * figure putting out the thing it was asked to show.
	 *
	 * So they carry `data-quiet`, and the header above each carries the grip
	 * instead: the map's own bar for the tree, the "Project file" heading for
	 * the output. Point at the heading and you are asking where that section
	 * is; point inside it and you are reading it.
	 */
	const partAt = (target: EventTarget | null): string | null => {
		if (!(target instanceof Element)) return null;
		const one = target.closest<HTMLElement>("[data-grip],[data-part]:not([data-quiet])");
		if (!one || !figure.contains(one)) return null;
		return one.dataset.grip ?? one.dataset.part ?? null;
	};

	const onPartOver = (e: Event) => {
		shine(partAt(e.target));
	};

	figure.addEventListener("pointerover", onPartOver);
	figure.addEventListener("pointerover", onOver);
	figure.addEventListener("pointerleave", onLeave);
	figure.addEventListener("click", onClick);
	figure.classList.add("linked");

	// The arrows point down to start with, because nothing is folded. The
	// editor turns them the same way round.
	for (const row of rows) {
		const glyph = row.querySelector<HTMLElement>(".glyph");
		if (glyph && glyph.style.visibility !== "hidden") glyph.style.transform = "rotate(90deg)";
	}
	if (picked) pick(picked);

	return () => {
		figure.removeEventListener("pointerover", onPartOver);
		figure.removeEventListener("pointerover", onOver);
		figure.removeEventListener("pointerleave", onLeave);
		figure.removeEventListener("click", onClick);
		figure.classList.remove("pointing");
		for (const one of parts) one.classList.remove("shown");
		figure.classList.remove("linked");
		for (const line of lines) line.classList.remove("lit");
		for (const row of rows) {
			row.classList.remove("lit");
			row.hidden = false;
		}
	};
}

/** Every drawn map panel on the page. What the static site's script runs. */
export function attachMapPanels(root: ParentNode): void {
	for (const figure of Array.from(root.querySelectorAll<HTMLElement>(".docs-map"))) {
		attachMapPanel(figure);
	}
}
