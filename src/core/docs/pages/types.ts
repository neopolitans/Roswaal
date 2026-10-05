/**
 * The `types` page of the documentation. `buildSite` places it.
 */

import type { DocPage } from "../site.js";
import { code } from "./blocks.js";

export function typesPage(): DocPage {
	return {
		slug: "types",
		title: "Roswaal types",
		summary: "What a pin's type means, and where it differs from Luau's.",
		blocks: [
			{
				t: "p",
				text:
					"A pin's type does two jobs: it decides its colour, and it decides what will " +
					"connect to what. It is **not** a Luau type annotation — it is a promise about " +
					"the value, kept deliberately coarser than Luau's own type system so that wiring " +
					"stays a yes-or-no question rather than a typechecking session.",
			},
			{ t: "h", level: 2, text: "The types" },
			{
				t: "table",
				head: ["Type", "Holds", "Notes"],
				types: 0,
				rows: [
					["`boolean`", "true or false", ""],
					["`number`", "A Luau number", "No integer/float split; Luau has one number type."],
					["`string`", "Text", "Quoted for you when it is emitted."],
					[
						"`ClassName`",
						"A class name, as text",
						"Roswaal's, written as `string`. A pin of this type offers the engine's classes, as Is A's Class Name does. Choose it for a parameter like `need`'s `class`.",
					],
					["`table`", "Any Luau table", "One type for arrays, maps and sets, because Lua has one."],
					["`function`", "A function value", "Get Function produces one."],
					[
						"`Instance`",
						"Any Roblox instance",
						"A class such as `Model` narrows it. **Is A** asks at runtime.",
					],
					[
						"`Vector2`, `Vector3`, `CFrame`, `Color3`, `UDim`, `UDim2`",
						"Roblox value types",
						"All splittable — see below. Every operation on them is under **Engine types**.",
					],
					[
						"`BrickColor`",
						"A colour from Roblox's fixed palette",
						"**Not a** `Color3`, and not interchangeable with one. Read `.Color` to get the Color3 behind the name.",
					],
					[
						"`TweenInfo`, `Tween`",
						"How a tween moves, and a running one",
						"A TweenInfo is a description and can drive any number of tweens; a Tween is the thing that plays.",
					],
					["`RBXScriptSignal`", "A Roblox event", "Wires into Connect Event."],
					["`RBXScriptConnection`", "A live connection", "What Connect Event hands back."],
					["`luau`", "Hand-written Luau", "Only on Custom Code and Luau Expression. See below."],
					["`any`", "Anything", "Connects both ways. What a node returns when it cannot say more."],
					[
						"`wildcard`",
						"Anything, so far",
						"Meant to adopt the type it is wired to. It does not yet — see Known gaps.",
					],
				],
			},
			{
				t: "note",
				kind: "info",
				text:
					"A pack adds a type just by naming one: a `Quaternion` pin connects only to other " +
					"`Quaternion` pins.",
			},
			{ t: "h", level: 2, text: "What connects to what" },
			{
				t: "ul",
				items: [
					"The same type always connects.",
					"`any` connects to anything, in both directions.",
					"`number` and `string` connect either way, because Luau coerces them. The wire is drawn as a gradient between the two colours to say so.",
					"Execution and data never connect.",
					"Everything else is refused during the drag, rather than at compile time.",
				],
			},
			{ t: "h", level: 2, text: "luau is a type, not a string" },
			{
				t: "p",
				text:
					"**Custom Code** and **Luau Expression** have a pin typed `luau`. It holds code you " +
					"write, and clicking it opens a proper editor with highlighting and completion.",
			},
			{
				t: "note",
				kind: "good",
				text:
					"Those two pins are the **only** places hand-written Luau enters a graph, so " +
					"reviewing one means scanning for two node titles.",
			},
			{
				t: "p",
				text:
					"It is a pin type rather than a badge on a string because it *is* a different kind " +
					"of pin, and a type says that more plainly than a warning does.",
			},
			{ t: "h", level: 2, text: "Pins that are typed in, not wired" },
			{
				t: "p",
				text:
					"Some inputs become part of the generated source rather than a value it reads: a " +
					"property name in `Get Property`, the type in `Cast`. They are marked **literal** " +
					"in the reference, and the editor refuses a wire to one during the drag rather " +
					"than letting the compile fail later.",
			},
			{
				t: "code",
				lang: "luau",
				text: code`
					-- Get Property, with Property typed in as "Name"
					print(instance.Name)

					-- The name is part of the code, not a value it reads.
					`,
			},
			{ t: "h", level: 2, text: "Optional arguments" },
			{
				t: "p",
				text:
					"Some inputs read **default** in a dashed box rather than showing a value. " +
					"Those are optional: left alone, the argument is *not passed at all*, and the " +
					"call uses whatever it would have used anyway. Click one to set a value; the " +
					"**×** beside a value you set puts it back.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"Optional is not the same as a default. A default left alone emits its **value**; an " +
					"optional pin left alone emits nothing — and many Roblox constructors reject an " +
					"explicit `nil`. Set a later optional pin and the ones before it are written as " +
					"`nil`, to keep its position.",
			},
			{
				t: "code",
				lang: "luau",
				text: code`
					-- nothing set
					TweenInfo.new(1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)

					-- repeat count set to 2
					TweenInfo.new(1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out, 2)

					-- only the delay set: the gap before it has to be held open
					TweenInfo.new(1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out, nil, nil, 0.5)
					`,
			},
			{
				t: "p",
				text:
					"Only *trailing* unset arguments disappear. One with a set argument after it is " +
					"passed as `nil`, because dropping it would shift everything left and the delay " +
					"would arrive as the repeat count.",
			},
			{ t: "h", level: 2, text: "Splittable types" },
			{
				t: "p",
				text:
					"`Vector2`, `Vector3`, `CFrame`, `Color3`, `UDim` and `UDim2` come apart into their " +
					"components — right-click a pin and pick **Split Struct Pin**. `CFrame` offers " +
					"three decompositions; the rest have one. Splitting and recombining never change " +
					"what the graph compiles to.",
			},
			{ t: "h", level: 2, text: "Where Luau's types come in" },
			{
				t: "p",
				text:
					"This page is about the types a **pin** has: what may be wired to what, and the " +
					"colour it is drawn in. Luau's own type system is richer, and everything that " +
					"crosses between the two — casts, declared types, and the annotations Roswaal " +
					"writes into the generated file — is on [Casting and annotations](casting).",
			},
		],
	};
}
