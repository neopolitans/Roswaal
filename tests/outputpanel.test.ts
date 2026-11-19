/**
 * Output in the Project panel: it starts inside the output folder, as Graphs
 * starts inside the graphs' folder, marks what needs a look, folds folders of
 * generated Luau to a count, and counts only what it marks.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { TreeEntry } from "../src/app/api.js";
import { ProjectTree, type ProjectTreeProps } from "../src/app/ProjectTree.jsx";

const dir = (path: string, children: TreeEntry[], more: Partial<TreeEntry> = {}): TreeEntry => ({
	path,
	name: path.split("/").pop() ?? path,
	kind: "directory",
	children,
	...more,
});
const file = (path: string, kind: TreeEntry["kind"], more: Partial<TreeEntry> = {}): TreeEntry => ({
	path,
	name: path.split("/").pop() ?? path,
	kind,
	...more,
});

const TREE: TreeEntry[] = [
	dir(".roswaal", [dir(".roswaal/scripts", [])]),
	dir("src", [
		dir("src/ReplicatedStorage", [
			file("src/ReplicatedStorage/A.luau", "luau", { generatedFrom: "a" }),
			file("src/ReplicatedStorage/B.luau", "luau", { generatedFrom: "b" }),
		]),
		dir("src/ServerScriptService", [
			file("src/ServerScriptService/Main.server.luau", "luau", { generatedFrom: "m" }),
			file("src/ServerScriptService/Helpers.luau", "luau"),
			file("src/ServerScriptService/Old.luau", "luau", { generatedFrom: "gone" }),
			file("src/ServerScriptService/Weapons.luau", "luau", { graph: "w" }),
		]),
	]),
	dir("place", [file("place/Lobby.server.luau", "luau")]),
	file(".luaurc", "luaurc"),
];

const noop = () => {};
const render = (more: Partial<ProjectTreeProps> = {}) =>
	renderToStaticMarkup(
		createElement(ProjectTree, {
			tree: TREE,
			openPath: null,
			openGraph: null,
			outline: new Map(),
			onOpenFunction: noop,
			sourceDir: ".roswaal/scripts",
			outDir: "src",
			nodePaths: [],
			targetDir: null,
			onTargetDir: noop,
			onOpen: noop,
			onNewGraph: noop,
			onNewMap: noop,
			onNewFolder: noop,
			onRename: noop,
			onDelete: noop,
			onReveal: noop,
			onMove: noop,
			stale: ["src/ServerScriptService/Old.luau"],
			...more,
		} as ProjectTreeProps),
	);

const rowOf = (html: string, path: string) => {
	const at = html.indexOf(`data-entry="${path}"`);
	if (at === -1) return "";
	return html.slice(html.lastIndexOf("<div", at), html.indexOf("</div>", at));
};

describe("Output", () => {
	it("starts inside the output folder, with what is outside it after", () => {
		const html = render();
		expect(html).not.toContain('data-entry="src"');
		expect(html).toContain('data-entry="src/ServerScriptService"');
		expect(html).toContain('data-entry="place"');
		expect(html).toContain('data-entry=".luaurc"');
	});

	it("folds a folder of generated Luau to a count, and leaves its files out until opened", () => {
		const html = render();
		expect(rowOf(html, "src/ReplicatedStorage")).toContain(">2 generated<");
		expect(html).not.toContain('data-entry="src/ReplicatedStorage/A.luau"');
	});

	it("marks what needs a look, and leaves generated Luau unmarked and quieter", () => {
		const html = render();
		expect(rowOf(html, "src/ServerScriptService/Old.luau")).toContain(">stale<");
		expect(rowOf(html, "src/ServerScriptService/Helpers.luau")).toContain(">hand-written<");
		expect(rowOf(html, "src/ServerScriptService/Weapons.luau")).toContain(">imported<");
		expect(rowOf(html, "place/Lobby.server.luau")).toContain(">place<");
		const main = rowOf(html, "src/ServerScriptService/Main.server.luau");
		expect(main).toContain("tree-generated");
		expect(main).not.toContain('class="badge"');
	});

	it("counts only what it marks", () => {
		const html = render();
		const head = html.slice(html.indexOf(">Output<"), html.indexOf(">Output<") + 400);
		expect(head).toMatch(/>4</);
	});
});
