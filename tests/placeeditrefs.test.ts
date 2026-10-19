/**
 * Changing a reference in a place: a Model's PrimaryPart pointed at another
 * part, or at nothing, in a binary and an XML place, and refused when what it
 * points at is not the class the property takes.
 */

import { describe, expect, it } from "vitest";

import { outlinePlace, propertyEdit } from "../src/core/rbx/browse.js";
import { storedValue, writeProperty } from "../src/core/rbx/edit.js";
import { RbxError, type RbxInstance, readRbx } from "../src/core/rbx/index.js";
import { convertPlace } from "../src/core/rbx/serialize.js";
import { buildPlace, type FixtureInstance, service } from "./rbxfixture.js";

// Referents count from 0 in visit order: Workspace 0, Tank 1, Hull 2, Turret 3,
// Bits 4, Link 5.
const tree = (): FixtureInstance[] => [
	service("Workspace", [
		{
			className: "Model",
			name: "Tank",
			props: { PrimaryPart: { type: 19, value: 2 } },
			children: [
				{ className: "Part", name: "Hull", props: { Anchored: { type: 2, value: true } } },
				{ className: "Part", name: "Turret", props: { Anchored: { type: 2, value: false } } },
				{ className: "Folder", name: "Bits" },
			],
		},
	]),
	{ className: "ObjectValue", name: "Link", props: { Value: { type: 19, value: -1 } } },
];

function setRef(bytes: Uint8Array, owner: string, property: string, to: string | null) {
	const doc = readRbx(bytes);
	const { order } = outlinePlace(doc);
	const inst = order.find((i) => i.name === owner)!;
	const edit = propertyEdit(inst, property)!;
	const index = to === null ? null : order.findIndex((i) => i.name === to);
	const value = storedValue(edit, inst.props.get(property)!, index, (i) => order[i]);
	return writeProperty(bytes, doc, inst, property, value);
}

const pointsAt = (bytes: Uint8Array, owner: string, property: string) => {
	const inst = readRbx(bytes).instances.find((i) => i.name === owner)!;
	return (inst.props.get(property)?.value as RbxInstance | null)?.name ?? null;
};

describe("a reference in Properties", () => {
	it("is offered as one, of the class the property takes", () => {
		const doc = readRbx(buildPlace(tree()));
		const tank = doc.instances.find((i) => i.name === "Tank")!;
		expect(propertyEdit(tank, "PrimaryPart")).toMatchObject({
			kind: "ref",
			refClass: "BasePart",
			value: "Hull",
		});
	});
});

describe.each(["binary", "xml"] as const)("a reference written into a %s place", (format) => {
	const place = () => {
		const bytes = buildPlace(tree());
		return format === "binary" ? bytes : convertPlace(bytes, "rbxlx").bytes;
	};

	it("points at another instance", () => {
		const out = setRef(place(), "Tank", "PrimaryPart", "Turret");
		expect(pointsAt(out, "Tank", "PrimaryPart")).toBe("Turret");
		// Everything else as it was.
		expect(pointsAt(out, "Link", "Value")).toBeNull();
		expect(readRbx(out).instances.length).toBe(readRbx(place()).instances.length);
	});

	it("points at nothing, and back at something", () => {
		const cleared = setRef(place(), "Tank", "PrimaryPart", null);
		expect(pointsAt(cleared, "Tank", "PrimaryPart")).toBeNull();
		const linked = setRef(cleared, "Link", "Value", "Tank");
		expect(pointsAt(linked, "Link", "Value")).toBe("Tank");
		expect(pointsAt(linked, "Tank", "PrimaryPart")).toBeNull();
	});

	it("refuses what is not the class the property takes", () => {
		expect(() => setRef(place(), "Tank", "PrimaryPart", "Bits")).toThrow(RbxError);
		expect(() => setRef(place(), "Tank", "PrimaryPart", "Bits")).toThrow(/is a BasePart/);
	});
});
