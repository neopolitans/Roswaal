/**
 * Starting the editor, once something has decided what it talks to.
 *
 * Split out of `main.tsx` because there are two entry points that want all of
 * it: the daemon build, which starts straight away, and the hosted build, which
 * installs a transport onto a worker first and then starts exactly this.
 * Everything that happens before the first frame — the route, the favicon, the
 * theme — happens once, here, rather than in two places that would drift.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.jsx";
import { DesignerPage } from "./DesignerPage.jsx";
import { DocsPage } from "./DocsPage.jsx";
import { ErrorBoundary } from "./ErrorBoundary.jsx";
import { installFavicon } from "./logo.jsx";
import { currentPage } from "./pages.js";
import { readPreferences } from "./preferences.js";
import { applyChrome, applyTheme, findTheme } from "./theme.js";
import "./theme.css";

export function bootEditor(): void {
	const container = document.getElementById("root");
	if (!container) throw new Error("Missing #root");

	/**
	 * Three pages, one bundle.
	 *
	 * Decided on the pathname rather than by a router, which keeps the docs and
	 * Node Design genuinely separate windows — openable on a second monitor,
	 * readable while you wire — without a second build or a second server route.
	 * Where those paths are depends on what is serving them, which is `pages.ts`
	 * and not this file's business.
	 */
	const page = currentPage();
	const isDocs = page === "docs";
	const isDesigner = page === "designer";

	document.title = isDocs ? "Roswaal docs" : isDesigner ? "Node Design" : "Roswaal";

	// Set here rather than in `index.html` so the artwork has one home. Both
	// entry points are the same document, so both get it.
	installFavicon();

	/**
	 * The colour scheme, before anything renders.
	 *
	 * Here rather than in an effect so the app opens in the developer's theme
	 * instead of painting the default one and correcting itself a frame later.
	 * Both entry points get it for the same reason they both get the favicon —
	 * the docs window is the same document, and a developer on Nord who opens
	 * the reference should not find it in slate blue.
	 */
	const preferences = readPreferences();
	applyTheme(findTheme(preferences.theme));
	applyChrome(preferences);

	createRoot(container).render(
		<StrictMode>
			<ErrorBoundary
				what={isDocs ? "The documentation" : isDesigner ? "Node Design" : "Roswaal"}
			>
				{isDocs ? <DocsPage /> : isDesigner ? <DesignerPage /> : <App />}
			</ErrorBoundary>
		</StrictMode>,
	);
}
