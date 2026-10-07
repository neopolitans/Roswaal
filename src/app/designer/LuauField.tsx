/**
 * An inline Luau field, for a node's logic.
 *
 * The editor's Code panel applies a field to the graph when typing pauses.
 * The designer's logic panel is more direct still — the node on the canvas and
 * its template are one thing being edited, and a problem about `$in.force`
 * should update as you type it. So this is the same CodeMirror setup, the same
 * highlighting and the same parse the compiler runs, inline in the panel. The template's placeholders are read as names of their own length, so a
 * problem is still marked where it is written.
 *
 * ## A value that changes underneath it
 *
 * Renaming a pin rewrites the template that reads it, so the document can change
 * from outside the editor. Mounted once, it takes a new `value` by replacing its
 * document when the two differ — which also means its own edits, echoed back
 * through the parent, change nothing.
 */

import type { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";

import { checkTemplate, type LuauFragment } from "../../core/luau/check.js";
import { luauExtensions } from "../luauExtensions.js";

export interface LuauFieldProps {
	value: string;
	onChange: (value: string) => void;
	/** Placeholders to offer after a `$`: the node's own pins, and the folds. */
	placeholders: string[];
	/**
	 * Whether the template is statements or one value. Left out, either is
	 * accepted.
	 */
	kind?: LuauFragment;
}

export function LuauField({ value, onChange, placeholders, kind }: LuauFieldProps) {
	const host = useRef<HTMLDivElement>(null);
	const view = useRef<EditorView | null>(null);
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const placeholdersRef = useRef(placeholders);
	placeholdersRef.current = placeholders;
	// Read by the lint on every pass, so a node switched between pure and
	// impure is checked as what it is now without rebuilding the editor.
	const kindRef = useRef(kind);
	kindRef.current = kind;

	useEffect(() => {
		if (!host.current) return;
		const source = (context: CompletionContext) => {
			const word = context.matchBefore(/\$[A-Za-z_.(]*/);
			if (!word || (word.from === word.to && !context.explicit)) return null;
			return {
				from: word.from,
				options: placeholdersRef.current.map((label) => ({ label, type: "variable" })),
			};
		};

		const instance = new EditorView({
			parent: host.current,
			state: EditorState.create({
				doc: value,
				extensions: luauExtensions({
					completion: source,
					lint: (text) => checkTemplate(text, kindRef.current),
					gutter: false,
					onChange: (text) => onChangeRef.current(text),
					extra: [
						EditorView.theme({ "&": { height: "100%" }, ".cm-scroller": { overflow: "auto" } }),
					],
				}),
			}),
		});
		view.current = instance;
		return () => {
			instance.destroy();
			view.current = null;
		};
		// Built once; `value` is followed by the effect below.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		const current = view.current;
		if (!current || current.state.doc.toString() === value) return;
		current.dispatch({ changes: { from: 0, to: current.state.doc.length, insert: value } });
	}, [value]);

	return <div className="luau-field" ref={host} />;
}
