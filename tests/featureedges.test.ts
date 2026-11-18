import { describe, expect, it } from "vitest";
import { featureEdges, meshFor } from "../src/extensions/placeViewer/app/viewport/geometry.js";

/** The edges as pairs of positions, each pair sorted, for comparing by shape. */
function edgesOf(kind: Parameters<typeof meshFor>[0]): string[] {
	const mesh = meshFor(kind);
	const e = featureEdges(mesh);
	const at = (i: number) => [0, 1, 2].map((k) => mesh.vertices[i * 6 + k]).join(",");
	const out: string[] = [];
	for (let i = 0; i < e.length; i += 2) out.push([at(e[i]), at(e[i + 1])].sort().join(" "));
	return out;
}

describe("a wireframe's edges", () => {
	it("are a box's twelve, not its faces' diagonals", () => {
		const edges = edgesOf("block");
		expect(edges).toHaveLength(12);
		expect(new Set(edges).size).toBe(12);
	});

	it("are a wedge's nine", () => {
		expect(edgesOf("wedge")).toHaveLength(9);
	});

	it("keep every edge where faces meet at an angle, each once", () => {
		const edges = edgesOf("cylinder");
		expect(new Set(edges).size).toBe(edges.length);
		expect(edges.length).toBeGreaterThan(12);
	});

	it("keep an open edge, which only one triangle has", () => {
		const vertices = new Float32Array([0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1]);
		expect(featureEdges({ vertices, indices: new Uint16Array([0, 1, 2]) })).toHaveLength(6);
	});
});
