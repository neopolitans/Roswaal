/**
 * The CodeMirror setup every Luau editor in the tool shares.
 *
 * Three editors show Luau -- the pop-out code editor, the read-only source view
 * and Node Design's logic field -- and each built its own list of extensions,
 * so a keymap fixed in one stayed broken in the others. This builds the list
 * from what an editor wants, in the one order that works: completion and the
 * bracket keymap ahead of `indentWithTab`, the theme after the language.
 *
 * Not the language itself (`luauMode.ts`), nor the checks (`luauLint.ts`), the
 * hover (`luauHover.ts`) or completion (`luauCompletions.ts`): those are passed
 * in, so each editor still decides what it checks and what it offers.
 */

import {
	autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type CompletionSource,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import { lintGutter } from "@codemirror/lint";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";

import type { TableMember } from "../core/luau/infer.js";
import type { ModuleInfo } from "../core/luau/hover.js";
import type { InstanceNode } from "../core/luau/instances.js";
import type { Target } from "../core/schema.js";
import { luauHover } from "./luauHover.js";
import { luauLint, luauWarnings, type LuauChecker } from "./luauLint.js";
import { luauLanguage } from "./luauMode.js";
import { luauSignature } from "./luauSignature.js";
import { editorTheme, luauHighlight } from "./luauTheme.js";

/**
 * What the code around the editor knows, read through getters so the editor is
 * built once and still sees answers that arrive later.
 */
export interface LuauContext {
	target: () => Target;
	/** Table members by name: the graph's own, and what its requires hold. */
	members?: () => ReadonlyMap<string, TableMember[]>;
	/** What each require resolves to, for a hover on the module's members. */
	modules?: () => ReadonlyMap<string, ModuleInfo>;
	/** The DataModel the project knows, and where this code runs from. */
	instances?: () => { root: InstanceNode; self?: string[] } | null;
}

export interface LuauExtensionOptions {
	/**
	 * A view rather than an editor: focusable, so the cursor shows and the
	 * arrow keys move it, but typing is refused and a tablet's keyboard stays
	 * shut. No history, brackets or completion.
	 */
	readOnly?: boolean;
	/** What completion offers. Absent, there is none. */
	completion?: CompletionSource;
	/** Errors: squiggles, gutter markers and tinted lines. */
	lint?: LuauChecker;
	/** Warnings, drawn in the same layers as `lint` in their own colour. */
	warnings?: LuauChecker;
	/**
	 * The lint gutter beside the line numbers. On whenever there is a check,
	 * unless a narrow field would rather keep the width.
	 */
	gutter?: boolean;
	/** Hover on every name, from this context. */
	hover?: LuauContext;
	/** The signature of the call being typed. Needs `hover`'s context. */
	signature?: boolean;
	/** Each change to the document, as text. */
	onChange?: (text: string) => void;
	/** Anything else, after all of the above: a compartment, a theme tweak. */
	extra?: Extension[];
}

/** The extensions for one Luau editor. */
export function luauExtensions(options: LuauExtensionOptions = {}): Extension[] {
	const { readOnly = false, completion, lint, warnings, hover, signature, onChange } = options;
	const gutter = options.gutter ?? Boolean(lint || warnings);
	const extensions: Extension[] = [lineNumbers()];
	if (gutter) extensions.push(lintGutter());
	extensions.push(highlightActiveLine());

	if (readOnly) {
		extensions.push(
			EditorState.readOnly.of(true),
			EditorView.contentAttributes.of({ inputmode: "none" }),
		);
	} else {
		extensions.push(history(), closeBrackets());
		if (completion) extensions.push(autocompletion({ override: [completion], icons: false }));
		// Completion and bracket keymaps first: they only claim keys while
		// they are actually active, and indentWithTab must not shadow them.
		extensions.push(keymap.of([
			...closeBracketsKeymap,
			...completionKeymap,
			...defaultKeymap,
			...historyKeymap,
			indentWithTab,
		]));
	}

	extensions.push(luauLanguage, syntaxHighlighting(luauHighlight));
	if (lint) extensions.push(luauLint(lint));
	if (hover) {
		extensions.push(luauHover(hover.target, hover.members, hover.modules, hover.instances));
		if (signature) extensions.push(luauSignature(hover.target, hover.members));
	}
	if (warnings) extensions.push(luauWarnings(warnings));
	extensions.push(editorTheme);
	if (onChange) {
		extensions.push(EditorView.updateListener.of((update) => {
			if (update.docChanged) onChange(update.state.doc.toString());
		}));
	}
	extensions.push(...(options.extra ?? []));
	return extensions;
}
