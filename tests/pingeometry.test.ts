/**
 * The pin geometry written twice, held equal.
 *
 * `NODE` in `src/app/layers.ts` and the tokens at the top of `theme.css` are
 * the same handful of numbers. They have to be: CSS cannot read a TypeScript
 * module, and the documentation's pictures cannot read a stylesheet, so the
 * canvas draws a pin from the tokens and every preview draws it from `NODE`.
 *
 * Both comments say "change one and change the other", and that was not enough.
 * `--exec-gap` went from 3px to 5px in the stylesheet during 0.35.0 and
 * `NODE.execGap` stayed at 3, which moved every execution triangle on the
 * canvas 2px further out while the wire that ends on it, and the same triangle
 * in the docs, stayed where they were. Nothing failed. Everything still looked
 * like a node.
 *
 * That is the whole class of bug this file exists for: two correct halves that
 * are no longer the same number.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { NODE } from "../src/app/layers.js";

const css = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app", "theme.css"),
	"utf8",
);

/**
 * The first declaration of a custom property, which is the one in `:root`.
 *
 * Deliberately not a CSS parse: the later re-declarations are a knot's smaller
 * slot and the dark theme's own colours, and neither is the number `NODE`
 * holds.
 */
function token(name: string): string {
	const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
	expect(match, `--${name} is declared in theme.css`).not.toBeNull();
	return match![1].trim();
}

function pixels(name: string): number {
	const value = token(name);
	const match = value.match(/^(-?[\d.]+)px$/);
	expect(match, `--${name} is a plain pixel length, not "${value}"`).not.toBeNull();
	return Number(match![1]);
}

describe("the pin geometry in theme.css and in NODE", () => {
	it.each([
		["pin-slot", NODE.pinSlot],
		["pin-pad", NODE.rowPadding],
		["pin-lane", NODE.pinLane],
		["exec-gap", NODE.execGap],
		["node-stroke", NODE.nodeStroke],
		["node-radius", NODE.radius],
	])("agree about --%s", (name, expected) => {
		expect(pixels(name)).toBe(expected);
	});

	/**
	 * The triangle's aspect is written as a multiplier rather than a length,
	 * because it is a ratio of the slot rather than a size of its own.
	 */
	it("agree about how wide an execution triangle is", () => {
		const value = token("exec-width");
		const match = value.match(/var\(--pin-slot\)\s*\*\s*([\d.]+)/);
		expect(match, `--exec-width is the slot times a ratio, not "${value}"`).not.toBeNull();
		expect(Number(match![1])).toBe(NODE.execAspect);
	});

	/**
	 * The stylesheet's own placement rules read the tokens rather than repeating
	 * their values, which is what makes checking the tokens enough. A literal
	 * creeping back into one of these offsets would put the pin somewhere the
	 * wire router has never heard of.
	 */
	it("place a pin from the tokens rather than from literals", () => {
		const rules = [
			".node .row .side.left .pin {",
			".node .row .side.right .pin {",
			".node .row .side.left .pin.exec {",
			".node .row .side.right .pin.exec {",
		];
		for (const start of rules) {
			const at = css.indexOf(start);
			expect(at, `${start} is still in theme.css`).toBeGreaterThan(-1);
			const body = css.slice(at + start.length, css.indexOf("}", at));
			const left = body.match(/left:\s*([^;]+);/);
			expect(left, `${start} sets left`).not.toBeNull();
			// Every length in the offset comes from a token. The only bare
			// numbers allowed are the -1 that flips it and the 2 that halves a
			// slot.
			expect(left![1], `${start} uses tokens`).toContain("var(--pin-pad)");
			expect(left![1], `${start} carries the border`).toContain("var(--node-stroke)");
			expect(left![1].replace(/var\(--[\w-]+\)/g, ""), `${start} has no literal px`)
				.not.toMatch(/\dpx/);
		}
	});
});
