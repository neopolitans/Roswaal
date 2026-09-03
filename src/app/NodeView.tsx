/** One node on the canvas: header, pin rows, and inline literal editors. */

import { memo, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

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
	/** Input pin keys ("node/pin") that currently have a wire. */
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
	const key = `${node.id}/${pin.id}`;
	const wired = props.connected.has(key);
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

export const NodeView = memo(NodeViewInner);
