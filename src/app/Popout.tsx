/**
 * Settings folded behind a button, on a phone.
 *
 * The graph's tools and Node Design's node tools both run out of room on a
 * phone: each is a row of groups that wraps into two or three and covers the
 * top of what they act on. A group that is a setting rather than an action --
 * the script's type, the compile target, the pins to drag on -- goes behind a
 * button that says what it holds, and opens under it.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "./icons.jsx";

/**
 * Whether this is a phone-sized window, where the graph's tools pop out.
 *
 * The width alone: an iPad holds the tools in one row either way up, and a
 * phone does not, held either way.
 */
export function usePhone(): boolean {
	const query = "(max-width: 699px)";
	const [phone, setPhone] = useState(
		() => typeof window !== "undefined" && window.matchMedia(query).matches,
	);
	useEffect(() => {
		const list = window.matchMedia(query);
		const update = () => setPhone(list.matches);
		update();
		list.addEventListener("change", update);
		return () => list.removeEventListener("change", update);
	}, []);
	return phone;
}

/**
 * A group of settings behind one button, on a phone.
 *
 * The button says what is chosen -- "Script", "Roblox" -- so the setting can be
 * read without opening it, and opens a small panel of the dropdowns it stands
 * for. A tap anywhere else puts the panel away; choosing does not, because the
 * script's panel holds two settings and the second is usually why it was opened.
 */
export function Popout({ label, title, end = false, up = false, closeOnPick = false, children }: {
	/** What is chosen, or what the panel holds: words, or a glyph and words. */
	label: ReactNode;
	title: string;
	/** Opens towards the left: for the group at the right-hand edge. */
	end?: boolean;
	/**
	 * Opens above the button, fixed to the screen rather than hung from the
	 * button: the projects panel's footer is at the bottom of a dialog that
	 * clips what overflows it.
	 */
	up?: boolean;
	/** Closes when a button inside is pressed: a menu, rather than settings. */
	closeOnPick?: boolean;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const [fixedAt, setFixedAt] = useState<{ left: number; bottom: number } | null>(null);
	const box = useRef<HTMLDivElement>(null);
	const panel = useRef<HTMLDivElement>(null);
	/**
	 * Which way the panel hangs. `end` is where it would like to open, but the
	 * groups wrap on a narrow screen and the one at the right-hand edge can end
	 * up at the left of the second row -- so it is measured once it is drawn,
	 * and turned round if it would run off either side.
	 */
	const [side, setSide] = useState<"start" | "end">(end ? "end" : "start");
	useLayoutEffect(() => {
		if (!open || !up || !box.current) return;
		const at = box.current.getBoundingClientRect();
		setFixedAt({ left: at.left, bottom: window.innerHeight - at.top + 6 });
	}, [open, up]);
	useLayoutEffect(() => {
		if (!open || !panel.current || up) return;
		const at = panel.current.getBoundingClientRect();
		const width = document.documentElement.clientWidth;
		if (at.left < 4) setSide("start");
		else if (at.right > width - 4) setSide("end");
	}, [open, side]);
	useEffect(() => {
		if (!open) return;
		const away = (e: PointerEvent) => {
			if (!box.current?.contains(e.target as Node)) setOpen(false);
		};
		window.addEventListener("pointerdown", away, true);
		return () => window.removeEventListener("pointerdown", away, true);
	}, [open]);
	return (
		<div className={`tool-popout${side === "end" ? " tool-popout-end" : ""}${up ? " tool-popout-up" : ""}`} ref={box}>
			<button
				className={`tb with-icon${open ? " on" : ""}`}
				title={title}
				aria-expanded={open}
				onClick={() => setOpen((was) => !was)}
			>
				{label}
				<Icon name="chevron" size={14} />
			</button>
			{open && (
				<div
					className="tool-popout-panel"
					role="group"
					aria-label={title}
					ref={panel}
					style={up && fixedAt ? { position: "fixed", top: "auto", ...fixedAt } : undefined}
					onClick={closeOnPick ? (e) => {
						if ((e.target as Element).closest("button")) setOpen(false);
					} : undefined}
				>
					{children}
				</div>
			)}
		</div>
	);
}

