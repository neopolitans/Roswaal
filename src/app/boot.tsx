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
import { readPreferences } from "./preferences.js";
import { applyChrome, applyTheme, findTheme } from "./theme.js";
import "./theme.css";

export function bootEditor(): void {
	const container = document.getElementById("root");
	if (!container) throw new Error("Missing #root");

	/**
	 * Two entry points, one bundle.
	 *
	 * The daemon serves `index.html` for every path that is not `/api`, so
	 * `/docs` arrives here like any other route and is decided on the pathname.
	 * That keeps the docs a genuinely separate window — openable on a second
	 * monitor, readable while you wire — without a second build, a second server
	 * route, or a router.
	 */
	const route = window.location.pathname.replace(/\/+$/, "");
	const isDocs = route === "/docs";
	const isDesigner = route === "/designer";

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
