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
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { App } from "./App.jsx";
import { DesignerPage } from "./DesignerPage.jsx";
import { DocsPage } from "./DocsPage.jsx";
import { ErrorBoundary } from "./ErrorBoundary.jsx";
import { loadCapabilities } from "./host.js";
import { installFavicon } from "./logo.jsx";
import { PageHost } from "./pageHost.jsx";
import { readPreferences } from "./preferences.js";
import { applyChrome, applyTheme, findTheme } from "./theme.js";
import { installTouchGestures } from "./touch.js";
import "./theme.css";

export function bootEditor(): void {
	const container = document.getElementById("root");
	if (!container) throw new Error("Missing #root");

	// Three pages, one bundle.
	//
	// Decided on the pathname rather than by a router, and switched between in
	// place by the page host: the mode strip moves the tab from one to another
	// without loading anything, and keeps the ones it leaves. Ctrl-click still
	// gives a mode a window of its own, for the docs on a second monitor.
	// Where those paths are depends on what is serving them, which is
	// `pages.ts` and not this file's business.

	// Set here rather than in `index.html` so the artwork has one home. Both
	// entry points are the same document, so both get it.
	installFavicon();

	// What the host can do, asked once for the page.
	//
	// Not awaited: the answer decides whether a few controls are usable, not
	// whether anything renders, and holding the first paint for a round trip
	// to buy that would be the wrong trade. They start unusable and the store
	// redraws them, which is the right way round -- a control that appears and
	// then vanishes is worse than one that arrives a moment late.
	void loadCapabilities();

	// Long press and double tap, for the right-click and double-click every
	// panel is built around. See `touch.ts`.
	installTouchGestures();

	// The colour scheme, before anything renders.
	//
	// Here rather than in an effect so the app opens in the developer's theme
	// instead of painting the default one and correcting itself a frame later.
	// Both entry points get it for the same reason they both get the favicon —
	// the docs window is the same document, and a developer on Nord who opens
	// the reference should not find it in slate blue.
	const preferences = readPreferences();
	applyTheme(findTheme(preferences.theme));
	applyChrome(preferences);

	// The first frame drawn whole rather than scheduled: a mode switch from the
	// docs crossfades into it, and an empty page there is a blink.
	const root = createRoot(container);
	flushSync(() =>
		root.render(
			<StrictMode>
				<PageHost
					render={(page) => (
						<ErrorBoundary
							what={
								page === "docs"
									? "The documentation"
									: page === "designer"
										? "Node Design"
										: "Roswaal"
							}
						>
							{page === "docs" ? <DocsPage /> : page === "designer" ? <DesignerPage /> : <App />}
						</ErrorBoundary>
					)}
				/>
			</StrictMode>,
		),
	);
}
