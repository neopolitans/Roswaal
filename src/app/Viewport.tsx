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
import { GizmoSection } from "./GizmoSection.jsx";
import { Ident, SectionHead } from "./PanelParts.jsx";
import {
	VIEWPORT_FRAME_RATES,
	VIEWPORT_RENDERERS,
	type ViewportFrameRate,
	type ViewportRenderer,
} from "./preferences.js";
import {
	type Snap,
	type Stick,
	TOOLS,
	type Tool,
	type ViewportController,
} from "./viewport/controller.js";
import { fader } from "./viewport/fade.js";
import {
	FRAME_GUIDES,
	type FrameHistory,
	gpuTotal,
	graphTop,
	graphY,
} from "./viewport/frameGraph.js";
import { type HeavyMesh, shortCount } from "./viewport/heaviest.js";
import { prepareScene } from "./viewport/prepare.js";
import { readSpeed, SPEED_MAX, SPEED_MIN, SPEED_STEP, speedText } from "./viewport/speed.js";
import {
	heatStyled,
	RENDER_HEAT,
	RENDER_MODES,
	type RenderHeat,
	type RenderLegend,
	type RenderMode,
	type RenderSettings,
	type RenderStats,
	renderLegend,
} from "./viewport/view.js";
import {
	changedFrom,
	DEBUG_PRESETS,
	FEATURE_GROUPS,
	featureOn,
	PERFORMANCE_PRESETS,
	RENDER_PRESETS,
	RENDER_STEPS,
	type RenderFeatures,
	STUDIO_FEATURES,
	stepOf,
	upToStep,
} from "./viewport/renderFeatures.js";
import { useWorkspaceControls } from "./Workspace.jsx";

const GIZMO = 104;
const TOOL_ICON: Record<Tool, IconName> = {
	select: "vpSelect",
	move: "vpMove",
	rotate: "vpRotate",
	scale: "vpScale",
};
const LATER = "comes with editing";
/** Said by an editing tool while Modify DataModel Instances is off. */
const EDITING_OFF = "Editing is off: turn on Modify DataModel Instances in Settings › Workspace";
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
				// The lights' grid off the page, so the place does not hold it.
				await prepareScene(scene);
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

	const rise = useFade<HTMLSpanElement>();
	const shown = problem ?? state.error;
	return (
		<div className="viewport">
			<div className="vp-holder" ref={holder} />
			{shown && <p className="vp-problem">{shown}</p>}
			<div className="vp-touch">
				<TouchStick stick="move" label="Move" controller={controller} />
				<span className="vp-touch-right">
					<span className="vp-rise" ref={rise}>
						<RiseButton rise={1} label="Up" controller={controller} />
						<RiseButton rise={-1} label="Down" controller={controller} />
					</span>
					<TouchStick stick="look" label="Look round" controller={controller} />
				</span>
			</div>
		</div>
	);
}

/**
 * Fades a touch control a while after the last touch in it lets go, and wakes
 * it at the next. The class goes straight on the element, so the viewport does
 * not draw again for it.
 */
