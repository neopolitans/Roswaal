/**
 * What both renderers do, so the viewport does not know which it has: draw a
 * view, outline what is selected, say what is under a pixel, and follow the
 * canvas when it changes size.
 */

import type { LightingParams } from "../../core/rbx/lighting.js";
import type { PlaceScene } from "../../core/rbx/scene.js";
import type { Handles } from "./handles.js";

export interface Camera {
	eye: number[];
	at: number[];
	/** The nearest the view sees: a little, in proportion to how far out the camera is. */
	near: number;
	/** How far the view reaches: well past anything in a place, as Studio's does. */
	far: number;
}

export interface ViewRenderer {
	readonly backend: "WebGPU" | "WebGL2";
	init(canvas: HTMLCanvasElement, scene: PlaceScene): Promise<void>;
	resize(width: number, height: number): void;
	/** The instances to outline, in the scene's own 14-word layout. */
	setSelection(boxes: Float32Array): void;
	/** Coloured lines over everything -- a tool's handles: x, y, z, r, g, b for each end. */
	setOverlay(lines: Float32Array): void;
	/** The tool's handles, as solid shapes drawn in front of everything. */
	setHandles(handles: Handles): void;
	/** The place's light: Lighting, its Atmosphere and its Sky. */
	setLighting(lighting: LightingParams): void;
	/** The place drawn again, after an instance is added. */
	setScene(scene: PlaceScene): void;
	draw(camera: Camera): void;
	/** The instance id under a pixel, or -1 for the sky. */
	pick(camera: Camera, x: number, y: number): Promise<number>;
	/** Gives the GPU back: a browser keeps only so many contexts. */
	destroy(): void;
}

export const FOV = (70 * Math.PI) / 180;
/** How much of a handle shows while it is not held: the place shows through it. */
export const HANDLE_ALPHA = 0.6;

/** How wide the outline round what is picked is drawn, in CSS pixels. */
export const SELECT_WIDTH = 2.5;

/** Studio's selection blue, as the outline round what is picked. */
export const SELECT: [number, number, number] = [0.05, 0.6, 1];
