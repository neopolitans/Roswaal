/**
 * The place in 3D: a document tab of its own, its bar where a graph's strip
 * is, and a summary of the place in Properties while nothing is picked.
 *
 * The drawing, the camera and the input are `ViewportController`'s, which App
 * keeps for the session; these lend it the window.
 */

import {
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { errorMessage } from "../core/errorMessage.js";
import { api } from "./api.js";
import { PanelHead } from "./Cards.jsx";
import { cx } from "./cx.js";
import { Icon, type IconName } from "./icons.jsx";
import { Ident, SectionHead } from "./PanelParts.jsx";
import { VIEWPORT_RENDERERS, type ViewportRenderer } from "./preferences.js";
import {
	type Snap,
	type Stick,
	TOOLS,
	type Tool,
	type ViewportController,
} from "./viewport/controller.js";
import { useWorkspaceControls } from "./Workspace.jsx";

const GIZMO = 104;
const TOOL_ICON: Record<Tool, IconName> = {
	select: "vpSelect",
	move: "vpMove",
	rotate: "vpRotate",
	scale: "vpScale",
};
const LATER = "comes with editing";
/** What Automatic draws with here: WebGPU where the browser offers it at all. */
const AUTOMATIC = typeof navigator !== "undefined" && "gpu" in navigator ? "WebGPU" : "WebGL2";

function useViewport(controller: ViewportController) {
	return useSyncExternalStore(controller.subscribe, controller.getState);
}

export function Viewport({
	controller,
	refreshKey,
	written,
}: {
	controller: ViewportController;
	/** Changes whenever the project tree is read again, which is when to look again. */
	refreshKey: unknown;
	/** The version of the place a change last wrote: read it again. */
	written?: string | null;
}) {
	const holder = useRef<HTMLDivElement>(null);
	const [problem, setProblem] = useState<string | null>(null);
	const state = useViewport(controller);

	useEffect(() => {
		if (!holder.current) return;
		return controller.mount({ holder: holder.current });
	}, [controller]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey and written are when to read the place again.
	useEffect(() => {
		let stale = false;
		void (async () => {
			try {
				const tree = await api.place();
				if (tree.file === null) throw new Error("The project has no place file.");
				const scene = await api.placeScene(tree.stamp);
				if (stale) return;
				controller.setPlace({ ...scene, outline: tree.outline });
				setProblem(null);
			} catch (err) {
				if (!stale) setProblem(errorMessage(err));
			}
		})();
		return () => {
			stale = true;
		};
	}, [controller, refreshKey, written]);

	const shown = problem ?? state.error;
	return (
		<div className="viewport">
			<div className="vp-holder" ref={holder} />
			{shown && <p className="vp-problem">{shown}</p>}
			<div className="vp-touch">
				<TouchStick stick="move" label="Move" controller={controller} />
				<span className="vp-touch-right">
					<span className="vp-rise">
						<RiseButton rise={1} label="Up" controller={controller} />
						<RiseButton rise={-1} label="Down" controller={controller} />
					</span>
					<TouchStick stick="look" label="Look round" controller={controller} />
				</span>
			</div>
		</div>
	);
}

/** How far a stick's knob goes from the middle, in pixels. */
const STICK_REACH = 44;

/**
 * A touch stick, where a touch screen has no keys: a ring and a knob, pushed
 * as far as the ring in any direction, back to the middle when let go.
 */
function TouchStick({
	stick,
	label,
	controller,
}: {
	stick: Stick;
	label: string;
	controller: ViewportController;
}) {
	const knob = useRef<HTMLSpanElement>(null);
	const held = useRef<{ id: number; x: number; y: number } | null>(null);
	const push = (e: ReactPointerEvent) => {
		const at = held.current;
		if (!at || e.pointerId !== at.id) return;
		let dx = e.clientX - at.x;
		let dy = e.clientY - at.y;
		const d = Math.hypot(dx, dy);
		if (d > STICK_REACH) {
			dx *= STICK_REACH / d;
			dy *= STICK_REACH / d;
		}
		if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
		// A little give in the middle, so a resting thumb does not drift.
		const k = d < 6 ? 0 : 1 / STICK_REACH;
		controller.setStick(stick, dx * k, dy * k);
	};
	const end = (e: ReactPointerEvent) => {
		if (held.current?.id !== e.pointerId) return;
		held.current = null;
		if (knob.current) knob.current.style.transform = "";
		controller.setStick(stick, 0, 0);
	};
	return (
		<span
			className="vp-stick"
			role="img"
			aria-label={label}
			title={label}
			onPointerDown={(e) => {
				e.currentTarget.setPointerCapture(e.pointerId);
				const box = e.currentTarget.getBoundingClientRect();
				held.current = {
					id: e.pointerId,
					x: box.left + box.width / 2,
					y: box.top + box.height / 2,
				};
				push(e);
			}}
			onPointerMove={push}
			onPointerUp={end}
			onPointerCancel={end}
		>
			<span className="vp-stick-knob" ref={knob} />
		</span>
	);
}

/** Up or down, for as long as it is held: Q and E, for a touch screen. */
function RiseButton({
	rise,
	label,
	controller,
}: {
	rise: number;
	label: string;
	controller: ViewportController;
}) {
	const stop = () => controller.setRise(0);
	return (
		<button
			type="button"
			className="vp-rise-button"
			aria-label={label}
			title={label}
			onPointerDown={(e) => {
				e.currentTarget.setPointerCapture(e.pointerId);
				controller.setRise(rise);
			}}
			onPointerUp={stop}
			onPointerCancel={stop}
			onContextMenu={(e) => e.preventDefault()}
		>
			<Icon name="chevron" size={18} rotate={rise > 0 ? 180 : 0} />
		</button>
	);
}

/** The Move and Rotate snaps: on or off, and the step each keeps to. */
function SnapFields({ snap, controller }: { snap: Snap; controller: ViewportController }) {
	const step = (value: string, set: (n: number) => void) => {
		const n = Number(value);
		if (Number.isFinite(n) && n > 0) set(n);
	};
	return (
		<>
			<label className="vp-snap">
				<input
					type="checkbox"
					checked={snap.moveOn}
					aria-label="Snap moves"
					onChange={(e) => controller.setSnap({ moveOn: e.target.checked })}
				/>
				<Icon name="vpMove" size={14} />
				<input
					className="vp-step"
					type="number"
					inputMode="decimal"
					min={0.001}
					step={0.5}
					defaultValue={snap.move}
					aria-label="Move snap, in studs"
					onChange={(e) => step(e.target.value, (move) => controller.setSnap({ move }))}
				/>
				<span>studs</span>
			</label>
			<label className="vp-snap">
				<input
					type="checkbox"
					checked={snap.rotateOn}
					aria-label="Snap turns"
					onChange={(e) => controller.setSnap({ rotateOn: e.target.checked })}
				/>
				<Icon name="vpRotate" size={14} />
				<input
					className="vp-step"
					type="number"
					inputMode="decimal"
					min={1}
					step={5}
					defaultValue={snap.rotate}
					aria-label="Rotate snap, in degrees"
					onChange={(e) => step(e.target.value, (rotate) => controller.setSnap({ rotate }))}
				/>
				<span>°</span>
			</label>
		</>
	);
}

/** One of the bar's tiles: a large icon over its name, after Studio's compact bar. */
function Tile({
	icon,
	label,
	title,
	on,
	disabled,
	caret,
	onClick,
	...rest
}: {
	icon: IconName;
	label: string;
	title: string;
	on?: boolean;
	disabled?: boolean;
	caret?: boolean;
	onClick?: () => void;
	role?: string;
	"aria-checked"?: boolean;
	"aria-pressed"?: boolean;
}) {
	return (
		<button
			type="button"
			className={cx("vp-tile", on && "on")}
			title={title}
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			{...rest}
		>
			<span className="vp-tile-icon">
				<Icon name={icon} size={22} />
				{caret && <Icon name="chevron" size={9} className="vp-caret" />}
			</span>
			<span className="vp-tile-label">{label}</span>
		</button>
	);
}

/** The viewport's bar, where a graph's strip is: the tools, framing, the cards, and the camera's speed. */
export function ViewportBar({ controller }: { controller: ViewportController }) {
	const state = useViewport(controller);
	const gizmo = useRef<HTMLDivElement>(null);
	const rotation = useRef<HTMLSpanElement>(null);
	const rate = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		if (!gizmo.current || !rotation.current || !rate.current) return;
		return controller.mountCorner({
			gizmo: gizmo.current,
			rotation: rotation.current,
			rate: rate.current,
		});
	}, [controller]);
	const cards = useWorkspaceControls();
	const speed = state.speed;
	/** The snaps behind a tile, where the bar has no room for them: open, and where. */
	const [snapAt, setSnapAt] = useState<number | null>(null);
	const pop = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (snapAt === null) return;
		const away = (e: PointerEvent) => {
			const target = e.target as Element;
			if (!pop.current?.contains(target) && !target.closest?.(".vp-snap-tile")) setSnapAt(null);
		};
		addEventListener("pointerdown", away);
		return () => removeEventListener("pointerdown", away);
	}, [snapAt]);
	const snapTitle = "Snapping, for dragging the handles, which comes with editing";
	return (
		// The bar centred in the window, as the view is, with the axes and the
		// readout standing on its right-hand end: none of them moves when a card
		// opens or shuts.
		<div className="vp-dock">
			<div className="vp-cluster">
				<div className="vp-gizmo" ref={gizmo}>
					<svg
						width={GIZMO}
						height={GIZMO}
						viewBox={`${-GIZMO / 2} ${-GIZMO / 2} ${GIZMO} ${GIZMO}`}
						aria-label="View axes: click an end to look along it, drag to orbit"
					/>
				</div>
				<div className="vp-corner">
					<span
						className="vp-rot"
						ref={rotation}
						title="The camera's rotation, as Roblox's Orientation reads it: X, Y, Z, in degrees"
					/>
					<span
						className="vp-fps"
						ref={rate}
						title="Frames a second while the view moves, and what draws it. Nothing is drawn while nothing changes."
					/>
				</div>
			</div>
			<div className="side-strip tool-group vp-bar" role="toolbar" aria-label="Viewport">
				<span className="vp-group" role="radiogroup" aria-label="Tool">
					{TOOLS.map(([id, label, key]) => (
						<Tile
							key={id}
							icon={TOOL_ICON[id]}
							label={label}
							title={`${label} (${key})${id === "select" ? "" : `: the handles show; dragging them ${LATER}`}`}
							role="radio"
							aria-checked={state.tool === id}
							on={state.tool === id}
							onClick={() => controller.setTool(id)}
						/>
					))}
				</span>
				{/* Esc's job, where a touch screen has no keys. */}
				<span className="vp-clear">
					<Tile
						icon="close"
						label="Clear"
						title="Pick nothing (Esc)"
						disabled={!state.picked}
						onClick={() => controller.clear()}
					/>
				</span>
				<span className="vp-rule" />
				<span className="vp-snaps" title={snapTitle}>
					<SnapFields snap={state.snap} controller={controller} />
				</span>
				<span
					className="vp-snap-tile"
					onClickCapture={(e) => {
						// The tile's own place in the bar: its wrapper draws no box of its own.
						const left = (e.target as Element).closest<HTMLElement>(".vp-tile")?.offsetLeft ?? 0;
						setSnapAt((was) => (was === null ? left : null));
					}}
				>
					<Tile
						icon="vpSnap"
						label="Snap"
						title={snapTitle}
						caret
						on={snapAt !== null}
						aria-pressed={snapAt !== null}
					/>
				</span>
				{snapAt !== null && (
					<div className="vp-snap-pop" ref={pop} style={{ left: snapAt }} title={snapTitle}>
						<SnapFields snap={state.snap} controller={controller} />
					</div>
				)}
				<span className="vp-rule" />
				<Tile icon="instance" label="Part" title={`Add a part: ${LATER}`} caret disabled />
				<span className="vp-rule" />
				<Tile icon="vpMaterial" label="Material" title={`Material: ${LATER}`} caret disabled />
				<Tile icon="vpColor" label="Color" title={`Color: ${LATER}`} caret disabled />
				<Tile icon="vpGroup" label="Group" title={`Group: ${LATER}`} disabled />
				<Tile icon="vpLock" label="Lock" title={`Lock: ${LATER}`} disabled />
				<Tile icon="vpAnchor" label="Anchor" title={`Anchor: ${LATER}`} disabled />
				<span className="vp-rule" />
				<Tile
					icon="locate"
					label="Focus"
					title="Frame the selection (F)"
					onClick={() => controller.frameSelection()}
				/>
				<Tile
					icon="fit"
					label="Fit all"
					title="Frame the whole place (Home)"
					onClick={() => controller.fitAll()}
				/>
				<span className="vp-rule" />
				<Tile
					icon="vpExplorer"
					label="Explorer"
					title="Show or hide the Project card, with DataModel"
					aria-pressed={cards.cardShown("tree")}
					on={cards.cardShown("tree")}
					onClick={() => cards.toggleCard("tree")}
				/>
				<Tile
					icon="vpProperties"
					label="Properties"
					title="Show or hide Properties"
					aria-pressed={cards.cardShown("properties")}
					on={cards.cardShown("properties")}
					onClick={() => cards.toggleCard("properties")}
				/>
				<span className="vp-rule" />
				<span
					className="vp-speed"
					title="How fast WASD moves the camera. Shift+scroll to change it."
				>
					Speed {speed >= 10 ? speed.toFixed(0) : speed >= 1 ? speed.toFixed(1) : speed.toFixed(2)}×
				</span>
			</div>
		</div>
	);
}

