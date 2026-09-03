/**
 * A pop-out Luau editor for the nodes that hold raw code.
 *
 * A one-line text input is fine for a service name and hopeless for a block of
 * Luau, which is what Custom Code exists to hold. This gives it syntax
 * highlighting, real line breaks, and the structural check that runs on every
 * compile — shown here as you type, so a stray `end` is caught in the box you
 * typed it in rather than in the generated file.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { EditorState } from "@codemirror/state";
import {
	EditorView, keymap, lineNumbers, highlightActiveLine,
} from "@codemirror/view";
import {
	closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap,
	type Completion,
} from "@codemirror/autocomplete";
import { lintGutter } from "@codemirror/lint";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

import type { NodeScript } from "../core/schema.js";
import { checkLuauBalance } from "../core/luauCheck.js";
import { errorLineHighlight, luauLinter } from "./luauLint.js";
import { luauLanguage } from "./luauMode.js";
import { luauCompletionSource, scopeCompletions } from "./luauCompletions.js";
import { LAYER } from "./layers.js";

/**
 * Colours are taken from CSS variables so the editor follows the app's theme
 * rather than shipping its own light and dark palettes.
 */
const luauHighlight = HighlightStyle.define([
	{ tag: tags.keyword, color: "var(--code-keyword)" },
	{ tag: tags.string, color: "var(--code-string)" },
	{ tag: tags.number, color: "var(--code-number)" },
	{ tag: tags.comment, color: "var(--code-comment)", fontStyle: "italic" },
	{ tag: tags.operator, color: "var(--code-operator)" },
	{ tag: tags.variableName, color: "var(--fg)" },
	{ tag: tags.propertyName, color: "var(--code-property)" },
	{ tag: tags.bool, color: "var(--code-keyword)" },
	// Luau's own globals read as part of the language rather than as names the
	// author chose, so they are tinted apart from ordinary variables.
	{ tag: tags.standard(tags.variableName), color: "var(--code-global)" },
	{ tag: tags.function(tags.variableName), color: "var(--code-function)" },
	{ tag: tags.bracket, color: "var(--fg-muted)" },
	{ tag: tags.punctuation, color: "var(--fg-muted)" },
]);

const editorTheme = EditorView.theme({
	"&": { fontSize: "12px", height: "100%", backgroundColor: "var(--bg-canvas)" },
	".cm-content": { fontFamily: '"Cascadia Mono", Consolas, monospace', padding: "10px 0" },
	".cm-gutters": {
		backgroundColor: "var(--bg-panel)",
		color: "var(--fg-faint)",
		border: "none",
		borderRight: "1px solid var(--border)",
	},
	".cm-activeLine": { backgroundColor: "var(--bg-hover)" },
	"&.cm-focused": { outline: "none" },
	".cm-cursor": { borderLeftColor: "var(--fg)" },
	".cm-selectionBackground, ::selection": { backgroundColor: "var(--bg-active)" },
});

export interface CodeEditorProps {
	title: string;
	value: string;
	/** One line of context, e.g. what the code is spliced into. */
	hint?: string;
	/** The open graph, so completion can offer the names it puts in scope. */
	script: NodeScript | null;
	onCommit: (value: string) => void;
	onClose: () => void;
}

export function CodeEditor({ title, value, hint, script, onCommit, onClose }: CodeEditorProps) {
	const host = useRef<HTMLDivElement>(null);
	const view = useRef<EditorView | null>(null);
	const [text, setText] = useState(value);

	const problems = useMemo(() => checkLuauBalance(text), [text]);
	// Recomputed only when the graph changes, and read through a ref so the
	// editor is built once rather than torn down on every keystroke.
	const scope = useMemo(() => scopeCompletions(script), [script]);
	const scopeRef = useRef<Completion[]>(scope);
	scopeRef.current = scope;

	useEffect(() => {
		if (!host.current) return;

		const state = EditorState.create({
			doc: value,
			extensions: [
				lineNumbers(),
				lintGutter(),
				highlightActiveLine(),
				history(),
				closeBrackets(),
				autocompletion({
					override: [luauCompletionSource(() => scopeRef.current)],
					icons: false,
				}),
				// Completion and bracket keymaps first: they only claim keys while
				// they are actually active, and indentWithTab must not shadow them.
				keymap.of([
					...closeBracketsKeymap,
					...completionKeymap,
					...defaultKeymap,
					...historyKeymap,
					indentWithTab,
				]),
				luauLanguage,
				syntaxHighlighting(luauHighlight),
				// The same structural check that runs on every compile, shown here
				// as you type so a stray `end` is caught in the box you typed it in.
				luauLinter,
				errorLineHighlight,
				editorTheme,
				EditorView.updateListener.of((update) => {
					if (update.docChanged) setText(update.state.doc.toString());
				}),
			],
		});

		const instance = new EditorView({ state, parent: host.current });
		view.current = instance;
		instance.focus();
		return () => {
			instance.destroy();
			view.current = null;
		};
		// Mounted once per open; `value` is the initial document by design.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
			// Ctrl+Enter commits, because Enter has to stay a newline in here.
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				onCommit(text);
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [text, onCommit, onClose]);

	return (
		<div className="code-backdrop" style={{ zIndex: LAYER.menu }} onPointerDown={onClose}>
			<div className="code-modal" onPointerDown={(e) => e.stopPropagation()}>
				<div className="code-head">
					<span className="title">{title}</span>
					{hint && <span className="hint">{hint}</span>}
					<span style={{ flex: 1 }} />
					<button className="tb" onClick={onClose}>
						Cancel
					</button>
					<button className="tb primary" onClick={() => onCommit(text)}>
						Done
					</button>
				</div>

				<div className="code-body" ref={host} />

				<div className={`code-status${problems.length ? " bad" : ""}`}>
					{problems.length === 0 ? (
						<span>Balanced. Inserted into the generated Luau exactly as written.</span>
					) : (
						<span>
							{problems[0].message} <span className="where">line {problems[0].line}</span>
							{problems.length > 1 && ` (+${problems.length - 1} more)`}
						</span>
					)}
					<span style={{ flex: 1 }} />
					<span className="keys">Ctrl+Enter to apply · Esc to cancel</span>
				</div>
			</div>
		</div>
	);
}
