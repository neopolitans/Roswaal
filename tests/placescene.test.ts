/**
 * The viewport's scene: a place's Workspace as instance buffers, built by the
 * host, with each part's id its row in the DataModel browser.
 */

import { readFileSync } from "node:fs";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { fromBase64 } from "../src/core/base64.js";
import { outlinePlace } from "../src/core/rbx/browse.js";
import type { Prop, PropType, RbxInstance } from "../src/core/rbx/dom.js";
import { readRbx } from "../src/core/rbx/index.js";
import { sunDirection } from "../src/core/rbx/lighting.js";
import { buildPlaceScene, SCENE_KINDS, SCENE_STRIDE } from "../src/core/rbx/scene.js";
import { ApiSession } from "../src/server/routes.js";

const M103 = path.join(import.meta.dirname, "..", "examples", "m103", "place.rbxl");

function m103() {
	const doc = readRbx(new Uint8Array(readFileSync(M103)));
	const { order } = outlinePlace(doc);
	const index = new Map(order.map((inst, i) => [inst, i]));
	const workspace = doc.roots.find((r) => r.className === "Workspace") as RbxInstance;
	return { order, scene: buildPlaceScene(workspace, (i) => index.get(i)) };
}

function inst(
	className: string,
	props: Record<string, [PropType, unknown]>,
	children: RbxInstance[] = [],
) {
	const made: RbxInstance = {
		className,
		name: className,
		parent: null,
		children,
		props: new Map<string, Prop>(
			Object.entries(props).map(([k, [type, value]]) => [k, { type, value }]),
		),
		service: false,
	};
	for (const child of children) child.parent = made;
	return made;
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const part = (
	className: string,
	size: number[],
	extra: Record<string, [PropType, unknown]> = {},
	kids: RbxInstance[] = [],
) =>
	inst(
		className,
		{
			CFrame: ["CFrame", { position: [10, 20, 30], rotation: IDENTITY }],
			size: ["Vector3", size],
			...extra,
		},
		kids,
	);

/** One shape's instances, each as its 12 transform words, colour and id. */
function rows(data: Float32Array) {
	const words = new Uint32Array(data.buffer, data.byteOffset, data.length);
	return Array.from({ length: data.length / SCENE_STRIDE }, (_, n) => ({
		transform: [...data.slice(n * SCENE_STRIDE, n * SCENE_STRIDE + 12)],
		colour: words[n * SCENE_STRIDE + 12],
		id: words[n * SCENE_STRIDE + 13],
	}));
}

function sceneOf(...parts: RbxInstance[]) {
	const workspace = inst("Workspace", {}, parts);
	const ids = new Map(parts.map((p, i) => [p, i]));
	return buildPlaceScene(workspace, (i) => ids.get(i));
}

describe("A place's scene", () => {
	it("holds M103's parts by shape, leaving the invisible ones out", () => {
		const { scene } = m103();
		const counts = Object.fromEntries(SCENE_KINDS.map((k) => [k, scene.kinds[k].count]));
		expect(counts).toEqual({ block: 2, wedge: 0, cornerWedge: 0, cylinder: 0, ball: 0, mesh: 22 });
		expect(scene.transparent).toBe(2);
		expect(scene.radius).toBeGreaterThanOrEqual(50);
	});

	it("names each part by its row in the DataModel browser", () => {
		const { scene, order } = m103();
		const found = rows(scene.kinds.block.data).map((r) => [
			order[r.id].className,
			order[r.id].name,
		]);
		expect(found).toEqual([
			["Part", "Baseplate"],
			["SpawnLocation", "SpawnLocation"],
		]);
		const baseplate = rows(scene.kinds.block.data)[0];
		expect(baseplate.transform).toEqual([2048, 0, 0, 0, 16, 0, 0, 0, 2048, 0, -8, 0]);
		for (const r of rows(scene.kinds.mesh.data)) expect(order[r.id].className).toBe("MeshPart");
	});

	it("draws a part's Shape and its colour", () => {
		const scene = sceneOf(
			part("Part", [2, 4, 6], { shape: ["Enum", 0], Color3uint8: ["Color3uint8", [255, 0, 16]] }),
			part("Part", [2, 4, 6], { shape: ["Enum", 2] }),
			part("WedgePart", [2, 4, 6]),
		);
		const ball = rows(scene.kinds.ball.data)[0];
		// A ball is as wide as the part's smallest side.
		expect(ball.transform.slice(0, 9)).toEqual([2, 0, 0, 0, 2, 0, 0, 0, 2]);
		expect(ball.colour).toBe(0xff1000ff);
		expect(scene.kinds.cylinder.count).toBe(1);
		expect(rows(scene.kinds.wedge.data)[0].id).toBe(2);
	});

	it("scales and offsets the shape a mesh modifier stands for", () => {
		const special = inst("SpecialMesh", {
			MeshType: ["Enum", 3],
			Scale: ["Vector3", [2, 2, 2]],
			Offset: ["Vector3", [0, 1, 0]],
		});
		const scene = sceneOf(part("Part", [2, 2, 2], {}, [special]));
		const ball = rows(scene.kinds.ball.data)[0];
		expect(ball.transform).toEqual([4, 0, 0, 0, 4, 0, 0, 0, 4, 10, 21, 30]);
	});

	it("stands a CylinderMesh upright along the part's Y", () => {
		const scene = sceneOf(part("Part", [2, 8, 2], {}, [inst("CylinderMesh", {})]));
		const cylinder = rows(scene.kinds.cylinder.data)[0];
		// The unit cylinder's axis is X: here it is the part's Y, 8 long.
		expect(cylinder.transform.slice(0, 3)).toEqual([0, 8, 0]);
		expect(cylinder.transform.slice(3, 6).map(Math.abs)).toEqual([2, 0, 0]);
	});

	it("leaves out fully transparent parts and counts them", () => {
		const scene = sceneOf(
			part("Part", [1, 1, 1], { Transparency: ["Float32", 1] }),
			part("Part", [1, 1, 1]),
		);
		expect(scene.kinds.block.count).toBe(1);
		expect(scene.transparent).toBe(1);
	});

	it("keeps where Studio's camera was when the place was saved", () => {
		const { scene, order } = m103();
		expect(scene.camera).toBeDefined();
		expect(order[scene.camera?.id ?? -1].className).toBe("Camera");
		expect(scene.camera?.rotation).toHaveLength(9);
		expect(scene.camera?.fieldOfView).toBeGreaterThan(0);
	});
});

describe("A place's light", () => {
	it("puts the sun where Lighting:GetSunDirection() does", () => {
		// Studio's answer at 14:30, latitude 0.
		const sun = sunDirection(14.5, 0);
		for (const [ours, studio] of sun.map((v, i) => [v, [-0.558, 0.728, -0.399][i]]))
			expect(ours).toBeCloseTo(studio, 2);
	});
});

describe("The scene route", () => {
	let root: string | undefined;
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
		root = undefined;
	});

	it("sends each shape's buffer for this version of the place", async () => {
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-scene-"));
		await writeFile(path.join(root, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
		await copyFile(M103, path.join(root, "place.rbxl"));
		const session = new ApiSession({});
		await session.openAt(root);
		const tree = (await session.handle("GET", "/place")) as { stamp: string };
		const answer = (await session.handle("GET", "/place/scene", {
			query: { stamp: tree.stamp },
		})) as {
			kinds: Record<string, { data: string; count: number }>;
			transparent: number;
		};
		expect(answer.kinds.mesh.count).toBe(22);
		const block = new Float32Array(fromBase64(answer.kinds.block.data).buffer);
		expect(block.length).toBe(2 * SCENE_STRIDE);
		expect(block[0]).toBe(2048);
		const lighting = (answer as { lighting?: { sun: number[]; notes: [string, string][] } })
			.lighting;
		expect(lighting?.sun).toHaveLength(3);
		// What lights it, as Properties' rows: a name and what it is.
		expect(lighting?.notes.map(([name]) => name)).toEqual(["Haze", "Sunlight", "Sky"]);
		await expect(
			session.handle("GET", "/place/scene", { query: { stamp: "old" } }),
		).rejects.toThrow(/changed/);
	});
});
