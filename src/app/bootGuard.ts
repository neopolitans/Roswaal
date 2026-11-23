/**
 * The page's watch over its own start, so a failure before the editor opens
 * is a screen that says so rather than a blank one.
 *
 * ErrorBoundary catches what throws while the editor draws. Nothing caught
 * what happened before it: a script that did not load, an error or a
 * rejected promise while the page set itself up, or a wait that never ended.
 * On 23 Nov 2026 Edge 158 never answered for a folder remembered from an
 * earlier visit; start-up waited on it, and try.html and the designer stayed
 * blank, with nothing in the console.
 *
 * It is a classic script in the head (see scripts/theme-shell.mjs), so it is
 * listening before any of the app's code runs, and it depends on none of it.
 * It stands down for good the moment the editor puts anything in #root.
 */

/** What the screen says, and the details to copy. */
export interface BootFailure {
	kind: "error" | "stale" | "slow";
	title: string;
	text: string;
	detail: string;
}

/** How long after the page has loaded the editor may take to appear before it is called stuck. */
export const SLOW_START_MS = 10000;
/** How long after an error the editor has to appear anyway: some are not fatal. */
const AFTER_ERROR_MS = 1500;
/** The database that holds remembered folders: see src/web/remember.ts. */
const FOLDERS_DATABASE = "roswaal";

/** A module the page could not load: the site changed under it, or the network went. */
export function isStaleMessage(message: string): boolean {
	return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Could not load /i.test(
		message,
	);
}

/** What to tell the developer, from what went wrong; null where nothing did. */
export function failureFrom(
	errors: readonly string[],
	slow: boolean,
	about: { page: string; browser: string; version: string },
): BootFailure | null {
	if (errors.length === 0 && !slow) return null;
	const detail = [
		...(errors.length > 0 ? errors : ["No error was reported: the editor never appeared."]),
		"",
		`Page: ${about.page}`,
		`Roswaal: ${about.version || "unknown"}`,
		`Browser: ${about.browser}`,
	].join("\n");
	if (errors.some(isStaleMessage))
		return {
			kind: "stale",
			title: "Roswaal was updated",
			text: "This page is older than the site, or a file did not load. Reload to get the current version.",
			detail,
		};
	if (errors.length > 0)
		return {
			kind: "error",
			title: "Roswaal stopped while starting",
			text: "Something failed before the editor opened. Reload to try again; if it happens again, copy the details into a report.",
			detail,
		};
	return {
		kind: "slow",
		title: "Roswaal is taking too long to start",
		text: "The editor has not opened. If a folder from an earlier visit is remembered, the browser may be stuck on it: forget it, then choose it again once the editor is open.",
		detail,
	};
}

/** An error as one line, then its stack. */
export function describeError(reason: unknown, where?: string): string {
	if (reason instanceof Error) {
		const head = `${reason.name}: ${reason.message}`;
		const stack = reason.stack ?? "";
		// V8's stack begins with that same line; Safari's and Firefox's do not.
		return stack.startsWith(head) ? stack : stack ? `${head}\n${stack}` : head;
	}
	return `${String(reason)}${where ? ` (${where})` : ""}`;
}

