/**
 * The Project panel by what you do with each part: Graphs from the services
 * down, the Place to open, Node maps, Packages, and Output folded.
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
	dir(".roswaal", [
		dir(".roswaal/nodes", []),
		dir(".roswaal/scripts", [
			dir(
				".roswaal/scripts/ReplicatedStorage",
				[
					dir(
						".roswaal/scripts/ReplicatedStorage/Tank",
						[
							file(".roswaal/scripts/ReplicatedStorage/Tank/Remotes.nodescript", "nodescript", {
								realm: "module",
							}),
						],
						{ role: "synced", syncedBy: ".roswaal/scripts/Tank.nodemap" },
					),
				],
				{ role: "service" },
			),
			dir(
				".roswaal/scripts/StarterPlayer",
				[dir(".roswaal/scripts/StarterPlayer/StarterPlayerScripts", [], { role: "service" })],
				{
					role: "service",
				},
			),
			file(".roswaal/scripts/Tank.nodemap", "nodemap"),
		]),
	]),
	dir("src", [
		file("src/Remotes.luau", "luau", {
			generatedFrom: ".roswaal/scripts/ReplicatedStorage/Tank/Remotes.nodescript",
		}),
	]),
	file("place.rbxl", "place"),
];

const noop = () => {};
const props = (more: Partial<ProjectTreeProps> = {}): ProjectTreeProps => ({
	tree: TREE,
	openPath: null,
	openGraph: null,
	outline: new Map(),
	onOpenFunction: noop,
	sourceDir: ".roswaal/scripts",
	nodePaths: [".roswaal/nodes"],
	targetDir: null,
	onOpen: noop,
	onMove: noop,
	onTargetDir: noop,
	onNewGraph: noop,
	onNewMap: noop,
	onNewFolder: noop,
	onRename: noop,
	onDelete: noop,
	onReveal: noop,
	onNodePacks: noop,
	...more,
});
const render = (more?: Partial<ProjectTreeProps>) =>
	renderToStaticMarkup(createElement(ProjectTree, props(more)));
const titles = (html: string) =>
	[...html.matchAll(/<span class="pane-title">([^<]+)<\/span>/g)].map((m) => m[1]);

describe("the Project panel", () => {
	it("is headed Graphs, Place, Node maps and Output, in that order", () => {
		expect(titles(render())).toEqual(["Graphs", "Place", "Node maps", "Output"]);
	});

	it("starts Graphs at the services, without the folders they live in or the maps", () => {
		const html = render();
		const graphs = html.slice(html.indexOf(">Graphs<"), html.indexOf(">Place<"));
		expect(graphs).toContain(">ReplicatedStorage<");
		expect(graphs).not.toContain(">scripts<");
		expect(graphs).not.toContain(">.roswaal<");
		expect(graphs).not.toContain(">Tank.nodemap<");
		// A graph without its extension: the heading says what it is.
		expect(graphs).toContain(">Remotes<");
	});

	it("lists node maps under their own heading, and the place with Open", () => {
		const html = render();
		expect(html.slice(html.indexOf(">Node maps<"))).toContain('<span class="label">Tank</span>');
		expect(html).toContain('<span class="label">place.rbxl</span>');
		expect(html).toContain(">Open</button>");
	});

	it("marks a folder a map syncs, and a folder with nothing in it", () => {
		const html = render();
		expect(html).toContain('title="Synced by Tank.nodemap"');
		expect(html).toContain('<span class="badge">empty</span>');
		// StarterPlayer holds a folder, so only StarterPlayerScripts says empty.
		expect(html.match(/<span class="badge">empty<\/span>/g)).toHaveLength(1);
	});

	it("folds Output at first, and puts node packs in the foot", () => {
		const html = render();
		expect(html).not.toContain(">Remotes.luau<");
		expect(html).toContain(">Node packs</button>");
	});

	it("shows Packages where packages can be added, saying when there are none", () => {
		const html = render({ onPackage: noop });
		expect(titles(html)).toEqual(["Graphs", "Place", "Node maps", "Packages", "Output"]);
		expect(html).toContain("No packages yet.");
	});
});
