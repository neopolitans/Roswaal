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
roswaal check             one-shot probe. Plain output, good for scripts.
roswaal help
```

| Option | |
| --- | --- |
| `--root <path>` | Project directory. Default: the current directory. |
| `--port <n>` | HTTP port for the daemon. Default: 4471. |
| `--force` | For compile: overwrite generated files edited by hand. |
| `--no-open` | For serve: skip the editor-URL hint. |

Shaped after Rojo's CLI, and after beako's, on purpose: `roswaal serve` in a
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
since that JSON is the thing you would otherwise be hand-editing. Folders in the
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
verbatim. They open a pop-out editor with syntax highlighting, line numbers and
a structural check that runs as you type — brackets, strings, comments and
block keywords — because an unclosed string in a small box otherwise breaks the
generated file somewhere you never wrote. The same check runs on every compile
and reports against the node holding the code.

## Controls

| | |
| --- | --- |
| Right-click canvas | node palette, spawns at the cursor |
| Drag from a pin | make a wire; drop on empty space to open the palette |
| Drag a wired input | pick the existing wire up and rewire it |
| Alt-click a wire | sever it |
| Middle-drag, or Alt-drag | pan |
| Wheel | zoom about the cursor |
| Drag on empty canvas | marquee select |
| Shift/Ctrl-click | add to or toggle the selection |
| Drag a variable onto the canvas | Get node, or Set with Ctrl held |
| Drag a comment bar | move the comment and everything inside it |
| Double-click a comment bar | rename |
| Right-click the project tree | show in file manager, new folder, rename, delete |
| `C` | wrap the selection in a comment |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` / `Ctrl+D` | copy, cut, paste, duplicate |
| `Ctrl+Z` / `Ctrl+Shift+Z` | undo, redo |
| `Ctrl+A`, `Delete` | select all, delete |
| `Ctrl+S` | compile the open document |

The **Help** button in the toolbar covers the same ground from inside the app,
which is where the questions actually come up.

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
- **No reroute nodes**, and no per-node breakpoints or debugging.

## Development

```
src/core/       schema, node registry, compiler — no DOM, no Node APIs
src/core/nodes/ flow builtins, variables, and the templated standard library
src/cli/        the roswaal command line
src/server/     the daemon: filesystem, compile pipeline, hot reload
src/app/        the React editor
tests/          golden tests: graph in, Luau out
examples/demo/  a small project you can open
```

`src/core` is imported verbatim by both the daemon and the browser. When adding
a node, prefer the templated library over a `builtin` handler — if a template
cannot express it, that is usually a sign the node wants to open a block, and
those are the only ones that belong in `src/core/nodes/flow.ts`.