/** Rows as an instance's Properties draws them: a name, and its value. */
function Rows({ rows }: { rows: [string, string][] }) {
	return rows.map(([name, value]) => (
		<div className="place-prop" key={name}>
			<span className="place-prop-name">{name}</span>
			<span className="place-prop-value">{value}</span>
		</div>
	));
}

/**
 * Properties while the place is in front and nothing is picked: the place
 * itself, drawn as an instance's Properties are, so it reads the same docked,
 * floating or in a tablet's drawer.
 */
export function PlaceSummary({
	controller,
	file,
	renderer,
	onRenderer,
}: {
	controller: ViewportController;
	file: string;
	/** The renderer Settings asks for, chosen here too. */
	renderer: ViewportRenderer;
	onRenderer: (renderer: ViewportRenderer) => void;
}) {
	const { summary, backend, fellBack } = useViewport(controller);
	const name = file.split("/").pop() ?? file;
	return (
		<div className="place-properties">
			<PanelHead sub={name} />
			<div className="place-props">
				<div className="place-props-head">
					<Ident name={name} kind="DataModel" color="var(--danger)" icon="build" />
				</div>
				<p className="place-summary">
					The place in 3D. Pick an instance in it, or in DataModel, for its properties.
				</p>
				<div className="place-groups">
					{summary && (
						<div className="place-group">
							<SectionHead title="Drawn" />
							<Rows
								rows={[
									["Parts", summary.parts.toLocaleString()],
									["MeshParts", `${summary.meshes.toLocaleString()}, as their boxes`],
									["Seen through", `${summary.translucent.toLocaleString()}, blended`],
									["Left out", `${summary.transparent.toLocaleString()} fully transparent`],
								]}
							/>
							<div className="place-prop" title="What draws the view. Settings has it too.">
								<span className="place-prop-name">Renderer</span>
								<span className="place-prop-value">
									<select
										className="tb place-edit-field"
										value={renderer}
										onChange={(e) => onRenderer(e.target.value as ViewportRenderer)}
									>
										{VIEWPORT_RENDERERS.map(([value, label]) => (
											<option key={value} value={value}>
												{value === "auto" ? `${label}: ${AUTOMATIC}` : label}
											</option>
										))}
									</select>
								</span>
							</div>
							{backend && (
								<Rows
									rows={[["Drawing with", fellBack ? `${backend}, no WebGPU here` : backend]]}
								/>
							)}
						</div>
					)}
					{summary && summary.notes.length > 0 && (
						<div className="place-group">
							<SectionHead title="Lighting" />
							<Rows rows={summary.notes} />
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
