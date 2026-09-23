/**
 * A `.luau` file in the project, shown properly.
 *
 * Roswaal writes Luau and also lives in a repository full of Luau it did not
 * write. Both kinds turn up in the tree and both used to open as an
 * unhighlighted `<pre>` — which is a dead end twice over: the generated file is
 * the thing you most want to *read* carefully, and the hand-written one is the
 * thing you most want to *edit*, and the view offered neither.
 *
 * So it is a real editor view now, read-only, using the same tokeniser and the
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

import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { syntaxHighlighting } from "@codemirror/language";

import { luauLanguage } from "./luauMode.js";
import { luauHover } from "./luauHover.js";
import type { Target } from "../core/schema.js";
import { NOT_HERE, useHostCan } from "./host.js";
import { editorTheme, luauHighlight } from "./luauTheme.js";

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
	useEffect(() => {
		if (!host.current) return;
		const instance = new EditorView({
			state: EditorState.create({
				doc: doc.text,
				extensions: [
					lineNumbers(),
					highlightActiveLine(),
					// Read-only, but focusable: the text cursor shows and moves with
					// the arrow keys, Page Up/Down and Home/End, and the highlighted
					// line follows it. `editable.of(false)` hid the cursor, so the
					// line only moved where the file was clicked. Typing is still
					// refused by `readOnly`, and `inputmode="none"` keeps a tablet's
					// on-screen keyboard from opening for text that takes no input.
					EditorState.readOnly.of(true),
					EditorView.contentAttributes.of({ inputmode: "none" }),
					luauLanguage,
					syntaxHighlighting(luauHighlight),
					editorTheme,
					// The code editor's hover, here too: what every name is and
					// where its Roblox docs page is, in a file that cannot be edited.
					luauHover(() => targetOfSource(doc.text)),
				],
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
				<span className={`badge${generated ? " generated" : ""}`}>
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
