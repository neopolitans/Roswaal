/**
 * Packages by Wally realm: each realm a row that is its folder, saying where
 * a map lands it, with its packages under it. Wally's folders are then
 * Packages' to list, not Output's.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { TreeEntry } from "../src/app/api.js";
import { ProjectTree, type ProjectTreeProps } from "../src/app/ProjectTree.jsx";

const TREE: TreeEntry[] = [
	{
		path: ".roswaal",
		name: ".roswaal",
		kind: "directory",
		children: [
			{
				path: ".roswaal/scripts",
				name: "scripts",
				kind: "directory",
				children: [
					{
						path: ".roswaal/scripts/Game.nodemap",
						name: "Game.nodemap",
						kind: "nodemap",
						mapFacts: {
							output: "default.project.json",
							serves: true,
							syncs: [
								{
									id: "p",
									trail: "ReplicatedStorage › Packages",
									className: "Folder",
									service: false,
									path: "Packages",
								},
							],
						},
					},
				],
			},
		],
	},
	{ path: "Packages", name: "Packages", kind: "directory", role: "packages", children: [] },
	{ path: "DevPackages", name: "DevPackages", kind: "directory", role: "packages", children: [] },
	{
		path: "wally.toml",
		name: "wally.toml",
		kind: "wally",
		children: [
			{ path: "wally.toml/shared/Signal", name: "Signal", kind: "package", version: "1.5.0" },
			{ path: "wally.toml/dev/TestEZ", name: "TestEZ", kind: "package", version: "0.4.1" },
		],
	},
];

const noop = () => {};
const html = renderToStaticMarkup(
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
		onPackage: noop,
		onPackageSync: noop,
	} as ProjectTreeProps),
);

describe("packages by realm", () => {
	it("draws each realm with packages as its folder and where it lands", () => {
		expect(html).toContain("Packages/ → ReplicatedStorage › Packages");
		expect(html).toContain("DevPackages/ · no map syncs it");
		expect(html).not.toContain(">Server<");
	});

	it("lists each package under its realm", () => {
		const shared = html.indexOf(">Shared<");
		const dev = html.indexOf(">Dev<");
		expect(html.indexOf(">Signal<")).toBeGreaterThan(shared);
		expect(html.indexOf(">Signal<")).toBeLessThan(dev);
		expect(html.indexOf(">TestEZ<")).toBeGreaterThan(dev);
	});

	it("leaves Wally's folders out of Output", () => {
		expect(html).not.toContain('data-entry="Packages"');
		expect(html).not.toContain('data-entry="DevPackages"');
	});

	it("offers autosync on each realm", () => {
		expect(html.match(/>sync…</g)).toHaveLength(2);
	});
});
