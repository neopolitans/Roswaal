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
		dir(".roswaal/nodes", [dir(".roswaal/nodes/Combat", [])]),
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
	it("is headed Graphs, Node maps, Place, Output and Node packs, in that order", () => {
		expect(titles(render())).toEqual(["Graphs", "Node maps", "Place", "Output", "Node packs"]);
	});

	it("starts Graphs at the services, without the folders they live in or the maps", () => {
		const html = render();
		const graphs = html.slice(html.indexOf(">Graphs<"), html.indexOf(">Node maps<"));
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

	it("folds Output and Node packs at first", () => {
		const html = render();
		expect(html).not.toContain(">Remotes.luau<");
		expect(titles(html)).toContain("Node packs");
		expect(html).not.toContain('<span class="label">Combat</span>');
		expect(html).not.toContain(">Node packs</button>");
	});

	it("shows Packages where packages can be added, saying when there are none", () => {
		const html = render({ onPackage: noop });
		expect(titles(html)).toEqual([
			"Graphs",
			"Node maps",
			"Packages",
			"Place",
			"Output",
			"Node packs",
		]);
		expect(html).toContain("No packages yet.");
	});
});

describe("rows under Graphs", () => {
	/** The fixture with Tank's map writing a project file, as the daemon reports it. */
	const mapped = (entries: readonly TreeEntry[]): TreeEntry[] =>
		entries.map((e) => ({
			...e,
			...(e.kind === "nodemap"
				? { mapFacts: { output: "default.project.json", state: "same" as const, syncs: [] } }
				: {}),
			...(e.children ? { children: mapped(e.children) } : {}),
		}));
	const rowClass = (html: string, path: string) =>
		html.match(
			new RegExp(`<div class="([^"]*)"[^>]*data-entry="${path.replace(/[.]/g, "\\.")}"`),
		)?.[1] ?? "";

	it("offer New graph and New folder on a graph and on a folder, and no New node map", () => {
		const html = render();
		expect(html).toContain('aria-label="New folder beside Remotes"');
		expect(html).toContain('aria-label="New graph by Remotes"');
		expect(html).toContain('aria-label="New folder in Tank"');
		expect(html).not.toContain('aria-label="New node map in');
	});

	it("are yellow where no map syncs them, and not where a folder only passes through", () => {
		const html = render({ tree: mapped(TREE) });
		expect(rowClass(html, ".roswaal/scripts/StarterPlayer/StarterPlayerScripts")).toContain(
			"unsynced",
		);
		expect(rowClass(html, ".roswaal/scripts/StarterPlayer")).toContain("unsynced");
		expect(rowClass(html, ".roswaal/scripts/ReplicatedStorage")).not.toContain("unsynced");
		expect(rowClass(html, ".roswaal/scripts/ReplicatedStorage/Tank")).not.toContain("unsynced");
		expect(
			rowClass(html, ".roswaal/scripts/ReplicatedStorage/Tank/Remotes.nodescript"),
		).not.toContain("unsynced");
	});

	it("are not yellow before any map writes a project file", () => {
		expect(render()).not.toContain("unsynced");
	});

	it("name a graph's two files on hover, one a line", () => {
		const html = render({ outDir: "src" });
		expect(html).toContain(
			[
				'title="Graph: .roswaal/scripts/ReplicatedStorage/Tank/Remotes.nodescript',
				'Luau: src/ReplicatedStorage/Tank/Remotes.luau"',
			].join(String.fromCharCode(10)),
		);
	});
});
