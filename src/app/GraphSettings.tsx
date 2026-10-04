/**
 * The graph's own settings, in the Inspector while nothing is selected.
 *
 * What the graph compiles to, its typechecking mode and its target were three
 * selects on the graph's floating tools. They are settings of the whole graph,
 * changed rarely and read often, which is what the Inspector is for: with no
 * node to describe, it describes the graph. The tools keep only what acts.
 */

import type { ScriptClass, Target, TypecheckMode } from "../core/schema.js";
import { PanelHead } from "./Cards.jsx";
import { cx } from "./cx.js";
import { Field } from "./InspectorSections.jsx";
import { Icon } from "./icons.jsx";
import { Ident } from "./PanelParts.jsx";

export interface GraphSettingsProps {
	name: string;
	scriptClass: ScriptClass;
	target: Target;
	typecheck: TypecheckMode;
	/** The graph is being compiled and must not be edited. */
	locked: boolean;
	/** How many nodes it has, and how many functions, for a line of figures. */
	nodes: number;
	functions: number;
	onScriptClass: (value: ScriptClass) => void;
	onTarget: (value: Target) => void;
	onTypecheck: (value: TypecheckMode) => void;
}

export function GraphSettings(props: GraphSettingsProps) {
	const lune = props.target === "lune";
	return (
		<div className={cx("inspector graph-settings", props.locked && "editing-locked")}>
			<PanelHead sub="Graph" />
			<div className="inspector-body">
				<Ident
					name={props.name}
					kind={lune ? "Lune" : `${props.scriptClass} · Roblox`}
					color="var(--accent)"
					icon="document"
				/>
				{/* Lune has no script classes: every file is .luau, and a Module
				    Exports node is what makes one a module. */}
				{!lune && (
					<Field label="Script" hint="What this graph compiles to">
						<select
							className="tb"
							value={props.scriptClass}
							disabled={props.locked}
							onChange={(e) => props.onScriptClass(e.target.value as ScriptClass)}
						>
							<option>Script</option>
							<option>LocalScript</option>
							<option>ModuleScript</option>
						</select>
					</Field>
				)}
				<Field
					label="Type checking"
					hint="Which Luau typechecking mode the generated file declares. Default writes no mode line; the other two also annotate the types of generated locals."
				>
					<select
						className="tb"
						value={props.typecheck}
						disabled={props.locked}
						onChange={(e) => props.onTypecheck(e.target.value as TypecheckMode)}
					>
						<option value="default">Default</option>
						<option value="nonstrict">Nonstrict</option>
						<option value="strict">Strict</option>
					</select>
				</Field>
				<Field
					label="Target"
					hint={
						lune
							? "Compiles for Lune, which is experimental. Roblox-only nodes are errors here."
							: "Compiles for Roblox."
					}
				>
					<span className="target-pick">
						<select
							className={cx("tb doc-target", props.target)}
							value={props.target}
							disabled={props.locked}
							onChange={(e) => props.onTarget(e.target.value as Target)}
						>
							<option value="roblox">Roblox</option>
							<option value="lune">Lune</option>
						</select>
						{lune && <Icon name="warning" size={14} className="target-warn" />}
					</span>
				</Field>
				<p className="graph-figures">
					<span>
						<b>{props.nodes}</b> {props.nodes === 1 ? "node" : "nodes"}
					</span>
					<span>
						<b>{props.functions}</b> {props.functions === 1 ? "function" : "functions"}
					</span>
				</p>
				<p className="summary">
					Select a node for its settings. With nothing selected, these are the graph's.
				</p>
			</div>
		</div>
	);
}
