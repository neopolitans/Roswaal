/**
 * The bar along the bottom of a touch screen, and the status pill beside it.
 *
 * Measured on an iPad Mini's size with touch input: the rule hiding the cards'
 * buttons on a tablet lost to the rule drawing the bar's buttons, so both came
 * back on every iPad; and the pill shared the bar's row, overlapping it held
 * upright and covering it when open.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/app/theme.css", import.meta.url), "utf8");

/** Classes and pseudo-classes, then elements: enough to compare these two. */
function specificity(selector: string): [number, number] {
	const classes = (selector.match(/[.:][\w-]+/g) ?? []).length;
	const elements = selector
		.replace(/[.:#][\w-]+(\([^)]*\))?/g, " ")
		.split(/[\s>+~]+/)
		.filter((part) => /^[a-z]+$/i.test(part)).length;
	return [classes, elements];
}

const outranks = (a: [number, number], b: [number, number]) =>
	a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1]);

describe("the bar on a touch screen", () => {
	it("hides the cards' buttons on a tablet, outranking the rule that draws them", () => {
		const tablet = css.match(/@media \(min-width: 700px\) \{([\s\S]*?)\n\}/g) ?? [];
		const hide = tablet
			.flatMap((block) => [
				...block.matchAll(/([^{}\n]*drawer-toggle[^{}\n]*)\{\s*display: none;/g),
			])
			.map((m) => m[1].trim())
			.find((selector) => !selector.includes(":not("));
		expect(hide).toBeDefined();
		const draw = ".drawer-toggles button.tb.icon-only";
		expect(css).toContain(`${draw} {`);
		expect(outranks(specificity(hide ?? ""), specificity(draw))).toBe(true);
	});

	it("stands the Code panel a row above the lifted pill, on a tablet and a phone", () => {
		const tablet = css.match(
			/\.workspace\.compact:has\(\.drawer-toggles \.touch-bar\) \.dock\.foot \{\s*bottom: ([^;]+);/,
		);
		expect(tablet?.[1]).toContain("var(--hit) * 2");
		const phone = css.match(/@media \(max-width: 699px\) \{\s*\.dock\.foot \{\s*bottom: ([^;]+);/);
		expect(phone?.[1]).toContain("var(--hit) * 2");
	});

	it("stands the status pill above the bar while the bar is up", () => {
		const rule = css.match(
			/\.workspace\.compact:has\(\.drawer-toggles \.touch-bar\) \.dock\.bottom \{\s*bottom: ([^;]+);/,
		);
		expect(rule?.[1]).toContain("var(--hit)");
	});
});
