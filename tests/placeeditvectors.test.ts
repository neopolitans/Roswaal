/**
 * Changing vectors, sizes, UDims and CFrames in a place: a field a component,
 * a CFrame as its position and orientation, each written into the one chunk
 * or element that holds it, with its neighbours as they were.
 */

import { describe, expect, it } from "vitest";

import { propertyEdit } from "../src/core/rbx/browse.js";
import { readChunks } from "../src/core/rbx/chunks.js";
import { orientationOf, rotationOf, storedValue, writeProperty } from "../src/core/rbx/edit.js";
import { type CFrameValue, type RbxInstance, readRbx } from "../src/core/rbx/index.js";
import { buildPlace, type FixtureInstance, service } from "./rbxfixture.js";

const turned = rotationOf([10, 20, 30]);

const part = (name: string, n: number, frame: object): FixtureInstance => ({
	className: "Part",
	name,
	props: {
		size: { type: 14, value: [n, 2 * n, 3 * n] },
		CFrame: { type: 16, value: frame },
	},
});

const place = () =>
	buildPlace([
		service("Workspace", [
			// Three CFrames of three sizes in the chunk: a matrix, a square turn, a matrix.
			part("A", 1, { position: [1, 2, 3], rotation: turned }),
			part("B", 2, { position: [4, 5, 6], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], id: 2 }),
			part("C", 3, { position: [7, 8, 9], rotation: turned }),
		]),
		service("StarterGui", [
			{
				className: "Frame",
				name: "Panel",
				props: {
					Size: { type: 7, value: [0.5, 10, 0.25, 20] },
					AnchorPoint: { type: 13, value: [0.5, 0.5] },
				},
			},
			{ className: "UICorner", name: "Round", props: { CornerRadius: { type: 6, value: [0, 8] } } },
			{
				className: "ImageLabel",
				name: "Icon",
				props: { SliceCenter: { type: 24, value: [1, 2, 3, 4] } },
			},
			{
				className: "ParticleEmitter",
				name: "Sparks",
				props: { Lifetime: { type: 23, value: [1, 2] } },
			},
		]),
	]);

const named = (doc: ReturnType<typeof readRbx>, name: string): RbxInstance =>
	doc.instances.find((i) => i.name === name)!;

function change(bytes: Uint8Array, name: string, stored: string, input: unknown) {
	const doc = readRbx(bytes);
	const inst = named(doc, name);
	const edit = propertyEdit(inst, stored);
	if (!edit) throw new Error(`${stored} offers no edit`);
	const out = writeProperty(
		bytes,
		doc,
		inst,
		stored,
		storedValue(edit, inst.props.get(stored)!, input),
	);
	return { out, doc: readRbx(out) };
}

const close = (got: readonly number[], want: readonly number[]) =>
	want.forEach((v, i) => expect(got[i]).toBeCloseTo(v, 4));

describe("which vectors may change", () => {
	const doc = readRbx(place());

	it("offers a field a component, named as Studio names them", () => {
		expect(propertyEdit(named(doc, "A"), "size")).toEqual({
			stored: "size",
			kind: "vector",
			value: [1, 2, 3],
			fields: ["X", "Y", "Z"],
		});
		expect(propertyEdit(named(doc, "Panel"), "Size")).toMatchObject({
			fields: ["X Scale", "X Offset", "Y Scale", "Y Offset"],
			whole: [false, true, false, true],
		});
		expect(propertyEdit(named(doc, "Round"), "CornerRadius")).toMatchObject({
			fields: ["Scale", "Offset"],
		});
		expect(propertyEdit(named(doc, "Icon"), "SliceCenter")).toMatchObject({
			fields: ["Min X", "Min Y", "Max X", "Max Y"],
		});
		expect(propertyEdit(named(doc, "Sparks"), "Lifetime")).toMatchObject({
			fields: ["Min", "Max"],
		});
	});

	it("offers a CFrame as its position and its orientation in degrees", () => {
		const edit = propertyEdit(named(doc, "A"), "CFrame")!;
		expect(edit.kind).toBe("cframe");
		const value = edit.value as { position: number[]; orientation: number[] };
		close(value.position, [1, 2, 3]);
		close(value.orientation, [10, 20, 30]);
	});

	it("turns as Studio does: about Y, then X, then Z", () => {
		close(rotationOf([0, 90, 0]), [0, 0, 1, 0, 1, 0, -1, 0, 0]);
		close(orientationOf(rotationOf([-35, 120, 15])), [-35, 120, 15]);
	});
});

