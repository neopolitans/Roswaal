/** One node on the canvas: header, pin rows, and inline literal editors. */

import { memo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import type { GraphNode, Literal, NodeDef, PinDef } from "../core/schema.js";
import { NODE, LAYER } from "./layers.js";
import { nodeColor } from "./palette.js";
import { pinColor } from "./palette.js";
import { compactLabel, compactWidth, headerHeight, isCompact, resolvePins } from "./geometry.js";

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
	errorCount: number;
	/** Wired pin keys, as "in:node/pin" or "out:node/pin". */
	connected: ReadonlySet<string>;
	drag: PinDragState | null;
	canAccept: (pin: PinDef, side: "in" | "out") => boolean;
	onNodePointerDown: (e: ReactPointerEvent, nodeId: string) => void;
	onPinPointerDown: (e: ReactPointerEvent, nodeId: string, pin: PinDef, side: "in" | "out") => void;
	onPinPointerUp: (e: ReactPointerEvent, nodeId: string, pin: PinDef, side: "in" | "out") => void;
	onLiteralChange: (nodeId: string, pinId: string, value: Literal) => void;
	/** Opens the pop-out Luau editor for a raw literal. */
	onEditCode: (nodeId: string, pin: PinDef, value: string) => void;
	onContextMenu: (e: ReactPointerEvent, nodeId: string) => void;
	/** Adds or removes one input pin, for nodes whose arity is theirs to choose. */
	onGrow: (nodeId: string, delta: number) => void;
	/** How many inputs this node can gain or lose, if any. */
	growth: { canAdd: boolean; canRemove: boolean; label: string } | null;
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

	const { inputs, outputs } = resolvePins(def, node.config);

	if (isCompact(def)) return renderCapsule(props, def, outputs[0]);

	const rows = Math.max(inputs.length, outputs.length, 1);
	const subtitle = def.subtitle?.(node.config ?? {});
	const head = headerHeight(def, node.config);
	const style: CSSProperties = {
		left: node.x,
		top: node.y,
		width: NODE.width,
		zIndex: selected ? LAYER.nodeSelected : LAYER.node,
	};

	return (
		<div
			className={[
				"node",
				def.pure ? "pure" : "",
				selected ? "selected" : "",
				props.errorCount ? "has-error" : "",
			].filter(Boolean).join(" ")}
			style={style}
			data-node-id={node.id}
			onPointerDown={(e) => props.onNodePointerDown(e, node.id)}
			onContextMenu={(e) => props.onContextMenu(e as unknown as ReactPointerEvent, node.id)}
		>
			{props.errorCount > 0 && <span className="badge-count">{props.errorCount}</span>}
			<div
				className={`head${subtitle ? " two-line" : ""}`}
				style={{ background: nodeColor(def), height: head }}
			>
				<span className="lines">
					<span className="title">{node.label || def.title}</span>
					{subtitle && <span className="subtitle">{subtitle}</span>}
				</span>
				{def.latent && <span className="marker" title="This node yields">⏳</span>}
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
							{inputs[i] && renderPin(props, inputs[i], "in")}
						</span>
						<span className="side right">
							{outputs[i] && renderPin(props, outputs[i], "out")}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

/**
 * The capsule getter. Unreal draws these as a plain dark pill with the
 * variable's name and one coloured output, and the shape alone tells you it is
 * a value rather than a step — which is exactly the read you want at a glance.
 */
function renderCapsule(props: NodeViewProps, def: NodeDef, output: PinDef | undefined) {
	const { node, selected } = props;
	const width = compactWidth(def, node);

	return (
		<div
			className={`node capsule${selected ? " selected" : ""}${props.errorCount ? " has-error" : ""}`}
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
			<span className="capsule-label">{compactLabel(def, node)}</span>
			{output && renderPin(props, output, "out")}
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
		state = props.canAccept(pin, side) ? " compatible" : " incompatible";
	}

	const dot = (
		<span
			className={`pin ${pin.kind}${wired ? " connected" : ""}${state}`}
			style={{ color: pinColor(pin.type, pin.kind) }}
			title={pin.description ?? pin.type ?? pin.kind}
			onPointerDown={(e) => props.onPinPointerDown(e, node.id, pin, side)}
			onPointerUp={(e) => props.onPinPointerUp(e, node.id, pin, side)}
		>
			<span className="dot" />
		</span>
	);

	const label = pin.name ? <span className="pin-label">{pin.name}</span> : null;

	// An unwired data input is edited in place, which is what keeps simple
	// graphs from filling up with literal nodes.
	const editor =
		side === "in" && pin.kind === "data" && !wired && pin.required !== true
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

function renderLiteral(props: NodeViewProps, pin: PinDef) {
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
		// Raw literals are Luau, not a value, and Luau does not fit in a text
		// input. Show the first line and hand the rest to the pop-out editor.
		const lines = current.v.split(NEWLINE);
		const preview = lines[0].trim() || "(empty)";
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
				onPointerDown={stop}
				onChange={(e) => set({ t: "string", v: e.target.value })}
			/>
		);
	}
	return null;
}

const CUSTOM = "__roswaal_other__";

/**
 * A dropdown for a pin with a known set of values, and an escape from it.
 *
 * The list is suggestions rather than a gate: a value that is not on it — a
 * service Roblox shipped after this build — still shows, still round-trips, and
 * can still be typed via "Other…". A closed dropdown would turn every gap in
 * the list into a dead end.
 */
function OptionEditor({
	pin, value, onChange,
}: { pin: PinDef; value: string; onChange: (value: string) => void }) {
	const known = pin.options ?? [];
	const listed = known.includes(value) || value === "";
	const [typing, setTyping] = useState(!listed);
	const stop = (e: ReactPointerEvent) => e.stopPropagation();

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
