/**
 * Which tab a documentation page opens on: the one for the screen it is read on.
 *
 * Pages that differ by device -- Getting started, The Interface, Controls,
 * Toolbars -- split into Desktop, Tablet and Phone tabs. Making the reader find
 * their own is a step nobody needs, so a tab says which devices it is for and
 * the page opens on the one that matches.
 *
 * The questions asked are the app's own: a phone is `usePhone`'s width, and a
 * tablet is `COMPACT_QUERY`'s touch screen. So the tab chosen describes what
 * the app does on that screen -- a phone held sideways is laid out as a tablet,
 * and its tab is the tablet's.
 *
 * A tab the reader picks wins, for the rest of the visit: their pick is kept
 * in `sessionStorage` as a device, so every page after opens on the same one.
 *
 * ## Why this file has no imports
 *
 * Delivered two ways from one source, as `docsToggle.ts` is: the in-app Docs
 * window calls `pickTab`, and the published site bundles `attachDeviceTabs`.
 * Without script the static page shows its first tab, as it always has.
 */

/** A kind of screen a tab can be for. Desktop is split by which build it is. */
export type Device = "localhost" | "webapp" | "tablet" | "phone";

const KEY = "roswaal.docs.device";

/** The screen this is read on. `local` is the daemon's build. */
export function readerDevice(win: Window, local: boolean): Device {
	const matches = (query: string) => {
		try {
			return win.matchMedia(query).matches;
		} catch {
			return false;
		}
	};
	if (matches("(max-width: 699px)")) return "phone";
	if (matches("(hover: none) and (pointer: coarse)")) return "tablet";
	return local ? "localhost" : "webapp";
}

/** The device the reader picked this visit, if they picked one. */
export function chosenDevice(): Device | null {
	try {
		const raw = sessionStorage.getItem(KEY);
		return raw === "localhost" || raw === "webapp" || raw === "tablet" || raw === "phone" ? raw : null;
	} catch {
		return null;
	}
}

/**
 * Remembers a pick. A tab for several devices -- Desktop, both builds -- keeps
 * the reader's own device when it is one of them, so picking Desktop on the
 * web app does not later open the localhost tab.
 */
export function rememberPick(devices: readonly Device[], own: Device): void {
	const device = devices.includes(own) ? own : devices[0];
	if (!device) return;
	try {
		sessionStorage.setItem(KEY, device);
	} catch {
		// A private window, or storage switched off: the pick holds on this page only.
	}
}

/** The first tab for `device`, or -1 when none says it is. */
export function pickTab(tabs: readonly { device?: readonly Device[] }[], device: Device): number {
	return tabs.findIndex((tab) => tab.device?.includes(device) ?? false);
}

const devicesOf = (el: Element): Device[] =>
	(el.getAttribute("data-device") ?? "").split(" ").filter(Boolean) as Device[];

/**
 * The published site's tabs: tick the matching radio in every switch on the
 * page, mark the reader's own tab, and carry a pick to the other switches.
 */
export function attachDeviceTabs(doc: Document, local = false): void {
	const own = readerDevice(doc.defaultView ?? window, local);
	const groups = [...doc.querySelectorAll<HTMLElement>(".docs-tabs")];

	const show = (device: Device) => {
		for (const group of groups) {
			const inputs = [...group.querySelectorAll<HTMLInputElement>(":scope > input[type=radio]")];
			const i = pickTab(inputs.map((input) => ({ device: devicesOf(input) })), device);
			if (i >= 0) inputs[i]!.checked = true;
		}
	};

	for (const group of groups) {
		const inputs = [...group.querySelectorAll<HTMLInputElement>(":scope > input[type=radio]")];
		const mine = pickTab(inputs.map((input) => ({ device: devicesOf(input) })), own);
		if (mine >= 0) {
			const label = group.querySelector(`label[for="${CSS.escape(inputs[mine]!.id)}"]`);
			if (label && !label.querySelector(".docs-tab-here")) {
				const here = doc.createElement("span");
				here.className = "docs-tab-here";
				here.textContent = "this device";
				label.append(here);
			}
		}
		for (const input of inputs) {
			input.addEventListener("change", () => {
				if (!input.checked) return;
				const devices = devicesOf(input);
				if (devices.length === 0) return;
				rememberPick(devices, own);
				const picked = chosenDevice();
				if (picked) show(picked);
			});
		}
	}

	show(chosenDevice() ?? own);
}
