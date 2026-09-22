/** One node on the canvas: header, pin rows, and inline literal editors. */

import {
	memo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode,
} from "react";

import type { GraphNode, Literal, NodeDef, PinDef } from "../core/schema.js";
import { nodeTitle } from "../core/nodes/index.js";
import { Icon } from "./icons.jsx";
import { NODE, LAYER } from "./layers.js";
import { nodeColor } from "./palette.js";
import { CLASS_OPTIONS, TYPE_OPTIONS, classGroup, typeGroup } from "../core/roblox.js";
import { classDetail, ValuePicker } from "./ValuePicker.jsx";
import { useTypeChoices } from "./TypePicker.jsx";
import { pinColor } from "./palette.js";
import {
	compactLabel, compactWidth, headerHeight, isCompact, isOperator, isReroute,
	nodeWidth, operatorLayoutOf, resolvePins,
} from "./geometry.js";
import { operatorSymbol } from "../core/operatorLayout.js";

const NEWLINE = String.fromCharCode(10);

export interface PinDragState {
	from: { node: string; pin: string };
	side: "in" | "out";
	kind: "exec" | "data";
	type?: string;
}

export interface NodeViewProps {
	node: GraphNode;
	def: NodeDef | undefined;
	selected: boolean;
	/**
	 * Widen the node to fit its header instead of cutting the title short.
	 * The same answer the wire router is given, so the pins stay on the edge
	 * the wires are drawn to.
	 */
	wideNodes?: boolean;
	/**
	 * This is the node the rest of the selection lines up on.
	 *
	 * Only ever set with two or more selected, because a lone node is the one
	 * it would be anchored to and saying so adds nothing. Without the marker
	 * "the first one you picked" is a fact about the past that the canvas does
	 * not show, and aligning becomes a guess you undo.
	 */
	anchor: boolean;
	errorCount: number;
	/**
	 * Warnings on this node, drawn only when there are no errors.
	 *
	 * A count is the right shape for an error — how many things are wrong is
	 * worth knowing before opening anything. A warning is a nudge toward the
	 * Inspector, where the thing to do about it is, so it is one mark saying
	 * "look here" rather than a number nobody acts on.
	 */
	warningCount: number;
	/** Wired pin keys, as "in:node/pin" or "out:node/pin". */
	connected: ReadonlySet<string>;
	drag: PinDragState | null;
	canAccept: (nodeId: string, pin: PinDef, side: "in" | "out") => boolean;
	onNodePointerDown: (e: ReactPointerEvent, nodeId: string) => void;
	onPinPointerDown: (e: ReactPointerEvent, nodeId: string, pin: PinDef, side: "in" | "out") => void;
	onPinPointerUp: (e: ReactPointerEvent, nodeId: string, pin: PinDef, side: "in" | "out") => void;
	/** Right-clicking a pin asks about that pin, not about what node comes next. */
	onPinContextMenu: (e: ReactPointerEvent, nodeId: string, pin: PinDef, side: "in" | "out") => void;
	/** `undefined` clears the pin back to unset, which only an optional pin uses. */
	onLiteralChange: (nodeId: string, pinId: string, value: Literal | undefined) => void;
	/** Opens the pop-out Luau editor for a raw literal. */
	onEditCode: (nodeId: string, pin: PinDef, value: string) => void;
	onContextMenu: (e: ReactPointerEvent, nodeId: string) => void;
	/** Adds or removes one input pin, for nodes whose arity is theirs to choose. */
	onGrow: (nodeId: string, delta: number) => void;
	/** How many inputs this node can gain or lose, if any. */
	growth: { canAdd: boolean; canRemove: boolean; label: string } | null;
	/** Set on a Declare Function in the flow: opens the graph it declares. */
	onOpen?: (nodeId: string) => void;
	/**
	 * The node designer's selected pin, as `in:id` or `out:id`, drawn
	 * highlighted. The graph canvas never sets it.
	 */
	highlightPin?: string | null;
	/**
	 * Set by the node designer, where a pin is something you edit: clicking
	 * anywhere on a pin's row — its label as well as its dot — picks it, and the
	 * row shows it can be picked. On a graph a row is not a target, so the
	 * canvas leaves this unset.
	 */
	onPinRowPointerDown?: (e: ReactPointerEvent, nodeId: string, pin: PinDef, side: "in" | "out") => void;
}

