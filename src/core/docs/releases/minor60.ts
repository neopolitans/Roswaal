/**
 * Release notes for 0.60.0 to 0.69.x, newest first.
 *
 * One of the files `../releases.ts` puts together, a tenth of the minor
 * versions each, so the newest notes are not at the top of a very long file.
 */

import type { Release } from "../releases.js";

export const RELEASES_0_60: Release[] = [
	{
		version: "0.69.0",
		date: "2026-09-16",
		headline: "Four Lune programmes, drawn and compiled.",
		affects: ["docs"],
		added: [
			"**Four small Lune programmes**, at [Lune demos](lune-demos): read a file, fetch JSON and read a field, walk a directory, take a command-line argument. Each one is a graph, drawn, with the Luau it compiles to underneath it.",
			"They are compiled rather than transcribed: the file shown is what the emitter writes from the graph above it, so the picture and the code cannot describe different programmes and a demo that stopped compiling fails the build.",
		],
		watch: [
			"**The process arguments have no node of their own.** `process.args` is a property of the module rather than a function, and the catalogue Roswaal reads from Lune's typedefs holds functions and classes. The command-line demo reaches it with a Luau Expression through the local the module bound, which works and is what the page shows.",
			"**Reading a field off one of Lune's named types warns.** Roswaal knows the pin is a `FetchResponse`, because Lune's signature says so, and reads the library's type names without their shapes — so it cannot tell that one is a table. The wire is right and the file runs; the demo shows it rather than avoiding it.",
		],
	},
	{
		version: "0.68.0",
		date: "2026-09-16",
		headline: "The map pages open with the map editor, working.",
		affects: ["docs"],
		added: [
			"**The map editor itself, at the top of both map pages.** Not a picture of it — the real panel, with the tree, the Inspector and the project file where the editor puts them. Select a row and the Inspector fills with that instance's fields while the project file scrolls to the lines that row writes.",
			"**Every part of the panel is named beside it**, and pointing at a name lights the control while everything else steps back. The same device the toolbar figures use, for the same reason: chrome is unreadable on the first day, and counting down a column to match a name is not reading.",
			"A row lights **its own** lines and not its children's. What the figure answers is *what did this row do*, and a row that appeared to produce its children's output would be one you expect to delete without losing them.",
		],
		changed: [
			"**Both map pages now say which target they are about in their first line**, and each carries the whole of compiling for that target. [Compiling and nodemaps for Lune](compiling-for-lune) no longer sends a Lune developer to the Roblox page for the half that happens to be shared — what triggers a compile, what the generated header is for, what `prune` does.",
			"[Compiling and nodemaps for Roblox](building-and-rojo) drops its Lune asides and says what each script kind becomes in Studio, which is the question the file ending was standing in for.",
			"The figure is **wider than the page's reading measure**. A tree, an Inspector and a project file do not fit in the width that suits a sentence.",
			"Both pages open with a **Nodemap basics** section, which is the panel and its legend. The Roblox page's later section is **Building a node map**, because two sections called some arrangement of the same two words is not an outline.",
		],
		fixed: [
			"The article's typography was reaching inside drawn panels, so the Inspector's section headings came out at body size and their hints came out as paragraphs — which between them ate most of the height the figure had.",
			"A figure's caption was being laid out as a column of the figure rather than underneath it.",
			"**Reading the panel no longer dims the panel.** Hovering a row to watch its lines light was dimming the project file those lines are in. The tree and the output light when asked about, but only their headers — the map's bar, and *Project file* — ask; being inside one is reading it, not pointing at it.",
			"The highlight ring was being painted underneath the tree's own header bar and under the next field along, so it looked clipped or missing. It is drawn over the top now.",
		],
		watch: [
			"The buttons in the drawn panel are dimmed because they do nothing: there is no project behind the figure to add a folder to. The fields are live — they follow the selected row — so they are not dimmed.",
			"The project file in the figure is printed from the map by the same rules the compiler uses, and the two are checked against each other for every map the documentation draws. A page cannot show a project file Roswaal would not write.",
		],
	},
	{
		version: "0.67.4",
		date: "2026-09-16",
		headline: "The grid stops being drawn over the graph.",
		affects: ["editor", "docs"],
		fixed: [
			"**The canvas grid was painted on top of every node**, in the graph editor and in Node Design's logic canvas. The layer everything in the graph is drawn inside carried no stacking order of its own, and an element without one sits below every neighbour that has one — which the grid and the graph's name both do. At 5% to 14% alpha it read as texture rather than as a mistake, and it had been there since the first version. Node previews were never affected.",
			"**The confirm button on a delete no longer prints its text in its own colour.** The filled destructive button took its fill from one rule and its text from another, and both resolved to the same red: the word *Delete* was still in the button, in exactly the colour of the button. Reaching for it also turned it accent-blue, because the hover rule outranked the one giving it a red fill.",
		],
		watch: [
			"The documentation has two renderers — one writes the published site, the other draws the same pages in the editor — and a change reaching only one of them has now shipped twice. They are checked against each other on every run.",
		],
	},
	{
		version: "0.67.3",
		date: "2026-09-16",
		headline: "Vector3 works in Lune, and says what it needs.",
		affects: ["editor", "docs"],
		added: [
			"**Roblox's datatypes are offered to a Lune graph** — 101 of the 108 Engine Types nodes, which is every one `@lune/roblox` implements. A datatype is not the engine: `Vector3` is a table with a `new` on it, and hiding the node hid something that works.",
			"**A datatype node says what it needs, and the Inspector gives it.** One press declares `@lune/roblox` and pulls the datatype off it, which are the two things that have to be true.",
			"**A page about compiling for Lune**, at [Compiling and nodemaps for Lune](compiling-for-lune): what a filesystem map is for, what it checks, and where a Lune program's dependencies come from.",
		],
		changed: [
			"**Building, and node maps** is now [Compiling and nodemaps for Roblox](building-and-rojo) — it was only unambiguous while there was one runtime. Its address has not moved.",
			"**A borrowed datatype carries two tags**, not one averaged one: `Roblox`, because it is Roblox's, and `@lune/roblox`, because that is the require Lune needs for it. A single `Luau` tag said the base language has `Vector3`, and it does not. The second tag is the specifier itself — it is what has to be declared, and the text that declares it. In the node menu the tag is the one the graph you are in needs.",
		],
		fixed: [
			"**A Roblox datatype in a Lune graph no longer compiles to something that fails at run time.** It wrote `Vector3.new(...)` with no require, and in Lune that indexes nil. It is an error now, naming the module and the member that fix it.",
		],
		watch: [
			"`TweenInfo` and `Tween` stay out of a Lune graph. Lune does not implement them, and the list is read from the module's own source rather than kept by hand.",
		],
	},
	{
		version: "0.67.0",
		date: "2026-09-16",
		headline: "A map can describe a filesystem.",
		affects: ["editor"],
		added: [
			"**A map says which runtime it describes.** A DataModel map is what one has always been: services, and a `default.project.json` for Rojo. A **filesystem map** is directories and files, which is what a Lune program actually has. A new map starts as the kind the project needs.",
			'**A filesystem map is checked against Luau\'s own require rules.** A file beside a directory of the same name is an error, because `require("./foo")` cannot mean both `foo.luau` and `foo/init.luau` and the language refuses an ambiguous path rather than picking one. Two files differing only by extension are the same collision one step along.',
			"**A file's name carries no extension.** Typing one is a warning saying so, and what to call it instead — the extension follows from the node being a file, and writing it into the name is how you get `main.luau.luau`.",
		],
		changed: [
			"A filesystem map writes **no project file**. Rojo's answers a question a Lune program does not ask, so what compiling one does is check that the layout holds together — the part Rojo was doing incidentally, and the only part that transfers.",
			"Every map written before this is a DataModel map and stays one without being touched.",
		],
		fixed: [
			"A stylesheet check was reading a glob in a placeholder as the start of a comment, and swallowing the markup after it — so it could report a live rule as dead. It reads string literals as strings now.",
		],
	},
	{
		version: "0.66.2",
		date: "2026-09-16",
		headline: "Aliases suggest themselves, and Roblox types tell the truth in Lune.",
		affects: ["editor"],
		added: [
			"**A specifier field offers what the project defines.** Every alias a `.luaurc` above the graph declares, then the runtime's own prefixes — `@lune/*` for a Lune graph, `@self/` and `@game/` for a Roblox one — then `./` and `../`. A suggestion rather than a gate: anything else is still typed, because the set of things a require can name is still moving.",
			"Which aliases are offered depends on **where the graph is**, since a `.luaurc` in `src/ui` defines aliases for `src/ui` and below. It asks the same function the compiler resolves by, so a field cannot offer a name the compiler would then refuse.",
		],
		fixed: [
			"**A Lune graph is no longer offered Roblox datatypes** `@lune/roblox` **cannot make.** The module implements 27 of them and `TweenInfo` is not one, so offering the whole group was offering a constructor the runtime has not got. The list is read from the module's own source rather than assumed from the Roblox side.",
		],
	},
	{
		version: "0.66.1",
		date: "2026-09-16",
		headline: "A node says when it needs attention.",
		affects: ["editor"],
		added: [
			"**A yellow mark in a node's corner** when something about it needs looking at — a Lune call whose module nothing requires, where the Inspector has the button that fixes it. The corner the error count already uses, and never both at once: an error is the more urgent of the two and says how many.",
			"**An unwired Lune call says so too.** The compiler refuses an undeclared module, but only for a node it reaches — so one dropped on the canvas and not yet wired said nothing, while the Inspector was already saying it.",
		],
		watch: [
			'A warning marks the node only when it is **about the node**. Most are about where a node sits — "not connected to anything that runs" is true of every node the moment you drop it — and marking those would put a pip on each one while you were still building the graph.',
		],
	},
	{
		version: "0.66.0",
		date: "2026-09-16",
		headline: "Lune's standard library, callable.",
		affects: ["editor", "docs"],
		added: [
			"**Files, networking, processes and the rest.** All 61 functions of Lune's standard library, as two nodes: `Lune Function` for a call that does something, `Lune Function (Value)` for one that answers something. The palette lists every function by name — type `readFile` and what you get is a node already set to `fs.readFile`, with its arguments named and typed from Lune's own signature.",
			"**A page about it**, at [Lune's standard library](lune-library): what is in each module, how arguments and results are typed, and which Lune the signatures come from.",
			"**The Inspector offers the require.** A call whose module is not declared says so and gives you a button that declares it — said and offered, never done.",
		],
		changed: [
			"**The type picker knows which runtime it is picking for.** A Lune graph is offered Lune's own types — `DateTime`, `Regex`, `WebSocket` — instead of Roblox's datatypes and Instance classes. Roblox's come back the moment the graph requires `@lune/roblox`, because that module genuinely provides them and a require you wrote is the only thing that should make them appear.",
			"`buffer`, `thread` and `nil` are offered as types in both runtimes. All three are Luau's and none was on a list written by hand.",
			"**The Roblox categories say Roblox again**, rather than `Engine` and `Engine Types`. Unambiguous was easy while there was one engine; a graph compiles for one of two runtimes now. Roblox Corporation owns the name and Roswaal claims no rights in it — see [Attributions](attributions).",
		],
		watch: [
			"**A Lune Function node never writes its own require.** `@lune/fs` is Lune's own and always available, which is the strongest case there is for an exception, and it is still not one: a file that quietly gained a require because you dropped a node is a file whose dependencies are not what its author can see.",
			"Signatures come from Lune 0.10.5, read out of the type definitions that ship with it. Moving to a new Lune is one command and the diff is the API change.",
		],
	},
	{
		version: "0.65.3",
		date: "2026-09-16",
		headline: "Realign no longer stacks a fan-out's arms.",
		affects: ["editor", "docs"],
		fixed: [
			"**Realign put a Branch's two arms on top of each other.** It aligns a node onto the pin that feeds it, which is right for a chain and wrong for a fan-out: two execution pins are one pin row apart and a node is at least 64px tall. The topmost arm keeps its straight wire now and the rest move down to clear it.",
			"**Six drawn graphs had a pair of nodes in the same place** for that reason — Branch, Sequence, Continue, and the scenes under [Wires and pins](wires-and-pins), [Variables and locals](variables-and-locals) and [Services and their methods](services), where the two Prints overlapped exactly and read as one node.",
		],
		changed: ["**Verified**: [Services and their methods](services)."],
	},
	{
		version: "0.65.2",
		date: "2026-09-16",
		headline: "Aliases is Reviewed, and asking for a Lune developer.",
		affects: ["docs"],
		changed: [
			"**Reviewed**: [Aliases and .luaurc](aliases). Read against the RFC and against the editor — which is not the same as a project that resolves its requires through an alias map every day, so the page says what it still wants checked and [Contributing](contributing) asks for it too.",
		],
	},
	{
		version: "0.65.1",
		date: "2026-09-16",
		headline: "Backticks that were printing themselves.",
		affects: ["docs"],
		fixed: [
			"**Code written inside bold or italics rendered as its own backticks** rather than as code. 48 strings across the guides and these notes had it — `.luaurc` on the new Aliases page, and others that shipped long before it.",
		],
		changed: [
			"Where a term inside an emphasised phrase needs monospace, the emphasis is now **split around it** rather than one of the two being dropped. Inside a quotation the backticks go instead: a word in somebody else's sentence is not ours to restyle.",
		],
	},
	{
		version: "0.65.0",
		date: "2026-09-16",
		headline: "Roswaal reads your `.luaurc`, and lets you write one.",
		affects: ["editor", "docs"],
		added: [
			"**A** `.luaurc` **is a file in the project tree**, under Graph content beside your graphs — Roswaal reads it rather than writing it. Double-click one to open the alias editor: what that file defines, where each alias lands once its chain is followed, and underneath, what it inherits from the files above it.",
			"**Aliases are checked against the project.** A specifier naming an alias no `.luaurc` defines is an error where the project uses alias maps, and a warning where it has none at all — the second may be generating one at build time, and refusing to compile that would be refusing a project that builds.",
			"**A page about all of it**, at [Aliases and .luaurc](aliases): where the file goes, what a nearer one inherits from its parents, where a relative path lands, chains and cycles, and what each runtime resolves.",
		],
		changed: [
			"An alias map is resolved the way [the RFC](https://rfcs.luau.org/require-by-string-aliases.html) specifies, checked against it rather than remembered. A nearer `.luaurc` **inherits** what it does not say instead of replacing the map, and a relative path resolves against the file that **defined** it rather than the file requiring — both of which look correct in any project with one `.luaurc` at the root.",
			"Names are case-insensitive, so `@Roact` and `@roact` are one alias. Defining both in one file is reported rather than written.",
			'A chain of aliases is followed, and a ring is reported as the ring it walked — `a → b → c → a` rather than "cycle detected".',
			"Editing a `.luaurc` **splices its aliases** and leaves the rest of the file exactly as it was. A file with comments inside its `aliases` is refused with the reason instead of rewritten: an edit reorders the entries, and a note about why a package is vendored cannot survive that.",
			"Roblox's position on aliases is now linked rather than only quoted, so the claim can be checked instead of taken on trust.",
		],
		watch: [
			"**Roblox does not resolve aliases yet**, so a `.luaurc` in a Roblox project is a file Rojo will sync and the engine will ignore. Roswaal warns rather than refusing — that is code written against something that is coming, not code that is wrong.",
		],
	},
	{
		version: "0.64.8",
		date: "2026-09-16",
		headline: "The published pages get the palette and a gear of their own.",
		affects: ["docs"],
		added: [
			"`Ctrl` **+** `K` **opens the search palette on the published site**, the way it does in the editor and in Node Design. It used to put the cursor in the sidebar's field instead. That field is still there and still filters the tree.",
			"**Settings on a published page**, from the gear at the end of the header: your theme and the face these pages are set in. The icon alone rather than a labelled button — a page gives its width to what you came to read.",
		],
		changed: [
			"**Verified**: the [Functions](functions) guide, rewritten in 0.64.2 and read against the editor.",
			"The drawn bars on [Toolbars](toolbars) show the gear Node Design and the published pages gained, and say why it is a gear on those and a button in the documentation window.",
			"The site's palette takes the sidebar's index and the sidebar's ranking rather than a second copy of either, so the two searches cannot disagree about the best answer.",
		],
	},
	{
		version: "0.64.7",
		date: "2026-09-16",
		headline: "Settings in Node Design, and no more flash of the wrong scheme.",
		affects: ["editor", "docs"],
		added: [
			"**Settings in Node Design**, from the gear beside Open Editor. The same panel the docs window opens, without the Project tab — `roswaal.json` describes a project and stays the editor's to change. It is where node corners and wire style live, which is the window that draws nodes all day.",
		],
		fixed: [
			"**The app no longer opens in the wrong colours.** A module script runs after the page is parsed, so the stylesheet painted first and the scheme you picked arrived a frame later — a flash on every load, worst when your scheme disagrees with your operating system, which is the whole reason for picking one. The scheme is now applied before the first paint. Measured on the built site: ready 38ms before the page painted.",
			"**The Not Found page takes your theme.** It kept the colours it was written with, and now uses them only as the fallback for a reader whose stylesheet did not arrive.",
		],
	},
	{
		version: "0.64.6",
		date: "2026-09-16",
		headline: "The landing page follows your scheme too.",
		affects: ["docs"],
		fixed: [
			"**The site's front page takes your theme.** It is drawn from the same tokens everything else is, so it was one page away from the fix that reached the documentation — and it is the first page anyone sees.",
		],
	},
	{
		version: "0.64.5",
		date: "2026-09-16",
		headline: "Your colour scheme reaches every window, and the documentation site.",
		affects: ["editor", "docs"],
		fixed: [
			"**The published documentation follows your theme.** It shipped the editor's stylesheet and nothing else, so it followed the operating system — a scheme picked in the editor stopped at the Docs button. It now reads the same preference the editor writes, before the page paints, along with your node corners and reading face.",
			"**Node Design follows a theme picked in the editor.** It took the scheme it opened in and kept it, because it has no settings panel of its own and nothing was telling it.",
			"**The editor follows a theme picked in the docs window.** The docs have their own settings panel, and the editor was the one window not listening.",
		],
		changed: [
			"The three windows share one listener rather than a copy each. A theme is stored in `localStorage`, which is exactly so that every window on the origin — including the static site — can be told when it moves.",
		],
		watch: [
			"A node picture on the site follows your scheme too. It is drawn with the same tokens the canvas uses — `var(--node-body)` and the rest — so only a node's **category colour** and its **pin type colours** stay put, and those are fixed in every theme by design, in the editor as much as here.",
		],
	},
	{
		version: "0.64.4",
		date: "2026-09-16",
		headline: "A gesture reads as one input, and a migration nobody can have needed is gone.",
		affects: ["docs"],
		changed: [
			"`Ctrl` **+** `right-click` on [Functions](functions) marks the whole gesture, rather than highlighting the key and leaving the click as prose.",
		],
		fixed: [
			"The **Functions** guide no longer explains what happens to a graph made before 0.33.0. Roswaal has been public since 0.59.1, so no reader has one.",
		],
	},
	{
		version: "0.64.3",
		date: "2026-09-16",
		headline: "A drawn panel holds something, and says which part the page is about.",
		affects: ["docs"],
		added: [
			"**Every section of the drawn Variables panel has rows in it** — two variables, two modules, two locals and two functions, with the `const` badge, a module's specifier and a function's `hoisted` or `here` all shown. A section drawn empty said the section held nothing.",
			"**The section a page is about keeps the light, and the rest dim** — a scrim with a cutout. [Modules](modules) lights Modules, [Functions](functions) lights Functions, and [Variables and locals](variables-and-locals) lights both of its own.",
		],
		changed: [
			"Hovering a dimmed section's explanation lights that section in the picture, scrim and all. A highlight that leaves the thing it points at unreadable is pointing at nothing.",
		],
	},
	{
		version: "0.64.2",
		date: "2026-09-16",
		headline: "The Functions guide, caught up with the editor.",
		affects: ["docs"],
		added: [
			"**How to call one**, which the page never said: Get Function for the value, Call Function for a call that does something, Call For Value for a call that asks something — and why a Get Function above a Declare Function is an error where a hoisted Function has no order to get wrong.",
			"**The signature**: what the Name, Parameters and Return values fields do, that a type there is free text, and what renaming, reordering and removing a parameter each do to the nodes reading it.",
			"**Returning**, with the Return node drawn. Return values configured on the function become named, typed pins on every Return in it.",
			"**Reading a parameter**, with Get Parameter drawn, the `Get ‹parameter›` search entry, and where a parameter is offered.",
			"**Finding one**: the Variables panel, the *This graph* filter in the node menu, and the node picker on `Ctrl` + right-click.",
			"**Previewing the function you are in** with `P`, rather than the whole script.",
			"**The Variables panel is drawn on the Functions page**, with functions explained there and the other sections pointing at their own pages.",
		],
		changed: [
			"**Which locals a function can see** now says which declaration it is talking about: a Declare Function closes over the file's locals, and a hoisted Function is written above them and cannot.",
			"The **Functions** section of the drawn panel points at [Functions](functions) from the pages that are not about functions, the way Modules and Variables already did.",
		],
	},
	{
		version: "0.64.1",
		date: "2026-09-16",
		headline: "A drawn panel's headings, and each section explained where it belongs.",
		affects: ["docs"],
		added: [
			"**The Variables panel is drawn on its own page too**, at [Variables and locals](variables-and-locals), with variables, locals and functions explained in full there.",
		],
		changed: [
			"A section of the drawn panel is explained on the page that is about it, and points there from the others. [Modules](modules) explains modules and links out for the rest; [Variables and locals](variables-and-locals) does the reverse. Same drawing, different words.",
		],
		fixed: [
			"The **Modules**, **Locals** and **Functions** headings in a drawn panel took the article's heading style instead of the editor's, so they came out large and dark where the panel shows small grey caps.",
		],
	},
	{
		version: "0.64.0",
		date: "2026-09-16",
		headline: "Modules, documented — and panels can be drawn now.",
		affects: ["docs"],
		added: [
			"**A page about requiring**, at [Modules](modules): how to declare one, what each runtime resolves, why the name is yours to choose, and what `@lune/roblox` members make possible. Requiring is the one subject where Roblox and Lune genuinely differ, and there was nowhere to look.",
			"**A table of what resolves where** — `./` and `../` anywhere, `@self/` and `@game/` under Roblox, `@lune/*` under Lune, and `.luaurc` aliases under Lune with Roblox still to come.",
			"**The Variables panel is drawn**, the way the toolbars are: hover a section to light its explanation, and hover an explanation to light the section.",
		],
		changed: [
			"The machinery behind a drawn toolbar now draws a **panel** too. It was never about bars — a spec, the editor's own class names, a legend from the same spec, and the pointing between them. One more shape rather than a second copy, so the pointing, the layout traps and the fixes that took three attempts are paid for once.",
			"A drawn row takes its swatch from the palette the canvas uses, so a `number` in a picture is the `number` on your screen. Without a palette it falls back to the ring a module gets, rather than inventing a colour.",
		],
	},
	{
		version: "0.63.0",
		date: "2026-09-16",
		headline: "A script says which modules it requires.",
		affects: ["editor"],
		added: [
			"**Modules are declared, in the Variables panel.** A name, what to require, and optionally what to pull off it. The generated file gets one `require` per declaration, at the top and below the GetService calls — so four uses of one module write one `require`.",
			"**Get Module**, the pill for a declared module. Drag one out of the panel, the way you drag a variable. It reads the local the require was bound to rather than requiring again.",
			"**Require at Top**, for declaring one on the canvas instead. It takes the specifier verbatim, so it works for both runtimes and for forms neither has shipped yet.",
			'**Members**: names pulled off a module into locals of their own. Lune\'s own idiom — `local roblox = require("@lune/roblox")` and then `local Vector3 = roblox.Vector3` — and what lets the Vector3 and CFrame nodes compile unchanged in a Lune graph.',
			"**Specifiers are checked against the runtime you compile for.** `@self/` and `@game/` are Roblox's; `@lune/*` is Lune's; `./` and `../` work anywhere; and an unprefixed path is refused, because that is now an error in Luau itself rather than a fallback.",
		],
		changed: [
			"**The name a module binds to is yours.** Two modules can genuinely want to be called `util`, so the name is chosen rather than derived — and a name you choose is taken exactly, never quietly turned into `util2`. Two declarations wanting one name is an error naming both, since only you can pick which one renames.",
			"A name that shadows something Luau provides is a warning rather than a refusal. Binding `Vector3` is the whole point of the `@lune/roblox` case; naming a module `table` is probably not what you meant.",
		],
		watch: [
			"**A declaration is the only thing that writes a** `require`. Nothing is inferred and nothing is hoisted behind you: if the file imports something, it is because the panel or the canvas says so. That is deliberate, and it is why the datatype nodes will never quietly add an import of their own.",
			"A `.luaurc` alias in a Roblox graph is a warning, not an error. Roblox says alias maps are coming; they do not resolve today.",
			"Deleting a module leaves the pills that read it in place, reporting an error. The same as deleting a variable, and for the same reason: an error you can see beats nodes disappearing.",
		],
	},
	{
		version: "0.62.6",
		date: "2026-09-16",
		headline: "A node's page is tagged with the runtime it needs.",
		affects: ["docs"],
		added: [
			"**Every node page carries its runtime as a tag beside the title** — the same word and the same colour the node menu puts on a row, so a badge in the editor and a badge in the documentation are one vocabulary rather than two.",
			"**Base Luau is tagged too**, which is where the documentation differs from the menu. A list is scanned, so an absence reads; a page is arrived at one at a time, and a page that says nothing has not answered.",
		],
		changed: [
			"The line under the title says what the runtime *means* rather than naming it again — *needs the Roblox engine, its datatypes, its DataModel or its scheduler*. The tag is the thing to scan; the line is the thing to read.",
			"A guide carries no tag. It is about an idea rather than about something that runs, and tagging *Controls* with a runtime would answer a question nobody asked of it.",
		],
	},
	{
		version: "0.62.5",
		date: "2026-09-16",
		headline: "The visual search finds what you named, not just what we shipped.",
		affects: ["editor"],
		added: [
			"`Ctrl` **+ right-click now searches the graph's own declarations too** — its variables, locals, functions and the parameters of the body you are in, beside the built-in library. The one search that shows you what a node *looks* like could not find the node you named yourself.",
			"They come first in the list. A name you chose is likelier to be the one you are after than a built-in that happens to read similarly.",
			"The **This graph** filter works here as well, so the picker can be narrowed to what this graph declares and nothing else.",
		],
		changed: [
			"**The preview draws the entry you are about to place.** A graph's own entry is a node plus the configuration that makes it that one, so Get Accumulator is drawn as Get Accumulator rather than as the nameless capsule underneath it — otherwise every variable in a graph previews identically.",
			"A search matches on the entry's own name. Typing *accumulator* finds **Get Accumulator**, whose definition is called Get Variable and would never have matched.",
		],
		watch: [
			"Both searches take the same list, built once, so they cannot disagree about what is in scope — including which of a function's parameters belong to the body you are looking at.",
		],
	},
	{
		version: "0.62.4",
		date: "2026-09-16",
		headline: "Search only what this graph declares.",
		affects: ["editor"],
		added: [
			"**A This graph filter in the node menu**, beside the runtimes: the variables, locals, functions and parameters this graph declares, with the library set aside. The thing you are looking for when you know you named it.",
			"Those entries carry a quiet badge in the unfiltered list too, so **Get Accumulator** is told apart from the **Get Variable** it sits next to under the same heading.",
		],
		changed: [
			"The filter is one control with four answers rather than two controls. Three of them say which runtime a node needs; This graph says it is not a library node at all. They are different kinds of claim, and a reader opening a search box is asking one question — narrow this — not two.",
		],
		watch: [
			"**In a function's own graph, This graph includes that function's parameters** — and only its own. A parameter exists where its body runs, so the file's graph offers none and a sibling function's are never listed. That was already how the menu worked; the filter inherits it rather than deciding again.",
			"The node picker lists the built-in library only, so it has nothing of the graph's to offer and does not show the chip. The preference is shared, and falls back to showing everything there rather than to an empty list.",
		],
	},
	{
		version: "0.62.3",
		date: "2026-09-16",
		headline: "The front page says what this version is about.",
		affects: ["editor", "docs"],
		changed: [
			"**The front page's footer names the release rather than the moment.** It read *the first public release*, which was true once and then quietly stopped being — a line about a day cannot go on describing the version beside it. It takes the release's own headline now, so it is right for every version without anybody remembering to change it.",
			"The footer's links sit at the other end of the row, so a tagline has room to be a sentence.",
		],
		fixed: [
			"The runtime filter had no room under it, so the chips sat directly on the search box and the two read as one control stuck to another.",
		],
	},
	{
		version: "0.62.2",
		date: "2026-09-16",
		headline: "The runtime badges line up, and a Lune graph says what it is.",
		affects: ["editor"],
		fixed: [
			"**A row carrying both** `pure` **and a runtime badge put the** `pure` **in a different place on every row.** Both were pushed right independently, so they split the space between them rather than travelling together — the column stopped being a column.",
			"**The badge sat two pixels low.** A menu row aligns on the baseline, which is right for a swatch and a title and wrong for a bordered chip: its border hangs below the line its neighbour sits on. Every trailing chip centres now.",
		],
		changed: [
			"**A graph with only one runtime available says so** rather than showing nothing where the filter goes. Every node a Lune graph can compile is base Luau today, so there was nothing to choose between — and an empty space read as the filter being broken instead of as there being one answer.",
		],
		watch: [
			"There are no Lune-only nodes yet, which is why a Lune graph offers base Luau and nothing else. They arrive with the Lune standard library — `@lune/fs`, `@lune/net`, `@lune/process` and the rest — which is a later release in this sequence.",
		],
	},
	{
		version: "0.62.1",
		date: "2026-09-16",
		headline: "Switching a tab no longer leaves you on a blank page.",
		affects: ["docs"],
		fixed: [
			"**Clicking a tab on a documentation page could scroll the window to an empty part of the document.** The switch hides its radio buttons by positioning them absolutely, and with no positioned ancestor they were measured against the page itself — so on [Toolbars](toolbars) two of them sat two thousand pixels below anything that renders and stretched the document to three times its height. Clicking the label focused one, the browser scrolled it into view, and you landed on nothing at all. Nothing threw, so there was nothing in the console either.",
		],
		watch: [
			"It only ever happened to a real pointer. Focus is what moved the window, and a scripted click does not focus — which is why it survived three attempts to reproduce it.",
		],
	},
	{
		version: "0.62.0",
		date: "2026-09-16",
		headline: "Search nodes by the runtime they work for.",
		affects: ["editor", "docs"],
		added: [
			"**A runtime filter in the node menu and the node picker** — All, Luau, Roblox — remembered between openings. It narrows what the graph's target already allows rather than replacing it, so a Lune graph never gains a Roblox node by picking a chip.",
			'**Luau** is the useful one: it answers "which of these still works if I move this graph to the other runtime".',
			"**A badge on a node that needs something.** Base Luau is unmarked — badging four rows in five would be noise, and the absence is the claim: this one runs anywhere.",
			'**Every node\'s page says which runtime it is for**, base Luau included. Said nowhere, "works in both" and "nobody has decided" look identical, and for 237 nodes they were the same thing until 0.61.0.',
		],
		changed: [
			"The filter offers only the runtimes actually present. A Lune graph has no Roblox nodes left to narrow to, so the chip is not there — a filter that can only return nothing is worse than no filter — and with one runtime present the row goes entirely.",
		],
		fixed: [
			"Bringing a lit toolbar control into view measured from the wrong element on the [Toolbars](toolbars) page, so on a page with anything positioned above it the bar scrolled to a meaningless offset.",
		],
	},
	{
		version: "0.61.0",
		date: "2026-09-16",
		headline: "Every node says which runtime it is for.",
		affects: ["editor"],
		added: [
			"**All 283 built-in nodes now declare their runtime.** 46 did before, so a Lune graph was offered every Vector3, every Instance method and the whole remote system as though they would compile. A Lune graph now sees 95 nodes — the language and what Roswaal builds out of it — and a Roblox graph still sees all of them.",
			"Every category has to be classified, so a new one cannot be added without somebody saying what it runs on. That is exactly how 237 nodes came to say nothing.",
		],
		changed: [
			"The Engine Types, Instances, Engine, Events, Networking, Players, Time and Z-Up Conversions nodes are **Roblox only**. Lune carries its own `Vector3` and friends behind `@lune/roblox`, so the datatypes become available there once there is a node that can require one — not before, because a node that appears and then always errors is worse than one that does not appear.",
			'The `task` nodes are Roblox only. Lune\'s scheduler is not a global: it is `require("@lune/task")`, so `task.wait(1)` in a Lune file indexes nil.',
		],
		fixed: [
			"`Resume Coroutine` **and** `Yield` **were hidden from Lune graphs.** `coroutine` is Luau's own primitive and works in both runtimes — six of its eight nodes were offered and these two were not, because the helper that built them filled in a Roblox tag on every node it made. A node's runtime is no longer a property of how its definition happened to be written.",
		],
		watch: [
			"If you have a Lune graph using a node that is now Roblox only, it keeps working and keeps compiling — nothing was removed. The node menu stops offering it for new work, and compiling already told you it was an error.",
			"A node pack's nodes are untouched. What they run on is the project's to declare, and guessing on its behalf is not ours to do.",
		],
	},
	{
		version: "0.60.4",
		date: "2026-09-16",
		headline: "The canvas behind the graph toolbars reaches its own edges.",
		affects: ["docs"],
		fixed: [
			"**The grid behind the drawn graph toolbars stopped level with the tools**, leaving a bare band above and below it inside the frame. 0.60.3 put the canvas on the right element and the gap around the tools on the wrong one: a margin, which collapsed straight back out through the element painting the canvas, so the pane ended up exactly as tall as its contents. The gap is padding now, inside the thing that paints.",
		],
	},
	{
		version: "0.60.3",
		date: "2026-09-16",
		headline: "The graph toolbars float over a canvas again.",
		affects: ["docs"],
		verified: ["toolbars"],
		changed: [
			"**The drawn graph toolbars sit on a full pane of canvas**, grid and all, rather than on a strip that stopped where the tools stopped. The whole point of that picture is that the three groups float over a view which carries on past them, and a canvas cut to the size of its contents said the opposite.",
		],
	},
	{
		version: "0.60.2",
		date: "2026-09-16",
		headline: "A drawn toolbar sits on the page rather than in the list.",
		affects: ["docs"],
		changed: [
			"**The drawn bars are inset from their frames** on [Toolbars](toolbars), with their own corners and a little of the app's background around them. Flush against the list underneath, a bar read as that list's top row rather than as the thing the list is about — and a control nobody reads as a control is not one they think to hover.",
		],
	},
	{
		version: "0.60.1",
		date: "2026-09-16",
		headline: "A canary build says so, on every page.",
		affects: ["editor", "designer", "docs"],
		added: [
			"**The canary channel.** Roswaal now builds from two lines: the stable one, and a canary where work lands first. A canary build wears a yellow *canary* mark beside the version, on the editor, on Node Design and on the documentation — and carries a banner above them saying what that means, with a link to the stable build.",
			"The documentation's canary says something sharper than the editor's: these pages describe a build that is not out, so what they say may not be in the version you have.",
			"Canary pages are marked `noindex`, so the unreleased copy of the documentation does not compete with the real one in search results.",
		],
		changed: [
			"The build mark is one rule with two variants rather than one mark with an exception. A build wears *canary* or *preview*, never both: an unfinished build is unfinished whether it is in a browser tab or on your own machine.",
			"The front page's first button carries whichever mark the site was built from, and the sentence under it agrees with it.",
		],
		fixed: [
			"**The test suite read which build it was being run for.** The site workflow sets the channel for the whole job, so the two tests that asked the front page what it looked like got the canary's answer and failed — on the canary only, after passing on every machine. They state which build they mean now, and the suite pins the channel so nothing can read it by accident again.",
			"**The canary mark was drawn in the preview's colour.** The chip read *canary* and was painted accent blue, because the rule that colours it in a toolbar is more specific than the rule that says which colour a canary is. The colour is chosen on the chip itself now, so no amount of chrome around it can overrule what it is claiming.",
		],
		watch: [
			"Nothing changes for the stable build: it carries no canary mark, no banner and no `noindex`. If you are reading this anywhere but the canary site, none of it is on your screen.",
			"The site workflow now takes its base path from the repository's own name rather than a hard-coded one, so both repositories publish correctly from the same file.",
		],
	},
	{
		version: "0.60.0",
		date: "2026-09-16",
		headline: "Every toolbar is drawn, with its buttons named.",
		affects: ["docs", "editor", "designer"],
		added: [
			"A new page under Getting started, [Toolbars](toolbars). Five bars drawn as they appear — the editor's top bar, the three floating groups over a graph, a node map's row, Node Design's header and this window's — each with every control named underneath it.",
			"**Docs, Node Design and Settings are named and placed.** They are the last three icons on the editor's top bar, in that order, and the page says so in words as well as in the picture.",
			"A table of how to get from any of the three windows to the other two.",
			"**The drawn bars point at their own documentation.** Hover a control and its row in the list lights; hover a row and the control lights. Tapping one keeps it lit, and brings it into view if the bar has scrolled sideways.",
			"**Both editors are drawn.** The editor's top bar, Node Design's header and the documentation's own header each carry a switch between the build the daemon serves and the one that runs in a browser tab.",
			"**Every window of the browser preview now says it is one.** The *preview* chip sits beside the version in the editor and in Node Design, and the links into it — the front page's first button, and *Try it in your browser* in the documentation's header — carry it too. If you can see the chip, your project is kept in that browser rather than in your repository.",
		],
		changed: [
			"The front page says what the browser preview is, under the button that opens it. Its own tag is still the version: Roswaal is not a preview, the thing behind that one button is.",
			"Getting started and [Controls](controls) point at the new page. Controls is the keyboard and the mouse; the buttons are on Toolbars.",
			"*Creating custom nodes* names the button that opens Node Design rather than saying it is on the toolbar.",
		],
		fixed: [
			"**Node Design in the browser preview did not say it was the preview.** It is a whole window of that build and carried nothing; the chip was a one-off in the editor's toolbar rather than a rule. It is one component now, and every surface of that build renders it.",
			"**In the browser preview, the Docs button said it would show this project's packs.** It opens the published documentation, which is a static site with no registry behind it and documents the built-in library only. The tooltip now says so; the button is unchanged, and a project's own packs are still documented in the editor the daemon serves.",
		],
		watch: [
			"The bars are drawn in your own theme, at your own window width, rather than photographed — so a bar wider than the reading column scrolls sideways. The position of each control is written out in the list beneath it as well, which is what the page falls back on with no pointer and no script.",
			"Nothing in a drawn bar does anything when you click it. It is a picture of a control, not the control.",
		],
	},
];
