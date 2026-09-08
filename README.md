# Roswaal

Visual scripting for Roblox Luau and Lune Luau. Graphs live on disk as
`.nodescript` files and compile to plain `.luau` that Rojo syncs like any other
source file.

Roswaal is licensed **0BSD**: use it, modify it, ship it, train on it, no
attribution required. Two bundled things keep their own terms — the icons
(Material Symbols, Apache-2.0) and CodeMirror (MIT); see [NOTICE.md](NOTICE.md).

> Prototype. The compiler and its tests are the load-bearing parts and are
> solid; the editor is complete enough to build real graphs with. See
> [Known gaps](#known-gaps) for what is not there yet.

## Who this is for

Developers moving from Unreal Engine to Roblox. Many arrive fluent in a
language already — C++, or Verse — but a good number come over with primarily
*visual scripting* experience and land in front of a text editor. Roswaal
exists to shorten that gap.

It is also meant to be something you can move off. The Luau it writes is
ordinary Luau, so switching to writing it by hand is a step you take when you
are ready rather than one forced on you at the start.

So where it can be familiar without being worse, it is: two kinds of wire, pin
colours that line up with the ones you know, and menu wording you would
recognise from Unreal — the entry you already know should be the entry you
find. Every place that happens is deliberate, and the
[Coming from Blueprints](docs) page exists to make the mapping explicit rather
than something you have to discover.

**Unreal Engine, Unreal and Blueprint are trademarks of Epic Games, Inc.** They
appear here to name Epic's product while explaining this one, which is the only
thing they are used for. Roswaal is not affiliated with, endorsed by, or derived
from Epic Games; it contains no Unreal Engine code and is not built with Unreal
Engine. See [NOTICE.md](NOTICE.md).

## Why it is not a Studio plugin

Studio plugins have no filesystem access, and the whole design here is
file-first — `.nodescript` files in the repository, a Rojo tree, custom node
packs on disk. So Roswaal is an external tool that writes `.luau` into your
existing source tree and lets **Rojo** do the syncing it already does well.

```
.roswaal/scripts/*.nodescript  →  roswaal  →  src/*.luau  →  rojo  →  Studio
```

Nothing has to be taught about Studio, and generated files behave like the rest
of your repository: they diff, they review, they merge.

## Install

```sh
git clone https://github.com/neopolitans/Roswaal
cd Roswaal
npm install
npm run build
```

Then put `bin/` on your PATH:

```powershell
# Windows (PowerShell)
$roswaal = "C:\path\to\Roswaal\bin"
$path    = [Environment]::GetEnvironmentVariable('PATH','User')
[Environment]::SetEnvironmentVariable('PATH', "$path;$roswaal", 'User')
```

```sh
# macOS / Linux
export PATH="$PATH:/path/to/Roswaal/bin"
```

⚠️ PATH changes only apply to terminals opened afterwards.

`bin/roswaal` and `bin/roswaal.cmd` are shell scripts that invoke Node, **not**
a packaged executable — deliberately. Windows Smart App Control blocks unsigned
binaries it has not seen before, so every rebuild of a `roswaal.exe` would be
blocked afresh. A script calling an already-trusted interpreter sidesteps that
entirely and costs nothing on the platforms that would not have cared.

## Commands

```
roswaal init              create roswaal.json and .roswaal/ in this project
roswaal serve             start the daemon and serve the editor. Blocks.
roswaal stop              stop a running daemon
roswaal restart           stop, then serve again
roswaal status            is a daemon running here, and what is it serving?
roswaal compile [path]    compile every graph and map once and exit
roswaal watch             recompile on change, without the editor. Blocks.
roswaal prune             remove generated files whose graph has moved or gone
roswaal check             one-shot probe. Plain output, good for scripts.
roswaal help
```

| Option | |
| --- | --- |
| `--root <path>` | Project directory. Default: the current directory. |
| `--port <n>` | HTTP port for the daemon. Default: 4471. |
| `--force` | For compile: overwrite generated files edited by hand. |
| `--no-open` | For serve: skip the editor-URL hint. |
| `--yes` | For prune: actually delete, rather than just listing. |

Shaped after Rojo's CLI, and after [Beako](https://github.com/neopolitans/Beako)'s, on purpose: `roswaal serve` in a
project directory should feel like `rojo serve` does, because it sits beside it
in the same workflow and a tool that invents its own conventions makes you learn
twice.

`stop` and `restart` reach the daemon over HTTP rather than through a PID file:
no stale pid to reason about when a daemon dies unexpectedly, and no divergence
between Windows and everything else. `stop` never claims success it has not
observed — success means the health probe went quiet, not that the request was
sent.

There is a working example in [`examples/demo`](examples/demo); `cd` into it and
run `roswaal serve`.

### For development

```sh
npm run dev      # daemon on :4471, editor on :4470 with hot module reload
npm test         # compiler and parser tests
```

## The graph model

Two kinds of wire, as in Unreal's Blueprints:

- **Execution** wires define statement order. Nodes that start or end a flow —
  Script Start, Script End, Function, Return, Module Exports, Break, Continue —
  are red, whatever category they belong to.
- **Data** wires define expressions and are typed. Pin colours follow Unreal's
  where the types line up, so a Blueprints developer can read a graph by colour
  without being told the mapping: red is a boolean, green a number, magenta a
  string, blue an object, gold a vector.

A wire whose ends disagree about type is a coercion — an `any` landing on a
function pin, say — and it is drawn as a gradient between the two colours, held
flat near each end so the pins still read as themselves. Hovering names the
conversion. Without it, two `any` wires crossing are indistinguishable and you
are left guessing which one narrows to what.

Nodes are **pure** (no exec pins, inlined at the use site) or **impure** (emits
a statement). Two rules do most of the work in the emitter:

1. A pure value with one consumer is spliced into its use site. With two or
   more it is bound to a local, so the expression is evaluated exactly once no
   matter how many wires leave the pin.
2. Bindings are scoped to the block that produced them. Reading a loop variable
   from outside its loop is reported as a diagnostic rather than silently
   emitting code that does not compile.

Diagnostics come from running the real compiler in the browser against the
in-memory graph, so they update as you wire. The daemon is asked only to put
files on disk — same compiler, one source of truth.

### Variables and locals

Two different things, deliberately named apart:

- A **variable** is declared once in the Variables panel and read or written by
  Get and Set nodes anywhere in the graph, exactly as in Blueprints. It compiles
  to a file-level local, so functions and the main flow both see it. Drag one
  onto the canvas for a Get node, or hold Ctrl for a Set.
- A **local** (`Declare Local`) binds a value mid-flow and only exists inside
  the block that declared it. You reach it by wiring its output, not by name.

A variable read is never hoisted. Unlike a pure expression it has to happen at
its use site, or a Set sitting between two Gets would be invisible to the
second one.

Getters — Get Variable, Get Function — are drawn as Unreal's compact capsule
rather than a full node. The shape alone says "this is a value, not a step".
Pure nodes of every kind carry a green left edge, the same signal Unreal's
green tint gives.

**Get Service** is pure, and hoisted. `GetService` is idempotent and cached by
Roblox, so calling it mid-flow buys nothing; asking for a service anywhere in
the graph produces one top-level local, below the flags, exactly where a
hand-written Roblox file puts it:

```lua
--!strict
-- Generated by Roswaal ...

local Players = game:GetService("Players")

Players.PlayerAdded:Connect(function(player: Instance)
	print("Welcome, " .. player.Name)
end)
```

Asking twice for the same service reuses the one local. The service is picked
from a dropdown — Roblox adds them rarely — but the list is suggestions, not a
gate: pick "Other..." and type a name the build has not caught up with, and it
still compiles.

### Splitting a value into its parts

Right-click a pin for the things you can do to *that pin*, rather than the node
palette. The wording is Unreal's, because the entry you already know should be
called what you already call it:

| Entry | When it shows |
| --- | --- |
| **Promote to Variable** | On an unwired data input. The new variable takes the value already typed into the pin, so tuning is not thrown away. |
| **Split Struct Pin** | On a `Vector2`, `Vector3`, `CFrame`, `Color3`, `UDim` or `UDim2` pin. |
| **Recombine Struct Pin** | On any component of a split pin. |
| **Break Link(s)** | When the pin is wired. |

Splitting replaces one pin with one per component, named after their parent —
`Look At` split on both positions reads `From X`, `From Y`, `From Z`, `To X`…
rather than six anonymous numbers. Components take their own type's colour, so
a split `CFrame` shows a gold `Position` and an orange `Rotation`.

`CFrame` offers three decompositions: **Position, Rotation** (the usual one),
**Position and axes** (position with Right and Up — what aiming a turret wants),
and **12 components**, which is what `CFrame.new` and `GetComponents()` actually
take.

Two things worth knowing about how it compiles:

- A split **input** is rebuilt from its components, and a component left alone
  contributes its default — there is no half a `Vector3`.
- A split **output** is bound to a local first, then each component is read off
  it. Reading three parts calls the source once, not three times.

Splitting is per-node configuration, so two `Look At` nodes in one graph can be
split differently. It is also applied by the registry rather than by a node, so
a **custom node pack gets it for free** — a pack's `Vector3` input splits like
any built-in, without the pack knowing splitting exists.

### Reaching instances and modules

Two path nodes, both pure, so neither needs an execution wire:

- **Instance** takes a root (a service, or `game` / `script` / `workspace`) and
  a dotted path, and compiles to plain indexing. Segments that are not valid
  identifiers get bracketed for you, so `Main Menu.Button 1` becomes
  `workspace["Main Menu"]["Button 1"]`.
- **Require Module** takes the same root and path and is hoisted like a
  service, because `require` is cached by Roblox too. Requiring the same module
  from three nodes still produces one local.

**Get Field** reads anything off a value — a module export, a table key, an
instance property — and **Call Function** / **Call Method** invoke it, with the
argument count set per node in the inspector rather than fixed at one.

Together that is the whole shape of an ordinary Roblox script:

```lua
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Greeter = require(ReplicatedStorage.Shared.Greeter)

-- How many players have joined since the server started.
local playersJoined: number = 0

Players.PlayerAdded:Connect(function(player: Instance)
	local result = Greeter.greet(player.Name)
	print(result)
	playersJoined = playersJoined + 1
end)
```

That is the generated output of [`examples/demo`](examples/demo), start to
finish.

### Functions and modules

A Function node shows its name on the title line and its signature underneath.
Editing its returns walks the function's execution subtree and updates the
Return nodes it finds, so the signature and the graph cannot drift apart
silently. **Get Function** gives you the function as a value from anywhere,
with no wire back to the entry node.

A ModuleScript ends at a **Module Exports** node. Each input pin becomes a key
on the returned table; a single pin left with its default name returns that
value directly, which is what a module exporting one function or one class
wants.

## Engine types

Every Roblox datatype lives under one category, **Engine types**, with a
subcategory for each: `Vector3`, `Vector2`, `CFrame`, `Color3`, `BrickColor`,
`UDim`, `UDim2`, `TweenInfo` and `Tween`. The node menu groups two levels deep
there, and the documentation gives each type its own section.

Grouping them does not make them look alike — a node is coloured by its
*datatype*, so a graph doing CFrame work and a graph doing colour work still
read differently at a glance.

A few things worth knowing:

- **Colour converts both ways between all four forms.** RGB 0–255, RGB float
  0–1, HSV and hex, in and out. `Color3 To RGB` rounds to whole channels;
  `Color3 To RGB Float` gives you what the engine actually stores.
- **`BrickColor` is not a `Color3`** and the two are not interchangeable. Read
  `.Color` to get the Color3 behind the name. Its float constructor takes 0–1,
  not 0–255 — the one place BrickColor disagrees with the colour picker.
- **Tweening goes end to end**: a TweenInfo, Create Tween, Play / Pause /
  Cancel, and the Completed signal, so a graph can wait for a tween rather than
  guessing at a delay. **Tween Property** is the shorthand for animating one
  property; for several, wire in a table.
- **Break nodes** exist for Vector3, Vector2, UDim and CFrame's Euler angles.
  Splitting the pin does the same job in less room — these are here because a
  Break node is what a Blueprints hand reaches for first.

## The two file formats

| Extension | Contents |
| --- | --- |
| `.nodescript` | one compiled unit: a Script, LocalScript, or ModuleScript |
| `.nodemap` | an instance hierarchy, compiled to a Rojo project file |
| `.nodedef.luau` / `.nodedef.json` | a custom node pack |

A `.nodescript` is one compiled unit; a `.nodemap` is where those units live in
the DataModel. The split earns itself because the two answer different questions
and change at different rates — a graph changes constantly, the tree it sits in
changes when the project is reorganised.

A node map is edited as a tree with the generated project JSON shown beside it,
since that JSON is the thing you would otherwise be hand-editing. Each instance
takes **ignore paths** — globs under its own path that Rojo should skip, which
is how you stop a nested mapping syncing the same files twice. Rojo only has a
project-level `globIgnorePaths`, so a glob written on a folder is anchored to
that folder on the way out.

A `$path` that points at nothing is the trap worth knowing about: Rojo builds an
empty instance rather than complaining, so you find out in Studio. Roswaal
flags an unresolved path in the editor as you type it, and refuses to compile
the map without saying so. Folders in the
project tree are the other half of the same feature: a directory under
`sourceDir` mirrors one under `outDir`, and Rojo turns that into a Folder
instance.

Unlike generated Luau, a project file is not hash-guarded — it is small,
frequently hand-tuned, and Rojo rewrites it itself. An existing file Roswaal did
not write is refused outright rather than compared, and a `$roswaalGeneratedFrom`
key records ownership inside the document, since JSON has no comments and the
marker has to survive Rojo rewriting the file.

## Generated output

```lua
--!strict
-- Generated by Roswaal. Do not edit this file directly;
-- edit Greeter.nodescript and recompile instead.
-- roswaal-graph: demo-greeter
-- roswaal-source: ac1f9e25ee7e4884
-- roswaal-output: a0f363f025b189ff

local function greet(who: string): string
	return "Hello, " .. who
end

return {
	greet = greet,
}
```

`roswaal-source` hashes the *semantics* of the graph — node positions are
deliberately excluded, so tidying up a layout never shows as a diff in compiled
files. `roswaal-output` hashes the emitted body: if a generated file no longer
matches its own hash, somebody edited it by hand, and Roswaal refuses to
overwrite it until you pass `--force`.

Emission also produces a line-to-node source map, so a runtime error at line 42
can be traced back to the node that emitted it.

The emitter does not try to be a pretty-printer. It produces correct Luau and
pipes it through **StyLua** when that is available, so output matches whatever
formatting the rest of your codebase already uses (`rokit add stylua`).

### File naming

Rojo decides what a file becomes from its extension, so the script class is
encoded in the output name:

| Script class | Output |
| --- | --- |
| `ModuleScript` | `Name.luau` |
| `Script` | `Name.server.luau` |
| `Script` + client run context | `Name.client.luau` |
| `LocalScript` | `Name.client.luau` |

## Compile modes

**Manual** — compile the open document (`Ctrl+S`, or the toolbar) or the whole
project.

**Hot reload** — the daemon watches the graph directory and recompiles what
changes. It is the same `compileScript()` the manual button calls, so the two
cannot drift. The watcher earns its place by catching changes Roswaal did not
make: switching branches, pulling, or editing a `.nodescript` in another tool
all regenerate the Luau, and the editor is told over an event stream. Hot mode
still refuses to overwrite hand-edited generated files.

## Custom nodes

Node packs live in `.roswaal/nodes/` and may be written in **Luau** or JSON.
Luau is the friendlier of the two — it is what you already write, and it can
carry comments. `roswaal init` writes a commented example to start from.

```lua
return {
	nodes = {
		{
			id = "combat.knockback",
			title = "Apply Knockback",
			category = "Combat",
			inputs = {
				{ id = "in", kind = "exec" },
				{ id = "character", name = "Character", kind = "data", type = "Instance" },
				{ id = "force", name = "Force", kind = "data", type = "Vector3" },
			},
			outputs = { { id = "then", kind = "exec" } },
			compilesTo = {
				kind = "statement",
				template = "$in.character.HumanoidRootPart:ApplyImpulse($in.force)",
			},
		},
	},
}
```

**A Luau pack is parsed, never executed.** Only literal values are allowed —
strings, numbers, booleans, nil and tables — so a function call in a pack is a
parse error with a line number rather than somebody else's code running every
time you open a project.

Three template kinds:

| kind | shape | emits |
| --- | --- | --- |
| `expr` | pure, no exec pins | one expression per output pin |
| `call` | impure, one value | `local x = <template>` |
| `statement` | impure, any outputs | the template as statements |

Placeholders:

| placeholder | meaning |
| --- | --- |
| `$in.<pin>` | the resolved input expression, parenthesised if precedence needs it |
| `$out.<pin>` | the local this output was bound to |
| `$in.<pin>!ident` | an unconnected literal, sanitised to a Luau identifier |
| `$in.<pin>!raw` | an unconnected literal, inserted verbatim |

Pin defaults may be written plainly — `default = 5`, `default = "Part"` — rather
than as a tagged `{ t = "number", v = 5 }`. The tagged form is still there, and
is the only way to write a `raw` default.

Packs cannot use the fourth compile kind, `builtin`. That is reserved for the
flow nodes that open blocks, and keeping it closed means loading a third-party
node pack never executes third-party code. The entire standard library outside
those flow nodes is written with the same three templates a pack gets, which is
what keeps the template language honest.

## Hand-written Luau

**Custom Code** and **Luau Expression** nodes hold code that is emitted
verbatim. Clicking the code preview on the node opens a pop-out editor with:

- **Luau highlighting**, not Lua's. `continue`, `export type`, compound
  assignment, integer division and backtick interpolation all colour correctly,
  and Luau's own globals are tinted apart from names you chose.
- **Completion** over Luau's globals and libraries *and* the names this graph
  puts in scope — its variables, its functions, the services it hoists, the
  modules it requires, and the locals declared by Custom Code blocks that run
  before this one. Those are invisible from inside the box otherwise, which is
  how a Custom Code node ends up referring to something that is not there.
  Scope is worked out by walking execution wires backwards, and it respects
  Luau's blocks: a local declared inside a loop body, a branch arm or a Connect
  handler dies at its `end` and is not offered outside it, while an outer local
  *is* offered inside one, because that is an upvalue.
- **Errors marked three ways**, because each answers a different question at a
  different distance: a gutter marker says there is a problem, a wash across the
  line says which line, and a squiggle with a tooltip says what.

The check is the same one that runs on every compile, so the editor cannot
disagree with the build. It reports against the node holding the code, because
an unclosed string in a small box otherwise breaks the generated file somewhere
you never wrote.

## Controls

| | |
| --- | --- |
| Right-click canvas | node palette, spawns at the cursor |
| Drag from a pin | make a wire; drop on empty space to open the palette |
| Drag a wired input | pick the existing wire up and rewire it |
| Alt-click a wire | sever it |
| Double-click a wire | add a reroute knot where you clicked |
| Shift-click a pin | disconnect everything on it |
| Middle-drag, or Alt-drag | pan |
| Wheel | zoom about the cursor |
| Drag on empty canvas | marquee select |
| Shift/Ctrl-click | add to or toggle the selection |
| Shift-drag a node | snap it to the grid; a selection keeps its shape |
| Drag a variable onto the canvas | Get node, or Set with Ctrl held |
| Drag a comment bar | move the comment and everything inside it |
| Double-click a comment bar | rename |
| Right-click the project tree | show in file manager, new folder, rename, delete |
| `C` | wrap the selection in a comment |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` / `Ctrl+D` | copy, cut, paste, duplicate |
| `Ctrl+Z` / `Ctrl+Shift+Z` | undo, redo |
| `Ctrl+A`, `Delete` | select all, delete |
| `Ctrl+Shift+L` | tidy the graph into columns — selection only, if several are selected |
| `Ctrl+S` | compile the open document |

The **Help** button in the toolbar covers the same ground from inside the app,
which is where the questions actually come up.

A **reroute knot** is a bend in a wire and nothing else: it compiles to no code
at all, and it is transparent to the hoisting rule, so inserting one never turns
a value that was bound once into one evaluated twice. **Realign** ranks nodes by
how far they are from something with no inputs and lays them out in columns,
re-fitting comments around whatever they held.

Comment membership is captured when a drag begins rather than tracked, which is
how Unreal behaves: a node that was inside the comment travels with it, and one
dragged out is simply out — there is no stale membership list to reconcile.

## Project layout

`roswaal.json` at the repository root:

```json
{
  "schemaVersion": 1,
  "target": "roblox",
  "sourceDir": ".roswaal/scripts",
  "outDir": "src",
  "compileMode": "manual",
  "nodePaths": [".roswaal/nodes"],
  "format": true,
  "rojoProject": "default.project.json"
}
```

Graphs live under `.roswaal/` so they never collide with the Rojo tree. Unlike
some tools' dot-directories, `.roswaal/` is **meant to be committed** — it is
your source.

Everything in that file is editable from **Settings** in the toolbar, alongside
the preferences that are *yours* rather than the project's. The two are kept
visibly apart, because they behave differently: `roswaal.json` is committed and
shared by everyone on the repository, while preferences live in your browser and
never appear in a diff.

## How the graph looks

Two preferences that change nothing about what a graph means, and exist because
people have already modified Unreal's Blueprint UI to get them:

- **Wire style** — *Curved* (the default bezier), *Rigid* (right angles only),
  or *Angular* (the same route with each corner cut to a 45-degree slope). The
  two rigid styles are one router drawn two ways, so switching restyles a wire
  rather than moving it.
- **Node corners** — rounded or square. Capsule getters and reroute knots keep
  their shapes either way: a pill and a circle are what say *this is a value*
  and *this is a bend in the wire*, and neither has a title to say it instead.

## Themes

Seven schemes ship: Roswaal Light and Dark, Tokyo Night, Tokyo Night Storm,
Catppuccin Mocha, Nord, and Aquatic. The default follows your operating system.

Each is one JSON file in [`themes/`](themes), in the same format
[Beako](https://github.com/neopolitans/Beako) uses, so a theme written for one
tool reads in the other. `npm run build:themes` compiles them in and refuses a
palette that would not work — an unreadable text colour, a node the same colour
as the canvas, or a scheme whose `dark` flag disagrees with its own background,
which would make every hover state invisible.

Three of the seven are somebody else's design and are MIT licensed. Their
licences are copied byte for byte into [`notices/upstream/`](notices/upstream)
and shown in full under **Settings → Licences**; see [NOTICE.md](NOTICE.md).

**A theme cannot recolour a pin or a node category, on purpose.** Red is a
boolean, green is a number, gold is a vector — that mapping is most of what
makes a graph readable to somebody arriving from Blueprints, and it is worth
more than the ability to restyle it.

## Known gaps

Honest list of what the prototype does not do yet.

- **No Luau import.** Existing `.luau` opens read-only in the tree. To bring
  existing code into a graph, wrap it in a Custom Code or Luau Expression node.
  Parsing Luau back into a graph is a parser plus a lowering pass and was
  deliberately out of scope.
- **The node map editor has no drag-to-reparent** and its undo is a button
  rather than `Ctrl+Z`; the graph canvas has the full history.
- **The project tree has no marquee select.** Shift-range and Ctrl-toggle work,
  as does dragging files between directories.
- **No source-map wiring in the UI.** The compiler emits a line-to-node map, but
  nothing yet feeds Studio's runtime errors back into the canvas. That is the
  natural next step, and the reason a thin Studio plugin might eventually earn
  its place.
- **Wildcard pins do not propagate.** `wildcard` connects to anything but does
  not adopt the type it was wired to.
- **No per-node breakpoints or debugging.**

## Development

```
src/core/       schema, node registry, compiler — no DOM, no Node APIs
src/core/nodes/ flow builtins, variables, and the templated standard library
src/cli/        the roswaal command line
src/server/     the daemon: filesystem, compile pipeline, hot reload
src/app/        the React editor
themes/         one JSON file per colour scheme
notices/        vendored upstream licences, copied byte for byte
tests/          golden tests: graph in, Luau out
examples/demo/  a small project you can open
```

`src/core` is imported verbatim by both the daemon and the browser. When adding
a node, prefer the templated library over a `builtin` handler — if a template
cannot express it, that is usually a sign the node wants to open a block, and
those are the only ones that belong in `src/core/nodes/flow.ts`.

Two further documents, for anyone picking this up:

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — the module map, the
  invariants each layer holds, how one node becomes Luau, and where to cut in
  to add a node or a canvas gesture.
- **[NOTES.md](NOTES.md)** — the working state of the prototype: what is done,
  what is next, decisions worth not re-litigating, and the traps that cost real
  time to find.
