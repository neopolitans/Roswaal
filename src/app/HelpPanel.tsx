/**
 * Getting-started help.
 *
 * Deliberately in the app rather than only in the README: the questions it
 * answers ("what is the red node for", "why will this not connect") arrive
 * while you are looking at a graph, and a README is somewhere else.
 */

import { useEffect, useState } from "react";
import { Icon } from "./icons.jsx";
import { LAYER } from "./layers.js";

const SECTIONS = ["Basics", "Values", "Roblox", "Building", "Controls"] as const;
type Section = (typeof SECTIONS)[number];

export function HelpPanel({ onClose }: { onClose: () => void }) {
	const [section, setSection] = useState<Section>("Basics");

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [onClose]);

	return (
		<div className="help-backdrop" style={{ zIndex: LAYER.menu }} onPointerDown={onClose}>
			<div className="help" onPointerDown={(e) => e.stopPropagation()}>
				<div className="help-head">
					<strong>Roswaal</strong>
					<span className="sub">Visual scripting that compiles to Luau</span>
					<span style={{ flex: 1 }} />
					<button className="tb" onClick={onClose} title="Close (Esc)">
						<Icon name="close" size={15} />
					</button>
				</div>

				<div className="help-body">
					<nav className="help-nav">
						{SECTIONS.map((name) => (
							<button
								key={name}
								className={section === name ? "on" : ""}
								onClick={() => setSection(name)}
							>
								{name}
							</button>
						))}
					</nav>

					<article className="help-content">
						{section === "Basics" && <Basics />}
						{section === "Values" && <Values />}
						{section === "Roblox" && <RobloxHelp />}
						{section === "Building" && <Building />}
						{section === "Controls" && <Controls />}
					</article>
				</div>
			</div>
		</div>
	);
}

function Basics() {
	return (
		<>
			<h3>Two kinds of wire</h3>
			<p>
				White <b>execution</b> wires say what happens in what order. Coloured{" "}
				<b>data</b> wires say what a value is. A node either sits in the execution
				line or it does not.
			</p>
			<p>
				Nodes with a green left edge are <b>pure</b>: no execution pins, wire them
				anywhere. Everything else emits a statement and needs to be in the line.
			</p>

			<h3>Red nodes start and end things</h3>
			<p>
				<b>Script Start</b> is where a script begins. <b>Function</b> declares one and
				is its own entry point — it is not wired into anything else. <b>Return</b> and{" "}
				<b>Module Exports</b> end a flow. If a graph has no red entry node, nothing
				runs, and the status bar will say so.
			</p>

			<h3>Reading the wires</h3>
			<p>
				Pin colour is the type: red boolean, green number, magenta string, blue
				instance, gold vector. A wire that <b>fades between two colours</b> is a
				coercion — an <code>any</code> landing on a typed pin. Hover it to see which.
			</p>

			<h3>When it will not connect</h3>
			<p>
				Dragging from a pin dims everything it cannot reach. Execution and data
				never join. An input takes one wire; connecting a second replaces the first.
				Drag <i>from</i> a wired input to pick that wire up and move it. Alt-click a
				wire to cut it.
			</p>
		</>
	);
}

function Values() {
	return (
		<>
			<h3>Variables and locals are different</h3>
			<p>
				A <b>variable</b> is declared once in the Variables panel and read or written
				anywhere in the graph. It becomes a file-level local, so functions and the
				main flow both see it. Drag one onto the canvas for a Get node, or hold{" "}
				<kbd>Ctrl</kbd> while dropping for a Set. They also appear in the node search
				by name: type <code>health</code> and you get <i>Get health</i> and{" "}
				<i>Set health</i>.
			</p>
			<p>
				A <b>local</b> (Declare Local) binds a value mid-flow and only exists inside
				the block that declared it. You reach it by wiring its output, not by name.
				Reading one from outside its block is reported as an error rather than
				emitted as code that will not compile.
			</p>

			<h3>Doing things in order</h3>
			<p>
				<b>Sequence</b> runs each of its outputs to completion before starting the
				next — one execution input, as many outputs as you add. It is how you fan a
				single step out into several without nesting.
			</p>
			<p>
				A <b>Return</b> ends the block it is in, and Luau will not accept anything
				after one, so a Sequence output that returns cannot be followed by another.
				Roswaal says so rather than emitting a file that will not parse. Put the
				return inside a <b>Branch</b> if the later outputs should still run.
			</p>

			<h3>Nodes that grow</h3>
			<p>
				Add, Multiply, Concatenate, Min and the rest take as many inputs as you want.
				Use the <b>+</b> and <b>−</b> in the node header, or just{" "}
                <b>drop a wire on the node body</b> and it grows a pin to land on. Return,
				Module Exports, Sequence and the call nodes work the same way.
			</p>

			<h3>Escaping to Luau</h3>
			<p>
				<b>Custom Code</b> and <b>Luau Expression</b> hold code emitted verbatim.
				Click the code preview on the node for a proper editor: Luau highlighting,
				completion over both Luau's globals and the names this graph puts in scope,
				and a structural check that marks a broken line as you type. It is the way
				to wrap code you already have rather than rebuilding it as nodes.
			</p>
		</>
	);
}

