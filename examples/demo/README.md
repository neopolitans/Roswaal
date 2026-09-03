# Roswaal demo

A small, complete project: two graphs, a node map, two custom node packs, and
the Luau they compile to. Everything here is generated from the `.roswaal`
directory except this file and `.gitignore`.

```sh
roswaal serve      # editor at http://127.0.0.1:4471
rojo serve         # sync the generated Luau into Studio
```

Or compile once without the editor:

```sh
roswaal compile
```

## What it demonstrates

**`Main.nodescript`** — a server Script. It gets the Players service, connects
to `PlayerAdded`, requires a shared module by path, calls into it, and counts
joins in a script variable. That covers most of the node vocabulary in one
readable graph.

**`shared/Greeter.nodescript`** — a ModuleScript. It lives in a folder, so it
compiles to `src/shared/Greeter.luau`, which is what lets `Main` require it at
`ReplicatedStorage.Shared.Greeter`.

**`Game.nodemap`** — the DataModel hierarchy, compiled to `default.project.json`.
It is what maps `src` to `ServerScriptService.Source` and `src/shared` to
`ReplicatedStorage.Shared`. Delete it and the require path stops resolving;
that is the point of the format.

**`.roswaal/nodes/`** — two custom node packs, one written in Luau and one in
JSON, to show both formats. Neither is executed; they are parsed as data.

## The chain worth following

```
.roswaal/scripts/shared/Greeter.nodescript
  → src/shared/Greeter.luau           roswaal compile
  → ReplicatedStorage.Shared.Greeter  Game.nodemap → Rojo
```

That third step is why `Require Module` in `Main` can say
`ReplicatedStorage` + `Shared.Greeter` and have it mean something.

## A note on generated files

`src/**.luau` and `default.project.json` are compiled output, committed here so
the example reads without running anything. Each generated file carries a hash
of itself; edit one by hand and Roswaal will refuse to overwrite it until you
pass `--force`. Ownership of the project file is tracked in
`.roswaal/generated.json`, because JSON has nowhere to put a comment.
