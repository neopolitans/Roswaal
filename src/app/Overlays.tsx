/**
 * Everything that floats above the workspace.
 *
 * Seven of them, each driven by one piece of state and dismissed by clearing
 * it. They are gathered here for the same reason the toolbar was: panelisation
 * reshapes the *workspace* into dockable panels, and none of these is ever
 * going to be a panel. A menu anchored to a click and a modal over the whole
 * window are the two things docking does not apply to.
 *
 * ## Menus and windows
 *
 * The stack is in two halves, and the order matters — later ones draw over
 * earlier ones.
 *
 * **Menus** are anchored to a point on the canvas and belong to a gesture that
 * is still in progress: the palette you dragged a wire into, the pin menu you
 * right-clicked, the drop menu from a file dragged in. **Windows** cover the
 * app and belong to a decision you made deliberately: settings, the selection
 * preview, a confirm, the Luau editor.
 *
 * ## Why one component and not seven call sites
 *
 * The alternative is what this replaced: seven conditionals at the bottom of
 * `App.tsx`'s render, interleaved with the workspace they sit above. Keeping
 * them together is what makes "which of these can be open at once, and which
 * draws over which" a question with a place to look.
 *
 * It holds no state of its own. Every overlay's open-ness lives in `App.tsx`,
 * because every one of them is closed by something else that happens there —
 * a project switching, a document closing, a compile starting.
 */

import { useEffect, useRef } from "react";

import type {
	Literal, NodeConfig, NodeDef, NodeScript, PinDef, RoswaalConfig,
} from "../core/schema.js";
import type { Registry } from "../core/nodes/index.js";
import type { InstanceLocation } from "../core/nodemap.js";
import { CodeEditor } from "./CodeEditor.jsx";
import { Dialog, type PendingDialog } from "./Dialog.jsx";
import { NodeMenu, type MenuAnchor, type Preset } from "./NodeMenu.jsx";
import { PinMenu, type PinMenuTarget } from "./PinMenu.jsx";
import { SelectionPreview } from "./SelectionPreview.jsx";
import { SettingsPanel } from "./SettingsPanel.jsx";
import { LAYER } from "./layers.js";
import type { Preferences } from "./preferences.js";

/** A file dragged onto the canvas, once we know what can be made from it. */
export interface DropMenuState {
	screen: { x: number; y: number };
	world: { x: number; y: number };
	name: string;
	location: InstanceLocation;
}

export interface CodeEditState {
	nodeId: string;
	pin: PinDef;
	value: string;
}

export interface OverlaysProps {
	registry: Registry;
	/** Null when a node map or a read-only source file is open. */
	script: NodeScript | null;
	selection: ReadonlySet<string>;

	// -- menus -------------------------------------------------------------
	drop: DropMenuState | null;
	onDropPick: (defId: string, config: Record<string, unknown>) => void;
	onDropClose: () => void;

	menu: MenuAnchor | null;
	presets: Preset[];
	onMenuPick: (
		def: NodeDef,
		config?: NodeConfig,
		literals?: Record<string, Literal>,
		member?: { name: string; type?: string },
	) => void;
	onAddComment: () => void;
	onMenuClose: () => void;

	pinMenu: PinMenuTarget | null;
	onPromote: () => void;
	onBreakLinks: () => void;
	onSplit: (mode: string) => void;
	onRecombine: (parent: string) => void;
	onPinMenuClose: () => void;

	// -- windows -----------------------------------------------------------
	preview: { code: string; sourceMap: { line: number; node: string }[] } | null;
	/** What the preview picks out: the selection, or the function on screen. */
	previewSelection: ReadonlySet<string>;
	/** Set when that is a whole function rather than a selection. */
	previewFunction?: string;
	onPreviewClose: () => void;

	settings: { root: string; config: RoswaalConfig; prefs: Preferences } | null;
	onConfig: (patch: Partial<RoswaalConfig>) => void;
	onPrefs: (patch: Partial<Preferences>) => void;
	onSettingsClose: () => void;

	dialog: PendingDialog | null;

	codeEdit: CodeEditState | null;
	onCodeCommit: (value: string) => void;
	onCodeClose: () => void;

}

