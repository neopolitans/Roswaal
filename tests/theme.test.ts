/**
 * Themes: the schemes, the format, and the two ways this can silently half-work.
 *
 * Most of this file is about failures that produce **no error at all**, which is
 * what makes them worth a test rather than a careful eye:
 *
 * - A token the editor sets but the stylesheet never reads is legal CSS. So is a
 *   variable the stylesheet reads that nothing ever sets — it just falls back to
 *   its declaration. Either way one colour quietly stays on the built-in default
 *   in every theme, and nothing anywhere says so. Beako shipped exactly this for
 *   a release across three colours and four roles.
 * - `src/core/themeData.ts` is generated and committed, so it can drift from
 *   `themes/` and still compile perfectly.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
	CODE_ROLES, COLOR_ROLES, ROLES, contrast, derivedTokens, themeSlug, themeTokens,
	validateTheme, type Theme,
} from "../src/core/theme.js";
import { BUILTIN_THEMES, LICENCE_TEXTS } from "../src/core/themeData.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "src", "app", "theme.css"), "utf8");

/**
 * Everything that could read a token.
 *
 * Not just the stylesheet: three tokens are read from TSX rather than CSS,
 * because the canvas grid is a `background-image` computed at the zoom level and
 * a wire is an SVG stroke chosen per link. Both write `var(--…)` into an inline
 * style, which is a perfectly ordinary way to read a custom property and would
 * look like a dead token to a test that only opened `theme.css`. The guarantee
 * being made is "somewhere in the app", so that is what gets searched.
 */
function sources(dir: string, found: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) sources(path, found);
		else if (/\.(ts|tsx|css)$/.test(entry)) found.push(readFileSync(path, "utf8"));
	}
	return found;
}

const appSource = sources(join(root, "src")).join("\n");

/** A deep copy, so a test that breaks a theme cannot break the next test. */
function clone(name: string): Theme {
	const found = BUILTIN_THEMES.find((t) => t.name === name);
	if (!found) throw new Error(`no theme named ${name}`);
	return JSON.parse(JSON.stringify(found)) as Theme;
}

describe("the shipped schemes", () => {
	it("all validate", () => {
		for (const theme of BUILTIN_THEMES) {
			expect(validateTheme(theme, theme.name), theme.name).toEqual([]);
		}
	});

	it("ships both a light and a dark one, so following the system has an answer", () => {
		expect(BUILTIN_THEMES.some((t) => !t.dark)).toBe(true);
		expect(BUILTIN_THEMES.some((t) => t.dark)).toBe(true);
	});

	it("gives every scheme a unique name and a unique slug", () => {
		const names = BUILTIN_THEMES.map((t) => t.name);
		const slugs = names.map(themeSlug);
		expect(new Set(names).size).toBe(names.length);
		expect(new Set(slugs).size).toBe(slugs.length);
	});

	/**
	 * A scheme that is somebody else's work has to say whose, and the licence
	 * has to be readable — not linked. MIT requires the notice to travel with
	 * the work, and a URL is not the notice travelling.
	 */
	it("carries the full licence text for every borrowed scheme", () => {
		for (const theme of BUILTIN_THEMES) {
			if (theme.licence === undefined) {
				expect(theme.credit, `${theme.name} has neither a licence nor a credit`).toBeDefined();
				continue;
			}
			const text = LICENCE_TEXTS[theme.licence.textFile];
			expect(text, `${theme.name}: ${theme.licence.textFile} was not compiled in`).toBeDefined();
			expect(text.length, theme.name).toBeGreaterThan(200);
			expect(theme.credit, theme.name).toBeDefined();
			expect(theme.source, theme.name).toMatch(/^https:\/\//);
		}
	});

	/**
	 * The specific mistake the vendored files exist to prevent. A licence
	 * rendered from a template leaves the placeholders in, and a panel that
	 * displays `Copyright (c) <year> <copyright holders>` under a real person's
	 * name is worse than no attribution at all.
	 */
	it("never shows a licence with the template placeholders still in it", () => {
		for (const [file, text] of Object.entries(LICENCE_TEXTS)) {
			expect(text, file).not.toContain("<copyright holders>");
			expect(text, file).not.toContain("<year>");
			expect(text, file).toMatch(/Copyright \(c\) \d{4}/);
		}
	});

	it("names a holder that actually appears in the licence it points at", () => {
		for (const theme of BUILTIN_THEMES) {
			if (theme.licence === undefined) continue;
			expect(LICENCE_TEXTS[theme.licence.textFile], theme.name).toContain(theme.licence.holder);
		}
	});
});

describe("the generated module", () => {
	/**
	 * Generated *and* committed, so a fresh clone builds. That is also what
	 * makes it able to rot, and this is the only thing that would notice.
	 */
	it("matches themes/ on disk", () => {
		const dir = join(root, "themes");
		const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
		const onDisk = files
			.map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Theme)
			.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

		expect(onDisk.length, "themes/ and the generated module hold different counts").toBe(
			BUILTIN_THEMES.length,
		);
		expect(onDisk).toEqual(BUILTIN_THEMES);
	});

	it("names each file after the slug of the theme inside it", () => {
		const dir = join(root, "themes");
		for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
			const theme = JSON.parse(readFileSync(join(dir, file), "utf8")) as Theme;
			expect(file).toBe(`${themeSlug(theme.name)}.json`);
		}
	});
});

