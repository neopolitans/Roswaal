/**
 * Release notes for 0.30.0 to 0.39.x, newest first.
 *
 * One of the files `../releases.ts` puts together, a tenth of the minor
 * versions each, so the newest notes are not at the top of a very long file.
 */

import type { Release } from "../releases.js";

export const RELEASES_0_30: Release[] = [
	{
		version: "0.39.2",
		date: "2026-09-15",
		headline: "Comments resize from either corner, and long headers print as blocks.",
		affects: ["editor", "docs"],
		added: [
			"**Comments resize from the top-left corner as well as the bottom-right.** The top-left drag moves the box as it shrinks it, so the bottom-right corner stays where it is — a comment can be grown upwards over a node above it without being dragged back afterwards.",
		],
		changed: [
			"**A comment header of more than one line is written as a** `--[[ ]]` **block**, with its lines indented inside it, rather than a run of `--` lines. One line is still written `-- like this`. A header containing `]]` takes a `--[=[` block, or as many `=` as it needs.",
		],
	},
	{
		version: "0.39.1",
		date: "2026-09-15",
		headline: "The Docs tag is a tag again.",
		affects: ["docs"],
		fixed: [
			"**The Docs tag no longer renders as a full-width box on its own line.** Its class was `docs`, and `.docs` is the documentation panel — a bordered, full-height grid — so the tag took the panel's styling.",
			"**Tag rows are one line tall again.** They are a flex row, so the one stretched tag pulled every other tag on the release up to its height — which is what turned 0.37.x's tags into columns.",
		],
		watch: [
			"**A tag's class is** `tag-feature`, `tag-docs` **and so on now**, rather than the bare name. Only a fork styling the documentation itself would notice.",
		],
	},
	{
		version: "0.39.0",
		date: "2026-09-15",
		headline: "A comment you wrote once is read twice.",
		affects: ["editor", "docs"],
		added: [
			"**A comment's header is written into the generated Luau**, above the code of the nodes it is drawn around — once per block, indented with it, and keeping the lines you wrote it on.",
			"**Comment headers**, in Settings: on by default. Off keeps comments in the editor, which is what other visual scripting tools do; **Coming from Blueprints** says so where that habit comes from.",
			"**Docs, Editor and Designer tags** on a release, saying which part of the tool it touched. The releases of 0.36 onwards carry them; anything earlier predates the field, so an absent tag means *not stated* rather than *not affected*.",
		],
		watch: [
			"**A comment holding no nodes writes nothing**, and neither does one with a blank header — a note about nothing in particular is a fair thing to write on a canvas and has no block to head.",
			"**A node inside two comments takes the smaller one.** Two headings over one statement is one heading too many, and the inner comment is the more specific thing said about it.",
			"**Turning it on changes every generated file.** The code is the same; the diffs are not small.",
		],
	},
	{
		version: "0.38.1",
		affects: ["docs"],
		date: "2026-09-15",
		headline: "Attributions says what Roswaal is designed for.",
		added: [
			"**What Roswaal is designed for**, on Attributions and in `ATTRIBUTIONS.md`: **Luau**, **Roblox** and **Lune**, with what each one is and where it reaches the output.",
			"**Non-affiliation said outright for each**, rather than left to be inferred from a licence column.",
		],
		changed: [
			'**Luau moved there from "What Roswaal is built on".** No Luau ships inside Roswaal — Roswaal writes it — and listing it beside the libraries that do overstated the relationship. The attribution its README asks for is unchanged and is still on the page, with the quote.',
		],
		watch: [
			"**Nothing about the tool changed.** This is what the project says about itself, which is the sort of thing that goes stale quietly — Lune had been a compile target for eight releases and was named nowhere.",
		],
	},
	{
		version: "0.38.0",
		affects: ["editor", "docs"],
		date: "2026-09-15",
		headline: "A picker for six hundred classes.",
		added: [
			"**A class picker**, in the shape Studio's Insert Object uses: search at the top, everything below it in columns. Click the Class Name on any node that takes one.",
			"**Grouped by the engine's own inheritance** — every constraint under Constraint, every UI element under GuiBase — rather than by categories invented here.",
			"**The chain under the highlighted class**: `Part › BasePart › PVInstance › Instance › Object`, which answers what a class *is* while you browse.",
			"**Type to search, arrows to move, Enter to take it.** A name the list does not hold is still taken on Enter, because a class newer than your build has to be reachable.",
			"**Roswaal knows the class hierarchy**: 624 superclass links, from the same Creator Hub export.",
		],
		changed: [
			"**A class fits a pin typed as anything it derives from.** A `Part` reaches a `BasePart` pin, a `TextButton` a `GuiObject` one. Only `Instance` was known before, so every narrower version of the same fact wanted a Cast asserting something already true.",
		],
		watch: [
			"**The other direction is still refused.** An `Instance` into a `Part` pin is a claim about what the value is rather than a fact about its type, and Cast is the node that makes that claim out loud.",
		],
	},
	{
		version: "0.37.0",
		affects: ["editor", "designer", "docs"],
		date: "2026-09-15",
		headline: "A Class Name is a list you pick from.",
		added: [
			"**Class Name is a dropdown** on Is A, New Instance, Find First Child Of Class, Find First Child Which Is A, and both Find First Ancestor nodes. Every Instance class the engine has, with the everyday ones first — and a field you type into, so a class newer than your build still works.",
			"**Roswaal knows the engine's vocabulary**: 625 classes, 507 enums, 48 datatypes, the libraries, and both sets of globals. Generated from the Creator Hub by `npm run build:roblox`, and only names — no prose.",
			"**Choices on a pin, in Node Design.** A pack's pin can offer a dropdown of its own; `.nodedef.json` has taken `options` all along and there was no way to set one from the editor that builds them.",
			"**A node's reference page says which pins offer a list**, naming the values when there are few enough to read and counting them when there are not.",
		],
		changed: [
			"**Every Instance class fits an** `Instance` **pin.** It used to be a hand-kept list of fifty-odd, so a `Decal` wanted a Cast to assert something that was already true.",
			"**Other… in the type picker searches every class and datatype**, not the shortlist.",
			"**Custom Code's autocomplete offers the engine's real globals and libraries.** The hand-kept list knew `buffer` and not `bit32`.",
		],
		fixed: [
			"`ScriptSignal` **is gone from the type list.** There is no such class — the signal type is `RBXScriptSignal`, which is a datatype and was already offered as one.",
		],
	},
	{
		version: "0.36.7",
		affects: ["editor", "designer", "docs"],
		date: "2026-09-15",
		headline: "A knot hears its source change its mind.",
		fixed: [
			"**A reroute knot follows its source being retyped**, without the wire having to be redrawn. Give a Declare Local a type, type a loop's Value, retype a function's parameter or a variable — the knots downstream take the new type, and so do the knots after those.",
			"**A wire dragged from an output connects to a knot.** A knot's two pins are stacked at its centre, so the drop landed on the output whatever you aimed at, the two ends were both outputs, and nothing happened. Dragging from an *input* always worked, which is why knots looked like they sometimes took wires and sometimes did not.",
		],
		changed: [
			"**A knot in a drawn graph on these pages is coloured by what it carries too.** The picture under Reroute knots drew two grey dots beside a paragraph saying otherwise.",
		],
		watch: [
			"**A knot was only retyped when a wire was added or removed.** If one has been sitting on the wrong type, it corrects itself the next time you touch the graph.",
			"**Node Design's logic canvas does the same**, as it does for everything else the canvas can do.",
		],
	},
	{
		version: "0.36.6",
		affects: ["editor", "designer", "docs"],
		date: "2026-09-15",
		headline: "A graph's coordinates are its own.",
		fixed: [
			"**A comment takes only what is in its own graph.** Every graph of a file starts at the same origin, so a comment in the nodescript's graph and a function's nodes can sit at the same numbers — and a comment copied from one was coming back with nodes from the other.",
			"**Dragging a comment no longer moves nodes in a graph you are not looking at.** The same question, asked by the drag since function graphs existed.",
			"**Paste lands at the pointer for anything copied inside a function's graph.** It was testing whether a thing had been copied from the nodescript's own graph, which is no for everything copied while a function is open — so the pointer was ignored in exactly the graphs most of the work happens in.",
		],
		added: [
			"**Copy, cut, paste and duplicate in Node Design's logic canvas**, on the same terms as a graph. They live in the graph editor's shell, which the designer page does not have, so they had never been there. Node Inputs and Node Outputs are left out of all four — there is one of each and they are already present.",
		],
		watch: [
			"**A copied function still keeps its body's layout.** Only its declaration lands at the pointer; the nodes inside it stay where they are in the copy's own graph.",
		],
	},
	{
		version: "0.36.5",
		affects: ["editor", "docs"],
		date: "2026-09-15",
		headline: "A copied comment brings what it is drawn around.",
		fixed: [
			"**Copying a comment copies the nodes inside it**, and the wires between them. It used to copy the rectangle alone — so pasting gave an empty box, which then landed over whatever was already there and enclosed that instead.",
			"**A comment inside a copied comment comes too**, with everything in it.",
		],
		changed: [
			"**Cut takes away exactly what it took a copy of.** Cutting a comment removes the nodes it encloses, so the paste is the group rather than a second set of it.",
		],
		watch: [
			"**Delete is unchanged.** Removing a comment removes the note and leaves the nodes, as it always has — a key that quietly took eleven nodes with it is not one to find out about by accident.",
			"**A node does not bring its comment.** Copying something that happens to sit inside a comment copies the node, exactly as dragging it does.",
		],
	},
	{
		version: "0.36.4",
		affects: ["editor", "docs"],
		date: "2026-09-15",
		headline: "A paste lands where you are pointing.",
		changed: [
			"**Paste and Duplicate put the clipping's top-left corner at the pointer**, instead of beside what it was copied from. The corner is the furthest up and left of everything in the clipping, comments included.",
			"**Ctrl+D goes to the pointer too**, because a duplicate is a paste with a different source and had the same problem.",
		],
		fixed: [
			"**A copied comment no longer encloses the originals as well as the copies.** Membership is worked out from the geometry when a drag starts, so a comment dropped on top of what it was copied from really did contain both — and dragging it afterwards took all of them.",
		],
		watch: [
			"**With the pointer off the canvas, a paste still offsets from the original**, which is what it always did. A keystroke does not say where the mouse is, and a mouse in a panel is not a place you chose.",
			"**A node inside a pasted function does not move.** It keeps its position in that function's own graph, which is not the graph you are pointing at; only the declaration lands at the pointer.",
		],
	},
	{
		version: "0.36.3",
		affects: ["editor", "docs"],
		date: "2026-09-15",
		headline: "A loop says what it is looping over.",
		added: [
			"**Key type and Value type on For Each**, in the Inspector, and **Value type** on For Each (Array). Luau takes an annotation on a `for` binding, so it is written where the variable is introduced: `for part: BasePart, transparency: number in pairs(parts) do`.",
			"**The types reach the pins too.** A Value typed `BasePart` gives a `BasePart` pin — coloured as one, and wired to things that want one — whether or not the annotation is written.",
		],
		watch: [
			"**An array's index is not offered a type.** `ipairs` hands back a number, and writing `i: number` says what the loop already said.",
			"**The annotation follows the graph's typecheck mode**, as every other one does: Strict and Nonstrict write it, Default does not. The pin is typed either way.",
			"**Blank means no annotation**, not `any`, so a loop nobody has typed compiles to exactly the line it always did.",
		],
	},
	{
		version: "0.36.2",
		affects: ["editor", "docs"],
		date: "2026-09-15",
		headline: "A field read twice is written twice.",
		changed: [
			"**A plain access path read more than once is written again rather than hoisted into a local.** `restore.weld` at both use sites, not `local weld = restore.weld` beside them — which is what hand-written Luau does, and what `Occupancy.VALUE_NAME` was already doing everywhere except through Get Key.",
			"**A path reached through a call still gets its local**, because the call would otherwise run twice. So does an expression, and anything else that is work rather than a name.",
		],
		fixed: [
			'**A field read twice now really is read twice.** The local was a snapshot: a Set Index between the two reads never reached it, so the graph said "read this field here" and the file did not.',
		],
		watch: [
			'**Naming the result still asks for the local**, and is now the way to say "read this once and keep it" — worth it for an instance property read several times in a row, where each read crosses into the engine.',
			"**Recompiling will drop these locals from generated files.** Every graph that read a field or a constant twice loses a line and reads the path at each use instead.",
		],
	},
	{
		version: "0.36.1",
		affects: ["editor", "docs"],
		date: "2026-09-15",
		headline: "The node search asks the same scope question the panel does.",
		fixed: [
			"**The node search offers only the locals the graph on screen can reach.** Searching `restore` in `show`'s graph offered `Get restore` for a local that `hide` declares, and picking it gave a Get Local the compiler then refused. The Variables panel was scoped in 0.36.0; the search was not, and both now read one rule.",
			"**A parameter is offered only inside the body it belongs to.** A function's in its own graph, a Connect or Once handler's where its node is drawn.",
		],
		watch: [
			"**Script variables and functions are still listed everywhere.** A variable is readable from anywhere by construction, and the list of a file's functions is how you move between them — neither is scoped, and neither is an oversight.",
		],
	},
	{
		version: "0.36.0",
		affects: ["editor", "docs"],
		date: "2026-09-15",
		headline: "A name lasts as long as its block, and a chain of conditions is one chain.",
		added: [
			"**Key name and Value name** on For Each and For Each (Array), in the Inspector. Left blank they are `key` and `value`, as before.",
			"**Cast, in the Inspector**: **Automatic** is the old rule, **Explicit** always writes `local part = value :: BasePart`, and **Implicit** never writes a line.",
			"**An implicit Cast inside the True arm of a Branch on Is A writes nothing at all.** Luau has already narrowed the value there. Two classes tested with **Or** narrow to the union, so a cast to `Decal | Texture` disappears in that arm and a cast to either half stays.",
			"**Brackets**, on And, Or, Not and the comparison pills: wrap the result in `( )`, or leave it to Luau's precedence.",
			"**New logic nodes**, in Settings, chooses which of those a pill you drop starts as.",
			"**Indent with**, in Settings: a tab, or 2, 3, 4 or 8 spaces. Written to `roswaal.json` as `indentStyle` and `indentWidth`, and handed to stylua as well.",
			"**Get ‹parameter›** in the node search, one per parameter of every function and handler in the graph, with Get Parameter's From and Parameter already filled in.",
			"**A comment's colour**, in the Inspector: eight swatches, or a hex typed in.",
			"**Drag a tab to reorder the row**, and a list at the end of the row naming every open graph.",
		],
		changed: [
			"**A Branch wired into a Branch's False pin compiles to** `elseif`. A chain of conditions is one `if` statement at one level of indentation, ending in one `end`, instead of a nested `if` per condition. A condition that has to work something out first still gets its own `else` block, because `elseif` has nowhere to put the line.",
			"**Parentheses are written where Luau's precedence needs them and nowhere else.** `not humanoid or not root` rather than `(not humanoid) or (not root)`.",
			"**A local's name is taken for as long as its block, not for the whole file.** Two functions can both call a parameter `character`, and two loops can both call their value `part`; a name an *enclosing* block holds is still avoided, so nothing shadows.",
		],
		fixed: [
			"**A graph whose own tab was closed while one of its function tabs stayed open can be opened again.** It was still loaded, so opening it took the \"already open\" path and found no tab to go to; double-clicking it in the tree did nothing until the function's tab was closed. Its tab now comes back in front of its functions', keeping the history and any unsaved edits.",
			"**The Variables panel lists the locals and types the graph on screen can actually reach.** A local declared inside `hide` was listed while `show` was open, and dragging it out gave a Get Local the compiler then refused. A file's own locals still show inside a Declare Function, which closes over them — but not inside a hoisted Function, which is written above them.",
		],
		watch: [
			"**Recompiling a graph will reformat parts of the generated file.** The parentheses, the `elseif` chains and any name that had picked up a `2` all change at once. The programs are the same; the diffs are not small.",
		],
	},
	{
		version: "0.35.0",
		date: "2026-09-14",
		headline: "Pins sit on the edge they wire to.",
		changed: [
			"**An execution pin is an equilateral triangle**, pointing right, hung just outside the node's border instead of drawn inside it.",
			"**Every other pin is balanced halfway over the border**, which is where its wire ends. Pin names and inline value fields have not moved.",
			"**An unwired pin sits in a dark well** rather than taking the colour of whatever is behind it.",
			"**Node pictures in the docs show the same pins**, and a worked example's stand-in value sits below the execution line rather than across it.",
			"`NOTICE.md` **is now** `ATTRIBUTIONS.md`, and mirrors the Attributions page as tables.",
			"**Attributions names two more inspirations**: Unity Visual Scripting (Bolt) and Blender.",
		],
	},
	{
		version: "0.34.0",
		date: "2026-09-13",
		headline: "Design a node by building it.",
		added: [
			"**Node Design is a visual editor.** It opens on the project's packs and the built-in library, as cards or a list.",
			"**Pack actions**: New pack, Import from a project, Duplicate, Copy to another project, Copy JSON, Show in file manager and Delete. A Luau pack opens read-only, with Save as JSON pack.",
			"**A node is built on a canvas of its own.** Drag a pin type onto either side, click a pin to edit it, type the title on the header, and draw a pure node with no inputs and one output as a pill.",
			"**Logic in Luau, or built from nodes.** The Nodes tab builds a node's logic between Node Inputs and Node Outputs, and compiles it to Luau as you go.",
			"**A pack can require other packs**, whose nodes its logic can use. A required pack the project does not have is marked.",
			"**Runs on**, in a node's details: Roblox, Lune, or both. Logic built from nodes narrows it, and a node that would run on nothing cannot be saved.",
			"**Name in the graph tools**, in Settings, shows the graph's name at the start of the tools over the canvas.",
			"**Creating custom nodes has Node Design - Visual and Node Design - Luau tabs**, with worked examples of each kind of template.",
		],
		changed: [
			"**The graph's tools float over the canvas** in three groups, instead of taking a row above it.",
			"**The node designer is called Node Design**, and its header has help and Docs buttons. Both headers say Open Editor.",
			'**A node pack can draw a pure node as a pill**, with `"display": "compact"`.',
		],
		watch: [
			"**A step node with no execution input loads with a warning**: nothing can run it.",
			"**The designer form is gone.** Nodes are made in Node Design's editor.",
		],
	},
	{
		version: "0.33.1",
		date: "2026-09-13",
		headline: "Preview the function you are in.",
		fixed: [
			"`P` **in a function's tab with nothing selected previews that function**, not the whole script. The nodescript's own graph still previews the whole script.",
		],
	},
	{
		version: "0.33.0",
		date: "2026-09-13",
		headline: "Every function opens in its own graph.",
		added: [
			"**Function graphs.** A function's nodes are in a graph of its own, in a tab marked **ƒ** and named for the function and its script: `hide (Occupancy)`.",
			"**Functions in the project tree.** A graph with functions has an arrow that lists them. Double-click one to open its graph.",
			"**Double-click a Declare Function** to open its graph, or use the **ƒ** on its header.",
			"**Shorten function tabs**, in Settings: **None**, **Function name** or **Script name**.",
			"**Coming from Blueprints has a Macro row**: no counterpart, and the Luau that does the job instead.",
			"**A Functions guide**: the two declarations, a function's graph, and what can reach inside one.",
			"`P` **with nothing selected previews the whole script.** The preview button is in the bar whether or not anything is selected.",
			"**Contributing says Lune comes first.** Where possible and feasible, Lune bugfixes and features are prioritized. Roblox Studio fixes and features are still considered.",
		],
		changed: [
			"**A hoisted Function is drawn only in its own graph**, which opens when you add one.",
			"**Declare Function is drawn in two graphs.** In the flow it has In, Then, On Table and Function; in its own graph it is the entry, with Body and its parameters.",
			"**Select all, marquee select, Realign and align act on the graph on screen.**",
			"**Deleting a function deletes its graph**, and asks first when there are nodes in it. Copying a function copies its graph.",
			"**Clicking a function in the Variables panel opens its graph.** Clicking a local, a type or a diagnostic goes to the graph its node is in.",
			"**A Lune graph has no script class.** Its bar has no class picker, and a Module Exports node is what makes it a module.",
			"**Get Parameter lists the function it is inside first.**",
			"**Function and Declare Function's descriptions** say which graph each is drawn in.",
		],
		watch: [
			"**A graph with functions is split into function graphs when it is opened.** The Luau it compiles to does not change. A wire between two graphs is an error.",
			"**A Lune graph with Module Exports now returns its exports**, whatever class it had. One without is a plain script.",
		],
	},
	{
		version: "0.32.0",
		date: "2026-09-12",
		headline: "Read a parameter where you use it.",
		added: [
			"**Get Parameter**: a function's parameter as a value, read by name rather than by a wire back to the declaration. In a function of any size those wires cross the whole body — this is the trade Get Local already makes against wiring a Declare Local everywhere. The pins are still there.",
			"**It works in an event handler too.** Connect binds its handler's parameters exactly as a function does, so a Get Parameter inside one reads them the same way.",
			"**Functions in the Variables panel**, beside Locals and Types. Click one to select its declaration — useful when it is somewhere off screen in a large graph — or drag it onto the canvas for a Get Function.",
		],
		changed: [
			"**Renaming a parameter carries its readers with it.** Reordering leaves them alone, because a Get Parameter holds the name rather than the position. Removing one leaves the node saying which parameter is gone, rather than quietly reading whichever took its place.",
		],
		watch: [
			"A Get Parameter only resolves **inside the body it belongs to** — that is what a parameter is. Outside one it reports that it is not inside the function, naming both.",
		],
		verified: ["variables-and-locals"],
	},
	{
		version: "0.31.6",
		date: "2026-09-12",
		headline: "A comment about nothing in particular.",
		changed: [
			"`C` **no longer needs a selection.** With nodes picked it still draws a comment around them; with nothing picked you get an empty one, placed where the canvas is looking rather than at the far corner of the graph.",
		],
		added: [
			"**The Controls page says how to make a comment** — by key and by right-click — which it never did.",
		],
		verified: ["controls"],
	},
	{
		version: "0.31.5",
		date: "2026-09-12",
		headline: "Hot reload is Dynamic compiling.",
		changed: [
			"**Compile is Manual or Dynamic.** Roswaal compiles a graph and Rojo syncs it — nothing is reloaded — and *Dynamic* reads as the opposite of *Manual* in a way the old name never did.",
			"**The toolbar names what the buttons set**, reading Compile: Manual | Dynamic rather than leaving it to a hover title. Settings says the same two words, where it used to say Manually and On every change.",
		],
		watch: [
			'`roswaal.json` **is untouched.** The setting is still stored as `compileMode: "hot"`, so every existing project keeps working and an older Roswaal can still read a file this one writes. The settings page names both, for anyone editing that file by hand.',
		],
	},
	{
		version: "0.31.4",
		date: "2026-09-12",
		headline: "A local says its name, and a node can be as wide as its header.",
		added: [
			"**Long names**, in Settings. Keep cutting a header short when it does not fit — what nodes have always done — or widen the node to it instead. Widening moves pins, so wires and the pictures in the documentation are drawn from the same width.",
		],
		changed: [
			"**Declare Local shows the local's name** beside its title: `Declare Local (restores)`, with the declared type still underneath. One you have not named reads as it did.",
			"**Casting and annotations describes the type picker**: the grouped list, the field **Other…** opens, and when to declare a type once instead of typing it into three pickers.",
		],
		verified: ["casting", "settings"],
	},
	{
		version: "0.31.3",
		date: "2026-09-12",
		headline: "A dictionary's row is a pair you can split.",
		changed: [
			"**Make Dictionary's rows are Key Value Pairs.** A row is one pin: split it for the Key and Value you type into, or leave it whole and wire a pair in. Rows arrive split, so a placed node reads as it always did.",
			"**A pair dropped on the node takes a whole row**, instead of landing on a Value pin beside a Key it would not use.",
			"**The + and − call them pairs**, and add one row rather than two pins.",
		],
		watch: [
			"An existing Make Dictionary opens with its rows split, keeping every key, value and wire. A row that was fed by a Key Value Pair stays whole, with the wire on the row itself.",
		],
	},
	{
		version: "0.31.2",
		date: "2026-09-12",
		headline: "A result keeps the name you gave it.",
		added: [
			"**Naming a result**, on Variables and locals: what Result name does, and why naming a result *and* declaring a local gives you two locals.",
			"**Every node that returns a value says so on its page**, with the same note.",
		],
		changed: [
			"**A pure node binds under the name you typed.** Result name was read only on nodes with an execution wire, so a Find First Child named `value` came out as `local Child`.",
			"**A result name binds even where one place reads it.** It used to take two readers before the name was used at all.",
			"**Result name is offered on pure nodes** in the Inspector, and shows under the node's header.",
			"**Find First Child is in Instances**, beside the other questions. Its id is unchanged, so saved graphs open as they did.",
			"**A Return's and a Module Exports' pins can be typed into** where the type has a value to type: number, string, boolean, table. An untyped pin still asks for a wire.",
		],
		fixed: [
			"An operator pill's corners scaled with its height, so a three-input pill was an ellipse with its pins outside it.",
			"The error count on a pill or a capsule sat off the shape rather than on its corner.",
		],
	},
	{
		version: "0.31.1",
		date: "2026-09-11",
		headline: "A question is pure, and a page you can edit in place.",
		added: [
			"**Pictures in a proposal**: add a node picture from the palette, or a graph picture from a script in the open project, and the proposal carries it as source.",
		],
		changed: [
			"**Suggest an edit is the pencil** beside a page's title, and edits the page where it stands — every block stays rendered, and clicking one opens that block's editor. Blocks can be added, moved and removed.",
			"**Find First Child is pure**, like the other questions in Engine. Wire Child into Declare Local and the result is one line.",
			"**Recursive is optional** on Find First Child and Find First Child Which Is A. Leave it empty and Roswaal writes the call without it.",
		],
		watch: [
			"An existing Find First Child opens without its execution wires, which are joined past it, and without its Result name. The local now comes from a Declare Local wired to Child; before, the node wrote one itself and a Declare Local after it wrote a second.",
		],
	},
	{
		version: "0.31.0",
		date: "2026-09-11",
		headline: "A form over a node, and a toolbar that says less.",
		added: [
			"**The node designer**: a form over a node definition, with the node drawn beside it as you fill it in. From the toolbar, or at `/designer`.",
			"**The designer saves into a pack you choose** — an existing one or a new one — and reopens the project, so the node is in the palette straight away. It also copies the node as JSON or as Luau.",
			"**Creating custom nodes**, a page that switches between the three routes to one: the designer, a Luau pack, and Roswaal's own library.",
			"**Command line**, a page listing every command and option, built from the same list `roswaal help` prints.",
			"**Casting and annotations**, its own page: the three cast nodes, declaring a type in three shapes, what Roswaal writes into the file, and where types are offered.",
			"**Suggest an edit**, at the foot of every documentation page. Rewrite the page and it opens as an issue with the page and version filled in.",
			"`roswaal version` is in `roswaal help`. It has always worked and appeared in no list.",
			"**The daemon prints the documentation's address** under the editor's.",
		],
		changed: [
			"**The toolbar is icons**, with the label as the tooltip. Compile keeps its words in both bars, and so do the controls that show a setting rather than doing something.",
			"**The README is a front door**: install, start, where the documentation is, and the licence. Everything else it described is in the documentation, which stays in step with the code.",
			"**Casting moved off Roswaal types** onto the new page, with the type features added since it was written.",
			"**The daemon's hint says Ctrl+Click** to open the editor URL, which is what PowerShell and cmd.exe need and neither says.",
		],
	},
	{
		version: "0.30.0",
		date: "2026-09-11",
		headline: "Reach a local by name, and key a table by anything.",
		added: [
			"**Get Local** reads a Declare Local's value wherever it is in scope — inside a function declared further down, without a wire back across the graph.",
			"**The Variables panel lists this graph's locals and types.** Drag a local out for a Get Local; drag a type out for a local of that type, or a Cast with Ctrl held.",
			"**Set Key and Get Key** take a name, or any key wired in — `restores[character]`. Set Index and Get Index take a number.",
			"**Key Value Pair**, one entry for Make Dictionary with its key and value wired in together.",
			"**Declare Type takes a table of fields, or Luau written out**, as well as the type of a wired value.",
			"**Declare Local takes a type**, written after the name: `local restores: { [Model]: Restore } = {}`.",
			"**Types are coloured as types** in Custom Code and Luau Expression — annotations, casts and type declarations — and every theme carries a colour for them.",
			"**Comment headers hold several lines** and grow to fit what they say.",
			"**Custom Code is offered the locals a Declare Local made** and the parameters of the function it sits in. A Luau Expression is offered the scope of wherever it is read.",
			"**The types a required module exports** are offered wherever a type is chosen, as `Config.Tuning`.",
		],
		changed: [
			"**Comparisons, And, Or, Not and Nil are drawn as pills**, with the Luau operator in the middle rather than a header above two pins.",
			"**A type that is more than a name is written as itself.** `{ [Model]: Restore }` on a parameter or a local used to come out `any`.",
			"**Escape in a comment header saves.** Enter adds a line; clicking anywhere else saves too.",
		],
		fixed: [
			"**A pin lights up while a wire is in flight exactly when it would take the drop.** A number dimmed a string pin it would then accept, and a typed-in-only pin lit up and then refused.",
			"**A Model wired into an Instance pin no longer warns at compile.** The editor allowed it and the compile disagreed.",
			"**Dropping a data wire on a Sequence or a function no longer leaves an empty pin behind** that nothing could connect to.",
			"**The palette no longer offers a node whose only matching pin must be typed in.**",
			"**A node map whose** `$path` **is not on disk is no longer written.** The error was reported and the file went out anyway.",
			"**Ctrl+S with a node map open writes the map**, rather than compiling the graph behind it.",
			"**Moving or renaming a graph keeps its tab pointed at the file.** The next save used to write it back where it had been.",
			"**One file StyLua cannot parse no longer turns formatting off** for every file after it.",
			"**The overwrite link shows only where overwriting would do something** — not on a graph held back by its own errors.",
			"**Files deleted because a graph moved are listed**, in the status panel and on the command line.",
			"`--yes` **is in** `roswaal help`.",
			"**The docs window follows a link back to the page it was opened on.**",
		],
		watch: [
			"A Set Index or Get Index keyed by a name becomes Set Key or Get Key when the graph is opened. The Luau is unchanged; the node's id in the file is not.",
			"A Key Value Pair connects only to Make Dictionary's value pins, `any` included.",
		],
	},
];
