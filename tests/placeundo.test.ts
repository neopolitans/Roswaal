/**
 * Undoing DataModel edits: each change's answer names the change that undoes
 * it, and sending that back leaves the place as it was -- the same tree in the
 * same order, every value to the bit, and the links and references a
 * deletion cleared.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { blankPlaceBytes, blankPlaceXml } from "../src/core/rbx/blankPlace.js";
import { outlinePlace } from "../src/core/rbx/browse.js";
import { pathOf, type RbxInstance } from "../src/core/rbx/dom.js";
import { writeProperty } from "../src/core/rbx/edit.js";
import { readRbx } from "../src/core/rbx/index.js";
import {
	changeInstances,
	type InstanceChange,
	type InstanceRef,
} from "../src/core/rbx/instances.js";
import { LINKS_FILE } from "../src/core/rbx/placeImport.js";
import { decodeRaw, decodeTree, encodeRaw, encodeTree } from "../src/core/rbx/rawValue.js";
import { ApiSession } from "../src/server/routes.js";

const utf8 = new TextEncoder();

describe("a stored value as JSON", () => {
	const none = () => {
		throw new Error("no instances here");
	};
	it("comes back to the bit", () => {
		const values: unknown[] = [
			true,
			0.1 + 0.2,
			Math.fround(0.7),
			Number.NaN,
			Number.POSITIVE_INFINITY,

			2n ** 60n,
			Uint8Array.of(0, 1, 255),
			[0.5, 0.25, 1],
			{ position: [1, 2, 3], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
			{ family: "rbxasset://fonts/x.json", weight: 400, style: 0, cachedFaceId: "" },
			[
				[0, 1, 0],
				[1, 0.5, 0],
			],
			"text",
			null,
		];
		for (const value of values) {
			const raw = JSON.parse(JSON.stringify(encodeRaw(value, none)));
			expect(decodeRaw(raw, none)).toEqual(value);
		}
		expect(Object.is(decodeRaw(encodeRaw(-0, none), none), -0)).toBe(true);
	});

	it("names an instance as it is told to, and refuses what it did not make", () => {
		const inst = { className: "Part", name: "P", parent: null, children: [], props: new Map() };
		const raw = encodeRaw({ source: 2, object: inst }, () => 7);
		expect(raw).toEqual({ source: 2, object: { $i: 7 } });
		expect(decodeRaw(raw, (p) => (p === 7 ? inst : null))).toEqual({ source: 2, object: inst });
		expect(() => decodeRaw({ $f: "pi" }, none)).toThrow();
		expect(() => decodeRaw({ $x: 1, y: 2 }, none)).toThrow();
	});
});

/** A place and the changes made to it, each kept with what undoes it. */
function place(start: Uint8Array) {
	let bytes = start;
	const doc = () => readRbx(bytes);
	const at = (p: string, nth = 0) => {
		const found = doc().instances.filter((i) => pathOf(i).join("/") === p);
		if (!found[nth]) throw new Error(`no ${p}`);
		return found[nth];
	};
	return {
		get bytes() {
			return bytes;
		},
		doc,
		at,
		ref: (p: string, nth = 0) => at(p, nth).ref!,
		/** The change made, and the undo it answered with, as referents. */
		change(change: InstanceChange): InstanceChange {
			const out = changeInstances(bytes, change);
			bytes = out.bytes;
			return asRefs(out.undo);
		},
		set(p: string, prop: string, value: unknown) {
			const d = doc();
			const inst = d.instances.find((i) => pathOf(i).join("/") === p)!;
			bytes = writeProperty(bytes, d, inst, prop, value);
		},
		point(from: string, prop: string, to: string, nth = 0) {
			const d = doc();
			const inst = d.instances.find((i) => pathOf(i).join("/") === from)!;
			const target = d.instances.filter((i) => pathOf(i).join("/") === to)[nth];
			bytes = writeProperty(bytes, d, inst, prop, target);
		},
		get(p: string, prop: string, nth = 0) {
			return at(p, nth).props.get(prop)?.value;
		},
	};
}

