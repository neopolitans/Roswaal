/**
 * The code on a code node's face, and nodes that are only their header
 * (0.170.0). The canvas, the wires and the documentation's drawings all read
 * `codeFace.ts`; `tests/preview.test.ts` holds the drawings to the canvas.
 */

import { describe, expect, it } from "vitest";

import { CODE_FACE, codeFaceOf, codeFacePinY, codeFaceWidth } from "../src/core/codeFace.js";
import { nodeBounds, resolvePins } from "../src/core/nodeBox.js";
import { NODE } from "../src/core/nodeMetrics.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { GraphNode } from "../src/core/schema.js";
import { pinPosition } from "../src/app/geometry.js";

const registry = createRegistry();

function faceOf(node: GraphNode) {
	const def = registry.get(node.def)!;
	const { inputs, outputs } = resolvePins(def, node.config, node.literals);
	return codeFaceOf(def, node, inputs, outputs);
}

const block = (code: string): GraphNode => ({
	id: "b",
	def: "code.custom",
	x: 0,
	y: 0,
	literals: { code: { t: "raw", v: code } },
});

describe("the code face", () => {
	it("shows six lines, then says how many more", () => {
		const code = Array.from({ length: 10 }, (_, i) => `print(${i})`).join("\n");
		const face = faceOf(block(code));
		expect(face?.lines).toHaveLength(CODE_FACE.lines);
		expect(face?.more).toBe(4);
	});

	it("drops blank lines at either end and shows tabs as two spaces", () => {
		const face = faceOf(block("\n\nif x then\n\tprint(x)\nend\n\n"));
		expect(face?.lines).toEqual(["if x then", "  print(x)", "end"]);
	});

	it("widens the node to its longest line, within bounds", () => {
		const short = faceOf(block("x()"))!;
		const long = faceOf(block("newPart.Material = Enum.Material.Neon"))!;
		const huge = faceOf(block("x".repeat(400)))!;
		expect(codeFaceWidth(short)).toBe(NODE.width);
		expect(codeFaceWidth(long)).toBeGreaterThan(NODE.width);
		expect(codeFaceWidth(huge)).toBe(CODE_FACE.maxWidth);
		expect(nodeBounds(block("x".repeat(400)), registry).w).toBe(CODE_FACE.maxWidth);
	});

	it("writes a Declare Type out as the compiler does, and says what is missing", () => {
		const declared = (config: Record<string, unknown>): GraphNode => ({
			id: "t",
			def: "type.declareTop",
			x: 0,
			y: 0,
			config,
		});
		expect(
			faceOf(declared({ name: "Tank", shape: "written", definition: "{ hull: BasePart }" }))?.lines,
		).toEqual(["export type Tank = { hull: BasePart }"]);
		expect(faceOf(declared({ shape: "written", definition: "{}" }))?.empty).toBe("Name the type");
		expect(faceOf(declared({ name: "Tank", shape: "written" }))?.empty).toBe("Write the type");
		expect(faceOf(declared({}))?.empty).toBe("Name it, and write the type");
	});

	it("puts a Luau Expression's pins level with its first line, where the wires meet them", () => {
		const node: GraphNode = {
			id: "e",
			def: "value.expression",
			x: 100,
			y: 200,
			literals: { code: { t: "raw", v: "if a then b else c" } },
		};
		const face = faceOf(node)!;
		const y = node.y + codeFacePinY(NODE.headerHeight, face);
		expect(pinPosition(node, registry, "code", "in")?.y).toBe(y);
		expect(pinPosition(node, registry, "result", "out")?.y).toBe(y);
	});

	it("is not given to a node that does not hold code", () => {
		expect(faceOf({ id: "p", def: "debug.print", x: 0, y: 0 })).toBeUndefined();
	});
});

describe("a node with nothing under its header", () => {
	it("is only its header", () => {
		expect(nodeBounds({ id: "s", def: "script.begin", x: 0, y: 0 }, registry).h).toBe(
			NODE.headerHeight,
		);
	});
});
