/**
 * Release notes for 0.120.0 to 0.129.x, newest first.
 *
 * One of the files `../releases.ts` puts together, a tenth of the minor
 * versions each, so the newest notes are not at the top of a very long file.
 */

import type { Release } from "../releases.js";

export const RELEASES_0_120: Release[] = [
	{
		version: "0.240.0",
		date: "2026-11-13",
		headline: "The place viewer draws Decals and Textures, from images Sign in with Roblox downloads.",
		added: [
			"**Decals and Textures in the place viewer.** Signed in with Roblox through `roswaal serve`, a Decal stretches its image over its part's face and a Texture tiles it by StudsPerTile and OffsetStuds, in its Color3 and Transparency, lit as the face is. Each image is downloaded once into the project. Until then, and on the website, the face is its part's colour.",
		],
	},
	{
		version: "0.239.0",
		date: "2026-11-13",
		headline: "Panels in the toolbar, New graph and New node map on each folder, and Services picked from a list.",
		added: [
			"**Panels, in the toolbar.** Every panel, each with its icon: choose one to show or hide it, or bring back one you closed. A panel with nothing to show yet is greyed out. On a phone it is in More.",
			"**New graph and New node map on each folder.** Point at a folder under `.roswaal` in the Project panel and its two buttons appear, making the graph or map in that folder without opening or shutting it.",
		],
		changed: [
			"**Add on Services opens a searchable list**, as the type picker does, with each service's class icon and what it is.",
			"**The toolbar no longer has New graph and New node map.** On a narrow window or a phone they are still in More.",
		],
	},
	{
		version: "0.238.2",
		date: "2026-11-13",
		headline: "The notice of a change to the Terms reads as an update.",
		changed: [
			"**The notice after a change is titled Updates to the Terms of Service and Privacy Policy**, in place of The terms have changed.",
		],
	},
	{
		version: "0.238.1",
		date: "2026-11-13",
		headline: "Creator Marketplace meshes download through Sign in with Roblox.",
		fixed: [
			"**Meshes Roblox serves from its content delivery server now download.** Some Creator Marketplace meshes come from contentdelivery.roblox.com rather than Roblox's CDN, and were refused. A refused download now names the server it was refused for.",
		],
	},
	{
		version: "0.238.0",
		date: "2026-11-13",
		headline: "Sign in with Roblox can download the assets a place uses, and keeps them only as long as needed.",
		added: [
			"**Downloads through Sign in with Roblox**, for the place viewer to draw. They are kept in the project's `.roswaal/assets` folder, which keeps itself out of Git, and are fetched only from Roblox's own download servers. Anything Roblox made is never downloaded.",
			"**Downloaded assets, in Settings › Extended Features**, says how many the open project holds and clears them. Any not used for 30 days are deleted by themselves, and signing out deletes every project's.",
		],
		changed: [
			"**The Privacy Policy names where downloads are kept**, that unused ones are deleted after 30 days, and the list of project folders that lets signing out delete them all.",
		],
	},
	{
		version: "0.237.0",
		date: "2026-11-13",
		headline: "Sign in with Roblox, through roswaal serve, in Settings › Extended Features.",
		added: [
			"**Sign in with Roblox**, in Settings › Extended Features when the editor runs through `roswaal serve`. A screen first says what Roblox will ask for, where the sign-in is kept and how to remove it, and asks anyone under 18 to check with a parent or guardian. Roswaal's Roblox app is in private mode while this is tried, so only a few accounts can use it, and nothing is downloaded with it yet.",
			"**Signing out** ends the sign-in on Roblox and deletes it. If Roblox stops accepting it, Roswaal deletes it the next time the daemon starts.",
		],
		changed: [
			"**The Privacy Policy says where the sign-in is kept**: in `.roswaal` in your home folder, readable only by your account and encrypted on Windows, with the 15-minute access token in memory only.",
		],
	},
	{
		version: "0.236.5",
		date: "2026-11-13",
		headline: "The Privacy Policy defines its terms, and Attributions is verified again.",
		changed: [
			"**The Privacy Policy opens with Definitions**, worded as in the Terms of Service: Roswaal, the Daemon, the Website, You, Roblox, Sign in with Roblox, Downloaded Assets and Services.",
			"**Attributions is verified** as of 13 November 2026.",
		],
	},
	{
		version: "0.236.4",
		date: "2026-11-13",
		headline: "The Terms of Service say what Roblox's terms for third-party apps ask them to.",
		changed: [
			"**The Terms of Service ask you to follow the Roblox Terms of Use.** They also say the terms are between you and Roswaal's authors only, that Roblox is not affiliated, liable or obliged to support Roswaal, and that you release Roblox from claims arising from it.",
		],
	},
	{
		version: "0.236.3",
		date: "2026-11-13",
		headline: "Attributions uses the Terms' definitions, and the Terms and Privacy Policy are verified again.",
		changed: [
			"**Attributions defines Roswaal, Roblox and the Luau Team** as the Terms of Service do, and says Roswaal is not made by, endorsed by, affiliated with or approved by the Luau Team. ATTRIBUTIONS.md says the same.",
			"**The Terms of Service and Privacy Policy are verified** as of 13 November 2026.",
		],
	},
	{
		version: "0.236.2",
		date: "2026-11-13",
		headline: "The Terms of Service define their terms, and the daemon's key never travels in an address.",
		changed: [
			"**The Terms of Service open with Definitions**, among them the Luau Team: an internal team of Roblox Corporation dedicated to the research, development and maintenance of the Luau language.",
			"**The Terms say Roswaal is not made by, endorsed by, affiliated with or approved by the Luau Team.**",
		],
		fixed: [
			"**The daemon's key is sent only in a header.** The editor reads the event stream with `fetch`, and the daemon no longer accepts the key in the stream's address.",
			"**The notice of the Terms and Privacy Policy comes back after any change to their wording**, even on the day it was last shown.",
			"**body-parser and qs updated** to releases without known vulnerabilities.",
		],
	},
	{
		version: "0.236.1",
		date: "2026-11-13",
		headline: "If local and while local is a Studio beta in Settings › Extended Features.",
		changed: [
			"**If local and while local moved to Settings › Extended Features**, under Studio betas, from Compiling. It is still saved in the project's `roswaal.json`.",
		],
	},
	{
		version: "0.236.0",
		date: "2026-11-13",
		headline: "Settings › Extended Features turns the place viewer off.",
		added: [
			"**Settings › Extended Features.** Parts of Roswaal you can turn off, each with a short description and a checkbox, as Studio lists its Beta Features. The first is the place viewer.",
			"**The place viewer can be turned off.** Off, its 3D view is never loaded, which saves memory in the browser, and a place's tab says so with a button to turn it back on. The DataModel tree and Properties still work.",
		],
		changed: [
			"**The place viewer loads when a place's tab first opens**, not with the editor.",
		],
	},
	{
		version: "0.235.0",
		date: "2026-11-13",
		headline: "The editor points to the Terms and Privacy Policy, and the Terms say who Roswaal is for.",
		added: [
			"**A notice of the Terms of Service and Privacy Policy.** The editor and Node Design show it on your first visit, and again when either changes, with a link to each.",
			"**The Terms of Service say who Roswaal is for.** It is designed primarily for people aged 18 and over; if you are younger, ask a parent or guardian, and read the terms together first.",
		],
		changed: [
			"**Sign in with Roblox asks for less.** The Privacy Policy lists `openid`, which gives Roswaal your user ID and not your name or avatar, in place of `openid` and `profile`.",
			"**Sign in with Roblox is optional.** Both pages say you can make projects without it; without it, a place's Creator Marketplace meshes and images are drawn as stand-ins.",
			"**Signing out, said exactly.** The Privacy Policy says access Roblox has already granted runs out by itself within 15 minutes.",
			"**Each page has its own Last Edited date.** Both had shown 7 November since they changed on 12 November.",
		],
	},
	{
		version: "0.234.0",
		date: "2026-11-13",
		headline: "Bind writes plain Luau unless the project asks for Studio's beta syntax.",
		added: [
			"**If local and while local, in Settings › Compiling.** On, Bind writes `if local`, `elseif local` and `while local`, which need Studio's If Local/Const Bindings beta. It is `conditionalBindings` in `roswaal.json`.",
		],
		changed: [
			"**Bind writes plain Luau by default.** A bound Branch writes `local admin = admins[id]` and `if admin then`, and a bound While Loop a `while true` loop that stops when the value is nil or false. Roswaal still reads `if local` and `while local`.",
		],
	},
	{
		version: "0.233.1",
		date: "2026-11-13",
		headline: "A bound Branch or While Loop writes a call straight into if local and while local.",
		fixed: [
			"**A call bound by a Branch or While Loop is written into the binding.** A Call Function or Call Method just before it writes `if local admin = getAdmin(id) then`, not a `local result` first. In a While Loop the call is now made on every pass.",
		],
	},
	{
		version: "0.233.0",
		date: "2026-11-13",
		headline: "Roblox Studio 0.747, Lune 0.11.1 and Material Symbols 0.49.0.",
		added: [
			"**Lune 0.11.1.** The Lune catalogue adds `net.http.request`, `net.http.serve` and `net.ws.connect`.",
			"**Studio 0.747.** The engine catalogue adds AudioStreamReader, AudioStreamWriter and ViewportCamera, with class icons for each.",
		],
		changed: [
			"**Class icons come from Material Symbols 0.49.0.** Platform's icon is now crop_5_4, as 0.49.0 removed crop_landscape.",
			"**Packages updated within their current majors**, including Biome 2.6.7, React 19.3.1, Vite 8.3.8 and Vitest 5.1.0. The unused `codemirror` package is removed.",
		],
		fixed: [
			"**Lune functions show their own descriptions.** Some took the text of a type documented above them, such as `net.tcp.connect`.",
		],
	},
	{
		version: "0.232.0",
		date: "2026-11-13",
		headline: "Bind writes if local, elseif local and while local, and Roswaal reads them.",
		added: [
			"**Roswaal reads conditional bindings.** Luau with `if local`, `if const`, `elseif local` or `while local` imports as bound Branches and While Loops, and the Code panel and Script analysis accept it.",
		],
		changed: [
			"**Bind writes Luau's conditional bindings.** A bound Branch writes `if local admin = admins[id] then`, a chain of them `elseif local`, and a bound While Loop `while local item = queue[1] do`. They are a Studio beta: turn on If Local/Const Bindings in Studio's Beta Features.",
		],
		watch: [
			"**StyLua formats if local from 2.6.0.** No StyLua release formats `while local` yet, so a file with one is written unformatted.",
		],
	},
	{
		version: "0.231.0",
		date: "2026-11-12",
		headline: "A Branch or a While Loop can bind its condition, as Luau's proposed if local does.",
		added: [
			"**Branch and While Loop can bind their condition.** Tick Bind the condition in the Inspector: the condition is kept in a local you name, and handed on as a pin to the True side or the loop's body, where it is not nil or false. It compiles to `local admin = admins[id]` and `if admin then`, which Luau runs today and which is what the proposed `if local` and `while local` mean. It can be `const`. Read anywhere else, the pin says where it exists.",
		],
	},
	{
		version: "0.230.3",
		date: "2026-11-12",
		headline: "The Privacy Policy names the daemon's key.",
		changed: [
			"**The Privacy Policy names the daemon's key.** The daemon answers only requests that carry its key, writes a new one to `.roswaal` in your home folder each time it starts, readable only by your account, and the editor keeps it in the tab's session storage.",
		],
	},
	{
		version: "0.230.2",
		date: "2026-11-12",
		headline:
			"The docs show Add from Wally's version question, and Attributions is verified again.",
		changed: [
			"**Wally packages shows the version question.** Add from Wally's steps include Which version?, and the project tree section says a package with no version of its own shows 1.0.0.",
			"**The interface page says how Script analysis is sized**, by its top and right edges.",
		],
		verified: ["attributions"],
	},
	{
		version: "0.230.1",
		date: "2026-11-12",
		headline: "The Luau logo marks .luau files in every build.",
		changed: [
			"**The Luau logo marks .luau files in every build**, not only the canary. It is used with the Luau team's permission. Roswaal is not made by the Luau team, as the Attributions page and the legal page say.",
		],
	},
	{
		version: "0.230.0",
		date: "2026-11-12",
		headline: "Add from Wally asks which version, and every package shows one.",
		added: [
			"**Add from Wally asks which version.** A package added without a version, when the registry lists more than one, asks which, with the newest picked already. An older one is pinned to exactly that version, so `wally install` keeps it.",
		],
		changed: [
			"**Every package shows a version.** One with none of its own, such as code put in a package's place, shows 1.0.0 in the Project tree. Its line in `wally.toml` is left as it is.",
		],
	},
	{
		version: "0.229.0",
		date: "2026-11-12",
		headline: "Script analysis can be resized, the grid switches at once, and const is coloured.",
		added: [
			"**Script analysis resizes.** Under the graph, drag its top or right edge, or the corner between them. Double-click an edge to fit it to its list again. Floated over the graph, it fills its window.",
		],
		fixed: [
			"**The grid switches at once.** Choosing Dots or Lines, a Grid contrast or a Class icons style in Settings changes the editor straight away, rather than after a reload.",
			"**const is coloured.** Luau's `const x = 5` and `const function f()` are coloured as declarations, and `const` used as a name stays a name.",
		],
	},
	{
		version: "0.228.4",
		date: "2026-11-10",
		headline: "A node map's paths stay inside the project.",
		fixed: [
			"**Map paths stay inside the project.** A path, or the project file's output, that leads out of the project, such as `../shared` or `C:/Users/…`, is an error in the map, shown as it is typed, and the project file is not written. It used to go into the project file without a word, pointing Rojo outside the project.",
			"**A Lune map's names cannot climb.** A folder or file called `..` or `.` is an error.",
		],
		watch: [
			"**A map that synced a folder above the project stops compiling.** Move the folder into the project. If your project needs one outside it, [tell us](https://github.com/neopolitans/roswaal-feedback/issues/new).",
		],
	},
	{
		version: "0.228.3",
		date: "2026-11-10",
		headline:
			"A save cut off part-way leaves nothing behind, and Dynamic mode says when it cannot compile.",
		fixed: [
			"**A cut-off save leaves nothing behind.** A save that failed part-way could leave an empty `<name>.<random>.tmp` file beside the graph. It is removed now, and on the website a save writes straight to the file, which the browser keeps unchanged until the write is complete.",
			"**Dynamic mode says when it cannot compile.** A graph it could not compile, such as one that no longer reads as a graph, was skipped without a word. The editor now names the file and the reason, once for each new problem.",
		],
	},
	{
		version: "0.228.2",
		date: "2026-11-10",
		headline: "roswaal status and roswaal stop exit cleanly on Windows.",
		fixed: [
			"**Status and stop exit cleanly on Windows.** With a daemon running, both did their work and then failed with exit code 127 and an assertion from Node. They exit with 0.",
			"**Status says when it was told nothing.** For a daemon started by another account, or with no key for the port in `~/.roswaal`, it says so instead of reporting no project open.",
		],
	},
	{
		version: "0.228.1",
		date: "2026-11-10",
		headline: "A link inside the project opens again on macOS and Linux.",
		fixed: [
			"**Links inside the project open.** On macOS and Linux, 0.228.0 refused a file reached through a link that stays inside the project. It is followed as before; a link put in its place while it is being opened is still refused.",
		],
	},
	{
		version: "0.228.0",
		date: "2026-11-10",
		headline: "The daemon asks for a key, so other accounts on the computer cannot use it.",
		added: [
			"**A key for the daemon.** `roswaal serve` makes a new key each time it starts and prints the editor's address with it. A tab opened from that address keeps the key for as long as it is open. Without the key, the daemon says only that it is running.",
		],
		changed: [
			"**Getting started notes the path.** A from-source install runs the first `node` on your path, so folders other accounts can write to belong off it.",
		],
		fixed: [
			"**Delete keeps to what Roswaal made.** It refuses `.git`, `Packages`, `roswaal.json`, the place backups and the output folder itself.",
			"**A folder holding only Packages or .git keeps them.** A map folder moved into one is moved in beside them.",
			"**Files are checked again once open.** A file swapped for a link between the check and the open is refused rather than read or written through.",
			"**Place and Rojo project paths stay in the project.** A `place` or `rojoProject` in `roswaal.json` that leads outside the project is refused when the file is read.",
		],
		watch: [
			"**Open the editor from the printed address.** A tab left open while the daemon restarts asks for the new key: paste the new address into it. `roswaal stop` and `roswaal status` read the key from `~/.roswaal/daemon-<port>.token`.",
		],
	},
	{
		version: "0.227.0",
		date: "2026-11-10",
		headline: "The 3D view's frame rate can be capped, or left to the display or unlimited.",
		added: [
			"**Frame rate.** Beside Renderer in the place's Properties and in Settings › Scene view: 24, 30, 60, 120, 144, 165, 180 or 240 frames a second at most, VSync to match the display, which is the default, or Unlimited. The view is still drawn only when something in it changes.",
		],
	},
	{
		version: "0.226.1",
		date: "2026-11-10",
		headline: "Dragging a box in the 3D view no longer stalls it.",
		fixed: [
			"**A box drag is light.** Drawing a box to pick parts redrew the whole place every frame while it was held, though nothing in the view moved, and a large place stalled as the drag began. The view now draws only when what it shows changes.",
		],
	},
	{
		version: "0.226.0",
		date: "2026-11-10",
		headline: "A service's events are in the node menu, InputBegan among them.",
		added: [
			"**Service events in the menu.** Dragging a wire off a service offers its events beside its methods: `On InputBegan` and `On InputEnded` off UserInputService, `On Heartbeat` off RunService, `On PlayerAdded` off Players. Each places On Event set to that event, its parameters typed, and wired to the service. Searched from anywhere, they read `On UserInputService.InputBegan`.",
		],
	},
	{
		version: "0.225.2",
		date: "2026-11-10",
		headline: "A pinned Properties window stays on screen, and docks in the Properties panel.",
		fixed: [
			"**Pinned windows stay on screen.** One opened while the window was full screen was left off its edge when it was not. A pinned window is kept wholly inside the window as it changes size.",
		],
		added: [
			"**Pins dock.** The dock button in a pinned window's header puts it in the Properties panel, under the instance the panel follows, where it folds on its own. Its float button puts it back in its window.",
		],
	},
	{
		version: "0.225.1",
		date: "2026-11-10",
		headline:
			"Windows move smoothly, the pivot shows its axes only in Edit Pivot, and Pivot and Object sit by the steps.",
		fixed: [
			"**Windows keep up.** Moving or resizing a pinned Properties window, or resizing a panel's window, redrew the whole editor at every step and lagged behind the pointer.",
		],
		changed: [
			"**The pivot is a dot.** A picked instance's pivot shows its X, Y and Z only while Pivot is on.",
			"**Pivot and Object by the steps.** They sit beside the stud and rotation steps in the 3D view's bar, apart from the tools.",
		],
	},
	{
		version: "0.225.0",
		date: "2026-11-10",
		headline: "Properties can be pinned to an instance, in windows of their own.",
		added: [
			"**Pinned Properties.** The pin in the Properties header keeps the instance it shows in a window of its own, which moves by its header and resizes from its edges. Properties goes on following what you pick, so several instances can be read and changed side by side. Each window finds its instance again after a change to the place, and closes when the instance is gone.",
		],
	},
	{
		version: "0.224.1",
		date: "2026-11-10",
		headline:
			"Neon's glow falls off smoothly, and one click in DataModel shows what it picks while the place is open.",
		fixed: [
			"**Neon's glow has no bands.** Its soft edge was drawn in visible steps. It is blurred at a finer depth now, where the browser allows, and laid over the view with a fine dither.",
			"**One click shows an instance in Properties.** With the place open in 3D, Properties kept describing the place until an instance was double-clicked.",
		],
	},
	{
		version: "0.224.0",
		date: "2026-11-10",
		headline:
			"DataModel lists the services in use, Add Service to Explorer lists another, and Ctrl+click adds to what the 3D view picks.",
		added: [
			"**Add Service to Explorer.** DataModel lists the services that hold something and those the project's Luau reaches. The rest wait behind **Add Service to Explorer**, at the foot of the list, and one picked there stays listed for the project.",
			"**Ctrl+click in the 3D view.** `Ctrl` + click, `Cmd` on a Mac, adds what it reaches to what is picked, or takes it out; with `Alt` too, the part itself. `Ctrl` + drag adds a box's parts, as `Shift` + drag does.",
		],
		changed: [
			"**Three service icons.** ServerScriptService is a server. ServerStorage is ReplicatedStorage's box with a server in its corner, and ReplicatedFirst the box with a rocket.",
		],
	},
	{
		version: "0.223.1",
		date: "2026-11-10",
		headline:
			"The 3D view's editing tools wait on Modify DataModel Instances, and importing a place asks whether to edit it.",
		changed: [
			"**Editing tools are greyed out while editing is off.** Move, Rotate, Scale, Pivot and Object in the 3D view's bar, and their keys, are offered with Modify DataModel Instances on. Each says where to turn it on.",
			"**Importing asks about the DataModel.** Import a place file, and Import Rojo project when the project has a place, ask whether to view the place only or to view and edit it. The answer sets Modify DataModel Instances.",
		],
	},
	{
		version: "0.223.0",
		date: "2026-11-10",
		headline:
			"Ctrl+L turns the 3D view's handles between the object's axes and the world's, and a CFrame reads as its Position and Orientation.",
		added: [
			"**Object and global space.** `Ctrl` + `L`, `Cmd` + `L` on a Mac, turns the handles between the axes of what is picked and the world's, as in Studio. **Object** in the 3D view's bar does the same and shows which is on.",
		],
		changed: [
			"**A CFrame is its Position and Orientation.** In Properties, CFrame, Origin and Pivot Offset each show their Position and Orientation on rows of their own, under their name. A heading counts each of them once.",
		],
	},
	{
		version: "0.222.3",
		date: "2026-11-10",
		headline: "Properties opens with a simpler header, and says when it is read-only.",
		changed: [
			"**A simpler header.** The top of Properties shows the class's own icon beside the name, with the class and its path on the line under. The path is no longer a line of its own.",
			"**Properties says when it is read-only.** While Modify DataModel Instances is off, a line under the summary says where to turn it on.",
		],
		fixed: [
			"**An empty reference reads none.** With Modify DataModel Instances on, an empty PrimaryPart broke none across two lines.",
		],
	},
	{
		version: "0.222.2",
		date: "2026-11-09",
		headline: "Properties shows a pivot under Pivot, as its Position and Orientation.",
		changed: [
			"**Pivots under Pivot.** A model's pivot is Origin Position and Origin Orientation, and a part's PivotOffset is Pivot Offset Position and Pivot Offset Orientation, each its own row under Pivot, as Studio shows them. A model's pivot was one WorldPivotData row under Other.",
		],
		added: [
			"**A model's pivot can be changed.** With Modify DataModel Instances on, Origin Position and Origin Orientation are written into the place, binary or XML.",
		],
	},
	{
		version: "0.222.1",
		date: "2026-11-09",
		headline: "Services have their own icons in DataModel.",
		changed: [
			"**Services have their own icons.** Workspace, Lighting, Players and the other services, and StarterPlayerScripts, StarterCharacterScripts and StarterGear, are drawn with their class's icon in DataModel and on their Properties badge. Scripts and folders keep the project tree's.",
		],
	},
	{
		version: "0.222.0",
		date: "2026-11-09",
		headline:
			"The 3D view shows what is picked square to itself, with its pivot, and has Edit Pivot.",
		added: [
			"**The pivot is shown.** One thing picked in the 3D view shows its pivot over every part in front of it: a white dot with its X, Y and Z.",
			"**Edit Pivot.** **Pivot** in the 3D view's bar puts the move and rotate handles on the pivot of what is picked.",
		],
		fixed: [
			"**A model's selection box turns with it.** It was square to the world. It is square to the model's pivot, as Studio's is: its PrimaryPart's, else its WorldPivot.",
			"**The handles turn with what is picked.** They stood square to the world; they follow a part's own sides and a model's pivot.",
		],
	},
	{
		version: "0.221.2",
		date: "2026-11-09",
		headline: "The type picker lists buffer under Luau.",
		fixed: [
			"**buffer is under Luau.** The type picker listed Luau's byte buffer type on its own under Other, and type pins did not offer it.",
		],
	},
	{
		version: "0.221.1",
		date: "2026-11-09",
		headline: "The icon for a class Roswaal does not know is the same on every machine.",
		fixed: [
			"**The question mark is a shape.** The grey icon for a class with no icon of its own drew its question mark in a font many machines do not have.",
		],
	},
	{
		version: "0.221.0",
		date: "2026-11-09",
		headline: "Every class and Roblox type has an icon, coloured by what it is for.",
		added: [
			"**Class icons.** Every engine class has an icon in the type picker, beside its name in DataModel, and on its Properties badge, in the colour of its purpose: sound, interface, physics and so on. Scripts, folders and services keep the project tree's icons.",
			"**Datatype icons.** `Vector3`, `CFrame`, `Color3` and the other Roblox types have icons in the type picker, in their wire colour.",
			"**Classes are grouped by purpose.** The type picker and Add Instance put every sound class together, every interface class together, and so on.",
			"**Two settings.** Settings › Workspace › Classes: **Class icons** is Filled or Outline, and **Group classes** is By purpose or By family.",
		],
	},
	{
		version: "0.220.11",
		date: "2026-11-09",
		headline: "The engine catalogue is Studio 0.746's.",
		changed: [
			"**The engine catalogue is read from Studio 0.746's documentation.** It adds four classes, among them `IntegrityService` and `Logger`, and fifteen enums, and drops `PrimalPhysicsSolver`.",
			"**Services offer the methods their documentation now lists,** such as `RunService:IsEdit` and `CollectionService:GetCollections`.",
		],
	},
	{
		version: "0.220.10",
		date: "2026-11-09",
		headline: "The selection box is its own blue in Safari and Firefox, and shows over Neon.",
		fixed: [
			"**The selection box is its own blue in Safari and Firefox.** It was drawn half-clear and dark, so it looked purple, and faint over Neon.",
			"**Parts keep their colour in Safari and Firefox on roswaal.app.** An opaque part with a lot of blue in its colour was drawn dark blue.",
			"**The selection box shows over Neon.** The glow round Neon was added over it, and washed it out.",
		],
	},
	{
		version: "0.220.9",
		date: "2026-11-08",
		headline: "The macOS and Linux launcher runs from a clone.",
		fixed: [
			"**The macOS and Linux launcher may be run.** `bin/roswaal` was stored without permission to run, so a clone answered `Permission denied`, and a `bin` folder on PATH found no `roswaal` at all.",
		],
	},
	{
		version: "0.220.8",
		date: "2026-11-08",
		headline:
			"The Attributions page's place-file entry links to Roblox's documentation and to rbx-dom's.",
		affects: ["docs"],
		changed: [
			"**Two links for place files.** Roblox place and model files leads to Roblox's Studio documentation, and its note to rbx-dom's description of the binary format.",
		],
	},
	{
		version: "0.220.7",
		date: "2026-11-08",
		headline:
			"The viewport's patterns come from a hash of Roswaal's own, and the Attributions page credits the place-file formats.",
		affects: ["editor", "docs"],
		changed: [
			"**Patterns from Roswaal's own hash.** The viewport's material patterns, grain and CrackedLava's cracks take their random values from a hash whose constants `scripts/find-hash.mjs` found by search. Each pattern keeps its look; where each speck, stone and crack falls has moved.",
			"**Place files on the Attributions page.** It lists Roblox's place and model files, Zstandard and LZ4, and says how Rojo, rbx-dom and Lune were used to check Roswaal's own reader and writer.",
		],
	},
	{
		version: "0.220.6",
		date: "2026-11-08",
		headline:
			"A wire connected by touch no longer leaves the canvas zooming, and Dynamic mode compiles a moved node only when its Luau changes.",
		affects: ["editor"],
		fixed: [
			"**Touch after connecting a wire.** Once a wire was connected with a finger, every touch on the canvas zoomed it, until the page was reloaded. A finger now pans again as soon as the wire lands.",
			"**Moving a node in Dynamic mode.** A save that leaves the generated Luau as it is, such as moving a node, no longer formats or rewrites the file, so Rojo has nothing to sync. A move that does change the file, such as lifting a function above another, still compiles.",
			"**One compile per save on the website.** In Dynamic mode the website compiled every saved graph twice, and said so each time.",
		],
	},
	{
		version: "0.220.5",
		date: "2026-11-08",
		headline: "The daemon answers every error in its own words, and releases run the tests first.",
		fixed: [
			"**Errors from the daemon are its own.** A request body that is not JSON or is too large, an API path nothing answers, and a page address that will not decode are answered with the daemon's usual error, not a page listing the folders Roswaal is installed in.",
		],
		changed: [
			"**Releases run the tests.** The binaries are built only after the full test suite passes, as the site is.",
		],
	},
	{
		version: "0.220.4",
		date: "2026-11-07",
		headline: "The Privacy Policy says which files the daemon writes through a temporary file.",
		affects: ["docs"],
		fixed: [
			"**Which files are written whole.** Graphs, node maps, the place and roswaal.json go through a temporary file; other files are written directly. It also names the place's backups in .roswaal/backups.",
		],
	},
	{
		version: "0.220.3",
		date: "2026-11-07",
		headline:
			"Programs on macOS and Linux are started by their full path, and the Privacy Policy is verified.",
		affects: ["docs"],
		verified: ["privacy"],
		fixed: [
			"**Programs on macOS and Linux are started by their full path.** The folder picker, Show in file manager, Edit in the code editor and the launcher's Node were looked up by name, so a PATH with `.` or an empty entry in it could start a program of the same name from the project folder.",
		],
		changed: [
			"**Folders in the browser.** Chrome and Edge on a computer open one; other browsers, those built on Chromium among them, keep the project in the browser instead.",
		],
	},
	{
		version: "0.220.2",
		date: "2026-11-07",
		headline:
			"The Privacy Policy says how Roswaal reaches your files on each system, and roswaal.app/attributions works.",
		affects: ["docs"],
		added: [
			"**roswaal.app/attributions** opens the Attributions page, as /terms and /privacy open theirs.",
		],
		changed: [
			"**Your files, in each browser.** What Chrome and Edge can open, what Safari, Firefox and iPad keep instead, and what local storage holds.",
			"**Your files, on each system.** How the daemon writes, and the dialogs, file managers and editors it opens on Windows, macOS and Linux.",
		],
	},
	{
		version: "0.220.1",
		date: "2026-11-07",
		headline: "The Privacy Policy names each permission Sign in with Roblox asks for.",
		affects: ["docs"],
		changed: [
			"**The permissions, by name.** Downloading assets, reading who made one, and identifying your account, each with the scope Roblox shows.",
			"**Read only.** Roswaal never uploads, changes or deletes assets, whatever Roblox calls the permission.",
		],
	},
	{
		version: "0.220.0",
		date: "2026-11-07",
		headline:
			"The place's touch controls fade when left alone, and the camera's speed can be set by hand.",
		added: [
			"**Touch controls fade.** Each stick, and the up and down buttons, fades to a faint outline three seconds after the last touch in its area, and comes back at the next touch, which works as it wakes it.",
			"**A camera speed field.** Beside the stud and rotation snaps, behind Snap where the bar is narrow and at the bar's end on a wide screen. Shift+scroll still sets it, from 0.05× to 50×.",
		],
	},
	{
		version: "0.219.9",
		date: "2026-11-07",
		headline: "The Privacy Policy is verified.",
		affects: ["docs"],
		verified: ["privacy"],
	},
	{
		version: "0.219.8",
		date: "2026-11-07",
		headline: "The Privacy Policy says nothing from Sign in with Roblox is put back online.",
		affects: ["docs"],
		changed: [
			"**Never rebroadcast online.** Nothing downloaded through Sign in with Roblox is put back online by Roswaal, and all of it remains subject to Roblox's applicable terms, linked.",
		],
	},
	{
		version: "0.219.7",
		date: "2026-11-07",
		headline: "The Terms of Service are verified.",
		affects: ["docs"],
		verified: ["terms"],
	},
	{
		version: "0.219.6",
		date: "2026-11-07",
		headline:
			"The Privacy Policy links each address and Roblox policy it names, and lists what the daemon does.",
		affects: ["docs"],
		changed: [
			"**The three sites are links.** roswaal.app, its preview at canary.roswaal.app and its backup at neopolitans.github.io/Roswaal.",
			"**The daemon, point by point.** Only your computer can reach it, it touches only your project, and it goes online only when you ask.",
			"**Every Roblox policy is linked** where either page names it: the Open Cloud API, the Terms of Use, and the Privacy and Cookie Policy for younger users.",
		],
	},
	{
		version: "0.219.5",
		date: "2026-11-07",
		headline:
			"The Terms of Service say the 0BSD licence covers Roswaal's own work, and that Wally packages keep their licences.",
		affects: ["docs"],
		changed: [
			"**The 0BSD licence covers Roswaal's own code and assets.** The third-party parts it includes keep their own licences, listed on the Attributions page.",
			"**Wally packages keep their licences.** You may not sell or train AI on a package from the Wally registry unless its licence allows it.",
		],
	},
	{
		version: "0.219.4",
		date: "2026-11-07",
		headline: "The Terms of Service open with what you may and may not do.",
		affects: ["docs"],
		changed: [
			"**You May and You May Not.** Two short lists at the head of the Terms of Service, before the details they summarise.",
		],
	},
	{
		version: "0.219.3",
		date: "2026-11-07",
		headline:
			"The docs' contents scroll on a phone or tablet, and the policies' dates stand apart.",
		affects: ["docs"],
		fixed: [
			"**The contents scroll on a phone or tablet.** The drawer ran past the bottom of the screen, so its last sections could not be reached.",
		],
		changed: [
			"**Date Effective and Last Edited** sit together in one small panel at the head of each policy, set apart from the text.",
			"**Room below Legal.** The contents leave space under their last section, so it scrolls clear of the edge.",
		],
	},
	{
		version: "0.219.2",
		date: "2026-11-07",
		headline:
			"The Terms of Service and Privacy Policy say when they took effect and were last edited, at short addresses of their own.",
		affects: ["docs"],
		changed: [
			"**Date Effective and Last Edited** head both pages.",
			"**Short addresses.** roswaal.app/terms and roswaal.app/privacy go to the two pages.",
		],
	},
	{
		version: "0.219.1",
		date: "2026-11-07",
		headline:
			"Legal has its own heading in the docs, and both policies name every service Roswaal uses.",
		affects: ["docs"],
		changed: [
			"**A Legal heading.** Attributions, the Privacy Policy and the Terms of Service sit together under it, after the reference.",
			"**Every service, with its own terms.** Both pages list GitHub, Cloudflare, the Wally registry and Roblox, what Roswaal uses each for, and links to each one's terms and privacy policy.",
			"**No repeated breadcrumb.** A page alone in its section no longer shows its title twice above the contents.",
		],
	},
	{
		version: "0.219.0",
		date: "2026-11-07",
		headline: "The docs have a Privacy Policy and Terms of Service.",
		affects: ["docs"],
		added: [
			"**Privacy Policy.** What Roswaal keeps and where: nothing about you, projects and preferences in your browser or your own folders, and the coming Sign in with Roblox kept on your computer and deleted when you sign out.",
			"**Terms of Service.** Roswaal's licence, what is yours, and what belongs to others, including assets downloaded from Roblox.",
		],
	},
	{
		version: "0.218.4",
		date: "2026-11-07",
		headline: "Under WebGL2 too, faces a thousandth of a stud apart no longer fight.",
		fixed: [
			"**Close faces stay in order under WebGL2.** A part a thousandth of a stud above another is drawn cleanly in front of it from across the place, as under WebGPU.",
		],
	},
	{
		version: "0.218.3",
		date: "2026-11-07",
		headline: "Under WebGPU, faces a thousandth of a stud apart no longer fight, however far off.",
		fixed: [
			"**Close faces stay in order.** Under WebGPU, a part a thousandth of a stud above another is drawn cleanly in front of it from across the place, rather than flickering through. WebGL2 is as before.",
		],
	},
	{
		version: "0.218.2",
		date: "2026-11-07",
		headline: "Cylinders are round, closed at both ends and smoothly lit, and balls are smooth.",
		fixed: [
			"**Cylinders have their ends.** Both caps were turned inward and never drawn.",
			"**A cylinder is round whatever its box.** It runs the length of the part's X and is as wide as the narrower of Y and Z, as in Studio, rather than stretched oval. A CylinderMesh still fills its part.",
			"**Cylinders and balls are smoothly lit**, rather than faceted.",
		],
	},
	{
		version: "0.218.1",
		date: "2026-11-07",
		headline:
			"A Neon part is one even shade with its glow round it, and the place's row in DataModel opens and closes.",
		fixed: [
			"**Neon is one even shade.** Its glow is drawn round the part rather than over it, so its faces no longer dim towards their edges and corners.",
			"**The place's row opens and closes.** Its arrow in DataModel shuts and opens the whole tree at once, whatever Workspace was left as.",
		],
	},
	{
		version: "0.218.0",
		date: "2026-11-07",
		headline:
			"A left-drag in the place picks a box of parts, DataModel picks many rows, and Tab takes a suggestion.",
		added: [
			"**Box select in the place.** A left-drag draws a box and picks every part whose centre is inside it, each with its own outline; Shift adds to what is picked, and an empty box clears it.",
			"**Many rows in DataModel.** Ctrl-click (Cmd on a Mac) picks the run from the last row picked, Shift-click adds a row or takes it out, and the rows and the place's view always show the same pick.",
			"**Tab takes a suggestion.** In the code editor, the node menu and picker, the property and value pickers and the docs search, Tab takes the highlighted suggestion as Enter does, and moves focus as before when none is highlighted.",
		],
		watch: [
			"**Orbiting the place is Alt-drag**, as a left-drag now picks a box. Right-drag still looks round, and Shift-right-drag pans for a mouse with no middle button.",
		],
	},
	{
		version: "0.217.2",
		date: "2026-11-07",
		headline: "Neon blooms as far in red as in cyan.",
		fixed: [
			"**Neon's glow is even across colours.** A darker-looking colour, red or blue, glows as far as a light one.",
		],
	},
	{
		version: "0.217.1",
		date: "2026-11-07",
		headline: "Neon's glow blooms evenly, and CrackedLava is rough rock with jagged cracks.",
		fixed: [
			"**Neon's glow keeps its colour.** It fades smoothly from the part, wider than before, with no dark band at its edge and no shift towards purple.",
		],
		changed: [
			"**CrackedLava looks grittier.** Rough rock plates, scorched near jagged cracks of uneven width and finer cracks between, glowing deep red to orange.",
		],
	},
	{
		version: "0.217.0",
		date: "2026-11-07",
		headline: "Forty materials are drawn from textures, and CrackedLava's cracks glow from theirs.",
		added: [
			"**Twenty-nine more material textures.** Every material but SmoothPlastic, Neon, ForceField, Air and Water is now drawn from a texture tinted by the part's Color, from Basalt to Rubber. Plastic has a faint stipple and Glass faint grooves. Salt, Ice and CrackedLava layer ambientCG's maps with Roswaal's own.",
			"**CrackedLava glows from its texture.** Its cracks light from orange to lava-yellow, whatever the part's Color.",
		],
		changed: [
			"**Metal reflects less.** Its highlight is softer and wider, and it shows less of the sky.",
			"**Granite** is drawn from a granite texture rather than a dark marble.",
			"**Textures are 256 pixels on a touch screen**, and 512 elsewhere.",
		],
	},
	{
		version: "0.216.0",
		date: "2026-11-07",
		headline:
			"See-through Glass hides the see-through parts behind it, and Settings has a Scene view page.",
		added: [
			"**Glass hides what is see-through behind it.** As in Studio, a part with Transparency that is behind see-through Glass is not drawn through it; solid parts still are. Settings › Scene view can turn it off.",
			"**Settings › Scene view.** The renderer, the selection outline and Glass, moved from Workspace to a page of their own.",
		],
	},
	{
		version: "0.215.0",
		date: "2026-11-06",
		headline: "Eleven materials are drawn from textures, tinted by the part's Color.",
		added: [
			"**Material textures.** Brick, Cobblestone, Pavement, WoodPlanks, Wood, Concrete, Grass, LeafyGrass, Ground, Marble and Granite are drawn from textures made from ambientCG's (CC0), kept as light and dark and tinted by each part's Color. They load for the materials a place uses; the rest keep their patterns.",
		],
	},
	{
		version: "0.214.1",
		date: "2026-11-06",
		headline:
			"The place's hover outline keeps up with the mouse, and its renderer can be WebGPU by name.",
		changed: [
			"**Renderer.** Automatic, WebGPU or WebGL2, in Settings and on the place's Properties, which also says what is drawing.",
		],
		fixed: [
			"**Hover.** The outline follows the mouse as it moves, rather than waiting for it to stop.",
		],
	},
	{
		version: "0.214.0",
		date: "2026-11-06",
		headline:
			"The place outlines what the mouse is over, and Settings chooses its renderer and outline.",
		added: [
			"**Hover.** Resting the mouse over the place outlines faintly what a click there would pick.",
			"**Place in 3D in Settings.** Renderer, Automatic or WebGL2; how wide the selection outline is; and whether it shows through the parts in front of it. The place's Properties has the renderer too.",
		],
		changed: ["**The selection outline.** On the box's own edges, and wider."],
		fixed: [
			"**The selection outline close up.** An edge that passes behind the camera no longer bends across the view.",
		],
	},
	{
		version: "0.213.0",
		date: "2026-11-06",
		headline: "Each material has a pattern of its own, and Neon glows.",
		added: [
			"**Material patterns.** Wood has a grain, planks their seams, brick its mortar, cobblestone and pebbles their stones, diamond plate its raised diamonds, tiles and pavement their grout, roofs their rows, fabric and carpet a weave, marble its veins, and the rest a speckle or blotches of their own. They are measured in studs on the part, so they turn and scale with it.",
			"**Glow.** Neon lights the air round it, and so do CrackedLava's cracks.",
		],
	},
	{
		version: "0.212.0",
		date: "2026-11-06",
		headline: "The place is drawn in its materials, with Transparency, Reflectance and Neon.",
		added: [
			"**Materials.** Each part is drawn in its material: how strongly and how tightly it catches the sun, a metal's tinted shine, and a fine grain across stone, wood, grass and the rest.",
			"**Transparency.** Parts with a Transparency between 0 and 1 are seen through, blended over what is behind them.",
			"**Reflectance and Glass.** A part with Reflectance shows the sky it faces, and Glass does so of its own, more at a glancing angle.",
			"**Neon and ForceField.** Neon gives its own light, and ForceField glows at its edges.",
		],
		changed: ["**The place's Properties.** Drawn lists how many parts are seen through."],
	},
	{
		version: "0.211.3",
		date: "2026-11-06",
		headline: "The place's Explorer and Properties buttons follow their cards, floating or docked.",
		fixed: [
			"**Explorer and Properties in the place's bar.** Each is lit while its card is on screen, floating or docked, folded or not, and shows or hides it.",
		],
	},
	{
		version: "0.211.2",
		date: "2026-11-06",
		headline: "The place's bar stays centred, and the place is the top row of DataModel.",
		changed: [
			"**The place's bar.** Centred in the window, with the axes and the camera's rotation over its right-hand end, so neither moves as cards show and hide.",
			"**DataModel.** The place is the top row, with the services under it; click it to see the place in 3D. It replaces the button in DataModel's heading.",
			"**The place's Properties.** Drawn as an instance's are, under Drawn and Lighting headings, docked, floating or in a tablet's drawer.",
		],
	},
	{
		version: "0.211.1",
		date: "2026-11-06",
		headline: "The tab in front stays in sight, and the place's toolbar has only what it uses.",
		changed: [
			"**The toolbar with the place in front.** Compiling, New graph and New node map are hidden, and the right-hand button shows and hides Properties.",
			"**Touch sticks.** Further in from the edges of the screen.",
		],
		fixed: [
			"**Tabs.** In a row of tabs too long for the window, the tab in front stays in sight when you go between the place, a Luau file and a graph, and the row stays where you scroll it.",
		],
	},
	{
		version: "0.211.0",
		date: "2026-11-05",
		headline: "What DataModel picks is outlined in the place, and the outline sits on it.",
		changed: [
			"**Properties on a tablet.** A pick in the place shows in Properties without sliding its drawer out; its button brings the drawer out.",
			"**The place's bar.** Less space before Select and after the speed.",
		],
		fixed: [
			"**Picking in DataModel.** A row picked in DataModel is outlined in the place, and picking nothing in the place picks nothing in DataModel.",
			"**The selection outline.** It sits on the part's box rather than a little outside it, and is drawn wider.",
		],
	},
	{
		version: "0.210.0",
		date: "2026-11-05",
		headline: "A long press picks a part in the place, and Clear picks nothing.",
		added: [
			"**Long press for a part.** On a touch screen, a long press on the place picks the part itself, as Alt or Shift and a click do.",
			"**Clear.** On a touch screen the place's bar has Clear, which picks nothing, as Esc does.",
		],
	},
	{
		version: "0.209.0",
		date: "2026-11-05",
		headline: "The place has touch sticks on a tablet, and its snaps are in the bar.",
		added: [
			"**Touch sticks.** On a touch screen the place has two sticks: the left one moves and the right one looks round, and the buttons beside it go up and down.",
			"**Snaps.** The Move and Rotate steps, in studs and degrees, are in the place's bar, or behind Snap on a narrower screen. Dragging the handles keeps to them once editing comes.",
		],
		changed: [
			"**Script analysis with the place in front.** This Script and Project are hidden, so the bar has the bottom of the window to itself.",
		],
	},
	{
		version: "0.208.0",
		date: "2026-11-05",
		headline: "The place opens in 3D, in a tab of its own.",
		added: [
			"**The place in 3D.** Open the place from Files, or with the button at the top of DataModel, and Workspace opens in a tab, lit by the place's Lighting and Atmosphere, with Studio's saved camera drawn where it was. Click to pick a model, Alt or Shift and click for the part, drag to orbit round what is picked, and fly with W, A, S and D. It draws with WebGPU, or WebGL2 where there is none.",
			"**The place's bar.** Along the bottom while the place is in front: Select, Move, Rotate and Scale, Focus and Fit all, and the Explorer and Properties cards. Move, Rotate and Scale show their handles; dragging them, and adding parts, come with editing.",
			"**Mesh in Properties.** A MeshPart's mesh properties are under a Mesh heading, and an asset id links to its page on the Creator Store.",
		],
		changed: [
			"**Panels with the place in front.** DataModel and Properties show; the graph's panels and controls come back with a graph.",
		],
	},
	{
		version: "0.207.0",
		date: "2026-11-05",
		headline:
			"A tab's menu closes the others, those either side, or all, and Make Array says what it holds.",
		added: [
			"**A tab's menu.** Right-click a tab, or long-press it on a touch screen, to close it, the other tabs, the tabs to its left or right, or all of them.",
			"**What Make Array holds.** When its values share a type, its output is a list of that type, such as a list of Model, rather than a plain table. Instances of different classes share the class one of them is, or Instance.",
		],
		changed: [
			"**Lists and tables.** A list of a type can be wired wherever a table is wanted, and into a list of a class it derives from, so a list of Model goes into a list of Instance.",
		],
	},
	{
		version: "0.206.0",
		date: "2026-11-05",
		headline:
			"Make Array writes a list in one node, and Repeat Until runs its body before it tests.",
		added: [
			"**Make Array.** A list in one node, written as a table of values in braces. Each value is a pin, typed in or wired, and + and − set how many. A new table is made each time its line runs. Find it by typing array or list.",
			"**Repeat Until.** Runs its body, then stops once Until holds, so the body always runs at least once. Until can read the locals the body declares. For a loop that goes on while something holds, put a Not before Until.",
			"**Importing lists and repeat loops.** A repeat loop becomes Repeat Until, and a list written on one line with a space inside each brace becomes Make Array.",
		],
		changed: [
			"**The tour's Import slide.** Its repeat loop is a node now, so every statement in the file imports as one.",
		],
	},
	{
		version: "0.205.6",
		date: "2026-11-05",
		headline: "A doc comment's Moonwave text stays as you type it.",
		fixed: [
			"**Typing Moonwave in the Code panel.** What you type is no longer rearranged into the order the comment is written in while you are still typing. It is replaced only when the comment changes somewhere else, such as an undo or the Inspector.",
		],
	},
	{
		version: "0.205.5",
		date: "2026-11-05",
		headline: "A doc comment's larger fields open in a dialog like the editor's others.",
		changed: [
			"**The larger field's dialog.** It has the header band of the editor's other dialogs, with the doc comment's moon, the function's name under the title and a close button, and the keys in its foot.",
			"**Edit docs error.** Type is one line in the code face, and the field being written is outlined in the doc comment's violet.",
		],
	},
	{
		version: "0.205.4",
		date: "2026-11-05",
		headline: "A doc comment's error is edited whole in one dialog.",
		changed: [
			"**Edit docs error.** One button under an error's Type and Message opens both in a larger dialog. Enter moves to Message, then finishes. On an iPad, tapping either field opens it there.",
			"**Remove error.** It sits at the right of that row, with a dashed outline that fills when you point at it.",
		],
	},
	{
		version: "0.205.3",
		date: "2026-11-05",
		headline: "A doc comment's errors are a Type row, a Message row and a Remove error button.",
		changed: [
			"**Errors in a doc comment.** Each has a Type row and a Message row, both with the larger field, and a red Remove error button under them.",
			"**The Errors count.** An error with no Type is counted as still to describe.",
		],
	},
	{
		version: "0.205.2",
		date: "2026-11-05",
		headline: "C with nothing selected puts the comment at the pointer.",
		fixed: [
			"**C with nothing selected.** The comment's top-left corner is at the pointer, as a paste is. With the pointer off the canvas it still goes near the top-left of the view.",
		],
	},
	{
		version: "0.205.1",
		date: "2026-11-05",
		headline:
			"A doc comment opens as Moonwave in the Code panel, and long words get room to be written.",
		changed: [
			"**Edit as Moonwave text.** The Inspector's Text view is now a button that opens the comment in the Code panel, highlighted and completing Moonwave's tags. What you type is read back into the fields.",
			"**Long words.** Each parameter, return and error has a button that opens a larger field in the middle of the screen. On an iPad, tapping the field opens it, above the keyboard.",
			"**Types.** Parameters, returns and fields show their type as a coloured tag, on the canvas and in the Inspector.",
			"**The moon.** It is larger in the canvas menu and the node picker.",
			"**Errors.** Each error has its own row for what is thrown, and a line below for when.",
		],
		fixed: [
			"**The node picker.** Comment and Doc comment are at the top of its list.",
			"**Previewing a doc comment.** With the box selected, P lights the Moonwave it writes.",
			"**Long lines in the preview.** The band behind lit lines reaches past the longest one.",
			"**Half-filled tags.** Script analysis says when Since, Deprecated, an error or a tag is missing its version or name, and so left out of the comment, and when Moonwave has no class to file the comment under.",
		],
	},
	{
		version: "0.205.0",
		date: "2026-11-05",
		headline: "Doc comments write Moonwave for the declaration they are drawn around.",
		added: [
			"**Doc comments.** Right-click the canvas and choose Doc comment, or type doc or moonwave there. Drawn around a Declare Function, Module Exports or Declare Type, it writes a Moonwave comment above it in the generated Luau.",
			"**On the canvas.** The box lists the function's parameters and returns; click one to write what it is for.",
			"**In the Inspector.** Parameters, Returns and Errors fold to a count, Used on switches Server, Client and Plugin, and Add holds Since, Deprecated, Yields and the rest. Text shows the comment as Moonwave and reads what you type back into the fields.",
			"**Moonwave's rules.** Parameters, returns and their types come from the function, @within is filled in from the module, and Script analysis says when a doc comment documents nothing or more than one thing.",
		],
		changed: [
			"**Doc comments are always written.** The Comments setting turns off ordinary comments only.",
		],
	},
	{
		version: "0.204.1",
		date: "2026-11-05",
		headline: "On a computer, the tour's Import slide shows its whole graph.",
		fixed: [
			"**The Import slide's graph.** On a computer it is tall enough for each mode's graph, so its top row is no longer cut off. It still scrolls sideways.",
		],
	},
	{
		version: "0.204.0",
		date: "2026-11-05",
		headline: "The front page is quieter, its tour comes first, and its cards are the editor's.",
		added: [
			"**Hover in the tour's Import slide.** Resting the pointer on a line of the file or of what it writes shows the nodes it became, as a click does.",
		],
		changed: [
			"**The banner.** The mark rests on the name, the graph is drawn at the editor's size on the grid, and the line under the name goes.",
			"**The promise.** That it is free, forever, is said in two sentences.",
			"**The tour first.** It follows the promise; See what it writes is gone.",
			"**The cards.** Each has the editor's card header, its colour on a tile, and one footer with the version it arrived in and where to go next. Inside the editor is in two rows, Writing a graph and Around it.",
			"**Quieter.** Versions are grey numbers, Why it holds up is three columns, Lately is one card, and cards have no shadows.",
			"**The tour on a tablet or a phone.** The tabs are one row of named stops that scrolls, and back and next are two halves of one bar. The progress bar is gone.",
			"**The tour on a computer.** Slides are taller, and the preview's graph is drawn larger.",
		],
	},
	{
		version: "0.203.5",
		date: "2026-11-04",
		headline:
			"On an iPad, a panel's button puts its drawer away, and Check is the size of its line.",
		fixed: [
			"**A drawer's own button.** Pressing Project or Inspector in the top bar while its drawer is out puts the drawer away. It used to close and open again.",
			"**Check on a touch screen.** It is as tall as the summary line it ends.",
			"**A clean project's summary.** Project says No problems in 1 graph, not in 0 graphs of 1.",
		],
	},
	{
		version: "0.203.4",
		date: "2026-11-04",
		headline: "Script analysis has a card header like every other card.",
		changed: [
			"**Script analysis's header.** This Script and Project are the card's tabs, each with its count, followed by the status, the fold and the card's menu. The menu moves or docks the card.",
			"**Check on the summary line.** In Project, Check ends the line under the header.",
		],
	},
	{
		version: "0.203.3",
		date: "2026-11-04",
		headline: "The Attributions page credits the Rojo Developers for Rojo and rbx-dom.",
		changed: [
			"**The Rojo Developers on the Attributions page.** Rojo is credited to them, and rbx-dom is listed under Works with, as the reader Roswaal's place files were checked against.",
		],
	},
	{
		version: "0.203.2",
		security: true,
		date: "2026-11-04",
		headline: "StyLua, Node, Explorer and PowerShell are started by their full paths.",
		fixed: [
			"**Programs by their full paths.** StyLua and Node are found in PATH's absolute folders outside the project, and Explorer and Windows PowerShell in the Windows folder. Advisory: [GHSA-2c7q-r3r3-267v](https://github.com/neopolitans/Roswaal/security/advisories/GHSA-2c7q-r3r3-267v).",
		],
	},
	{
		version: "0.203.1",
		date: "2026-10-20",
		headline: "The documentation site carries the hidden theme's face.",
		affects: ["docs"],
		fixed: [
			"**The face on the documentation site.** A reader who chose the hidden theme in the editor sees the docs in its own face, which the site now carries beside its stylesheet, where it fell back to a system one.",
		],
	},
	{
		version: "0.203.0",
		date: "2026-10-20",
		headline: "The hidden theme moves a panel by its outline.",
		affects: ["editor"],
		added: [
			"**Moving by outline.** In the hidden theme, a panel being dragged stays where it is while its outline follows the pointer, drawn in the colours under it swapped, and goes where the outline is when let go.",
		],
	},
	{
		version: "0.202.2",
		date: "2026-10-20",
		headline:
			"A node's header rule runs its full width, and the hidden theme draws pins as sprites.",
		affects: ["editor"],
		fixed: [
			"**A node's header rule.** The line under a node's header runs under its category tab too, in every theme, where it stopped at the tab's edge.",
			"**Pins in the hidden theme.** Each pin is drawn on a grid of its own pixels, solid when wired and an outline when not, and lines and glyphs are drawn with stepped edges.",
		],
	},
	{
		version: "0.202.1",
		date: "2026-10-20",
		headline: "The hidden theme's buttons show on the panel in use.",
		affects: ["editor"],
		fixed: [
			"**Buttons in a panel's title bar.** In the hidden theme, the fold and menu buttons on the panel in use are drawn in its blue on the white bar, where they were blank blue squares.",
		],
	},
	{
		version: "0.202.0",
		date: "2026-10-20",
		headline: "Settings › Themes keeps one scheme hidden, for whoever looks closely.",
		affects: ["editor"],
		added: [
			"**A hidden theme.** Settings › Themes has one more scheme than it lists, with its own face, edges and windows as well as its colours. Once found it stays in the list, in that browser.",
			"**VT323 under Licences.** The pixel face that scheme is drawn in is carried unchanged under the SIL Open Font License, and listed in Settings › Licences.",
		],
	},
	{
		version: "0.201.1",
		date: "2026-10-20",
		headline: "On a tablet, a drag inside the Project panel drops there.",
		affects: ["editor"],
		fixed: [
			"**Dragging within a drawer.** On a tablet, the Project panel stays out while an instance is dragged onto another or a file into a folder, and goes once the drag leaves it for the graph, where it went as the drag began.",
		],
	},
	{
		version: "0.201.0",
		date: "2026-10-20",
		headline: "The DataModel adds, deletes, moves and duplicates instances.",
		affects: ["editor", "docs"],
		added: [
			"**Add Child.** An instance's menu in DataModel, from a right-click or the ⋯ on the picked row, adds a child of a class you pick, named after it and holding the values Studio gives a fresh one.",
			"**Duplicate and Delete.** Duplicate puts a copy beside the instance, with new ids and references inside the copy pointing into it. Delete takes it out with everything in it, after asking; what pointed at it points at nothing, and a script a project file writes is unlinked while the file stays.",
			"**Moving by dragging.** An instance dragged onto another moves there, and the project's links to scripts in it follow.",
			"**Studio's rules.** Services stay where they are, classes Studio will not make in a place are not offered, and a class that needs a particular parent, such as a WrapLayer in a MeshPart, is only offered there. Each change is written into the .rbxl or .rbxlx as Studio would save it.",
		],
	},
	{
		version: "0.200.1",
		date: "2026-10-20",
		headline: "A place converted between .rbxl and .rbxlx keeps every value Studio saved.",
		affects: ["editor"],
		fixed: [
			"**Identities kept across formats.** A place converted between .rbxl and .rbxlx keeps the UniqueId Studio gave each instance, where each one came out different.",
			"**Handles, rays, regions and unions.** A handle's faces and axes, a RayValue, a TerrainRegion's corners and a union's mesh are read and written in both formats, where a conversion left them out.",
			"**Scripts in a .rbxlx.** A script's Source is written as Studio writes it in XML.",
		],
	},
	{
		version: "0.200.0",
		date: "2026-10-19",
		headline: "Properties renames instances.",
		affects: ["editor", "docs"],
		added: [
			"**Names in Properties.** An instance's name is changed as any text is, on anything but a service, under Studio's rules for a name. The DataModel tree stays open and follows it to where its new name sorts it, and the project's links to scripts under it move with it.",
		],
	},
	{
		version: "0.199.0",
		date: "2026-10-19",
		headline:
			"Properties changes attributes and tags, and a Legacy place saved as .rbxl opens in Studio.",
		affects: ["editor", "docs"],
		added: [
			"**Attributes in Properties.** An attribute's value is changed as a property's is; Add on the Attributes heading adds one as text, a number, true or false, a Vector3 or a Color3, and the × beside one removes it. Roblox's own RBX attributes are shown and left as they are.",
			"**Tags in Properties.** Add on the Tags heading adds a tag, and the × on one removes it, kept in the place as Studio keeps tags.",
			"**Attributes and tags in a new place.** A new project's place keeps an empty list of each for every instance, as Studio's does; a place without them gets them the first time one is added.",
		],
		fixed: [
			"**A Legacy place saved as .rbxl.** Studio opens it: a hidden asset link, a BrickColor written as a number and a script's Source are kept as Studio's binary keeps them, where Studio refused the place.",
		],
	},
	{
		version: "0.198.0",
		date: "2026-10-19",
		headline: "Properties changes references.",
		affects: ["editor", "docs"],
		added: [
			"**References in Properties.** A reference such as a Model's PrimaryPart or an ObjectValue's Value is picked from the place's instances of the class it takes, or set to none, and written into the place in .rbxl and .rbxlx. The arrow beside it still goes to what it points at.",
		],
	},
	{
		version: "0.197.0",
		date: "2026-10-19",
		headline:
			"An Instance node is cast to the class the place holds, and a split getter shows every part.",
		affects: ["editor", "docs"],
		added: [
			"**Instance nodes typed from the place.** An Instance node dropped from Properties, or one whose path you type and the place holds, is cast to that instance's class. Its output is a Part rather than any Instance, so Get Member, Set Property and the read-only marks know what it is.",
		],
		fixed: [
			"**The lock on Get Member.** A Get Member reading a read-only property shows a lock beside its type.",
			"**A split getter shows every part.** A Get Member or a getter with its result split is drawn with a row for each part, and named for the member it reads, where it showed one pin.",
			"**A second new project in the browser.** New project opened over a notice started with no name and refused to make the project; it opens with its defaults again.",
			"**A statement opening with a bracket.** The first one below the services no longer runs into the GetService line above it, which Luau read as one call.",
		],
	},
	{
		version: "0.196.0",
		date: "2026-10-19",
		headline:
			"Read-only properties are marked, Set Property offers what a script can set, and a project with no place can add one from the tree.",
		affects: ["editor", "docs"],
		added: [
			"**Read-only properties.** A property a script can read but not set has a lock in the node menu and the node picker. Set Property's Property field lists the wired instance's settable properties as you type, names the read-only ones it leaves out, and marks a read-only one already in the field. Script analysis warns about one, and dropping one from Properties with Ctrl held places a Get Member.",
			"**Add Place in the tree.** A Roblox project with no place has Add Place on the Compile Content heading: import a .rbxl or .rbxlx, or start from a baseplate.",
		],
		fixed: [
			"**Nodes as wide as their pins.** A node grows to fit its longest input name and value beside its widest output, where a name such as className was cut short.",
		],
	},
	{
		version: "0.195.2",
		date: "2026-10-19",
		headline: "Long names fit the node menu.",
		affects: ["editor"],
		fixed: [
			"**Long names in the node menu.** The menu is wider, a name still too long for it ends in an ellipsis, and its tags stay on one line beside it, where a long member pushed them onto two lines and past the menu's edge. The node picker's list does the same.",
		],
	},
	{
		version: "0.195.1",
		date: "2026-10-19",
		headline:
			"Values line up on a node, text fields keep the caret in view, and a wire offers the functions that take it.",
		affects: ["editor"],
		fixed: [
			"**Values in one column.** A node's typed-in values line up down the node when the output beside one of them shows its type, as Concatenate's does.",
			"**Text fields keep the caret in view.** Text typed past a field's width stays scrolled to the caret, where the field went back to the start a moment later.",
			"**Functions off a wire.** A wire dragged off a value offers the graph's functions that take it, as Call and Call for value.",
			"**The node menu at the drop.** A search that narrows the node menu brings it back beside where the wire was dropped or the canvas was right-clicked.",
		],
	},
	{
		version: "0.195.0",
		date: "2026-10-19",
		headline:
			"A project can add a place, places and models show in the tree, and a new graph says how to create nodes.",
		affects: ["editor", "docs"],
		added: [
			"**Add a place.** A Roblox project with no place gets one from the Project menu: the baseplate a new project starts with. A place file in the tree opens in DataModel, or can be made the project's place.",
			"**A start hint on a new graph.** A graph with only its Script Start or Module Exports shows how to create nodes at the top of the canvas: right-click, or press and hold on a touch screen.",
		],
		fixed: [
			"**Places and models in the tree.** Compile Content lists .rbxl, .rbxlx, .rbxm and .rbxmx files, and leaves out the backups Properties keeps.",
			"**Graph folders for synced folders.** Opening a project with a node map, or importing one from Rojo, makes the matching folders under .roswaal/scripts.",
			"**The DataModel filter's spacing.** The filter has room above it and lines up with the rows below it.",
			"**Export in the docs.** The Interface, Getting started and Places and Rojo projects pages show the Export button beside Settings, and the editor drawings show the whole Script analysis card, with no scrollbar.",
		],
	},
	{
		version: "0.194.0",
		date: "2026-10-19",
		headline:
			"Fonts, physics, gradients, sequences and Content are read and written, and a code view stops above Script analysis.",
		affects: ["editor"],
		added: [
			"**Every kind of property a place keeps.** Fonts, custom physics, ColorSequences and NumberSequences, Capabilities and the newer Content type are read from a place and written back, in .rbxl and .rbxlx. Properties shows them, and a place saved as Legacy .rbxlx or back keeps them; only a Terrain property of a type Roswaal does not know yet is left out.",
		],
		fixed: [
			"**A code view clear of Script analysis.** A Luau file, a node map and the aliases end above the card at the foot, folded or open, where the view ran under it and off the bottom of the window.",
		],
	},
	{
		version: "0.193.0",
		date: "2026-10-19",
		headline: "Properties changes vectors, sizes, UDim2s and CFrames.",
		affects: ["editor", "docs"],
		added: [
			"**Vectors, sizes and UDims.** Vector3, Vector2, UDim, UDim2, NumberRange and Rect values change a field a component, named as Studio names them: X, Y, Z; Scale and Offset.",
			"**CFrames as Position and Orientation.** In degrees, turned about Y, then X, then Z as Studio turns them. Changing only the position keeps the rotation exactly.",
		],
	},
	{
		version: "0.192.1",
		date: "2026-10-19",
		headline:
			"A file dragged out of the project tree drops on Modules and on the canvas, and one tab has no blank after it.",
		affects: ["editor"],
		fixed: [
			"**Dragging out of the project tree.** A graph or a Luau file dropped on the Modules heading or on the canvas is taken, where the browser showed a red circle and refused it. Moving files between folders works as before.",
			"**One tab.** The tab row ends at its only tab, without the blank where the list button sits once there are two.",
		],
	},
	{
		version: "0.192.0",
		date: "2026-10-19",
		headline: "Export is a button in the top bar, and saves the place as .rbxl or Legacy .rbxlx.",
		affects: ["editor", "docs"],
		added: [
			"**Export in the top bar.** Beside Settings, and left of More on an iPad. `Ctrl` + `Shift` + `E` opens it, and Project → Export… is still there. The menu drops from its button, and on a touch screen it is the same menu, finger-sized.",
			"**Save as .rbxl or Legacy .rbxlx.** For a zip or the place alone. A place saved in the other format leaves out the kinds of property Roswaal cannot write yet, and the menu names them first.",
			"**Compile first.** When a graph has changed since it was compiled, the menu names it and compiles it before the export, so the export does not carry its old Luau.",
			"**Choices kept for the project.** Start with these choices for this project keeps them in `roswaal.json`, and Settings → Compiling → Exporting shows them.",
		],
		changed: [
			"**Shared strings written.** A place written from nothing carries its shared strings, keyed as Studio keys them, so a place with meshes converts.",
		],
		fixed: [
			"**No backups in an export.** The copies Properties keeps in `.roswaal/backups` are left out of a zip.",
		],
	},
	{
		version: "0.191.1",
		date: "2026-10-19",
		headline: "Asset links read and write as Studio keeps them in an .rbxlx place.",
		affects: ["editor"],
		fixed: [
			"**Asset links in an .rbxlx place.** Textures, decals and skyboxes are written in the form Studio reads, where the place as .rbxlx opened without its grid, spawn pad or sky. An .rbxlx place's asset links are now read too, so Properties shows them and changes them.",
		],
	},
	{
		version: "0.191.0",
		date: "2026-10-19",
		headline: "A new project's place is the one Studio starts a new experience with.",
		affects: ["editor", "docs"],
		changed: [
			"**Studio's starting place.** A new Roblox project's place is now `place.rbxl`, with a 2048-stud baseplate and its grid, the spawn pad, and Studio's sky, lighting, effects, chat and player settings. It was a plain 512-stud baseplate in `place.rbxlx`. Projects made before keep the place they have.",
		],
	},
	{
		version: "0.190.0",
		date: "2026-10-19",
		headline: "Properties can change values in the place file, behind a setting.",
		affects: ["editor", "docs"],
		added: [
			"**Modify DataModel Instances.** With it on in Settings → Workspace, Properties changes true or false, number, text, enum, colour and BrickColor values on any property a script can set. Each change is written into the place file, and the first asks. A copy of the file as it was goes in `.roswaal/backups` first.",
			"**Studio's lock noticed.** While Studio has the place open, Properties says that Studio's next save puts back the values it has.",
		],
	},
	{
		version: "0.189.1",
		date: "2026-10-16",
		headline: "A compile or Check straight after an edit reads the graph as it is on screen.",
		affects: ["editor"],
		fixed: [
			"**Compiling what you see.** Compile script, Compile project and Check save every edit first, where a compile asked for straight after one read the file from before it, and Script analysis showed the old result until the next compile.",
		],
	},
	{
		version: "0.189.0",
		date: "2026-10-16",
		headline: "Script analysis shows This Script and Project, each with its count.",
		affects: ["editor", "docs"],
		added: [
			"**This Script and Project.** Script analysis has two scopes, each with its count in the bar: the open graph, and every graph in the project with the project's own files, such as stale output, folders no map syncs, packs and StyLua. A problem in another graph opens it at the node.",
			"**Check.** Under Project, Check reads every graph without writing anything. A project compile refreshes the list as well, and a graph saved since is marked as older.",
		],
		changed: [
			"**A fold button.** The bar folds with the button at its end rather than with any click on it. On a touch screen each of its controls is a finger wide, and on a phone the two scopes fill the bar.",
			"**A check without StyLua.** A compile that writes nothing no longer runs StyLua over every graph.",
			"**The compile card on a touch screen.** It sits under the top row, clear of the bar along the bottom.",
		],
	},
	{
		version: "0.188.7",
		date: "2026-10-16",
		headline:
			"On an iPad and an iPhone, the editor stays in place after the keyboard in every case.",
		affects: ["editor"],
		fixed: [
			"**The window back in place.** Any shift of the editor's window while the keyboard is down is put back at once, where 0.188.5 caught only the keyboard closing and the screen turning.",
		],
	},
	{
		version: "0.188.6",
		date: "2026-10-16",
		headline:
			"The Code panel keeps its tab's name on a touch screen, and wires across a comment draw whole on an iPad.",
		affects: ["editor"],
		changed: [
			"**Go to node and Full view as their glyphs.** On a touch screen the two are icon buttons, so the tab keeps its name; the words stay as their names. Go to node has a glyph of its own.",
		],
		fixed: [
			"**Wires across a comment.** On an iPad a wire could stop part-way across a comment box and pick up again at its edge. The wires' layer is now sized to hold them.",
		],
	},
	{
		version: "0.188.5",
		date: "2026-10-16",
		headline:
			"On an iPad and an iPhone, the Code panel and the keyboard leave the editor where it was.",
		affects: ["editor"],
		fixed: [
			"**The Code panel above Script analysis.** On a touch screen the Code panel stands a row above the Script analysis card, which no longer lies over the code being typed.",
			"**The page back after the keyboard.** Once the on-screen keyboard closes, or the screen turns, the editor is put back where it was, where it had stayed shifted up with its controls off the screen until every code tab was closed.",
		],
	},
	{
		version: "0.188.4",
		date: "2026-10-16",
		headline: "On an iPad, Script analysis and the action row no longer overlap.",
		affects: ["editor", "docs"],
		fixed: [
			"**Script analysis above the action row.** On a touch screen the card sits above the row along the bottom while the row is showing, so neither covers the other, folded or open, either way up.",
			"**The action row on an iPad.** It holds the selection's actions alone again; the buttons for the side cards are on the top row.",
		],
	},
	{
		version: "0.188.3",
		date: "2026-10-16",
		headline: "The tablet and phone pictures in the docs match the editor.",
		affects: ["docs"],
		fixed: [
			"**Tablet pictures.** Script analysis sits beside the side strip and the action row is centred on the screen, in The interface and Getting started.",
			"**No Open folder on an iPad.** Getting started's tablet steps leave it out of the Project menu, as Safari has no folder picker.",
			"**The documentation's header, as it is.** Drawn as floating clusters with search before Contents on a computer, a tablet and a phone, and on a phone in one row with Try it and no Source.",
		],
	},
	{
		version: "0.188.2",
		date: "2026-10-16",
		headline: "A second Rojo project file's map is named after the file.",
		affects: ["editor"],
		fixed: [
			"**A second project file is told apart.** Its map is named after the file, such as Game serve beside Game, rather than Game 2. The offer to import one says which project files already have a map.",
		],
	},
	{
		version: "0.188.1",
		date: "2026-10-16",
		headline: "Browse… on Windows opens Explorer's folder picker.",
		affects: ["editor"],
		changed: [
			"**Explorer's folder picker.** Browse… and the other folder choices on Windows open the picker Explorer uses, in place of the older tree of folders, which stays as the fallback.",
			"**A dialog already open is said.** Asking for a folder while the dialog is still open says so, as it may be behind another window.",
		],
		fixed: [
			"**Folder names in any script.** A folder chosen on Windows whose name is not in English letters comes back as it is.",
		],
	},
	{
		version: "0.188.0",
		date: "2026-10-16",
		headline: "Import Rojo project can read the project's Luau into graphs as well.",
		affects: ["editor", "docs"],
		added: [
			"**Project File Only, or + Luau as Graphs.** Import Rojo project asks which: the project file as a node map, with the Luau left hand-written, or the map and then every hand-written Luau file in the folders it syncs, as graphs with one set of settings and one summary. A project file a map already writes can still have its Luau imported.",
		],
		changed: [
			"**Browse… offers it too.** Opening a folder with Browse… offers a Rojo project file no map writes, as Open folder and Open .zip already did.",
		],
	},
	{
		version: "0.187.0",
		date: "2026-10-15",
		headline: "A compile says when StyLua did not format a file.",
		affects: ["editor", "docs"],
		added: [
			"**StyLua's refusals are shown.** A file StyLua refuses is still written, unformatted, and what StyLua said is listed in Problems, raised as a notice, and printed by `roswaal compile` and `roswaal watch` — once per reason, not once per file. In Dynamic mode the notice comes when the reason first appears or changes.",
		],
	},
	{
		version: "0.186.8",
		security: true,
		date: "2026-10-15",
		headline: "The release workflow builds without the right to write to the repository.",
		fixed: [
			"**Builds read; one job attaches.** The macOS and Windows binaries are built by jobs that can only read the repository, and handed to a separate job that attaches them to the release.",
		],
	},
	{
		version: "0.186.7",
		security: true,
		date: "2026-10-15",
		headline:
			"Long chains are reported instead of failing, import keeps pace with long files, and any name gets a colour.",
		affects: ["editor"],
		fixed: [
			"**Long chains, read.** A chain of calls, fields or operators longer than 500 is reported as nested too deeply, and a graph nested past 200 is one error at the node where it does, rather than a compile, hover or import that fails.",
			"**Import in step with the file.** Import as graph no longer slows down sharply on long files, and takes a file of up to 2 MiB.",
			"**Any name, a colour.** A pack category or pin type named `constructor` or `toString` is drawn in the colour any unknown name gets.",
		],
	},
	{
		version: "0.186.6",
		security: true,
		date: "2026-10-15",
		headline: "The specification's pages carry the site's security policy.",
		affects: ["docs"],
		fixed: [
			"**The specification's pages carry the site's security policy.** Every page at spec.roswaal.app, archived drafts included, now runs under the same Content-Security-Policy as roswaal.app.",
			"**Dependencies updated.** Four packages move up a patch version each.",
		],
	},
	{
		version: "0.186.5",
		security: true,
		date: "2026-10-15",
		headline:
			"The daemon answers its API only as written, and Import as graph keeps a graph it cannot read.",
		affects: ["editor"],
		fixed: [
			"**API paths as written.** The daemon answers its API only at paths spelled in lower case, as the editor sends them, and checks where a request came from however its path is spelled.",
			"**Import as graph keeps a graph it cannot read.** A graph file at the import's path that does not read as a graph, such as one from a newer Roswaal, is no longer replaced; the import says so and leaves it as it was.",
		],
	},
	{
		version: "0.186.4",
		security: true,
		date: "2026-10-15",
		headline:
			"Values, comments, casts and names in a graph are checked before they are written as Luau.",
		affects: ["editor"],
		fixed: [
			"**Comments and values are written as what they are.** A doc comment whose text holds `]=]` is written at a level that keeps all of it a comment, and a typed-in value saved as a number or a true/false that is not one is reported on its pin.",
			"**Casts, field types and module function names are checked before they are written.** A call's result cast and each Declare Type field type must be one Luau type, and a module's function must be called by a name; anything else is reported on the node.",
		],
	},
	{
		version: "0.186.3",
		date: "2026-10-15",
		headline: "The packaged app answers the demos question instead of failing it.",
		affects: ["editor"],
		fixed: [
			"**No demos, not an error.** The macOS and Windows downloads have no demo projects beside them, and asking for the list failed with an error the editor quietly ignored. It now answers that there are none, and taking a demo says this copy has none to give.",
		],
	},
	{
		version: "0.186.2",
		date: "2026-10-15",
		headline: "A value no longer offers its datatype's constants.",
		affects: ["editor"],
		fixed: [
			"**Constants after a name only.** A dot after a Vector3 or a CFrame value no longer offers zero, one, xAxis or identity; Vector3. and CFrame. still do.",
		],
	},
	{
		version: "0.186.1",
		date: "2026-10-15",
		headline: "The code editor offers the members of what a call gives back.",
		affects: ["editor"],
		fixed: [
			"**Members after a call.** A dot or colon after a call or a bracket, as in hull.CFrame:PointToObjectSpace(p).X, offers the members of what the call gives back when its type is known. It offered only globals.",
		],
	},
	{
		version: "0.186.0",
		date: "2026-10-15",
		headline: "Code is checked for arguments of the wrong type, and an import knows more types.",
		affects: ["editor", "docs"],
		added: [
			"**Argument types are checked.** A method called on something whose type is known, given a value of a type it does not take, is underlined in the code editor and in a file opened to read, and listed in Problems against the node.",
			"**Imports type more values.** A handler's parameters take the event's types, a property its class's type, and Instance.new and FindFirstChildOfClass the class they name, so more method calls become nodes.",
			'**A service named otherwise is declared.** local RS = game:GetService("ReplicatedStorage") becomes a declared service that keeps the name RS, shown as RS in Services.',
		],
		changed: [
			"**A method given an argument its pin does not take stays as code.** The check then says why.",
		],
		fixed: [
			"**A window left off a smaller screen comes back.** A floating panel placed outside the window, such as the Code panel, moves back inside it.",
			"**Hover in a Luau Expression.** It describes members read off a property, such as PointToObjectSpace in hull.CFrame:PointToObjectSpace, and reads a value written as an if expression.",
		],
	},
	{
		version: "0.185.1",
		date: "2026-10-15",
		headline: "Compiling a graph over a file Roswaal did not write shows what changes first.",
		affects: ["editor"],
		changed: [
			"**Compile shows what changes.** Compiling a graph whose file Roswaal did not write, or one edited by hand, opens the changes line by line and asks before overwriting. It was a Not written notice, with Overwrite in the status panel. A compile on save still leaves the file and says so.",
		],
	},
	{
		version: "0.185.0",
		date: "2026-10-15",
		headline: "An import makes nodes of method calls on objects whose type it knows.",
		affects: ["editor", "docs"],
		added: [
			'**Method calls as nodes.** part:Destroy(), remote:FireAllClients(1), folder:WaitForChild("Shared") and the like import as their own nodes when the importer knows what they are called on: a service, a name with a type written beside it, workspace, or the result of another node.',
			"**Service methods as Service Functions.** A call on a service that the engine catalogue lists, such as RunService:IsServer(), imports as a Service Function. An enum argument written as Enum.KeyCode.W is set by its member's name.",
			"**workspace as an Instance node.** A bare workspace imports as the Instance node set to workspace.",
		],
		changed: [
			"**A method on anything else stays Call Method.** A table may have a method of any name, so an object of unknown type keeps the generic node.",
		],
		fixed: [
			'**No extra brackets round a call made on a bracketed value.** A chain such as (script.Parent :: Instance):WaitForChild("A"):GetChildren() compiles as written.',
			"**No added cast in an imported graph.** Find First Child Of Class and the other class reads no longer add a cast the file did not have.",
		],
	},
	{
		version: "0.184.0",
		date: "2026-10-15",
		headline: "An imported file's GetService lines become the graph's services.",
		affects: ["editor", "docs"],
		added: [
			'**Services from GetService.** On import, each line such as local Players = game:GetService("Players") at the top of the file becomes one of the graph\'s services. Reads of it are Get Service nodes, and a handler connected to one of its events reads it through Get Event.',
			"**A box for their comments.** Comments on those lines go in a box of their own above Script Start, and compile back above the services.",
			"**The import report counts them.** Services declared: N.",
		],
		changed: [
			"**Service lines are written first.** The compiler writes declared services at the top of the file, so one the file had further down moves up.",
		],
	},
	{
		version: "0.183.0",
		date: "2026-10-15",
		headline:
			"Realign moves into a Refactor panel, with Split into rows and two ways to wire Gets.",
		affects: ["editor", "docs"],
		added: [
			"**The Refactor panel.** The toolbar's Refactor button opens it at the top of the graph; drag it into the right dock to keep it under the Inspector. It holds Realign and three changes that leave the compiled Luau as it was.",
			"**Split into rows.** Puts a Sequence after the graph's start and cuts its chain into rows by width, as an import does.",
			"**A Get per reader and Share Gets.** The first gives each node that reads a Get its own copy; the second makes Gets of the same thing one. With several nodes selected, they act on those alone.",
			"**Realign after each change.** On to start: a change lays out what it touched.",
		],
		changed: [
			"**The toolbar's Realign button is now Refactor.** Ctrl+Shift+L still realigns, and Realign stays in the phone's More menu.",
		],
	},
	{
		version: "0.182.0",
		date: "2026-10-15",
		headline:
			"Realign lays a graph out along its flow, a node can be pinned, and a comment can keep its nodes as placed.",
		affects: ["editor", "docs"],
		added: [
			"**Pin a node.** Right-click a node and choose Pin: Realign leaves it where it is and lays the rest out round it. A pinned node has a dashed teal ring and a pin in its corner.",
			"**Preserve nodes on Realign.** Tick it in a comment's Inspector, and Realign moves the comment and what it holds as one block, with what it holds as you placed it.",
		],
		changed: [
			"**Realign lays the graph out along its flow, as an import does.** Each run of steps sits along a row, its values under the step before, and the graph's start stays where it was. With several nodes selected, only those move. A comment box is fitted back round what it holds. It replaces the column layout.",
			"**Right-clicking a node opens its menu.** Pin, any promotions, and Add Node Here, which opens the palette.",
			"**Straighten is gone.** The setting, its toolbar button and Node Design's button: the new layout lines each row up along its wire.",
		],
	},
	{
		version: "0.181.0",
		date: "2026-10-15",
		headline: "Statements an import keeps as code one after another share a Code Block.",
		affects: ["editor"],
		added: [
			"**One Code Block for a run of code.** In Tidy and Modern, statements kept as code one after another go in one Code Block, up to the six lines its face shows; a longer run starts another. A blank line between them stays, and a statement with a comment starts a block of its own.",
			"**A setting in the import dialog.** Keep code that runs on in one Code Block is on to start; turn it off for a block each. Verbatim and Node-Prioritized always keep a block each, and Reimport starts from what the graph was given.",
		],
	},
	{
		version: "0.180.1",
		date: "2026-10-15",
		headline:
			"The tour's hover slide stays open on a tap, and its menu slide opens a folder's menu.",
		affects: ["docs"],
		fixed: [
			"**A tapped name on the tour's hover slide stays open.** On a touch screen it closed as soon as the finger lifted, and tapping a second name or the card closed it. A tap elsewhere closes it.",
			"**The tour's menu slide opens a folder's menu.** A folder of graphs offers New graph and New map; a folder of Luau you wrote offers Import folder as graphs.",
		],
	},
	{
		version: "0.180.0",
		date: "2026-10-15",
		headline: "Imported graphs tuck values under the step before and cut their rows by width.",
		affects: ["editor"],
		changed: [
			"**Values sit under the step before the one that reads them.** The steps of a row close up to one gap apart, and each value's wire runs up into its reader. The first step on a row, and a step a comment box holds, keep their values to their left.",
			"**Rows are cut by width, not by count.** Tidy, Modern and Node-Prioritized fill each row on the Sequence up to 2,400 px, cut at a blank line where one falls in the second half. A Require stays on the row of the variable it sets, a loop counts its body's width, and an if still ends its row. A file or function that fits on one row has no Sequence.",
		],
		fixed: [
			"**The tour's import slide says comments become comment boxes.** It said they were not kept.",
		],
	},
	{
		version: "0.179.0",
		date: "2026-10-15",
		headline:
			"Node-Prioritized imports as much as it can as nodes, and Tidy keeps tables as code again.",
		affects: ["editor"],
		added: [
			"**Node-Prioritized, a fourth way to import.** It lays a file out as Tidy does and puts as much as it can in nodes, a table written out as Make Dictionary among them.",
		],
		changed: [
			"**Tidy and Modern keep a table written out as code.** A long table reads better as the table than as a node with a row per key.",
		],
	},
	{
		version: "0.178.1",
		date: "2026-10-15",
		headline:
			"A module returning a frozen table written over several lines compiles, and the Code panel drags by its tab strip.",
		affects: ["editor"],
		fixed: [
			"**A return of a frozen table written over several lines compiles.** An imported `return table.freeze({ ... })` left the table's first lines behind, and the file did not parse.",
			"**The Code panel drags by the empty end of its tab strip.** Only its title moved it. A double-click there folds it again too.",
		],
	},
	{
		version: "0.178.0",
		date: "2026-10-15",
		headline:
			"Import selection as graphs, and Import folder as graphs, read many Luau files at once.",
		affects: ["editor"],
		added: [
			"**Import selection as graphs.** With several files selected, the Project panel's menu imports every hand-written Luau file among them, with one choice of settings.",
			"**Import folder as graphs.** A folder's menu does the same for every hand-written Luau file in it and its folders, Wally's packages left out. Each graph goes where Import as graph would put it.",
			"**Files imported before are imported again.** Their graphs are replaced, as Reimport as graph does, and the dialog says how many.",
		],
	},
	{
		version: "0.177.0",
		date: "2026-10-14",
		headline: "Reimport as graph tries another import setting on a file not yet compiled over.",
		affects: ["editor", "docs"],
		added: [
			"**Reimport as graph.** A Luau file imported already, and still the one written by hand, offers Reimport as graph in its menu. It replaces the graph, with the settings it was last imported with chosen to start, so Tidy, Verbatim and Modern can be compared before one is compiled over the file.",
		],
		changed: [
			"**The import dialog says what happens to comments.** They become comment boxes.",
			"**An imported Module Exports fed by the last step of a row sits beside it.** It was set out below the graph, with a wire back across it.",
		],
	},
	{
		version: "0.176.0",
		date: "2026-10-14",
		headline: "Import builds a table written out with Make Dictionary in Tidy and Modern.",
		affects: ["editor"],
		added: [
			'**Tables import as Make Dictionary.** `{ Speed = 16, Name = "Scout" }` is a row for each entry, a value written typed in and one worked out wired, and a table inside it a Make Dictionary of its own. It compiles back as the file had it: on one line or a key to a line, brackets kept, and the last comma as it was.',
			'**Verbatim keeps tables as code.** So do lists, tables mixing `name =` with `["name"] =`, tables with more than 24 entries, and tables with a comment inside.',
		],
	},
	{
		version: "0.175.0",
		date: "2026-10-14",
		headline:
			"Freeze, Clone, Find, Sort and the rest of the table library are nodes, and import uses them.",
		affects: ["editor", "docs"],
		added: [
			"**More of the table library.** Freeze, Is Frozen, Clone, Clear, Find, Sort and Table Concat join Insert and Remove.",
			"**Import reads them as nodes.** `table.freeze(icon)` is Freeze, not Call Function on a Luau Expression, and `return table.freeze(M)` is Freeze into Module Exports, compiled back as the one line.",
		],
		fixed: [
			"**Import reads a library call made for its value as its node.** `math.floor(x)` and `string.lower(s)` inside an expression stayed as code.",
			'**A call may leave off the arguments its node marks optional.** `table.concat(names)` and `table.concat(names, ", ")` are both Table Concat.',
		],
	},
	{
		version: "0.174.0",
		date: "2026-10-14",
		headline: "Import draws a file's comments as comment boxes around what they describe.",
		affects: ["editor", "docs"],
		added: [
			"**Comments import as comment boxes.** The comments above a statement become a box around its nodes, titled with their text, and a comment at the end of the line joins them. A row with a box on it moves down to make room for the title.",
			"**Comments compile back as the file wrote them.** A run of `--` lines, a `---` doc comment and a `--[=[ ]=]` doc block are each written in the same form above the same statement.",
			"**The import says what happened to them.** It counts the comments boxed, and those left out: one at the end of a block, with nothing after it to describe.",
		],
	},
	{
		version: "0.173.0",
		date: "2026-10-14",
		headline:
			"Import draws type aliases as Declare Type, and loops over what a call gives as For Each.",
		affects: ["editor"],
		added: [
			"**A type alias imports as Declare Type.** `type Shot = { ... }` and `export type` become Declare Type where the file has them, with the definition written as it was, comments and all. One with type parameters stays as code.",
			"**A loop over what a call gives imports as For Each.** `for _, child in model:GetChildren()` and `for word in s:gmatch(...)` iterate the call as the file does.",
		],
	},
	{
		version: "0.172.0",
		date: "2026-10-14",
		headline: "Setters assign with += and its kin, and a call can hand back several values.",
		affects: ["editor", "docs"],
		added: [
			"**Assign with an operator.** Set Local, Set Variable, Set Property and Set Key can write `+=`, `-=`, `*=`, `/=`, `//=`, `%=`, `^=` or `..=` in place of `=`: choose it under Assign with in the Inspector. The Value pin says what it does, such as Add (+=).",
			"**A call can hand back several values.** Set Results on Call Function or Call Method and it has an output for each: `local ok, err = pcall(f)`.",
			"**Import draws both.** `x += 1` becomes the setter `x = 1` would, with its operator, and `local a, b = f()` becomes one call with a result for each name, each read wired to its own.",
		],
		fixed: [
			'**Import keeps a key written in brackets.** `t["name"] = v` came back as `t.name = v`.',
		],
	},
	{
		version: "0.171.0",
		date: "2026-10-14",
		headline:
			"Import draws event handlers and threads as nodes, and New Thread runs a body on one.",
		affects: ["editor", "docs"],
		added: [
			"**Event handlers import as Connect Event and Connect Once.** `:Connect(function(player) ... end)` and `:Once` become the node, the handler's parameters its pins and its body on Body. `local conn = ...:Connect(...)` names the node, and what reads `conn` is wired to its Connection.",
			"**New Thread runs its Body on a thread of its own.** At once, once this frame's work is done, or after some seconds: `task.spawn`, `task.defer` or `task.delay` with the function written in place. Choose which in the Inspector. Imported files use it for those calls.",
		],
		fixed: [
			"**A loop's variable read inside a function declared in its body imports.** It was wired across the function's edge, and the graph did not compile; it is read by name.",
		],
	},
	{
		version: "0.170.3",
		date: "2026-10-14",
		headline: "A type's card keeps room under its sentence.",
		affects: ["editor"],
		fixed: [
			"**The card a type chip opens no longer ends on its text.** A card that ends with its sentence, as a type's does under a knot, a getter or a node, had nothing below it. It keeps the room the code editor's hovers keep.",
		],
	},
	{
		version: "0.170.2",
		date: "2026-10-14",
		headline: "Node Design types a node's title where its header draws it.",
		affects: ["designer"],
		fixed: [
			"**A node's title in Node Design no longer runs over its icon.** The title is typed on the header, and the text started at the node's left edge, under the corner tab. It now starts where the header draws the title.",
		],
	},
	{
		version: "0.170.1",
		date: "2026-10-14",
		headline: "The tour shows the editor itself on each screen, and a menu for each kind of file.",
		affects: ["editor", "docs"],
		fixed: [
			"**The editor on each screen is a picture of the editor.** On an iPad the drawn panels kept their text large while the rest shrank, and came out jumbled. Computer, Tablet and Phone are now screenshots of the editor with the demo graph open.",
			"**The menu slide opens each kind of file's own menu.** Right-click a graph, wally.toml, Luau you wrote or Luau Roswaal writes. The menus come from the same lists as the Project panel's.",
			"**The demo project's two Code Blocks no longer overlap.** The first is wider now it shows its code.",
		],
	},
	{
		version: "0.170.0",
		date: "2026-10-14",
		headline: "Code Block, Luau Expression and Declare Type show their Luau on the node.",
		affects: ["editor", "designer", "docs"],
		added: [
			"**A code node shows its code.** Code Block, Luau Expression and the two Declare Types show up to six lines of their Luau, coloured as the Code panel colours it, then how many lines more. The node widens to its longest line, up to 340px. Click the code to open it in the Code panel.",
			"**A Declare Type says what it declares, or what it is missing.** It shows its declaration as the compiler writes it; with no name or no definition it says which.",
			"**Module Exports has its own icon**, a puzzle piece: the piece another script fits into its own.",
		],
		fixed: [
			"**A node with nothing under its header is only its header.** Script Start had an empty strip below it, and a node with no pins at all an empty row.",
		],
	},
	{
		version: "0.169.0",
		date: "2026-10-14",
		headline: "Import makes the library's own nodes, and Print and Warn take any number of values.",
		affects: ["editor", "docs"],
		added: [
			"**A call the library has a node for imports as that node.** print, warn, error, assert, require, task.wait, table.insert, Instance.new and the other calls a library node writes become that node rather than Call Function on a Luau Expression. A file that declares its own print keeps calling it.",
			'**A local set to such a call keeps it as a step.** `local part = Instance.new("Part")` imports as Instance.new and Declare Local, and compiles back as the one line.',
			"**Print and Warn take any number of values.** Add one with the + in the header; each is written after a comma, as print takes them. Graphs with one value are unchanged.",
		],
		fixed: [
			"**Import keeps a function that assigns an earlier local as code.** `function f()` after `local f` assigns that local; it was imported as a new local function, which whatever captured the first never saw.",
		],
	},
	{
		version: "0.168.1",
		date: "2026-10-14",
		headline:
			"Three of the front page's tour slides fit an iPad Mini, and a phone's graph name is out from under the bar.",
		affects: ["editor", "docs"],
		fixed: [
			"**From the DataModel stacks on an iPad.** The tree and Code Block sat over each other, and the filter field was cut off. They stack when the slide is narrower than both.",
			"**The editor on each screen shows a graph.** Computer, Tablet and Phone each draw the welcome graph in their canvas, fill the slide's width, and the phone is drawn larger.",
			"**One menu draws the Project panel as it is.** The tree is the Project panel's own, with wally.toml the row the menu opens from.",
			"**On a phone, the graph's name is no longer drawn in the canvas's corner.** It sat under the bar along the bottom; the name is in the graph's tab.",
		],
	},
	{
		version: "0.168.0",
		date: "2026-10-14",
		headline: "The front page's import demonstration answers a tap, and fits an iPad Mini.",
		affects: ["docs"],
		added: [
			"**Tap a line or a node in the import demonstration.** A line of the file, a node, or a line the graph writes lights the other two, and the graph scrolls to it.",
			"**The imported graph is drawn at a size to read.** It is laid out as an import lays it out, scrolls inside its frame, and Tidy now shows its rows beside Verbatim's one chain. Both files show every line.",
		],
	},
	{
		version: "0.167.0",
		date: "2026-10-14",
		headline: "An imported graph is laid out to be read, in rows.",
		affects: ["editor", "docs"],
		added: [
			"**Imported graphs are laid out from their structure.** Statements run left to right, the values each one reads sit below and to its left, and Branch, the loops and Sequence start a row for each output. Every node is placed at the size it is drawn, so none sits over another.",
			"**Long code reads down the canvas.** In Tidy and Modern, a run of more than eight statements becomes rows on a Sequence, cut at the file's blank lines where it can be.",
			"**Blank lines are kept.** A blank line in the file is written back where it was.",
		],
	},
	{
		version: "0.166.0",
		date: "2026-10-14",
		headline: "An imported graph keeps the file's names and types.",
		affects: ["editor", "docs"],
		added: [
			"**Names stay as written.** An imported graph no longer renames a local that shadows another, drops a leading underscore, or turns `self` into `self_`, so Luau kept as text still reads the variable it read in the file. A name that hides a global, a service or a module is kept and flagged on its node.",
			"**Types stay as written, with or without a mode line.** Parameters, returns and locals keep the annotations the file gave them and gain none it did not: no `: ()` on a function that said nothing, no `= nil` on `local conn: RBXScriptConnection`, and a table type set out over several lines is written on one rather than as `any`.",
			"**Loops stay as written.** `for k, v in t` is no longer turned into `pairs(t)`, and `for k in t` keeps its one variable.",
		],
	},
	{
		version: "0.165.1",
		date: "2026-10-14",
		headline: "Imported Luau compiles back as it was written in four more places.",
		affects: ["editor"],
		fixed: [
			"**A statement that opens with a bracket no longer runs into the one before it.** `(part :: BasePart).Parent = model` after a call was read as calling that call's result, and the graph's Luau did not parse. It is written `;(part :: BasePart).Parent = model`, as Luau is written by hand.",
			"**A call whose argument holds a comment or a backtick string stays a call.** It was written `local _rw1 = table.insert(...)`.",
			"**Import keeps the brackets around a call.** `print((pick()))` passes only the first value `pick` returns; it came back as `print(pick())`, which passes all of them.",
			"**Import keeps a number as it was written.** `0.10` and `2.0` came back as `0.1` and `2`.",
		],
	},
	{
		version: "0.165.0",
		date: "2026-10-09",
		headline:
			"The specification's requirements numbered, with where Roswaal stands on each, and drawn as its drafts were.",
		affects: ["docs"],
		added: [
			"**Every requirement in the specification is numbered**, for the section it is in: **5.8-R3** is the third in §5.8. Each is a row of its own with a link to itself and whether Roswaal meets it: Roswaal meets, Roswaal partly, or Not yet in Roswaal, with what is missing beneath. A number never moves once published.",
			"**All requirements**, at the end of Part III: all 104, by chapter, with Roswaal's totals and a link to each where its chapter states it. The list to read an implementation, or the specification itself, against.",
			"Each chapter on spec.roswaal.app says how many requirements it makes and how many Roswaal meets, beside its status, and its status names the conformance levels it holds: Normative · Level 3.",
		],
		changed: [
			"**MUST, SHOULD and MAY are pins**, coloured by how hard they bind, wherever the docs write them, in place of bold capitals inside a sentence.",
			"The principles are drawn as their draft had them, each with its *In Roswaal* and *A profile must not* side by side. Notes say what they are in their heading: *Open question*, *Where Roswaal falls short*. Examples are framed and say which profile they come from.",
			"spec.roswaal.app has a **Try Roswaal** button in place of a link, filled status pills, and, on a phone, a header that scrolls away rather than covering the text.",
			"A link to a place on another page of the docs, such as one requirement, opens that page at that place, in the Docs panel as well as on the site.",
		],
	},
	{
		version: "0.164.1",
		date: "2026-10-09",
		headline: "A mouse wheel scrolls the tab rows sideways.",
		affects: ["editor"],
		fixed: [
			"**The graph tabs, and the Code panel's tabs, scroll with a mouse wheel.** Both rows scroll sideways with their scrollbars hidden, which a trackpad does by itself; a mouse wheel turns only up and down, so on Windows the tabs past the edge could not be reached with it. Turning the wheel over a row that has more tabs than it shows now scrolls it sideways.",
		],
	},
	{
		version: "0.164.0",
		date: "2026-10-09",
		headline: "The technical specification as a site of its own, at spec.roswaal.app.",
		affects: ["docs"],
		added: [
			"**The specification has a site of its own**, built for spec.roswaal.app and previewed at `/technical/` on the canary. It loads its own small stylesheet and script and nothing of the editor's: a chapter is about 15 KB to read, against about 340 KB as a page of the docs, and its search, over the specification alone, loads the first time it is used.",
			"Each chapter has its own address, such as `/visual-grammar/`, and a sidebar of the chapters and the sections of the one being read. On a phone the chapters fold into a Chapters button.",
			"**Each draft keeps an address of its own**: the latest draft is at the root, and Draft 0.1 is also at `/0.1/`, where it stays as published once a newer draft replaces it.",
			"It is drawn in Roswaal's own light and dark themes, read from the themes the editor ships, with the same node pictures as the docs.",
		],
		changed: [
			"The specification stays in the Docs panel too, built from the same pages. Its front page and §14.1 say where it is published, and which address to cite.",
		],
	},
	{
		version: "0.163.1",
		date: "2026-10-09",
		headline: "Luau Expression's mark sits inline, as a value's glyph does.",
		affects: ["editor", "docs"],
		fixed: [
			"Luau Expression drew its `ƒx` in a box with an edge of its own, a tab a value node does not have. It now sits before its name as every other value's glyph does, on the canvas and in the documentation's pictures.",
		],
	},
	{
		version: "0.163.0",
		date: "2026-10-09",
		headline: "Tidier function headers, and any parameter or output removed from where it is.",
		affects: ["editor", "docs"],
		added: [
			"**A grey × beside each entry a node can lose**: a function's parameters, a call's arguments, Sequence's outputs, a Return's results, Module Exports' entries and Make Dictionary's rows. It takes that one away, wherever it is, and the wires and values on the ones after it move up with them. It shows when you point at the node or select it, and not when the node is at its minimum.",
			"**An Add row under a node that grows**, also on hover or selection: **+ Add parameter**, **+ Add argument**, **+ Add output** and so on. It always adds at the end. A problem note under such a node sits a row lower, so it never covers the row.",
		],
		changed: [
			"**A function's header is its name over its types.** Function and Declare Function show `(Model, BasePart) → boolean`, each type in its pin's colour, in place of the names and types together, which were cut short: the names are on the pins below. Both take the ƒ glyph, where the hoisted Function had the play glyph of an entry, and Return takes an arrow back in place of the stop square.",
			"The − and + have left the headers of nodes that grow, for the Add row and the ×. An operator keeps its own beside its symbol.",
			"**Code Block, Luau Expression and Declare Type carry the Code panel's marks**: `{ }`, `ƒx` and `<T>` in their corner tab, in the code face and the theme's code colours, on the code editor's own surface, so a node and its tab in the Code panel read as one thing.",
			"The technical specification says how adding and removing entries behaves (§4.5) and what a function's header shows (§5.4).",
		],
		fixed: [
			"**Removing a parameter, a result or an export in the Inspector no longer moves wires onto the wrong pin.** Taking out any but the last left the wires of the ones after it on their neighbours, and the last one's pointing at a pin that no longer existed. It now renumbers as the × does.",
			"**A getter's name is no longer cut short on a Mac.** Capsules were estimated a little narrow for the system face there, so a name such as AccumulateNum read “Accumulate…”. Every getter is a few pixels wider.",
			"A call wired from a declared function no longer offers to add arguments, which it takes from its function.",
		],
	},
	{
		version: "0.162.0",
		date: "2026-10-09",
		headline:
			"The technical specification, Draft 0.1: Roswaal's design written so another editor can follow it.",
		affects: ["editor", "docs"],
		added: [
			"**The technical specification**, at roswaal.app/technical, in [the docs](technical) and in the Docs panel, under a heading of its own. Fourteen chapters in three parts: the principles, abstractions, interactions, visual grammar, types, execution, accessibility and file format that hold in every language; how to write a profile for a new language, with Luau for Roblox and Luau for Lune as the first two; and how conformance will be checked and the specification changed.",
			"Each page says whether it is **Normative**, binding an implementation in the words of RFC 2119, or **Informative**, and that it is **Draft 0.1**. Nothing in a draft is promised until 1.0.",
			"Its tables of numbers are **generated** from Roswaal's own source as the pages are built: node geometry, the drawing layers, the grid and zoom, the pin families, the theme roles, the built-in library by category, and the connection rule, whose examples are the compiler's own answers.",
			"Where Roswaal does not yet do what the specification asks, the page says so beside the requirement: the canvas cannot yet be used from the keyboard or by a screen reader, and pins do not grow for a finger.",
		],
		changed: [
			"[Wires and pins](wires-and-pins) describes the pin shapes and type chips, and value nodes as rounder with no header bar. Adding and removing pins, and [Coming from Blueprints](coming-from-blueprints), describe the controls and flow pins as 0.161 draws them.",
		],
		fixed: [
			"**A getter, an operator and a reroute knot show their type underneath**, centred, rather than in a chip beside their output, where it cut a getter's name short, covered an operator's symbol and sat on top of a knot's pin.",
			"**A handler whose body reads its own connection** now works. A Body that disconnected its own Connection compiled to `local connection = …:Connect(function() connection:Disconnect() end)`, where the `connection` inside the function is not yet the local and so is nil. The local is now declared first and assigned by the connect.",
		],
		watch: [
			"The documentation's pictures of getters, operators and knots do not show the type under them yet.",
			"Draft 0.1 publishes no conformance fixtures or checker; its Conformance chapter says what is planned.",
		],
	},
	{
		version: "0.161.0",
		date: "2026-10-09",
		headline:
			"Nodes redrawn to be read: a quieter header, pins shaped by kind, types in words, problems in plain sight.",
		affects: ["editor", "designer", "docs"],
		added: [
			"**A glyph for every category**, in a tab in the header's corner: the full height of the header, in the category's colour, with an 18px glyph drawn for the purpose. It stays readable with a whole graph in view, where the old header colour was the only cue.",
			"**Pins are shaped by what they carry.** A plain value is a circle, an Instance or any class a rounded square, a table a diamond, a function a dot in a ring, and an event to listen to a hexagon. Colour still says the exact type; the shape says the kind without it.",
			"**Outputs say their type in words** where the pin's name does not already: a short name in a chip of the type's colour, so `RBXScriptConnection` reads Connection. A pin called player holding a Player, or one with no fixed type, has no chip.",
			"**Pointing at a type chip opens the type's card**, the same one the Code panel shows: what it is, from Roblox's Creator Documentation, and a link to its page. On a touch screen, a tap opens it and a tap elsewhere closes it.",
			"**A problem is written out under its node**, above everything else in the graph: no node, comment or wire covers it, and only the panels and menus do. The pin it names is marked in red in the node.",
		],
		changed: [
			"**Headers are a tint of their category** with the title in the ordinary text colour, in place of a solid bar with white text. Pin names are drawn nearly in the text colour rather than grey.",
			"**The flow in and the flow on ride the header**, level with its middle, so a run of steps is joined header to header and reads straight across. A named flow pin, such as Body, True or Then 0, keeps its row. Most steps are a row shorter for it.",
			"**Flow triangles are drawn in the flow wire's colour**, dark on a light canvas and light on a dark one, rather than a pale grey that all but disappeared against a light node.",
			"**A pure node is rounder, with no header bar**: its name and glyph are in its category's colour, on a faint wash of it. The green stripe down its left edge is gone; the scheme colour that drew it now tints the outline.",
			"**The − and + on a node that takes a list appear on hover or selection**, and are hidden at rest. On a touch screen, select the node to show them. The documentation's node pictures no longer draw them.",
			"Node corners are 8px, from 7px.",
		],
		watch: [
			"**Graphs keep their positions**, but most steps are now a row shorter, so a node that was placed snugly under one has more room below it than before.",
			"A type from one of the project's own modules has no card yet: the chip shows its name, and pointing at it opens nothing.",
		],
	},
	{
		version: "0.160.3",
		date: "2026-10-09",
		headline: "The attributions grid's names sit in the middle of their cells.",
		affects: ["editor", "docs"],
		fixed: [
			"In the Attributions page's Simple grid, a name that wraps, such as **Luau logo (canary)**, sits in the middle of its cell rather than to the left of it. The grid took the docs' table spacing, with none on a cell's left and more on its right, which only showed once a name filled its cell.",
		],
	},
	{
		version: "0.160.2",
		date: "2026-10-08",
		headline: "A name that wraps in the attributions grid stays centred.",
		affects: ["editor", "docs"],
		fixed: [
			"In the Attributions page's Simple grid, a name too long for one line, such as **Creator Documentation**, centres each of its lines in the cell, as a name on one line does, rather than keeping them to the left.",
		],
	},
	{
		version: "0.160.1",
		date: "2026-10-08",
		headline: "The attributions grid centred, and two of the bars' details put right.",
		affects: ["editor", "designer", "docs"],
		fixed: [
			"The Attributions page's Simple grid centres every cell and heading, leaving only the rights holders down the left, clear of the border.",
			"With a node map or a `.luau` script open, the cluster naming it on the top row is as tall as the tabs and tools beside it, rather than two pixels short.",
			"On the Toolbars page, Node Design's pack bar draws **Preview or Logic** and **Luau or Nodes** as two switches, each in its own box, as a phone shows them, rather than one row of four.",
			"*Getting started*, *The Interface*, *Controls*, *Toolbars* and *Attributions* are marked as read again, on 8 October 2026.",
		],
	},
	{
		version: "0.160.0",
		date: "2026-10-08",
		headline: "Attributions you can find yourself in: by holder, at a glance or in full.",
		affects: ["editor", "docs"],
		added: [
			"**The Attributions page is a browser.** **Simple** shows every rights holder on one screen against the seven ways Roswaal uses their work; pick a name to find it in **Advanced**, the list by holder, with search, a filter for each usage type, and a link to every holder.",
			"**Every licence opens from its entry.** The licence beside an entry is a button that opens the licence itself, exactly as Roswaal carries it: in the editor's read-only view in the app's docs, and as numbered lines on the website. The notices file opens the same way.",
			"**Seven usage types**, each with what it means: Included, Quoted, Written for, Works with, Example, Inspired by and Named after. They replace the four headings the page had, one of which covered both code that ships and tools that never do.",
		],
		changed: [
			"Each holder's trademark line is above its entries, once. The name Roswaal is an entry of its own, under its notice.",
			"`ATTRIBUTIONS.md` is one table by rights holder, with the usage type of each entry.",
		],
	},
	{
		version: "0.159.0",
		date: "2026-10-08",
		headline: "Every licence Roswaal carries travels with it, and opens to its exact text.",
		affects: ["editor", "designer", "docs"],
		added: [
			"**A notices file beside every build.** The editor, the web app and `roswaal serve` each carry the licence of every open-source package they bundle in `THIRD-PARTY-NOTICES.txt`, copied from the package's own licence file, and the release binaries carry Node.js's too. It is read from what the build actually contains, and a bundled package with no licence file stops the build.",
			"**Each release zip has the notices file beside the binary.**",
			"**Licences open to their exact text.** **Settings → Licences** lists every licence Roswaal carries; each opens, read-only and with line numbers, to the text exactly as published, with where it was copied from, the day, and its SHA-256 to check against the original. The Attributions page shows the same, and this build's notices file is a row of its own.",
			"Three licences Roswaal had not carried until now: Apache-2.0 for the icons (Material Symbols), MPL-2.0 for Lune's type definitions, and CC BY 4.0 for the summaries from Roblox's Creator Documentation, each copied unchanged from its holder's repository.",
			"**How Roswaal is made**, in Settings, under the Attributions list and in the README: designed and directed by its maintainer, with much of the code written with Claude, Anthropic's AI model, and nothing of Anthropic's in it.",
			"Node.js, the bundled open-source packages, Affinity and Procreate are on the Attributions page and in `ATTRIBUTIONS.md`.",
		],
		changed: [
			'Every attribution says, in one sentence, what Roswaal does with it, and either where it is or that nothing of theirs ships. Where nothing ships, the licence reads **None needed** rather than "not licensed to us". Trademark lines are said once per holder, and that Roswaal is not affiliated with anyone listed, once for the page.',
			"`roswaal serve` from a release binary no longer caches files other than the editor's hashed assets for a year, so an upgrade is seen at once.",
		],
	},
	{
		version: "0.158.1",
		date: "2026-10-08",
		headline:
			"Cards hand back the room they do not use, and the completion list follows the pointer.",
		affects: ["editor"],
		fixed: [
			"Two cards sharing a dock are each no taller than what they show. Folding a section of the Project panel hands the room it leaves to the card below, Variables say, and opening it takes the room back; before, each kept its share of the column, empty or not.",
			"The completion list hangs a few pixels clear of the line, so the accent underline under the word you are typing shows rather than merging with the list's edge. The word itself has a faint cream wash over it, in Node Design's logic field as well as the Code panel.",
			"Moving the pointer over an answer in the completion list picks it, as the arrow keys do, so Enter or Tab takes the one you are pointing at. The arrow keys still carry on from there with the pointer resting on the list.",
		],
	},
	{
		version: "0.158.0",
		date: "2026-10-08",
		headline:
			"The web app's docs are part of it: Docs switches in place, and documents your own packs.",
		affects: ["editor", "docs"],
		added: [
			"**Docs in the web app is a page of the app**, as it has always been under `roswaal serve`. The mode strip switches to it in place, like Node Design, so going to the docs and back loads nothing, and the editor and the page you were reading are both as you left them.",
			"**Your project's own packs are documented there**: each node gets its page, its picture and what it compiles to, beside the built-in library, and the search finds them.",
		],
		changed: [
			"Links to the docs from the web app (a node's page from the Inspector, the projects screen, Ctrl+K) open the app's docs at `docs.html` rather than the static pages.",
			"The static documentation under `docs/` stays, for search engines and links from elsewhere. Its mode strip leads into the app, which picks up where it was in that tab.",
			"The page about toolbars no longer warns that the web app's Docs leaves out your packs.",
			"**A link to the site now unfurls properly** in Discord, on the DevForum and in search: a title, a fresh description, a 1200 × 630 card made from the front page's banner (yellow on the canary), the site's colour down the side of a Discord embed, and an icon a forum can show. Every docs page has its own title and summary, and the editor, Node Design and the docs carry their own.",
		],
		fixed: [
			"Switching modes waits for the mode you chose: the one you are leaving stays on screen as it was until the new one has drawn its bar (for the editor, its project and graphs back), then the new one fades in over it. The editor no longer flashes its loading frame on the way.",
			"The mode strip's box slides once, all the way, as the new mode fades in. The logo and the strip stay solid through the switch rather than fading with the page, and no second box lingers where the slide began or jumps back as the editor finishes loading.",
		],
	},
	{
		version: "0.157.0",
		date: "2026-10-08",
		headline: "Editor, Design and Docs in one strip, switched in the tab you are in.",
		affects: ["editor", "docs"],
		added: [
			"**The mode strip**, beside the mark in every window: Editor, Design and Docs, with a box behind the one you are in that slides to the one you pick. A click switches the tab you are in; `Ctrl`- or `Cmd`-click, a middle click or a right-click opens a mode in a new tab. On a computer and a tablet; a phone keeps them in **More**.",
			"**The editor is kept while you are elsewhere.** Going to Node Design and back leaves its tabs, where each was looking, its undo and the Code panel exactly as they were, with nothing reloaded; the back and forward buttons move between modes the same way. A node Node Design saved is in the palette when you come back.",
			"On the web app the docs are the published pages, so going to them is a page load. The editor writes down its open graphs, the one in front, their cameras and the Code panel's tabs first, and puts them back when you return to the same project in that tab; a reload does the same.",
			"Where the code panel's tabs run out of room, a list at the end of the row names every one.",
		],
		changed: [
			"The version number is off the top row, to make room for the strip. It is in the projects panel the mark opens, and in the mark's tooltip.",
			"The Docs and Node Design buttons at the right of the editor's row, Node Design's Docs and Open Editor, and the docs' Open Editor and **Try it in your browser** are the strip now.",
			"A project opened from the projects panel in Node Design or the docs is opened by the editor kept behind them, so what it had open is saved and closed first.",
			"A Code panel folded down keeps only its title, its tabs, the list, and its Unfold and ⋯; Go to node and Full view come back when it unfolds. Picking a tab unfolds it.",
		],
		fixed: [
			"A window over the graph that you are using now comes in front of the docks, the Code panel along the foot included, rather than always sitting behind them. Clicking back into a docked card puts it behind again.",
			"Script analysis folded by its chevron shrinks to its bar as a window over the graph, rather than keeping the unfolded window's height.",
			"Script analysis in a side dock is as tall as its list, about five problems, and scrolls past that, rather than taking a share of the column whatever it holds; folded, it is its bar. Its bar stays on one line in a narrow dock.",
			"The editor no longer shows the projects screen for a moment while it opens: until it has its project, and the graphs it is putting back, it shows the empty canvas with the mark and the strip, then fades the rest in. A mode switch fades into what you left, not into the picker.",
		],
	},
	{
		version: "0.156.1",
		date: "2026-10-08",
		headline: "Every note in Settings, said in a line.",
		affects: ["editor", "docs"],
		changed: [
			"Each setting's note, each choice's and each page's is cut to what you need to choose: half as long in all, the longest from 223 characters to 85. **Compile** reads \"Dynamic compiles on every edit. Manual waits for you.\"",
			"The notes under **Action buttons** and **Action row** no longer start by saying they are for a phone or a tablet; the group they are in says so.",
			"What a note no longer says is on [Settings and themes](settings), which now lists `castsByHierarchy` with the rest of `roswaal.json`.",
		],
	},
	{
		version: "0.156.0",
		date: "2026-10-08",
		headline:
			"Settings, redone: pages by where they are kept, groups of rows, and a search over all of it.",
		affects: ["editor", "docs"],
		added: [
			"**Search settings**, at the top of the list: finds a setting on any page by its name or by what it does. Esc clears it, and Esc again closes Settings.",
			'Settings in the docs says where the rest is: "The Settings for your Project and Canvas Style are in Editor Mode", with a link to the editor.',
		],
		fixed: [
			"**Rojo project file** is gone from Settings. Nothing read it, and its note said nothing was written to that file, when a node map writes it: at the map's own **Output**, `default.project.json` unless it says otherwise, and only over a file Roswaal wrote or one handed over with force. A new project's `roswaal.json` no longer names one; an older one that does still loads.",
			"Attributions, the theme docs and the Aquatic theme no longer link a repository that is not public. Aquatic's source is Roswaal's own.",
		],
		changed: [
			"**Settings lists its pages under where they are kept**: this project's `roswaal.json` (**Compiling** and **Node packs**), and this browser (**Canvas**, **Nodes**, **Workspace**, **Themes** and **Docs**), with **Licences** at the foot.",
			"The Editor page is three: **Canvas** for the grid, wires, node corners, Realign and scrolling; **Nodes** for long names and what new nodes start as; **Workspace** for writing a graph, the Variables panel, function tabs, the action row and what opens first. The Project page is **Compiling**, and its node packs have a page of their own.",
			"A page's rows are in groups under a small heading, each a box of its own; segmented choices are pills on a track, and on-off settings are switches.",
			"The same sheet in the editor, Node Design and the docs, and on the docs site. Node Design leaves out the project's pages, and the docs show only **Themes** and **Docs**.",
			"[Settings and themes](settings) lists what is on each page, and the docs that sent you to **Settings → Editor** or **Settings → Project** now name the page it is on.",
		],
	},
	{
		version: "0.155.0",
		date: "2026-10-07",
		headline:
			"Code opens in a panel along the foot of the graph, a tab per field, applied as you type.",
		affects: ["editor", "docs"],
		added: [
			"**The Code panel.** A Code Block, a Luau Expression or a type written out opens in a panel along the foot of the graph, between the side panels, rather than in a dialog that shut the rest of the editor away. The tree, Variables and the Inspector stay usable while you write.",
			"**A tab per field**, in the panel's header after its title. Open several and switch between them; each keeps its own place and undo. A tab is marked with what it edits (**{ }** a Code Block, **ƒx** a Luau Expression, **<T>** a type) and named after its node's label if it has one, then the graph it is in, or its first line of code when two would read the same; it closes with × or a middle-click, and a graph's tabs come back when you return to it.",
			"**Applied as you type.** There is no Done: a pause in typing applies the text to the node as one step of the graph's undo, and clicking away applies it at once. A graph that is compiling takes the change when it finishes rather than dropping it.",
			"**Full view.** The button at the top right of the panel, or Ctrl+Shift+Enter, grows it over the graph with the side panels kept, as the dialog was. Esc or the same keys go back.",
			"**Drag names in from Variables**: a variable, service, module, local, function or type dragged into the code writes its name, as the DataModel writes a path.",
			"**Go to node** selects the node a tab edits and brings it into view.",
		],
		changed: [
			"**Custom Code is now Code Block**: a block of code written by hand, which is what it is. Searching for Custom Code still finds it, and graphs that use it are unchanged.",
			"The panel moves like any other: to a side, onto another card's header as a tab, or over the graph as a window. Any card can now be docked along the foot, and its menu has **Along the foot**.",
			"The status pill keeps its place at the bottom left, and lies over the strip's corner when it opens to list problems, rather than moving the strip while code is being typed.",
			"[Hand-written Luau](hand-written-luau) describes the panel.",
		],
	},
	{
		version: "0.154.1",
		date: "2026-10-07",
		headline:
			"The canvas's grid holds still while you zoom, and code hovers are no longer cut off.",
		affects: ["editor"],
		fixed: [
			"Zooming the canvas no longer makes the dot grid jitter. A browser rounds a repeating background to whole device pixels one tile at a time, so at some zooms the dots far from the canvas's corner sat up to 7px from where they belonged, and jumped back as the zoom changed. The canvas now draws its grid itself, each dot and line where it falls, within half a pixel at every zoom. Dots or Lines, Grid contrast and the theme are followed as before.",
			"A hover, signature, lint message or completion list in the code editor is no longer cut off by the editor's edge: one shown above the first lines was clipped to its last row. The editors' tooltips are drawn over the page, the same in the code editor, the source view and Node Design.",
		],
	},
	{
		version: "0.154.0",
		date: "2026-10-07",
		headline: "Instance.new offers only the classes it can make.",
		affects: ["editor"],
		changed: [
			"New Instance's Class Name lists only the classes `Instance.new` can make. Abstract classes such as `BasePart`, `GuiObject` and `Instance`, and the services, are left out, going by the engine data's NotCreatable and Service tags. Is A, Find First Child Of Class and the other class pins still list every class.",
			'In Custom Code, completion after `Instance.new("` offers the same, and after `:IsA("` every class.',
		],
		fixed: [
			"A New Instance given a class it cannot make, typed in by hand, is an error on its Class Name pin naming what can be made instead (`Instance.new cannot make a BasePart … Make a MeshPart, a Part, a Seat instead`), or pointing a service at Get Service. It failed only when the script ran. A class newer than this build's data is still taken.",
		],
	},
	{
		version: "0.153.0",
		date: "2026-10-07",
		headline: "Promote a node to the Variables panel, and drop a module's graph onto Modules.",
		affects: ["editor", "docs"],
		added: [
			"**Right-click a node to promote it**, as you would a pin. **Promote to Services** on a Get Service declares the service. **Promote to Modules** on a Require Module or Require at Top declares the module and puts a Get Module in its place, its wires and module function calls kept. **Promote to Variable** on a Declare Local in the script's own flow, with a value typed in, makes it a script variable, its Get and Set Locals becoming Gets and Sets; inside a function, a loop or a handler it stays a local, since there it is a fresh value each time. **Promote to Declare Local** on a step with a Result name gives the result its own Declare Local after it. Each leaves the generated file meaning the same.",
			"A node with nothing to promote opens the node palette on right-click as before. One that has something opens a small menu with **Add Node Here…** at the foot.",
			"**Graph Content and Compile Content onto Modules.** Drag a module's `.nodescript` or its compiled `.luau` from the project tree onto Modules to declare it by where the project's node map puts it.",
		],
		changed: [
			"Dropping or promoting a module that is already declared reuses that declaration, rather than adding `Greeter2`.",
			"[Modules](modules) and [Variables and locals](variables-and-locals) say how to promote each kind of node.",
		],
	},
	{
		version: "0.152.0",
		date: "2026-10-07",
		headline: "Require a module by where it sits, and declare the services a script fetches.",
		affects: ["editor", "docs"],
		added: [
			'**Modules by where they sit.** On Roblox, a module in the Variables panel can be `ReplicatedStorage.Shared.Greeter`, `game.ReplicatedStorage.Shared.Greeter`, `script.Parent.Util` or a path with `:WaitForChild("Name")`, and compiles to `require(ReplicatedStorage.Shared.Greeter)` through the hoisted service. Left unnamed, it is named after the ModuleScript. Only a path is accepted: another call or an operator in the field is an error.',
			"**Services**, in the Variables panel of a Roblox graph: the services the script fetches at the top of the file, in the order you list them. Drag one onto the canvas for a Get Service that reads the same local; Custom Code can use it by name, and completion and DataModel drops in Custom Code start from it.",
			"A declared service nothing uses is a warning, so the top of the file lists what the script depends on. On Lune a declared service is an error.",
			"Drag a ModuleScript from the DataModel browser onto Modules to declare it by where it sits, or a service onto Services to declare it.",
			"**Call a declared module's functions.** A module declared by where it sits offers its exported functions in the node search, `Call Greeter.greet`, as a Require Module node's do, and the call goes through the declaration's one `require`.",
		],
		changed: [
			"Exported types of a module declared by where it sits are offered as `Greeter.Type`, as a Require Module node's are.",
			"Custom Code completion offers the script's declared modules by name.",
			"An empty section of the Variables panel is one short line, what goes there or how to add one; hover it for the longer account.",
			"[Modules](modules) explains requiring by where a module sits, and declaring services.",
		],
	},
	{
		version: "0.151.0",
		date: "2026-10-07",
		headline:
			"Dragging from the DataModel starts from the locals you have, and completion reads like a form.",
		affects: ["editor", "docs"],
		changed: [
			"An instance dragged into Custom Code starts from the nearest local that already holds part of its path: `Shared.Config` where `local Shared` holds ReplicatedStorage.Shared, `ReplicatedStorage.Remotes` where Get Service fetched ReplicatedStorage earlier in the graph. The locals come from the code itself, then from the Custom Code and Get Service before it in the graph.",
			"Dragging an instance a local already holds onto a blank line writes that local's name, not a second local for the same thing.",
			'Instances in Workspace start from `workspace`, where they started from `game:GetService("Workspace")`.',
			"Completion in Custom Code is a list hung from the line you are typing on, the word you are completing underlined in the accent colour, with long entries shortened to fit and the list scrolling past ten.",
			"The front page tour's drag slide shows it: a script that has `Shared` already, and Config dragged in as `Shared.Config`.",
		],
		fixed: [
			"The front page tour's drag slide draws its code as code again, with the script's name above it, where the name lost its heading and long lines wrapped.",
		],
	},
	{
		version: "0.150.0",
		date: "2026-10-07",
		headline: "A dot grid behind graphs, as strong as you need it, and a quieter corner label.",
		affects: ["editor", "designer", "docs"],
		added: [
			"**Grid**, in Settings: **Dots**, a dot at every point Shift-drag snaps a node to, or **Lines**, the ruled grid with every fifth line heavier.",
			"**Grid contrast**, in Settings: **Auto**, **Light**, **Standard** or **Strong**. Auto is light, and strong when your system asks for more contrast. Strong draws larger dots.",
		],
		changed: [
			"The grid is dots by default, everywhere a graph sits: the canvas, Node Design, the start page, the node packs page, the sheets a map or a source opens in, the docs' drawings, and the front page.",
			"Every grid is drawn by one rule, 24 apart wherever it stands at full size, and follows the same two settings.",
			"What the canvas is showing — the script's class and name, or the script and the function — is one quiet line in its corner, where it was a large title across the work.",
		],
	},
	{
		version: "0.149.0",
		date: "2026-10-07",
		headline: "The front page tour shows completion, the DataModel, Wally and importing.",
		affects: ["docs"],
		added: [
			'**Completion that knows Roblox**: type after `Instance.new("`, `:GetService("`, `:IsA("` or `Vector3.` and take what the editor offers.',
			"**From the DataModel into your code**: drag an instance from the DataModel browser into Custom Code, a whole local on a blank line and the path alone inside one.",
			"**Wally packages, in the tree**: wally.toml with each package and its version, before and after Add from Wally….",
			"**Luau in, graph out**: a file imported in Verbatim, Tidy and Modern, its graph beside the Luau it writes, and the report the editor gives. Marked **In progress**, with what it does not do yet.",
			"A slide that is still being finished says **In progress** beside its version.",
		],
		changed: ["The tour has eleven slides, and on a phone its numbers wrap to a second row."],
	},
	{
		version: "0.148.1",
		date: "2026-10-07",
		headline: "A new project's spawn stands on its baseplate.",
		affects: ["editor", "docs"],
		fixed: [
			"The SpawnLocation in a new project's `place.rbxlx` stands on the baseplate, at height 0.5, where it floated half a stud above it.",
		],
	},
	{
		version: "0.148.0",
		date: "2026-10-07",
		headline: "A new project from nothing, with a place to start in.",
		affects: ["editor", "docs"],
		added: [
			"**New projects.** `roswaal new <folder>`, **Create** on the start page and **New project…** in the Project menu make a project from nothing: a node map that writes `default.project.json` with Rojo's three folders (Server in ServerScriptService, Client in StarterPlayerScripts, Shared in ReplicatedStorage) and a Main graph that prints Hello world, compiled and ready. `--lune`, or choosing Lune, makes a Lune project with one main graph.",
			"**A place to start in.** A new Roblox project has `place.rbxlx` unless you say not to: the usual services, a 512-stud BasePlate with its top at height 0, and a 12-stud SpawnLocation at the centre. Roswaal writes it rather than copying Studio's template, and `roswaal export` writes the project's scripts into it.",
			"In the web app, **New project…** replaces the project kept in the browser, or, in Chrome and Edge, goes into an empty folder you pick.",
			"**Hover knows the globals.** `game`, `workspace`, `script` and `plugin` show their class and link both the class and their own entry in the Creator Docs; Roblox's other globals and Luau's link their entries, and a library and its members (`math.floor`, `task.wait`) link the library's page. `game:GetService` and `workspace.Gravity` read as the class's own.",
		],
		changed: [
			"The start page offers **Create** for an empty folder or a path with nothing at it yet, where it said there was nothing there. A folder with files keeps **Initialise**.",
			"A new project goes only into an empty folder, or one that is not there yet. One with files in it is refused, and left as it was.",
			"[Getting started](getting-started), [Command line](command-line) and [Places and Rojo projects](places-and-rojo) say how to start a new project.",
		],
		fixed: [
			"The web app walkthrough on Getting started moves on when **Project** is pressed. It had ringed the Project panel behind it instead.",
			"The front page tour's computer, tablet and phone are drawn as [The interface](the-interface) draws the editor on each, where they were a sketch that put the cards in the wrong places.",
		],
	},
	{
		version: "0.147.0",
		date: "2026-10-07",
		headline: "The front page has a tour of the editor, and its versions open their notes.",
		affects: ["editor", "docs"],
		added: [
			"**Take the tour**: seven slides on the front page, each a part of the editor to try. Select nodes to see which lines of the generated file they wrote, search for a node by name, walk the node picker as it draws each node, hover the names in a script and a Moonwave-documented module, see the editor on a computer, a tablet and a phone, and work a menu from the keyboard.",
			"Under the example of what Roswaal writes, a line leads on to the tour and scrolls all of it into view.",
			"Search literally, or visually; Preview anything, any time; and Panels that float and dock each link up to the slide where they can be tried.",
			"Each slide names the release its part first shipped in and the ones that built on it.",
		],
		changed: [
			"A version on the front page opens the release notes it first shipped in: the cards under Inside the editor, the slides, and Lately.",
			"Custom nodes, made your way is dated 0.34.0, when a node's logic could first be built from nodes.",
		],
		fixed: [
			"The selection preview no longer calls Script Start a pure node. It says Script Start is where code starts running, and lights no lines for it.",
			"What is planned no longer lists importing Luau, which shipped in 0.140.0.",
		],
	},
	{
		version: "0.146.0",
		security: true,
		date: "2026-10-06",
		headline:
			"roswaal for macOS, nodes from a pack say so, and files from elsewhere are read to a limit.",
		affects: ["editor", "docs"],
		added: [
			"`roswaal` for macOS on Apple Silicon, built with the Windows one for every release and attached to it. Getting started has the steps for each, with Rokit and from source.",
			"A node from a node pack says so: the node picker marks it **Pack** and names its file, and the Inspector says which pack it came from and shows the Luau it writes.",
		],
		changed: [
			"A zip is unpacked to the sizes its index gives, and no more than 128 MiB in all. A damaged zip says it is damaged.",
			"A place file's chunks are opened to the sizes they could have, and its instances are read as a tree.",
			"Downloads from the Wally registry and from GitHub are read to a limit: 128 MiB for an archive, 4 MiB for a list of versions.",
			"Adding a Wally package checks its name, alias and version before `wally.toml` is changed.",
			"The backup copy of the editor on GitHub Pages opens projects from a .zip or a place, not folders, and lets go of any folder it remembered. Folders open on roswaal.app.",
			"*Creating custom nodes* says that a pack's nodes put their author's Luau into your game.",
		],
		watch: [
			"A Wally version is written as `1.2.3`, `^1.2.3` or `=1.2.3`, which are the forms Roswaal installs from. Anything else is refused with that message.",
		],
	},
	{
		version: "0.145.0",
		date: "2026-10-06",
		headline: "The release notes have a page for each minor version.",
		affects: ["editor", "docs"],
		changed: [
			"The release notes are a page for each minor version: 0.144.x holds 0.144.0 to 0.144.4, with every line saying which release it shipped in. The contents list the newest five, and a versions dropdown reaches every one, with the notes from before Roswaal was public grouped at the bottom.",
			"The release notes' front page shows the newest version in full, and a line each for the four before it.",
			"A version that fixed a security weakness says so: a Security fixes badge on the version, and a Security tag on the release that did.",
			"A link to one release, such as `release-notes.html#v0.119.0`, goes to its version's page with that release's lines marked.",
			"Searching the docs ranks a guide above release notes that only mention what was typed.",
		],
		watch: [
			"The release notes' own search box, filter chips and jump bar are gone. The docs search finds every release, and the dropdown reaches every version.",
		],
	},
	{
		version: "0.144.4",
		security: true,
		date: "2026-10-06",
		headline: "Roswaal keeps to the project it has open.",
		affects: ["editor", "designer"],
		fixed: [
			"On macOS, Show in file manager selects a folder in Finder, as it does a file, rather than opening it.",
		],
		changed: [
			"A symbolic link in a project that leads outside it is not read, written or removed through, and says so. A link that stays inside the project works as before, and so does a project that is itself reached through a link.",
			"`sourceDir`, `outDir` and `nodePaths` in `roswaal.json` must be folders inside the project.",
			"Removing a Wally package only ever removes folders in its `_Index`.",
		],
		watch: [
			"A project whose `roswaal.json` names a folder outside it, or that keeps its graphs or its output behind a link to somewhere else, no longer opens or compiles that way. Move the folder into the project.",
		],
	},
	{
		version: "0.144.3",
		security: true,
		date: "2026-10-06",
		headline: "The website runs scripts from itself only.",
		affects: ["editor", "designer", "docs"],
		changed: [
			"Every page of the website -- the editor, Node Design and the docs -- carries a Content-Security-Policy, the same one the local editor sends: scripts and requests from the site itself, and nothing else.",
		],
	},
	{
		version: "0.144.2",
		security: true,
		date: "2026-10-06",
		headline: "The local editor answers its own pages, and only shows in its own windows.",
		affects: ["editor"],
		changed: [
			"`roswaal serve` answers requests from the pages it serves itself and no others. A page served by another program on this machine -- a notebook, a dev server -- is treated like any other website. In development, the daemon run by `npm run dev` also answers Vite's port.",
			"The local editor cannot be shown inside another site's frame, and loads scripts only from itself.",
		],
	},
	{
		version: "0.144.1",
		security: true,
		date: "2026-10-06",
		headline:
			"Text from a graph lands in the generated Luau as the text it is, and Luau nested too deeply is an error.",
		affects: ["editor"],
		fixed: [
			"A variable's description that runs to more than one line is written as a block comment, as a comment on the graph is, and the graph's name and id stay on their own lines of the file's header.",
			"A path's starting point that is not `game`, `script`, `workspace` or `shared` is looked up as a service by name, so `Workspace` works. A path from one of those four, such as `script.Parent`, is written as before.",
			"A Lune Function whose call is not a function's name is an error rather than being written as it stands.",
			"A comment holding every long-bracket closer up to sixteen `=` gets one more, so it still closes.",
			"Luau nested more than 500 deep -- brackets, blocks, tables or types inside one another -- is reported as an error by checking, completion and Import as graph, which read the rest of the file, instead of stopping them.",
		],
	},
	{
		version: "0.144.0",
		date: "2026-10-06",
		headline: "Every context menu and dropdown is one menu, and works from the keyboard.",
		affects: ["editor", "designer", "docs"],
		added: [
			"Menus work from the keyboard: Up and Down move through what can be chosen, Home and End jump to either end, Enter chooses, and Escape or Tab closes the menu and puts focus back where it was.",
		],
		changed: [
			"Every context menu and dropdown is drawn by one menu, which opens over everything and stays on screen: the project tree's, a pin's, the node palette, a card's ⋯, the open documents, More, Project, and a pack's ⋯ in Node Design.",
			"More's dividers show. They were there, and drawn as nothing.",
			"Menus are divided where their entries are different kinds of thing. The project tree's: making things, then Show in file manager, then Rename and Delete. A pin's: Promote to Variable, then splitting or recombining, then breaking links. More: the project, the graph's tools on a phone, the files, then the other windows. A card's: where it goes, then the card itself, then what is closed. Project: opening, then importing and exporting, then Start again. A pack's: copies, then Show in file manager, then Delete. The node palette sets Comment apart from the nodes, and Node Design's More sets its two pages to read apart from where to go.",
			"Remove package… is the last entry of a package's menu, below the ways to add one, where every other menu keeps its red entry.",
			"A pin's dropdown of known values has a rule above Other…, which turns the pin into a field to type into.",
			"The docs draw More, the Wally menu and the Project menu as the editor draws them, dividers and all. Controls has a section on the menu keys.",
		],
	},
	{
		version: "0.143.6",
		date: "2026-10-06",
		headline: "The project tree's menu opens over the graph, all of it on screen.",
		affects: ["editor"],
		fixed: [
			"Right-clicking anything under Graph Content or Compile Content opened a menu clipped by the Project card: cut off at its edge, and Delete out of sight below it. The menu opens over everything now, and near the bottom or the right of the window it opens on the other side of the pointer, as a native menu does.",
			"Show in file manager fits on one line of that menu.",
		],
	},
	{
		version: "0.143.5",
		date: "2026-10-06",
		headline: "Luau typed into a node not wired in yet is offered its graph's locals.",
		affects: ["editor"],
		fixed: [
			"A Custom Code or Luau Expression not yet wired in offered no locals. It offers its function's parameters, then every other local in its graph, marked in scope once wired. Once it is wired, scope is worked out exactly again.",
		],
	},
	{
		version: "0.143.4",
		date: "2026-10-06",
		headline: "The website's links into the docs open the page they name.",
		affects: ["editor"],
		fixed: [
			"On the website, the Inspector's ? opened the landing page. It opens the node's docs page, as it does under the daemon.",
			"The website's other links to a docs page, from the start screen, Node Design and Ctrl+K, open that page rather than the first one.",
		],
	},
	{
		version: "0.143.3",
		date: "2026-10-06",
		headline: "A call's cast result shows on its pin.",
		affects: ["editor", "docs"],
		changed: [
			"A call whose result is cast shows `:: BasePart` beside its result pin, in the type's colour, so the cast reads on the canvas as a Cast pill does.",
		],
	},
	{
		version: "0.143.2",
		date: "2026-10-06",
		headline: "Code completion follows a path of members.",
		affects: ["editor"],
		fixed: [
			"`hull.Position.` offers a Vector3's members, and a path of any length is followed while each step's type is known, through a property, an event or a child instance the project knows. A colon at its end offers methods.",
		],
	},
	{
		version: "0.143.1",
		date: "2026-10-06",
		headline: "Luau typed into a graph is offered a typed local's members.",
		affects: ["editor"],
		fixed: [
			"After `hull.` or `hull:` in Custom Code or Luau Expression, the members and methods of the local's type are offered, for named results, Declare Locals, parameters, script variables and loop variables. A cast result counts as its cast type.",
			"Loop variables are offered by name too.",
		],
	},
	{
		version: "0.143.0",
		date: "2026-10-06",
		headline: "Import as graph has settings, and an overwrite shows what changes first.",
		affects: ["editor", "docs"],
		added: [
			"The import prompt asks what file-level locals become: script variables, declared where they were by Initialize Variable, or Declare Locals.",
			"It asks how the graph reads: Tidy, Verbatim or Modern. Every mode behaves the same. Modern writes `a and b or c` as an if-expression where the middle can never be false or nil.",
			"The report lists likely bugs in the original, such as `x and false or y`, which never gives false. They are left as written.",
			"A file that requires `@lune/` modules is imported for Lune. When the project is for Roblox, the prompt asks which.",
			"Overwriting a file Roswaal did not write shows the lines that change, and asks before writing.",
		],
		changed: ["File-level locals become script variables unless the import says otherwise."],
	},
	{
		version: "0.142.1",
		date: "2026-10-06",
		headline: "Cast result reads as optional until it is set.",
		affects: ["editor", "docs"],
		changed: [
			"Cast result shows a dashed No cast, as an optional pin shows default. Clicking it opens the type list, and × beside the chosen type removes the cast.",
		],
	},
	{
		version: "0.142.0",
		date: "2026-10-06",
		headline: "A node can go into a data wire, and a call can cast its result.",
		affects: ["editor", "docs"],
		added: [
			"Pick up a wire off a data input, drop it on empty space and choose a node: it goes in between, the value feeding it and it feeding the input. Nodes that fit both ends come first, and a step also joins the reader's chain when there is one way in.",
			"Cast result, in the Inspector of a call with one result, writes `call(...) :: Type`. The result pin and its named local take that type, including on Script Function calls to local functions.",
			"Import as graph reads a cast on a call to a known function, `need(...) :: BasePart`, as that call with Cast result set.",
		],
	},
	{
		version: "0.141.2",
		date: "2026-10-06",
		headline: "Import as graph names its risks before it starts.",
		affects: ["editor", "docs"],
		changed: [
			"Import as graph asks first, listing what a conversion cannot promise: the same behaviour, the original's comments and formatting, and checks on what stays as Luau text.",
		],
	},
	{
		version: "0.141.1",
		date: "2026-10-06",
		headline: "Luau typed into a graph can see its named results.",
		affects: ["editor"],
		fixed: [
			"Custom Code and Luau Expression offer the named results before them, and a method's self, as they type.",
			"A named result always declares its local. Folded into a Declare Local straight after it, the name did not exist for Luau further down to read.",
		],
	},
	{
		version: "0.141.0",
		date: "2026-10-06",
		headline: "Declare Function can declare a method.",
		affects: ["editor", "docs"],
		added: [
			"Declare Function's **On Table as** sets `T:name` for a method, written `function Tank:aim(target)`. Its graph gains a self output, and Get Parameter offers self.",
			"Script Function calls a method with a colon, in its own script and through a required module.",
			"Import as graph reads `function T:m()` as a method instead of keeping it as code.",
		],
	},
	{
		version: "0.140.0",
		date: "2026-10-06",
		headline: "A .luau file can be imported as a graph.",
		affects: ["editor", "docs"],
		added: [
			"Right-click a `.luau` you wrote in the Project panel for **Import as graph**. It opens a new graph that compiles back to that file, and says how many statements became nodes.",
			"Locals, `if`, the three loops, functions with their parameters and returns, calls, field writes and a module's `return` become their nodes. What has no node yet, such as a type, stays as its own code in a Custom Code or Luau Expression node.",
			"The `.luau` file is not changed. Compiling over it asks for force, as for any file Roswaal did not write, and a graph already at the import's path is never replaced.",
		],
		changed: ["A loop variable named `_` keeps that name in the generated Luau."],
	},
	{
		version: "0.139.3",
		date: "2026-10-06",
		headline: "Typing a type's name in the node menu offers a Cast to it.",
		affects: ["editor", "docs"],
		changed: [
			"Type a type's name into the node menu, as `Motor6D` off a value, and it offers Cast to Motor6D, with its Type already set.",
		],
	},
	{
		version: "0.139.2",
		date: "2026-10-06",
		headline: "Make Dictionary's new rows follow the row above.",
		affects: ["editor"],
		changed: [
			"A row added to Make Dictionary arrives as the row above it is: whole, taking a Key Value Pair, after a recombined row, and split into Key and Value otherwise.",
		],
	},
	{
		version: "0.139.1",
		date: "2026-10-06",
		headline: "Key Value Pair's Value picker and field are one height.",
		affects: ["editor"],
		fixed: [
			"The Value picker in Key Value Pair's Inspector is the height of the field beside it, and only as wide as what it says, leaving the field the room to type in.",
		],
	},
	{
		version: "0.139.0",
		date: "2026-10-06",
		headline: "Key Value Pair's value can be a local or a variable, picked from a list.",
		affects: ["editor"],
		added: [
			"Key Value Pair's Value opens a picker: String, Number, Boolean, Luau or nil to type in, and the locals, named results and variables this graph can see. Picking one places its Get beside the pair and wires it in.",
		],
		changed: ["While Value is wired, the field names what is wired into it."],
	},
	{
		version: "0.138.4",
		date: "2026-10-06",
		headline: "Dynamic compiling no longer undoes an edit you just made.",
		affects: ["editor"],
		fixed: [
			"With Dynamic compiling, an open graph could take an older copy of its own file back from disk, so a recombined pin came apart on its own and a wire being dragged lost the pin it was going to land on. A graph now knows its recent saves, ignores news of a file it is still saving, and waits for a wire or the menu it was dropped into before taking a change from disk.",
		],
	},
	{
		version: "0.138.3",
		date: "2026-10-06",
		headline: "A named result shows in its node's header.",
		affects: ["editor", "docs"],
		changed: [
			"A call with a Result name and no Label of its own is titled with both, as need (leftTrack). A node that already shows the result name under its header keeps it there.",
		],
	},
	{
		version: "0.138.2",
		date: "2026-10-05",
		headline: "Off a pin, the node menu offers the value before its members.",
		affects: ["editor", "docs"],
		fixed: [
			"Searching the node menu off a pin lists Get and a local's name before that local's members, and a result of exactly the pin's type before one that only connects.",
			"Members the pin cannot take, such as a boolean property for an Instance pin, are no longer offered.",
		],
	},
	{
		version: "0.138.1",
		date: "2026-10-05",
		headline: "Go to a local from the Variables panel.",
		affects: ["editor", "docs"],
		changed: [
			"Double-click a local in the Variables panel, or `Ctrl` + click it, to go to the node that declares it, brought into view.",
			"A named result's result tag is drawn in the type's quiet colour, so its name reads first.",
		],
	},
	{
		version: "0.138.0",
		date: "2026-10-05",
		headline: "A step's named result is a local you can read by name.",
		affects: ["editor", "docs"],
		added: [
			"A step with a Result name is listed under Locals in the Variables panel, and the node search offers Get and its name. Get Local reads it wherever it is in scope, with no wire back to the call.",
		],
	},
	{
		version: "0.137.1",
		date: "2026-10-05",
		headline: "Saving into a folder in the browser stops failing while you work.",
		affects: ["editor"],
		fixed: [
			"In the browser, with a folder open, a file read just as it was being written is read again rather than failing. Placing nodes quickly with Dynamic compiling no longer reports Could not save.",
			"A long path in an error wraps inside its window rather than running out of it.",
		],
		changed: [
			"A save that does fail says so in a notice at the top of the window. Click it for the full error.",
		],
	},
	{
		version: "0.137.0",
		date: "2026-10-05",
		headline: "A node dragged off a wired execution output goes in between.",
		affects: ["editor", "docs"],
		added: [
			"Drag off an execution output that is already wired, drop on empty space and pick a node: it goes in between, leading on to the next step from Then, Then 0 on a Sequence, or Completed on a loop.",
			"Hold `Ctrl` as you drop a wire on empty space to pick the node from the node picker instead of the menu.",
		],
	},
	{
		version: "0.136.1",
		date: "2026-10-05",
		headline: "Roswaal Types reviewed again.",
		affects: ["docs"],
		changed: ["Roswaal Types is marked as last reviewed on 5 October 2026."],
	},
	{
		version: "0.136.0",
		date: "2026-10-05",
		headline: "Class as String.",
		affects: ["editor", "docs"],
		added: [
			'**Class as String**, beside Type as String: an Instance class picked from the engine\'s classes, as a string such as `"Model"`, for any argument that takes a class name.',
		],
	},
	{
		version: "0.135.0",
		date: "2026-10-05",
		headline: "ClassName, and a Result name declares its local.",
		affects: ["editor", "docs"],
		added: [
			"ClassName in the type picker for parameters, returns and pins: written as `string`, and every pin of that type offers the engine's classes.",
			"A Result name declares its local even when nothing reads the result yet. Call Function, Call Method and the Service and Lune Function steps have the field too.",
		],
		fixed: [
			"A tab with unsaved edits shows one dot beside its name, rather than a second one after its close button.",
		],
	},
	{
		version: "0.134.0",
		date: "2026-10-05",
		headline: "Calls take their arguments from the function wired in, and any input can be typed.",
		affects: ["editor", "docs"],
		added: [
			"Call Function and Call For Value wired from a Get Function, or a declaration's Function output, take that function's parameters as named, typed pins, and its first return as the result's type. The pins follow the signature when it changes.",
			"An input a node declares `any` can be given a type under Pins in the Inspector. It wires, colours and takes a typed-in value as that type; the Luau written does not change.",
		],
		fixed: ["An optional argument left empty at the end of Call For Value is left off the call."],
	},
	{
		version: "0.133.1",
		date: "2026-10-05",
		headline: "The Luau logo stays on the canary for now.",
		affects: ["editor", "docs"],
		changed: [
			"Only the canary draws `.luau` files with the Luau logo. The stable build keeps the code file icon, and its Settings → Licences and Attributions say so.",
		],
	},
	{
		version: "0.133.0",
		date: "2026-10-05",
		headline: "Call a function by its name, with a pin for each parameter.",
		affects: ["editor", "docs"],
		added: [
			"**Script Function**, a step and a value. Type a function's name into the node search and Call need places one, with need's parameters as named, typed pins and its return values as outputs.",
			"A required module's exported functions are offered the same way, as Call Config.read.",
			"The pins follow the function's signature. Rename, reorder or remove a parameter and the wires move with it.",
			"On the canary, `.luau` files in the Project panel, tabs and DataModel wear the Luau logo, in the colour of the script they become, and Settings → Licences carries its licence.",
		],
		fixed: [
			"Call For Value's arguments grow and shrink from its header and the Inspector, as Call Function's do.",
		],
	},
	{
		version: "0.132.4",
		date: "2026-10-04",
		headline: "The pin's settings in the new style, and deleting a node asks in a window.",
		affects: ["designer", "docs"],
		changed: [
			"The selected pin's settings are drawn as the Inspector's panels are: a head with the pin's name and side, bold labels beside their fields, and the pin's moves in a foot.",
			"Deleting a node in Node Design asks in a window rather than in the top row.",
		],
		fixed: [
			"The pin's settings no longer run off the foot of the column on a tablet held upright; their fields scroll inside the card.",
			"On a tablet held upright, the pin types start after the logic's tools rather than under them.",
		],
	},
	{
		version: "0.132.3",
		date: "2026-10-04",
		headline: "Node Design's bottom row lines up, and slimmer pin steppers.",
		affects: ["designer"],
		changed: ["The Inputs and Outputs steppers under the node's plate are slimmer."],
		fixed: [
			"Node Design's undo and redo row sits above the bottom toolbars wherever it shows, a tablet with a trackpad included, rather than on the pin types.",
			"The pin types start beside the logic's tools rather than cut off at Execution.",
			"Written in Luau, the pin types line up with Logic's switch on the bottom row, and the Luau sheet comes down to just above them.",
		],
	},
	{
		version: "0.132.2",
		date: "2026-10-04",
		headline: "Node Design's action row above the pin types on a tablet.",
		affects: ["designer"],
		fixed: [
			"On a tablet, the pin types are Node Design's bottom row, beside the logic's tools, and the undo and redo row sits above them rather than under them.",
		],
	},
	{
		version: "0.132.1",
		date: "2026-10-04",
		headline: "Node Design held upright, and Contents the height of its neighbours.",
		affects: ["designer", "docs"],
		changed: [
			"Node Design on a tablet held upright, or in a window taller than it is wide: the node runs across the top and the Luau sheet takes the whole width beneath it.",
		],
		fixed: ["The docs' Contents button is the height of the buttons beside it on a tablet."],
	},
	{
		version: "0.132.0",
		date: "2026-10-04",
		headline: "Shift+click opens or closes everything inside.",
		affects: ["editor", "docs"],
		added: [
			"**Shift+click a folder** in the Project panel, or an instance's arrow in DataModel, to open or close it with everything inside it, as in Studio's Explorer.",
		],
	},
	{
		version: "0.131.2",
		date: "2026-10-04",
		headline:
			"Node Design on a tablet: the type palette and the Luau sheet clear their neighbours.",
		affects: ["designer"],
		fixed: [
			"On a tablet, the pin types sit at the foot of the window, and rise clear of the action row only while the logic is nodes, home indicator included.",
			"On a tablet, the Luau sheet starts below the bar naming the pack and node, rather than under it.",
		],
	},
	{
		version: "0.131.1",
		date: "2026-10-04",
		headline: "Walkthrough pictures fill their frame.",
		affects: ["docs"],
		fixed: [
			"A walkthrough step showing the top row draws the canvas grid behind the whole row, not a strip beside it, and folds its buttons to their glyphs to fit.",
			"Nodemap basics draws the map panel at the column's width, so steps 2 to 7 no longer scroll sideways.",
		],
	},
	{
		version: "0.131.0",
		date: "2026-10-04",
		headline: "Prompts redrawn, and the tablet drawer brought into line.",
		affects: ["editor", "docs"],
		added: [
			"**A prompt says what it is about**: Delete lists what goes by name, and a graph changed on disk names its file.",
			"**Prompts name their keys**: Enter to confirm and Esc to cancel, at the foot.",
		],
		changed: [
			"Every prompt has a header with a badge in the colour of the question: the accent to make or open something, red to delete, amber when something needs deciding, grey for a notice. Close is at its end.",
			"Fields in a prompt sit beside bold labels, and New graph, New node map and New folder say under the name where it will be made.",
			"In a form, one of several is a row to pick, and the picked one is tinted.",
			"On a tablet, the Project and Variables drawer has its panels as tabs in its header, as a card does on a computer.",
			"The Project panel's lines under open folders start from the first folder, and stop short of a graph's own fold.",
		],
		fixed: [
			"The list of open tabs opens on an iPad and an iPhone.",
			"A choice between three answers no longer clips its buttons.",
		],
	},
	{
		version: "0.130.1",
		date: "2026-10-04",
		headline: "The docs' drawn Variables panel, tidied.",
		affects: ["docs"],
		fixed: [
			"In the docs' drawing of the Variables panel, the card's header no longer covers the edge of the lit section around it.",
		],
	},
	{
		version: "0.130.0",
		date: "2026-10-04",
		headline: "The panels redrawn: section headings, fields and the type picker.",
		affects: ["editor", "docs"],
		added: [
			"**The type picker lists its groups down the side**: press one to go to it. On a phone the list is left out.",
			"**Fold a section** of the Inspector, Properties or the type picker from its heading.",
			"**Roswaal types** draws each type with its wire colour.",
		],
		changed: [
			"Section headings in the Inspector, Properties, the Project panel, Variables and the type picker are the section's name in the accent colour, with a count and a line running on from it.",
			"The Inspector and Properties show what is selected as its name and kind beside a badge in its colour. The docs link is a button.",
			"In the Inspector a one-line field sits beside its label, and a parameter, field or return shows its wire colour, its type in the code face, and a remove that turns red on hover.",
			"Pins show their wire colour, filled going in and hollow coming out, with the type as a chip.",
			"Text fields are set into their panel, with an accent ring while you type. A read-only field has a dashed edge.",
			"Properties: values a weight above their names, references as a chip, true and false as a box, and Close is the card's ×.",
			"The Project panel: Graph Content and Compile Content, lines under open folders, a tinted selection, the open document in bold, and generated files no longer in italics.",
			"Script analysis shows No problems with a tick, or its counts as red and amber chips. Each entry leads with a mark.",
		],
		fixed: [
			"Properties shows code in a class's description as code rather than between backticks.",
			"The first step of the node map walkthrough no longer cuts off the end of the top row.",
		],
	},
	{
		version: "0.129.0",
		date: "2026-10-04",
		headline: "Building a node map, step by step.",
		affects: ["docs"],
		added: [
			"**Nodemap basics is a walkthrough**, as Getting started is: a map built from New node map to Write project file, with the panel drawn as it stands at each step and the control to press ringed.",
		],
		changed: [
			"The interactive map panel and its legend are under Building a node map.",
			"The Toolbars page draws a node map's tab in With a node map open.",
		],
	},
	{
		version: "0.128.0",
		date: "2026-10-04",
		headline: "Drag an instance from the DataModel into Custom Code.",
		affects: ["editor", "docs"],
		added: [
			'**Drop an instance into Custom Code** and the Luau that reaches it is written where you let go. On a blank line it is a whole local, such as local Tank = game:GetService("ReplicatedStorage").Tank; anywhere else, the path alone.',
			"**Properties and attributes drop too**, as the property read or a GetAttribute call.",
		],
		changed: [
			"While a code editor is open, the DataModel and Properties stay above it, and the editor moves aside to clear them.",
		],
	},
	{
		version: "0.127.0",
		date: "2026-10-04",
		headline: "Node maps and Luau files open in tabs of their own.",
		affects: ["editor", "docs"],
		added: [
			"**Node maps, Luau files and .luaurc files open in tabs** beside the graphs, instead of in place of them.",
			"**Every tab shows what it is**: the document icon for a graph, ƒ for a function, the node map icon, and Luau's script icon in the colour of the script it becomes.",
			"**Resize a node map's tree and Inspector** by dragging the line between them; double-click it to put it back. On a phone the line moves up and down.",
		],
		changed: [
			"A node map's tab is named after its file.",
			"Node maps with unsaved edits are all saved, not only the one in front.",
		],
		fixed: ["Opening a node map with two or more graphs open no longer closes all but the first."],
	},
	{
		version: "0.126.0",
		date: "2026-10-04",
		headline: "The release notes, easier to search and to link to.",
		affects: ["docs"],
		added: [
			"**Search the release notes**, and filter them by Added, Changed, Fixed or Breaking, and by Editor, Node Design or Docs. Folds holding a match open; clearing the search closes them again.",
			"**Jump to** a range of ten minor versions, such as 0.110–0.119.",
			"**Every release has its own link**, such as release-notes.html#v0.119.0. The front page's Lately cards use them.",
			"**New since your last visit**: releases newer than the last one this browser saw are marked New.",
		],
		changed: [
			"The latest release is a card at the top of the page, and every older one sits in its minor version's fold, which says what that version brought while closed.",
			"Each release is a card, with its entries as rows rather than a bordered table.",
		],
	},
	{
		version: "0.125.0",
		date: "2026-10-04",
		headline: "The front page, brought up to date.",
		affects: ["docs"],
		added: [
			"**The front page wears the windows' floating chrome**: the mark, Docs, Release notes, Source and Try it, still there once you scroll.",
			"**Three examples** to switch between: a player joining, a loop, and reading a file with Lune. Each is a docs graph beside the Luau it compiles to.",
			"**Lately**: the latest minor releases from the release notes, eight on a computer and six on a tablet or phone.",
			"**Works with what you have**: Rojo, place files, Wally, Lune, your own Luau modules and stylua, each linked to its docs page.",
			"**Inside the editor** adds On Event, places and Rojo projects, and panels that float and dock, and each card names the version it arrived in.",
		],
		changed: [
			"Try it and Getting started are in the banner, with Roblox, Lune, the licence and the devices under them.",
			"The feature cards are drawn as nodes, and the planned ones as dashed nodes not yet placed.",
			"The cards say stylua formats the output when it is installed.",
			"On a phone the example graph's frame is shorter, and the banner's graph is left out.",
		],
		fixed: ["What is planned no longer lists event nodes for instances, which shipped in 0.119.0."],
	},
	{
		version: "0.124.0",
		date: "2026-10-04",
		headline: "A new start page, and a new node packs page.",
		affects: ["editor", "designer", "docs"],
		added: [
			"**The start page** wears the floating chrome the other windows do, with Docs and Node Design in reach before a project is open.",
			"**Recent projects are cards**: what each compiles for, how many graphs it has, and when it was last opened. A project that has gone says so. Past five, a filter.",
			"**The demos are on the start page**, to take a copy of.",
			"**Node packs: one search** over packs and the nodes in them. Press `/` to search.",
			"**Node packs: a filters card**, for this project's packs, the built-in ones, and what they run on.",
			"**Click a pack to look inside**: its nodes are listed beside the packs, each one to open. Double-click, Enter or **Open pack** opens the pack.",
			"**A pack's card shows its nodes** in their colours, and has **New node**. The rest is in its menu.",
			"**Each section folds** from beside its count.",
		],
		changed: [
			"The path field says what is there as you type, with the project's runtime and graph count.",
			"When the daemon is not answering, the start page shows `roswaal serve`, ready to copy.",
			"Node packs' cards are solid and tinted, over the canvas grid.",
			"Deleting a pack asks in a dialog.",
			"Node Design draws the canvas grid behind Luau logic, as it does behind nodes.",
			"In Node Design on a computer, or a tablet held sideways, the Luau and Nodes switch is beside Details in the top row.",
			"Under the node's plate, each side shows its pin count between its − and + buttons.",
		],
	},
	{
		version: "0.123.0",
		date: "2026-10-04",
		headline: "A synced folder follows its node map path.",
		affects: ["editor", "docs"],
		added: [
			"**Changing an entry's path in a node map moves its folder** on the next compile: the folder Rojo syncs and the graphs that compile there go to the new path, and the graphs compile there. Open graphs follow. Into a folder that already has files, the editor asks first, and `roswaal compile` takes `--merge`.",
			"**Script analysis lists unsynced graphs**: a graph whose Luau goes to a folder no node map syncs, such as after its entry was removed.",
			"**Dynamic mode covers node maps**: saving one rewrites its project file. Folders are moved and made by the map's own compile, so a path still being typed moves nothing.",
		],
		changed: [
			"**Compile project** writes the node maps before the graphs, in the editor and in `roswaal compile`.",
		],
	},
	{
		version: "0.122.3",
		date: "2026-10-04",
		headline: "The published docs' mark sits in its group.",
		affects: ["docs"],
		fixed: [
			"**The mark on the published docs** is drawn as the Docs window draws it, the height of the groups beside it, where it had kept its old chip's border inside the new group.",
		],
	},
	{
		version: "0.122.2",
		date: "2026-10-04",
		headline: "The published docs float their contents, as the Docs window does.",
		affects: ["docs", "editor"],
		changed: [
			"**The published docs** have the Docs window's layout: floating groups along the top with the search beside the mark, and the contents and the outline as cards over the page that fold away and say where you are.",
			"**A card's header controls** are a size smaller, so they sit inside the header rather than filling it.",
		],
	},
	{
		version: "0.122.1",
		date: "2026-10-04",
		headline: "A dragged card docks only near an edge.",
		affects: ["editor"],
		fixed: [
			"**A dragged card offers to dock** only within a short reach of the window's edge, or over that dock's own column. It offered from a fifth of the way across.",
			"**The outline of a dock** a card would land in is drawn where the dock would be, under the top row and above the status pill.",
		],
	},
	{
		version: "0.122.0",
		date: "2026-10-04",
		headline: "Cards share their dock, take tabs, and say which one you are in.",
		affects: ["editor", "docs"],
		added: [
			"**Every card has a header**: its title, what its panel puts there (the project's name and Files | DataModel, Variables' Add), a fold, and a menu. The card you last used has its header lit.",
			"**Tabs.** Drop a card on another card's header and they share it as tabs. Drag one tab out to move it on its own.",
			"**Cards share their dock's height.** Drag the line between two to trade height between them; double-click it to share it evenly. A card alone in its dock is as tall as what it shows.",
			"**Drop a card above or below another**, by its upper or lower half, as well as at an edge or onto the graph.",
			"**A card's menu** moves it without dragging, separates a tab, folds it, closes it, and shows a closed panel again.",
			"**A window resizes from any edge or corner.**",
		],
		changed: [
			"**Double-clicking a card's header** folds it to the header.",
			"**The docs' drawings** of the editor, the Project panel and the Variables panel show the cards' headers, and [Controls](controls) lists the new gestures.",
		],
	},
	{
		version: "0.121.3",
		date: "2026-10-04",
		headline: "Phones and tablets get their room back.",
		affects: ["editor", "designer", "docs"],
		changed: [
			"**The canary** is marked by its yellow mark alone: the banner across its editor, Node Design and docs is gone.",
			"**On a phone**, a node map, a source file and the aliases are one column the width of the screen, ending above the status pill. Source files and the selection preview wrap long lines.",
			"**On a phone or a tablet**, the status pill is one row when there is nothing to report, and the side strip keeps clear of it and of the top row. On a short screen the strip leaves out its slider.",
			"**On a tablet**, Compile project and Compile script show their glyphs where the top row is short of room.",
			"**The docs' header** is one row on a phone.",
			"**Node Design on a phone** draws the node smaller where it would not fit across the screen.",
		],
		fixed: [
			"**Text on an iPhone** is no longer enlarged in places, such as the selection preview's notes.",
			"**The pin counts under a node** stay on one line with a touch screen's larger buttons.",
			"**The docs' window diagrams** keep the device's own button size, fit a phone's column, and no longer draw over the contents drawer.",
		],
	},
	{
		version: "0.121.2",
		date: "2026-10-04",
		headline: "Getting started steps through the whole window.",
		affects: ["docs", "editor"],
		changed: [
			"**Getting started** steps through drawings of the whole window, at the width of the page: the editor, its projects panel, the Project menu and the start page, on a computer or a tablet.",
			"**Node Design's pictures** on [The interface](the-interface) draw the node on its plate, and the problems line where a phone has it, under the pack bar.",
		],
		fixed: [
			"**No number on a window diagram** is drawn under a card or over another number.",
			"**The start page** names a recent project by its folder, where on Windows it showed the whole path twice.",
		],
	},
	{
		version: "0.121.1",
		date: "2026-10-04",
		headline: "The docs' window diagrams fill their column.",
		affects: ["docs"],
		changed: [
			"**The window diagrams** on [The interface](the-interface) fill the width of the page, and the desktop stands on a monitor. A lit part has a bolder outline, and every number sits above what it labels.",
			"**The editor's top row** on [Toolbars](toolbars) fits the page: where it is short of room, Compile project and Compile script show their icons, as the editor does in a narrow window.",
		],
	},
	{
		version: "0.121.0",
		date: "2026-10-04",
		headline: "Every window floats its controls over the work.",
		affects: ["editor", "designer", "docs"],
		added: [
			"**The graph fills the window.** The top bar and the graph's tools are one row of floating groups: the project and the open graph at the left, compiling and the other windows at the right. Where the row is short of room, the less used half folds into More.",
			"**Project, Variables and the Inspector are cards** over the graph, with the status pill below them. On a tablet they open from the top groups and close when you tap the graph; on a phone they are sheets from a bar along the bottom.",
			"**The side strip**: zoom, undo, redo and fit, along the bottom with a mouse and down the left edge on a touch screen.",
			"**Two fingers tapped on the graph undo, and three redo.**",
			"**Notices** drop from the top of the window and say what happened: what a compile wrote, a wire that was refused.",
			"**With nothing selected, the Inspector shows the graph's settings**: what it compiles to, its type checking and its target, which have left the toolbar.",
			"**Node Design** floats too: the logic fills the window, the node's preview is a card in the top right that folds away, with the selected pin's settings and the node's details under it, and the pin types dock at the bottom right.",
			"**The docs window's search** is beside the mark.",
		],
		changed: [
			"**A node map, a source file and the aliases** open as a sheet on the canvas, between the cards.",
			"**On a phone**, the mark carries the window's glyph in grey: a graph, the palette, or a page.",
			"**Switches** are lit with a tint rather than filled, as a held tool is.",
			"**The docs window's contents and outline** are cards over the page that fold to where you are, and the page scrolls the whole width. Scrollbars are thin everywhere.",
			"[The interface](the-interface), [Toolbars](toolbars) and [Controls](controls) draw and describe the new layout.",
			"**Name in the graph tools** is gone from Settings: the graph's tab names it.",
		],
	},
	{
		version: "0.120.1",
		date: "2026-10-04",
		headline: "Plain folders are grey, and DataModel drags onto a graph.",
		affects: ["editor", "docs"],
		changed: [
			"**Plain folders** in the project tree and the DataModel list are grey rather than cream. Blue, purple and red are left for services, packages and place/.",
		],
		fixed: [
			"**An instance in the DataModel list** can be dragged onto a graph for an Instance node at its path, as its name in Properties could.",
		],
	},
	{
		version: "0.120.0",
		date: "2026-10-04",
		headline: "A node map makes the folders it syncs.",
		affects: ["editor", "docs"],
		added: [
			"**Writing a node map makes the folders it syncs**: each folder under src the map points at, and the folder mirroring it under .roswaal/scripts, so a graph has somewhere to go. The Status panel lists what was made, and the map's Path field says made on compile until then.",
		],
		changed: [
			"**Folders a node map syncs** are drawn filled, plain ones outlined: blue for a service or container, cream for a Folder. Under Graph content, the folder mirroring one is drawn as it is.",
			"**Corners, shadows and text sizes** outside the canvas follow one scale: three corners, three shadows and seven text sizes.",
		],
		fixed: [
			"**Removing the last script in a folder a map syncs** leaves the folder, rather than turning the map's next write into an error.",
		],
	},
];
