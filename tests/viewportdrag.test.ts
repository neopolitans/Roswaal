/**
 * Dragging parts in the place viewer: where a dragged part comes to rest on
 * the surface under the pointer, by its nearest side or by its pivot; R and
 * T's quarter turns; the grid it keeps to; the ray's face normals; and the
 * change that writes the move into the place, every part of a Model at once,
 * and puts it back to the bit.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { blankPlace } from "../src/core/rbx/blankPlace.js";
import type { CFrameValue, Prop, RbxInstance } from "../src/core/rbx/dom.js";
import { writeProperties } from "../src/core/rbx/edit.js";
import { composeFrame, framesOf, movedBy } from "../src/core/rbx/frames.js";
import { readRbx } from "../src/core/rbx/index.js";
import { writeBinaryPlace, writeXmlPlace } from "../src/core/rbx/serialize.js";
import {
	type DragStart,
	dragMove,
	IDENTITY,
	moved,
	quarterTurn,
	reach,
	type Surface,
	sceneMoved,
	snapTo,
	tiltAxis,
	turnedBy,
} from "../src/extensions/placeViewer/app/viewport/drag.js";
import { rayHit } from "../src/extensions/placeViewer/app/viewport/geometry.js";
import {
	type PlaceScene,
	SCENE_KINDS,
	SCENE_STRIDE,
	type SceneKind,
} from "../src/extensions/placeViewer/core/scene.js";
import { ApiSession } from "../src/server/routes.js";

const close = (a: ArrayLike<number>, b: ArrayLike<number>) =>
	expect(Array.from(a, (v) => Math.round(v * 1e4) / 1e4 + 0)).toEqual(
		Array.from(b, (v) => Math.round(v * 1e4) / 1e4 + 0),
	);

/** A floor: the plane y = 0, looking up, its grid from the world's origin. */
const floor = (point: number[]): Surface => ({
	point,
	normal: [0, 1, 0],
	axes: [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	],
	origin: [0, 0, 0],
	rest: true,
});

/** An unturned box of `size` at `centre`, taken hold of at `grab`. */
function start(size: number[], centre: number[], grab: number[], pivot = centre): DragStart {
	return {
		box: {
			cols: [
				[size[0], 0, 0],
				[0, size[1], 0],
				[0, 0, size[2]],
			],
			centre,
		},
		pivot,
		grab,
		byPivot: false,
	};
}

describe("a part dragged over a surface", () => {
	it("rests on it by its nearest side, the point grabbed under the pointer", () => {
		// A 4x2x2 block on its top, grabbed a stud right of its middle.
		const s = start([4, 2, 2], [0, 5, 0], [1, 6, 0]);
		const m = dragMove(s, IDENTITY, floor([10, 0, 3]), 0);
		close(moved(m, [0, 5, 0]), [9, 1, 3]);
	});

	it("rests against a wall by the side facing it", () => {
		const wall: Surface = { ...floor([5, 3, 0]), normal: [1, 0, 0] };
		const m = dragMove(start([4, 2, 2], [0, 0, 0], [0, 1, 0]), IDENTITY, wall, 0);
		// Its -X side on the wall at x = 5, the grab's height kept under the pointer.
		close(moved(m, [0, 0, 0]), [7, 2, 0]);
	});

	it("rests a turned part by the reach of its turned box", () => {
		const s = start([4, 1, 2], [0, 0, 0], [0, 0.5, 0]);
		// A tilt about X stands its 2-stud depth up.
		const tilted = turnedBy(IDENTITY, "T", [1, 0, 0]);
		const m = dragMove(s, tilted, floor([0, 0, 0]), 0);
		expect(reach(s.box.cols, [0, 1, 0])).toBe(0.5);
		expect(moved(m, [0, 0, 0])[1]).toBeCloseTo(1);
	});

	it("keeps its edges to the surface's grid", () => {
		// 3 studs wide: its near edge on a whole stud puts its middle on a half.
		const s = start([3, 1, 3], [0, 0.5, 0], [0, 1, 0]);
		const m = dragMove(s, IDENTITY, floor([4.3, 0, -2.2]), 1);
		close(moved(m, [0, 0.5, 0]), [4.5, 0.5, -2.5]);
		// No step, no grid.
		close(moved(dragMove(s, IDENTITY, floor([4.3, 0, -2.2]), 0), [0, 0.5, 0]), [4.3, 0.5, -2.2]);
	});

	it("snaps to the hit part's own grid, from its own middle", () => {
		const raised: Surface = { ...floor([0.2, 3, 0.1]), origin: [0.25, 3, 0] };
		const s = start([2, 2, 2], [0, 1, 0], [0, 2, 0]);
		const c = moved(dragMove(s, IDENTITY, raised, 0.5), [0, 1, 0]);
		close(c, [0.25, 4, 0]);
	});

	it("follows the pointer across its own level where there is nothing under it", () => {
		const s = start([2, 2, 2], [0, 1, 0], [0, 2, 0]);
		const air: Surface = { ...floor([6, 2, 0]), rest: false };
		close(moved(dragMove(s, IDENTITY, air, 0), [0, 1, 0]), [6, 1, 0]);
	});
});

