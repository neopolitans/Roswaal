/**
 * Header colours that are a rule rather than a category.
 */

import { describe, expect, it } from "vitest";

import { nodeColor } from "../src/app/palette.js";
import { createRegistry } from "../src/core/nodes/index.js";

const registry = createRegistry();
const colourOf = (id: string) => nodeColor(registry.get(id)!);

describe("header colours", () => {
	it("draws Declare Function the colour Function is drawn", () => {
		expect(colourOf("function.declareHere")).toBe(colourOf("function.entry"));
	});

	it("draws a preview of it the same, from the fields a preview carries", () => {
		const def = registry.get("function.declareHere")!;
		expect(nodeColor({ id: def.id, category: def.category, role: def.role }))
			.toBe(colourOf("function.entry"));
	});

	it("leaves the rest of Flow its own colour", () => {
		expect(colourOf("flow.branch")).not.toBe(colourOf("function.entry"));
	});
});
