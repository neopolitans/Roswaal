/**
 * Release notes.
 *
 * Hand-written, because "what changed and why it matters to you" is a judgement
 * a generator cannot make — a commit log is a record of work, not a record of
 * consequences. But the newest entry's version is checked against
 * `version.json` by a test, so the notes cannot silently fall a release behind
 * the thing they claim to describe.
 *
 * The rule for writing one: **an entry earns its place by changing what a
 * reader would do.** A refactor with no visible effect does not go here. A
 * behaviour that used to be one thing and is now another always does, even when
 * the change was a fix, because somebody has built a habit on the old one.
 *
 * And an entry **describes the change, it does not argue for it**. Saying a
 * behaviour is intentional is fair when a reader would otherwise report it as a
 * bug; explaining why it was chosen, what the alternative was, or what the
 * trade-off cost is not. That reasoning lives in `NOTES.md`, which is where
 * somebody goes when they want it — rather than being put in front of everyone
 * who opened a changelog to find out what is different.
 */

/**
 * A part of the tool a release can say it touched.
 *
 * Here rather than beside the other tags in `site.ts` because `site.ts` imports
 * this file and not the other way round — a type-only cycle compiles and is
 * still a cycle to read.
 */
export type ReleaseSurface = "editor" | "designer" | "docs";

export interface Release {
	version: string;
	/** ISO date. Absolute, so it still means something in six months. */
	date: string;
	/** One line: what this release is about. */
	headline: string;
	added?: string[];
	changed?: string[];
	fixed?: string[];
	/** Behaviour somebody may have relied on that now works differently. */
	watch?: string[];
	/**
	 * Slugs of documentation pages marked Reviewed or Verified in this release,
	 * listed under their own headings as links. Slugs rather than titles so a
	 * renamed page cannot leave an entry naming something that is gone; a test
	 * holds each one against `REVIEWS`.
	 */
	reviewed?: string[];
	verified?: string[];
	/**
	 * Set when upgrading can break working code, which is the one thing the tags
	 * on a release cannot work out for themselves: Feature, Change and Bugfix
	 * follow from whether `added`, `changed` and `fixed` have entries, but
	 * whether a change breaks somebody is a judgement about *their* code.
	 *
	 * Not the same as `watch`, which is often just worth knowing. This is for
	 * "something that worked will stop".
	 */
	breaking?: boolean;
	/**
	 * Which surfaces this release touched: the editor, Node Design, the
	 * documentation.
	 *
	 * Stated rather than derived, because no shape of a release note says which
	 * part of the tool changed. Absent means *not stated*, not *not affected* —
	 * releases before 0.39.0 predate the field.
	 *
	 * The point of it is a reader scanning for one thing. Somebody who only
	 * writes graphs does not need to read a Designer release, and somebody
	 * keeping a fork's documentation in step needs exactly the Docs ones.
	 */
	affects?: ReleaseSurface[];
}

