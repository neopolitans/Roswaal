/**
 * Roblox's mesh files, read: each version Roswaal reads, from small files
 * built here byte by byte (no Roblox asset is in the repository), and the
 * triangles the place editor makes of them.
 */

import { describe, expect, it } from "vitest";
import type { RbxInstance } from "../src/core/rbx/dom.js";
import { meshGeometry, splitByMesh } from "../src/extensions/placeEditor/app/viewport/view.js";
import { MeshError, readMesh } from "../src/extensions/placeEditor/core/mesh.js";
import { buildPlaceScene, SCENE_STRIDE } from "../src/extensions/placeEditor/core/scene.js";

/** Little-endian bytes, written in order. */
class Bytes {
	private parts: number[] = [];
	text(s: string) {
		for (const c of new TextEncoder().encode(s)) this.parts.push(c);
		return this;
	}
	u8(v: number) {
		this.parts.push(v & 255);
		return this;
	}
	u16(v: number) {
		return this.u8(v).u8(v >> 8);
	}
	u32(v: number) {
		const b = new Uint8Array(new Uint32Array([v]).buffer);
		for (const x of b) this.parts.push(x);
		return this;
	}
	f32(v: number) {
		const b = new Uint8Array(new Float32Array([v]).buffer);
		for (const x of b) this.parts.push(x);
		return this;
	}
	get bytes() {
		return new Uint8Array(this.parts);
	}
}

/** A triangle in the XY plane facing +Z, then one more off to the side. */
const VERTS = [
	[0, 0, 0],
	[2, 0, 0],
	[0, 4, 0],
	[2, 4, 6],
];

function vertex(b: Bytes, p: number[], colour = true) {
	b.f32(p[0]).f32(p[1]).f32(p[2]);
	b.f32(0).f32(0).f32(1);
	b.f32(p[0] / 2).f32(p[1] / 4);
	b.u8(127).u8(127).u8(0).u8(254);
	if (colour) b.u8(255).u8(255).u8(255).u8(255);
}

function faces(b: Bytes, list: number[][]) {
	for (const f of list) b.u32(f[0]).u32(f[1]).u32(f[2]);
}

describe("reading a mesh file", () => {
	it("reads version 2.00, with or without each vertex's colour", () => {
		for (const colour of [true, false]) {
			const b = new Bytes()
				.text("version 2.00\n")
				.u16(12)
				.u8(colour ? 40 : 36)
				.u8(12)
				.u32(3)
				.u32(1);
			for (const p of VERTS.slice(0, 3)) vertex(b, p, colour);
			faces(b, [[0, 1, 2]]);
			const mesh = readMesh(b.bytes);
			expect(mesh.version).toBe("2.00");
			expect([...mesh.positions]).toEqual([0, 0, 0, 2, 0, 0, 0, 4, 0]);
			expect([...mesh.normals.slice(0, 3)]).toEqual([0, 0, 1]);
			expect([...mesh.uvs]).toEqual([0, 0, 1, 0, 0, 1]);
			expect([...mesh.indices]).toEqual([0, 1, 2]);
		}
	});

	it("keeps version 3's full-detail faces and leaves its lower LODs out", () => {
		const b = new Bytes().text("version 3.00\n").u16(16).u8(40).u8(12).u16(4).u16(3).u32(4).u32(2);
		for (const p of VERTS) vertex(b, p);
		faces(b, [
			[0, 1, 2],
			[1, 3, 2],
		]);
		b.u32(0).u32(1).u32(2);
		expect([...readMesh(b.bytes).indices]).toEqual([0, 1, 2]);
	});

	it("reads past version 4's skinning, before its faces", () => {
		const b = new Bytes().text("version 4.01\n");
		b.u16(24).u16(0).u32(3).u32(1).u16(0).u16(1).u32(0).u16(0).u8(0).u8(0);
		for (const p of VERTS.slice(0, 3)) vertex(b, p);
		for (let v = 0; v < 3; v++) b.u8(0).u8(0).u8(0).u8(0).u8(255).u8(0).u8(0).u8(0);
		faces(b, [[2, 1, 0]]);
		expect([...readMesh(b.bytes).indices]).toEqual([2, 1, 0]);
	});

	it("reads version 6's chunks, and refuses 7's Draco stream without failing the place", () => {
		const core = new Bytes().u32(3);
		for (const p of VERTS.slice(0, 3)) vertex(core, p);
		core.u32(1);
		faces(core, [[0, 1, 2]]);
		const data = core.bytes;
		const b = new Bytes().text("version 6.00\n").text("COREMESH").u32(1).u32(data.length);
		for (const x of data) b.u8(x);
		expect(readMesh(b.bytes).positions.length).toBe(9);

		const draco = new Bytes().text("version 7.00\n").text("COREMESH").u32(2).u32(4).u32(0);
		expect(() => readMesh(draco.bytes)).toThrow(MeshError);
	});

	it("reads version 1's text, halving 1.00 and turning its texture the right way up", () => {
		const triple = (p: number[], n: number[], t: number[]) =>
			`[${p.join(",")}][${n.join(",")}][${t.join(",")}]`;
		const line =
			triple([2, 0, 0], [0, 0, 1], [1, 0, 0]) +
			triple([0, 2, 0], [0, 0, 1], [0, 1, 0]) +
			triple([0, 0, 0], [0, 0, 1], [0, 0, 0]);
		const old = readMesh(new Bytes().text(`version 1.00\n1\n${line}`).bytes);
		expect([...old.positions.slice(0, 3)]).toEqual([1, 0, 0]);
		expect([...old.uvs.slice(0, 2)]).toEqual([1, 1]);
		const fixed = readMesh(new Bytes().text(`version 1.01\n1\n${line}`).bytes);
		expect([...fixed.positions.slice(0, 3)]).toEqual([2, 0, 0]);
	});

	it("refuses what is not a mesh, or a face that names a vertex it does not have", () => {
		expect(() => readMesh(new Bytes().text("<roblox>").bytes)).toThrow(MeshError);
		const b = new Bytes().text("version 2.00\n").u16(12).u8(40).u8(12).u32(3).u32(1);
		for (const p of VERTS.slice(0, 3)) vertex(b, p);
		faces(b, [[0, 1, 9]]);
		expect(() => readMesh(b.bytes)).toThrow(MeshError);
		expect(() => readMesh(b.bytes.subarray(0, 40))).toThrow(MeshError);
	});
});

