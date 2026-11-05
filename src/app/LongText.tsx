/**
 * Room to write a long line: a field in the middle of the window, or just
 * above the keyboard on a touch screen.
 *
 * The Inspector's fields are as wide as the panel, which is right for a name
 * and wrong for a sentence: an error's "when it is thrown" ran off both ends
 * of a field two words wide. A field like that keeps its short form, and an
 * expand button beside it -- or, on a touch screen, a tap on it -- opens this,
 * where the whole of what is written can be read while it is written.
 *
 * Above the keyboard rather than under it: iPadOS lays the keyboard over the
 * page, so a dialog centred on the window would sit half behind it. The
 * visual viewport says how much of the window is left.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "./icons.jsx";
import { keyboardUp } from "./keyboardSettle.js";
import { LAYER } from "./layers.js";

export interface LongTextRequest {
	/** What is being written: "Why it is deprecated". */
	title: string;
	/** A line under the title: what the field is about, by name. */
	about?: string;
	value: string;
	placeholder?: string;
	onDone: (value: string) => void;
}

/** Whether this screen is touched rather than pointed at. */
export function touchScreen(): boolean {
	return (
		typeof window !== "undefined" &&
		window.matchMedia?.("(hover: none) and (pointer: coarse)").matches
	);
}

/** How far from the bottom of the window the keyboard reaches, or 0. */
function useKeyboardInset(): number {
	const [inset, setInset] = useState(0);
	useEffect(() => {
		const view = window.visualViewport;
		if (!view) return;
		const measure = () =>
			setInset(
				keyboardUp(view.height, window.innerHeight)
					? Math.max(0, window.innerHeight - view.height - view.offsetTop)
					: 0,
			);
		measure();
		view.addEventListener("resize", measure);
		view.addEventListener("scroll", measure);
		return () => {
			view.removeEventListener("resize", measure);
			view.removeEventListener("scroll", measure);
		};
	}, []);
	return inset;
}

export function LongTextEditor({
	request,
	onClose,
}: {
	request: LongTextRequest;
	onClose: () => void;
}) {
	const [value, setValue] = useState(request.value);
	const field = useRef<HTMLTextAreaElement>(null);
	const inset = useKeyboardInset();
	const done = () => {
		if (value !== request.value) request.onDone(value);
		onClose();
	};
	useEffect(() => {
		const el = field.current;
		if (!el) return;
		el.focus();
		el.setSelectionRange(el.value.length, el.value.length);
	}, []);
	return createPortal(
		<div
			className={`dialog-backdrop long-text-backdrop${inset > 0 ? " over-keyboard" : ""}`}
			style={{ zIndex: LAYER.menu + 1, paddingBottom: inset > 0 ? inset + 12 : undefined }}
			onPointerDown={(e) => {
				if (e.target === e.currentTarget) done();
			}}
		>
			<div className="dialog long-text" role="dialog" aria-label={request.title}>
				<h3>{request.title}</h3>
				{request.about && <p className="long-text-about">{request.about}</p>}
				<textarea
					ref={field}
					rows={5}
					value={value}
					placeholder={request.placeholder}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={(e) => {
						// Enter finishes: these are single lines, however long. Escape leaves
						// what was there.
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							done();
						}
						if (e.key === "Escape") onClose();
					}}
				/>
				<div className="dialog-actions">
					<button type="button" className="tb" onClick={onClose}>
						Cancel
					</button>
					<button type="button" className="tb primary" onClick={done}>
						Done
					</button>
				</div>
			</div>
		</div>,
		document.body,
	);
}

/**
 * A short field with room to grow: the expand button beside it opens the long
 * editor, and on a touch screen so does a tap on the field.
 */
export function LongTextField({
	value,
	placeholder,
	title,
	about,
	label,
	onValue,
	field,
}: {
	value: string;
	placeholder?: string;
	title: string;
	about?: string;
	label: string;
	onValue: (value: string) => void;
	/** The edit burst's handlers, so typing in the short field is one undo step. */
	field?: { onBlur: () => void; onKeyDown: (e: { key: string }) => void };
}) {
	const [open, setOpen] = useState(false);
	return (
		<span className="long-text-field">
			<input
				className="tb"
				value={value}
				placeholder={placeholder}
				aria-label={label}
				readOnly={touchScreen()}
				onPointerDown={(e) => {
					if (touchScreen()) {
						e.preventDefault();
						setOpen(true);
					}
				}}
				onChange={(e) => onValue(e.target.value)}
				{...field}
			/>
			<button
				type="button"
				className="tb icon-only long-text-open"
				title={`${title}: more room`}
				aria-label={`${title}: more room`}
				onClick={() => setOpen(true)}
			>
				<Icon name="expandContent" size={13} />
			</button>
			{open && (
				<LongTextEditor
					request={{ title, about, value, placeholder, onDone: onValue }}
					onClose={() => setOpen(false)}
				/>
			)}
		</span>
	);
}
