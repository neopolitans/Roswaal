/**
 * Pointing between a drawn toolbar and its legend.
 *
 * The Toolbars page exists because icon-only chrome is unreadable on the first
 * day. Drawing the bar and listing the controls under it answers that halfway:
 * the reader still has to match the fourth glyph in a row to the seventh row in
 * a list, by counting. This closes the gap — **hover a button and its
 * explanation lights; hover an explanation and its button lights** — so the
 * page answers "which one is Settings" by pointing at it.
 *
 * Both sides carry `data-control`, derived from the control's name in
 * `src/core/docs/toolbars.ts`, so there is no second list to keep in step.
 *
 * ## Why this file has no imports
 *
 * Delivered two ways from one source, exactly as `graphView.ts` is. The in-app
 * Docs window calls it directly; `scripts/lib/toolbarLinker.mjs` bundles it into
 * the static site's script, which cannot import a module. A closure over
 * anything outside this function would not survive the trip.
 *
 * ## It is an enhancement, never a requirement
 *
 * Without it the bar is still drawn and every control is still named, with its
 * position written out in words — "second icon from the right" — which is what
 * a reader with no JavaScript, or no pointer, has to go on. The highlighting
 * makes that faster; it is not what carries the answer.
 */

/**
 * Wire one figure. Returns the undo, for a panel that unmounts.
 *
 * Scoped to the figure rather than the document, so two bars on one page that
 * both have a Docs button do not light each other.
 */
export function attachToolbarLink(figure: HTMLElement): () => void {
	const parts = Array.from(
		figure.querySelectorAll<HTMLElement>("[data-control]"),
	);
	if (parts.length === 0) return () => {};

	const byKey = new Map<string, HTMLElement[]>();
	for (const part of parts) {
		const key = part.dataset.control;
		if (!key) continue;
		const found = byKey.get(key);
		if (found) found.push(part);
		else byKey.set(key, [part]);
	}

	/**
	 * A control the reader tapped, which stays lit until something else is
	 * tapped. A touch screen has no hover, and without this the page would be
	 * exactly as hard to read on a phone as it was before.
	 */
	let pinned: string | null = null;

	const paint = (key: string | null) => {
		for (const part of parts) {
			part.classList.toggle("lit", key !== null && part.dataset.control === key);
		}
	};

	/**
	 * Bring a lit control into view sideways.
	 *
	 * A bar wider than the reading column scrolls, and the right-hand end —
	 * which is where the three hardest-to-find buttons are — is the part that is
	 * off screen. Lighting something the reader cannot see is worse than not
	 * lighting it. Horizontal only, and only within the picture's own scroller:
	 * `scrollIntoView` would move the page under them.
	 */
	const reveal = (key: string) => {
		// Whichever box the lit part is actually inside, found by walking up
		// from it rather than named. A map figure's columns scroll too, and
		// hunting for one hard-coded class would have quietly done nothing on
		// every figure that was not a toolbar.
		const found = (byKey.get(key) ?? [])
			.map((part) => {
				let box: HTMLElement | null = part.parentElement;
				while (box && box !== figure) {
					if (box.scrollWidth > box.clientWidth) return { box, target: part };
					box = box.parentElement;
				}
				return null;
			})
			.find((one) => one !== null);
		if (!found) return;
		const { box, target } = found;

		// Measured against the scroller, not against `offsetParent`. `offsetLeft`
		// is relative to the nearest positioned ancestor, which the picture is
		// not -- so on any page where something above it is positioned, this
		// scrolled to a number that meant nothing.
		const box_ = box.getBoundingClientRect();
		const at = target.getBoundingClientRect();
		const left = at.left - box_.left + box.scrollLeft;
		const right = left + at.width;
		const margin = 16;
		if (left < box.scrollLeft + margin) {
			box.scrollLeft = Math.max(0, left - margin);
		} else if (right > box.scrollLeft + box.clientWidth - margin) {
			box.scrollLeft = right - box.clientWidth + margin;
		}
	};

	const keyAt = (target: EventTarget | null): string | null => {
		if (!(target instanceof Element)) return null;
		const part = target.closest<HTMLElement>("[data-control]");
		return part && figure.contains(part) ? part.dataset.control ?? null : null;
	};

	const onOver = (e: Event) => {
		const key = keyAt(e.target);
		if (key === null) return;
		paint(key);
	};

	// Back to whatever was pinned rather than to nothing, so a tapped control
	// does not go dark the moment the pointer crosses it.
	const onOut = (e: Event) => {
		if (keyAt(e.target) === null) return;
		paint(pinned);
	};

	const onClick = (e: Event) => {
		const key = keyAt(e.target);
		if (key === null) return;
		// A link inside an explanation is a link first: let it navigate.
		if (e.target instanceof Element && e.target.closest("a")) return;
		pinned = pinned === key ? null : key;
		paint(pinned);
		if (pinned !== null) reveal(pinned);
	};

	figure.addEventListener("pointerover", onOver);
	figure.addEventListener("pointerout", onOut);
	figure.addEventListener("click", onClick);
	figure.classList.add("linked");

	return () => {
		figure.removeEventListener("pointerover", onOver);
		figure.removeEventListener("pointerout", onOut);
		figure.removeEventListener("click", onClick);
		figure.classList.remove("linked");
		paint(null);
	};
}

/**
 * Every toolbar figure on the page. What the static site's script runs.
 *
 * Map panels are the other linked figure and have their own attacher in
 * `mapPanel.ts`: they share the `data-control` idea and nothing else, because
 * selecting a row also has to fill an Inspector. One function trying to do
 * both would be two functions with a flag.
 */
export function attachToolbarLinks(root: ParentNode): void {
	for (const figure of Array.from(root.querySelectorAll<HTMLElement>(".docs-bar"))) {
		attachToolbarLink(figure);
	}
}
