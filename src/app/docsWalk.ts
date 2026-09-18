/**
 * A walkthrough: one drawing, and the steps under it lit in turn.
 *
 * Steps that happen on screen read better shown than listed, and better shown
 * one at a time than all at once: the drawing changes to what the screen looks
 * like at that step, the control to press is ringed, and the list under it
 * says which step this is, which are done, and which are still to come.
 *
 * The reader moves with **Back** and **Next**, by tapping a step, or by
 * tapping the ringed control itself -- the same thing they will do on the
 * real screen, which is most of the point.
 *
 * ## Why this file has no imports
 *
 * Delivered two ways from one source, as `docsToggle.ts` is: the in-app Docs
 * window calls `attachWalkthrough` on its figure, and the published site
 * bundles `attachWalkthroughs`.
 *
 * ## It is an enhancement, never a requirement
 *
 * With no script the first drawing shows and every step is listed, numbered,
 * as the ordinary list it replaced. The stepping is what the script adds.
 */

/** Which of the steps each list item is, for its class. */
export function stepState(step: number, at: number): "done" | "current" | "next" {
	return step < at ? "done" : step === at ? "current" : "next";
}

/** Wire one walkthrough. Returns the undo, for a panel that unmounts. */
export function attachWalkthrough(figure: HTMLElement): () => void {
	const frames = Array.from(figure.querySelectorAll<HTMLElement>(".docs-walk-frame"));
	const steps = Array.from(figure.querySelectorAll<HTMLElement>(".docs-walk-steps > li"));
	const back = figure.querySelector<HTMLButtonElement>("[data-walk='back']");
	const next = figure.querySelector<HTMLButtonElement>("[data-walk='next']");
	const count = figure.querySelector<HTMLElement>(".docs-walk-count");
	if (frames.length === 0 || frames.length !== steps.length) return () => {};

	let at = 0;
	let here: HTMLElement | null = null;
	const view = figure.querySelector<HTMLElement>(".docs-walk-window");

	/**
	 * The drawing at its real size where it fits, and scaled down to fit where
	 * it does not -- a desktop bar in a phone-width column -- so the whole bar
	 * and the ringed control are in view. Past 60% it scrolls instead, and
	 * brings the ringed control into view.
	 */
	const fit = () => {
		const frame = frames[at];
		if (!view || !frame) return;
		frame.style.zoom = "";
		const room = view.clientWidth;
		const wants = frame.scrollWidth;
		const scale = wants > room ? Math.max(0.6, room / wants) : 1;
		frame.style.zoom = scale === 1 ? "" : String(scale);
		// Scaled to fit, it fits: no scrollbar for a pixel of rounding.
		view.style.overflowX = scale > 0.6 ? "hidden" : "";
		if (here) {
			const box = view.getBoundingClientRect();
			const spot = here.getBoundingClientRect();
			if (spot.left < box.left || spot.right > box.right) {
				view.scrollLeft += spot.left - box.left - (box.width - spot.width) / 2;
			}
		}
	};
	const watch = typeof ResizeObserver === "undefined" || !view ? null : new ResizeObserver(fit);
	watch?.observe(view!);

	const show = (index: number) => {
		at = Math.max(0, Math.min(steps.length - 1, index));
		frames.forEach((frame, i) => { frame.hidden = i !== at; });
		steps.forEach((step, i) => {
			const state = stepState(i, at);
			step.classList.toggle("walk-done", state === "done");
			step.classList.toggle("walk-current", state === "current");
			step.classList.toggle("walk-next", state === "next");
			if (state === "current") step.setAttribute("aria-current", "step");
			else step.removeAttribute("aria-current");
		});
		here?.classList.remove("walk-here");
		const point = frames[at]!.dataset.point;
		here = point ? frames[at]!.querySelector<HTMLElement>(`[data-control="${point}"]`) : null;
		here?.classList.add("walk-here");
		if (count) count.textContent = `Step ${at + 1} of ${steps.length}`;
		if (back) back.disabled = at === 0;
		if (next) next.textContent = at === steps.length - 1 ? "Start over" : "Next";
		fit();
	};

	const onBack = () => show(at - 1);
	const onNext = () => show(at === steps.length - 1 ? 0 : at + 1);
	const onClick = (event: Event) => {
		const target = event.target as Element;
		// A link in a step's words is a link, not a way to pick the step.
		if (target.closest("a")) return;
		if (here && target.closest(".walk-here") === here && at < steps.length - 1) {
			show(at + 1);
			return;
		}
		const step = target.closest(".docs-walk-steps > li");
		if (step) show(steps.indexOf(step as HTMLElement));
	};

	back?.addEventListener("click", onBack);
	next?.addEventListener("click", onNext);
	figure.addEventListener("click", onClick);
	figure.classList.add("walk-on");
	show(0);

	return () => {
		back?.removeEventListener("click", onBack);
		next?.removeEventListener("click", onNext);
		figure.removeEventListener("click", onClick);
		figure.classList.remove("walk-on");
		watch?.disconnect();
	};
}

/** Every walkthrough on a published page. */
export function attachWalkthroughs(doc: Document): void {
	for (const figure of Array.from(doc.querySelectorAll<HTMLElement>(".docs-walk"))) {
		attachWalkthrough(figure);
	}
}
