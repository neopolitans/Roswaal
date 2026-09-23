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
import { syntaxHighlighting } from "@codemirror/language";

import type { NodeScript } from "../core/schema.js";
import type { Registry } from "../core/nodes/index.js";
import { checkLuau, type LuauFragment } from "../core/luau/check.js";
import { luauLint } from "./luauLint.js";
import { luauHover } from "./luauHover.js";
import { luauSignature } from "./luauSignature.js";
import { luauLanguage } from "./luauMode.js";
import {
	luauCompletionSource, precedingLocals, scopeCompletions,
} from "./luauCompletions.js";
import { LAYER } from "./layers.js";
import { editorTheme, luauHighlight } from "./luauTheme.js";

export interface CodeEditorProps {
	title: string;
	value: string;
	/** One line of context, e.g. what the code is spliced into. */
	hint?: string;
	/** What the text must parse as; worked out from the node when absent. */
	kind?: LuauFragment;
	/** The open graph, so completion can offer the names it puts in scope. */
	script: NodeScript | null;
	registry: Registry;
	/** The node being edited, so locals from earlier blocks can be found. */
	nodeId: string | null;
	onCommit: (value: string) => void;
	onClose: () => void;
}

export function CodeEditor({
	title, value, hint, kind: given, script, registry, nodeId, onCommit, onClose,
}: CodeEditorProps) {
	const host = useRef<HTMLDivElement>(null);
	const view = useRef<EditorView | null>(null);
	const [text, setText] = useState(value);

	// Custom Code is statements; a Luau Expression, or code typed into any
	// other pin, is one value. The compiler parses each the same way.
	const kind: LuauFragment = given
		?? (script?.nodes.find((n) => n.id === nodeId)?.def === "code.custom" ? "block" : "expression");
	const problems = useMemo(() => checkLuau(text, kind), [text, kind]);
	// Recomputed only when the graph changes, and read through a ref so the
	// editor is built once rather than torn down on every keystroke.
	const scope = useMemo(
		() => [...precedingLocals(script, registry, nodeId), ...scopeCompletions(script)],
		[script, registry, nodeId],
	);
	const scopeRef = useRef<Completion[]>(scope);
	scopeRef.current = scope;
	// Roblox classes and datatypes are offered only in a graph that compiles
	// for Roblox. Read through a ref for the same reason as the scope.
	const targetRef = useRef(script?.target ?? "roblox");
	targetRef.current = script?.target ?? "roblox";

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
					override: [luauCompletionSource(() => scopeRef.current, () => targetRef.current)],
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
				luauLint((code) => checkLuau(code, kind)),
				luauHover(() => targetRef.current),
				luauSignature(() => targetRef.current),
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
						<span>Reads as Luau. Inserted into the generated file exactly as written.</span>
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
