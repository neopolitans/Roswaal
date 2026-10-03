/**
 * The `lune-demos` page of the documentation. `buildSite` places it.
 */

import { DEMOS, demoLuau } from "../demos.js";
import type { Block, DocPage, PageContext } from "../site.js";
import { declarationsPanel } from "../toolbars.js";

/**
 * The demos page: four small Lune programmes, drawn and compiled.
 *
 * Generated from `DEMOS` rather than written out, for the reason the node
 * reference is: the Luau under each picture is what the emitter produces from
 * the graph above it, so the two cannot end up describing different programs
 * and a demo that stopped compiling fails the build.
 */
export function luneDemosPage({ registry }: PageContext): DocPage {
	const blocks: Block[] = [
		{
			t: "p",
			text:
				"Four programmes somebody writes first, each one a graph and the file it " +
				"compiles to. They are small on purpose: the point is the shape, and the " +
				"shortest version of a shape is the one you can take away.",
		},
		{
			t: "note",
			kind: "info",
			text:
				"**Every require here was placed by hand**; an undeclared module is an error, not a " +
				"guess. See [Modules](modules) and [Lune's standard library](lune-library).",
		},
	];

	for (const demo of DEMOS) {
		blocks.push({ t: "h", level: 2, text: demo.title });
		blocks.push({ t: "p", text: demo.what });
		const script = demo.script();
		blocks.push({
			t: "graph",
			script,
			// What it declares, beside it. A drawn graph shows `fs.readFile`
			// and not where `fs` came from, and where it came from is the whole
			// rule the Lune library rests on.
			panel: declarationsPanel(script),
			caption: "The graph this was compiled from, and what it declares.",
		});
		blocks.push({ t: "code", lang: "luau", text: demoLuau(demo, registry) });
		if (demo.note) blocks.push({ t: "note", kind: "info", text: demo.note });
		if (demo.warns) blocks.push({ t: "note", kind: "warn", text: demo.warns });
	}

	blocks.push({ t: "h", level: 2, text: "Running one" });
	blocks.push({
		t: "p",
		text:
			"Compile the graph, then run the file — `lune run count-characters`. Roswaal " +
			"writes the `.luau` and stops there; what runs it is Lune. Where the file lands, " +
			"and what checks that the layout holds together, is on " +
			"[Compiling and nodemaps for Lune](compiling-for-lune).",
	});
	blocks.push({
		t: "note",
		kind: "warn",
		text:
			"**These are starting points.** None checks whether the file exists, the request " +
			"succeeded or the JSON has the field — a real version would.",
	});

	return {
		slug: "lune-demos",
		// Not `narrow`. A prose measure is right for a page of sentences and
		// wrong for one that is mostly pictures of seven-column graphs: capped
		// at 78ch every one of them was drawn at half size to fit.
		title: "Lune demos",
		summary: "Four small programmes: read a file, fetch JSON, walk a directory, take an argument.",
		// No `runtime` tag: that is a node page's, and this is a guide. The
		// badge answers "what does this node need", and nobody asked that of a
		// page whose title already says Lune.
		blocks,
	};
}
