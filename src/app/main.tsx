import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.jsx";
import { DocsPage } from "./DocsPage.jsx";
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

createRoot(container).render(
	<StrictMode>{isDocs ? <DocsPage /> : <App />}</StrictMode>,
);
