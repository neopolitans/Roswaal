/**
 * The DataModel as the project knows it -- the place's instances and what the
 * node maps' files add -- and what code says about it: names that are not
 * there, the instance a name is, and what is in the one a chain reaches.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { afterEach, describe, expect, it } from "vitest";

import { luauCompletionSource } from "../src/app/luauCompletions.js";

import {
	childrenOfChain, FROM_PROJECT, indexFromOutline, instanceAt, instanceProblems, type InstanceOutline,
} from "../src/core/luau/instances.js";
import { serialiseMap, type NodeMap } from "../src/core/nodemap.js";
import { openProject } from "../src/server/project.js";
import { projectInstances } from "../src/server/requires.js";
import { ApiSession } from "../src/server/routes.js";

/** ReplicatedStorage.Shared.{Util, Remotes}, and a Workspace. */
const OUTLINE: InstanceOutline = {
	classes: ["ReplicatedStorage", "Folder", "ModuleScript", "Workspace", "RemoteEvent"],
	nodes: [
		[0, "ReplicatedStorage", -1, 0],
		[1, "Shared", 0, 0],
		[2, "Util", 1, 0],
		[1, "Remotes", 1, 0],
		[4, "Ping", 3, 0],
		[3, "Workspace", -1, 0],
	],
};

const root = indexFromOutline(OUTLINE);
const RS = 'local ReplicatedStorage = game:GetService("ReplicatedStorage")\n';

describe("names the place does not have", () => {
	it("marks a child that is not there, under a settled container", () => {
		const src = `${RS}local Util = require(ReplicatedStorage.Shared.Utill)`;
		const problems = instanceProblems(src, root);
		expect(problems).toHaveLength(1);
		expect(problems[0].message).toContain('ReplicatedStorage.Shared has no child called "Utill"');
		expect(src.slice(problems[0].from, problems[0].to)).toBe("Utill");
	});

	it("leaves properties, methods and events alone", () => {
		const src = `${RS}print(ReplicatedStorage.Shared.Name, ReplicatedStorage.Shared:GetChildren(), ReplicatedStorage.Shared.ChildAdded)`;
		expect(instanceProblems(src, root)).toEqual([]);
	});

	it("leaves Workspace alone, which fills while the game runs", () => {
		expect(instanceProblems("print(workspace.Character.Humanoid)", root)).toEqual([]);
	});

	it("marks WaitForChild waiting for a name that is nowhere", () => {
		const src = `${RS}local remotes = ReplicatedStorage.Shared:WaitForChild("Remote")`;
		const [problem] = instanceProblems(src, root);
		expect(problem.message).toContain('Nothing called "Remote" is in ReplicatedStorage.Shared');
		expect(instanceProblems(`${RS}local remotes = ReplicatedStorage.Shared:WaitForChild("Remotes")`, root)).toEqual([]);
	});

	it("follows script.Parent from where the file is", () => {
		const self = ["ReplicatedStorage", "Shared", "Util"];
		expect(instanceProblems("local r = script.Parent.Remotes.Ping", root, self)).toEqual([]);
		expect(instanceProblems("local r = script.Parent.Remotes.Pong", root, self)).toHaveLength(1);
		// Without knowing where the file is, script paths are not checked.
		expect(instanceProblems("local r = script.Parent.Remotes.Pong", root)).toEqual([]);
	});
});

