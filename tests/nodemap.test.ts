import { describe, expect, it } from "vitest";
import { compileNodeMap, emptyMap, type NodeMap } from "../src/core/nodemap.js";

let counter = 0;
const id = () => `id${++counter}`;

function makeMap(): NodeMap {
	counter = 0;
	return emptyMap("demo", "map-test", id);
}

describe("node maps", () => {
	it("compiles to a Rojo project file", () => {
		const map = makeMap();
		const result = compileNodeMap(map);

		expect(result.ok).toBe(true);
		expect(JSON.parse(result.json)).toEqual({
			name: "demo",
			tree: {
				$className: "DataModel",
				ServerScriptService: {
					Source: { $className: "Folder", $path: "src" },
				},
			},
		});
	});

	/**
	 * Rojo infers a service from its key and rejects a redundant $className, so
	 * the emitter has to know which nodes are services and stay quiet for them.
	 */
	it("omits $className on services but keeps it on containers", () => {
		const map = makeMap();
		const tree = JSON.parse(compileNodeMap(map).json).tree;

		expect(tree.ServerScriptService.$className).toBeUndefined();
		expect(tree.ServerScriptService.Source.$className).toBe("Folder");
	});

	it("passes properties and ignoreUnknown through", () => {
		const map = makeMap();
		map.root.children[0].children[0].properties = { Archivable: false };
		map.root.children[0].children[0].ignoreUnknown = true;

		const folder = JSON.parse(compileNodeMap(map).json).tree.ServerScriptService.Source;
		expect(folder.$properties).toEqual({ Archivable: false });
		expect(folder.$ignoreUnknownInstances).toBe(true);
	});

	it("rejects two children with the same name", () => {
		const map = makeMap();
		const service = map.root.children[0];
		service.children.push({ ...service.children[0], id: "dupe" });

		const result = compileNodeMap(map);
		expect(result.ok).toBe(false);
		expect(result.diagnostics[0].message).toContain("two children");
	});

	it("warns about an instance that does nothing", () => {
		const map = makeMap();
		map.root.children.push({ id: "empty", name: "Nowhere", children: [] });

		const messages = compileNodeMap(map).diagnostics.map((d) => d.message);
		expect(messages.join(" ")).toContain("does nothing");
	});

	it("is stable across compiles", () => {
		const map = makeMap();
		expect(compileNodeMap(map).json).toBe(compileNodeMap(map).json);
	});
});
