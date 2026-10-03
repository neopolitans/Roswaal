/**
 * Release notes for 0.40.0 to 0.49.x, newest first.
 *
 * One of the files `../releases.ts` puts together, a tenth of the minor
 * versions each, so the newest notes are not at the top of a very long file.
 */

import type { Release } from "../releases.js";

export const RELEASES_0_40: Release[] = [
	{
		version: "0.49.0",
		date: "2026-09-15",
		headline: "A local can be a constant.",
		affects: ["editor", "docs"],
		added: [
			"**Declare Local can bind with** `const` — *Binding*, in the Inspector. Luau's constant is the same binding with one guarantee: the name cannot be reassigned after it is set. It is the binding that is fixed and not the value, so a const table is still a table you can write into.",
			"**A Set Local wired to a constant is refused before the file is written**, naming the local that made the promise. The runtime would catch it; the graph knows which node to point at.",
		],
		watch: [
			"`const` is a recent addition to Luau. A graph that uses it needs a runtime that has it — an older one refuses the file at parse time — so it is a choice per local rather than something Roswaal writes for you.",
		],
	},
	{
		version: "0.48.0",
		date: "2026-09-15",
		headline: "One picker for every type.",
		affects: ["editor", "docs"],
		changed: [
			"**Choosing a type opens the picker** — the one the Class Name pins and the casts use — wherever a type is chosen: a variable, a local, a parameter, a return, a field of a declared type. It was a dropdown of forty names with **Other…** at the bottom opening a text field, which is three controls for one question.",
			"**The headings lead with what is closest to hand**: this graph's own types, then a required module's, then Luau's own and Roblox's values, and the instance classes after them grouped the way the engine groups them. Groups were ordered by size, which put `any` and `number` below six hundred classes.",
		],
		watch: [
			"Whatever you type is still committed, listed or not — `Model?`, `(number) -> string`, `{ [Model]: Restore }` — and clearing it still means `any`. **Other…** is gone because the search box is the field it used to open.",
		],
	},
	{
		version: "0.47.0",
		date: "2026-09-15",
		headline: "Angular is a diagonal.",
		affects: ["editor", "docs"],
		fixed: [
			"**The Angular wire style draws what its name says**: out of the pin level, one straight run to the other end, in level. It has been drawing a right angle with its corners cut since it shipped, which is a different shape and not the one anybody picked it for.",
		],
		changed: [
			"**A backwards wire keeps the lane.** There is no straight line from a pin to something behind it that does not cross its own node, so angular borrows Rigid's route out and back, with its corners cut — which is the one place the old shape earns its keep.",
		],
	},
	{
		version: "0.46.0",
		date: "2026-09-15",
		headline: "Variables in a window, if you would rather.",
		affects: ["editor", "docs"],
		added: [
			"**Variables can leave its dock for a window over the graph** — Settings → **Variables** → *Window*. Drag it by its own heading, resize it from the bottom-right corner, and put it back with the **⇤** button. Where you left it is remembered.",
			"**A dock is a column and a window is not**, which is the point: a dock takes width from the canvas for as long as it is open, and a window is exactly as big as you drag it and covers the graph rather than narrowing it.",
		],
		watch: [
			"Dropping the window into a dock docks it, the same as dragging a docked panel between edges. A window put back with **⇤** returns to the dock it came from, not to whichever dock is first.",
		],
	},
	{
		version: "0.45.1",
		date: "2026-09-15",
		headline: "Best match, then Related — and the kinds are coloured.",
		affects: ["docs"],
		changed: [
			"**The search palette splits its results.** *Best match* is the pages called what you typed; *Related* is the ones that mention it somewhere. The arrows still walk both top to bottom.",
			"**Node and Article are coloured** — yellow for a node's reference page, blue for an article — so the two kinds separate before you have read either.",
		],
	},
	{
		version: "0.45.0",
		date: "2026-09-15",
		headline: "Ctrl+K in the docs, and Luau typed into the node search.",
		affects: ["editor", "docs"],
		added: [
			"**Ctrl+K opens a search palette over the documentation**: the whole width of the window, a line of each page's own summary under its title, the section it belongs to, and a mark saying whether it is an article or a node. Arrows move, Enter opens, Escape closes; with nothing typed it lists the pages you have been reading. The sidebar's field says the shortcut, and on the published site Ctrl+K puts the cursor in it.",
			"**Luau typed into the node search finds the node that writes it.** `not` is Not rather than Not Equal, `==` is Equal, `..` is Concatenate, `if` is Branch, `for` is the three loops in the order you mean them. The pill's own symbol is searchable too.",
		],
		fixed: [
			"**The node menu's categories are ordered by their best match while you search**, instead of always by the library's own order. The scores were right and nothing was reading them: a Flow node matching on a word in its summary was drawn above the Logic pill the query named outright, so typing `not` offered Branch.",
		],
	},
	{
		version: "0.44.0",
		date: "2026-09-15",
		headline: "A service or a class, by its own name.",
		affects: ["editor", "docs"],
		added: [
			"**Typing a service name into the node menu offers that service.** `ReplicatedStorage` gives you Get Service with the name already in it, the way a variable's name gives you its Get.",
			'**Any other class name offers New Instance**, filled in: `Part`, `ProximityPrompt`, `Motor6D`. Services are left out of that half — `Instance.new("Players")` is an error the engine raises at runtime, and the service entry is the one that means anything.',
		],
	},
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
			'**Wait For Child (Value)** is the same call with no execution wire, for the line that reads `local remote = ReplicatedStorage:WaitForChild("Remote")`. It still yields, and still says so with the clock — reach for the original when the waiting is the step.',
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
			'**The service is hoisted**, exactly as Get Service hoists it: one `local RunService = game:GetService("RunService")` at the top of the file, shared with every node that asked for the same service.',
			"**A catalogue of 322 methods across 36 services**, built from Roblox's documentation and shipped with Roswaal — no network at build time or run time. Methods behind a security context and deprecated ones are not offered; methods a service inherits are, down to `Instance`, whose own methods have nodes already.",
			"**An enum argument is typed as its member name** — `E`, `Begin` — and written out as `Enum.KeyCode.E`. An optional argument nothing set is left out of the call rather than passed as nil.",
			"**A new guide**, [Services and their methods](services), on Get Service, the two nodes, and what the catalogue holds.",
		],
		watch: [
			"The method list is a **snapshot of Roblox's documentation at this build**. A method newer than it is not on the list and still compiles: type it into the picker and set Arguments in the Inspector.",
		],
	},
];
