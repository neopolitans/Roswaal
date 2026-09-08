# The M103, as node graphs

The same tank as [`../native/`](../native/), built in Roswaal instead of typed.
**This is the test.** The hand-written version is the baseline it gets compared
against; the question this project exists to answer is whether a Roswaal graph
can express a real vehicle controller, and how it reads when it does.

Empty as of 8 September 2026. Scaffolding only — no graphs yet.

## What is here

```
roswaal.json                    hot reload, graphs in .roswaal/scripts, Luau out to src
.roswaal/scripts/Tank.nodemap   the DataModel tree; generates default.project.json
.roswaal/nodes/                 empty, for node packs this project needs
```

`Tank.nodemap` puts everything exactly where the native version puts it —
`ReplicatedStorage.Tank`, `ServerScriptService`, `StarterPlayer.StarterPlayerScripts`
— so the two are **drop-in alternatives**. Sync one or the other into the place;
syncing both would land two tanks' worth of scripts on top of each other.

## Running it

```
roswaal serve examples/m103/graph
rojo serve examples/m103/graph/default.project.json
```

The map's three "not on disk" complaints are correct and expected until the
first graph compiles: `src/` does not exist yet because nothing has generated it.

## What to build, and roughly in what order

Taken from the native version, smallest first, so that something is running
before anything is hard:

1. **`Config`** — read `MovementSpeed` out of the model's `Configuration`.
   One value, one graph, and it proves instance paths work.
2. **`Rig`** — find the parts and joints. Mostly `FindFirstChild` and errors.
3. **`Occupancy`** — hide the driver, remember what to put back. The first
   graph that needs a table keyed by instance.
4. **`TankServer`** — the prompt, who is driving, and the frame: drive, aim,
   scroll. The big one.
5. **`TankClient`** — the orbit camera and the controls.

The eleven questions the native README ends with are what to watch for while
building these, and the answers go in
[the conversion log](../../../docs/demo/CONVERSION-LOG.md).

**Two are worth settling before writing much:** whether a joint node writes
`C0` or `Transform` (only one of them replicates — the log has it), and whether
script variables can carry per-frame accumulated state comfortably. Both change
the shape of everything after them.
