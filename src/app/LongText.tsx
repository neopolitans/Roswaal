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

import { Icon, type IconName } from "./icons.jsx";
import { keyboardUp } from "./keyboardSettle.js";
import { LAYER } from "./layers.js";

export interface LongTextRequest {
	/** What is being written: "Why it is deprecated". */
	title: string;
	/** A line under the title: what the field is about, by name. */
	about?: string;
	value: string;
	placeholder?: string;
	/** Written in the code face: what an error throws, say. */
	code?: boolean;
	badge?: LongBadge;
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

/** The badge at the head of the editor: an icon on the colour of what is edited. */
export interface LongBadge {
	icon: IconName;
	/** A CSS colour. */
	tone: string;
}

/**
 * The frame both editors are drawn in, as every dialog in `Dialog.tsx` is: a
 * header band with the badge, the title and what it is about, and a close; the
 * fields; and a foot with the keys on the left and the answers on the right.
 */
function LongShell({
	title,
	about,
	badge,
	keys,
	onDone,
	onClose,
	children,
}: {
	title: string;
	about?: string;
	badge?: LongBadge;
	keys: React.ReactNode;
	onDone: () => void;
	onClose: () => void;
	children: React.ReactNode;
}) {
	const inset = useKeyboardInset();
	return createPortal(
		<div
			className={`dialog-backdrop long-text-backdrop${inset > 0 ? " over-keyboard" : ""}`}
			style={{ zIndex: LAYER.menu + 1, paddingBottom: inset > 0 ? inset + 12 : undefined }}
			onPointerDown={(e) => {
				if (e.target === e.currentTarget) onDone();
			}}
		>
			<div
				className="dialog dialog-panel long-text"
				role="dialog"
				aria-modal="true"
				aria-label={title}
				style={badge ? ({ "--tone": badge.tone } as React.CSSProperties) : undefined}
			>
				<header className="dialog-head">
					<span className="dialog-badge">
						<Icon name={badge?.icon ?? "expandContent"} size={17} />
					</span>
					<div className="long-text-title">
						<h3>{title}</h3>
						{about && <span className="long-text-about">{about}</span>}
					</div>
					<button
						type="button"
						className="tb icon-only dialog-close"
						aria-label="Cancel"
						title="Cancel (Esc)"
						onClick={onClose}
					>
						<Icon name="close" size={14} />
					</button>
				</header>
				<div className="dialog-body">{children}</div>
				<div className="dialog-actions">
					<span className="dialog-keys">{keys}</span>
					<button type="button" className="tb" onClick={onClose}>
						Cancel
					</button>
					<button type="button" className="tb primary" onClick={onDone}>
						Done
					</button>
				</div>
			</div>
		</div>,
		document.body,
	);
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
	return (
		<LongShell
			title={request.title}
			about={request.about}
			badge={request.badge}
			keys={
				<>
					<kbd>Enter</kbd> to finish · <kbd>Esc</kbd> to cancel
				</>
			}
			onDone={done}
			onClose={onClose}
		>
			<textarea
				ref={field}
				className={request.code ? "long-text-code" : undefined}
				rows={request.code ? 3 : 5}
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
		</LongShell>
	);
}

export interface LongField {
	label: string;
	value: string;
	placeholder?: string;
	/** Written in the code face, on one line: what an error throws. */
	code?: boolean;
}

/**
 * Several fields of one thing in the same room, as `LongTextEditor` has one:
 * an error's Type and Message, which are written together. Enter moves to the
 * next field, and finishes on the last.
 */
export function LongFieldsEditor({
	title,
	about,
	badge,
	fields,
	first = 0,
	onDone,
	onClose,
}: {
	title: string;
	about?: string;
	badge?: LongBadge;
	fields: LongField[];
	/** The field the caret starts in: the one tapped. */
	first?: number;
	onDone: (values: string[]) => void;
	onClose: () => void;
}) {
	const [values, setValues] = useState(() => fields.map((f) => f.value));
	const refs = useRef<(HTMLTextAreaElement | HTMLInputElement | null)[]>([]);
	const done = () => {
		if (values.some((v, i) => v !== fields[i].value)) onDone(values);
		onClose();
	};
	useEffect(() => {
		const el = refs.current[first];
		if (!el) return;
		el.focus();
		el.setSelectionRange(el.value.length, el.value.length);
	}, [first]);
	const props = (i: number) => ({
		ref: (el: HTMLTextAreaElement | HTMLInputElement | null) => {
			refs.current[i] = el;
		},
		value: values[i],
		placeholder: fields[i].placeholder,
		onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
			const value = e.target.value;
			setValues((was) => was.map((v, j) => (j === i ? value : v)));
		},
		onKeyDown: (e: React.KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				if (i < fields.length - 1) refs.current[i + 1]?.focus();
				else done();
			}
			if (e.key === "Escape") onClose();
		},
	});
	return (
		<LongShell
			title={title}
			about={about}
			badge={badge}
			keys={
				<>
					<kbd>Enter</kbd> for the next · <kbd>Esc</kbd> to cancel
				</>
			}
			onDone={done}
			onClose={onClose}
		>
			{fields.map((f, i) => (
				<label className="field wide" key={f.label}>
					<span>{f.label}</span>
					{f.code ? (
						<input className="tb long-text-code" spellCheck={false} {...props(i)} />
					) : (
						<textarea rows={4} {...props(i)} />
					)}
				</label>
			))}
		</LongShell>
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
	code,
	badge,
	onValue,
	field,
}: {
	value: string;
	placeholder?: string;
	title: string;
	about?: string;
	label: string;
	code?: boolean;
	badge?: LongBadge;
	onValue: (value: string) => void;
	/** The edit burst's handlers, so typing in the short field is one undo step. */
	field?: { onBlur: () => void; onKeyDown: (e: { key: string }) => void };
}) {
	const [open, setOpen] = useState(false);
	return (
		<span className="long-text-field">
			<input
				className={code ? "tb long-text-code" : "tb"}
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
					request={{ title, about, value, placeholder, code, badge, onDone: onValue }}
					onClose={() => setOpen(false)}
				/>
			)}
		</span>
	);
}
