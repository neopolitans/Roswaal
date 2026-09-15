/**
 * Finding one name among six hundred.
 *
 * A pin with a handful of values is a `select`. A pin with every Instance class
 * the engine has is not: a dropdown you scroll past is a dropdown you give up
 * on, and a plain text field only helps somebody who already knows the name
 * they want. Studio solved the same problem with its Insert Object window —
 * search at the top, everything below it, grouped and in columns — and this is
 * that shape.
 *
 * ## What it is built on
 *
 * **Search first, because that is what is used.** Typing narrows as you go, and
 * the ranking is the same one the node palette uses: a name that starts with
 * what you typed beats one that merely contains it.
 *
 * **Groups are the engine's own.** A class sits under the ancestor directly
 * below `Instance` — every constraint under `Constraint`, every UI element
 * under `GuiBase` — so the grouping is a fact rather than a taxonomy invented
 * here. A list with no grouping to offer (enums, easing styles) is shown as one
 * run of columns, which is the honest answer rather than a made-up heading.
 *
 * **The chain is the detail.** `Part → BasePart → PVInstance → Instance` under
 * the highlighted row answers "what is this", which is the other half of
 * browsing and the half a flat list cannot give you.
 *
 * **It never closes a door.** Whatever is typed can be committed whether or not
 * it is on the list, because every pin this opens for takes a name typed by
 * hand — a class newer than this build has to be reachable.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { classChain } from "../core/roblox.js";
import { Icon } from "./icons.jsx";
import { LAYER } from "./layers.js";

export interface ValuePickerProps {
	/** What is being chosen, for the heading: "class", "enum". */
	what: string;
	options: readonly string[];
	value: string;
	/** Group each value under a heading. Absent shows one ungrouped run. */
	groupOf?: (value: string) => string;
	/**
	 * Headings to put first, in this order.
	 *
	 * Groups are otherwise ordered by size, which is right for the classes —
	 * where the big families are the ones you are most likely to be looking
	 * through — and wrong when a small group is the answer most of the time.
	 * `any`, `number` and `string` are three of eight Luau types and are what a
	 * type field is set to nine times in ten; sorted by size they are at the
	 * bottom of six hundred classes.
	 */
	groupsFirst?: readonly string[];
	/** A line under the highlighted value. Absent shows nothing. */
	detailOf?: (value: string) => string;
	onPick: (value: string) => void;
	onClose: () => void;
}

/** Prefix beats substring, and a shorter name beats a longer one. */
function score(name: string, query: string): number {
	const lower = name.toLowerCase();
	if (lower === query) return 1000;
	if (lower.startsWith(query)) return 500 - name.length;
	if (lower.includes(query)) return 200 - name.length;
	return 0;
}

/** The inheritance chain, for a class. Anything else has none to show. */
export function classDetail(name: string): string {
	const chain = classChain(name);
	return chain.length > 1 ? chain.join("  ›  ") : "";
}