describe("the instance a name is", () => {
	it("hovers a child as its class, where it is", () => {
		const src = `${RS}local ping = ReplicatedStorage.Shared.Remotes:WaitForChild("Ping")`;
		const shared = instanceAt(src, src.indexOf("Shared") + 1, root)!;
		expect(shared.path).toEqual(["ReplicatedStorage", "Shared"]);
		expect(shared.node.className).toBe("Folder");
		const ping = instanceAt(src, src.indexOf('"Ping"') + 2, root)!;
		expect(ping.node.className).toBe("RemoteEvent");
	});

	it("offers what is in the instance a chain being typed reaches", () => {
		const src = `${RS}local x = ReplicatedStorage.Shared.`;
		expect(childrenOfChain(src, src.length, ["ReplicatedStorage", "Shared"], root).map((k) => k.name)).toEqual(["Util", "Remotes"]);
		expect(childrenOfChain("game.", 5, ["game"], root).map((k) => k.name)).toEqual(["ReplicatedStorage", "Workspace"]);
	});

	it("follows the local in scope, not one in a closed block or a comment", () => {
		const hidden = `do\n\t${RS}end\nlocal x = ReplicatedStorage.`;
		expect(childrenOfChain(hidden, hidden.length, ["ReplicatedStorage"], root)).toEqual([]);
		const commented = `${RS}-- local ReplicatedStorage = game.Workspace\nlocal x = ReplicatedStorage.`;
		expect(childrenOfChain(commented, commented.length, ["ReplicatedStorage"], root).map((k) => k.name)).toEqual(["Shared"]);
	});
});

describe("what the project's files add", () => {
	let dir = "";
	afterEach(async () => {
		if (dir) await rm(dir, { recursive: true, force: true });
	});

	async function project() {
		dir = await mkdtemp(path.join(os.tmpdir(), "roswaal-instances-"));
		const put = async (rel: string, text: string) => {
			await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
			await writeFile(path.join(dir, rel), text);
		};
		const map: NodeMap = {
			schemaVersion: 1, kind: "map", id: "m", name: "Orchard", output: "default.project.json",
			root: { id: "r", name: "DataModel", className: "DataModel", children: [
				{ id: "rs", name: "ReplicatedStorage", children: [{ id: "sh", name: "Shared", path: "src/shared", children: [] }] },
			] },
		};
		await put("roswaal.json", JSON.stringify({ schemaVersion: 1 }));
		await put(".roswaal/scripts/Orchard.nodemap", serialiseMap(map));
		await put("src/shared/Util.luau", "return {}\n");
		await put("src/shared/Fresh.luau", "return {}\n");
		await put("src/shared/Tools/init.luau", "return {}\n");
		return openProject(dir);
	}

	it("adds the scripts the place does not have yet, marked as the project's", async () => {
		const merged = await projectInstances(await project(), OUTLINE);
		const index = indexFromOutline(merged);
		const shared = index.children.get("ReplicatedStorage")!.children.get("Shared")!;
		expect([...shared.children.keys()].sort()).toEqual(["Fresh", "Remotes", "Tools", "Util"]);
		expect(shared.children.get("Fresh")).toMatchObject({ className: "ModuleScript", fromProject: true });
		expect(shared.children.get("Util")!.fromProject).toBeUndefined();
		expect(merged.nodes.filter((n) => n[3] & FROM_PROJECT)).toHaveLength(2);
	});

	it("answers from the files alone when there is no place", async () => {
		await project();
		const session = new ApiSession({});
		await session.openAt(dir);
		const { outline } = (await session.handle("GET", "/instances")) as { outline: InstanceOutline };
		const index = indexFromOutline(outline);
		expect([...index.children.get("ReplicatedStorage")!.children.get("Shared")!.children.keys()].sort()).toEqual(["Fresh", "Tools", "Util"]);
	});
});

describe("completing an instance path", () => {
	const offered = (source: string) => {
		const pos = source.indexOf("|");
		const doc = source.replace("|", "");
		const context = new CompletionContext(EditorState.create({ doc }), pos, false);
		const result = luauCompletionSource(() => [], () => "roblox", () => new Map(), () => ({ root }))(context);
		return result ? result.options.map((o) => o.label) : [];
	};

	it("offers the children after a dot, then the class's properties", () => {
		const labels = offered(`${RS}local x = ReplicatedStorage.Shared.|`);
		expect(labels.slice(0, 2)).toEqual(["Util", "Remotes"]);
		expect(labels).toContain("Name");
	});

	it("offers the children inside WaitForChild's string", () => {
		expect(offered(`${RS}local x = ReplicatedStorage.Shared:WaitForChild("|`)).toEqual(["Util", "Remotes"]);
	});

	it("says nothing it does not know, and leaves the rest to the usual completion", () => {
		expect(offered("local x = workspace.Character.|")).not.toContain("Util");
	});
});
