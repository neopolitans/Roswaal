/**
 * Applying a colour scheme to the document.
 *
 * `src/core/theme.ts` says what a theme *is*; this is the only file that
 * touches the DOM with one. The split is the usual one — core is shared with
 * the compiler and the static documentation and may not assume a browser — but
 * it earns its keep here specifically, because it lets a test assert exactly
 * what a scheme produces without standing up a page.
 *
 * ## Why the tokens go on as inline properties
 *
 * `theme.css` declares every token twice: once for light, once inside
 * `@media (prefers-color-scheme: dark)`. A theme has to beat both, including
 * when a developer picks a light scheme on a machine set to dark. An inline
 * custom property on the root element wins over any stylesheet rule regardless
 * of media state, so a scheme is applied by setting properties and unapplied by
 * removing them — at which point the stylesheet takes over again and follows
 * the system, live, with nothing left behind.
 *
 * That is also why **Follow the system** is the absence of a theme rather than
 * a seventh scheme. Picking it removes the properties instead of pinning
 * Roswaal Light or Roswaal Dark, so the app keeps changing with the OS the way
 * it always did.
 */

import { themeTokens, type Theme } from "../core/theme.js";
import { BUILTIN_THEMES } from "../core/themeData.js";

export { BUILTIN_THEMES };

/** A theme by name, or undefined — a preference can outlive the scheme it names. */
export function findTheme(name: string | null): Theme | undefined {
	if (name === null) return undefined;
	return BUILTIN_THEMES.find((t) => t.name === name);
}

/**
 * The `<select>` popup, which cannot read a custom property.
 *
 * Chromium paints the list a `<select>` opens outside the document, and
 * `var(…)` does not resolve there — `theme.css` carries a note about this and
 * four literal colours to work around it. Those literals are the built-in
 * schemes' input surface, so under any other theme they would be four colours
 * that stopped following the palette.
 *
 * A generated stylesheet fixes that generally rather than for two schemes: it
 * is the only place a theme's colours have to be written as literals, and
 * having exactly one such place is much better than having the problem
 * scattered through the stylesheet by hand.
 */
const POPUP_STYLE_ID = "roswaal-theme-popup";

function popupRule(theme: Theme): string {
	return [
		"select option,",
		"select optgroup {",
		`\tbackground-color: ${theme.colors.input};`,
		`\tcolor: ${theme.colors.text};`,
		"}",
	].join("\n");
}

/**
 * Paints a scheme, or hands the document back to the stylesheet.
 *
 * Idempotent, and safe to call before React mounts — which is when it should be
 * called, so the app opens in the developer's scheme rather than flashing the
 * default one first.
 */
export function applyTheme(theme: Theme | undefined): void {
	const root = document.documentElement;
	const existing = document.getElementById(POPUP_STYLE_ID);

	if (theme === undefined) {
		for (const property of appliedProperties()) root.style.removeProperty(property);
		existing?.remove();
		root.removeAttribute("data-theme");
		return;
	}

	const tokens = themeTokens(theme);
	for (const [property, value] of Object.entries(tokens)) {
		root.style.setProperty(property, value);
	}

	const style = existing ?? document.createElement("style");
	style.id = POPUP_STYLE_ID;
	style.textContent = popupRule(theme);
	if (existing === null) document.head.append(style);

	// Read by nothing in the stylesheet today. It is here so a scheme is visible
	// in devtools and in a screenshot of a bug report, which is the cheapest
	// possible answer to "which theme were you on".
	root.setAttribute("data-theme", theme.name);
}

/**
 * Every property a scheme sets, for the removal path.
 *
 * Derived from a real theme rather than listed, so a token added to `ROLES`
 * cannot be left behind when a developer switches back to following the system
 * — which would strand exactly one colour on the previous scheme and be
 * bewildering to debug.
 */
function appliedProperties(): string[] {
	return Object.keys(themeTokens(BUILTIN_THEMES[0]));
}