function RobloxHelp() {
	return (
		<>
			<h3>Services are free</h3>
			<p>
				<b>Get Service</b> is pure and hoisted: pick a service from the dropdown and
				it becomes a top-level local, once, however many nodes ask for it. No wiring
				into the execution line.
			</p>

			<h3>Reaching instances and modules</h3>
			<p>
				<b>Instance</b> takes a root — a service, or <code>game</code> /{" "}
				<code>script</code> / <code>workspace</code> — and a dotted path like{" "}
				<code>Modules.Combat</code>. It compiles to plain indexing.
			</p>
			<p>
				<b>Require Module</b> takes the same root and path and is hoisted like a
				service, because <code>require</code> is cached by Roblox too. Requiring the
				same module from three nodes still gives one local.
			</p>
			<pre>{`local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Greeter = require(ReplicatedStorage.Shared.Greeter)`}</pre>
			<p>
				To call into it: <b>Get Field</b> reads an export off the module, and{" "}
				<b>Call Function</b> invokes it. Add arguments with the <b>+</b> in the
				header.
			</p>
			<p>
				The path is a <b>DataModel</b> path, not a disk path. What puts a module at{" "}
				<code>ReplicatedStorage.Shared</code> is the node map — see Building.
			</p>
		</>
	);
}

function Building() {
	return (
		<>
			<h3>Roswaal writes files; Rojo syncs them</h3>
			<p>
				Graphs live in <code>.roswaal/scripts</code> and compile to <code>.luau</code>{" "}
				under the out directory. Rojo picks those up like any other source file.
				Roswaal never talks to Studio.
			</p>
			<p>
				Folders under the scripts directory mirror folders under the out directory,
				and Rojo turns those into Folder instances. Right-click the tree to make one.
			</p>

			<h3>Node maps decide where things live</h3>
			<p>
				A <code>.nodemap</code> describes the DataModel hierarchy and compiles to a
				Rojo project file. That is what makes <code>src/shared</code> appear as{" "}
				<code>ReplicatedStorage.Shared</code>, which is what makes a require path
				resolve. Edit it as a tree; the generated JSON is shown beside it.
			</p>

			<h3>Manual or hot</h3>
			<p>
				<b>Manual</b> compiles when you ask (<kbd>Ctrl</kbd>+<kbd>S</kbd>, or the
				toolbar). <b>Hot reload</b> watches the graph directory and recompiles on
				change — including changes Roswaal did not make, like switching branches.
			</p>
			<p>
				Generated files carry a hash of themselves. If one has been edited by hand,
				Roswaal refuses to overwrite it and offers the override instead, rather than
				eating the edit.
			</p>

			<h3>Custom nodes</h3>
			<p>
				Drop a <code>.nodedef.luau</code> or <code>.nodedef.json</code> in{" "}
				<code>.roswaal/nodes</code>. A pack is data — it is parsed, never run — so a
				pack from anywhere is safe to open. <code>roswaal init</code> writes a
				commented example.
			</p>
		</>
	);
}

function Controls() {
	const rows: [string, string][] = [
		["Right-click canvas", "Node palette, spawns where you clicked"],
		["Drag from a pin", "Make a wire; drop on empty space for the palette"],
		["Drag a wired input", "Pick the existing wire up and rewire it"],
		["Drop a wire on a node", "Grow it a new input and connect to it"],
		["Alt-click a wire", "Cut it"],
		["Middle-drag, or Alt-drag", "Pan"],
		["Wheel", "Zoom about the cursor"],
		["Drag on empty canvas", "Marquee select"],
		["Shift / Ctrl-click", "Add to or toggle the selection"],
		["Drag a variable in", "Get node — hold Ctrl for a Set"],
		["Drag a comment bar", "Moves the comment and everything inside it"],
		["Double-click a comment bar", "Rename it"],
		["Right-click the tree", "Reveal, new folder, rename, delete"],
		["C", "Wrap the selection in a comment"],
		["Ctrl+C / X / V / D", "Copy, cut, paste, duplicate"],
		["Ctrl+Z / Ctrl+Shift+Z", "Undo, redo"],
		["Ctrl+A, Delete", "Select all, delete"],
		["Ctrl+S", "Compile the open document"],
	];

	return (
		<>
			<h3>Controls</h3>
			<table className="help-keys">
				<tbody>
					{rows.map(([key, what]) => (
						<tr key={key}>
							<td>{key}</td>
							<td>{what}</td>
						</tr>
					))}
				</tbody>
			</table>
			<p>
				Comment membership is decided when a drag begins: a node inside the comment
				travels with it, one dragged out is out. There is no membership list to keep
				in step.
			</p>
		</>
	);
}
