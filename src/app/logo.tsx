/**
 * The Roswaal mark: a file, a wire leaving it, and an empty pin.
 *
 * One copy of the artwork, in one file, because it is drawn in four places that
 * cannot share a rendering path: the toolbar and the project picker (React),
 * the in-app docs header (React), the static docs site (an HTML string built in
 * `src/core`, which cannot import from here), and the favicon (a data URI, set
 * from `main.tsx`). Every one of them goes through the constants below, so the
 * mark cannot end up subtly different in one of them.
 *
 * `assets/logo.svg` is the design source and `assets/logodesignsource.afdesign`
 * the file it was drawn in. The path data here is that export, unmodified.
 *
 * Three things about the export are worth knowing before touching any of it.
 *
 * **The group transform is load-bearing.** It looks like a stray Affinity
 * artifact — a non-uniform scale, 0.98416 across and 0.864893 down — and the
 * obvious tidy-up is to flatten it into the coordinates. Do not. The pin in the
 * path data is an *ellipse*, rx 72.556 and ry 82.561, and that scale is exactly
 * what resolves it to a true circle of r 71.41. Flatten it wrong, or drop it,
 * and the pin goes oval.
 *
 * **The mark is wide, not square.** The export puts it in a 512 square, where
 * it fills the middle 48% of the height and nothing else, so asking for 18px
 * square drew a 9px mark sitting high in an empty box. `VIEW_BOX` below is
 * trimmed to the artwork instead, and the component takes a *height* and
 * derives the width — so the number you pass is the size you get.
 *
 * **The fill is `currentColor` rather than the white it was exported as**, so
 * the mark takes the colour of the text beside it and works in both themes.
 * White was right for the dark artboard it was drawn on and invisible in light
 * mode. `fill-rule="evenodd"` is stated for the same class of reason: the pin
 * is a ring, drawn as a circle with a second circle knocked out of it, and
 * under the default `nonzero` rule the hole fills in and the pin goes solid.
 */

/** The file, the wire, and the pin — one path, the pin's hole a subpath. */
const LOGO_PATH =
	"M189.163,482.595L189.163,493.302L23.698,493.302L23.698,239.887L52.952,206.598L189.163,206.598L189.163,442.217L204.247,442.217L285.774,291.846C289.005,285.886 294.72,282.257 300.874,282.257L368.057,282.257C375.155,245.138 404.221,217.304 438.956,217.304C479.001,217.304 511.512,254.299 511.512,299.865C511.512,345.432 479.001,382.426 438.956,382.426C405.851,382.426 377.895,357.143 369.2,322.635L310.775,322.635L229.249,473.006C226.017,478.966 220.303,482.595 214.149,482.595L189.163,482.595ZM438.956,252.837C416.146,252.837 397.627,273.909 397.627,299.865C397.627,325.821 416.146,346.894 438.956,346.894C461.766,346.894 480.285,325.821 480.285,299.865C480.285,273.909 461.766,252.837 438.956,252.837Z";

/** Squares the pin. See the note above; this is not decoration. */
const LOGO_TRANSFORM = "matrix(0.98416,0,0,0.864893,-7.3658,-46.6692)";

/** Trimmed to the drawing, so a requested height is the height rendered. */
const VIEW_BOX = "15.96 132.02 480.09 247.97";
const WIDTH = 480.09;
const HEIGHT = 247.97;

/**
 * The same drawing in a square box, centred, for the one place that has to be
 * square: a favicon. A wide mark letterboxes in a tab strip, which is ordinary
 * and better than cropping the pin off the end of it.
 */
const SQUARE_VIEW_BOX = "15.96 15.96 480.09 480.09";

/** Width for a given height. Exported so a caller can lay out around it. */
export function logoWidth(height: number): number {
	return Math.round(height * (WIDTH / HEIGHT));
}

export interface LogoProps {
	/** Rendered height in pixels; the width follows from the artwork. */
	height?: number;
	className?: string;
	/**
	 * Given only when the mark stands alone. Beside the name it is decorative
	 * and announcing it would have a screen reader say the name twice.
	 */
	title?: string;
}

export function Logo({ height = 18, className, title }: LogoProps) {
	return (
		<svg
			className={className ? `logo-mark ${className}` : "logo-mark"}
			viewBox={VIEW_BOX}
			width={logoWidth(height)}
			height={height}
			fill="currentColor"
			fillRule="evenodd"
			aria-hidden={title ? undefined : true}
			role={title ? "img" : undefined}
		>
			{title && <title>{title}</title>}
			<g transform={LOGO_TRANSFORM}>
				<path d={LOGO_PATH} />
			</g>
		</svg>
	);
}

/**
 * The same mark as markup, for the renderers that emit HTML as a string rather
 * than as React — the static docs site, and the favicon below.
 *
 * `fill` is a parameter because those two disagree about what colour means.
 * The docs site wants `currentColor` like everywhere else; a favicon has no
 * text around it to inherit from and needs a literal.
 */
export function logoMarkup(height: number, fill = "currentColor"): string {
	return (
		`<svg class="logo-mark" viewBox="${VIEW_BOX}" width="${logoWidth(height)}" height="${height}"` +
		` fill="${fill}" fill-rule="evenodd" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">` +
		`<g transform="${LOGO_TRANSFORM}"><path d="${LOGO_PATH}"/></g></svg>`
	);
}

/**
 * A tab strip is the one place the mark cannot follow the theme: it is drawn
 * outside the page, and an SVG favicon that reads `currentColor` comes out
 * black — invisible against a dark strip, which is the case that matters
 * because that is what the editor's own users are looking at.
 *
 * So it is drawn in a literal colour. It needs to be mid-toned, because it has
 * to hold against a white strip and a near-black one, and neither end of the
 * theme's own accent range manages both.
 *
 * Violet rather than the obvious blue. A mid blue was the first choice and was
 * the wrong one: Roswaal is a tool *for* Luau, whose own mark is a blue tilted
 * square, and a blue icon in the tab strip made the resemblance a claim nobody
 * meant to make. This is drawn from the character the tool is named after
 * instead, which is both more distinctive and less presumptuous.
 */
const FAVICON_FILL = "#7b4fa8";

/**
 * The favicon as a `data:` URI.
 *
 * Split out from `installFavicon` because the static docs build needs the same
 * string with no DOM to put it in — it writes the `<link>` into the HTML it
 * generates. Keeping one function that touches `document` would have meant the
 * build script growing its own copy of the artwork.
 */
export function faviconHref(): string {
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${SQUARE_VIEW_BOX}" width="64" height="64"` +
		` fill="${FAVICON_FILL}" fill-rule="evenodd">` +
		`<g transform="${LOGO_TRANSFORM}"><path d="${LOGO_PATH}"/></g></svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Installs the favicon. Called from `main.tsx`, for both entry points. */
export function installFavicon(): void {
	const link = document.createElement("link");
	link.rel = "icon";
	link.type = "image/svg+xml";
	link.href = faviconHref();
	document.head.appendChild(link);
}