/** An undo as the core gives it, its instances as their referents, as the route sends it. */
function asRefs(undo: InstanceChange<RbxInstance>): InstanceChange {
	const ref = (inst: RbxInstance) => inst.ref as InstanceRef;
	switch (undo.kind) {
		case "delete":
			return { kind: "delete", target: ref(undo.target) };
		case "move":
			return {
				kind: "move",
				target: ref(undo.target),
				parent: ref(undo.parent),
				...(undo.before ? { before: ref(undo.before) } : {}),
			};
		case "restore": {
			const byRef = new Map<number, InstanceRef>();
			let n = 0;
			const items = encodeTree(undo.tree, (inst) => {
				byRef.set(n, ref(inst));
				return n++;
			});
			const tree = decodeTree(JSON.parse(JSON.stringify(items)), (i) => ({
				outside: byRef.get(i)!,
			}));
			const members = [...walkAll(tree)];
			const local = [...walkAll(undo.tree)];
			return {
				kind: "restore",
				parent: ref(undo.parent),
				...(undo.before ? { before: ref(undo.before) } : {}),
				tree,
				repoint: (undo.repoint ?? []).map((r) => ({
					holder: ref(r.holder),
					prop: r.prop,
					target: members[local.indexOf(r.target)],
				})),
			};
		}
		default:
			throw new Error("not an undo");
	}
}

function* walkAll(root: RbxInstance): Generator<RbxInstance> {
	yield root;
	for (const child of root.children) yield* walkAll(child);
}

/** Everything about a place that an undo should put back: the tree in order, and every value. */
function shape(bytes: Uint8Array) {
	const { outline, order } = outlinePlace(readRbx(bytes));
	const at = new Map(order.map((inst, i) => [inst, i]));
	return {
		outline,
		values: order.map((inst) =>
			Object.fromEntries(
				[...inst.props].map(([name, prop]) => [
					name,
					JSON.stringify(encodeRaw(prop.value, (other) => at.get(other) ?? null)),
				]),
			),
		),
	};
}

for (const format of ["binary", "xml"] as const) {
	const blank = () => (format === "binary" ? blankPlaceBytes() : utf8.encode(blankPlaceXml()));

	describe(`undoing in a ${format} place`, () => {
		/** A place with a model of three same-named parts, references in, out and across. */
		function busy() {
			const p = place(blank());
			const add = (parent: string, className: string, name: string) =>
				p.change({ kind: "add", parent: p.ref(parent), className, name });
			add("Workspace", "Model", "Hull");
			for (let i = 0; i < 3; i++) add("Workspace/Hull", "Part", "Plate");
			add("Workspace/Hull", "ObjectValue", "Link");
			add("Workspace/Hull", "ObjectValue", "Inner");
			add("Workspace", "ObjectValue", "Aim");
			p.point("Workspace/Hull/Link", "Value", "Workspace/Baseplate");
			p.point("Workspace/Hull/Inner", "Value", "Workspace/Hull/Plate", 2);
			p.point("Workspace/Aim", "Value", "Workspace/Hull/Plate", 1);
			p.set("Workspace/Hull/Plate", "Anchored", true);
			return { p };
		}

		it("puts back a deleted tree as it was: in its place, every value, what pointed at it", () => {
			const { p } = busy();
			const was = shape(p.bytes);
			const undo = p.change({ kind: "delete", target: p.ref("Workspace/Hull") });
			expect(p.get("Workspace/Aim", "Value")).toBeNull();
			const redo = p.change(undo);
			expect(shape(p.bytes)).toEqual(was);
			expect(pathOf(p.get("Workspace/Aim", "Value") as RbxInstance).join("/")).toBe(
				"Workspace/Hull/Plate",
			);
			expect(redo.kind).toBe("delete");
			p.change(redo);
			expect(p.doc().instances.some((i) => i.name === "Hull")).toBe(false);
		});

		it("puts back one of three same-named siblings where it was among them", () => {
			const { p } = busy();
			p.set("Workspace/Hull/Plate", "Locked", true);
			const was = shape(p.bytes);
			const undo = p.change({ kind: "delete", target: p.ref("Workspace/Hull/Plate", 1) });
			p.change(undo);
			expect(shape(p.bytes)).toEqual(was);
		});

		it("moves one back in front of the sibling it left", () => {
			const { p } = busy();
			const was = shape(p.bytes);
			const undo = p.change({
				kind: "move",
				target: p.ref("Workspace/Hull/Plate", 0),
				parent: p.ref("ReplicatedStorage"),
			});
			expect(undo).toMatchObject({ kind: "move", parent: p.ref("Workspace/Hull") });
			p.change(undo);
			expect(shape(p.bytes)).toEqual(was);
		});

		it("takes away what was added or duplicated", () => {
			const p = place(blank());
			const was = shape(p.bytes);
			p.change(
				p.change({ kind: "add", parent: p.ref("Workspace"), className: "Part", name: "New" }),
			);
			p.change(p.change({ kind: "duplicate", target: p.ref("Workspace/SpawnLocation") }));
			expect(shape(p.bytes)).toEqual(was);
		});
	});
}

