/** One node on the canvas: header, pin rows, and inline literal editors. */

import { memo, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import type { GraphNode, Literal, NodeDef, PinDef } from "../core/schema.js";
import { NODE, LAYER } from "./layers.js";
import { nodeColor } from "./palette.js";
import { pinColor } from "./palette.js";
import { headerHeight, resolvePins } from "./geometry.js";

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
			className={`node${selected ? " selected" : ""}${props.errorCount ? " has-error" : ""}`}
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
		return (
			<input
				className="literal wide"
				value={current.v}
				title="Inserted into the generated Luau verbatim"
				onPointerDown={stop}
				onChange={(e) => set({ t: "raw", v: e.target.value })}
			/>
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
