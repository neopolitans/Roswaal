/**
 * What a class's properties resolve to.
 *
 * The catalogue stores each class's *own* properties and nothing else, so every
 * useful answer comes out of the walk up `CLASS_PARENTS` rather than out of the
 * data. `Part` declares one property of its own; the two hundred that make it a
 * part are `BasePart`'s, and `Name` is `Instance`'s. If the walk breaks, the
 * lists go nearly empty and nothing else in the build would say so.
 */

import { describe, expect, it } from "vitest";

import { CLASS_PROPERTIES, propertiesOf } from "../src/core/robloxProperties.js";

/** The property of `className` called `name`, or `undefined`. */
const find = (className: string, name: string) =>
	propertiesOf(className).find((property) => property.name === name);

describe("propertiesOf", () => {
	it("gathers a part's own, its BasePart's and its Instance's", () => {
		expect(find("Part", "Position")?.type).toBe("Vector3");
		expect(find("Part", "Anchored")?.type).toBe("boolean");
		expect(find("Part", "Name")?.type).toBe("string");
	});

	it("gives a class the catalogue has never heard of an empty list", () => {
		expect(propertiesOf("NotAClassRobloxHas")).toEqual([]);
	});

	it("lists no property twice, however deep the chain", () => {
		for (const className of Object.keys(CLASS_PROPERTIES)) {
			const names = propertiesOf(className).map((property) => property.name);
			expect(new Set(names).size, `${className} lists a property twice`).toBe(names.length);
		}
	});
});