export function ValuePicker(props: ValuePickerProps) {
	const { options, groupOf, detailOf, groupsFirst } = props;
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(props.value);
	const root = useRef<HTMLDivElement>(null);
	const field = useRef<HTMLInputElement>(null);

	useEffect(() => {
		field.current?.focus();
		field.current?.select();
	}, []);

	const needle = query.trim().toLowerCase();

	/**
	 * What the list shows: everything, or what matches, in rank order.
	 *
	 * Grouping is dropped while searching. Six matches spread over four headings
	 * is four headings too many, and the thing you are doing when you type is
	 * reading one list top to bottom.
	 */
	const matches = useMemo(() => {
		if (needle === "") return null;
		return options
			.map((name) => ({ name, rank: score(name, needle) }))
			.filter((entry) => entry.rank > 0)
			.sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
			.map((entry) => entry.name);
	}, [options, needle]);

	const groups = useMemo(() => {
		if (matches !== null) return null;
		if (!groupOf) return null;
		const byGroup = new Map<string, string[]>();
		for (const name of options) {
			const label = groupOf(name);
			const list = byGroup.get(label) ?? [];
			list.push(name);
			byGroup.set(label, list);
		}
		const lead = (label: string) => {
			const at = groupsFirst?.indexOf(label) ?? -1;
			return at === -1 ? Number.MAX_SAFE_INTEGER : at;
		};
		return [...byGroup].sort(
			(a, b) =>
				lead(a[0]) - lead(b[0])
				|| b[1].length - a[1].length
				|| a[0].localeCompare(b[0]),
		);
	}, [options, matches, groupOf, groupsFirst]);

	/** Every value in the order it is drawn, which is what the arrow keys walk. */
	const order = useMemo(
		() => matches ?? (groups ? groups.flatMap(([, names]) => names) : [...options]),
		[matches, groups, options],
	);

	// A search that no longer holds what was highlighted moves the highlight to
	// the best match, so Enter always commits something the list is showing.
	useEffect(() => {
		if (!order.includes(active)) setActive(order[0] ?? "");
	}, [order, active]);

	useEffect(() => {
		const node = root.current?.querySelector<HTMLElement>(".value-option.on");
		node?.scrollIntoView({ block: "nearest", inline: "nearest" });
	}, [active]);

	const commit = (name: string) => {
		if (name === "") return;
		props.onPick(name);
		props.onClose();
	};

	function onKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Escape") {
			e.preventDefault();
			props.onClose();
			return;
		}
		if (e.key === "Enter") {
			e.preventDefault();
			// What is typed wins over what is highlighted when it is not on the
			// list at all: that is the only way to reach a name this build has
			// never heard of, and it is why the field is not a filter alone.
			commit(matches !== null && matches.length === 0 ? query.trim() : active || query.trim());
			return;
		}
		const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
		if (step !== 0) {
			e.preventDefault();
			const at = order.indexOf(active);
			const next = order[Math.min(order.length - 1, Math.max(0, at + step))];
			if (next) setActive(next);
		}
	}

	const detail = detailOf?.(active) ?? "";
	const nothing = matches !== null && matches.length === 0;

	const option = (name: string) => (
		<button
			key={name}
			className={`value-option${name === active ? " on" : ""}${name === props.value ? " current" : ""}`}
			onPointerEnter={() => setActive(name)}
			onClick={() => commit(name)}
		>
			{name}
		</button>
	);

	/**
	 * Through a portal, and not for tidiness.
	 *
	 * The canvas scales and pans with a `transform`, and **a transformed
	 * ancestor becomes the containing block for `position: fixed`** — so an
	 * overlay rendered where this one belongs, inside the pin inside the node,
	 * is laid out against the node rather than the window. It came out 64px wide
	 * in the corner of the graph, which reads exactly like a z-index problem and
	 * is not one: no index reaches out of a containing block.
	 *
	 * The palette and the pin menu avoid this by being rendered from `App`, at
	 * the top of the tree. A portal is the same escape without moving the
	 * control away from the pin it belongs to.
	 */
	return createPortal(
		<div className="docs-backdrop" style={{ zIndex: LAYER.menu + 1 }} onPointerDown={props.onClose}>
			<div
				className="value-picker"
				ref={root}
				onPointerDown={(e) => e.stopPropagation()}
				onKeyDown={onKeyDown}
			>
				<div className="value-search">
					<Icon name="search" size={15} />
					<input
						ref={field}
						className="tb"
						value={query}
						placeholder={`Search ${props.what}…`}
						spellCheck={false}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<button className="tb" title="Close (Esc)" onClick={props.onClose}>
						<Icon name="close" size={15} />
					</button>
				</div>

				<div className="value-list">
					{nothing ? (
						<p className="value-empty">
							Nothing matches “{query}”. <strong>Enter</strong> uses it anyway — the list is
							what this build knows, not what the pin will take.
						</p>
					) : groups ? (
						groups.map(([label, names]) => (
							<section key={label} className="value-group">
								<h3>{label}</h3>
								<div className="value-options">{names.map(option)}</div>
							</section>
						))
					) : (
						<div className="value-options">{order.map(option)}</div>
					)}
				</div>

				<div className="value-detail">
					{detail || (nothing ? "" : `${order.length} of ${options.length}`)}
				</div>
			</div>
		</div>,
		document.body,
	);
}