/** Newest first. */
export const RELEASES: Release[] = [
	{
		version: "0.43.1",
		date: "2026-09-15",
		headline: "Shows fills its row, and the documentation's casts were checked.",
		affects: ["editor", "docs"],
		fixed: [
			"**A segmented control in the Inspector fills its field**, the way the dropdowns and text fields beside it do. **Shows** was sitting in the corner of a full-width box with the rest of the row empty.",
		],
		changed: [
			"**The casts' pictures in the documentation are held to the canvas's** by a test of their own: the pill, its symbol, the field in the column reserved for it, and the width of a cast set to show its name. The pages draw with their own renderer, so a stylesheet fix on the canvas said nothing about them.",
		],
		verified: ["attributions"],
	},
	{
		version: "0.43.0",
		date: "2026-09-15",
		headline: "The pill's field sits where the pill reserved room for it.",
		affects: ["editor", "docs"],
		fixed: [
			"**A pill's inline field no longer sits on top of its symbol and its result pin.** Every pill reserves a column for the field between the pins and the symbol, and the stylesheet was pushing it to the right-hand edge instead — which put a cast's type over the `::` and under the output.",
		],
		added: [
			"**A cast's Type is a list you pick from**: Luau's own types, then Roblox's datatypes, then every Instance class, grouped as the class picker groups them. Whatever you type is still committed, so an intersection like `Model & { Humanoid: Humanoid }` is written the way it always was.",
			"**Shows**, in the Inspector, swaps a cast's `::` for the node's name — `Cast`, `Cast Array`, `Cast Through Any` — for anybody who would rather read the word. Stored on the node, because it sets the pill's width; **New cast nodes** in Settings decides what a new one starts as.",
			"**Wait For Child (Value)** is the same call with no execution wire, for the line that reads `local remote = ReplicatedStorage:WaitForChild(\"Remote\")`. It still yields, and still says so with the clock — reach for the original when the waiting is the step.",
		],
	},
	{
		version: "0.42.0",
		date: "2026-09-15",
		headline: "A cast is shaped like a cast.",
		affects: ["editor", "docs"],
		changed: [
			"**Cast, Cast Array and Cast Through Any are drawn as pills**, the shape the comparisons and **and** / **or** already use: the value and the type down the left, the symbol in the middle — `::`, `:: { }`, `:: any ::` — and the result on the right. Same pins, same generated line; a cast now reads as the operator it is instead of as a box with a header saying what the symbol says.",
		],
		watch: [
			"A pill has no header, so a **name typed into Label** on a cast is no longer drawn on the node — it still names the local the cast binds, and is still shown in the Inspector and on hover. Every other pill has always worked this way.",
			"**Brackets** is not offered for a cast. A cast already writes `(value :: T)`, and the toggle would add a second pair.",
		],
	},
	{
		version: "0.41.0",
		date: "2026-09-15",
		headline: "Ask a service what it can do.",
		affects: ["editor", "docs"],
		added: [
			"**Drag a wire off a service and drop it on empty canvas**, and the menu opens on that service's own methods, under its name. Picking one places the Service Function already set to that call, with the wire landed on it. Everything else that could take an Instance is still listed underneath.",
			"**Service Function's first pin is the service the call is made on.** Wired, the value on it is what the method runs against. Left alone it is nothing at all: the service is reached and hoisted the way Get Service reaches it, which is what the node did before this pin existed.",
		],
		changed: [
			"**A wire carrying a class the method does not belong to is now a warning** — a Humanoid on a `Debris:AddItem` — rather than silence. Only where the pin names a class: an `Instance` claims nothing and is refused nothing.",
		],
	},
	{
		version: "0.40.0",
		date: "2026-09-15",
		headline: "Every method a service has, without a node each.",
		affects: ["editor", "docs"],
		added: [
			"**Service Function** and **Service Function (Value)** call a method on a Roblox service. Pick the call in the Inspector — `RunService:IsServer`, `Debris:AddItem`, `TweenService:Create` — and the arguments arrive named and typed from the method's own signature, with the result pin typed to what it returns. The value node has no execution pins, so it wires straight into the Branch or the loop that wanted the answer.",
			"**The node palette lists every method by name.** Searching `IsServer` finds `RunService:IsServer`, and picking it places the node already set to that call. They appear once you have typed something rather than in the browsing list, which is three hundred entries long.",
			"**The service is hoisted**, exactly as Get Service hoists it: one `local RunService = game:GetService(\"RunService\")` at the top of the file, shared with every node that asked for the same service.",
			"**A catalogue of 322 methods across 36 services**, built from Roblox's documentation and shipped with Roswaal — no network at build time or run time. Methods behind a security context and deprecated ones are not offered; methods a service inherits are, down to `Instance`, whose own methods have nodes already.",
			"**An enum argument is typed as its member name** — `E`, `Begin` — and written out as `Enum.KeyCode.E`. An optional argument nothing set is left out of the call rather than passed as nil.",
			"**A new guide**, [Services and their methods](services), on Get Service, the two nodes, and what the catalogue holds.",
		],
		watch: [
			"The method list is a **snapshot of Roblox's documentation at this build**. A method newer than it is not on the list and still compiles: type it into the picker and set Arguments in the Inspector.",
		],
	},
	{
		version: "0.39.2",
		date: "2026-09-15",
		headline: "Comments resize from either corner, and long headers print as blocks.",
		affects: ["editor", "docs"],
		added: [
			"**Comments resize from the top-left corner as well as the bottom-right.** The top-left drag moves the box as it shrinks it, so the bottom-right corner stays where it is — a comment can be grown upwards over a node above it without being dragged back afterwards.",
		],
		changed: [
			"**A comment header of more than one line is written as a `--[[ ]]` block**, with its lines indented inside it, rather than a run of `--` lines. One line is still written `-- like this`. A header containing `]]` takes a `--[=[` block, or as many `=` as it needs.",
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
			"**A tag's class is `tag-feature`, `tag-docs` and so on now**, rather than the bare name. Only a fork styling the documentation itself would notice.",
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
			"**Luau moved there from \"What Roswaal is built on\".** No Luau ships inside Roswaal — Roswaal writes it — and listing it beside the libraries that do overstated the relationship. The attribution its README asks for is unchanged and is still on the page, with the quote.",
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
			"**Every Instance class fits an `Instance` pin.** It used to be a hand-kept list of fifty-odd, so a `Decal` wanted a Cast to assert something that was already true.",
			"**Other… in the type picker searches every class and datatype**, not the shortlist.",
			"**Custom Code's autocomplete offers the engine's real globals and libraries.** The hand-kept list knew `buffer` and not `bit32`.",
		],
		fixed: [
			"**`ScriptSignal` is gone from the type list.** There is no such class — the signal type is `RBXScriptSignal`, which is a datatype and was already offered as one.",
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
			"**A field read twice now really is read twice.** The local was a snapshot: a Set Index between the two reads never reached it, so the graph said \"read this field here\" and the file did not.",
		],
		watch: [
			"**Naming the result still asks for the local**, and is now the way to say \"read this once and keep it\" — worth it for an instance property read several times in a row, where each read crosses into the engine.",
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
			"**A Branch wired into a Branch's False pin compiles to `elseif`.** A chain of conditions is one `if` statement at one level of indentation, ending in one `end`, instead of a nested `if` per condition. A condition that has to work something out first still gets its own `else` block, because `elseif` has nowhere to put the line.",
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
			"**`NOTICE.md` is now `ATTRIBUTIONS.md`**, and mirrors the Attributions page as tables.",
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
			"**A node pack can draw a pure node as a pill**, with `\"display\": \"compact\"`.",
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
			"**`P` in a function's tab with nothing selected previews that function**, not the whole script. The nodescript's own graph still previews the whole script.",
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
			"**`P` with nothing selected previews the whole script.** The preview button is in the bar whether or not anything is selected.",
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
			"**`C` no longer needs a selection.** With nodes picked it still draws a comment around them; with nothing picked you get an empty one, placed where the canvas is looking rather than at the far corner of the graph.",
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
			"**`roswaal.json` is untouched.** The setting is still stored as `compileMode: \"hot\"`, so every existing project keeps working and an older Roswaal can still read a file this one writes. The settings page names both, for anyone editing that file by hand.",
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
			"**`roswaal version`** is in `roswaal help`. It has always worked and appeared in no list.",
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
			"**A node map whose `$path` is not on disk is no longer written.** The error was reported and the file went out anyway.",
			"**Ctrl+S with a node map open writes the map**, rather than compiling the graph behind it.",
			"**Moving or renaming a graph keeps its tab pointed at the file.** The next save used to write it back where it had been.",
			"**One file StyLua cannot parse no longer turns formatting off** for every file after it.",
			"**The overwrite link shows only where overwriting would do something** — not on a graph held back by its own errors.",
			"**Files deleted because a graph moved are listed**, in the status panel and on the command line.",
			"**`--yes` is in `roswaal help`.**",
			"**The docs window follows a link back to the page it was opened on.**",
		],
		watch: [
			"A Set Index or Get Index keyed by a name becomes Set Key or Get Key when the graph is opened. The Luau is unchanged; the node's id in the file is not.",
			"A Key Value Pair connects only to Make Dictionary's value pins, `any` included.",
		],
	},
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
			"types", "variables-and-locals", "building-and-rojo", "hand-written-luau", "settings",
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
			"**Find First Child has Recursive**, an optional input that searches every descendant rather than only the children: `part:FindFirstChild(\"Handle\", true)`. Left unset, the call is unchanged.",
		],
		changed: [
			"**Wires and pins** and **Building, and node maps** are rewritten to match the current editor.",
			"**Declare Function has a red header**, the same as Function.",
		],
		fixed: [
			"**Ctrl+C stops `roswaal serve` and `roswaal watch` without a `Terminate batch job (Y/N)?` prompt** or a `^C` over the last line, when run through `bin/roswaal.cmd`.",
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
			"**Its header reads `Declare Function (name)`**, with the signature underneath, instead of replacing the node's name with the function's.",
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
			"**Call For Value**, a pure call. It has no execution wire, so a call can sit where a value goes — inside a table, an argument, an expression: `return { movementSpeed = readNumber(hullSettings, \"MovementSpeed\") }`. Call Function still binds its result to a local, which is what you want when the call changes something.",
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
		added: [
			"**Get Name**, a pure node giving `instance.Name` as a `string`.",
		],
		fixed: [
			"**Align follows the wires out from the anchor** rather than the order you clicked. A chain picked out of order left its last hop bent — with a knot, a Get Full Name and a Concatenate, the first two came out flat and Concatenate did not. A selected node with no wired path to the anchor takes the anchor's top edge.",
			"**A knot takes the type of whatever is wired into it, and `any` when nothing is.** Its type was fixed when it was made, so cutting the wire into a string knot left a knot that still refused everything but a string — and the only way to rewire it was to delete it.",
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
			"**Make Dictionary, Get Index and Set Index** call their key styles *Property-like — t.name* and *Bracketed — t[\"name\"]*.",
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
			"**A string key that is a valid Luau name is now written plainly**: `TankConfig.tuning = TUNING` and `{ turnRate = 45 }`, where before it was always `TankConfig[\"tuning\"]` and `{ [\"turnRate\"] = 45 }`. Both are the same access and Luau takes either, but only one of them is what anybody writes — and generated files are meant to be read beside hand-written ones.",
			"**Make Dictionary, Get Index and Set Index carry a String keys setting** with the other behaviour kept: *Always brackets*. Which reads better depends on the table, so it is a setting rather than a rule.",
			"Declare Type at Top's shape is called **Table of Fields** or **Custom Luau**.",
		],
		watch: [
			"Anything that cannot be written plainly still is not: a computed key, a number, a name with a space in it, and a reserved word like `end`. Those stay bracketed whatever the setting says, because the short form would not compile.",
			"**Recompiling an existing project will rewrite dictionaries and index assignments.** The generated Luau is equivalent, and the diff is one line per key.",
		],
	},
	{
		version: "0.19.5",
		date: "2026-09-08",
		headline: "Build a table type from a list of fields.",
		added: [
			"**Declare Type at Top can be a list of fields** instead of typed-out Luau — a name and a type per row, giving `{ movementSpeed: number, hp: number }`. Field types are free text with suggestions, because a closed list could not offer `Instance?` or `{ Player }` or a type declared in the same file.",
			"**Written out as Luau** is still there, as the other half of a Shape dropdown. It is what says the things a list of pairs cannot — a union, a function type, a generic.",
		],
		fixed: [
			"**The Export checkbox sat under its own heading with its explanation orphaned below it.** The checkbox and the words that explain it are one line now, and it reads *Is Export Type*.",
		],
	},
	{
		version: "0.19.4",
		date: "2026-09-08",
		headline: "Declare a type after the value it describes.",
		added: [
			"**Declare Type** sits in the execution flow and names the type of a value wired into it: `export type Tuning = typeof(Tuning)`. It goes where you put it, which is the point — a type built from `typeof` has to come *after* the thing it is the type of, and Luau reads a file in order. The identifier comes from the wire, so renaming the value later cannot leave the type pointing at a name that is gone.",
		],
		changed: [
			"**The node that hoists is now Declare Type at Top**, and still writes its definition out as Luau. Graphs using the older one are converted to it when they open.",
		],
		watch: [
			"`export type` is only legal at the top level of a module, so an exported Declare Type inside a branch, loop or function is refused. A plain one — Export unticked — is fine there and stays scoped to that block.",
			"Both nodes share one set of type names; declaring the same name twice is an error whichever pair of nodes did it.",
		],
	},
	{
		version: "0.19.3",
		date: "2026-09-08",
		headline: "Define Type is called Declare Type.",
		changed: [
			"**Define Type is now Declare Type**, which is what the node beside it — Declare Local — is called, and what people go looking for. Graphs using the old one are converted when they open.",
		],
	},
	{
		version: "0.19.2",
		date: "2026-09-08",
		headline: "Declare Luau types, and make a variable without leaving the node.",
		added: [
			"**Define Type.** Writes `export type Name = …` at the top of the generated file, above the variables. Untick Export and it stays inside the module. The definition is written as Luau — a type is not built out of values, so `{ speed: number }` describes something no wire can carry.",
			"**Type Of**, Roblox's `typeof`. A `Vector3` answers `\"Vector3\"` where Lua's `type` only says `\"userdata\"`. For `typeof(x)` *inside* a type, write it in a Define Type definition — that one is a type expression, not a call.",
			"**New…** beside the variable picker on Get, Set and Initialize Variable. Initialize Variable could not be used at all until you had been to the Variables panel and made one first.",
		],
		fixed: [
			"**Renaming a variable left an Initialize Variable node showing the old name**, the usage count did not include those nodes, and deleting a variable only used by one gave no warning. Every node that points at a variable is now counted the same way.",
		],
		watch: [
			"A type name is reserved against variables and locals. Luau keeps types and values in separate namespaces and would allow both; a reader would not thank you for it.",
		],
	},
	{
		version: "0.19.1",
		date: "2026-09-08",
		headline: "Declare a variable where you build its value.",
		added: [
			"**Initialize Variable.** Gives a script variable its first value *and* is its declaration, so there is no empty one above it — `local Tuning = { … }` rather than `local Tuning = {}` followed by an assignment. For a starting value that has to be built from nodes rather than typed into the variables panel.",
			"**Declare Local has a Name.** An optional input on the node face; leave it blank and one is chosen. The Inspector's Label did this already and was findable only by guessing that a cosmetic field was load-bearing.",
		],
		changed: [
			"**Make Dictionary goes up to 24 pairs**, from 8. A settings table of ten entries is ordinary, and there is no way to say \"a table with ten keys\" by adding more nodes.",
		],
		watch: [
			"Initialize Variable has to sit in the main flow. Inside a branch, a loop or a function the declaration would go out of scope and every later mention would read as an empty global, so it is refused with an error naming Set Variable as the alternative. Reading the variable before the node that declares it is refused for the same reason.",
			"Declare Local's Name is typed in, not wired. It becomes an identifier in the generated file, which is decided before anything runs.",
		],
	},
	{
		version: "0.19.0",
		date: "2026-09-08",
		headline: "A moved graph takes its generated file with it, and the tree says which half is which.",
		fixed: [
			"**Renaming, moving or reclassing a graph left its old generated file behind** and wrote a new one beside it. Rojo went on syncing both, so the game ended up with two copies of the module and nothing maintaining one of them. The file a graph used to write is now removed when it writes a different one, and the compile report names what went.",
			"The count of stale generated files was only refreshed by a compile, so renaming or deleting a graph left it describing whatever the last compile saw. It updates whenever the tree does.",
		],
		added: [
			"**The project tree is split into Graph content and Compile content.** One half you author and Roswaal reads; the other Roswaal writes and you do not edit. Each collapses, and an empty one says so.",
		],
		watch: [
			"Only a file whose own header names the graph that just moved is removed. A generated file with no graph behind it at all is still reported rather than deleted — that is the *stale* line in the compile panel, and it still asks first.",
		],
	},
	{
		version: "0.18.5",
		date: "2026-09-08",
		headline: "Make a graph in the folder you are looking at.",
		added: [
			"**Right-click a folder for New graph here and New map here.** They appear only for folders under the project's source directory — a graph written into the compiled output would be deleted by the next compile.",
		],
		changed: [
			"**New graph and New map use the folder you last clicked in the tree**, rather than always the top of the source directory. A folder counts as itself, a file counts as the folder it is in, and the folder is marked in the tree.",
			"Both dialogs name the folder the document will be created in.",
		],
		fixed: [
			"Creating a graph or a map that fails now says so, instead of leaving the tree unchanged with no explanation.",
		],
	},
	{
		version: "0.18.4",
		date: "2026-09-08",
		headline: "`npm link` puts roswaal on your PATH.",
		fixed: [
			"**Installing Roswaal through npm produced a `roswaal` command that did not run on Windows.** npm read the `#!/bin/sh` line off the launcher and wrote a wrapper calling `sh`, which a Windows machine has no reason to have — the command failed with \"the term '/bin/sh.exe' is not recognized\". npm now installs a launcher it can wrap on every platform.",
		],
		changed: [
			"The install instructions offer `npm link` first. It is one command, it works in the terminal you are already in rather than the next one you open, and `npm unlink -g roswaal` undoes it. Putting `bin/` on your PATH still works and is still documented.",
		],
	},
	{
		version: "0.18.3",
		date: "2026-09-08",
		headline: "Opening a Luau file with a block comment no longer blanks the editor.",
		fixed: [
			"**Opening a `.luau` file containing a `--[[ ]]` comment or a `[[ ]]` string emptied the whole page.** The syntax highlighter threw, React unmounted, and what was left was a black rectangle with no message. Every `.luau` file opens correctly now, generated or hand-written.",
			"**A number's exponent was split in two.** `1e-9` was coloured as `1e`, an operator, and `9`; hex and binary literals were read a character at a time and could come apart the same way.",
		],
		added: [
			"**A crash screen.** If something does throw, the editor now says what and offers the error to copy, rather than leaving an empty page. Nothing is lost by reloading — every graph is on disk.",
		],
		watch: [
			"The highlighter had been doing this since it was written. It went unnoticed because the only Luau anyone opened was Roswaal's own generated output, which contains no block comments.",
		],
	},
	{
		version: "0.18.2",
		date: "2026-09-08",
		headline: "Switch projects from the toolbar.",
		added: [
			"**The Roswaal mark in the toolbar opens a project menu.** It names the project you have open, lists the ones you opened before, and offers the folder dialog for anything else. Changing project no longer means restarting the daemon.",
			"A project in the recent list can be removed from it. The project itself is untouched.",
			"Choosing a directory that is not a Roswaal project yet offers to initialise it, on the same terms the first-run screen does — a `roswaal.json` is written and nothing else.",
		],
		changed: [
			"**Every open graph is written to disk before the project changes**, and a write that fails cancels the switch rather than closing the tab it failed on.",
		],
	},
	{
		version: "0.18.1",
		date: "2026-09-08",
		headline: "Three typechecking modes, and a second way to cut a wire.",
		added: [
			"**Shift-click a wire to disconnect it.** Alt-click already did, and still does.",
		],
		changed: [
			"**The `strict` checkbox is now a typechecking mode**, with three settings. *Default* writes no mode line at all, leaving the generated file to whatever the project says. *Nonstrict Mode* writes `--!nonstrict`, and *Strict Mode* writes `--!strict`.",
			"**Both checked modes annotate the types** of generated locals and function parameters. *Default* leaves them off, which is what an unticked `strict` did.",
			"`.nodescript` files record `typecheck` where they recorded `strict`. Older graphs convert on open — a ticked box becomes *Strict Mode* and an unticked one becomes *Default* — and the old key is dropped on the next save.",
		],
		watch: [
			"A graph naming a mode this build does not know, which means one written by a later Roswaal, opens as *Default* rather than keeping a setting it cannot honour.",
		],
	},
	{
		version: "0.18.0",
		date: "2026-09-08",
		headline: "Panels you can move, and more than one graph open.",
		added: [
			"**Several graphs open at once, in tabs.** Each keeps its own undo history, its own selection and its own viewport, so switching between them lands you where you left off rather than at the top of the file. Middle-click a tab to close it.",
			"**The sidebars resize.** Drag the divider beside a dock; double-click it to collapse the dock, and again to bring it back.",
			"**Panels can be moved between the three docks.** Drag a panel by its heading — the project name, *Variables*, *Node*, the diagnostics bar — and drop it on the left, right or bottom edge. A rectangle shows where it will land, and releasing over the middle leaves it where it was.",
			"**The layout is remembered**, alongside the theme and wire style. Dock sizes and which panel sits where; not which documents were open.",
		],
		fixed: [
			"**The project name and the Variables heading had grown to twice their size.** They took their size, case and colour from a rule scoped to the old sidebar, which the dock work renamed out from under them.",
			"The compiler's line-to-node source map had been off by one since it was written, so anything reading it — currently the selection preview — pointed one line late.",
		],
		watch: [
			"A layout is remembered per browser, not per project. Dock sizes restored on a smaller screen are brought back inside it, so a layout arranged on a wide monitor cannot leave the graph with no room.",
			"Renaming a graph keeps its tab, its history and its viewport. Deleting one closes its tab and leaves the others alone.",
			"A dock holds its panels stacked rather than tabbed. Two panels side by side within one dock, and two graphs side by side in the centre, are not built yet.",
		],
	},
	{
		version: "0.17.2",
		date: "2026-09-08",
		headline: "Worth-knowing notes are a list.",
		changed: [
			"**\"Worth knowing before you upgrade\" is bulleted**, one point per bullet. It was one run-on paragraph, so telling its separate claims apart meant reading the whole thing.",
			"A few entries that carried two claims have been split into two.",
		],
	},
	{
		version: "0.17.1",
		date: "2026-09-08",
		headline: "The selection preview is syntax highlighted.",
		fixed: [
			"**The selection preview showed Luau in plain body text.** It was running the highlighter and emitting the right classes all along; the colours were scoped to the documentation and applied nowhere else, so keywords, strings, comments and numbers all came out the same colour as everything around them.",
		],
		changed: [
			"The Luau token colours now apply in every place Luau is shown as text, rather than in the documentation alone. The editor, the docs and the preview were already meant to share one palette.",
		],
	},
	{
		version: "0.17.0",
		date: "2026-09-08",
		headline: "See what a selection compiles to, and the source map finally works.",
		added: [
			"**Selection preview.** Select some nodes and press `P`, or use the **Preview** button that appears on the toolbar when something is selected. It shows the Luau those nodes produced, picked out of the real generated file with a few lines of context either side, syntax highlighted.",
			"A **Whole file** switch in its header swaps between the extract and the complete output.",
			"**A pure node is handled too.** A pure value with one consumer has no line of its own, so the preview names it and highlights the statement its value ends up in.",
		],
		fixed: [
			"**The compiler's line-to-node source map was off by one, and always had been.** Every entry pointed one line late: the first statement at the line below it, the last node at the blank line ending the file.",
		],
		watch: [
			"`P` opens the preview when nodes are selected, with no modifier — the same shape as `C` for a comment.",
			"The preview works while a compile has the graph locked.",
			"The source map is what a future Studio integration would use to point a runtime error back at a node.",
			"Anything already built against the map was reading lines one out.",
		],
	},
	{
		version: "0.16.0",
		date: "2026-09-08",
		headline: "Arguments you can leave out, and a wire that finishes the thought.",
		added: [
			"**Optional input pins.** A pin marked optional and left alone is *not passed at all*, rather than passed as a default Roswaal picked.",
			"`TweenInfo` now compiles to `TweenInfo.new(1, style, direction)` instead of six arguments, three of which were the engine's own defaults handed back to it. `Look At` and both `Fuzzy Equals` nodes lost their trailing argument the same way.",
			"On the canvas an untouched optional pin reads **default** in a dashed box; click it to set a value, and the **×** beside a set one puts it back. Setting it and clearing it again leaves the graph byte for byte as it was.",
			"**Dragging a wire into empty space and picking a node now connects it.** The palette narrows to nodes that can take the wire, names the pin it is holding, and joins the two up when you pick.",
			"**Make Dictionary**, a table of key/value pairs in one pure node. A one-property tween used to be New Table, Set Index and an execution wire to say `{ x = 1 }`.",
		],
		fixed: [
			"**A statement node with several outputs assigned the unwired ones to globals.** The emitter declared only the outputs something read, leaving the rest as bare names on the left of an assignment — which in Luau creates a global, silently, visible to every other script. No built-in node did this; the machinery is now correct for one that does.",
		],
		watch: [
			"An optional pin's **default is still there** and is what you get when you click to set it. What changed is that leaving it alone no longer emits it.",
			"An unset optional pin with a set one *after* it is passed as `nil`. Only trailing ones disappear.",
			"The palette **filters** rather than reorders when a wire is in flight, so a node with no compatible pin is not offered. Opening the palette any other way still lists everything.",
			"`table.remove`'s index is not optional, and was left as it was: `table.remove(t)` removes the *last* element where `table.remove(t, 1)` removes the first, so changing it would alter what existing graphs do.",
		],
	},
	{
		version: "0.15.0",
		date: "2026-09-08",
		headline: "Every Roblox datatype, in one place, with a lot more of them.",
		added: [
			"**A category called Engine types**, holding every Roblox datatype with a subcategory per type: Vector3, Vector2, CFrame, Color3, BrickColor, UDim, UDim2, TweenInfo and Tween. The node menu groups two levels deep now, and the documentation gives each type its own nav section.",
			"**Vector3 gained the rest of its API** — divide, component-wise multiply, negate, Angle, Max, Min, Abs, Ceil, Floor, Sign, FuzzyEq and a Break node — and **Vector2 now has all of it too**, where before it had only a constructor.",
			"**Color3 converts both ways between all four forms**: RGB 0–255, RGB float 0–1, HSV, and hex. `Color3 To RGB` rounds to whole channels; `Color3 To RGB Float` gives you what the engine stores.",
			"**BrickColor** — by name, from a Color3, from float channels, by palette index, or random, plus `.Color`, `.Name` and `.Number` to get back out.",
			"**UDim and UDim2**, with construction from scale or offset, arithmetic, Lerp, and the X / Y / Width / Height accessors.",
			"**Tweening, end to end.** A TweenInfo with easing style and direction as dropdowns, Create Tween, Play, Pause and Cancel, and the Completed signal to wait on.",
			"**Tween Property**, a one-property shorthand. For several at once, wire in a table.",
			"**Break nodes** for Vector3, Vector2, UDim and CFrame's Euler angles.",
		],
		changed: [
			"**Vectors and CFrames are no longer top-level categories**, and the two datatype nodes that sat under Engine have moved out of it. Everything is under Engine types, grouped by the type it belongs to.",
			"**Nodes are coloured by their datatype now**, not by the category. Vector3 and CFrame nodes keep exactly the colours they had.",
			"`BrickColor`, `TweenInfo` and `Tween` are pin types of their own, with their own colours. BrickColor's is not near Color3's.",
		],
		watch: [
			"**No node changed its id, so no graph moved.** `roblox.vector3` and `roblox.color3` kept theirs even though both were retitled — the latter is now `Color3 from RGB`.",
			"`Color3 To HSV` and `To Euler Angles XYZ` call the underlying method **once per output you wire**. Wiring one component costs one call; wiring all three costs three.",
			"A `BrickColor` is not a `Color3` and the two are not interchangeable. Read `.Color` for the Color3 behind the name.",
			"BrickColor's float constructor takes channels from **0 to 1**, not 0 to 255.",
			"The easing and BrickColor dropdowns are **suggestions, not closed lists** — anything not offered can still be typed.",
		],
	},
	{
		version: "0.14.0",
		date: "2026-09-08",
		headline: "Settings you can find, and seven colour schemes.",
		added: [
			"**A settings panel**, from the toolbar. It covers everything in `roswaal.json` — target, where graphs live, where Luau is written, compile mode, node pack directories, formatting, the Rojo project file — none of which could previously be changed without opening the file by hand.",
			"It **says where each setting is stored**. Project settings are committed and shared by everyone on the repository; preferences are yours, live in your browser, and never appear in a diff.",
			"**Seven colour schemes**: Roswaal Light and Dark, Tokyo Night and Tokyo Night Storm, Catppuccin Mocha, Nord, and Aquatic. Each is one JSON file in `themes/`, in the same format [Beako](https://github.com/neopolitans/Beako) uses, so a theme written for one tool reads in the other.",
			"**Follow the system** is still the default, and is the *absence* of a theme rather than an eighth scheme: it removes the palette, so the app goes on changing with your OS.",
			"The theme applies to **the docs window too**, before anything renders rather than a frame later.",
			"**Settings → Licences** shows the full text of the three borrowed schemes' licences, compiled in from files copied byte for byte out of each upstream project.",
			"Two preferences that were previously not settings at all: **how long after your last edit a graph is written**, and **whether Roswaal reopens the last project** or starts at the picker.",
			"**Three wire styles.** *Curved* is the bezier you have, and stays the default. *Rigid* bends at right angles and nowhere else. *Angular* is the same route with each corner cut to a 45-degree slope.",
			"**Square node corners.** Capsule getters and reroute knots keep their shapes either way.",
		],
		changed: [
			"**Straighten is a preference rather than a stray `localStorage` key.** It behaves exactly as before, and is now in the settings panel with everything else.",
			"A **project setting that the daemon refuses now says so.** Writing `roswaal.json` was previously a promise nobody checked.",
		],
		fixed: [
			"**The `<select>` popup follows the theme.** Chromium paints that list outside the document, where `var(…)` does not resolve, so its colours were four literals copied out of the built-in schemes and stopped following any other palette.",
		],
		watch: [
			"**A theme cannot recolour a pin or a node category.** Red is a boolean, green is a number, gold is a vector, whatever scheme you are on.",
			"The rigid wire router has **no obstacle avoidance**: a wire may cross a node rather than route around it.",
			"Hover, the grid, the watermark and the node shadow are **derived from whether a scheme is dark**, not authored, so a theme file does not set them.",
			"Preferences live in this browser and do not follow you to another machine.",
		],
	},
	{
		version: "0.13.0",
		date: "2026-09-07",
		headline: "You can watch a compile happen.",
		// The daemon now refuses cross-origin requests it used to answer. Nothing
		// in the editor or the CLI changes, but a script driving the API from a
		// page on another origin stops working, which is the definition.
		breaking: true,
		added: [
			"**Compiling a project now shows the walk rather than its result.** A notification in the bottom-right corner of the graph names the file being compiled and its place in the queue — *628 of 1202* — and fills as it goes. A slow project used to look exactly like a stuck one; the difference is now the thing on screen.",
			"It **stays out of the script analysis panel**, which answers a different question — what is wrong with the graph you have open. A thousand rows of good news in there buries the one diagnostic you opened it for. The notification takes itself away a few seconds after the compile finishes, or when you click it.",
			"**Browse…** on the opening screen, beside Open, which opens your operating system's own folder dialog rather than asking you to type an absolute path. It fills the field rather than opening the project, because choosing a folder and opening it are two decisions and the *Open versus Initialise* check belongs between them. The dialog runs on the machine the daemon is on — a browser cannot produce a filesystem path — so on a daemon with no desktop the button is replaced by the reason.",
			"A compile started in **one window is narrated in every open window**, because it is something happening to the project rather than to the tab that asked for it.",
			"**The graph is read-only while it is being compiled**, framed and labelled so it is obvious why. An edit made during the walk landed in the written file or did not, depending on where the walk had got to when you made it — and the file then disagreed with the graph, with nothing to say so.",
		],
		changed: [
			"**The node category called \"Roblox\" is now called \"Engine\".** It holds Get Service, New Instance, Find First Child, Destroy and the rest — engine and DataModel work — and *Engine* says what they do, where the old name said only which platform they were for. The nodes and their ids are unchanged, so nothing in your graphs moves; only the drawer they sit in is labelled differently.",
			"The toolbar, the opening screen and the docs window carry **the Roswaal mark** — a file, a wire leaving it, and an empty pin. It takes the colour of the text beside it, so it works in both themes, and it is the tab's icon as well; the browser tab was still showing a default.",
		],
		fixed: [
			"**Renaming a graph renames the file it compiles to.** A graph carries its own name, and that name — not the file's — is what the compiler writes out. Renaming `Greeter.nodescript` to `Hello.nodescript` used to leave the graph still called Greeter, so it went on producing `Greeter.luau` with nothing anywhere saying so. Renaming now keeps the two in step, and creating and renaming run the name through the same function so they cannot drift apart again.",
			"**Two graphs with the same name no longer overwrite each other silently.** They compile to one file, and the second used to win and report *wrote* for both — a project of 1202 graphs cheerfully said \"1202 of 1202 written\" when 1200 of them were the same file. The second is now refused, naming the graph that got there first and telling you to rename one.",
			"**Generated files stop being reported as hand-edited on Windows.** The hash in a generated file's header is what tells Roswaal you have edited it. Roswaal writes LF; Git on Windows checks the same file out as CRLF, so after a clone the hash no longer described the bytes on disk and every generated file was refused as edited by hand — files nobody had touched. A line ending applied by version control is not somebody changing the code, and the hash now says so.",
			"A compile that skipped a script **miscounted the summary**, subtracting it from the number of *node maps* written: a run that wrote two files could report \"0 of 5 written\". Rare before, because skipping was rare.",
			"**The daemon no longer answers other websites.** It listens on 127.0.0.1, which keeps the network out — but not the browser already running beside it, and it used to tell every origin that asked that it was welcome to read the reply. Any page you had open could therefore point Roswaal at a directory and read files out of it. It now refuses a request whose `Origin` is not local, and one whose `Host` is not local either, which is the same attack wearing a DNS answer instead. Nothing you do changes: the editor is served by the daemon itself, and `roswaal` on the command line was never a browser.",
			"**The canvas no longer slows down when a large folder is open in the tree.** Panning, zooming and dragging a node all re-rendered the whole project tree, once per frame, for no reason — nothing in the tree depends on the graph you are editing or on where the canvas is looking. With 1200 graphs showing, a frame took 20ms instead of 4ms and dragging visibly stuttered. It is now the same speed with the folder open as with it closed.",
			"**A tab is told again when the daemon changes project.** The mechanism has been broken since it was introduced in 0.12.0: the list of listening editors was read by the sender and written by nobody, so every daemon-wide message went out to an empty room. Nothing failed and nothing was logged, which is why it survived a release. Compile progress travels the same channel and would have been just as silent.",
		],
		watch: [
			"If you had scripts driving the daemon's HTTP API **from a web page on some other origin**, they stop working, and that is the point of the change. From a terminal — curl, a shell script, anything that is not a browser — nothing is different.",
			"The read-only lock is **only outside dynamic compiling**. On Dynamic a compile follows every autosave, so locking on one would lock the canvas roughly whenever you stopped typing — and that mode exists precisely so that compiling is not something you think about. Outside it a compile is something you asked for and then wait for.",
			"If you have been on 0.12.x with two editor windows open on the same daemon, **the second window was never actually following a project switch**. It kept editing the project it was opened on, which is what the 0.12.0 guard then refused to save — so the symptom was a save that would not go through rather than a graph in the wrong repository. Both halves work now.",
		],
	},
	{
		version: "0.12.1",
		date: "2026-09-06",
		headline: "The toolbar says what each control acts on.",
		changed: [
			"The top bar is **two rows now, split by what a control acts on**. Everything on the first is about the project — Refresh, New graph, New map, the compile mode, Compile project, Docs. Everything on the second is about the document you have open: its name, its script class, `strict`, the tools that only mean anything while it is open, and Compile script.",
			"The document row is **absent when nothing is open**, so the empty editor is one clean bar rather than twelve controls that mostly do not apply.",
		],
	},
	{
		version: "0.12.0",
		date: "2026-09-06",
		headline: "The project shell, and Luau you can read.",
		added: [
			"**Recent projects** on the opening screen, and one button that says the right thing: the path is checked before it is opened, so a Roswaal project offers *Open*, a plain directory offers *Initialise*, and a typo is reported as a typo.",
			"A `.luau` file opens in a **read-only code view** with the editor's own highlighting and line numbers, rather than as unstyled text. It says whether Roswaal wrote the file or you did, because that changes what to do with it.",
			"**Open in VS Code** on a hand-written file, and *Open the graph* on a generated one — both dead ends before.",
		],
		fixed: [
			"**Pointing the daemon at another project no longer writes your open graph into it.** Every request that writes now carries the project it believes is open, and the daemon refuses a mismatch instead of obeying it. An editor tab is also told when the daemon moves, and closes what it was holding rather than saving it somewhere it does not belong.",
			"A dropdown's list opened in the wrong colours — pale text on a pale background until you hovered a row. Giving a select's options their colours explicitly settles it; the browser was choosing them, and choosing badly.",
		],
		watch: [
			"A `.luau` file is **read-only in Roswaal**, and that is deliberate. An editable pane would need a save path, a story for conflicting with the file watcher, and an answer for what happens when a compile overwrites what you typed. Handing the file to the editor you already use is a better answer than a second-rate one built in here.",
		],
	},
	{
		version: "0.11.1",
		date: "2026-09-06",
		headline: "A node called what you named it, and Wait in the right drawer.",
		changed: [
			"**A Function node shows its function's name.** Naming a function `greet` and still reading “Function” on the canvas made a graph with four functions in it four identical headers, with the answer only in the inspector. The name is now the label unless you type one over it, and the signature stays on the line underneath.",
			"**Wait has moved from Time to Threads.** It is `task.wait` — the scheduler, next to Spawn, Defer and Delay — and Time is about dates and durations. It was in the wrong drawer, and Wait now leads the Threads category because it is where the rest of it becomes relevant.",
			"Every place that shows a node's name asks one function: the header, the capsule, the inspector's placeholder and the diagnostics. A warning about an unreachable node calls it what the canvas calls it.",
		],
		watch: [
			"The label field's placeholder is now **what the node is already called** rather than always the definition's title, so an empty field reads as “this is fine” instead of as a nudge to type the name a second time. Typing a label still wins over everything.",
		],
	},
	{
		version: "0.11.0",
		date: "2026-09-06",
		headline: "Every node page opens with a picture of the node.",
		added: [
			"A **node preview** at the top of all 189 reference pages — the node drawn exactly as the canvas draws it, with its header colour, its rows, its pin colours and the values it starts with. Recognising the node you are looking for is now a glance rather than a read.",
			"Previews in the guides too, where the useful thing is a comparison: **Custom Code beside Luau Expression** on *Hand-written Luau*, and an impure node beside a pure one on *Wires and pins*.",
		],
		changed: [
			"Previews are drawn from the canvas's own geometry and palette rather than from a second set of numbers, and a test holds their size and every pin row against `nodeBounds` and `pinPosition`. A change to how a node is laid out that the previews do not follow fails the build instead of quietly misinforming a reader.",
			"They follow your theme, and need no JavaScript — they are SVG in the page, in the static site as much as in the editor.",
		],
		watch: [
			"**A preview shows the node, not the editor.** The −/+ buttons on a variadic node, the error badge and the selection ring are left out on purpose: they appear when you interact with a node, and a picture of them would be a picture of something you cannot do on a page.",
		],
	},
	{
		version: "0.10.0",
		date: "2026-09-06",
		headline: "The task and coroutine libraries — 189 nodes.",
		added: [
			"**Threads**: Spawn, Defer, Delay and Cancel Thread from Roblox's `task` scheduler, plus Synchronize and Desynchronize for parallel Luau.",
			"The **coroutine** library underneath it — Create, Wrap, Resume, Yield, Status, Running, Is Yieldable and Close.",
			"A `thread` pin type, with its own colour.",
		],
		changed: [
			"`Wait` now says what it is: the replacement for the deprecated `wait()` global, and it hands back how long it actually took.",
		],
		watch: [
			"**Resume Coroutine captures only the first return value.** A coroutine that yields several needs Custom Code to catch the rest — the node says so rather than quietly dropping them.",
		],
	},
	{
		version: "0.9.1",
		date: "2026-09-06",
		headline: "Custom Code versus Luau Expression, answered properly.",
		added: [
			"A warning when a **Luau Expression** is given a statement. It is substituted where a value goes, so `local x = 1` in one emits `print(local x = 1)` — raw text, nothing to rewrite it.",
		],
		changed: [
			"**Hand-written Luau** is rewritten. The difference between the two nodes is *where the code lands* — Custom Code where a statement goes, Luau Expression where a value goes — and not how long it is. Everything else about them follows from that, and the page led with the wrong thing.",
			"A release entry now shows its version bold on the left and its date quietly on the right.",
			"Prose pages set their measure once, so the rules, notes and paragraphs share one right edge instead of three.",
		],
	},
	{
		version: "0.9.0",
		date: "2026-09-06",
		headline: "Signals you can let go of, and networking.",
		added: [
			"**Disconnect** and **Is Connected**. Connect was the only signal node, so a graph could take a connection out and had no way to put it back — the most common leak in a Roblox game had no node for its cure.",
			"**Connect Once**, which unbinds itself after one fire, and **Wait For Signal**, which yields until one arrives.",
			"**Networking**: Fire Server, Fire Client, Fire All Clients, On Server Event, On Client Event, Invoke Server, Invoke Client, and the two On-Invoke assignments.",
			"**BindableEvent** and **BindableFunction** — the in-process pair, for one script to signal another.",
		],
		changed: [
			"One set of remote nodes covers **RemoteEvent and UnreliableRemoteEvent** both: the methods are identical, and the difference is a decision made when you create the instance rather than a different call to write. There is no unreliable RemoteFunction, because waiting for an answer needs the answer to arrive.",
			"The *Coming from Blueprints* page gains rows for Custom Event, Unbind Event and RPCs — three places it previously had to say there was no equivalent, or said too little.",
		],
	},
	{
		version: "0.8.1",
		date: "2026-09-06",
		headline: "A type table for newcomers, and one fewer click in the nav.",
		added: [
			"**A table of engine types and their Luau counterparts**, now on the *Coming from Blueprints* page — `FVector` to `Vector3`, `TArray<T>` to a plain table, and the ones with no counterpart at all: no `FRotator`, no `FQuat`, no typed containers. It also flags the two conventions that catch people out: Roblox is **Y-up** and in studs, and a `CFrame` carries **no scale**.",
		],
		changed: [
			"A nav section holding one page — Release notes, Events — is now that page's link rather than a drawer you have to open to find the single thing inside it.",
		],
	},
	{
		version: "0.8.0",
		date: "2026-09-06",
		headline: "A static documentation site, a luau pin type, and Error.",
		added: [
			"**`npm run build:docs`** writes the whole site to `dist-docs/` — 167 pages, syntax highlighted at build time, with client-side search. No daemon, and **no JavaScript needed to read a page**.",
			"**Error**, **Assert** and **Traceback** in Debug.",
			"**Cast Through Any**, because Luau refuses a cast between unrelated types and going through `any` is the documented way round it.",
			"**Roswaal types** — a guide to what a pin's type means, what connects to what, and where it differs from Luau's own.",
		],
		changed: [
			"Code pins are typed **`luau`** rather than `string`. They hold code, not text, and a type says that more plainly than the yellow warning badge they used to carry did.",
			"That badge is gone. Neither a code pin nor a literal-only pin is a problem, so neither is coloured like one — they read **code editor** and **literal** now.",
			"Release notes are their own nav section rather than the fifth page under Guides.",
			"**Cast** already accepted any Luau type expression — intersections, unions, table types — and nothing said so. `Model & { Humanoid: Humanoid }` works, and the docs now show it.",
		],
	},
	{
		version: "0.7.1",
		date: "2026-09-06",
		headline: "The documentation reads like the editor does.",
		changed: [
			"Code in the docs is **syntax highlighted by the editor's own tokeniser**, in the editor's own colours — the same Luau should not look like two different languages one panel apart.",
			"Pin lists are bordered rows in the shape Roblox's reference uses for properties: `Name : type`, with the default, badges for what is unusual, and the detail underneath rather than in a column that was empty on most rows.",
			"Pages are centred and given room to grow, closer to how Roblox's Creator Hub sets its own.",
		],
		fixed: [
			"An *On this page* link sent you back to Getting Started. The hash names the page, so a heading anchor was being read as a page slug that does not exist.",
			"The *Coming from Blueprints* page still called cast pins \"planned, not built\" a release after they shipped.",
		],
	},
	{
		version: "0.7.0",
		date: "2026-09-06",
		headline: "Query Descendants, and the documentation reads like documentation.",
		added: [
			"**Query Descendants** — `ClassName` matches by `IsA`, `.Tag` by CollectionService tag, `#Name` by name, `[Property = value]` and `[$Attribute = value]` by value, combined and negated with `:not(...)`. It returns `{ Instance }`, so it pairs with Cast Array.",
			"**Is Ancestor Of**, the other half of Is Descendant Of.",
			"**Release notes** — this page.",
			"Code blocks carry their language and a **Copy** button, and every page longer than a screen gets an *On this page* outline.",
		],
		changed: [
			"The node reference is split into **Built-in nodes** and **Project nodes** in the nav, so a pack's node is recognisable before you click into it rather than after.",
			"`Get Tags` is documented as returning `{ any }`, which is what Roblox types it as — not `{ string }`, as it said before.",
		],
	},
	{
		version: "0.6.0",
		date: "2026-09-06",
		headline: "Instances, tags, attributes, players and casts — 124 nodes to 152.",
		added: [
			"**Instances**: finders, ancestors, `GetChildren`, `GetDescendants`, `QueryDescendants`, `IsA`, `IsDescendantOf`, `GetFullName`, `Clone`, and the changed-signal getters.",
			"**Tags and attributes**, as the methods on Instance rather than the CollectionService calls they forward to — so no service has to be hoisted for them.",
			"**Local Player** and **Local Character**, which reach the Players service themselves. Client-only, and the compiler says so if the graph is not a LocalScript.",
			"**Cast** and **Cast Array** — Luau's `::`. `Get Descendants` is `{ Instance }` however much you know about it, and Cast Array is how you say what is really in there.",
		],
		changed: [
			"The *Coming from Blueprints* page said Cast To maps to \"just index it\", which was wrong. It is two halves of one node: **Is A** asks at runtime and gives you a boolean to branch on, **Cast** asserts to the typechecker and emits nothing. Ask, then assert.",
		],
	},
	{
		version: "0.5.0",
		date: "2026-09-06",
		headline: "The documentation, in its own window.",
		added: [
			"**Docs** replaces Help, and opens at `/docs` as a separate window — put it beside the editor rather than over it.",
			"A reference page for every node, with search, guides, and the *Coming from Blueprints* mapping.",
			"Your **own node packs are documented too**, with their real compiled output, because the reference is generated from the live registry rather than at build time.",
		],
		fixed: [
			"A capsule getter — Get Variable, Get Function — showed no selection highlight. Its own styling was quietly overriding the ring.",
			"Every output pin claimed \"must be wired\". Only an input can be required.",
		],
	},
	{
		version: "0.4.0",
		date: "2026-09-06",
		headline: "Every node carries a worked example, compiled by the real emitter.",
		added: [
			"A compiled example on all 124 node pages. Where a node cannot be shown honestly on its own, the page says why instead of going quiet.",
		],
		fixed: [
			"A Branch whose false arm compiled to nothing left a bare `else` before the `end`. Valid Luau that nobody writes.",
		],
	},
	{
		version: "0.3.0",
		date: "2026-09-06",
		headline: "Split struct pins, and the Vector and CFrame libraries.",
		added: [
			"**Split Struct Pin** and **Recombine Struct Pin** on `Vector2`, `Vector3`, `CFrame`, `Color3`, `UDim` and `UDim2`. `CFrame` offers three decompositions.",
			"**Promote to Variable**, which takes the value already typed into the pin rather than resetting it.",
			"Vectors, CFrames and DateTime — 40 nodes.",
			"Realign can **straighten the execution spine**, placing each node where its incoming exec wire comes out flat.",
			"Splitting works on **custom pack nodes** too, without the pack knowing splitting exists.",
		],
		changed: [
			"Execution pins are larger, and empty-versus-wired is drawn as an outline rather than a fade — an unwired exec pin is now as easy to find as a wired one.",
		],
		watch: [
			"A pin whose text is pasted into the generated source — a property name, a cast's type — can no longer be wired. The editor refuses the connection during the drag rather than letting the compile fail.",
			"An ordinary pin that defaults to a Luau constant like `Vector3.zero` **no longer opens a code editor**. Only Custom Code and Luau Expression accept typed Luau, which makes those two node titles a complete list of where hand-written code can enter a graph. Wire a node in, or split the pin, to change a constant.",
		],
	},
];
