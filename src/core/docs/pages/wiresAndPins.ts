/**
 * The `wires-and-pins` page of the documentation. `buildSite` places it.
 */

import { TYPE_FAMILIES } from "../../typeFamily.js";
import { GUIDE_SCENES } from "../examples.js";
import type { DocPage, PageContext } from "../site.js";
import { previews } from "./blocks.js";

export function wiresAndPinsPage({ registry }: PageContext): DocPage {
	return {
		slug: "wires-and-pins",
		narrow: true,
		title: "Wires and pins",
		summary: "Execution and data, what connects to what, and what a pin can do.",
		blocks: [
			{
				t: "p",
				text:
					"**Execution** wires say what happens in what order. **Data** wires carry values. An " +
					"execution pin is a triangle hung outside the node, and a step's flow in and flow on " +
					"sit level with its header. A data pin is balanced on the node's edge, shaped by the " +
					"kind of value it carries. Both are drawn open until something is wired to them.",
			},
			...previews(
				registry,
				["debug.print", "math.add"],
				"Print is a step, so it has an execution pin either side. Add is **pure** — no " +
					"execution pins, and its value goes wherever a value is wanted.",
			),

			{ t: "h", level: 2, text: "Execution wires" },
			{
				t: "ul",
				items: [
					"An execution output takes one wire. To do two things in turn, use **Sequence**.",
					"An execution input takes one wire too, so two flows cannot join at one node.",
				],
			},
			{
				t: "graph",
				script: GUIDE_SCENES.wireExecution(),
				caption:
					"An execution output takes one wire, so Sequence is how one step leads to two. " +
					"Its outputs run top to bottom.",
			},

			{ t: "h", level: 2, text: "Data wires" },
			{
				t: "ul",
				items: [
					"A data output can feed any number of inputs.",
					"An input takes one wire. Connecting a second replaces the first.",
				],
			},
			{
				t: "p",
				text:
					"Pure nodes are rounder, with no header bar, and a variable's Get is a pill. A " +
					"pure value used once is written where it is used; used twice or more, it is bound " +
					"to a local first, so the work happens once. A variable is the exception — it is " +
					"read where it is used, every time, so a Set between two reads is never missed.",
			},

			{ t: "h", level: 2, text: "Colours" },
			{
				t: "p",
				text:
					"A pin's colour is its type: red boolean, green number, magenta string, blue " +
					"instance, gold vector, orange CFrame. Grey is `any`, and any type without a " +
					"colour of its own, such as `Model`.",
			},
			{
				t: "graph",
				script: GUIDE_SCENES.wireColours(),
				caption:
					"Each wire joins two pins of one type, so it is that type's colour: gold `Vector3`, " +
					"orange `CFrame`, green `number`, blue `Instance`, magenta `string`. Greater " +
					"Than's output is red, a `boolean`.",
			},
			{
				t: "p",
				text:
					"A data wire takes the colour of the pin it leaves. Where it lands on a pin of " +
					"another colour, it fades from one to the other. Hover a wire to see its type, or " +
					"both types when it fades.",
			},
			{
				t: "graph",
				script: GUIDE_SCENES.wireFades(),
				caption:
					"Add's number lands on a string pin, and Concatenate's string on Print's Value, " +
					"which takes anything — so each wire fades from one colour to the other.",
			},

			{ t: "h", level: 2, text: "Shapes and type chips" },
			{
				t: "p",
				text:
					"A data pin's shape says what kind of value it carries, so a pin can be read " +
					"without telling its colour apart:",
			},
			{
				t: "table",
				head: ["Shape", "Carries"],
				rows: TYPE_FAMILIES.map((f) => [capitalise(f.shape), f.what]),
			},
			{
				t: "p",
				text:
					"An output also says its type in words, in a chip of the type's colour, where its " +
					"name does not already say it. An unnamed `RBXScriptSignal` output reads " +
					"**Signal**; Connect Event's **Connection** output has no chip, because its name " +
					"already says it. Point at a chip for what the type is and a link to its page in " +
					"Roblox's Creator Documentation, the same card the Code panel shows; on a touch " +
					"screen, tap it.",
			},

			{ t: "h", level: 2, text: "What connects" },
			{
				t: "ul",
				items: [
					"The same type.",
					"`any`, to and from anything.",
					"`number` and `string`, either way — Luau converts between them.",
					"An instance class such as `Model` into an `Instance` pin. The other way round needs a **Cast**.",
					"Never execution to data.",
					"Some inputs are typed in and become part of the code, like Get Property's Property. They take no wire, and the pin menu says so.",
				],
			},
			{ t: "p", text: "[Roswaal types](types) lists every type and what it holds." },
			{
				t: "note",
				kind: "good",
				text:
					"**An input that takes anything can be given a type.** Select the node, and pick one beside the " +
					"pin under **Pins** in the Inspector. The pin then wires, colours and takes a " +
					"typed-in value as that type. The Luau written does not change.",
			},

			{ t: "h", level: 2, text: "Working with wires" },
			{
				t: "table",
				head: ["Gesture", "What it does"],
				rows: [
					["Drag from a pin", "Start a wire. Pins of other types dim"],
					[
						"Drop it on empty space",
						"The node menu, showing only nodes that can take it, those of exactly its type first. Picking one connects it",
					],
					["`Ctrl` + drop it on empty space", "The node picker, and the same connection"],
					[
						"Drop a wired execution output on empty space",
						"The new node goes in between: the step leads into it, and it leads on to the next one, from Then 0 on a Sequence and Completed on a loop",
					],
					[
						"Drop a value on Add, Make Dictionary or a call",
						"Adds an input for it and connects it",
					],
					["Drag from a wired input", "Pick the wire up and move it"],
					[
						"Drop a wire picked up off a data input on empty space",
						"The new node goes in between: the value feeds it, and it feeds the input. Nodes that fit both ends come first",
					],
					["`Shift` + click a pin", "Disconnect everything on it"],
					["`Shift` or `Alt` + click a wire", "Disconnect it"],
					[
						"Click a Class Name",
						"The class picker: type to search, `↑` `↓` to move, `Enter` to take it, `Esc` to leave. A name it does not hold is taken on `Enter` anyway",
					],
					["Double-click a wire", "Add a reroute knot"],
					["Right-click a pin", "The pin menu"],
				],
			},
			{
				t: "p",
				text:
					"Wires are drawn one of three ways, set under **Settings → Canvas → Wires**: **Curved**, the " +
					"default, **Rigid**, or **Angular**. The pictures in these docs follow that setting, " +
					"and your **Node corners** too.",
			},

			{ t: "h", level: 2, text: "Reroute knots" },
			{
				t: "p",
				text:
					"Double-click a wire to put a knot in it, then drag the knot to route the wire where " +
					"you want it. A knot compiles to nothing. It takes the type of whatever is wired " +
					"into it, and changes when that does. `Shift` or `Ctrl` + click a knot to select it.",
			},
			{
				t: "graph",
				script: GUIDE_SCENES.wireKnots(),
				caption:
					"Each wire rises to a knot and runs flat into the pin it feeds — an execution " +
					"wire above, a data wire below. The knots compile to nothing.",
			},

			{ t: "h", level: 2, text: "The pin menu" },
			{
				t: "table",
				head: ["Item", "What it does"],
				rows: [
					[
						"Promote to Variable",
						"On an unwired input. Makes a variable with the pin's type and value, and wires its Get in",
					],
					[
						"Split Struct Pin",
						"One pin per component, on a `Vector2`, `Vector3`, `CFrame`, `Color3`, `UDim` or `UDim2` input or output. `CFrame` splits three ways: position and rotation, position and axes, or 12 numbers",
					],
					["Recombine Struct Pin", "On a component. Puts the pin back together"],
					["Break Link", "Disconnect the pin, the same as `Shift` + click"],
				],
			},
			{
				t: "graph",
				script: GUIDE_SCENES.pinMenu(),
				caption:
					"**Split Struct Pin** broke the lower CFrame's Position into X, Y and Z; the one " +
					"above is whole. **Promote to Variable** turned Y's value into **Height** and wired " +
					"its Get in.",
			},
			{
				t: "note",
				kind: "good",
				text:
					"Splitting and recombining never change the compiled output. Where a value cannot be " +
					"carried across, Roswaal says so first.",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"Splitting or recombining a pin removes its wires, and asks first if there is more " +
					"than one.",
			},

			{ t: "h", level: 2, text: "Values on unwired inputs" },
			{
				t: "p",
				text:
					"An input with nothing wired in shows its value: a checkbox, a number, text, or a " +
					"dropdown. A value written as Luau, like `Vector3.zero`, is fixed — wire a node in, " +
					"or split the pin, to change it.",
			},
			{
				t: "p",
				text:
					"**A dropdown is a shortcut, never a gate.** A short list of values — the three " +
					"axes, the easing styles — is a `select` with **Other…** at the bottom for anything " +
					"it does not hold. A long one, like the Class Name on **Is A** or **New Instance**, " +
					"opens a **picker**: search at the top, and every Instance class the engine has " +
					"below it, grouped by what each one derives from. Type to narrow, arrows to move, " +
					"Enter to take it — and a name the list does not hold is still taken, because a " +
					"class newer than your build has to be reachable. Each node’s reference page says " +
					"which of its pins offer a list.",
			},
			{
				t: "p",
				text:
					"**default** in a dashed box is an optional argument. Left alone, it is not passed " +
					"at all. Click it to set a value, and **×** to clear it. [Roswaal types](types) " +
					"explains when that matters.",
			},
			...previews(
				registry,
				["tweeninfo.new", "instance.findFirstChildWhichIsA", "cframe.lookAt"],
				"TweenInfo has a number, two dropdowns, and three optional arguments left at " +
					"**default**. Find First Child Which Is A has text, and a Recursive left at " +
					"**default** — so it is not passed at all. Look At's `Vector3.zero` is fixed " +
					"until something is wired in.",
			),

			{ t: "h", level: 2, text: "Adding and removing pins" },
			{
				t: "p",
				text:
					"A node that takes a list, such as a call, Make Dictionary, Sequence, Return, " +
					"Module Exports or a function's parameters, shows an **Add** row under it when you " +
					"point at it or select it, and a grey **×** beside each entry it can lose. Add " +
					"puts a new one at the end. × takes that one away, wherever it is, and the wires " +
					"and values of the ones after it move up with them. The maths and logic " +
					"operators keep a **+** and **−** beside their symbol.",
			},
			{
				t: "graph",
				script: GUIDE_SCENES.growPins(),
				caption:
					"Add at three operands and Sequence at three outputs. Add's **+** and **−** sit " +
					"beside its symbol; Sequence's Add row and its × show when you point at it, and " +
					"go once it reaches its limit.",
			},
		],
	};
}

function capitalise(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}