/**
 * A pin's visible content — dot, label, value — as one target, when the
 * designer is picking pins.
 *
 * Its own element rather than the row's side, because the side is deliberately
 * wide: it fills the node so values line up down the rows. A highlight on the
 * side covered half the node for a pin whose label is one word. This one is the
 * size of what is drawn, and the row's layout does not change.
 */
function pinTarget(props: NodeViewProps, pin: PinDef, side: "in" | "out", content: ReactNode) {
	if (!props.onPinRowPointerDown) return content;
	const picked = props.highlightPin === `${side}:${pin.id}`;
	return (
		<span
			className={`pin-target${picked ? " pin-selected" : ""}`}
			onPointerDown={(e) => props.onPinRowPointerDown!(e, props.node.id, pin, side)}
		>
			{content}
		</span>
	);
}

function NodeViewInner(props: NodeViewProps) {
	const { node, def, selected } = props;

	if (!def) {
		return (
			<div
				className="node has-error"
				style={{ left: node.x, top: node.y, width: NODE.width, zIndex: LAYER.node }}
			>
				<div className="head" style={{ background: "#7a2f2f" }}>
					<span className="title">Unknown node</span>
				</div>
				<div className="rows">
					<div className="row">
						<span className="side left">
							<span className="pin-label">{node.def}</span>
						</span>
					</div>
				</div>
			</div>
		);
	}

	const { inputs, outputs } = resolvePins(def, node.config, node.literals);

	if (isReroute(def)) return renderReroute(props, inputs[0], outputs[0]);
	if (isCompact(def)) return renderCapsule(props, def, outputs[0]);
	if (isOperator(def)) return renderOperator(props, def, inputs, outputs[0]);

	const rows = Math.max(inputs.length, outputs.length, 1);
	const subtitle = def.subtitle?.(node.config ?? {});
	const head = headerHeight(def, node.config);
	const style: CSSProperties = {
		left: node.x,
		top: node.y,
		width: nodeWidth(def, node, props.wideNodes),
		zIndex: selected ? LAYER.nodeSelected : LAYER.node,
	};

	return (
		<div
			className={[
				"node",
				def.pure ? "pure" : "",
				selected ? "selected" : "",
				props.anchor ? "anchor" : "",
				props.errorCount ? "has-error" : "",
			].filter(Boolean).join(" ")}
			style={style}
			data-node-id={node.id}
			onPointerDown={(e) => props.onNodePointerDown(e, node.id)}
			onDoubleClick={props.onOpen ? () => props.onOpen!(node.id) : undefined}
			onContextMenu={(e) => props.onContextMenu(e as unknown as ReactPointerEvent, node.id)}
		>
			{props.errorCount > 0 && <span className="badge-count">{props.errorCount}</span>}
			{props.errorCount === 0 && props.warningCount > 0 && (
				<span className="badge-count warn" title="Needs attention — see the Inspector">!</span>
			)}
			<div
				className={`head${subtitle ? " two-line" : ""}`}
				style={{ background: nodeColor(def), height: head }}
			>
				<span className="lines">
					<span className="title">{nodeTitle(def, node)}</span>
					{subtitle && <span className="subtitle">{subtitle}</span>}
				</span>
				{def.latent && <span className="marker" title="This node yields">⏳</span>}
				{props.onOpen && (
					<button
						className="open-graph"
						title="Open its graph — or double-click the node"
						aria-label="Open the function's graph"
						onPointerDown={(e) => e.stopPropagation()}
						onClick={() => props.onOpen!(node.id)}
					>
						<Icon name="function" size={13} />
					</button>
				)}
				{props.growth && (
					<span className="grow">
						<button
							disabled={!props.growth.canRemove}
							title={`One fewer ${props.growth.label}`}
							onPointerDown={(e) => e.stopPropagation()}
							onClick={() => props.onGrow(node.id, -1)}
						>
							−
						</button>
						<button
							disabled={!props.growth.canAdd}
							title={`One more ${props.growth.label} — or drop a wire on this node`}
							onPointerDown={(e) => e.stopPropagation()}
							onClick={() => props.onGrow(node.id, 1)}
						>
							+
						</button>
					</span>
				)}
			</div>
			<div className="rows" style={{ height: rows * NODE.rowHeight + NODE.footer }}>
				{Array.from({ length: rows }, (_, i) => (
					<div className="row" key={i}>
						<span className="side left">
							{inputs[i] && pinTarget(props, inputs[i], "in", renderPin(props, inputs[i], "in"))}
						</span>
						<span className="side right">
							{outputs[i] && pinTarget(props, outputs[i], "out", renderPin(props, outputs[i], "out"))}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

/**
 * A reroute knot: a dot the wire passes through. Both pins sit on top of each
 * other at its centre, so the wire enters and leaves at the same point and the
 * knot reads as a bend rather than a node.
 */
function renderReroute(
	props: NodeViewProps, input: PinDef | undefined, output: PinDef | undefined,
) {
	const { node, selected } = props;
	return (
		<div
			className={`node reroute${selected ? " selected" : ""}${props.anchor ? " anchor" : ""}`}
			data-node-id={node.id}
			style={{
				left: node.x,
				top: node.y,
				width: NODE.rerouteSize,
				height: NODE.rerouteSize,
				zIndex: selected ? LAYER.nodeSelected : LAYER.node,
			}}
			title={node.label || "Reroute"}
			onPointerDown={(e) => props.onNodePointerDown(e, node.id)}
			onContextMenu={(e) => props.onContextMenu(e as unknown as ReactPointerEvent, node.id)}
		>
			{input && renderPin(props, input, "in")}
			{output && renderPin(props, output, "out")}
		</div>
	);
}

/**
 * The capsule getter, drawn as a plain dark pill with the variable's name and
 * one coloured output. The shape alone tells you it is a value rather than a
 * step — which is exactly the read you want at a glance.
 */
function renderCapsule(props: NodeViewProps, def: NodeDef, output: PinDef | undefined) {
	const { node, selected } = props;
	const width = compactWidth(def, node);

	return (
		<div
			className={`node capsule${selected ? " selected" : ""}${props.anchor ? " anchor" : ""}${props.errorCount ? " has-error" : ""}`}
			data-node-id={node.id}
			style={{
				left: node.x,
				top: node.y,
				width,
				height: NODE.compactHeight,
				zIndex: selected ? LAYER.nodeSelected : LAYER.node,
			}}
			onPointerDown={(e) => props.onNodePointerDown(e, node.id)}
			onContextMenu={(e) => props.onContextMenu(e as unknown as ReactPointerEvent, node.id)}
		>
			{props.errorCount > 0 && <span className="badge-count">{props.errorCount}</span>}
			{props.errorCount === 0 && props.warningCount > 0 && (
				<span className="badge-count warn" title="Needs attention — see the Inspector">!</span>
			)}
			<span className="capsule-label">{compactLabel(def, node)}</span>
			{output && renderPin(props, output, "out")}
		</div>
	);
}

/**
 * A comparison or a logical operator, drawn as the expression it is: the inputs
 * down the left with their values, the Luau operator in the middle, and the
 * result on the right.
 *
 * No header, for the reason a capsule has none: the shape and the symbol say
 * what it is, and a title bar reading "Not Equal" over a `~=` says it twice.
 */
function renderOperator(
	props: NodeViewProps, def: NodeDef, inputs: PinDef[], output: PinDef | undefined,
) {
	const { node, selected } = props;
	const layout = operatorLayoutOf(def, node.config, node.literals);
	const rows = inputs.filter((pin) => pin.kind === "data");

	return (
		<div
			className={[
				"node", "operator",
				selected ? "selected" : "",
				props.anchor ? "anchor" : "",
				props.errorCount ? "has-error" : "",
			].filter(Boolean).join(" ")}
			data-node-id={node.id}
			style={{
				left: node.x,
				top: node.y,
				width: layout.width,
				height: layout.height,
				borderRadius: NODE.operatorRadius,
				zIndex: selected ? LAYER.nodeSelected : LAYER.node,
			}}
			title={nodeTitle(def, node)}
			onPointerDown={(e) => props.onNodePointerDown(e, node.id)}
			onContextMenu={(e) => props.onContextMenu(e as unknown as ReactPointerEvent, node.id)}
		>
			{props.errorCount > 0 && <span className="badge-count">{props.errorCount}</span>}
			{props.errorCount === 0 && props.warningCount > 0 && (
				<span className="badge-count warn" title="Needs attention — see the Inspector">!</span>
			)}

			<div className="operator-rows" style={{ top: layout.rowsTop }}>
				{rows.map((pin) => (
					<div className="row" key={pin.id}>
						<span className="side left">{renderPin(props, pin, "in")}</span>
					</div>
				))}
			</div>

			<span
				className="operator-symbol"
				style={{ left: layout.symbolLeft, width: layout.symbolWidth }}
			>
				{operatorSymbol(def, node.config)}
			</span>

			{/* Beside the symbol rather than in a header, because there is none. */}
			{props.growth && (
				<span className="operator-grow" style={{ left: layout.growLeft }}>
					<button
						disabled={!props.growth.canAdd}
						title={`One more ${props.growth.label} — or drop a wire on this node`}
						onPointerDown={(e) => e.stopPropagation()}
						onClick={() => props.onGrow(node.id, 1)}
					>
						+
					</button>
					<button
						disabled={!props.growth.canRemove}
						title={`One fewer ${props.growth.label}`}
						onPointerDown={(e) => e.stopPropagation()}
						onClick={() => props.onGrow(node.id, -1)}
					>
						−
					</button>
				</span>
			)}

			{output && (
				<span className="operator-out" style={{ top: layout.height / 2 - NODE.pinSlot / 2 }}>
					{renderPin(props, output, "out")}
				</span>
			)}
		</div>
	);
}

function renderPin(props: NodeViewProps, pin: PinDef, side: "in" | "out") {
	const { node } = props;
	const wired = props.connected.has(`${side}:${node.id}/${pin.id}`);
	const drag = props.drag;

	let state = "";
	if (drag) {
		// While a wire is in flight, dim everything it cannot land on so the
		// legal targets are the only thing that reads as clickable.
		state = props.canAccept(node.id, pin, side) ? " compatible" : " incompatible";
	}

	// Marked on the pin itself as well as its row, for the pill, which has no rows.
	const highlighted = props.highlightPin === `${side}:${pin.id}` ? " highlighted" : "";
	const dot = (
		<span
			className={`pin ${pin.kind}${wired ? " connected" : ""}${state}${highlighted}`}
			style={{ color: pinColor(pin.type, pin.kind) }}
			title={pin.description ?? pin.type ?? pin.kind}
			onPointerDown={(e) => props.onPinPointerDown(e, node.id, pin, side)}
			onPointerUp={(e) => props.onPinPointerUp(e, node.id, pin, side)}
			onContextMenu={(e) => {
				// Stopped here, or the node's own handler opens the palette on top.
				e.preventDefault();
				e.stopPropagation();
				props.onPinContextMenu(e as unknown as ReactPointerEvent, node.id, pin, side);
			}}
		>
			<span className="dot" />
		</span>
	);

	// A component of a split pin is indented under it, the usual way to nest the
	// children of a split struct pin — without that, three number pins called X,
	// Y and Z read as three unrelated inputs.
	const label = pin.name ? (
		<span className={`pin-label${pin.part ? " part" : ""}`}>{pin.name}</span>
	) : null;

	// An unwired data input is edited in place, which is what keeps simple
	// graphs from filling up with literal nodes.
	const editor =
		side === "in" && pin.kind === "data" && !wired && pin.required !== true
			&& pin.hideEditor !== true
			? renderLiteral(props, pin)
			: null;

	return side === "in" ? (
		<>
			{dot}
			{label}
			{editor}
		</>
	) : (
		<>
			{label}
			{dot}
		</>
	);
}

/**
 * The inline editor for a pin's value, and the two extra states an optional pin
 * has.
 *
 * An optional pin is either *unset*, meaning the argument is not passed at all,
 * or set to something. Both directions have to be reachable: a pin you can set
 * but never clear is a one-way door, and going back would otherwise mean
 * deleting the node and placing another.
 */
function renderLiteral(props: NodeViewProps, pin: PinDef) {
	const typed = props.node.literals?.[pin.id];
	const set = (value: Literal | undefined) =>
		props.onLiteralChange(props.node.id, pin.id, value);
	const stop = (e: ReactPointerEvent) => e.stopPropagation();

	/**
	 * An optional pin nobody has touched.
	 *
	 * Drawn as the word "default" rather than as its default *value*, because
	 * the two are different things here and showing the value would be a lie:
	 * the argument is not passed at all, and what the call does instead is the
	 * engine's business rather than ours. Clicking adopts the default as a
	 * starting point, which is the only sensible thing a click can mean.
	 */
	if (pin.optional === true && typed === undefined) {
		return (
			<button
				className="literal unset"
				title={
					"Not passed — the call uses its own default." +
					`${NEWLINE}${NEWLINE}Click to set a value.`
				}
				onPointerDown={stop}
				onClick={() => set(pin.default ?? { t: "nil" })}
			>
				default
			</button>
		);
	}

	const editor = renderLiteralEditor(props, pin);
	if (pin.optional !== true || editor === null) return editor;

	return (
		<span className="optional-value">
			{editor}
			<button
				className="clear"
				title="Stop passing this argument"
				onPointerDown={stop}
				onClick={() => set(undefined)}
			>
				×
			</button>
		</span>
	);
}

function renderLiteralEditor(props: NodeViewProps, pin: PinDef) {
	const current = props.node.literals?.[pin.id] ?? pin.default;
	if (!current) return null;
	const set = (value: Literal) => props.onLiteralChange(props.node.id, pin.id, value);
	const stop = (e: ReactPointerEvent) => e.stopPropagation();

	if (current.t === "boolean") {
		return (
			<input
				type="checkbox"
				checked={current.v}
				onPointerDown={stop}
				onChange={(e) => set({ t: "boolean", v: e.target.checked })}
			/>
		);
	}
	if (current.t === "number") {
		return (
			<input
				className="literal"
				type="number"
				value={current.v}
				onPointerDown={stop}
				onChange={(e) => set({ t: "number", v: Number(e.target.value) || 0 })}
			/>
		);
	}
	if (current.t === "raw") {
		const lines = current.v.split(NEWLINE);
		const preview = lines[0].trim() || "(empty)";

		// Only a pin that declares itself a code pin gets the editor. Everywhere
		// else a raw value is a constant Roswaal wrote — a Vector3.zero default,
		// or the value folded back when a split pin was recombined — and it is
		// shown rather than offered for editing. See PinDef.code: an ordinary
		// pin that opened a Luau editor would be somewhere to hide arbitrary
		// code inside a node whose title says "Look At".
		if (!pin.code) {
			return (
				<span className="literal constant" title={`${current.v}${NEWLINE}${NEWLINE}A constant. Wire a node in, or split the pin, to change it.`}>
					{preview}
				</span>
			);
		}

		// Raw literals are Luau, not a value, and Luau does not fit in a text
		// input. Show the first line and hand the rest to the pop-out editor.
		return (
			<button
				className="literal code"
				title="Edit this Luau"
				onPointerDown={stop}
				onClick={() => props.onEditCode(props.node.id, pin, current.v)}
			>
				<span className="preview">{preview}</span>
				{lines.length > 1 && <span className="more">+{lines.length - 1}</span>}
			</button>
		);
	}
	if (current.t === "string") {
		if (pin.options && pin.options.length > 0) {
			return <OptionEditor pin={pin} value={current.v} onChange={(v) => set({ t: "string", v })} />;
		}
		return (
			<input
				className="literal"
				value={current.v}
				// A project fact rather than a fixed list, so the options are
				// somewhere else and this only names them. Typing anything else
				// still works: a datalist narrows, it does not gate.
				list={pin.suggest}
				onPointerDown={stop}
				onChange={(e) => set({ t: "string", v: e.target.value })}
			/>
		);
	}
	return null;
}

const CUSTOM = "__roswaal_other__";

/**
 * Past this many, a dropdown stops being a list you read and becomes one you
 * scroll. Twelve services is the first; six hundred and twenty-five Instance
 * classes is the second.
 */
const TOO_MANY_TO_SCROLL = 24;

/**
 * A pin with a known set of values, in whichever control suits the set.
 *
 * The list is suggestions rather than a gate either way: a value that is not on
 * it — a class Roblox shipped after this build — still shows, still round-trips,
 * and can still be typed. A closed dropdown would turn every gap in the list
 * into a dead end.
 *
 * **A short list is a `select`**, which says what the choices are without being
 * asked and has "Other…" at the bottom for anything else.
 *
 * **A long one is a text field with a datalist**, which is the same offer made
 * the other way round: type and it narrows, or open it and scroll the lot.
 * Nobody scrolls six hundred options, and "Other…" is not the escape you want
 * when the list you are escaping is the one you were going to type into anyway.
 */
/**
 * How a pin's options are grouped in the picker, or nothing for a flat list.
 *
 * By identity on the shared arrays rather than by inspecting the values: these
 * are the two lists long enough to need headings, and a list a pack author
 * wrote is theirs to show as they gave it.
 */
function groupingFor(pin: PinDef): ((value: string) => string) | undefined {
	if (pin.options === CLASS_OPTIONS) return classGroup;
	if (pin.options === TYPE_OPTIONS) return typeGroup;
	return undefined;
}


function OptionEditor({
	pin, value, onChange,
}: { pin: PinDef; value: string; onChange: (value: string) => void }) {
	// A pin naming a Luau type -- what a Cast asserts -- offers what the
	// Inspector's type fields do, this graph's own types first, rather than the
	// engine's list alone.
	const types = useTypeChoices();
	const isType = pin.options === TYPE_OPTIONS;
	const known = isType ? types.options : pin.options ?? [];
	const listed = known.includes(value) || value === "";
	const [typing, setTyping] = useState(!listed);
	const [picking, setPicking] = useState(false);
	const stop = (e: ReactPointerEvent) => e.stopPropagation();

	if (known.length > TOO_MANY_TO_SCROLL) {
		/**
		 * A button that opens the picker, showing the value it holds.
		 *
		 * Not a text field with a `datalist` behind it, which is what this was
		 * first and is the wrong shape for the job: a datalist only narrows what
		 * you have already started typing, so it helps somebody who knows the
		 * name and not somebody looking for one. Browsing is half of what a list
		 * of six hundred classes is for.
		 */
		return (
			<>
				<button
					className="literal wide picker"
					title={pin.description ?? `Choose from ${known.length}`}
					onPointerDown={stop}
					onClick={() => setPicking(true)}
				>
					<span className="preview">{value || known[0]}</span>
					<Icon name="chevron" size={12} />
				</button>
				{picking && (
					<ValuePicker
						what={pin.name || pin.id}
						options={known}
						value={value}
						groupOf={isType ? types.groupOf : groupingFor(pin)}
						groupsFirst={isType ? types.groupsFirst : undefined}
						detailOf={groupingFor(pin) ? classDetail : undefined}
						onPick={onChange}
						onClose={() => setPicking(false)}
					/>
				)}
			</>
		);
	}

	if (typing) {
		return (
			<input
				className="literal wide"
				autoFocus
				value={value}
				title={pin.description}
				onPointerDown={stop}
				onChange={(e) => onChange(e.target.value)}
				onBlur={() => known.includes(value) && setTyping(false)}
			/>
		);
	}

	return (
		<select
			className="literal wide"
			value={value}
			title={pin.description}
			onPointerDown={stop}
			onChange={(e) => {
				if (e.target.value === CUSTOM) setTyping(true);
				else onChange(e.target.value);
			}}
		>
			{known.map((option) => (
				<option key={option} value={option}>
					{option}
				</option>
			))}
			<option value={CUSTOM}>Other…</option>
		</select>
	);
}

export const NodeView = memo(NodeViewInner);
