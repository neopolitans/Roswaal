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
