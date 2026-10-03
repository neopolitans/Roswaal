/**
 * Release notes for 0.20.0 to 0.29.x, newest first.
 *
 * One of the files `../releases.ts` puts together, a tenth of the minor
 * versions each, so the newest notes are not at the top of a very long file.
 */

import type { Release } from "../releases.js";

export const RELEASES_0_20: Release[] = [
	{
		version: "0.29.1",
		date: "2026-09-11",
		headline: "Know what a target switch breaks, and where the target lives.",
		changed: [
			"**Switching a graph's target lists the nodes that would become errors**, by name and with a count for repeats, before asking.",
			"**The target picker sits beside Compile script**, with the other compilation controls, rather than beside the graph's name.",
			"**A review can credit its reviewers** by GitHub account, linked at the foot of the page, and *Contributing* lists everyone credited.",
			"**Release notes open on the newest minor version**, with the current release inside it and marked **Latest**, instead of showing that release apart from its siblings.",
		],
		fixed: [
			"**The Beako link on Attributions is a link again**, rather than its raw text.",
			"**Five older release notes print their emphasis** instead of stray asterisks.",
		],
		verified: ["controls"],
	},
	{
		version: "0.29.0",
		date: "2026-09-11",
		headline: "Change a graph's target, and a shorter history.",
		added: [
			"**A graph's target can be changed** from the bar above the canvas. Switching to Lune asks first when the graph has Roblox-only nodes, which would become errors.",
			"**Contributing**, a page on building Roswaal, what a change brings with it, and where help is wanted.",
		],
		changed: [
			"**Release notes show the latest release in full** and fold every other one into its minor version — 0.28.x, 0.27.x — to open when wanted.",
			"**Release notes carry no review badge.**",
			"**The README says Lune support is experimental.**",
		],
	},
	{
		version: "0.28.0",
		date: "2026-09-11",
		headline: "The target in view, and five pages verified.",
		added: [
			"**The bar above the canvas shows what the graph compiles for**: Roblox, or Lune.",
			"**Hand-written Luau draws Custom Code and Luau Expression separately**, each with the Luau it compiles to underneath.",
		],
		changed: [
			"**A Roblox-only node in a Lune graph is an error on that node**, and the file is not written. It was a warning, and the file was written anyway.",
			"**Lune support is marked experimental**, in Settings and in the docs. It has not yet been tested by an experienced Lune developer.",
		],
		fixed: [
			"**Settings and the Settings page no longer say the Rojo project file locates files.** Nothing reads it for that; node maps do.",
		],
		watch: [
			"A Lune graph with a Roblox-only node in it no longer compiles. Remove the node, or make the graph a Roblox one.",
		],
		verified: [
			"types",
			"variables-and-locals",
			"building-and-rojo",
			"hand-written-luau",
			"settings",
		],
	},
	{
		version: "0.27.0",
		date: "2026-09-11",
		headline: "Rotators across, and pictures that stay in their frames.",
		added: [
			"**CFrame from Z-Up Rotator**: pitch, yaw and roll in degrees, from an X-forward, Z-up tool, as a CFrame. The conversion is written into the call it compiles to.",
			"**A reviewed page can say what a verified pass still needs**, under its last-reviewed date.",
		],
		changed: [
			"**Above 100%, a picture in the docs grows past the column** into the room the page has, and a graph fits the larger frame rather than spilling out of it.",
		],
		fixed: [
			"**Rigid and angular wires no longer loop between nodes set close together.** A forward gap shorter than two wire stubs was routed as if the input were behind the output.",
			"**Node pictures at large preview sizes stay inside their frame.**",
		],
	},
	{
		version: "0.26.0",
		date: "2026-09-11",
		headline: "Z-up conversions, and docs pictures that match your editor.",
		added: [
			"**Z-Up Conversions**: Vector3 from Z-Up, CFrame from Z-Up Rotation and CFrame from Z-Up Transform, for coordinates that are X forward, Y right and Z up. Positions divide by Units Per Stud, 28 by default for centimetres. A transform's scale comes out separately, because a CFrame has none. *Coming from Blueprints* links each one from its type.",
			"**Wires and pins has pictures** for the pin menu, values on unwired inputs, and adding and removing pins.",
			"**Settings opens from the Docs window**, and has a **Docs** tab: the font the docs are read in — System, Serif, Wide or Monospace — and a preview size from 50% to 300%.",
		],
		changed: [
			"**The inspiration entry on Attributions carries its owner's trademark notice**, and says what Roswaal takes from it and what it does not. *NOTICE.md* says the same.",
			"**Node pictures in the docs follow your Wires and Node corners settings**, and show **+** and **−** on nodes that take a list and **default** on optional inputs left unset, as the canvas does. The static docs site draws the defaults.",
			"**Summaries, captions and paragraphs in the docs use the full width of the page.**",
			"**Release notes list the articles reviewed and verified in each release.**",
		],
		fixed: [
			"**A link from one docs page to another opens that page**, in the Docs window and on the static site. It opened a new tab at an address that did not exist.",
		],
		verified: ["wires-and-pins"],
	},
	{
		version: "0.25.2",
		date: "2026-09-11",
		headline: "Knots that tidy, and the first reviewed page.",
		changed: [
			"**The reroute knot picture shows knots at work**: two wires rise from nodes lower down, each to a knot, and run flat into the pins they feed.",
		],
		reviewed: ["coming-from-blueprints"],
	},
	{
		version: "0.25.1",
		date: "2026-09-11",
		headline: "Wires and pins, drawn.",
		changed: [
			"**Wires and pins shows its rules as graphs**: execution wires and Sequence, a wire in each pin colour, wires that fade where the type changes, and reroute knots.",
			"**A graph in the docs fades a wire from one colour to the other** where it joins pins of different types, as the canvas does.",
			"**The review badge sits under a page's summary** rather than beside its title.",
			"**The table of engine types moved** from *Roswaal types* to *Coming from Blueprints*. Outside that page and *Attributions*, the docs and the editor no longer name another engine.",
		],
		fixed: [
			"**A graph in the editor's Docs window fits its frame**, instead of opening at full size with its right-hand side cut off. Scroll, drag and double-click work on it again.",
		],
	},
	{
		version: "0.25.0",
		date: "2026-09-11",
		headline: "Review badges on the docs, and Ctrl+C without a prompt.",
		breaking: true,
		added: [
			"**Every documentation page says whether a person has read it.** A badge beside the title reads Pending review, Reviewed or Verified, and the foot of the page says when it was last reviewed. Every page starts as Pending review. `npm run docs:reviews` lists where each one stands.",
			'**Find First Child has Recursive**, an optional input that searches every descendant rather than only the children: `part:FindFirstChild("Handle", true)`. Left unset, the call is unchanged.',
		],
		changed: [
			"**Wires and pins** and **Building, and node maps** are rewritten to match the current editor.",
			"**Declare Function has a red header**, the same as Function.",
		],
		fixed: [
			"**Ctrl+C stops** `roswaal serve` **and** `roswaal watch` **without a** `Terminate batch job (Y/N)?` **prompt** or a `^C` over the last line, when run through `bin/roswaal.cmd`.",
		],
		watch: [
			"**Find First Descendant is removed**, because Roblox has deprecated `FindFirstDescendant`. A graph using it no longer compiles, and the error says to use Find First Child with Recursive set.",
		],
	},
	{
		version: "0.24.3",
		date: "2026-09-09",
		headline: "Room around a function declared in the flow.",
		fixed: [
			"**A Declare Function gets a blank line either side**, the same as a hoisted one. Two run together read as a single block with an end somewhere in the middle of it.",
		],
	},
	{
		version: "0.24.2",
		date: "2026-09-09",
		headline: "Declare Function counts as a function everywhere.",
		fixed: [
			"**A graph with only Declare Function nodes compiles.** Every Get Function was reported as pointing at a function no longer in the graph, because the check only counted the hoisted node.",
			"**Declare Function can be chosen in a Get Function.** The dropdown listed it, took the click and discarded it, so the selection snapped back with nothing said.",
			"**Renaming one updates the references to it**, and it now appears in the palette as Get <name> and in hand-written Luau completions.",
		],
	},
	{
		version: "0.24.1",
		date: "2026-09-09",
		headline: "Declare Function hands its function over.",
		fixed: [
			"**A Declare Function node's function can be wired into a call.** Its `Function` output was reported as out of scope, because passing a function as a value was special-cased to the hoisted node.",
			"**Its header reads** `Declare Function (name)`, with the signature underneath, instead of replacing the node's name with the function's.",
		],
	},
	{
		version: "0.24.0",
		date: "2026-09-09",
		headline: "Declare a function where it belongs, or onto a table.",
		added: [
			"**Declare Function**, which declares a function where the node sits rather than at the top — the other half of Function, the way Declare Type is the other half of Declare Type at Top. Wire a table into **On Table** and it becomes `function TankConfig.read(tank: Model): Config`; leave it unwired for a plain `local function` at that point in the flow.",
		],
		watch: [
			"On Table has to resolve to a name — a variable or a local. Luau has no syntax for attaching a function to an expression, so anything else is refused rather than half-written.",
			"The function is named where it is declared, so a Get Function above it reports that it does not exist yet rather than naming a local that has not been reached.",
		],
	},
	{
		version: "0.23.1",
		date: "2026-09-09",
		headline: "Common types in one click, anything else one click further.",
		changed: [
			"**The type field is a list again, with Other… at the bottom of it.** The list holds this graph's own types, the basic ones, Roblox's values and the instance classes worth a click; Other… opens a field that takes any Luau type, suggesting every class. A type already set to something the list does not hold opens in the field.",
		],
	},
	{
		version: "0.23.0",
		date: "2026-09-09",
		headline: "Say Model, and put a call where a value goes.",
		added: [
			'**Call For Value**, a pure call. It has no execution wire, so a call can sit where a value goes — inside a table, an argument, an expression: `return { movementSpeed = readNumber(hullSettings, "MovementSpeed") }`. Call Function still binds its result to a local, which is what you want when the call changes something.',
			"**Any Luau type can be typed into a type field.** The dropdown of twelve is now a list attached to a text field: the same names, the Instance classes under them, and the types this graph declares above them.",
		],
		changed: [
			"**A pin's type is written as itself.** It used to be checked against a list of fifteen names, and anything else became `any` — so a parameter typed `Model` came out `any`, and so did one typed `Config`, a type the same file had just declared.",
			"**An Instance class fits an Instance pin.** A `Model` goes wherever an `Instance` is wanted. The other way round is a claim about the value rather than a fact about its type, so it still wants a Cast.",
		],
		watch: [
			"A graph with a pin typed as something the old list did not know was emitting `any` for it, and now emits the name. If that name is not a real Luau type, Luau will say so — which it could not do while the type was being thrown away.",
		],
	},
	{
		version: "0.22.1",
		date: "2026-09-09",
		headline: "Align reads the wires, and a knot stops keeping a type it lost.",
		added: ["**Get Name**, a pure node giving `instance.Name` as a `string`."],
		fixed: [
			"**Align follows the wires out from the anchor** rather than the order you clicked. A chain picked out of order left its last hop bent — with a knot, a Get Full Name and a Concatenate, the first two came out flat and Concatenate did not. A selected node with no wired path to the anchor takes the anchor's top edge.",
			"**A knot takes the type of whatever is wired into it, and** `any` **when nothing is.** Its type was fixed when it was made, so cutting the wire into a string knot left a knot that still refused everything but a string — and the only way to rewire it was to delete it.",
			"**Shift- or ctrl-clicking a knot adds it to the selection.** Its pins cover most of it, so the click landed on a pin and cut the wire instead. Cutting still works on the wire itself, where you can see it.",
			"**A knot is easier to hit.** Its pins took 14 of its 22 pixels, leaving a 4px ring to click for selecting or moving it. The ring is 6px wider all round; starting a wire from the pin is unchanged.",
			"**Docs pages scroll past their last line**, so the end of a page can be read somewhere other than the bottom edge of the screen.",
		],
	},
	{
		version: "0.22.0",
		date: "2026-09-09",
		headline: "Straighten two nodes without relaying the whole graph.",
		added: [
			"**Align**, on `A`. Lines a selection up, walking it in the order you picked it. The first node — the anchor, drawn with a heavier ring — does not move; each one after it lines up on the most recently picked node before it that it is wired to, and failing that on the one immediately before it. Where two nodes are wired the pins line up rather than the boxes, so the wire comes out flat. Nothing moves sideways, and comments do not move.",
			"**A Controls page**, under Getting started: every key and mouse gesture the canvas has.",
			"**Get Class Name**, a pure node giving `instance.ClassName` as a `string`.",
		],
	},
	{
		version: "0.21.2",
		date: "2026-09-09",
		headline: "Declare Type says when a Type Of is one too many.",
		fixed: [
			"**Declare Type with a Type Of wired into it** now reports an error instead of emitting `typeof(typeof(x))`, which compiles and gives the type `string`.",
		],
	},
	{
		version: "0.21.1",
		date: "2026-09-09",
		headline: "Name the value a node gives you, without renaming the node.",
		added: [
			"**Result name**, on every node that returns a value. It is the local the result lands in — a Find First Child with the result name `value` emits `local value = ...` — and it shows under the node's header the way Declare Type shows the type it declares.",
		],
		changed: [
			"**A named node keeps its own name on the canvas.** Setting the result name leaves the header alone and adds the name beneath it; a label still replaces the header, as it always has.",
		],
		watch: [
			"A label on such a node still names the result when no result name is set, so graphs built before this emit exactly what they did.",
		],
	},
	{
		version: "0.21.0",
		date: "2026-09-09",
		headline: "Conditions take any value, the way Luau does.",
		changed: [
			"**Not, And, Or, Branch and While take any value, not just a boolean.** Luau has no boolean-only operators: `nil` and `false` are false and everything else is true, so `if not part then` on an `Instance?` is ordinary code and could not be built before.",
			"**And and Or hand back a value rather than a boolean**, which is what they do in Luau: `value or fallback` is the value when there is one. Typing the result `boolean` also annotated it as one in Strict Mode, which does not compile.",
		],
		fixed: [
			"Promote to Variable takes its type from the value sitting in the pin when the pin itself accepts anything, so promoting a Branch condition still gives a boolean.",
		],
		watch: [
			"A node that returns a value names the local it lands in after the node's **Label** — labelling a Find First Child `value` gives `local value = ...` with no second local to rename it. That always worked; the field says so now.",
		],
	},
	{
		version: "0.20.3",
		date: "2026-09-08",
		headline: "Tables can be written one key to a line.",
		added: [
			"**Make Dictionary has a Layout setting**: *Inline*, or *One per line*. Inline is right for two or three keys and unreadable for ten, which is the length a settings table actually is.",
		],
		watch: [
			"stylua breaks a long table for you, but only when it is installed. What the generated file looks like should not depend on whether an optional tool is on PATH, so this does not.",
		],
	},
	{
		version: "0.20.2",
		date: "2026-09-08",
		headline: "Node descriptions in the panel are short, with the rest a click away.",
		changed: [
			"**The Node panel shows the opening of a description rather than all of it**, and ends it with a *See docs page* link to that node's reference entry. Summaries are written for the reference, where a paragraph is right; beside the graph it was a wall.",
			'**Make Dictionary, Get Index and Set Index** call their key styles *Property-like — t.name* and *Bracketed — t["name"]*.',
		],
		watch: [
			"It takes sentences until it has said something rather than exactly one, because plenty of nodes open with a label — *Escape hatch.*, *if / else.* — and one of those alone says less than nothing.",
		],
	},
	{
		version: "0.20.1",
		date: "2026-09-08",
		headline: "The export checkbox says what it is on its own line.",
		fixed: [
			"**Declare Type at Top's export control read as two settings.** It had a heading, *Is Export Type*, and then a checkbox labelled *other modules can use it* — two ways of saying one thing, stacked. It is one line now: the box, and *Is Export Type* beside it. What it means is on hover.",
		],
	},
	{
		version: "0.20.0",
		date: "2026-09-08",
		headline: "String keys are written the way you would write them.",
		changed: [
			'**A string key that is a valid Luau name is now written plainly**: `TankConfig.tuning = TUNING` and `{ turnRate = 45 }`, where before it was always `TankConfig["tuning"]` and `{ ["turnRate"] = 45 }`. Both are the same access and Luau takes either, but only one of them is what anybody writes — and generated files are meant to be read beside hand-written ones.',
			"**Make Dictionary, Get Index and Set Index carry a String keys setting** with the other behaviour kept: *Always brackets*. Which reads better depends on the table, so it is a setting rather than a rule.",
			"Declare Type at Top's shape is called **Table of Fields** or **Custom Luau**.",
		],
		watch: [
			"Anything that cannot be written plainly still is not: a computed key, a number, a name with a space in it, and a reserved word like `end`. Those stay bracketed whatever the setting says, because the short form would not compile.",
			"**Recompiling an existing project will rewrite dictionaries and index assignments.** The generated Luau is equivalent, and the diff is one line per key.",
		],
	},
];
