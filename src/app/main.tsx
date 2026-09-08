import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.jsx";
import { DocsPage } from "./DocsPage.jsx";
import { installFavicon } from "./logo.jsx";
import { readPreferences } from "./preferences.js";
import { applyChrome, applyTheme, findTheme } from "./theme.js";
import "./theme.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root");

/**
 * Two entry points, one bundle.
 *
 * The daemon serves `index.html` for every path that is not `/api`, so `/docs`
 * arrives here like any other route and is decided on the pathname. That keeps
 * the docs a genuinely separate window — openable on a second monitor, readable
 * while you wire — without a second build, a second server route, or a router.
 */
const isDocs = window.location.pathname.replace(/\/+$/, "") === "/docs";

document.title = isDocs ? "Roswaal docs" : "Roswaal";

// Set here rather than in `index.html` so the artwork has one home. Both entry
// points are the same document, so both get it.
installFavicon();

/**
 * The colour scheme, before anything renders.
 *
 * Here rather than in an effect so the app opens in the developer's theme
 * instead of painting the default one and correcting itself a frame later. Both
 * entry points get it for the same reason they both get the favicon — the docs
 * window is the same document, and a developer on Nord who opens the reference
 * should not find it in slate blue.
 */
const preferences = readPreferences();
applyTheme(findTheme(preferences.theme));
applyChrome(preferences);

createRoot(container).render(
	<StrictMode>{isDocs ? <DocsPage /> : <App />}</StrictMode>,
);
