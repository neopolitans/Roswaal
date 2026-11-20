/**
 * The Place Editor's pages of the documentation: the extension that draws the
 * place in 3D. `buildSite` gathers them into a section of their own, which
 * the contents leave out while the extension is off.
 *
 * One page per task rather than one page of everything: what it is, moving
 * round and picking, editing, what it draws, and one page for each of its
 * three panels. Editing the DataModel is Roswaal's own, on *Editing a place*,
 * and works with the extension off.
 */

import type { DocPage } from "../site.js";

/** The section's first page: what the Place Editor is, and the way to its other pages. */
export function placeIn3dPage(): DocPage {
	return {
		slug: "place-in-3d",
		narrow: true,
		title: "The Place Editor",
		summary: "Your place drawn in 3D, in a tab of its own: an extension you can turn off.",
		blocks: [
			{
				t: "p",
				text:
					"The **Place Editor** draws the place in 3D, in a tab of its own. It is an " +
					"[extension](extensions), with its own version. Browsing and editing the place's " +
					"instances, on [Editing a place](editing-a-place), works without it.",
			},
			{ t: "h", level: 2, text: "Opening the place" },
			{
				t: "p",
				text:
					"Open the place from **Files**, or with its row at the top of **DataModel**. Workspace " +
					"opens in its own tab, lit by the place's Lighting and Atmosphere, with Studio's saved " +
					"camera drawn in yellow. While it is in front, only DataModel and Properties show, and " +
					"Properties describes the place until you pick something.",
			},
			{ t: "h", level: 2, text: "In this section" },
			{
				t: "table",
				head: ["Page", "Covers"],
				rows: [
					[
						"[Moving and picking](place-editor-moving)",
						"The camera, picking, and the keys for both",
					],
					[
						"[Editing in 3D](place-editor-editing)",
						"Moving, turning and setting down parts, snaps, saving",
					],
					[
						"[What it draws](place-editor-drawing)",
						"Materials, assets, lights, shadows and effects",
					],
					[
						"[The Rendering panel](place-editor-rendering)",
						"How the view is drawn, and views of what it costs",
					],
					[
						"[The Performance panel](place-editor-performance)",
						"Frame times and the last frame's counts",
					],
					[
						"[The Mesh Debug panel](place-editor-mesh-debug)",
						"The meshes that cost the most to draw",
					],
				],
			},
			{ t: "h", level: 2, text: "Turning it off" },
			{
				t: "p",
				text:
					"**Settings › Place Editor** turns it off to save memory. The place's tab then says so, " +
					"and the DataModel tree and Properties still work. While it is off, this section " +
					"leaves the docs' contents.",
			},
		],
	};
}

export function placeEditorMovingPage(): DocPage {
	return {
		slug: "place-editor-moving",
		narrow: true,
		title: "Moving and picking",
		summary: "The Place Editor's camera, and picking parts and models.",
		blocks: [
			{ t: "h", level: 2, text: "Picking" },
			{
				t: "table",
				head: ["To", "Do"],
				rows: [
					["Pick a model", "Click a part: the highest Model in Workspace that holds it"],
					["Pick the part itself", "`Alt` or `Shift` + click, or a long press"],
					[
						"Pick one Model further in each time",
						"`Alt` + click, or a long press, with **Settings › Scene view › Alt-click** on",
					],
					[
						"Add to what is picked, or take out",
						"`Ctrl` + click, `Cmd` on a Mac, with `Alt` or `Shift` as above",
					],
					["Pick every part in a box", "Drag a box: a part is in when its centre is"],
					["Add a box's parts", "`Shift` or `Ctrl` + drag a box"],
					["Pick nothing", "`Esc`, or **Clear** on a touch screen"],
					["See what a click would pick", "Rest the pointer over it: it is outlined faintly"],
					[
						"Use the camera alone",
						"`1` with Select chosen, or click **Select**: clicks pick nothing. `1` again picks again",
					],
				],
			},
			{
				t: "p",
				text:
					"What is picked is outlined square to itself: a part to its own sides, a model to its " +
					"pivot, as Studio's selection box is. One thing picked shows its pivot as a white dot, " +
					"over everything in front of it.",
			},
			{ t: "h", level: 2, text: "The camera" },
			{
				t: "table",
				head: ["To", "Do"],
				rows: [
					["Orbit round what is picked", "`Alt` + drag, or drag a finger"],
					["Look round", "Right-drag"],
					["Pan", "Middle-drag, or `Shift` + right-drag"],
					["Zoom", "Scroll, or pinch"],
					["Fly", "`W` `A` `S` `D`, `Q` down and `E` up; `Shift` + scroll sets the speed"],
					[
						"Fly on a touch screen",
						"The left stick moves and the right one looks round; the buttons beside it go up and down",
					],
					["Frame what is picked, or everything", "`F`, or `Home`"],
					["Look along an axis", "Click its end on the axes, bottom right"],
				],
			},
		],
	};
}

