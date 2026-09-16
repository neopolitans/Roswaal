/**
 * The figure prints the project file a second time, and must not disagree.
 *
 * `mapFigure.ts` re-prints what `compileNodeMap` writes, line by line, so each
 * line can carry the node it came from and the two halves of the figure can be
 * linked. That is a second printer for one format, which is the arrangement
 * that goes quietly stale — a `$` key added to `buildTree` would appear in
 * every generated project file and in none of the documentation drawing them.
 *
 * So every case here is checked both ways: the figure's lines joined back into
 * a string must equal `compileNodeMap(map).json` exactly, and every line that
 * belongs to a node must name a node the tree actually has.
 */

import { describe, expect, it } from "vitest";

import {
	compileNodeMap, isFilesystemMap, type MapNode, type NodeMap,
} from "../src/core/nodemap.js";
import { figureText, mapFigure } from "../src/core/docs/mapFigure.js";
import { allPages, buildSite, type Block } from "../src/core/docs/site.js";
import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";

let next = 0;
const id = () => `n${++next}`;

function node(name: string, extra: Partial<MapNode> = {}): MapNode {
	return { id: id(), name, children: [], ...extra };
}

function map(root: MapNode, extra: Partial<NodeMap> = {}): NodeMap {
	return {
		schemaVersion: 1,
		kind: "map",
		id: id(),
		name: "Project",
		output: "default.project.json",
		root,
		...extra,
	};
}

/** Every id in the tree, for checking a line cannot point at nothing. */
function ids(root: MapNode): Set<string> {
	const out = new Set<string>();
	const visit = (n: MapNode) => {
		out.add(n.id);
		n.children.forEach(visit);
	};
	visit(root);
	return out;
}

const CASES: Array<[string, NodeMap]> = [
	["an empty DataModel", map(node("DataModel", { className: "DataModel" }))],
	[
		"a service with a path",
		map(
			node("DataModel", {
				className: "DataModel",
				children: [node("ServerScriptService", { children: [node("Shared", { path: "src" })] })],
			}),
		),
	],
	[
		"a folder implied by its path",
		map(
			node("DataModel", {
				className: "DataModel",
				children: [
					node("ReplicatedStorage", {
						children: [node("Shared", { className: "Folder", path: "src/Shared" })],
					}),
				],
			}),
		),
	],
	[
		"properties, ignores and globs",
		map(
			node("DataModel", {
				className: "DataModel",
				children: [
					node("Workspace", {
						ignoreUnknown: true,
						children: [
							node("Rig", {
								className: "Model",
								path: "src/Rig",
								properties: { Anchored: true, Name: "Rig" },
								ignorePaths: ["*.spec.luau"],
							}),
						],
					}),
				],
			}),
			{ globIgnorePaths: ["**/*.md"] },
		),
	],
	[
		"a class with characters JSON has to escape",
		map(
			node("DataModel", {
				className: "DataModel",
				children: [node('He said "hi"', { className: "Folder" })],
			}),
		),
	],
];

describe("a map figure prints what the compiler writes", () => {
	it.each(CASES)("%s", (_name, one) => {
		expect(figureText(mapFigure(one))).toBe(compileNodeMap(one).json);
	});

	it.each(CASES)("%s keys every line to a real node", (_name, one) => {
		const known = ids(one.root);
		for (const line of mapFigure(one).lines) {
			if (line.key !== undefined) expect(known).toContain(line.key);
		}
	});

	it.each(CASES)("%s gives every node a row", (_name, one) => {
		const rows = mapFigure(one).rows.map((r) => r.key);
		expect(new Set(rows)).toEqual(ids(one.root));
	});
});

describe("a filesystem map draws the disk", () => {
	const fs = map(
		node("project", {
			children: [
				node("main", { file: true }),
				node("lib", { children: [node("parse", { file: true })] }),
			],
		}),
		{ target: "lune", name: "Tool" },
	);

	const figure = mapFigure(fs);

	it("writes no project file", () => {
		expect(compileNodeMap(fs).json).toBe("");
		expect(figure.target).toBe("lune");
	});

	it("puts the extension on the disk side, never in the name", () => {
		const disk = figure.lines.map((l) => l.text);
		expect(disk).toEqual(["main.luau", "lib/", "lib/parse.luau"]);
		expect(figure.rows.map((r) => r.name)).toEqual(["project", "main", "lib", "parse"]);
	});

	it("names what reaches each file, and only files", () => {
		const notes = figure.lines.map((l) => l.note);
		expect(notes).toEqual(['require("./main")', undefined, 'require("./lib/parse")']);
	});

	it("leaves the root off the disk, because it is the disk", () => {
		expect(figure.lines.some((l) => l.key === fs.root.id)).toBe(false);
	});
});

/**
 * The same promise, held against the maps actually published.
 *
 * The cases above are written to exercise the printer; these are the maps a
 * reader sees. A page drawing a project file that Roswaal would not write is
 * the failure this whole module is arranged to prevent, so it is checked where
 * it would happen rather than only where it is convenient.
 */
describe("every map drawn in the documentation", () => {
	const site = buildSite(createRegistry(), new Set(BUILTIN_NODES.map((d) => d.id)));

	/** Depth-first through `details` and `tabs`, which nest blocks. */
	function mapsIn(blocks: Block[]): NodeMap[] {
		const out: NodeMap[] = [];
		for (const block of blocks) {
			if (block.t === "nodemap") out.push(block.map);
			else if (block.t === "details") out.push(...mapsIn(block.blocks));
			else if (block.t === "tabs") {
				for (const tab of block.tabs) out.push(...mapsIn(tab.blocks));
			}
		}
		return out;
	}

	const drawn = allPages(site).flatMap((page) =>
		mapsIn(page.blocks).map((one) => [page.slug, one] as const),
	);

	it("is actually drawing some", () => {
		expect(drawn.length).toBeGreaterThan(0);
	});

	it.each(drawn)("%s prints what the compiler writes", (_slug, one) => {
		// A filesystem map writes no project file, so there is no string to
		// round-trip against -- the right-hand column is the disk, and what it
		// must not do is claim a file is written. Checked as the other half of
		// the same promise rather than skipped.
		if (isFilesystemMap(one)) {
			expect(compileNodeMap(one).json).toBe("");
			expect(mapFigure(one).target).toBe("lune");
			return;
		}
		expect(figureText(mapFigure(one))).toBe(compileNodeMap(one).json);
	});

	it.each(drawn)("%s compiles without an error of its own", (_slug, one) => {
		const bad = compileNodeMap(one).diagnostics.filter((d) => d.severity === "error");
		expect(bad.map((d) => d.message)).toEqual([]);
	});
});
