/**
 * An inline Luau field, for a node's logic.
 *
 * The pop-out `CodeEditor` is a dialog: it holds a draft and hands it back on
 * Done. The designer's logic panel is not a dialog — the node on the canvas and
 * its template are one thing being edited, and a problem about `$in.force`
 * should update as you type it. So this is the same CodeMirror setup, the same
 * highlighting and the same balance check, without the modal around it.
 *
 * ## A value that changes underneath it
 *
 * Renaming a pin rewrites the template that reads it, so the document can change
 * from outside the editor. Mounted once, it takes a new `value` by replacing its
 * document when the two differ — which also means its own edits, echoed back
 * through the parent, change nothing.
 */

import { useEffect, useRef } from "react";

import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type CompletionContext } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";

import { checkLuauBalance } from "../../core/luauCheck.js";
import { luauLint } from "../luauLint.js";
import { luauLanguage } from "../luauMode.js";
import { editorTheme, luauHighlight } from "../luauTheme.js";

export interface LuauFieldProps {
	value: string;
	onChange: (value: string) => void;
	/** Placeholders to offer after a `$`: the node's own pins, and the folds. */
	placeholders: string[];
}

export function LuauField({ value, onChange, placeholders }: LuauFieldProps) {
	const host = useRef<HTMLDivElement>(null);
	const view = useRef<EditorView | null>(null);
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const placeholdersRef = useRef(placeholders);
	placeholdersRef.current = placeholders;

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
				extensions: [
					lineNumbers(),
					highlightActiveLine(),
					history(),
					closeBrackets(),
					autocompletion({ override: [source], icons: false }),
					keymap.of([...closeBracketsKeymap, ...completionKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
					luauLanguage,
					syntaxHighlighting(luauHighlight),
					luauLint(checkLuauBalance),
					editorTheme,
					EditorView.theme({ "&": { height: "100%" }, ".cm-scroller": { overflow: "auto" } }),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) onChangeRef.current(update.state.doc.toString());
					}),
				],
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