/**
 * ## The half-applied theme
 *
 * Both halves of it. A role the stylesheet never reads is a colour a scheme
 * cannot actually change; a variable nothing sets is a colour frozen on its
 * declaration. Neither produces an error, in the browser or in the build.
 */
describe("every role reaches the stylesheet", () => {
	const declared = new Set(
		[...css.matchAll(/^\s*(--[a-z-]+)\s*:/gm)].map((m) => m[1]),
	);
	const read = new Set([...appSource.matchAll(/var\(\s*(--[a-z-]+)/g)].map((m) => m[1]));

	const every = [...ROLES, ...CODE_ROLES];

	it("declares a default for every one, so an unthemed page still has a colour", () => {
		for (const { role, css: variable } of every) {
			expect(declared.has(variable), `${role} sets ${variable}, which theme.css never declares`)
				.toBe(true);
		}
	});

	it("actually reads every one somewhere", () => {
		for (const { role, css: variable } of every) {
			expect(read.has(variable), `${role} sets ${variable}, which nothing in theme.css reads`)
				.toBe(true);
		}
	});

	/** The derived overlays are tokens too, and go stale the same way. */
	it("reads the tokens a theme derives rather than authors", () => {
		for (const token of Object.keys(derivedTokens(true))) {
			if (!token.startsWith("--")) continue;
			expect(read.has(token), `${token} is derived but nothing reads it`).toBe(true);
		}
	});
});

/**
 * ## Highlighted Luau that is not actually coloured
 *
 * The third variety of the silent-CSS failure this file exists for, and the one
 * that actually shipped: the selection preview ran the highlighter, emitted
 * spans carrying the right `tok-` classes, and rendered every one of them in
 * plain body text — because the palette was scoped to `.docs-code` and nothing
 * anywhere said so.
 *
 * No error, in the browser or the build. A class nobody styles is legal HTML.
 */
describe("every token class is coloured somewhere", () => {
	/** The classes `highlightLuau` can emit, read from its own map. */
	const emitted = [
		...readFileSync(join(root, "src", "app", "highlight.ts"), "utf8")
			.matchAll(/"(tok-[a-z]+)"/g),
	].map((m) => m[1]);

	it("styles each one", () => {
		expect(emitted.length, "the highlighter emits classes at all").toBeGreaterThan(5);
		for (const cls of new Set(emitted)) {
			expect(css.includes(`.${cls}`), `${cls} is emitted but theme.css never colours it`)
				.toBe(true);
		}
	});

	/**
	 * Every container that renders those spans has to be in the rule's selector
	 * list. Asserted by name rather than by counting, because the failure is a
	 * container *missing* from the list and a count cannot see that.
	 */
	it("colours them in every place that shows Luau", () => {
		// Whatever stands to the left of `.tok-keyword` in every rule that
		// styles it — flat selectors and `:is(...)` groups alike.
		const selectors = [...css.matchAll(/^(.*)\.tok-keyword\s*\{/gm)]
			.map((m) => m[1])
			.join(" ");
		expect(selectors, "nothing styles .tok-keyword at all").not.toBe("");

		for (const container of [".docs-code", ".preview-code"]) {
			expect(
				selectors.includes(container),
				`${container} renders highlighted Luau but is not in the token palette's selector`,
			).toBe(true);
		}
	});
});

describe("applying a theme", () => {
	it("produces a value for every role and every derived token", () => {
		const tokens = themeTokens(clone("Roswaal Dark"));
		for (const { css: variable } of [...ROLES, ...CODE_ROLES]) {
			expect(tokens[variable]).toMatch(/^#[0-9a-f]{6}$/i);
		}
		for (const token of Object.keys(derivedTokens(true))) {
			expect(tokens[token], token).toBeDefined();
		}
	});

	/**
	 * Overlays are white on a dark ground and black on a light one. Getting this
	 * backwards is invisible until somebody hovers something.
	 */
	it("turns overlays the right way round", () => {
		expect(themeTokens(clone("Roswaal Dark"))["--bg-hover"]).toContain("255, 255, 255");
		expect(themeTokens(clone("Roswaal Light"))["--bg-hover"]).toContain("0, 0, 0");
	});
});

/**
 * ## The validator
 *
 * A validator that has never rejected anything is indistinguishable from one
 * that does nothing, so each rule gets the palette it exists to catch.
 */
describe("what the validator refuses", () => {
	const rejects = (label: string, mutate: (t: Theme) => void, expected: RegExp) => {
		it(label, () => {
			const theme = clone("Roswaal Dark");
			mutate(theme);
			const problems = validateTheme(theme, "x");
			expect(problems.join(" | "), label).toMatch(expected);
		});
	};

	rejects(
		"a scheme that misreports whether it is dark",
		(t) => { t.dark = false; },
		/dark is false but app/,
	);
	rejects(
		"a node the same colour as the canvas it sits on",
		(t) => { t.colors.nodeBody = t.colors.canvas; },
		/indistinguishable from canvas/,
	);
	rejects(
		"body text nobody could read",
		(t) => { t.colors.text = "#20242a"; },
		/below 4\.5:1/,
	);
	rejects(
		"a three-digit hex",
		(t) => { t.colors.accent = "#fff"; },
		/not a #rrggbb colour/,
	);
	rejects(
		"a missing role",
		(t) => { delete (t.colors as Record<string, string>).pure; },
		/colors\.pure is missing/,
	);
	rejects(
		"a role that is not one",
		(t) => { (t.colors as Record<string, string>).sparkle = "#ffffff"; },
		/colors\.sparkle is not a role/,
	);
	rejects(
		"a comment the same colour as the editor background",
		(t) => { t.code.comment = "#25292f"; },
		/code\.comment .* below 2:1/,
	);
	rejects(
		"a licence with nothing behind it",
		(t) => { t.licence = { spdx: "", holder: "", textFile: "" }; },
		/licence\.spdx is missing/,
	);

	it("takes a whole object being missing without throwing", () => {
		expect(validateTheme(null, "x")).toEqual(["x: not an object"]);
		expect(validateTheme({}, "x").length).toBeGreaterThan(0);
	});

	/**
	 * A comment is meant to be quiet, and every serious syntax theme mutes its
	 * own below what a token threshold would allow. The bar it has to clear is
	 * "visible at all", not "as loud as a keyword" — so this asserts the two
	 * thresholds are genuinely different rather than one number written twice.
	 */
	it("holds comments to a lower bar than the rest, on purpose", () => {
		const theme = clone("Roswaal Dark");
		// A colour that clears 2:1 but not 3:1 against this scheme's input.
		const quiet = "#5a6068";
		expect(contrast(quiet, theme.colors.input)).toBeGreaterThan(2);
		expect(contrast(quiet, theme.colors.input)).toBeLessThan(3);

		const asComment = clone("Roswaal Dark");
		asComment.code.comment = quiet;
		expect(validateTheme(asComment, "x")).toEqual([]);

		const asKeyword = clone("Roswaal Dark");
		asKeyword.code.keyword = quiet;
		expect(validateTheme(asKeyword, "x").join(" ")).toMatch(/code\.keyword .* below 3:1/);
	});
});

describe("what a theme is not allowed to reach", () => {
	/**
	 * Node category and pin type colours are fixed. This is a design decision —
	 * red is a boolean and gold is a vector, and that mapping is most of what
	 * makes a graph readable to somebody arriving from Blueprints — so it is
	 * asserted rather than left as a comment somebody later takes for an
	 * oversight.
	 */
	it("cannot recolour a pin or a node category", () => {
		for (const role of COLOR_ROLES) {
			expect(role).not.toMatch(/^(pin|category)/);
		}
		const tokens = themeTokens(clone("Nord"));
		for (const token of Object.keys(tokens)) {
			expect(token).not.toMatch(/--(pin|category)-/);
		}
	});

	/** Geometry is a measurement, not a colour. */
	it("does not set the pin geometry", () => {
		expect(Object.keys(themeTokens(clone("Nord")))).not.toContain("--pin-slot");
	});
});