export function Overlays(props: OverlaysProps) {
	return (
		<>
			{props.drop && (
				<DropMenu
					screen={props.drop.screen}
					name={props.drop.name}
					location={props.drop.location}
					onPick={props.onDropPick}
					onClose={props.onDropClose}
				/>
			)}

			{props.preview && props.script && (
				<SelectionPreview
					script={props.script}
					registry={props.registry}
					selection={props.previewSelection}
					functionName={props.previewFunction}
					code={props.preview.code}
					sourceMap={props.preview.sourceMap}
					onClose={props.onPreviewClose}
				/>
			)}

			{props.settings && (
				<SettingsPanel
					root={props.settings.root}
					config={props.settings.config}
					prefs={props.settings.prefs}
					onConfig={props.onConfig}
					onPrefs={props.onPrefs}
					onClose={props.onSettingsClose}
				/>
			)}

			{/* Above the rest on purpose: a confirm is usually asked *by* one of
			    them, and an answer that opened behind the question would be a
			    dead application. */}
			{props.dialog && <Dialog {...props.dialog} />}

			{props.codeEdit && (
				<CodeEditor
					title={props.codeEdit.pin.name || "Luau"}
					value={props.codeEdit.value}
					hint="Emitted verbatim into the generated file"
					script={props.script}
					registry={props.registry}
					nodeId={props.codeEdit.nodeId}
					onClose={props.onCodeClose}
					onCommit={props.onCodeCommit}
				/>
			)}

			{props.menu && props.script && (
				<NodeMenu
					anchor={props.menu}
					registry={props.registry}
					target={props.script.target}
					presets={props.presets}
					onPick={props.onMenuPick}
					onAddComment={props.onAddComment}
					onClose={props.onMenuClose}
				/>
			)}

			{props.pinMenu && props.script && (
				<PinMenu
					target={props.pinMenu}
					script={props.script}
					registry={props.registry}
					onPromote={props.onPromote}
					onBreakLinks={props.onBreakLinks}
					onSplit={props.onSplit}
					onRecombine={props.onRecombine}
					onClose={props.onPinMenuClose}
				/>
			)}
		</>
	);
}

// ---------------------------------------------------------------------------

interface DropMenuProps {
	screen: { x: number; y: number };
	name: string;
	location: InstanceLocation;
	onPick: (defId: string, config: Record<string, unknown>) => void;
	onClose: () => void;
}

/**
 * What can be made from a file dropped on the canvas.
 *
 * The whole value is that the path is already worked out: you dragged the
 * module in, so Roswaal knows it is ReplicatedStorage + Greeter and you do not
 * have to type either.
 */
function DropMenu({ screen, name, location, onPick, onClose }: DropMenuProps) {
	const root = useRef<HTMLDivElement>(null);
	const config = { root: location.root, path: location.path };
	const full = location.path ? `${location.root}.${location.path}` : location.root;

	useEffect(() => {
		const onDown = (e: MouseEvent) => {
			if (!root.current?.contains(e.target as Node)) onClose();
		};
		const id = window.setTimeout(() => window.addEventListener("mousedown", onDown), 0);
		return () => {
			window.clearTimeout(id);
			window.removeEventListener("mousedown", onDown);
		};
	}, [onClose]);

	return (
		<div
			className="menu drop-menu"
			ref={root}
			style={{ zIndex: LAYER.menu, left: screen.x, top: screen.y + 40 }}
		>
			<div className="drop-head">
				<strong>{name}</strong>
				<code>{full}</code>
			</div>
			<div className="items">
				{location.isModule && (
					<div
						className="item"
						title="A hoisted require, with the path already filled in"
						onClick={() => onPick("module.requirePath", { ...config, as: "" })}
					>
						<span className="swatch" style={{ background: "#6f4f9b" }} />
						<span>Require Module</span>
						<span className="hint">pure</span>
					</div>
				)}
				<div
					className="item"
					title="A reference to the instance itself"
					onClick={() => onPick("roblox.instancePath", config)}
				>
					<span className="swatch" style={{ background: "#2c7676" }} />
					<span>Instance</span>
					<span className="hint">pure</span>
				</div>
				{!location.isModule && (
					<p className="drop-note">
						This compiles to a Script rather than a ModuleScript, so there is nothing to
						require.
					</p>
				)}
			</div>
		</div>
	);
}
