/**
 * Set Property's Property, once the value wired in has a class: a field that
 * offers the class's properties as you type, and only the ones a script can
 * set. The read-only ones that match are named under the list rather than
 * listed, so a search for `Mas` says why `Mass` is not there.
 *
 * A name typed past the list -- or one already in the graph -- still holds:
 * the list is an offer, not a gate. A read-only one is marked in the field
 * itself, and Script analysis says why.
 */

import { type KeyboardEvent, type PointerEvent, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { readOnlyToScripts } from "../core/robloxEngine.js";
import { propertiesOf } from "../core/robloxProperties.js";
import { cx } from "./cx.js";
import { Icon } from "./icons.jsx";
import { acceptsSuggestion } from "./keys.js";
import { LAYER } from "./layers.js";
import { pinColor } from "./palette.js";

/** A list of properties you read rather than scroll. */
const SHOWN = 40;

/** What the footer says about the read-only properties a query matched. */
export function readOnlyNote(names: readonly string[], searching: boolean): string | null {
	if (names.length === 0) return null;
	if (!searching) {
		return names.length === 1
			? `${names[0]} is read-only, so it is left out.`
			: `${names.length} read-only properties are left out.`;
	}
	if (names.length === 1) return `${names[0]} is read-only.`;
	if (names.length === 2) return `${names[0]} and ${names[1]} are read-only.`;
	return `${names[0]}, ${names[1]} and ${names.length - 2} more are read-only.`;
}

/** The class's properties matching `query`, settable and not, names starting with it first. */
export function propertyMatches(className: string, query: string) {
	const q = query.trim().toLowerCase();
	const all = propertiesOf(className)
		.map((p, i) => ({ ...p, i, at: q === "" ? 0 : p.name.toLowerCase().indexOf(q) }))
		.filter((p) => p.at >= 0)
		.sort((a, b) => Number(a.at !== 0) - Number(b.at !== 0) || a.i - b.i);
	const settable = all.filter((p) => !readOnlyToScripts(className, p.name));
	const readOnly = all.filter((p) => readOnlyToScripts(className, p.name)).map((p) => p.name);
	return { settable, readOnly };
}

export function PropertyField({
	className,
	value,
	onChange,
}: {
	/** The class of the Instance wired in. */
	className: string;
	value: string;
	onChange: (value: string) => void;
}) {
	const field = useRef<HTMLInputElement>(null);
	const listId = useId();
	const [open, setOpen] = useState(false);
	// Opened on a name already there, the list shows the class's properties
	// to browse; typing narrows it.
	const [typed, setTyped] = useState(false);
	const [active, setActive] = useState(0);

	const readOnly = value !== "" && readOnlyToScripts(className, value);
	const { settable, readOnly: lockedOut } = propertyMatches(className, typed ? value : "");
	const shown = settable.slice(0, SHOWN);
	const note = readOnlyNote(lockedOut, typed && value.trim() !== "");
	const box = open ? field.current?.closest(".property-field")?.getBoundingClientRect() : undefined;

	const pick = (name: string) => {
		onChange(name);
		setOpen(false);
		setTyped(false);
	};
	const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			setOpen(true);
			const step = e.key === "ArrowDown" ? 1 : -1;
			setActive((i) => Math.max(0, Math.min(shown.length - 1, i + step)));
		} else if (acceptsSuggestion(e) && open && shown[active]) {
			e.preventDefault();
			pick(shown[active].name);
		} else if (e.key === "Escape" && open) {
			e.stopPropagation();
			setOpen(false);
		}
	};
	const stop = (e: PointerEvent) => e.stopPropagation();

	return (
		<span
			className={cx("literal wide property-field", readOnly && "property-field--read-only")}
			title={
				readOnly
					? `${value} is read-only on ${className}. Setting it fails when the script runs.`
					: `A property of ${className}`
			}
		>
			{readOnly && <Icon name="lock" size={10} className="property-field-lock" />}
			<input
				ref={field}
				value={value}
				role="combobox"
				aria-expanded={open}
				aria-controls={listId}
				aria-label="Property"
				onPointerDown={stop}
				onFocus={() => {
					setOpen(true);
					setTyped(false);
					setActive(0);
				}}
				onBlur={() => setOpen(false)}
				onChange={(e) => {
					onChange(e.target.value);
					setTyped(true);
					setOpen(true);
					setActive(0);
				}}
				onKeyDown={onKeyDown}
			/>
			{open &&
				box &&
				(shown.length > 0 || note) &&
				createPortal(
					<div
						id={listId}
						role="listbox"
						aria-label={`Properties of ${className}`}
						className="property-list"
						style={{ left: box.left, top: box.bottom + 3, zIndex: LAYER.menu }}
						onPointerDown={(e) => e.preventDefault()}
					>
						<div className="property-list-class">{className}</div>
						{shown.map((p, i) => (
							<div
								key={p.name}
								role="option"
								aria-selected={i === active}
								className={cx("property-list-item", i === active && "on")}
								onPointerEnter={() => setActive(i)}
								onPointerDown={(e) => {
									e.preventDefault();
									pick(p.name);
								}}
							>
								<span className="swatch" style={{ background: pinColor(p.type, "data") }} />
								<span className="name">{p.name}</span>
								<span className="type">{p.enum ?? p.type}</span>
							</div>
						))}
						{note && (
							<div className="property-list-note">
								<Icon name="lock" size={10} />
								<span>{note}</span>
							</div>
						)}
					</div>,
					document.body,
				)}
		</span>
	);
}