describe("a part dragged by its pivot", () => {
	it("puts the pivot on the surface: a pivot in the middle sinks the part halfway", () => {
		const s = { ...start([4, 4, 2], [0, 10, 0], [0, 10, 0]), byPivot: true };
		const m = dragMove(s, IDENTITY, floor([3, 0, 2]), 0);
		close(moved(m, [0, 10, 0]), [3, 0, 2]);
	});

	it("sits on the floor with its pivot on its bottom edge", () => {
		const pivot = [0, 8, 1];
		const s = { ...start([4, 4, 2], [0, 10, 0], pivot, pivot), byPivot: true };
		const m = dragMove(s, IDENTITY, floor([3, 0, 2]), 0);
		close(moved(m, pivot), [3, 0, 2]);
		close(moved(m, [0, 10, 0]), [3, 2, 1]);
	});

	it("turns about the pivot with R, the pivot staying on the surface", () => {
		const pivot = [2, 0, 1];
		const s = { ...start([4, 2, 2], [0, 1, 0], pivot, pivot), byPivot: true };
		const m = dragMove(s, turnedBy(IDENTITY, "R", [1, 0, 0]), floor([0, 0, 0]), 0);
		close(moved(m, pivot), [0, 0, 0]);
		close(m.r, [0, 0, 1, 0, 1, 0, -1, 0, 0]);
	});

	it("keeps the pivot to the grid", () => {
		const s = { ...start([1, 1, 1], [0, 0, 0], [0, 0, 0]), byPivot: true };
		close(moved(dragMove(s, IDENTITY, floor([1.3, 0, 0.8]), 1), [0, 0, 0]), [1, 0, 1]);
	});
});

describe("R and T", () => {
	it("turn a quarter about the up axis, back where they began after four", () => {
		const r = quarterTurn([0, 1, 0]);
		expect(r).toEqual([0, 0, 1, 0, 1, 0, -1, 0, 0]);
		let turn: readonly number[] = IDENTITY;
		for (let i = 0; i < 4; i++) turn = turnedBy(turn, "R", [1, 0, 0]);
		expect(turn).toEqual([...IDENTITY]);
	});

	it("tilt about the world's horizontal axis nearest the camera's right", () => {
		expect(tiltAxis([0.9, 0, 0.3])).toEqual([1, 0, 0]);
		expect(tiltAxis([0.2, 0, -0.9])).toEqual([0, 0, -1]);
		const t = turnedBy(IDENTITY, "T", [1, 0, 0]);
		close(
			[0, 1, 2].map((i) => t[i * 3 + 1]),
			[0, 0, 1],
		);
	});

	it("rest a part again by its new side after a turn", () => {
		// 4 long along X: stood on end by a tilt about Z, it is 4 high.
		const s = start([4, 1, 1], [0, 0.5, 0], [0, 1, 0]);
		const m = dragMove(s, turnedBy(IDENTITY, "T", [0, 0, 1]), floor([0, 0, 0]), 0);
		expect(moved(m, [0, 0.5, 0])[1]).toBeCloseTo(2);
	});
});

describe("the grid step", () => {
	it("rounds from where the grid starts", () => {
		expect(snapTo(4.3, 0, 1)).toBe(4);
		expect(snapTo(4.3, 0.5, 1)).toBe(4.5);
		expect(snapTo(4.3, 0, 0)).toBe(4.3);
	});
});

/** A scene of parts, each a shape, a box's three edges, a centre and an id. */
function sceneOf(
	parts: { kind: SceneKind; cols: number[][]; at: number[]; id: number }[],
): PlaceScene {
	const empty = () =>
		Object.fromEntries(
			SCENE_KINDS.map((k) => [k, { data: new Float32Array(), count: 0 }]),
		) as PlaceScene["kinds"];
	const kinds = empty();
	for (const k of SCENE_KINDS) {
		const mine = parts.filter((p) => p.kind === k);
		const data = new Float32Array(mine.length * SCENE_STRIDE);
		const words = new Uint32Array(data.buffer);
		mine.forEach((p, i) => {
			const at = i * SCENE_STRIDE;
			data.set([...p.cols.flat(), ...p.at], at);
			words[at + 13] = p.id;
		});
		kinds[k] = { data, count: mine.length };
	}
	return { kinds, translucent: empty(), centre: [0, 0, 0], radius: 50, transparent: 0 };
}