export function placeEditorEditingPage(): DocPage {
	return {
		slug: "place-editor-editing",
		narrow: true,
		title: "Editing in 3D",
		summary: "Moving, turning and setting down parts in the Place Editor, and saving the place.",
		blocks: [
			{
				t: "p",
				text:
					"The editing tools need **Settings › Workspace › Modify DataModel Instances** on. " +
					"Importing a place, or a Rojo project with one, asks whether to view it only or to " +
					"view and edit it.",
			},
			{
				t: "table",
				head: ["To", "Do"],
				rows: [
					["Show a tool's handles", "`1` to `4`: Select, Move, Rotate, Scale"],
					[
						"Move a part or a model onto a surface",
						"Drag it, with any tool: it rests on what is under the pointer",
					],
					[
						"Set it down by its pivot",
						"Drag the pivot's dot, ringed blue under the pointer: the pivot goes on the surface",
					],
					[
						"Turn what is dragged",
						"`R` turns it, `T` tilts it, a quarter each; `Esc` puts it back",
					],
					["Take a drag back", "`Ctrl` + `Z`"],
					["Put the handles on the pivot", "**Pivot** in the bar: Edit Pivot"],
					[
						"Turn the handles to the world's axes, or back",
						"`Ctrl` + `L`, `Cmd` + `L` on a Mac, or **Object** in the bar",
					],
					["Save the place", "`Ctrl` + `S`, `Cmd` + `S` on a Mac, or **Save** in the bar"],
				],
			},
			{
				t: "p",
				text:
					"The handles stand square to what is picked; they show the tool's axes but do not " +
					"drag yet, so drag the part itself. With **Pivot** on, the pivot's dot shows its X, Y " +
					"and Z, and a drag by it keeps the dot ringed, with a **Pivot** tag. A Locked part " +
					"stays put.",
			},
			{ t: "h", level: 2, text: "Snaps" },
			{
				t: "p",
				text:
					"The bar's snaps set the steps a drag keeps to, in studs and degrees. On a narrower " +
					"screen they are behind **Snap**.",
			},
		],
	};
}

