/**
 * A `.luau` file in the project, shown properly.
 *
 * Roswaal writes Luau and also lives in a repository full of Luau it did not
 * write. Both kinds turn up in the tree: the generated file is the thing you
 * most want to *read* carefully, and the hand-written one is the thing you
 * most want to *edit*.
 *
 * So it is a real editor view, read-only, using the same tokeniser and the
 * same colours as the pop-out code editor. And it says which kind of file it
 * is, because that changes what you should do with it:
 *
 *  - **generated** — Roswaal owns it. Editing it is temporary; the next compile
 *    wins. The header says so and offers the graph that produced it.
 *  - **hand-written** — yours. Roswaal will not touch it, and **Open in VS
 *    Code** hands it to an editor that can actually change it.
 *
 * Read-only rather than editable on purpose. An editable pane would need a save
 * path, a conflict story with the watcher, and an answer for what happens when
 * a compile overwrites what you typed. Handing the file to the editor you
 * already use is a better answer than a second-rate one built in here.
 */

import { useEffect, useRef, useState } from "react";

import { lintGutter } from "@codemirror/lint";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import type { ModuleInfo } from "../core/luau/hover.js";
import type { TableMember } from "../core/luau/infer.js";
import { indexFromOutline, instanceProblems, type InstanceNode } from "../core/luau/instances.js";
import type { Target } from "../core/schema.js";
import { api } from "./api.js";
import { cx } from "./cx.js";
import { NOT_HERE, useHostCan } from "./host.js";
import { luauExtensions } from "./luauExtensions.js";
import { luauWarnings } from "./luauLint.js";

export interface SourceDoc {
	path: string;
	text: string;
	/** The graph this was compiled from, when Roswaal wrote it. */
	generatedFrom?: string;
}

export interface SourceViewProps {
	doc: SourceDoc;
	/** Opens the graph a generated file came from. */
	onOpenGraph: (path: string) => void;
	/** Hands the file to VS Code, reporting which editor answered. */
	onEdit: (path: string) => void;
	onReveal: (path: string) => void;
}

/**
 * Whether a file is Lune code or Roblox code, for what its hover offers.
 *
 * A Lune program reaches its standard library through `require("@lune/…")`,
 * and a Roblox script cannot, so a file that requires one is Lune. Anything
 * else is read as Roblox, which is what most `.luau` in a project is.
 */
