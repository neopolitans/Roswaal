/**
 * What Import as graphs reads from a folder, and from the folders a whole Rojo
 * project syncs: hand-written Luau under them, never Wally's or Roswaal's own.
 */

import { describe, expect, it } from "vitest";

import type { TreeEntry } from "../src/app/api.js";
import { importableLuau } from "../src/app/importable.js";

const luau = (path: string, more: Partial<TreeEntry> = {}): TreeEntry => ({
	path,
	name: path.split("/").pop() ?? path,
	kind: "luau",
	...more,
});
const folder = (path: string, children: TreeEntry[], more: Partial<TreeEntry> = {}): TreeEntry => ({
	path,
	name: path.split("/").pop() ?? path,
	kind: "directory",
	children,
	...more,
});

const TREE: TreeEntry[] = [
	folder("src", [
		folder("src/server", [luau("src/server/init.server.luau"), luau("src/server/Round.luau")]),
		folder("src/shared", [
			luau("src/shared/Util.luau"),
			luau("src/shared/Made.luau", { generatedFrom: ".roswaal/scripts/Made.nodescript" }),
		]),
		folder("src/client", [luau("src/client/init.client.luau")]),
	]),
	folder("Packages", [luau("Packages/Promise.luau")], { role: "packages" }),
];

const paths = (entries: TreeEntry[]) => entries.map((e) => e.path);

describe("importable Luau", () => {
	it("is everything hand-written under the folders named", () => {
		expect(paths(importableLuau(TREE, new Set(["src/server", "src/shared"])))).toEqual([
			"src/server/init.server.luau",
			"src/server/Round.luau",
			"src/shared/Util.luau",
		]);
	});

	it("takes a file named on its own", () => {
		expect(paths(importableLuau(TREE, new Set(["src/client/init.client.luau"])))).toEqual([
			"src/client/init.client.luau",
		]);
	});

	it("never reads Wally's packages, even when named", () => {
		expect(importableLuau(TREE, new Set(["Packages"]))).toEqual([]);
	});

	it("counts a file once when a folder and its parent are both named", () => {
		expect(paths(importableLuau(TREE, new Set(["src", "src/server"])))).toHaveLength(4);
	});
});