describe("writing a vector or a CFrame into a binary place", () => {
	it("changes one part's size and leaves the others and every other chunk alone", () => {
		const bytes = place();
		const { out, doc } = change(bytes, "B", "size", [10, 20, 30.5]);
		close(named(doc, "B").props.get("size")!.value as number[], [10, 20, 30.5]);
		close(named(doc, "A").props.get("size")!.value as number[], [1, 2, 3]);
		close(named(doc, "C").props.get("size")!.value as number[], [3, 6, 9]);
		const was = readChunks(bytes).map((c) => c.whole.join());
		expect(readChunks(out).filter((c, i) => c.whole.join() !== was[i])).toHaveLength(1);
	});

	it("moves a CFrame without touching its rotation, and turns one beside a square turn", () => {
		const bytes = place();
		const moved = change(bytes, "A", "CFrame", { position: [100, 0, -5] });
		const a = named(moved.doc, "A").props.get("CFrame")!.value as CFrameValue;
		close(a.position, [100, 0, -5]);
		expect(a.rotation).toEqual(turned.map(Math.fround));

		const spun = change(moved.out, "B", "CFrame", { position: [4, 5, 6], orientation: [0, 90, 0] });
		const b = named(spun.doc, "B").props.get("CFrame")!.value as CFrameValue;
		close(b.rotation, [0, 0, 1, 0, 1, 0, -1, 0, 0]);
		// Its neighbours, one each side, as they were.
		const c = named(spun.doc, "C").props.get("CFrame")!.value as CFrameValue;
		close(c.position, [7, 8, 9]);
		expect(c.rotation).toEqual(turned.map(Math.fround));
		expect((named(spun.doc, "A").props.get("CFrame")!.value as CFrameValue).position).toEqual([
			100, 0, -5,
		]);
	});

	it("writes UDim2, UDim, Vector2, Rect and NumberRange", () => {
		let bytes = place();
		const steps: [string, string, number[]][] = [
			["Panel", "Size", [1, -4, 0.5, 36]],
			["Panel", "AnchorPoint", [0, 1]],
			["Round", "CornerRadius", [0.25, 12]],
			["Icon", "SliceCenter", [5, 6, 7, 8]],
			["Sparks", "Lifetime", [0.5, 3]],
		];
		for (const [name, stored, value] of steps) {
			const { out, doc } = change(bytes, name, stored, value);
			close(named(doc, name).props.get(stored)!.value as number[], value);
			bytes = out;
		}
	});

	it("refuses components that do not fit", () => {
		const doc = readRbx(place());
		const value = (name: string, stored: string, input: unknown) => {
			const inst = named(doc, name);
			return storedValue(propertyEdit(inst, stored)!, inst.props.get(stored)!, input);
		};
		expect(() => value("A", "size", [1, 2])).toThrow(/3 numbers: X, Y, Z/);
		expect(() => value("Round", "CornerRadius", [0, 1.5])).toThrow(/Offset is a whole number/);
		expect(() => value("Sparks", "Lifetime", [3, 1])).toThrow(/Min is above its Max/);
		expect(() => value("A", "CFrame", { position: [1, 2] })).toThrow(/Position is three numbers/);
		expect(() => value("A", "CFrame", { position: [1, 2, 3], orientation: [0, "x", 0] })).toThrow(
			/Orientation/,
		);
	});
});

const XML = `<roblox version="4">
	<Item class="Part" referent="RBX1">
		<Properties>
			<CoordinateFrame name="CFrame">
				<X>1</X>
				<Y>2</Y>
				<Z>3</Z>
				<R00>1</R00><R01>0</R01><R02>0</R02><R10>0</R10><R11>1</R11><R12>0</R12><R20>0</R20><R21>0</R21><R22>1</R22>
			</CoordinateFrame>
			<string name="Name">Floor</string>
			<Vector3 name="size">
				<X>4</X>
				<Y>1</Y>
				<Z>2</Z>
			</Vector3>
		</Properties>
	</Item>
	<Item class="Frame" referent="RBX2">
		<Properties>
			<string name="Name">Panel</string>
			<UDim2 name="Size"><XS>0</XS><XO>100</XO><YS>0</YS><YO>50</YO></UDim2>
		</Properties>
	</Item>
	<Item class="ImageLabel" referent="RBX3">
		<Properties>
			<string name="Name">Icon</string>
			<Rect2D name="SliceCenter"><min><X>0</X><Y>0</Y></min><max><X>0</X><Y>0</Y></max></Rect2D>
		</Properties>
	</Item>
	<Item class="ParticleEmitter" referent="RBX4">
		<Properties>
			<string name="Name">Sparks</string>
			<NumberRange name="Lifetime">1 2 </NumberRange>
		</Properties>
	</Item>
</roblox>
`;

describe("writing a vector or a CFrame into an XML place", () => {
	const bytes = new TextEncoder().encode(XML);
	const text = (out: Uint8Array) => new TextDecoder().decode(out);

	it("replaces each component's own element, keeping the file's layout", () => {
		const { out } = change(bytes, "Floor", "size", [8, 0.5, 2]);
		expect(text(out)).toBe(
			XML.replace("<X>4</X>", "<X>8</X>").replace(
				"<Y>1</Y>\n\t\t\t\t<Z>2</Z>",
				"<Y>0.5</Y>\n\t\t\t\t<Z>2</Z>",
			),
		);
	});

	it("writes a CFrame's position and rotation, a UDim2, a Rect and a NumberRange", () => {
		const cf = change(bytes, "Floor", "CFrame", { position: [1, 2, 3], orientation: [0, 90, 0] });
		close(
			(named(cf.doc, "Floor").props.get("CFrame")!.value as CFrameValue).rotation,
			[0, 0, 1, 0, 1, 0, -1, 0, 0],
		);
		expect(text(cf.out)).toContain("<R02>1</R02>");
		const udim = change(bytes, "Panel", "Size", [0.5, 0, 1, -10]);
		expect(text(udim.out)).toContain(
			'<UDim2 name="Size"><XS>0.5</XS><XO>0</XO><YS>1</YS><YO>-10</YO></UDim2>',
		);
		const rect = change(bytes, "Icon", "SliceCenter", [1, 2, 3, 4]);
		expect(text(rect.out)).toContain("<min><X>1</X><Y>2</Y></min><max><X>3</X><Y>4</Y></max>");
		const range = change(bytes, "Sparks", "Lifetime", [0.5, 4]);
		expect(text(range.out)).toContain('<NumberRange name="Lifetime">0.5 4 </NumberRange>');
	});
});