function useFade<T extends HTMLElement>() {
	const area = useRef<T>(null);
	useEffect(() => {
		const el = area.current;
		if (!el) return;
		const f = fader((faded) => el.classList.toggle("vp-faded", faded));
		const down = (e: PointerEvent) => f.down(e.pointerId);
		const up = (e: PointerEvent) => f.up(e.pointerId);
		const ends = ["pointerup", "pointercancel", "lostpointercapture"] as const;
		el.addEventListener("pointerdown", down, true);
		for (const end of ends) el.addEventListener(end, up, true);
		return () => {
			f.stop();
			el.removeEventListener("pointerdown", down, true);
			for (const end of ends) el.removeEventListener(end, up, true);
			el.classList.remove("vp-faded");
		};
	}, []);
	return area;
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
	const area = useFade<HTMLSpanElement>();
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
			ref={area}
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

/** How fast the camera flies, typed: what Shift+scroll sets too, which the field follows. */
function SpeedField({ speed, controller }: { speed: number; controller: ViewportController }) {
	const field = useRef<HTMLInputElement>(null);
	// Not while it is being typed in, which would take the text from under the caret.
	useEffect(() => {
		const el = field.current;
		if (el && el !== document.activeElement) el.value = speedText(speed);
	}, [speed]);
	return (
		<label className="vp-snap vp-speed-field" title={SPEED_TITLE}>
			<span>Speed</span>
			<input
				ref={field}
				className="vp-step"
				type="number"
				inputMode="decimal"
				min={SPEED_MIN}
				max={SPEED_MAX}
				step={SPEED_STEP}
				defaultValue={speedText(speed)}
				aria-label="Camera speed"
				onChange={(e) => {
					const n = readSpeed(e.target.value);
					if (n !== null) controller.setSpeed(n);
				}}
				onBlur={(e) => {
					e.target.value = speedText(controller.getState().speed);
				}}
			/>
			<span>×</span>
		</label>
	);
}

const SPEED_TITLE =
	"How fast the camera flies, with WASD or the move stick. Shift+scroll changes it too.";

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
	const popTitle = "Snapping, and the camera's speed";
	return (
		// The bar centred in the window, as the view is, with the axes and the
		// readout standing on its right-hand end: none of them moves when a card
		// opens or shuts.
		<div className="vp-dock">
			<div className="vp-above">
				<RenderBadge render={state.render} />
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
			</div>
			<div className="side-strip tool-group vp-bar" role="toolbar" aria-label="Viewport">
				<span className="vp-group" role="radiogroup" aria-label="Tool">
					{TOOLS.map(([id, label, key]) => (
						<Tile
							key={id}
							icon={TOOL_ICON[id]}
							label={label}
							title={
								id === "select"
									? `${label} (${key}); again for the camera alone`
									: state.editable
										? `${label} (${key}): the handles show; dragging them ${LATER}`
										: `${label}. ${EDITING_OFF}`
							}
							role="radio"
							aria-checked={state.tool === id}
							on={state.tool === id}
							disabled={id !== "select" && !state.editable}
							onClick={() => controller.chooseTool(id)}
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
						title={popTitle}
						caret
						on={snapAt !== null}
						aria-pressed={snapAt !== null}
					/>
				</span>
				{snapAt !== null && (
					<div className="vp-snap-pop" ref={pop} style={{ left: snapAt }}>
						<span className="vp-snap-rows" title={snapTitle}>
							<SnapFields snap={state.snap} controller={controller} />
						</span>
						<SpeedField speed={state.speed} controller={controller} />
					</div>
				)}
				{/* Beside the steps a drag keeps to: how the handles stand, not a tool of their own. */}
				<Tile
					icon="vpPivot"
					label="Pivot"
					title={
						state.editable
							? `Edit Pivot: the handles stand at the pivot of what is picked; dragging them ${LATER}`
							: `Edit Pivot. ${EDITING_OFF}`
					}
					disabled={!state.editable}
					on={state.pivotEdit}
					aria-pressed={state.pivotEdit}
					onClick={() => controller.setPivotEdit(!state.pivotEdit)}
				/>
				<Tile
					icon={state.space === "world" ? "vpGlobe" : "instance"}
					label={state.space === "world" ? "Global" : "Object"}
					title={
						state.editable
							? "The handles' axes: the object's own, or the world's (Ctrl+L)"
							: `The handles' axes. ${EDITING_OFF}`
					}
					disabled={!state.editable}
					onClick={() => controller.setSpace(state.space === "world" ? "object" : "world")}
				/>
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
				<span className="vp-speed">
					<SpeedField speed={state.speed} controller={controller} />
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
	frameRate,
	onFrameRate,
}: {
	controller: ViewportController;
	file: string;
	/** The renderer Settings asks for, chosen here too. */
	renderer: ViewportRenderer;
	onRenderer: (renderer: ViewportRenderer) => void;
	/** The frame rate Settings asks for, chosen here too. */
	frameRate: ViewportFrameRate;
	onFrameRate: (frameRate: ViewportFrameRate) => void;
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
									[
										"MeshParts",
										summary.meshesDrawn >= summary.meshes
											? summary.meshes.toLocaleString()
											: summary.meshesDrawn > 0
												? `${summary.meshes.toLocaleString()}, ${(summary.meshes - summary.meshesDrawn).toLocaleString()} as their boxes`
												: `${summary.meshes.toLocaleString()}, as their boxes`,
									],
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
							<div
								className="place-prop"
								title="The most the view is drawn a second while it moves. It is drawn only when something changes. Settings has it too."
							>
								<span className="place-prop-name">Frame rate</span>
								<span className="place-prop-value">
									<select
										className="tb place-edit-field"
										value={frameRate}
										onChange={(e) => onFrameRate(e.target.value as ViewportFrameRate)}
									>
										{VIEWPORT_FRAME_RATES.map(([value, label]) => (
											<option key={value} value={value}>
												{label}
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

/**
 * How the view is drawn, over the bar's left end: what the Rendering panel
 * looks at, a heatmap's style, the step its switches show, and how many are
 * set apart from Studio's.
 */
function RenderBadge({ render }: { render: RenderSettings }) {
	const mode = RENDER_MODES.find(([m]) => m === render.mode)?.[1] ?? "";
	const heat = heatStyled(render.mode)
		? RENDER_HEAT.find(([h]) => h === render.heat)?.[1]
		: undefined;
	const { step, exact } = stepOf(render.features);
	const changed = changedFrom(render.features).length;
	const stepText =
		changed === 0
			? null
			: exact
				? step === 0
					? "Nothing lit"
					: `Step ${step}: ${RENDER_STEPS[step - 1][0]}`
				: `${changed} switch${changed === 1 ? "" : "es"} changed`;
	return (
		<div className="vp-render-badge" title="How the view is drawn: the Rendering panel">
			<span>{heat ? `${mode} · ${heat}` : mode}</span>
			{stepText && <span className="vp-render-badge-off">{stepText}</span>}
			{render.freezeShadows && <span className="vp-render-badge-frozen">Shadows frozen</span>}
		</div>
	);
}

/** What a heatmap's colours mean, under the modes. */
const HEAT_LEGEND: Partial<Record<RenderMode, [string, string]>> = {
	cost: ["Cheap", "Costly"],
	lights: ["No lights", "8 or more"],
};

/** What the colours of Overdraw, Triangle density and Shadow maps mean: see renderLegend. */
function ViewLegend({ legend }: { legend: RenderLegend }) {
	if (legend.kind === "bar")
		return (
			<div className="render-legend">
				<span
					className="render-legend-bar"
					style={{ background: `linear-gradient(to right, ${legend.stops})` }}
				/>
				<span className="render-legend-ends">
					{legend.ticks.map((tick) => (
						<span key={tick}>{tick}</span>
					))}
				</span>
				<span className="render-legend-caption">{legend.caption}</span>
			</div>
		);
	return (
		<ul className="render-legend render-legend-key">
			{legend.items.map((item) => (
				<li key={item.label}>
					<span className="render-legend-swatch" style={{ background: item.colour }} />
					<span>{item.label}</span>
				</li>
			))}
		</ul>
	);
}

const ms = (n: number) => `${n.toFixed(2)} ms`;

/** The graph's colours, from its CSS: see `.render-graph`. */
function graphColours(el: Element) {
	const css = getComputedStyle(el);
	const get = (name: string) => css.getPropertyValue(`--render-graph-${name}`).trim() || "#888";
	return {
		frame: get("frame"),
		guide: get("guide"),
		text: get("text"),
		shadows: get("shadows"),
		scene: get("scene"),
		post: get("post"),
		page: get("page"),
	};
}

/**
 * The last frames, newest on the right: each frame's interval as a line, and
 * under it the GPU's passes stacked where the browser times them, else the
 * page's time; across it, 60 and 30 frames a second.
 */
function paintFrameGraph(canvas: HTMLCanvasElement, history: FrameHistory): void {
	const dpr = Math.min(2, devicePixelRatio || 1);
	const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
	const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
	if (canvas.width !== w || canvas.height !== h) {
		canvas.width = w;
		canvas.height = h;
	}
	const g = canvas.getContext("2d");
	if (!g) return;
	const c = graphColours(canvas);
	const samples = history.samples();
	const top = graphTop(samples);
	const step = w / history.size;
	const x0 = w - samples.length * step;
	g.clearRect(0, 0, w, h);
	samples.forEach((s, i) => {
		const x = x0 + i * step;
		let below = 0;
		const bar = (ms: number, colour: string) => {
			if (!Number.isFinite(ms) || ms <= 0) return;
			const from = graphY(below, top, h);
			below += ms;
			const to = graphY(below, top, h);
			g.fillStyle = colour;
			g.fillRect(x, to, Math.max(1, step - dpr * 0.5), from - to);
		};
		if (Number.isFinite(gpuTotal(s))) {
			bar(s.shadows, c.shadows);
			bar(s.scene, c.scene);
			bar(s.post, c.post);
		} else bar(s.page, c.page);
	});
	g.font = `${10 * dpr}px system-ui, sans-serif`;
	g.textBaseline = "bottom";
	g.lineWidth = dpr;
	g.setLineDash([3 * dpr, 3 * dpr]);
	g.strokeStyle = c.guide;
	g.fillStyle = c.text;
	let labelled = Number.POSITIVE_INFINITY;
	for (const ms of FRAME_GUIDES) {
		const y = Math.round(graphY(ms, top, h)) + 0.5;
		g.beginPath();
		g.moveTo(0, y);
		g.lineTo(w, y);
		g.stroke();
		// A guide too close to the one below goes unlabelled: the scale's top says how far up it is.
		if (labelled - y < 11 * dpr) continue;
		g.fillText(`${ms.toFixed(1)} ms`, 3 * dpr, y - 1);
		labelled = y;
	}
	g.setLineDash([]);
	g.textBaseline = "top";
	g.textAlign = "right";
	g.fillText(`${top} ms`, w - 3 * dpr, 2 * dpr);
	g.textAlign = "left";
	g.strokeStyle = c.frame;
	g.lineWidth = 1.5 * dpr;
	g.lineJoin = "round";
	g.beginPath();
	samples.forEach((s, i) => {
		const x = x0 + (i + 0.5) * step;
		const y = graphY(s.interval, top, h);
		if (i === 0) g.moveTo(x, y);
		else g.lineTo(x, y);
	});
	g.stroke();
}

/** The frame-time graph, drawn four times a second at most, and only when frames were drawn. */
function FrameGraph({ controller, timed }: { controller: ViewportController; timed: boolean }) {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		let drawn = -1;
		let wide = 0;
		const paint = () => {
			const canvas = ref.current;
			const history = controller.frameHistory();
			if (!canvas || (history.version === drawn && canvas.clientWidth === wide)) return;
			drawn = history.version;
			wide = canvas.clientWidth;
			paintFrameGraph(canvas, history);
		};
		paint();
		const tick = setInterval(paint, 250);
		return () => clearInterval(tick);
	}, [controller]);
	const keys: [string, string][] = timed
		? [
				["shadows", "GPU shadows"],
				["scene", "GPU place"],
				["post", "GPU effects"],
			]
		: [["page", "Page"]];
	return (
		<div className="render-graph">
			<canvas
				ref={ref}
				className="render-graph-canvas"
				role="img"
				aria-label="Frame times, the last 240 frames"
			/>
			<div className="render-graph-legend">
				<span className="render-graph-key render-graph-key-frame">Frame</span>
				{keys.map(([key, label]) => (
					<span className={`render-graph-key render-graph-key-${key}`} key={key}>
						{label}
					</span>
				))}
			</div>
		</div>
	);
}

/**
 * Mesh Debug: the meshes costing the most triangles, and drawn most often.
 * A click picks every copy and frames them.
 */
export function MeshesPanel({ controller }: { controller: ViewportController }) {
	const { heaviest } = useViewport(controller);
	const list = (title: string, meshes: HeavyMesh[], value: (m: HeavyMesh) => string) =>
		meshes.length > 0 && (
			<div className="render-heavy-list">
				<div className="render-heavy-head">{title}</div>
				{meshes.map((m) => {
					const { name, className } = controller.rowName(m.rows[0]);
					return (
						<button
							type="button"
							className="render-heavy-row"
							key={m.key}
							title={`${className}: ${m.copies.toLocaleString()} × ${m.triangles.toLocaleString()} triangles`}
							onClick={() => controller.pickRows(m.rows)}
						>
							<span className="render-heavy-name">{name || className}</span>
							<span className="render-heavy-value">{value(m)}</span>
						</button>
					);
				})}
			</div>
		);
	return (
		<div className="place-properties render-panel">
			<PanelHead sub="Heaviest meshes" />
			<div className="place-props">
				<div className="place-groups">
					<div className="place-group">
						{heaviest ? (
							<>
								{list("By triangles", heaviest.byTriangles, (m) =>
									m.copies > 1 ? `${shortCount(m.total)} · ×${m.copies}` : shortCount(m.total),
								)}
								{list("By copies", heaviest.byCopies, (m) => `×${m.copies.toLocaleString()}`)}
							</>
						) : (
							<p className="place-summary">No meshes drawn yet.</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

/** A Rendering panel switch for a tool, off to begin with: not something the view leaves out. */
function RenderToolSwitch({
	label,
	on,
	onChange,
}: {
	label: string;
	on: boolean;
	onChange: (on: boolean) => void;
}) {
	return (
		<label className="render-switch">
			<span>{label}</span>
			<input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
		</label>
	);
}

/**
 * Performance: what the last frame took, and the last 240 frames' times.
 * Polled only while the panel is mounted.
 */
export function PerformancePanel({ controller }: { controller: ViewportController }) {
	const { backend } = useViewport(controller);
	const [stats, setStats] = useState<RenderStats | null>(null);
	useEffect(() => {
		setStats(controller.renderStats());
		const tick = setInterval(() => setStats(controller.renderStats()), 500);
		return () => clearInterval(tick);
	}, [controller]);
	const gpu = stats?.gpu;
	return (
		<div className="place-properties render-panel">
			<PanelHead sub="Last frame" />
			<div className="place-props">
				<div className="place-groups">
					<div className="place-group">
						<FrameGraph controller={controller} timed={!!gpu} />
						{stats ? (
							<Rows
								rows={[
									["Draw calls", stats.draws.toLocaleString()],
									["Instances", stats.instances.toLocaleString()],
									["Triangles", Math.round(stats.triangles).toLocaleString()],
									["Beams", stats.beams.toLocaleString()],
									["Particles", stats.particles.toLocaleString()],
									["Page", ms(stats.cpu)],
									...((gpu
										? [
												["GPU, shadows", ms(gpu.shadows)],
												["GPU, place", ms(gpu.scene)],
												["GPU, effects", ms(gpu.post)],
											]
										: [
												["GPU", backend === "WebGL2" ? "Not timed in WebGL2" : "Not timed here"],
											]) as [string, string][]),
								]}
							/>
						) : (
							<p className="place-summary">Nothing drawn yet.</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

/**
 * Rendering: how the viewer draws the place, as engines' editors offer. A
 * switch for each part of the picture, the ten steps a frame is built in to
 * walk through, presets for speed and for looking into one feature, and the
 * views of what it costs. The view's alone, for the session; the place is
 * untouched.
 */
export function RenderPanel({ controller }: { controller: ViewportController }) {
	const { render } = useViewport(controller);
	const apply = (next: RenderSettings) => controller.setRender(next);
	const legend = HEAT_LEGEND[render.mode];
	const viewLegend = renderLegend(render.mode);
	const { features } = render;
	const setFeatures = (next: RenderFeatures) => apply({ ...render, features: next, mode: "lit" });
	const { step, exact } = stepOf(features);
	const [shut, setShut] = useState<ReadonlySet<string>>(() => new Set(["Post effects"]));
	const [hint, setHint] = useState<string | null>(null);
	const preset = presetOf(render);
	const changed = changedFrom(features).length;
	const toStep = (n: number) => setFeatures(upToStep(Math.max(0, Math.min(RENDER_STEPS.length, n))));
	const choose = (id: string) => {
		const p = RENDER_PRESETS.find((x) => x.id === id);
		if (!p) return;
		apply({ ...render, features: p.features, mode: p.look ?? "lit", lightRanges: p.lightRanges ?? false });
	};
	return (
		<div className="place-properties render-panel">
			<PanelHead sub="The view only" />
			<div className="place-props">
				<div className="place-groups">
					<div className="place-group">
						<label className="render-heat">
							<span>Preset</span>
							<select
								className="tb place-edit-field"
								value={preset}
								onChange={(e) => choose(e.target.value)}
							>
								<optgroup label="Performance">
									{PERFORMANCE_PRESETS.map((p) => (
										<option key={p.id} value={p.id}>
											{p.label}
										</option>
									))}
								</optgroup>
								<optgroup label="Render debugging">
									{DEBUG_PRESETS.map((p) => (
										<option key={p.id} value={p.id}>
											{p.label}
										</option>
									))}
								</optgroup>
								<option value="custom" disabled>
									Custom
								</option>
							</select>
						</label>
						<div className="render-step">
							<button
								type="button"
								className="tb icon-only"
								aria-label="Previous step"
								disabled={step === 0 && exact}
								onClick={() => toStep(exact ? step - 1 : step)}
							>
								<Icon name="chevron" size={14} className="render-step-back" />
							</button>
							<span className="render-step-where" aria-live="polite">
								<span className="render-step-count">
									{step === 0 ? "Before step 1" : `Step ${step} of ${RENDER_STEPS.length}`}
								</span>
								<span className="render-step-name">
									{step === 0 ? "Nothing lit" : RENDER_STEPS[step - 1][0]}
									{exact ? "" : ", and more"}
								</span>
							</span>
							<button
								type="button"
								className="tb icon-only"
								aria-label="Next step"
								disabled={step === RENDER_STEPS.length}
								onClick={() => toStep(step + 1)}
							>
								<Icon name="chevron" size={14} className="render-step-on" />
							</button>
						</div>
						<label className="render-heat">
							<span>Look at</span>
							<select
								className="tb place-edit-field"
								value={render.mode}
								onChange={(e) => apply({ ...render, mode: e.target.value as RenderMode })}
							>
								{RENDER_MODES.map(([mode, label]) => (
									<option key={mode} value={mode}>
										{label}
									</option>
								))}
							</select>
						</label>
						{heatStyled(render.mode) && (
							<label className="render-heat">
								<span>Heat</span>
								<select
									className="tb place-edit-field"
									value={render.heat}
									onChange={(e) => apply({ ...render, heat: e.target.value as RenderHeat })}
								>
									{RENDER_HEAT.map(([value, label]) => (
										<option key={value} value={value}>
											{label}
										</option>
									))}
								</select>
							</label>
						)}
						{legend && (
							<div
								className={cx("render-legend", render.mode === "lights" && "render-legend-lights")}
							>
								<span className="render-legend-bar" />
								<span className="render-legend-ends">
									<span>{legend[0]}</span>
									<span>{legend[1]}</span>
								</span>
							</div>
						)}
						{viewLegend && <ViewLegend legend={viewLegend} />}
					</div>
					{FEATURE_GROUPS.map((group) => {
						const open = !shut.has(group.title);
						const on = group.features.filter((i) => featureOn(features, i.key)).length;
						return (
							<div className="place-group" key={group.title}>
								<SectionHead
									title={group.title}
									open={open}
									onToggle={() =>
										setShut((was) => {
											const next = new Set(was);
											if (!next.delete(group.title)) next.add(group.title);
											return next;
										})
									}
								>
									<span className="render-group-count">
										{on}/{group.features.length}
									</span>
								</SectionHead>
								{open &&
									group.features.map((info) => (
										<label
											key={info.key}
											className={cx(
												"render-switch",
												info.parent && "render-switch-under",
												!featureOn(features, info.key) && features[info.key] && "render-switch-held",
											)}
											onPointerEnter={() => setHint(info.hint)}
										>
											<span>
												{features[info.key] !== STUDIO_FEATURES[info.key] && (
													<span className="render-switch-changed" title="Changed from Studio" />
												)}
												{info.label}
											</span>
											<input
												type="checkbox"
												checked={features[info.key]}
												disabled={!!info.parent && !featureOn(features, info.parent)}
												onFocus={() => setHint(info.hint)}
												onChange={(e) => setFeatures({ ...features, [info.key]: e.target.checked })}
											/>
										</label>
									))}
							</div>
						);
					})}
					<GizmoSection controller={controller} />
					<div className="place-group">
						<SectionHead title="Tools" />
						<RenderToolSwitch
							label="Light ranges"
							on={render.lightRanges}
							onChange={(lightRanges) => apply({ ...render, lightRanges })}
						/>
						<RenderToolSwitch
							label="Freeze shadows"
							on={render.freezeShadows}
							onChange={(freezeShadows) => apply({ ...render, freezeShadows })}
						/>
					</div>
				</div>
			</div>
			<p className="render-hint">{hint ?? "Point at a switch to see what it does."}</p>
			<div className="render-foot">
				<span>{changed === 0 ? "As Studio" : `${changed} changed from Studio`}</span>
				<button
					type="button"
					className="tb"
					disabled={changed === 0 && render.mode === "lit"}
					onClick={() => choose("studio")}
				>
					Reset to Studio
				</button>
			</div>
		</div>
	);
}

/** The preset the panel's settings are, or "custom". */
function presetOf(render: RenderSettings): string {
	const same = (a: RenderFeatures, b: RenderFeatures) =>
		FEATURE_GROUPS.every((g) => g.features.every((i) => a[i.key] === b[i.key]));
	const p = RENDER_PRESETS.find(
		(x) =>
			same(x.features, render.features) &&
			(x.look ?? "lit") === render.mode &&
			(x.lightRanges ?? false) === render.lightRanges,
	);
	return p?.id ?? "custom";
}