/** Watches the page's start; shows the screen if the editor fails to appear. */
export function installBootGuard(slowMs = SLOW_START_MS): void {
	const errors: string[] = [];
	let started = false;
	let screen: HTMLElement | null = null;
	const version =
		new URL(
			(document.currentScript as HTMLScriptElement | null)?.src ?? location.href,
		).searchParams.get("v") ?? "";

	const root = () => document.getElementById("root");
	const empty = () => (root()?.childElementCount ?? 0) === 0;
	const check = (slow: boolean) => {
		if (started || screen || !empty()) return;
		const failure = failureFrom(errors, slow, {
			page: location.href,
			browser: navigator.userAgent,
			version,
		});
		if (failure) screen = show(failure);
	};

	addEventListener(
		"error",
		(event) => {
			if (started) return;
			const target = event.target as HTMLElement | null;
			if (target && target !== (window as unknown as HTMLElement) && target.tagName === "SCRIPT")
				errors.push(`Could not load ${(target as HTMLScriptElement).src}`);
			else if (target && target !== (window as unknown as HTMLElement)) return;
			else
				errors.push(
					describeError(
						event.error ?? event.message,
						event.filename ? `${event.filename}:${event.lineno}` : undefined,
					),
				);
			setTimeout(() => check(false), AFTER_ERROR_MS);
		},
		true,
	);
	addEventListener("unhandledrejection", (event) => {
		if (started) return;
		errors.push(describeError(event.reason));
		setTimeout(() => check(false), AFTER_ERROR_MS);
	});
	// The clock starts once every script has loaded: a slow network is not a stuck start.
	addEventListener("load", () => setTimeout(() => check(true), slowMs));

	const watch = () => {
		const el = root();
		if (!el) return;
		const stand = () => {
			if (el.childElementCount === 0) return;
			started = true;
			observer.disconnect();
			// A slow start that got there: the screen goes.
			screen?.remove();
			screen = null;
		};
		const observer = new MutationObserver(stand);
		observer.observe(el, { childList: true });
		stand();
	};
	if (document.readyState === "loading") addEventListener("DOMContentLoaded", watch);
	else watch();
}

/** The screen: the editor's own crash screen's look where its stylesheet loaded, readable where not. */
function show(failure: BootFailure): HTMLElement {
	const screen = document.createElement("div");
	screen.className = "crash boot-crash";
	screen.setAttribute("role", "alert");
	screen.style.cssText =
		"position:fixed;inset:0;z-index:2147483647;overflow:auto;box-sizing:border-box;max-width:none;" +
		"background:var(--bg-app,#16171b);color:var(--fg,#e6e6e9);font-family:system-ui,sans-serif;";
	const inner = document.createElement("div");
	inner.style.cssText =
		"max-width:780px;margin:0 auto;padding:48px 24px;display:flex;flex-direction:column;gap:14px;";
	const h1 = document.createElement("h1");
	h1.textContent = failure.title;
	h1.style.cssText = "margin:0;font-size:24px;";
	const p = document.createElement("p");
	p.textContent = failure.text;
	p.style.cssText = "margin:0;opacity:0.8;";
	const pre = document.createElement("pre");
	pre.className = "crash-detail";
	pre.textContent = failure.detail;
	pre.style.cssText =
		"margin:0;padding:12px;max-height:40vh;overflow:auto;white-space:pre-wrap;word-break:break-word;" +
		"border:1px solid var(--border,#3a3b42);border-radius:6px;background:var(--bg-panel,#1e1f24);font-size:12px;";
	const actions = document.createElement("div");
	actions.className = "crash-actions";
	actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";
	const button = (label: string, primary: boolean, act: () => void) => {
		const b = document.createElement("button");
		b.type = "button";
		b.className = primary ? "tb primary" : "tb";
		b.textContent = label;
		b.addEventListener("click", act);
		actions.append(b);
		return b;
	};
	button("Reload", true, () => location.reload());
	if (failure.kind === "slow")
		button("Forget remembered folders and reload", false, () => {
			const reload = () => location.reload();
			try {
				const request = indexedDB.deleteDatabase(FOLDERS_DATABASE);
				request.onsuccess = reload;
				request.onerror = reload;
				request.onblocked = reload;
			} catch {
				reload();
			}
			// Nothing here waits on the browser for good: the page reloads regardless.
			setTimeout(reload, 2000);
		});
	const copy = button("Copy the details", false, () => {
		void navigator.clipboard?.writeText(failure.detail).then(
			() => {
				copy.textContent = "Copied";
			},
			() => {
				const range = document.createRange();
				range.selectNodeContents(pre);
				getSelection()?.removeAllRanges();
				getSelection()?.addRange(range);
			},
		);
	});
	inner.append(h1, p, pre, actions);
	screen.append(inner);
	document.body.append(screen);
	return screen;
}
