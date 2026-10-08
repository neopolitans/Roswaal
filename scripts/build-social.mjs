/**
 * Draws the pictures a link to the site unfurls with, into `site/`.
 *
 *     site/social-card.png          the preview for roswaal.app, 1200 by 630
 *     site/social-card-canary.png   the same, for the canary
 *     site/favicon-32.png           the mark as a PNG, for a forum's onebox
 *     site/apple-touch-icon.png     and for a phone's home screen
 *
 * Run by hand, after `npm run build:pages`, and the results committed: they
 * change when the banner does, not on every build, and a preview picture is
 * cached for weeks by whatever fetched it. `build-pages.mjs` copies `site/`
 * into the site's root.
 *
 * Needs Playwright, which the build does not: `npx playwright install webkit`
 * once, and run with it on the module path.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { faviconHref } from "../src/app/logo.tsx";

import { CARD, socialCardHtml } from "./lib/socialCard.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pages = join(root, "dist-pages");
const out = join(root, "site");

// Named through a variable: Playwright is not one of the build's dependencies,
// so there is nothing for the type checker to find, and that is the point.
const PLAYWRIGHT = "playwright";
let webkit;
try {
	({ webkit } = await import(PLAYWRIGHT));
} catch {
	throw new Error(
		"build-social needs Playwright. Install it (`npm i --no-save playwright` and " +
			"`npx playwright install webkit`) and run again.",
	);
}

await mkdir(out, { recursive: true });
const browser = await webkit.launch();
try {
	// The cards, from the built site's own stylesheet: written beside it so the
	// relative link resolves, and taken away again.
	for (const { canary, file } of [
		{ canary: false, file: "social-card.png" },
		{ canary: true, file: "social-card-canary.png" },
	]) {
		const draft = join(pages, "_social-card.html");
		await writeFile(draft, socialCardHtml({ canary }), "utf8");
		const page = await browser.newPage({ viewport: CARD, deviceScaleFactor: 1 });
		await page.goto(pathToFileURL(draft).href);
		await page.waitForTimeout(300);
		await page.screenshot({ path: join(out, file) });
		await page.close();
		await rm(draft);
	}

	// The mark, in the tab strip's violet: on nothing for the icon, and on
	// white for a home screen, which shows no transparency.
	for (const { size, file, ground } of [
		{ size: 32, file: "favicon-32.png", ground: "transparent" },
		{ size: 180, file: "apple-touch-icon.png", ground: "#ffffff" },
	]) {
		const inset = ground === "transparent" ? 0 : Math.round(size * 0.14);
		const page = await browser.newPage({
			viewport: { width: size, height: size },
			deviceScaleFactor: 1,
		});
		await page.setContent(
			`<body style="margin:0;background:${ground}"><img src="${faviconHref()}" ` +
				`style="display:block;box-sizing:border-box;width:${size}px;height:${size}px;padding:${inset}px"></body>`,
		);
		await page.waitForTimeout(100);
		await page.screenshot({ path: join(out, file), omitBackground: ground === "transparent" });
		await page.close();
	}
} finally {
	await browser.close();
}

console.log(`social: ${out} (2 cards, 2 icons)`);
