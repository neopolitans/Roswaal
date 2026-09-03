/**
 * Lint feedback for the Custom Code editor.
 *
 * Three layers, deliberately, because each answers a different question at a
 * different distance: the gutter marker says *there is* a problem, the tinted
 * line says *which line*, and the squiggle plus its tooltip say *what*. Only
 * the last of those survives being glanced at from across a screen, which is
 * why the other two exist.
 *
 * All three come from the same `checkLuauBalance` the compiler runs, so the
 * editor cannot disagree with the build.
 */

import { linter, type Diagnostic as LintDiagnostic } from "@codemirror/lint";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
	Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate,
} from "@codemirror/view";

import { checkLuauBalance } from "../core/luauCheck.js";

/** Squiggles and gutter markers, with the message on hover. */
export const luauLinter: Extension = linter((view): LintDiagnostic[] => {
	const length = view.state.doc.length;
	return checkLuauBalance(view.state.doc.toString()).map((problem) => ({
		from: Math.min(problem.from, length),
		to: Math.min(problem.to, length),
		severity: "error",
		message: problem.message,
	}));
});

const errorLine = Decoration.line({ class: "cm-errorLine" });

function errorLines(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const doc = view.state.doc;

	// One decoration per line, in ascending order: a RangeSetBuilder will not
	// accept them any other way, and two problems often share a line.
	const lines = new Set<number>();
	for (const problem of checkLuauBalance(doc.toString())) {
		lines.add(doc.lineAt(Math.min(problem.from, doc.length)).number);
	}
	for (const number of [...lines].sort((a, b) => a - b)) {
		builder.add(doc.line(number).from, doc.line(number).from, errorLine);
	}
	return builder.finish();
}

/** A wash of colour across any line carrying a problem. */
export const errorLineHighlight: Extension = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = errorLines(view);
		}

		update(update: ViewUpdate) {
			if (update.docChanged) this.decorations = errorLines(update.view);
		}
	},
	{ decorations: (plugin) => plugin.decorations },
);