describe("the routes' undo", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	type Tree = {
		stamp: string;
		outline: { nodes: [number, string, number, number][] };
		index?: number;
		undo?: Record<string, unknown>;
	};
	type Written = { stamp: string; instance: { index: number }; undo?: Record<string, unknown> };

	async function open(file: "place.rbxl" | "place.rbxlx") {
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-undo-"));
		await writeFile(path.join(root, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
		const p = place(file === "place.rbxl" ? blankPlaceBytes() : utf8.encode(blankPlaceXml()));
		p.change({ kind: "add", parent: p.ref("Workspace"), className: "Folder", name: "Gun" });
		p.change({ kind: "add", parent: p.ref("Workspace/Gun"), className: "Script", name: "Fire" });
		await writeFile(path.join(root, file), p.bytes);
		await mkdir(path.join(root, ".roswaal"), { recursive: true });
		await mkdir(path.join(root, "src"), { recursive: true });
		await writeFile(path.join(root, "src/Fire.server.luau"), "print(1)");
		await writeFile(
			path.join(root, LINKS_FILE),
			JSON.stringify({
				schemaVersion: 1,
				place: file,
				scripts: [
					{
						file: "src/Fire.server.luau",
						className: "Script",
						instances: [{ path: ["Workspace", "Gun", "Fire"] }],
					},
				],
			}),
		);
		const session = new ApiSession({});
		await session.openAt(root);
		const tree = (await session.handle("GET", "/place")) as Tree;
		const at = (t: Tree, name: string) => t.outline.nodes.findIndex(([, n]) => n === name);
		// The file once what is unsaved is saved: a save between steps changes no stamp.
		const bytes = async () => {
			await session.handle("POST", "/place/save", { body: {} });
			return new Uint8Array(await readFile(path.join(root, file)));
		};
		const links = async () => JSON.parse(await readFile(path.join(root, LINKS_FILE), "utf8"));
		const post = (route: string, body: object) => session.handle("POST", route, { body });
		return { session, tree, at, bytes, links, post };
	}

	for (const file of ["place.rbxl", "place.rbxlx"] as const) {
		it(`puts a property back to the bit, and again, in ${file}`, async () => {
			const { tree, at, bytes, post } = await open(file);
			const original = shape(await bytes());
			const lighting = at(tree, "Lighting");
			const changed = (await post("/place/property", {
				stamp: tree.stamp,
				index: lighting,
				property: "Ambient",
				value: [10, 20, 30],
			})) as Written;
			expect(changed.undo).toMatchObject({ property: "Ambient", raw: { type: "Color3" } });
			const undone = (await post("/place/property", {
				stamp: changed.stamp,
				index: changed.instance.index,
				...changed.undo,
			})) as Written;
			expect(shape(await bytes())).toEqual(original);
			await post("/place/property", {
				stamp: undone.stamp,
				index: undone.instance.index,
				...undone.undo,
			});
			const ambient = readRbx(await bytes())
				.instances.find((i) => i.name === "Lighting")!
				.props.get("Ambient")!.value as number[];
			expect(ambient.map((c) => Math.round(c * 255))).toEqual([10, 20, 30]);
		});

		it(`takes back an attribute, a tag and a rename, links and all, in ${file}`, async () => {
			const { tree, at, bytes, links, post } = await open(file);
			const original = shape(await bytes());
			let stamp = tree.stamp;
			const undoOf = async (route: string, body: object) => {
				const answer = (await post(route, { stamp, ...body })) as Written;
				const back = (await post("/place/property", {
					stamp: answer.stamp,
					index: answer.instance.index,
					...answer.undo,
				})) as Written;
				stamp = back.stamp;
				return answer;
			};
			await undoOf("/place/attribute", { index: at(tree, "Gun"), name: "Ammo", add: "number" });
			await undoOf("/place/tag", { index: at(tree, "Gun"), tag: "Weapon" });
			const renamed = await undoOf("/place/property", {
				index: at(tree, "Gun"),
				property: "Name",
				value: "Rifle",
			});
			expect(renamed.undo).toMatchObject({ property: "Name" });
			expect(shape(await bytes())).toEqual(original);
			expect((await links()).scripts[0].instances[0].path).toEqual(["Workspace", "Gun", "Fire"]);
		});

		it(`puts back a deleted script and its link, and deletes it again, in ${file}`, async () => {
			const { tree, at, bytes, links, post } = await open(file);
			const original = shape(await bytes());
			const deleted = (await post("/place/instance", {
				stamp: tree.stamp,
				kind: "delete",
				index: at(tree, "Gun"),
				unlink: true,
			})) as Tree;
			expect((await links()).scripts[0].instances).toEqual([]);
			expect(deleted.undo).toMatchObject({ kind: "restore", index: at(deleted, "Workspace") });
			const restored = (await post("/place/instance", {
				stamp: deleted.stamp,
				...deleted.undo,
			})) as Tree;
			expect(shape(await bytes())).toEqual(original);
			expect((await links()).scripts[0].instances).toEqual([
				{ path: ["Workspace", "Gun", "Fire"] },
			]);
			expect(restored.index).toBe(at(restored, "Gun"));
			expect(restored.undo).toEqual({ kind: "delete", index: at(restored, "Gun"), unlink: true });
			const again = (await post("/place/instance", {
				stamp: restored.stamp,
				...restored.undo,
			})) as Tree;
			expect(at(again, "Gun")).toBe(-1);
		});

		it(`points a reference back at what it pointed at, in ${file}`, async () => {
			const { tree, at, bytes, post } = await open(file);
			const added = (await post("/place/instance", {
				stamp: tree.stamp,
				kind: "add",
				index: at(tree, "Workspace"),
				className: "ObjectValue",
				name: "Aim",
			})) as Tree;
			const value = async () =>
				readRbx(await bytes())
					.instances.find((i) => i.name === "Aim")!
					.props.get("Value")!.value as RbxInstance | null;
			const pointed = (await post("/place/property", {
				stamp: added.stamp,
				index: added.index,
				property: "Value",
				value: at(added, "Baseplate"),
			})) as Written;
			const back = (await post("/place/property", {
				stamp: pointed.stamp,
				index: pointed.instance.index,
				...pointed.undo,
			})) as Written;
			expect(await value()).toBeNull();
			await post("/place/property", {
				stamp: back.stamp,
				index: back.instance.index,
				...back.undo,
			});
			expect((await value())?.name).toBe("Baseplate");
		});

		it(`moves back, and refuses a tree that is not one, in ${file}`, async () => {
			const { tree, at, bytes, post } = await open(file);
			const original = shape(await bytes());
			const moved = (await post("/place/instance", {
				stamp: tree.stamp,
				kind: "move",
				index: at(tree, "Gun"),
				parent: at(tree, "ReplicatedStorage"),
			})) as Tree;
			const back = (await post("/place/instance", { stamp: moved.stamp, ...moved.undo })) as Tree;
			expect(shape(await bytes())).toEqual(original);
			await expect(
				post("/place/instance", {
					stamp: back.stamp,
					kind: "restore",
					index: at(back, "Workspace"),
					tree: [{ className: "Part", parent: 3, props: {} }],
				}),
			).rejects.toMatchObject({ status: 400 });
			await expect(
				post("/place/property", {
					stamp: back.stamp,
					index: at(back, "Lighting"),
					property: "Ambient",
					raw: { type: "Vector3", value: [0, 0, 0] },
				}),
			).rejects.toMatchObject({ status: 409 });
		});
	}
});
