/**
 * Where a keyboard shortcut must not fire.
 *
 * Both graph canvases, the editor's and Node Design's, listen for keys on the
 * whole window, so every key typed anywhere reaches them. The check used to
 * cover text fields only. A `<select>` was missed: the Inspector has a dozen,
 * and type-ahead in one added comments, aligned nodes, or with Backspace
 * deleted the node being inspected. A dialog was missed too, so Ctrl+Z undid
 * the graph behind a question about it.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")
		return true;
	return target.closest('[role="dialog"]') !== null;
}

/** Inputs that take no typing: Ctrl+Z on one is an undo of the place, not of the field. */
const UNTYPED = new Set([
	"checkbox",
	"radio",
	"button",
	"submit",
	"reset",
	"color",
	"range",
	"file",
]);

/**
 * Where text is typed, which keeps its own Ctrl+Z, or a dialog. Narrower than
 * `isEditableTarget`: a picked list or a ticked box has no undo of its own.
 */
export function isTextEntry(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable || target.tagName === "TEXTAREA") return true;
	if (target instanceof HTMLInputElement && !UNTYPED.has(target.type)) return true;
	return target.closest('[role="dialog"]') !== null;
}

/** The keys a key event needs, so a test can make one without a DOM. */
export interface KeyPress {
	key: string;
	shiftKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
	metaKey: boolean;
}

/**
 * Whether a key takes the highlighted suggestion in a list.
 *
 * Enter does, and so does a plain Tab, as in a code editor. Shift+Tab does not:
 * it still walks focus back. Each list checks that something is highlighted
 * before it takes Tab, so with nothing to take, Tab moves focus on as usual.
 */
export function acceptsSuggestion(e: KeyPress): boolean {
	if (e.key === "Enter") return true;
	return e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;
}
