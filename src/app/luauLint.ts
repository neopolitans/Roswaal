/**
 * Lint feedback for the code editors.
 *
 * Three layers, deliberately, because each answers a different question at a
 * different distance: the gutter marker says *there is* a problem, the tinted
 * line says *which line*, and the squiggle plus its tooltip say *what*. Only
 * the last of those survives being glanced at from across a screen, which is
 * why the other two exist.
 *
 * Each editor passes the check it wants. Custom Code and Luau Expression use
 * `checkLuau`, the parse the compiler runs, so the editor cannot disagree
 * with the build. Node Design's logic field keeps the bracket balance check:
 * its templates hold `$in.name` placeholders, which are not Luau until they
 * are filled in.
 */

import { linter, type Diagnostic as LintDiagnostic } from "@codemirror/lint";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
	Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate,
} from "@codemirror/view";

/** What a check reports: the same shape from the parser and the balance check. */
export type LuauChecker = (text: string) => { message: string; from: number; to: number }[];

/** Squiggles, gutter markers and tinted lines, all from one check. */
export function luauLint(check: LuauChecker): Extension {
	return [lintMarks(check), errorLineHighlight(check)];
}

/** Squiggles and gutter markers, with the message on hover. */
function lintMarks(check: LuauChecker): Extension {
	return linter((view): LintDiagnostic[] => {
		const length = view.state.doc.length;
		return check(view.state.doc.toString()).map((problem) => ({
			from: Math.min(problem.from, length),
			to: Math.min(problem.to, length),
			severity: "error",
			message: problem.message,
		}));
	});
}

const errorLine = Decoration.line({ class: "cm-errorLine" });

function errorLines(view: EditorView, check: LuauChecker): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const doc = view.state.doc;

	// One decoration per line, in ascending order: a RangeSetBuilder will not
	// accept them any other way, and two problems often share a line.
	const lines = new Set<number>();
	for (const problem of check(doc.toString())) {
		lines.add(doc.lineAt(Math.min(problem.from, doc.length)).number);
	}
	for (const number of [...lines].sort((a, b) => a - b)) {
		builder.add(doc.line(number).from, doc.line(number).from, errorLine);
	}
	return builder.finish();
}

/** A wash of colour across any line carrying a problem. */
function errorLineHighlight(check: LuauChecker): Extension {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = errorLines(view, check);
			}

			update(update: ViewUpdate) {
				if (update.docChanged) this.decorations = errorLines(update.view, check);
			}
		},
		{ decorations: (plugin) => plugin.decorations },
	);
}
