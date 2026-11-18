/**
 * The place viewer's tools, by the bar's order and Studio's keys, and what
 * each leaves the pointer to do. Select can be put down, as in Studio: with
 * no tool the view only moves the camera.
 */

export const TOOLS = [
	["select", "Select", "1"],
	["move", "Move", "2"],
	["rotate", "Rotate", "3"],
	["scale", "Scale", "4"],
] as const;
export type Tool = (typeof TOOLS)[number][0];

/** The tool a key chooses, by the bar's order, or undefined. */
export function toolForKey(key: string): Tool | undefined {
	return TOOLS.find(([, , k]) => k === key)?.[0];
}

/**
 * The tool left active when `chosen` is chosen, by its key or its button:
 * Select again puts it down; the editing tools wait on `editable`.
 */
export function toolAfter(current: Tool | null, chosen: Tool, editable: boolean): Tool | null {
	if (chosen === "select") return current === "select" ? null : "select";
	return editable ? chosen : current;
}

/** Whether `tool` shows handles round what is picked. */
export function showsHandles(tool: Tool | null): boolean {
	return tool === "move" || tool === "rotate" || tool === "scale";
}

/** Whether a click, a box or the hover outline picks anything: never with no tool. */
export function picks(tool: Tool | null): boolean {
	return tool !== null;
}

export type DragMode = "orbit" | "look" | "pan" | "box" | "none";

/**
 * What a press drags. A mouse's left-drag draws a box, or orbits with Alt;
 * with no tool it does nothing but Alt's orbit. Right-drag looks, middle-drag
 * or Shift and a right-drag pans, and a finger orbits, or pans with Shift.
 */
export function dragMode(
	press: { button: number; pointerType: string; shiftKey: boolean; altKey: boolean },
	tool: Tool | null,
): DragMode {
	if (press.button === 1) return "pan";
	if (press.button === 2) return press.shiftKey ? "pan" : "look";
	if (press.pointerType !== "mouse") return press.shiftKey ? "pan" : "orbit";
	if (press.altKey) return "orbit";
	return picks(tool) ? "box" : "none";
}
