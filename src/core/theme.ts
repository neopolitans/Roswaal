/**
 * Colour schemes.
 *
 * A theme is one JSON file in `themes/` at the repository root. This module is
 * the whole description of that file: the shape, the roles it may name, what
 * makes one valid, and how a valid one turns into CSS custom properties.
 *
 * It lives in `core` because four separate things need to agree about it — the
 * generator that compiles `themes/` into the bundle, the editor that applies a
 * scheme, the documentation that lists what a theme may set, and the tests. A
 * second copy of any of that is how a palette ends up half-applied.
 *
 * ## Two rules borrowed from Beako, which learned them the hard way
 *
 * **Nothing translates between a role and its variable.** Beako's browser spent
 * a release setting `--sub-text` while its stylesheet read `--sub`: no error,
 * because an unread custom property is legal CSS and an unset one falls back to
 * its declaration, so three colours quietly stayed on the built-in default in
 * every theme. The fix there was to make the variable name derivable from the
 * key. Here the names predate the themes — `bgApp` would be a strange thing to
 * write in a palette file — so instead there is exactly one table, `ROLES`, and
 * `tests/theme.test.ts` asserts every entry in it is *declared* in `theme.css`
 * and *read* somewhere in the app. One table cannot disagree with itself; two
 * lists can.
 *
 * That test earned its keep on the first run: `wireData` was a role here and a
 * token in the stylesheet, and nothing had read it since data wires started
 * taking their pin's colour. A scheme setting it would have been promising
 * something the editor does not do.
 *
 * **No inheritance.** Every role is required. A half-defined palette silently
 * borrowing another's colours is much harder to debug than a loud missing-key
 * error, and the error costs one line to fix.
 *
 * ## What a theme does not get to set
 *
 * Node category colours and pin type colours are **not** themeable, and that is
 * a design decision rather than an omission. Roswaal tells a Blueprints
 * developer that red is a boolean, green is a number and gold is a vector, and
 * that promise is worth more than the ability to recolour it — a scheme that
 * moved those hues would break the one thing the colours are for. `palette.ts`
 * owns them and stays fixed.
 *
 * Geometry is not themeable either: `--pin-slot` is a measurement, not a
 * colour, and a scheme has no business changing where a wire attaches.
 */

// ---------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------

/** Where a borrowed scheme's terms are recorded. */
export interface ThemeLicence {
	/** SPDX short identifier, e.g. `MIT`. */
	spdx: string;
	/** The copyright line, copied from the upstream file rather than composed. */
	holder: string;
	/**
	 * The upstream licence, vendored byte for byte under `notices/upstream/`.
	 *
	 * A path rather than the text itself because these are somebody else's
	 * words: quoting them from a template produces something that is *nearly*
	 * their licence, and nearly is the one thing an attribution may not be.
	 */
	textFile: string;
}

