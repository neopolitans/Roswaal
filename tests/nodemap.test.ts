import { describe, expect, it } from "vitest";
import {
	compileNodeMap, emptyMap, locateInDataModel, type NodeMap,
} from "../src/core/nodemap.js";

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
		// No $className on Source: a $path pointing at a directory already means
		// Folder, and saying it twice makes an empty result look intentional.
		expect(JSON.parse(result.json)).toEqual({
			name: "demo",
			tree: {
				$className: "DataModel",
				ServerScriptService: {
					Source: { $path: "src" },
				},
			},
		});
	});

	/**
	 * Rojo infers a service from its key and rejects a redundant $className, so
	 * the emitter has to know which nodes are services and stay quiet for them.
	 */
	it("omits $className where Rojo already knows the class", () => {
		const map = makeMap();
		let tree = JSON.parse(compileNodeMap(map).json).tree;

		// Services are named by their key; a folder is implied by its path.
		expect(tree.ServerScriptService.$className).toBeUndefined();
		expect(tree.ServerScriptService.Source.$className).toBeUndefined();

		// A class Rojo would not infer is still stated.
		map.root.children[0].children[0].className = "Model";
		tree = JSON.parse(compileNodeMap(map).json).tree;
		expect(tree.ServerScriptService.Source.$className).toBe("Model");
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

/**
 * Rojo deserialises its project file strictly: any key it does not recognise
 * fails the whole parse. An earlier build stamped an ownership marker into the
 * document and broke every project that used one, so this guards the shape.
 */
describe("Rojo compatibility", () => {
	const ROJO_TOP_LEVEL = new Set([
		"name", "tree", "servePort", "serveAddress", "servePlaceIds",
		"placeId", "gameId", "globIgnorePaths", "emitLegacyScripts",
	]);

	const ROJO_TREE_KEYS = new Set([
		"$className", "$path", "$properties", "$ignoreUnknownInstances", "$attributes",
	]);

	it("emits only top-level keys Rojo knows", () => {
		const parsed = JSON.parse(compileNodeMap(makeMap()).json) as Record<string, unknown>;
		for (const key of Object.keys(parsed)) {
			expect(ROJO_TOP_LEVEL.has(key), `unexpected top-level key "${key}"`).toBe(true);
		}
	});

	it("emits only tree directives Rojo knows", () => {
		const map = makeMap();
		map.root.children[0].children[0].properties = { Archivable: false };
		map.root.children[0].children[0].ignoreUnknown = true;

		const seen: string[] = [];
		const walk = (node: Record<string, unknown>) => {
			for (const [key, value] of Object.entries(node)) {
				if (key.startsWith("$")) seen.push(key);
				else walk(value as Record<string, unknown>);
			}
		};
		walk((JSON.parse(compileNodeMap(map).json) as { tree: Record<string, unknown> }).tree);

		for (const key of seen) {
			expect(ROJO_TREE_KEYS.has(key), `unexpected tree key "${key}"`).toBe(true);
		}
	});
});

describe("ignore globs", () => {
	it("anchors a node's ignore paths to that node's path", () => {
		const map = makeMap();
		map.root.children[0].children[0].ignorePaths = ["shared/**", "*.spec.luau"];

		const project = JSON.parse(compileNodeMap(map).json);
		expect(project.globIgnorePaths).toEqual(["src/shared/**", "src/*.spec.luau"]);
	});

	it("leaves a leading-slash glob unanchored", () => {
		const map = makeMap();
		map.root.children[0].children[0].ignorePaths = ["/build/**"];

		expect(JSON.parse(compileNodeMap(map).json).globIgnorePaths).toEqual(["build/**"]);
	});

	it("merges project-wide globs and drops duplicates", () => {
		const map = makeMap();
		map.globIgnorePaths = ["**/*.spec.luau"];
		map.root.children[0].children[0].ignorePaths = ["/**/*.spec.luau", "shared/**"];

		expect(JSON.parse(compileNodeMap(map).json).globIgnorePaths).toEqual([
			"**/*.spec.luau",
			"src/shared/**",
		]);
	});

	it("omits the key entirely when there is nothing to ignore", () => {
		expect(JSON.parse(compileNodeMap(makeMap()).json).globIgnorePaths).toBeUndefined();
	});
});

describe("locating a file in the DataModel", () => {
	/** The layout the demo uses: a folder per service, mapped straight at it. */
	function serviceMap(): NodeMap {
		return {
			schemaVersion: 1,
			kind: "map",
			id: "m",
			name: "demo",
			output: "default.project.json",
			root: {
				id: "root",
				name: "DataModel",
				className: "DataModel",
				children: [
					{ id: "rs", name: "ReplicatedStorage", path: "src/ReplicatedStorage", children: [] },
					{ id: "sss", name: "ServerScriptService", path: "src/ServerScriptService", children: [] },
				],
			},
		};
	}

	it("resolves a module to its service and path", () => {
		expect(locateInDataModel(serviceMap(), "src/ReplicatedStorage/Greeter.luau")).toEqual({
			root: "ReplicatedStorage",
			path: "Greeter",
			isModule: true,
		});
	});

	it("keeps intermediate folders as path segments", () => {
		expect(
			locateInDataModel(serviceMap(), "src/ReplicatedStorage/Modules/Combat/Damage.luau"),
		).toEqual({ root: "ReplicatedStorage", path: "Modules.Combat.Damage", isModule: true });
	});

	it("knows a server script is not requirable", () => {
		expect(locateInDataModel(serviceMap(), "src/ServerScriptService/Main.server.luau")).toEqual({
			root: "ServerScriptService",
			path: "Main",
			isModule: false,
		});
	});

	/** Rojo's init.luau is the folder itself, so it adds no segment. */
	it("treats init.luau as the folder it sits in", () => {
		expect(locateInDataModel(serviceMap(), "src/ReplicatedStorage/Combat/init.luau")).toEqual({
			root: "ReplicatedStorage",
			path: "Combat",
			isModule: true,
		});
	});

	it("resolves a graph as well as its compiled output", () => {
		const map = serviceMap();
		map.root.children[0].path = ".roswaal/scripts/ReplicatedStorage";
		expect(
			locateInDataModel(map, ".roswaal/scripts/ReplicatedStorage/Greeter.nodescript"),
		).toEqual({ root: "ReplicatedStorage", path: "Greeter", isModule: true });
	});

	it("prefers the most specific mapping when one nests inside another", () => {
		const map = serviceMap();
		map.root.children[0].children.push({
			id: "inner",
			name: "Shared",
			path: "src/ReplicatedStorage/Shared",
			children: [],
		});
		expect(locateInDataModel(map, "src/ReplicatedStorage/Shared/Util.luau")).toEqual({
			root: "ReplicatedStorage",
			path: "Shared.Util",
			isModule: true,
		});
	});

	it("returns null for a file no mapping covers", () => {
		expect(locateInDataModel(serviceMap(), "docs/notes.luau")).toBeNull();
	});
});
