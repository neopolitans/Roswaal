/**
 * What a link to the site says about itself before anybody opens it: the
 * search result, Discord's embed, the DevForum's onebox.
 *
 * None of those run JavaScript. They read the page's `<head>` as it arrives,
 * so the app's three pages carry these tags in their HTML (injected by the web
 * build, `vite.web.config.ts`) rather than setting them once the app is up.
 *
 * Open Graph is what both Discord and Discourse read: the title, the
 * description, the picture and the site's name. On top of that:
 *
 * - **`twitter:card`** decides how big the picture is drawn. Discord shows a
 *   `summary_large_image` across the embed and a `summary` as a thumbnail
 *   beside the words: large for the site's front doors, small for a docs page,
 *   where the words are the point and the picture would be the same on all 482.
 * - **`theme-color`** is the stripe down the side of a Discord embed: the
 *   site's blue, or the canary's yellow, so the two are told apart in a chat.
 * - **`twitter:label1` / `twitter:data1`**: Discourse prints the pair under the
 *   description, for a short list of labels of which Price is one.
 * - **A PNG favicon.** The tab's icon is an SVG `data:` URI, which neither can
 *   use; a onebox shows the site's icon beside its name.
 *
 * Every address is absolute, because a crawler resolves nothing. The copy at
 * the site's old address points at roswaal.app: that is where it went.
 */

export const SITE_ORIGIN = {
	stable: "https://roswaal.app",
	canary: "https://canary.roswaal.app",
} as const;

/** The build a page belongs to. */
export interface SiteBuild {
	canary: boolean;
	/** The copy at the old address, which says where the site went. */
	backup?: boolean;
}

export interface PageMeta {
	/** The preview's title: `og:title`. The `<title>` is the page's own. */
	title: string;
	/** A sentence or two. Search results cut at about 155 characters. */
	description: string;
	/** From the site's root, without a leading slash: `try.html`, `docs/casting.html`. */
	path: string;
	/** Where search engines should send people for this content, if not `path`. */
	canonical?: string;
	/** A front door, drawn large; a docs page, drawn as a thumbnail. */
	large?: boolean;
	/** `article` for a docs page; `website` otherwise. */
	type?: "website" | "article";
}

/** The front page's line, and the one the app's pages build on. */
export const SITE_DESCRIPTION =
	"Build Roblox and Lune scripts as node graphs that compile to clean, readable Luau. " +
	"Free and 0BSD. Try it in your browser, with nothing to install.";

/** What each of the app's pages says, by its file. */
export const APP_PAGES: Record<string, PageMeta> = {
	"try.html": {
		title: "Try Roswaal in your browser",
		description:
			"The Roswaal editor in a browser tab: wire nodes into Roblox or Lune scripts and " +
			"read the Luau they compile to. Your project stays in this browser.",
		path: "try.html",
		large: true,
	},
	"designer.html": {
		title: "Node Design · Roswaal",
		description:
			"Make nodes of your own for Roswaal: write one in Luau or wire it from other " +
			"nodes, and keep it in your project's node packs.",
		path: "designer.html",
		large: true,
	},
	"docs.html": {
		title: "Roswaal docs",
		description:
			"Guides to Roswaal, and a page for every node: what it does, its pins, and the " +
			"Luau it writes.",
		path: "docs.html",
		// The same pages, readable without JavaScript: the ones to index.
		canonical: "docs/",
		large: true,
	},
};

const COLOUR = { stable: "#3b6ea5", canary: "#b8860b" };

function origin(build: SiteBuild): string {
	return build.canary && !build.backup ? SITE_ORIGIN.canary : SITE_ORIGIN.stable;
}

function attr(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/** A page's address on the site it belongs to. */
export function siteUrl(build: SiteBuild, path: string): string {
	return `${origin(build)}/${path.replace(/^\/+/, "")}`;
}

/** The preview picture for a build. */
export function cardUrl(build: SiteBuild): string {
	return siteUrl(
		build,
		build.canary && !build.backup ? "social-card-canary.png" : "social-card.png",
	);
}

/** The tags for a page's `<head>`, one per line. */
export function metaTags(meta: PageMeta, build: SiteBuild): string {
	const url = siteUrl(build, meta.path);
	const canonical = siteUrl(build, meta.canonical ?? meta.path);
	const canary = build.canary && !build.backup;
	const colour = canary ? COLOUR.canary : COLOUR.stable;
	// The canary says so in the title, where a chat shows it beside the link.
	const title = canary && !/canary/i.test(meta.title) ? `${meta.title} · Canary` : meta.title;
	const tags: [string, string, string][] = [
		["name", "description", meta.description],
		["property", "og:site_name", "Roswaal"],
		["property", "og:type", meta.type ?? "website"],
		["property", "og:locale", "en_GB"],
		["property", "og:url", url],
		["property", "og:title", title],
		["property", "og:description", meta.description],
		["property", "og:image", cardUrl(build)],
		["property", "og:image:type", "image/png"],
		["property", "og:image:width", "1200"],
		["property", "og:image:height", "630"],
		[
			"property",
			"og:image:alt",
			"The Roswaal mark and name beside a node graph: Visual scripting for Luau, reimagined.",
		],
		["name", "twitter:card", meta.large ? "summary_large_image" : "summary"],
		["name", "twitter:label1", "Price"],
		["name", "twitter:data1", "Free"],
		["name", "theme-color", colour],
	];
	return [
		`<link rel="canonical" href="${attr(canonical)}" />`,
		...tags.map(([key, name, content]) => `<meta ${key}="${name}" content="${attr(content)}" />`),
		`<link rel="icon" type="image/png" sizes="32x32" href="${attr(siteUrl(build, "favicon-32.png"))}" />`,
		`<link rel="apple-touch-icon" href="${attr(siteUrl(build, "apple-touch-icon.png"))}" />`,
	].join("\n");
}

/**
 * What the front page is, for a search engine that reads structured data:
 * free software for developers, on the web and on a computer.
 */
export function softwareJsonLd(build: SiteBuild): string {
	const data = {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: "Roswaal",
		url: siteUrl(build, ""),
		description: SITE_DESCRIPTION,
		image: cardUrl(build),
		applicationCategory: "DeveloperApplication",
		operatingSystem: "Web, Windows, macOS, Linux",
		license: "https://opensource.org/license/0bsd",
		offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
	};
	// `<` escaped, so nothing in a string can close the script element.
	return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}