const square = (x: number, y: number, z: number) => [
	[x, 0, 0],
	[0, y, 0],
	[0, 0, z],
];

describe("the ray a drag sets parts down by", () => {
	const scene = sceneOf([
		{ kind: "block", cols: square(20, 1, 20), at: [0, -0.5, 0], id: 1 },
		{ kind: "block", cols: square(2, 2, 2), at: [0, 1, 0], id: 2 },
		{ kind: "ball", cols: square(2, 2, 2), at: [10, 1, 0], id: 3 },
		{ kind: "wedge", cols: square(2, 2, 2), at: [-6, 1, 0], id: 4 },
	]);

	it("meets a box's top looking up, and its side looking out", () => {
		const top = rayHit(scene, [0, 10, 0], [0, -1, 0]);
		expect(top?.id).toBe(2);
		expect(top?.t).toBeCloseTo(8);
		close(top!.normal, [0, 1, 0]);
		const side = rayHit(scene, [5, 1, 0], [-1, 0, 0]);
		close(side!.normal, [1, 0, 0]);
	});

	it("passes through what is dragged, onto what is under it", () => {
		const hit = rayHit(scene, [0, 10, 0], [0, -1, 0], (id) => id === 2);
		expect(hit?.id).toBe(1);
		expect(hit?.t).toBeCloseTo(10);
	});

	it("gives a ball's normal out from its middle, and a wedge's slope its own", () => {
		const ball = rayHit(scene, [10, 10, 0], [0, -1, 0]);
		close(ball!.normal, [0, 1, 0]);
		const slope = rayHit(scene, [-6, 10, 0], [0, -1, 0]);
		expect(slope?.id).toBe(4);
		close(slope!.normal, [0, Math.SQRT1_2, -Math.SQRT1_2]);
	});

	it("turns a turned part's face normal with it", () => {
		// Turned a quarter about Z: its own +Y looks along the world's -X.
		const turned = sceneOf([
			{
				kind: "block",
				cols: [
					[0, 4, 0],
					[-2, 0, 0],
					[0, 0, 2],
				],
				at: [0, 0, 0],
				id: 9,
			},
		]);
		const hit = rayHit(turned, [10, 0, 0], [-1, 0, 0]);
		close(hit!.normal, [1, 0, 0]);
		expect(hit?.t).toBeCloseTo(9);
	});

	it("moves only the rows dragged", () => {
		const m = dragMove(start([2, 2, 2], [0, 1, 0], [0, 2, 0]), IDENTITY, floor([4, 0, 0]), 0);
		const after = sceneMoved(scene, new Set([2]), m);
		const row = (s: PlaceScene, i: number) =>
			Array.from(s.kinds.block.data.subarray(i * SCENE_STRIDE + 9, i * SCENE_STRIDE + 12));
		close(row(after, 1), [4, 1, 0]);
		close(row(after, 0), [0, -0.5, 0]);
		expect(after.kinds.ball).toBe(scene.kinds.ball);
	});
});

// -- written into the place -----------------------------------------------------

const utf8 = new TextEncoder();
const QUARTER_Y = [0, 0, 1, 0, 1, 0, -1, 0, 0];
const frame = (position: number[], rotation = [...IDENTITY]): CFrameValue => ({
	position: position as [number, number, number],
	rotation,
});

/** A place with a crate, and a cart Model of two parts with a WorldPivot. */
function placeDoc() {
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
	const part = (name: string, parent: RbxInstance, at: number[]) =>
		made("Part", name, parent, [
			["CFrame", { type: "CFrame", value: frame(at) }],
			["size", { type: "Vector3", value: [2, 2, 2] }],
		]);
	part("Crate", ws, [0, 1, 0]);
	const cart = made("Model", "Cart", ws, [
		["PrimaryPart", { type: "Ref", value: null }],
		["WorldPivotData", { type: "OptionalCFrame", value: frame([5, 0, 0]) }],
	]);
	part("Body", cart, [5, 1, 0]);
	part("Wheel", cart, [6, 0.5, 1]);
	return doc;
}

const named = (doc: ReturnType<typeof readRbx>, name: string) =>
	doc.instances.find((i) => i.name === name) as RbxInstance;
const cframe = (doc: ReturnType<typeof readRbx>, name: string, stored = "CFrame") =>
	named(doc, name).props.get(stored)?.value as CFrameValue;

