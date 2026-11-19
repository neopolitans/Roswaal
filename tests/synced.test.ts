/**
 * Whether a folder made under Graphs reaches Studio: a New folder or New
 * graph dialog warns where no node map syncs the folder.
 */

import { describe, expect, it } from "vitest";

import type { TreeEntry } from "../src/app/api.js";
import { syncedFolder, unsyncedWarning } from "../src/app/synced.js";

const dir = (path: string, children: TreeEntry[], more: Partial<TreeEntry> = {}): TreeEntry => ({
	path,
	name: path.split("/").pop() ?? path,
	kind: "directory",
	children,
	...more,
});

const tree = (writes: boolean): TreeEntry[] => [
	dir(".roswaal", [
		dir(".roswaal/scripts", [
			dir(".roswaal/scripts/ReplicatedStorage", [
				dir(".roswaal/scripts/ReplicatedStorage/Tank", [], { syncedBy: "Tank.nodemap" }),
			]),
			{
				path: ".roswaal/scripts/Tank.nodemap",
				name: "Tank.nodemap",
				kind: "nodemap",
				...(writes ? { mapFacts: { output: "default.project.json", syncs: [] } } : {}),
			},
		]),
	]),
];

describe("making something in a folder", () => {
	it("reaches Studio inside a synced folder, at any depth", () => {
		expect(syncedFolder(tree(true), ".roswaal/scripts/ReplicatedStorage/Tank")).toBe(true);
		expect(syncedFolder(tree(true), ".roswaal/scripts/ReplicatedStorage/Tank/Parts")).toBe(true);
		expect(unsyncedWarning(tree(true), ".roswaal/scripts/ReplicatedStorage/Tank")).toBeUndefined();
	});

	it("is warned about in a folder that only passes through", () => {
		expect(unsyncedWarning(tree(true), ".roswaal/scripts/ReplicatedStorage")).toMatch(
			/No node map/,
		);
	});

	it("is not warned about while no map writes a project file", () => {
		expect(unsyncedWarning(tree(false), ".roswaal/scripts/ReplicatedStorage")).toBeUndefined();
	});
});
