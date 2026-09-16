# Lune demos

Four small programmes, one graph each. They are the same four drawn on the
**Lune demos** page in Roswaal's documentation — this project is generated from
them, so what you open here is what that page shows.

```sh
roswaal serve      # the editor
lune run greet -- world
```

Or compile once without the editor:

```sh
roswaal compile
```

## What is here

**`count-characters`** — Open a file, and say how long it is.

**`fetch-json`** — Ask an HTTP API for something, and pull one value out of the answer.

**`walk-a-directory`** — List what is in a folder, and say which entries are folders themselves.

**`greet`** — Take an argument, and say what to do when it is missing.

## What they are not

Starting points. None of them checks whether the file was there, whether the
request came back, or whether the JSON had the field — which a real version
would, and which would have doubled the size of every one.
