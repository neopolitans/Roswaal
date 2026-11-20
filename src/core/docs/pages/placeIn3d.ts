/**
 * The `place-in-3d` page of the documentation. `buildSite` places it.
 */

import type { DocPage } from "../site.js";

/**
 * The Place Editor extension: the place drawn in 3D, its Rendering panel and
 * finding what is slow. Editing the DataModel is Roswaal's own, on *Editing a
 * place*, and works with the extension off.
 */
export function placeIn3dPage(): DocPage {
	return {
		slug: "place-in-3d",
		narrow: true,
		title: "The place in 3D",
		summary:
			"The Place Editor: your place drawn in 3D, how it is rendered, and finding what is slow.",
		blocks: [
			{
				t: "p",
				text:
					"The **Place Editor** draws the place in 3D, in a tab of its own. It is an " +
					"[extension](extensions), with its own version, and can be turned off in Settings; " +
					"browsing and editing the place's instances, on [Editing a place](editing-a-place), " +
					"works either way.",
			},

			{
				t: "p",
				text:
					"Open the place from **Files**, or with its row at the top of **DataModel**, and " +
					"Workspace opens in a tab of its own, lit by the place's Lighting and Atmosphere, with " +
					"Studio's saved camera drawn in yellow. While it is in front only DataModel and " +
					"Properties show, and Properties describes the place until you pick something.",
			},
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
					["Add a box's parts to what is picked", "`Shift` or `Ctrl` + drag a box"],
					["Pick nothing", "`Esc`, or **Clear** on a touch screen"],
					["See what a click would pick", "Rest the mouse over it: it is outlined faintly"],
					["Orbit round what is picked", "`Alt` + drag, or drag a finger"],
					["Look round", "Right-drag"],
					["Pan", "Middle-drag, or `Shift` + right-drag"],
					["Zoom", "Scroll, or pinch"],
					["Fly", "`W` `A` `S` `D`, `Q` down and `E` up; `Shift` + scroll sets the speed"],
					[
						"Fly, on a touch screen",
						"The left stick moves and the right one looks round; the buttons beside it go up and down",
					],
					["Frame what is picked, or everything", "`F`, or `Home`"],
					["Look along an axis", "Click its end on the axes, bottom right"],
					["Show a tool's handles", "`1` to `4`: Select, Move, Rotate, Scale"],
					[
						"Use the camera alone",
						"`1` with Select chosen, or click **Select**: clicks pick nothing; `1` again picks it up",
					],
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
					["Put the handles on the pivot", "**Pivot** in the bar: Edit Pivot"],
					["Save the place", "`Ctrl` + `S`, `Cmd` + `S` on a Mac, or **Save** in the bar"],
					[
						"Turn the handles to the world's axes, or back to the object's",
						"`Ctrl` + `L`, `Cmd` + `L` on a Mac, or **Object** in the bar",
					],
				],
			},
			{
				t: "p",
				text:
					"What is picked is outlined square to itself: a part to its own sides, a model to its " +
					"pivot, as Studio's selection box is. The handles stand the same way. One thing picked " +
					"shows its pivot over everything in front of it: a white dot, with its X, Y and Z while " +
					"**Pivot** is on.",
			},
			{
				t: "p",
				text:
					"Move, Rotate, Scale, **Pivot** and **Object** are editing tools, offered with " +
					"**Settings › Workspace › Modify DataModel Instances** on, as is dragging; a Locked " +
					"part stays put, and `Ctrl` + `Z` takes a drag back. A drag by the pivot keeps its dot " +
					"ringed, with a **Pivot** tag. Importing a place, or a Rojo " +
					"project with one, asks whether to view it only or to view and edit it.",
			},
			{
				t: "p",
				text:
					"The bar's snaps set the steps a drag keeps to, in studs and degrees; on a narrower " +
					"screen they are behind **Snap**. Parts are drawn in their colour and material, each " +
					"material with a pattern or texture of its own tinted by the part's Color, with their " +
					"Transparency and Reflectance, and Neon glows. See-through Glass hides the see-through " +
					"parts behind it, as Studio's does. It draws with WebGPU, or WebGL2 where the browser " +
					"has no WebGPU; **Settings › Scene view** chooses, and can let parts show through " +
					"Glass. Signed in with Roblox through `roswaal serve`, Decals and Textures, MeshParts' " +
					"meshes and the Sky's images are downloaded once and drawn; until then, and on the " +
					"website, a face is its part's colour, a MeshPart its box and the sky Roswaal's own. " +
					"A card over the bar counts the assets in as they load, and any that failed or need " +
					"signing in. " +
					"The place's ColorCorrection and Blur are drawn too, and its Bloom sets how Neon " +
					"glows; **Settings › Scene view** can turn them off. Beams and ParticleEmitters " +
					"move as they do in Studio; a particle whose image is not downloaded is a soft dot. Its PointLights, " +
					"SpotLights and SurfaceLights light it, Ambient lights where the sky cannot reach, " +
					"and the sun casts shadows; the lights cast none yet, and the handles do " +
					"not drag yet. To save memory, turn the place editor " +
					"off in **Settings › Place Editor**; the place's tab then says so, and the " +
					"DataModel tree and Properties still work.",
			},

			{ t: "h", level: 2, text: "Rendering" },
			{
				t: "p",
				text:
					"The **Rendering** panel, in the **Panels** menu while the place is in front, changes " +
					"how the viewer draws it, never the place.",
			},
			{
				t: "p",
				text:
					"Every part of the picture has its own switch, in groups: surfaces, light, shadows, " +
					"lights, glow and effects, sky and air, post effects. A dot marks a switch changed " +
					"from the preset chosen; **Reset** puts them back. A switch changes only itself, in " +
					"whatever the view shows.",
			},
			{
				t: "p",
				text:
					"**View** chooses what is shown. Its **Final output** presets set the switches: " +
					"performance ones take away what costs most, down to **Lowest**, and the rest show one " +
					"feature alone; under them the arrows step through the ten steps a frame is built in. " +
					"Its inspecting views show the place as the switches leave it, so the wireframe shows " +
					"what culling left. **Gizmos** draws Attachments, welds and constraints over the " +
					"view, and those of what is picked. **Performance** holds frustum and occlusion culling: " +
					"parts out of view, or hidden behind solid parts, are not drawn, and the wireframe shows " +
					"what is left. **Roswaal fixes** change the picture from Studio's on purpose and start " +
					"off: **Thin walls block sky** keeps closed rooms dark whatever their walls' thickness, " +
					"where Studio lets the sky through walls thinner than 4 studs.",
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
						"How many surfaces are drawn over each pixel, 1 to 32 or more: every solid part, " +
							"hidden ones too, then see-through parts, images, beams and particles in front. " +
							"Look for red and white to find stacked or buried parts",
					],
					[
						"Triangle density",
						"Each part's triangles a square stud of its box, ¼ to 64 or more. Red and white " +
							"parts are heavy meshes or unions: simplify them",
					],
					[
						"Shadow maps",
						"Which of the sun's maps shades each pixel, tinted: three cascades out to 64, 256 " +
							"and 1,024 studs, then the whole place's map. A white line marks the edge of the " +
							"sky's near maps",
					],
				],
			},
			{
				t: "p",
				text:
					"**Heat** draws a heatmap as **Linear heat**, blended and each light weighed by how " +
					"strongly it reaches, or as **Cubespots**, the 16-stud cells the lights are sorted into.",
			},
			{
				t: "p",
				text: "What the panel looks at, and the step its switches show, show over the bar's left end.",
			},
			{ t: "h", level: 2, text: "Finding what is slow" },
			{
				t: "p",
				text:
					"Two more panels in the **Panels** menu, beside **Rendering**, show what drawing the " +
					"place costs.",
			},
			{
				t: "table",
				head: ["Panel", "Shows"],
				rows: [
					[
						"**Performance**",
						"The last 240 frames' times, with the GPU's passes where the browser times them, " +
							"and the last frame's draw calls, instances, triangles, beams, particles and times",
					],
					[
						"**Mesh Debug**",
						"The meshes costing the most triangles, all copies counted, and those drawn most " +
							"often. Click one to pick its copies",
					],
				],
			},
			{
				t: "p",
				text:
					"Fly around and watch **Performance** for spikes over the 33 ms line. In **Rendering**, " +
					"**Light ranges** draws the reach of the lights near the camera as wire shapes, in " +
					"their colour, and **Freeze shadows** stops redrawing the sun's and sky's shadow maps, " +
					"so their cost can be compared. To watch the place through a window, pick " +
					"**See-through** in its **⋯** menu.",
			},
		],
	};
}
