/**
 * The Project panel's import entries (0.177.0, 0.178.0).
 *
 * A hand-written `.luau` offers Import as graph, and Reimport as graph once it
 * has one. Several rows selected, or a folder, offer to import every
 * hand-written file among them; generated Luau never offers either.
 */

import { describe, expect, it } from "vitest";

import { fileMenu, type TreeMenuContext } from "../src/app/treeMenus.js";

const host: TreeMenuContext = {
	holdsGraphs: false,
	canImport: true,
	canGithub: false,
	canReveal: false,
	notHere: "",
};

const labels = (entry: Parameters<typeof fileMenu>[0], ctx: Partial<TreeMenuContext> = {}) =>
	fileMenu(entry, { ...host, ...ctx })
		.flat()
		.map((e) => e.label);

describe("the import entries", () => {
	it("import a hand-written file, and import it again once it has a graph", () => {
		expect(labels({ kind: "luau" })).toContain("Import as graph");
		expect(labels({ kind: "luau", graph: ".roswaal/scripts/G.nodescript" })).toContain(
			"Reimport as graph",
		);
		expect(labels({ kind: "luau", generatedFrom: "G.nodescript" })).not.toContain(
			"Import as graph",
		);
	});

	it("import a selection, or a folder, when hand-written Luau is in it", () => {
		expect(labels({ kind: "luau" }, { importMany: { from: "selection", files: 3 } })).toContain(
			"Import selection as graphs",
		);
		expect(labels({ kind: "directory" }, { importMany: { from: "folder", files: 2 } })).toContain(
			"Import folder as graphs",
		);
		expect(
			labels({ kind: "directory" }, { importMany: { from: "folder", files: 0 } }),
		).not.toContain("Import folder as graphs");
		expect(
			labels({ kind: "directory" }, { canImport: false, importMany: { from: "folder", files: 2 } }),
		).not.toContain("Import folder as graphs");
	});
});