export function placeEditorDrawingPage(): DocPage {
	return {
		slug: "place-editor-drawing",
		narrow: true,
		title: "What it draws",
		summary: "How the Place Editor draws parts, assets, lights and effects.",
		blocks: [
			{
				t: "table",
				head: ["What", "How it is drawn"],
				rows: [
					[
						"Parts",
						"In their colour and material, each material's pattern or texture tinted by the " +
							"part's Color, with their Transparency and Reflectance",
					],
					["Neon", "Glowing; the place's Bloom sets how much"],
					[
						"Glass",
						"See-through Glass hides the see-through parts behind it, as Studio's does. " +
							"**Settings › Scene view** can let them show",
					],
					[
						"Decals, Textures, meshes and the sky",
						"Downloaded once, when signed in with Roblox through `roswaal serve`. Until then, " +
							"and on the website, a face is its part's colour, a MeshPart its box, and the sky " +
							"Roswaal's own",
					],
					[
						"Lights",
						"PointLights, SpotLights and SurfaceLights light the place, and cast no shadows yet",
					],
					["The sun and sky", "The sun casts shadows; Ambient lights where the sky cannot reach"],
					["ColorCorrection and Blur", "Drawn; **Settings › Scene view** can turn them off"],
					[
						"Beams and ParticleEmitters",
						"Moving as they do in Studio; a particle whose image is not downloaded is a soft dot",
					],
				],
			},
			{
				t: "p",
				text:
					"A card over the bar counts the assets in as they load, and any that failed or need " +
					"signing in.",
			},
			{
				t: "p",
				text:
					"It draws with WebGPU, or WebGL2 where the browser has no WebGPU. **Settings › Scene " +
					"view** chooses.",
			},
		],
	};
}

export function placeEditorRenderingPage(): DocPage {
	return {
		slug: "place-editor-rendering",
		narrow: true,
		title: "The Rendering panel",
		summary: "How the Place Editor's view is drawn, switch by switch, and views of what it costs.",
		blocks: [
			{
				t: "p",
				text:
					"The **Rendering** panel, in the **Panels** menu while the place is in front, changes " +
					"how the view draws the place, never the place.",
			},
			{ t: "h", level: 2, text: "Switches" },
			{
				t: "p",
				text:
					"Every part of the picture has its own switch, in groups: surfaces, light, shadows, " +
					"lights, glow and effects, sky and air, post effects. A switch changes only itself. A " +
					"dot marks one changed from the preset; **Reset** puts them back.",
			},
			{ t: "h", level: 2, text: "View" },
			{
				t: "p",
				text:
					"**View** chooses what is shown. Its **Final output** presets set the switches: the " +
					"performance ones take away what costs most, down to **Lowest**, and the rest show one " +
					"feature alone. Under them, the arrows step through the ten steps a frame is built in. " +
					"The other views show the place as the switches leave it, so the wireframe shows what " +
					"culling left.",
			},
			{
				t: "table",
				head: ["View", "Shows"],
				rows: [
					["Final output", "The place as the switches leave it"],
					["Wireframe", "Every part's edges, those behind others too"],
					[
						"Render heatmap",
						"What each pixel costs to draw, green to white: its textures, shadows and the " +
							"lights tested for it. See-through parts, beams and particles add theirs to what is behind them",
					],
					["Lighting heatmap", "How many lights reach each pixel; black for none"],
					[
						"Overdraw",
						"How many surfaces are drawn over each pixel, 1 to 32 or more. Red and white find " +
							"stacked or buried parts",
					],
					[
						"Triangle density",
						"Each part's triangles for each square stud of its box, ¼ to 64 or more. Red and " +
							"white parts are heavy meshes or unions to simplify",
					],
					[
						"Shadow maps",
						"Which of the sun's maps shades each pixel: three cascades out to 64, 256 and 1,024 " +
							"studs, then the whole place's map. A white line marks the edge of the sky's near maps",
					],
				],
			},
			{
				t: "p",
				text:
					"**Heat** draws a heatmap as **Linear heat**, blended, each light weighed by how " +
					"strongly it reaches, or as **Cubespots**, the 16-stud cells the lights are sorted into.",
			},
			{ t: "h", level: 2, text: "Tools" },
			{
				t: "table",
				head: ["Switch", "Does"],
				rows: [
					[
						"**Gizmos**",
						"Draws Attachments, welds and constraints over the view, and those of what is picked",
					],
					[
						"**Performance**",
						"Frustum and occlusion culling: parts out of view, or behind solid parts, are not drawn",
					],
					[
						"**Light ranges**",
						"Draws the reach of the lights near the camera as wire shapes, in their colour",
					],
					[
						"**Freeze shadows**",
						"Stops redrawing the sun's and sky's shadow maps, so their cost can be compared",
					],
				],
			},
			{ t: "h", level: 2, text: "Roswaal fixes" },
			{
				t: "p",
				text:
					"These change the picture from Studio's on purpose, and start off. **Thin walls block " +
					"sky** keeps closed rooms dark whatever their walls' thickness; Studio lets the sky " +
					"through walls thinner than 4 studs.",
			},
			{
				t: "p",
				text: "What the panel shows, and the step its switches stop at, show over the bar's left end.",
			},
		],
	};
}