describe("a drag written into the place", () => {
	it("composes a move with a frame as the world turns and moves", () => {
		const by = frame([1, 2, 3], QUARTER_Y);
		const out = composeFrame(by, frame([1, 0, 0]));
		close(out.position, [1, 2, 2]);
		close(out.rotation, QUARTER_Y);
	});

	for (const format of ["binary", "xml"] as const) {
		it(`moves every part of a Model and its pivot at once, in ${format}`, () => {
			const binary = writeBinaryPlace(placeDoc());
			const bytes = format === "binary" ? binary : utf8.encode(writeXmlPlace(readRbx(binary)));
			const doc = readRbx(bytes);
			const by = frame([0, 0, 10], QUARTER_Y);
			const was = framesOf([named(doc, "Cart")]);
			expect(was.map((w) => `${w.inst.name}.${w.stored}`)).toEqual([
				"Cart.WorldPivotData",
				"Body.CFrame",
				"Wheel.CFrame",
			]);
			const after = readRbx(writeProperties(bytes, doc, movedBy(was, by)));
			close(cframe(after, "Body").position, [0, 1, 5]);
			close(cframe(after, "Wheel").position, [1, 0.5, 4]);
			close(cframe(after, "Wheel").rotation, QUARTER_Y);
			close(cframe(after, "Cart", "WorldPivotData").position, [0, 0, 5]);
			close(cframe(after, "Crate").position, [0, 1, 0]);
		});
	}

	it("moves a Model inside a picked Model once, with it", () => {
		const doc = readRbx(writeBinaryPlace(placeDoc()));
		const frames = framesOf([named(doc, "Cart"), named(doc, "Body")]);
		expect(frames.filter((f) => f.inst.name === "Body")).toHaveLength(1);
		expect(() => framesOf([named(doc, "Workspace")])).toThrow(/not a part or a Model/);
	});
});

describe("the transform change", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
		root = "";
	});

	for (const file of ["place.rbxl", "place.rbxlx"] as const) {
		it(`writes a drag and puts it back to the bit, in ${file}`, async () => {
			root = await mkdtemp(path.join(os.tmpdir(), "roswaal-drag-"));
			await writeFile(path.join(root, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
			const binary = writeBinaryPlace(placeDoc());
			await writeFile(
				path.join(root, file),
				file === "place.rbxl" ? binary : utf8.encode(writeXmlPlace(readRbx(binary))),
			);
			const session = new ApiSession({});
			await session.openAt(root);
			type Tree = {
				stamp: string;
				outline: { nodes: [number, string, number, number][] };
				undo?: { kind: string; index: number; sets: unknown[] };
			};
			const tree = (await session.handle("GET", "/place")) as Tree;
			const at = (name: string) => tree.outline.nodes.findIndex(([, n]) => n === name);
			// The file once the drag is saved: a save changes no stamp.
			const bytes = async () => {
				await session.handle("POST", "/place/save", { body: {} });
				return new Uint8Array(await readFile(path.join(root, file)));
			};
			// Every frame, as the file holds it: a turn once stored as one byte comes back as its matrix.
			const frames = async () => {
				const doc = readRbx(await bytes());
				return ["Crate", "Body", "Wheel"]
					.map((n) => cframe(doc, n))
					.concat([cframe(doc, "Cart", "WorldPivotData")])
					.map((f) => [...f.position, ...f.rotation].map(Math.fround));
			};
			const original = await frames();
			const count = readRbx(await bytes()).instances.length;
			const post = (body: object) =>
				session.handle("POST", "/place/instance", { body }) as Promise<Tree>;

			const items = [at("Crate"), at("Cart")];
			const moved = await post({
				stamp: tree.stamp,
				kind: "transform",
				index: items[0],
				items,
				by: frame([0, 3, 0], QUARTER_Y),
			});
			const now = readRbx(await bytes());
			close(cframe(now, "Crate").position, [0, 4, 0]);
			close(cframe(now, "Body").position, [0, 4, -5]);
			expect(moved.undo?.kind).toBe("frames");
			expect(moved.undo?.sets).toHaveLength(4);

			const back = await post({ stamp: moved.stamp, ...moved.undo });
			expect(await frames()).toEqual(original);
			expect(readRbx(await bytes()).instances).toHaveLength(count);
			// And the undo's undo is the drag again.
			const again = await post({ stamp: back.stamp, ...back.undo });
			close(cframe(readRbx(await bytes()), "Wheel").position, [1, 3.5, -6]);

			const ws = at("Workspace");
			await expect(
				post({
					stamp: again.stamp,
					kind: "transform",
					index: ws,
					items: [ws],
					by: frame([0, 0, 0]),
				}),
			).rejects.toThrow(/not a part or a Model/);
		});
	}
});