describe("a mesh as a row draws it", () => {
	const b = new Bytes().text("version 2.00\n").u16(12).u8(40).u8(12).u32(4).u32(2);
	for (const p of VERTS) vertex(b, p);
	faces(b, [
		[0, 1, 2],
		[1, 3, 2],
	]);
	const mesh = readMesh(b.bytes);

	it("fills a MeshPart's box, whatever size it was made at", () => {
		const { vertices, indices } = meshGeometry(mesh, { asset: "1" });
		const positions = [0, 1, 2, 3].map((v) => [...vertices.slice(v * 6, v * 6 + 3)]);
		expect(positions[0]).toEqual([-0.5, -0.5, -0.5]);
		expect(positions[3]).toEqual([0.5, 0.5, 0.5]);
		expect([...indices]).toEqual([0, 1, 2, 1, 3, 2]);
		// Normals stay square to the surface: unit length.
		expect(Math.hypot(...vertices.slice(3, 6))).toBeCloseTo(1, 5);
	});

	it("keeps a FileMesh's own studs times its Scale over the part's size", () => {
		const { vertices } = meshGeometry(mesh, { asset: "1", scale: [0.5, 1, 2] });
		expect([...vertices.slice(3 * 6, 3 * 6 + 3)]).toEqual([1, 4, 12]);
	});
});

describe("a place's meshes", () => {
	function inst(className: string, props: Record<string, unknown>, children: RbxInstance[] = []) {
		const made = {
			className,
			name: className,
			parent: null,
			children,
			props: new Map(Object.entries(props).map(([k, v]) => [k, { type: "x", value: v }])),
			service: false,
		} as unknown as RbxInstance;
		for (const c of children) (c as { parent: RbxInstance | null }).parent = made;
		return made;
	}
	const at = { position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] };

	it("names each MeshPart's and FileMesh's mesh in its row, once per way it is drawn", () => {
		const parts = [
			inst("MeshPart", { CFrame: at, size: [2, 2, 2], MeshId: "rbxassetid://11" }),
			inst("MeshPart", { CFrame: at, size: [4, 4, 4], MeshId: "rbxassetid://11" }),
			inst("Part", { CFrame: at, size: [2, 4, 8] }, [
				inst("SpecialMesh", { MeshType: 5, MeshId: "rbxassetid://11", Scale: [1, 1, 1] }),
			]),
			inst("MeshPart", { CFrame: at, size: [1, 1, 1], MeshId: "" }),
		];
		const workspace = inst("Workspace", {}, parts);
		const ids = new Map(parts.map((p, i) => [p, i]));
		const scene = buildPlaceScene(workspace, (i) => ids.get(i));
		expect(scene.meshes).toEqual([{ asset: "11" }, { asset: "11", scale: [0.5, 0.25, 0.125] }]);
		const words = new Uint32Array(scene.kinds.mesh.data.buffer);
		const slots = Array.from(
			{ length: scene.kinds.mesh.count },
			(_, i) => words[i * SCENE_STRIDE + 14] >>> 16,
		);
		expect(slots).toEqual([1, 1, 2, 0]);
		// The rows whose mesh is here split off; the rest stay boxes.
		const split = splitByMesh(scene.kinds.mesh, (slot) => slot === 0);
		expect(split.meshes.get(0)?.count).toBe(2);
		expect(split.rest.count).toBe(2);
	});
});