function targetOfSource(text: string): Target {
	return /require\s*\(?\s*["']@lune\//.test(text) ? "lune" : "roblox";
}

export function SourceView({ doc, onOpenGraph, onEdit, onReveal }: SourceViewProps) {
	// Both need a machine: an editor to hand the file to, and a file manager
	// to show it in. Disabled rather than gone -- they describe what the tool
	// does, and their titles say where it does it.
	const canEdit = useHostCan("edit");
	const canReveal = useHostCan("reveal");
	const host = useRef<HTMLDivElement>(null);
	const view = useRef<EditorView | null>(null);
	const [copied, setCopied] = useState(false);

	// Rebuilt when the file changes rather than reconfigured: the document is
	// read-only, so there is no state in here worth preserving across a switch.
	// What the file's `require`s hold, followed by the host: `Flux.new` hovers
	// with the module's own signature and comment. Asked once per file, and
	// read through refs, so the editor is not rebuilt when the answer lands.
	const members = useRef<ReadonlyMap<string, TableMember[]>>(new Map());
	const modules = useRef<ReadonlyMap<string, ModuleInfo>>(new Map());
	// The DataModel the project knows, and where this file is in it: for a
	// name like `Shared` to hover as the instance it is, and a name that is
	// nowhere to be marked. Kept in state, since the marks are drawn from it.
	const [instances, setInstances] = useState<{ root: InstanceNode; self?: string[] } | null>(null);
	const warnings = useRef(new Compartment());
	const instancesRef = useRef(instances);
	instancesRef.current = instances;
	useEffect(() => {
		members.current = new Map();
		modules.current = new Map();
		let live = true;
		Promise.all([api.luauModules(doc.path), api.instances()]).then(([{ modules: found, self }, { outline }]) => {
			if (!live) return;
			members.current = new Map(found.map((m) => [m.name, m.members]));
			modules.current = new Map(found.map((m) => [m.name, m]));
			setInstances({ root: indexFromOutline(outline), ...(self ? { self } : {}) });
		}, () => {
			// The file still shows, highlighted; only the hover on requires and
			// the instance warnings are missing, and they are extras on a view.
		});
		return () => {
			live = false;
		};
	}, [doc.path, doc.text]);

	useEffect(() => {
		if (!host.current) return;
		const instance = new EditorView({
			state: EditorState.create({
				doc: doc.text,
				// Read-only, but focusable: the cursor shows and moves with the
				// arrow keys, and the highlighted line follows it. `editable.of(false)`
				// would hide the cursor, so the line only moved where it was clicked.
				extensions: luauExtensions({
					readOnly: true,
					// The code editor's hover, here too: what every name is and
					// where its Roblox docs page is, in a file that cannot be edited.
					hover: {
						target: () => targetOfSource(doc.text),
						members: () => members.current,
						modules: () => modules.current,
						instances: () => instancesRef.current,
					},
					// Names the place and the project do not have, under the
					// containers that are settled before the game runs: filled in
					// once the host answers, without rebuilding the view.
					extra: [warnings.current.of([])],
				}),
			}),
			parent: host.current,
		});
		view.current = instance;
		return () => {
			instance.destroy();
			view.current = null;
		};
	}, [doc.path, doc.text]);

	useEffect(() => {
		const known = instances;
		view.current?.dispatch({
			effects: warnings.current.reconfigure(known && targetOfSource(doc.text) !== "lune"
				? [lintGutter(), luauWarnings((text) => instanceProblems(text, known.root, known.self))]
				: []),
		});
	}, [instances, doc.text]);

	useEffect(() => {
		if (!copied) return;
		const id = window.setTimeout(() => setCopied(false), 1600);
		return () => window.clearTimeout(id);
	}, [copied]);

	const name = doc.path.split("/").pop() ?? doc.path;
	const generated = doc.generatedFrom !== undefined;
	const lines = doc.text === "" ? 0 : doc.text.split(NEWLINE).length;

	return (
		<div className="source">
			<div className="source-head">
				<span className="name">{name}</span>
				<span className={cx("badge", generated && "generated")}>
					{generated ? "generated" : "hand-written"}
				</span>
				<span className="meta">{lines} lines</span>

				<span style={{ flex: 1 }} />

				{generated ? (
					<button
						className="tb"
						title="Open the graph this was compiled from"
						onClick={() => onOpenGraph(doc.generatedFrom!)}
					>
						Open the graph
					</button>
				) : (
					<button
						className="tb primary"
						disabled={!canEdit}
						title={canEdit ? "Hand this file to VS Code" : NOT_HERE}
						onClick={() => onEdit(doc.path)}
					>
						Open in VS Code
					</button>
				)}
				<button
					className="tb"
					disabled={!canReveal}
					title={canReveal ? undefined : NOT_HERE}
					onClick={() => onReveal(doc.path)}
				>
					Show in folder
				</button>
				<button
					className="tb"
					onClick={() => {
						void navigator.clipboard.writeText(doc.text).then(
							() => setCopied(true),
							// A refused clipboard is not worth a dialog: the text is
							// selectable and Ctrl+C is right there.
							() => undefined,
						);
					}}
				>
					{copied ? "Copied" : "Copy"}
				</button>
			</div>

			<p className="source-note">
				{generated ? (
					<>
						Roswaal writes this file. Anything you change here is replaced by the next
						compile — edit the graph instead.
					</>
				) : (
					<>
						Roswaal does not touch this file. It is read-only here so nothing can be
						changed by accident; open it in your editor to work on it.
					</>
				)}
			</p>

			<div className="source-body" ref={host} />
		</div>
	);
}

/** Written as a code unit so the escape survives the build. */
const NEWLINE = String.fromCharCode(10);