export function placeEditorPerformancePage(): DocPage {
	return {
		slug: "place-editor-performance",
		narrow: true,
		title: "The Performance panel",
		summary: "What drawing the place costs: frame times and the last frame's counts.",
		blocks: [
			{
				t: "p",
				text:
					"The **Performance** panel, in the **Panels** menu beside **Rendering**, shows what " +
					"drawing the place costs. It updates twice a second while it is open.",
			},
			{ t: "h", level: 2, text: "The graph" },
			{
				t: "p",
				text:
					"The last 240 frames' times, with lines at 16.7 ms and 33.3 ms: a frame at 60 and at 30 " +
					"a second. Where the browser times the GPU, each frame splits into its passes: " +
					"shadows, the place and effects. Otherwise the graph shows the page's own time.",
			},
			{ t: "h", level: 2, text: "The last frame" },
			{
				t: "table",
				head: ["Row", "Counts"],
				rows: [
					["Draw calls", "Batches sent to the GPU"],
					["Instances", "Copies those calls drew"],
					["Solid parts drawn", "How many of the solid parts culling left; All with culling off"],
					["Triangles", "Triangles drawn"],
					["Beams and Particles", "How many were drawn"],
					["Page", "The page's own time for the frame"],
					[
						"GPU, shadows, place and effects",
						"Each pass's time, where the browser times them. WebGL2 does not",
					],
					[
						"Assets",
						"How many of the place's assets are loaded, and any that failed or need signing in",
					],
				],
			},
			{ t: "h", level: 2, text: "Finding a spike" },
			{
				t: "p",
				text:
					"Fly round and watch the graph for frames over the 33 ms line. Then, in " +
					"[Rendering](place-editor-rendering), turn switches off one at a time, or freeze the " +
					"shadows, and see which brings the time down. [Mesh Debug](place-editor-mesh-debug) " +
					"names the meshes to simplify. To watch the place through a panel, pick " +
					"**See-through** in its **⋯** menu.",
			},
		],
	};
}

export function placeEditorMeshDebugPage(): DocPage {
	return {
		slug: "place-editor-mesh-debug",
		narrow: true,
		title: "The Mesh Debug panel",
		summary: "The meshes that cost the place the most to draw, and picking every copy.",
		blocks: [
			{
				t: "p",
				text:
					"The **Mesh Debug** panel, in the **Panels** menu beside **Rendering**, lists the " +
					"meshes that cost the most to draw.",
			},
			{
				t: "table",
				head: ["List", "Shows"],
				rows: [
					[
						"By triangles",
						"The ten meshes costing the most triangles: each mesh's own count times the copies " +
							"drawing it, with ×n for the copies",
					],
					["By copies", "The ten meshes drawn most often, of those drawn more than once"],
				],
			},
			{
				t: "p",
				text:
					"Copies are one mesh when they share an asset. Click a row to pick every copy and " +
					"frame them; rest the pointer on it for the class, the copies and each copy's triangles.",
			},
			{
				t: "p",
				text:
					"A heavy mesh with many copies is the first to simplify. **Triangle density** in " +
					"[Rendering](place-editor-rendering) shows the same meshes in place.",
			},
		],
	};
}