export interface Theme {
	/** Shown in the picker, and unique across all themes. */
	name: string;
	/** Position in the picker; ties break alphabetically. */
	order: number;
	/**
	 * Does this scheme sit on a dark ground?
	 *
	 * Load-bearing rather than descriptive: every overlay token — hover, the
	 * grid, the watermark — is derived from it. Claiming `true` on a light
	 * background paints white onto white and makes every hover state invisible,
	 * so `validateTheme` checks the claim against the actual luminance of
	 * `app` rather than taking it on trust.
	 */
	dark: boolean;
	/** Shipped with Roswaal, and therefore read-only in the editor. */
	builtin?: boolean;
	/** Who made the scheme, shown beside it. */
	credit?: string;
	/** Where it came from, so a reader can check the credit. */
	source?: string;
	/** Required when the scheme is somebody else's work. */
	licence?: ThemeLicence;
	colors: Record<ColorRole, string>;
	code: Record<CodeRole, string>;
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export type ColorRole =
	| "app" | "panel" | "canvas" | "input"
	| "text" | "subText" | "dimText"
	| "border" | "borderStrong"
	| "nodeBody" | "nodeBorder"
	| "wireExec"
	| "accent" | "danger" | "warning" | "ok" | "select" | "pure"
	| "capsule" | "capsuleBorder";

export type CodeRole =
	| "keyword" | "string" | "number" | "comment"
	| "operator" | "property" | "global" | "function";

/**
 * Every colour role, the CSS variable it sets, and what it is for.
 *
 * The single source of truth named at the top of this file. The `what` column
 * is not decoration — it is what the settings panel labels each swatch with and
 * what the documentation page lists, so a role added here is documented and
 * editable without touching either.
 */
export const ROLES: { role: ColorRole; css: string; what: string }[] = [
	{ role: "app", css: "--bg-app", what: "The window behind everything" },
	{ role: "panel", css: "--bg-panel", what: "Sidebars, toolbars, dialogs" },
	{ role: "canvas", css: "--bg-canvas", what: "The graph surface" },
	{ role: "input", css: "--bg-input", what: "Text fields and dropdowns" },

	{ role: "text", css: "--fg", what: "Body text" },
	{ role: "subText", css: "--fg-muted", what: "Labels and secondary lines" },
	{ role: "dimText", css: "--fg-faint", what: "Disabled and placeholder text" },

	{ role: "border", css: "--border", what: "Ordinary dividers" },
	{ role: "borderStrong", css: "--border-strong", what: "Emphasised edges" },

	{ role: "nodeBody", css: "--node-body", what: "A node's fill" },
	{ role: "nodeBorder", css: "--node-border", what: "A node's outline" },

	{ role: "wireExec", css: "--wire-exec", what: "Execution wires" },

	{ role: "accent", css: "--accent", what: "Primary buttons, focus, the active toggle" },
	{ role: "danger", css: "--danger", what: "Errors and destructive actions" },
	{ role: "warning", css: "--warning", what: "Warnings" },
	{ role: "ok", css: "--ok", what: "Success, and a clean compile" },
	{ role: "select", css: "--select", what: "The selection outline on the canvas" },
	{ role: "pure", css: "--pure-edge", what: "The edge marking a node with no side effects" },

	{ role: "capsule", css: "--capsule-bg", what: "Inline chips and badges" },
	{ role: "capsuleBorder", css: "--capsule-border", what: "Their outline" },
];

/**
 * Syntax colours, for every place Roswaal shows Luau.
 *
 * The editor, the read-only source view and the documentation's compiled
 * examples all read these, which is why they are in the theme rather than in
 * `highlight.ts` — a scheme that restyled the app and left the code looking
 * like the old one would be a scheme that half-applied.
 */
export const CODE_ROLES: { role: CodeRole; css: string; what: string }[] = [
	{ role: "keyword", css: "--code-keyword", what: "local, if, function" },
	{ role: "string", css: "--code-string", what: "String literals" },
	{ role: "number", css: "--code-number", what: "Number literals" },
	{ role: "comment", css: "--code-comment", what: "Comments" },
	{ role: "operator", css: "--code-operator", what: "Operators and punctuation" },
	{ role: "property", css: "--code-property", what: "Fields after a dot" },
	{ role: "global", css: "--code-global", what: "game, workspace, script" },
	{ role: "function", css: "--code-function", what: "Called names" },
];

export const COLOR_ROLES: ColorRole[] = ROLES.map((r) => r.role);
export const CODE_ROLE_NAMES: CodeRole[] = CODE_ROLES.map((r) => r.role);

// ---------------------------------------------------------------------------
// Derived tokens
// ---------------------------------------------------------------------------

/**
 * The tokens a theme does **not** author, computed from `dark`.
 *
 * These are all overlays — a translucent white or black laid over whatever is
 * underneath — and an overlay is the one kind of token an author gets wrong
 * without seeing it, because the mistake is invisible on the surface they
 * happened to be looking at. Deriving them means a scheme cannot ship a hover
 * state that does not show, which is the failure Beako's generator has a rule
 * against and which is better removed than checked for.
 */
export function derivedTokens(dark: boolean): Record<string, string> {
	const ink = dark ? "255, 255, 255" : "0, 0, 0";
	return {
		"color-scheme": dark ? "dark" : "light",
		"--bg-hover": `rgba(${ink}, ${dark ? 0.07 : 0.06})`,
		"--bg-active": `rgba(${ink}, ${dark ? 0.13 : 0.12})`,
		"--grid-fine": `rgba(${ink}, ${dark ? 0.05 : 0.07})`,
		"--grid-coarse": `rgba(${ink}, ${dark ? 0.1 : 0.14})`,
		"--watermark": `rgba(${ink}, ${dark ? 0.14 : 0.16})`,
		"--node-shadow": dark
			? "0 3px 10px rgba(0, 0, 0, 0.45)"
			: "0 2px 6px rgba(0, 0, 0, 0.14)",
		"--comment-fill": dark ? "0.14" : "0.1",
	};
}

/**
 * Every custom property a scheme sets, ready to hand to `style.setProperty`.
 *
 * Pure, and in core, so a test can assert what a theme produces without a DOM
 * and the static documentation can render a swatch from the same numbers the
 * editor would paint.
 */
export function themeTokens(theme: Theme): Record<string, string> {
	const tokens: Record<string, string> = { ...derivedTokens(theme.dark) };
	for (const { role, css } of ROLES) tokens[css] = theme.colors[role];
	for (const { role, css } of CODE_ROLES) tokens[css] = theme.code[role];
	return tokens;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Channel-wise sRGB relative luminance, per WCAG 2. */
export function luminance(hex: string): number {
	const channel = (i: number) => {
		const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** WCAG contrast ratio between two `#rrggbb` colours, 1 to 21. */
export function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/**
 * Why a scheme was rejected, in the words its author needs.
 *
 * A list rather than a throw, because a palette being written by hand usually
 * has more than one thing wrong with it and reporting them one build at a time
 * is a bad way to spend an afternoon.
 */
export function validateTheme(value: unknown, where: string): string[] {
	const problems: string[] = [];
	const say = (message: string) => problems.push(`${where}: ${message}`);

	if (typeof value !== "object" || value === null) {
		return [`${where}: not an object`];
	}
	const t = value as Partial<Theme>;

	if (typeof t.name !== "string" || t.name.trim() === "") say("name is missing");
	if (typeof t.order !== "number") say("order must be a number");
	if (typeof t.dark !== "boolean") say("dark must be true or false");

	const colors = (t.colors ?? {}) as Record<string, unknown>;
	for (const { role } of ROLES) {
		const v = colors[role];
		if (typeof v !== "string") say(`colors.${role} is missing`);
		else if (!HEX.test(v)) say(`colors.${role} — "${v}" is not a #rrggbb colour`);
	}
	for (const key of Object.keys(colors)) {
		if (!COLOR_ROLES.includes(key as ColorRole)) say(`colors.${key} is not a role`);
	}

	const code = (t.code ?? {}) as Record<string, unknown>;
	for (const { role } of CODE_ROLES) {
		const v = code[role];
		if (typeof v !== "string") say(`code.${role} is missing`);
		else if (!HEX.test(v)) say(`code.${role} — "${v}" is not a #rrggbb colour`);
	}
	for (const key of Object.keys(code)) {
		if (!CODE_ROLE_NAMES.includes(key as CodeRole)) say(`code.${key} is not a role`);
	}

	if (t.licence !== undefined) {
		const l = t.licence;
		if (typeof l.spdx !== "string" || l.spdx === "") say("licence.spdx is missing");
		if (typeof l.holder !== "string" || l.holder === "") say("licence.holder is missing");
		if (typeof l.textFile !== "string" || l.textFile === "") say("licence.textFile is missing");
	}

	// Everything past here needs the colours to have parsed.
	if (problems.length > 0) return problems;
	const c = t.colors as Record<ColorRole, string>;

	/**
	 * `dark` drives every overlay, so a scheme that misreports it makes its own
	 * hover states invisible. Checking the claim against the background is
	 * cheaper than the bug report.
	 */
	const groundIsDark = luminance(c.app) < 0.2;
	if (t.dark === true && !groundIsDark) {
		say(`dark is true but app (${c.app}) is a light colour — every hover would be white on white`);
	}
	if (t.dark === false && groundIsDark) {
		say(`dark is false but app (${c.app}) is a dark colour — every hover would be black on black`);
	}

	/** A node the same colour as the canvas is a node you cannot see. */
	if (contrast(c.nodeBody, c.canvas) < 1.12) {
		say(`nodeBody (${c.nodeBody}) is indistinguishable from canvas (${c.canvas})`);
	}

	/**
	 * Readability, on the two surfaces text actually sits on. 4.5:1 is WCAG AA
	 * for body text; the muted and faint roles are deliberately quieter and are
	 * held to the large-text and non-text thresholds instead.
	 */
	for (const ground of ["app", "panel"] as const) {
		if (contrast(c.text, c[ground]) < 4.5) {
			say(`text (${c.text}) on ${ground} (${c[ground]}) is ${contrast(c.text, c[ground]).toFixed(2)}:1, below 4.5:1`);
		}
		if (contrast(c.subText, c[ground]) < 3) {
			say(`subText (${c.subText}) on ${ground} (${c[ground]}) is ${contrast(c.subText, c[ground]).toFixed(2)}:1, below 3:1`);
		}
		if (contrast(c.dimText, c[ground]) < 2) {
			say(`dimText (${c.dimText}) on ${ground} (${c[ground]}) is ${contrast(c.dimText, c[ground]).toFixed(2)}:1, below 2:1`);
		}
	}

	/**
	 * Syntax colours, on the surface code is actually shown on.
	 *
	 * `comment` is held to a lower bar than the rest on purpose. Every serious
	 * syntax theme mutes its comments below what a token threshold would allow —
	 * Tokyo Night's is 2.2:1 against its own editor background — and that is a
	 * deliberate choice by the person who designed it, not a mistake to correct
	 * on their behalf. The bar it still has to clear is *visible at all*.
	 */
	for (const { role } of CODE_ROLES) {
		const colour = (t.code as Record<CodeRole, string>)[role];
		const floor = role === "comment" ? 2 : 3;
		const ratio = contrast(colour, c.input);
		if (ratio < floor) {
			say(`code.${role} (${colour}) on input (${c.input}) is ${ratio.toFixed(2)}:1, below ${floor}:1`);
		}
	}

	return problems;
}

/**
 * The scheme's file name, and its identity.
 *
 * Slug rather than display name, so `Nord`, `nord` and `NORD ` are one theme
 * and a rename cannot walk over a shipped scheme while looking like it is
 * creating a new one.
 */
export function themeSlug(name: string): string {
	return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
