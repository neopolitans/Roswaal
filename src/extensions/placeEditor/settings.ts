/**
 * The Place Editor's settings, declared for Settings to draw, and typed for the
 * code that reads them.
 *
 * Each was a field of the editor's `Preferences` before the viewer was an
 * extension; `legacy` names it, so the first read carries it over.
 */

import type { SettingGroup } from "../manifest.js";

/** The place's selection outline, by name, in CSS pixels. */
export const OUTLINE_WIDTHS = { thin: 2, medium: 3.5, thick: 5 } as const;
export type OutlineWidth = keyof typeof OUTLINE_WIDTHS;

/** What draws the place in 3D, by name. */
export const VIEWPORT_RENDERERS = [
	{ value: "auto", label: "Automatic" },
	{ value: "webgpu", label: "WebGPU" },
	{ value: "webgl2", label: "WebGL2" },
] as const;
export type ViewportRenderer = (typeof VIEWPORT_RENDERERS)[number]["value"];

/**
 * How often the place is drawn, at most, while it moves: frames a second, the
 * display's own rate, or as fast as it will go. It is drawn only when it
 * changes either way.
 */
export const VIEWPORT_FRAME_RATES = [
	{ value: "24", label: "24" },
	{ value: "30", label: "30" },
	{ value: "60", label: "60" },
	{ value: "120", label: "120" },
	{ value: "144", label: "144" },
	{ value: "165", label: "165" },
	{ value: "180", label: "180" },
	{ value: "240", label: "240" },
	{ value: "vsync", label: "VSync" },
	{ value: "unlimited", label: "Unlimited" },
] as const;
export type ViewportFrameRate = (typeof VIEWPORT_FRAME_RATES)[number]["value"];

/** The settings as the viewer reads them. */
export interface PlaceEditorSettings {
	renderer: ViewportRenderer;
	frameRate: ViewportFrameRate;
	outlineWidth: OutlineWidth;
	/** The outline shows through what is in front of it, as Studio's does. */
	outlineThrough: boolean;
	/** Alt and a click picks one Model further in each time, rather than the part. */
	altClickSteps: boolean;
	/** See-through Glass hides the see-through parts behind it, as Studio's does. */
	glassHides: boolean;
	/** The place's own post effects are drawn. */
	postEffects: boolean;
}

/** Settings › Scene view. */
export const SCENE_VIEW: readonly SettingGroup[] = [
	{
		title: "Renderer",
		settings: [
			{
				key: "renderer",
				legacy: "viewportRenderer",
				title: "Renderer",
				help: "Automatic draws with WebGPU where the browser has it, and WebGL2 where it does not. WebGPU falls back to WebGL2 where there is none.",
				type: "choice",
				default: "auto",
				choices: VIEWPORT_RENDERERS,
			},
			{
				key: "frameRate",
				legacy: "viewportFrameRate",
				title: "Frame rate",
				help: "The most the view is drawn a second while it moves. VSync matches the display; Unlimited draws as fast as it can. The view is drawn only when something changes.",
				type: "choice",
				default: "vsync",
				choices: VIEWPORT_FRAME_RATES,
			},
		],
	},
	{
		title: "Selection",
		settings: [
			{
				key: "outlineWidth",
				legacy: "outlineWidth",
				title: "Selection outline",
				help: "How wide the outline round what is picked is drawn.",
				type: "choice",
				default: "medium",
				choices: [
					{ value: "thin", label: "Thin" },
					{ value: "medium", label: "Medium" },
					{ value: "thick", label: "Thick" },
				],
			},
			{
				key: "outlineThrough",
				legacy: "outlineThrough",
				title: "Hidden edges",
				help: "Whether the outline shows through the parts in front of it, as Studio's does.",
				type: "boolean",
				default: true,
				on: "Shown through parts",
				off: "Hidden by parts in front",
			},
			{
				key: "altClickSteps",
				legacy: "altClickSteps",
				title: "Alt-click",
				help: "What Alt and a click on a part picks, and a long press: the part, as in Studio, or one Model further in each time. Shift and a click always picks the part.",
				type: "boolean",
				default: false,
				on: "Steps in a Model at a time",
				off: "Picks the part",
			},
		],
	},
	{
		title: "Transparency",
		settings: [
			{
				key: "glassHides",
				legacy: "glassHides",
				title: "Glass",
				help: "Whether see-through Glass hides the see-through parts behind it, as Studio's does. Places are often built around it.",
				type: "boolean",
				default: true,
				on: "Hides see-through parts behind it",
				off: "Shows them through it",
			},
		],
	},
	{
		title: "Post effects",
		settings: [
			{
				key: "postEffects",
				legacy: "postEffects",
				title: "Post effects",
				help: "The place's own ColorCorrection and Blur, under Lighting or its Camera. Off shows the place as it is underneath.",
				type: "boolean",
				default: true,
				on: "Drawn",
				off: "Not drawn",
			},
		],
	},
];
