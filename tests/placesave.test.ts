/**
 * Edits to a place are made in the host's copy and written at a save: the
 * buffer every route reads, undo across edits not saved, a file changed on
 * disk under them, and the scene the viewer is sent after one.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applied, EMPTY, recorded, seen, taken } from "../src/app/placeHistory.js";
import { notePlaceSave, placeSaveState, saveKey } from "../src/app/placeSave.js";
import { fromBase64 } from "../src/core/base64.js";
import { blankPlace } from "../src/core/rbx/blankPlace.js";
import type { Prop, RbxInstance } from "../src/core/rbx/dom.js";
import { readRbx } from "../src/core/rbx/index.js";
import { LINKS_FILE } from "../src/core/rbx/placeImport.js";
import type { RawProp } from "../src/core/rbx/rawValue.js";
import { writeBinaryPlace } from "../src/core/rbx/serialize.js";
import {
	type PlaceScene,
	SCENE_KINDS,
	SCENE_STRIDE,
} from "../src/extensions/placeViewer/core/scene.js";
import {
	applyScenePatch,
	diffScene,
	type ScenePatch,
} from "../src/extensions/placeViewer/core/sceneDiff.js";
import { ApiSession } from "../src/server/routes.js";

const utf8 = new TextEncoder();
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function placeBytes(): Uint8Array {
	const doc = blankPlace();
	const ws = doc.roots.find((r) => r.className === "Workspace") as RbxInstance;
	const made = (className: string, name: string, parent: RbxInstance, props: [string, Prop][]) => {
		const it: RbxInstance = {
			className,
			name,
			parent,
			children: [],
			service: false,
			props: new Map<string, Prop>([
				["Name", { type: "String", value: utf8.encode(name) }],
				...props,
			]),
		};
		parent.children.push(it);
		doc.instances.push(it);
		return it;
	};
	const part = (name: string, at: number[]) =>
		made("Part", name, ws, [
			["CFrame", { type: "CFrame", value: { position: at, rotation: IDENTITY } }],
			["size", { type: "Vector3", value: [2, 2, 2] }],
			["Transparency", { type: "Float32", value: 0 }],
		]);
	part("Crate", [0, 1, 0]);
	part("Barrel", [4, 1, 0]);
	const gun = made("Folder", "Gun", ws, []);
	made("Script", "Fire", gun, [["Source", { type: "String", value: utf8.encode("print(1)") }]]);
	return writeBinaryPlace(doc);
}

type Tree = {
	stamp: string;
	outline: { nodes: [number, string, number, number][] };
	unsaved?: boolean;
	diskChanged?: boolean;
	index?: number;
	undo?: Record<string, unknown>;
};
type Undo = { property: string; raw: RawProp };
type Written = {
	stamp: string;
	unsaved?: boolean;
	instance: { index: number; properties: { name: string; value: string }[] };
	undo?: Record<string, unknown>;
};

let root = "";
afterEach(async () => {
	if (root) await rm(root, { recursive: true, force: true });
	root = "";
});

async function open() {
	root = await mkdtemp(path.join(os.tmpdir(), "roswaal-save-"));
	await writeFile(path.join(root, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
	await writeFile(path.join(root, "place.rbxl"), placeBytes());
	await mkdir(path.join(root, ".roswaal"), { recursive: true });
	await mkdir(path.join(root, "src"), { recursive: true });
	await writeFile(path.join(root, "src/Fire.server.luau"), "print(1)");
	const links = JSON.stringify({
		schemaVersion: 1,
		place: "place.rbxl",
		scripts: [
			{
				file: "src/Fire.server.luau",
				className: "Script",
				instances: [{ path: ["Workspace", "Gun", "Fire"] }],
			},
		],
	});
	await writeFile(path.join(root, LINKS_FILE), links);
	const session = new ApiSession({});
	await session.openAt(root);
	const tree = (await session.handle("GET", "/place")) as Tree;
	const at = (t: Tree, name: string) => t.outline.nodes.findIndex(([, n]) => n === name);
	const post = (route: string, body: object) => session.handle("POST", route, { body });
	const disk = async () => new Uint8Array(await readFile(path.join(root, "place.rbxl")));
	const linksNow = async () => readFile(path.join(root, LINKS_FILE), "utf8");
	return { session, tree, at, post, disk, links, linksNow };
}

const transparency = (answer: Written) =>
	answer.instance.properties.find((p) => p.name === "Transparency")?.value;

describe("edits kept until a save", () => {
	it("are what every route reads, while the file stays as it was", async () => {
		const { session, tree, at, post, disk } = await open();
		const original = await disk();
		const crate = at(tree, "Crate");
		const changed = (await post("/place/property", {
			stamp: tree.stamp,
			index: crate,
			property: "Transparency",
			value: 0.5,
		})) as Written;
		expect(changed.unsaved).toBe(true);
		const again = (await session.handle("GET", "/place")) as Tree;
		expect(again).toMatchObject({ stamp: changed.stamp, unsaved: true });
		expect(again.diskChanged).toBeUndefined();
		const shown = (await session.handle("GET", "/place/instance", {
			query: { stamp: changed.stamp, index: String(crate) },
		})) as Written["instance"];
		expect(transparency({ stamp: changed.stamp, instance: shown })).toBe("0.5");
		expect(await disk()).toEqual(original);

		const saved = (await post("/place/save", {})) as Tree & { backup?: string };
		expect(saved.stamp).toBe(changed.stamp);
		expect(saved.unsaved).toBeUndefined();
		expect(saved.backup).toBeDefined();
		const crateOnDisk = readRbx(await disk()).instances.find((i) => i.name === "Crate")!;
		expect(crateOnDisk.props.get("Transparency")!.value).toBe(0.5);
	});

	it("are let go by a revert, the links put back as they were", async () => {
		const { tree, at, post, disk, links, linksNow } = await open();
		const original = await disk();
		const renamed = (await post("/place/property", {
			stamp: tree.stamp,
			index: at(tree, "Gun"),
			property: "Name",
			value: "Rifle",
		})) as Written;
		// The links follow the rename at once, as the tree does.
		expect(JSON.parse(await linksNow()).scripts[0].instances[0].path).toEqual([
			"Workspace",
			"Rifle",
			"Fire",
		]);
		const back = (await post("/place/revert", {})) as Tree;
		expect(back.unsaved).toBeUndefined();
		expect(back.stamp).toBe(tree.stamp);
		expect(back.stamp).not.toBe(renamed.stamp);
		expect(at(back, "Gun")).toBeGreaterThanOrEqual(0);
		expect(await linksNow()).toBe(links);
		expect(await disk()).toEqual(original);
	});

	it("are not unsaved once undone back to the file", async () => {
		const { tree, at, post } = await open();
		const changed = (await post("/place/property", {
			stamp: tree.stamp,
			index: at(tree, "Crate"),
			property: "Transparency",
			value: 0.25,
		})) as Written;
		const undone = (await post("/place/property", {
			stamp: changed.stamp,
			index: changed.instance.index,
			...changed.undo,
		})) as Written;
		expect(undone.stamp).toBe(tree.stamp);
		expect(undone.unsaved).toBeUndefined();
	});
});

describe("undo across unsaved edits", () => {
	it("walks back and forth through edits not saved, and a save in between changes no stamp", async () => {
		const { tree, at, post, disk } = await open();
		const original = await disk();
		const crate = at(tree, "Crate");
		let h = seen(EMPTY, tree.stamp);
		let stamp = tree.stamp;
		for (const value of [0.1, 0.2, 0.3]) {
			const answer = (await post("/place/property", {
				stamp,
				index: crate,
				property: "Transparency",
				value,
			})) as Written;
			h = recorded(
				h,
				{ kind: "property", index: crate, ...(answer.undo as Undo), label: `T ${value}` },
				answer.stamp,
			);
			stamp = answer.stamp;
		}
		// Saved: the same stamp, so the history the editor keeps still meets it.
		const saved = (await post("/place/save", {})) as Tree;
		expect(saved.stamp).toBe(stamp);
		h = seen(h, saved.stamp);
		expect(h.undo).toHaveLength(3);

		const step = async (which: "undo" | "redo") => {
			const next = taken(h, which)!;
			const s = next.step as Extract<typeof next.step, { kind: "property" }>;
			const answer = (await post("/place/property", {
				stamp: h.stamp,
				index: s.index,
				property: s.property,
				raw: s.raw,
			})) as Written;
			h = applied(
				next.rest,
				which,
				{ ...s, index: answer.instance.index, ...(answer.undo as Undo) },
				answer.stamp,
			);
			return answer;
		};
		expect(transparency(await step("undo"))).toBe("0.2");
		expect(transparency(await step("undo"))).toBe("0.1");
		const third = await step("undo");
		expect(transparency(third)).toBe("0");
		// Back to the original bytes, but the file holds the save: unsaved still.
		expect(third.unsaved).toBe(true);
		expect(transparency(await step("redo"))).toBe("0.1");
		expect(h.undo).toHaveLength(1);
		expect(h.redo).toHaveLength(2);
		await post("/place/save", {});
		expect(await disk()).not.toEqual(original);
		const onDisk = readRbx(await disk()).instances.find((i) => i.name === "Crate")!;
		expect(onDisk.props.get("Transparency")!.value).toBeCloseTo(0.1);
	});
});

describe("a file changed on disk under unsaved edits", () => {
	async function changedUnder() {
		const opened = await open();
		const { tree, at, post } = opened;
		const edit = (await post("/place/property", {
			stamp: tree.stamp,
			index: at(tree, "Crate"),
			property: "Transparency",
			value: 0.5,
		})) as Written;
		// Studio saves its own copy: Barrel moved.
		const doc = readRbx(placeBytes());
		const barrel = doc.instances.find((i) => i.name === "Barrel")!;
		barrel.props.set("Transparency", { type: "Float32", value: 0.75 });
		const theirs = writeBinaryPlace(doc);
		await writeFile(path.join(root, "place.rbxl"), theirs);
		return { ...opened, edit, theirs };
	}

	it("says so, keeps the edits on screen, and refuses a save until asked to overwrite", async () => {
		const { session, post, disk, edit, theirs } = await changedUnder();
		const tree = (await session.handle("GET", "/place")) as Tree;
		expect(tree).toMatchObject({ stamp: edit.stamp, unsaved: true, diskChanged: true });
		await expect(post("/place/save", {})).rejects.toMatchObject({
			status: 409,
			details: { code: "place-changed-on-disk" },
		});
		expect(await disk()).toEqual(theirs);
		const saved = (await post("/place/save", { overwrite: true })) as Tree & { backup?: string };
		expect(saved.unsaved).toBeUndefined();
		expect(saved.backup).toBeDefined();
		expect(new Uint8Array(await readFile(path.join(root, saved.backup!)))).toEqual(theirs);
		const crate = readRbx(await disk()).instances.find((i) => i.name === "Crate")!;
		expect(crate.props.get("Transparency")!.value).toBe(0.5);
	});

	it("keeps the edits over the file when asked, and the next save writes without asking", async () => {
		const { post } = await changedUnder();
		const kept = (await post("/place/keep", {})) as Tree;
		expect(kept).toMatchObject({ unsaved: true });
		expect(kept.diskChanged).toBeUndefined();
		await expect(post("/place/save", {})).resolves.toMatchObject({ stamp: kept.stamp });
	});

	it("takes the file's version when the edits are let go", async () => {
		const { post, theirs } = await changedUnder();
		const back = (await post("/place/revert", {})) as Tree;
		expect(back.unsaved).toBeUndefined();
		expect(back.diskChanged).toBeUndefined();
		expect(back.stamp).toMatch(/^place\.rbxl:/);
		const r = (await post("/place/save", {})) as Tree;
		expect(r.stamp).toBe(back.stamp);
		expect(new Uint8Array(await readFile(path.join(root, "place.rbxl")))).toEqual(theirs);
	});
});

/** Rows of a scene, by id, as the renderers would read them: order within a kind does not matter. */
function rowsOf(scene: PlaceScene): string[] {
	const out: string[] = [];
	for (const set of ["kinds", "translucent"] as const)
		for (const kind of SCENE_KINDS) {
			const { data, count } = scene[set][kind];
			const u = new Uint32Array(data.buffer, data.byteOffset, count * SCENE_STRIDE);
			for (let i = 0; i < count; i++)
				out.push(`${set}:${kind}:${[...u.subarray(i * SCENE_STRIDE, (i + 1) * SCENE_STRIDE)]}`);
		}
	return out.sort();
}

type Wire = Record<string, { data: string; count: number }>;
const decode = (from: Wire) => {
	const out = {} as PlaceScene["kinds"];
	for (const k of SCENE_KINDS) {
		const { data, count } = from[k] ?? { data: "", count: 0 };
		out[k] = { data: new Float32Array(fromBase64(data).buffer), count };
	}
	return out;
};

describe("the scene after an edit", () => {
	it("is what changed since the viewer's version, applied to give the whole", async () => {
		const { session, tree, at, post } = await open();
		const scene = async (stamp: string, since?: string) =>
			(await session.handle("GET", "/place/scene", {
				query: { stamp, ...(since ? { since } : {}) },
			})) as Record<string, unknown> & { kinds: Wire; translucent: Wire };
		const whole = (wire: Awaited<ReturnType<typeof scene>>) =>
			({
				...wire,
				kinds: decode(wire.kinds),
				translucent: decode(wire.translucent),
			}) as unknown as PlaceScene;
		const before = whole(await scene(tree.stamp));
		const crate = at(tree, "Crate");
		const changed = (await post("/place/property", {
			stamp: tree.stamp,
			index: crate,
			property: "Transparency",
			value: 0.5,
		})) as Written;
		const wire = await scene(changed.stamp, tree.stamp);
		expect(wire.patch).toBe(true);
		const patch = {
			changed: wire.changed,
			fields: wire.fields,
			kinds: decode(wire.kinds),
			translucent: decode(wire.translucent),
		} as ScenePatch;
		// The crate alone, gone from the solid parts into the see-through ones.
		expect(patch.changed).toEqual([crate]);
		expect(SCENE_KINDS.reduce((n, k) => n + patch.kinds[k].count, 0)).toBe(0);
		expect(SCENE_KINDS.reduce((n, k) => n + patch.translucent[k].count, 0)).toBe(1);
		const after = applyScenePatch(before, patch);
		const full = whole(await scene(changed.stamp));
		expect(rowsOf(after)).toEqual(rowsOf(full));
		expect(after.transparent).toBe(full.transparent);
	});

	it("is the whole scene when the outline changed under it", async () => {
		const { session, tree, at, post } = await open();
		await session.handle("GET", "/place/scene", { query: { stamp: tree.stamp } });
		const added = (await post("/place/instance", {
			stamp: tree.stamp,
			kind: "add",
			index: at(tree, "Workspace"),
			className: "Part",
			name: "Aaa",
		})) as Tree;
		const wire = (await session.handle("GET", "/place/scene", {
			query: { stamp: added.stamp, since: tree.stamp },
		})) as Record<string, unknown>;
		expect(wire.patch).toBeUndefined();
		expect(wire.centre).toBeDefined();
	});

	it("diffs to nothing between equal scenes, and a moved row alone otherwise", () => {
		const row = (id: number, x: number) => {
			const data = new Float32Array(SCENE_STRIDE);
			data.set([1, 0, 0, 0, 1, 0, 0, 0, 1, x, 0, 0]);
			new Uint32Array(data.buffer)[13] = id;
			return data;
		};
		const empty = { data: new Float32Array(0), count: 0 };
		const sets = (rows: Float32Array[]) => {
			const block = new Float32Array(rows.length * SCENE_STRIDE);
			rows.forEach((r, i) => {
				block.set(r, i * SCENE_STRIDE);
			});
			const out = {} as PlaceScene["kinds"];
			for (const k of SCENE_KINDS)
				out[k] = k === "block" ? { data: block, count: rows.length } : empty;
			return out;
		};
		const none = sets([]);
		const scene = (rows: Float32Array[]): PlaceScene => ({
			kinds: sets(rows),
			translucent: none,
			centre: [0, 0, 0],
			radius: 1,
			transparent: 0,
		});
		const a = scene([row(1, 0), row(2, 5), row(3, 9)]);
		expect(diffScene(a, a).changed).toEqual([]);
		const b = scene([row(1, 0), row(2, 6), row(3, 9)]);
		const patch = diffScene(a, b);
		expect(patch.changed).toEqual([2]);
		expect(patch.kinds.block.count).toBe(1);
		expect(patch.fields).toEqual({});
		expect(rowsOf(applyScenePatch(a, patch))).toEqual(rowsOf(b));
		// A kind nothing changed in keeps its rows as they were.
		expect(applyScenePatch(a, patch).kinds.ball).toBe(a.kinds.ball);
	});
});

describe("the editor's word for edits not saved", () => {
	it("follows each answer, and a file changed under no edits is nothing to ask about", () => {
		notePlaceSave({ unsaved: true });
		expect(placeSaveState()).toEqual({ unsaved: true, diskChanged: false });
		notePlaceSave({ unsaved: true, diskChanged: true });
		expect(placeSaveState()).toEqual({ unsaved: true, diskChanged: true });
		notePlaceSave({ diskChanged: true });
		expect(placeSaveState()).toEqual({ unsaved: false, diskChanged: false });
	});

	it("saves on Ctrl or Cmd with S alone", () => {
		const key = (
			k: string,
			mods: Partial<Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>>,
		) =>
			saveKey({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });
		expect(key("s", { ctrlKey: true })).toBe(true);
		expect(key("S", { metaKey: true })).toBe(true);
		expect(key("s", { ctrlKey: true, shiftKey: true })).toBe(false);
		expect(key("s", {})).toBe(false);
	});
});
