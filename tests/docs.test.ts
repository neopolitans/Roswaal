/**
 * The documentation, and the two promises it makes.
 *
 * The node reference is generated, so it cannot go stale — but "generated" only
 * buys that if the generator is exercised against the whole registry rather
 * than a couple of convenient nodes. And the Blueprint mapping is hand-written
 * prose that names node ids, which is exactly the kind of thing that rots
 * silently when a node is renamed. So it is checked.
 */

import { describe, expect, it } from "vitest";

import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
import {
	documentNode, documentRegistry, exampleFor, OMISSION_REASONS, stripHeader,
} from "../src/core/docs/nodeReference.js";
import { BLUEPRINT_MAP, referencedNodeIds } from "../src/core/docs/blueprints.js";
import { buildSearchIndex, buildSite, rankDocs } from "../src/core/docs/site.js";
import { CURATED, GUIDE_SCENES } from "../src/core/docs/examples.js";
import { compile } from "../src/core/compiler/index.js";
import type { NodeDef } from "../src/core/schema.js";

const registry = createRegistry();
const builtinIds = new Set(BUILTIN_NODES.map((d) => d.id));

describe("node reference", () => {
	it("documents every node in the registry", () => {
		const docs = documentRegistry(registry, builtinIds);
		expect(docs).toHaveLength(registry.size);
		for (const doc of docs) {
			expect(doc.title).not.toBe("");
			expect(doc.category).not.toBe("");
		}
	});

	it("carries a pin's type, default and whether it must be wired", () => {
		const look = documentNode(registry.get("cframe.lookAt")!, registry, builtinIds);
		const from = look.inputs.find((p) => p.id === "from")!;

		expect(from.type).toBe("Vector3");
		expect(from.default).toBe("Vector3.zero");
		expect(from.required).toBe(false);
		expect(from.splitModes).toEqual(["X, Y, Z"]);
	});

	it("marks the pins that cannot be wired", () => {
		const get = documentNode(registry.get("roblox.getProperty")!, registry, builtinIds);
		expect(get.inputs.find((p) => p.id === "property")!.literalOnly).toBe(true);
		expect(get.inputs.find((p) => p.id === "instance")!.literalOnly).toBe(false);
	});

	it("tells a pack's node apart from a built-in", () => {
		const pack: NodeDef = {
			id: "pack.thing", title: "Thing", category: "Custom",
			pure: true, inputs: [], outputs: [{ id: "result", name: "", kind: "data", type: "number" }],
			compilesTo: { kind: "expr", outputs: { result: "1" } },
		};
		const withPack = createRegistry([pack]);
		const docs = documentRegistry(withPack, builtinIds);

		expect(docs.find((d) => d.id === "pack.thing")!.custom).toBe(true);
		expect(docs.find((d) => d.id === "math.add")!.custom).toBe(false);
	});

	describe("worked examples", () => {
		/** The whole point: a page cannot claim output the emitter would not produce. */
		it("compiles a pure node into the position it would really appear in", () => {
			const example = exampleFor(registry.get("cframe.lookAt")!, registry);
			expect(example.luau).toBe(
				"print(CFrame.lookAt(Vector3.zero, Vector3.zero))",
			);
		});

		it("hangs an impure node off Script Start", () => {
			const example = exampleFor(registry.get("debug.print")!, registry);
			expect(example.luau).toBe(`print("Hello")`);
		});

		/**
		 * No example beats a wrong one. Every omission has to name a reason a
		 * reader can act on, so a page never just goes quiet.
		 */
		it("gives a reason whenever it declines to show one", () => {
			for (const doc of documentRegistry(registry, builtinIds)) {
				if (doc.example !== undefined) continue;
				expect(doc.exampleOmitted).toBeDefined();
				expect(OMISSION_REASONS[doc.exampleOmitted!]).toBeTruthy();
			}
		});

		/**
		 * "did-not-compile" is the one omission that is a bug rather than a
		 * decision — it means a node cannot be used on its own at all. If this
		 * ever fails, the node is broken, not the documentation.
		 */
		it("has no node that fails to compile in isolation", () => {
			const broken = documentRegistry(registry, builtinIds)
				.filter((d) => d.exampleOmitted === "did-not-compile")
				.map((d) => d.id);
			expect(broken).toEqual([]);
		});

		/**
		 * The curated graphs are hand-authored, so this is the check that stops
		 * them drifting: every one still compiles, cleanly, and produces output.
		 */
		it("compiles every curated graph without errors", () => {
			for (const id of Object.keys(CURATED)) {
				const def = registry.get(id);
				expect(def, `curated example for a node that does not exist: ${id}`).toBeDefined();

				const result = compile(CURATED[id](), registry);
				const errors = result.diagnostics.filter((d) => d.severity === "error");
				expect(errors.map((e) => e.message), `${id} example`).toEqual([]);
				expect(stripHeader(result.code), `${id} example`).not.toBe("");
			}
		});

		/**
		 * The scenes a guide draws are held to the same bar. They are only
		 * *drawn* today, not compiled for their output, which is exactly why this
		 * matters: without it a guide could show a picture of a graph that does
		 * not build, and nothing would ever say so.
		 */
		it("compiles every guide scene without errors", () => {
			const ids = Object.keys(GUIDE_SCENES);
			expect(ids.length, "no guide scenes to check").toBeGreaterThan(0);

			for (const id of ids) {
				const result = compile(GUIDE_SCENES[id](), registry);
				const errors = result.diagnostics.filter((d) => d.severity === "error");
				expect(errors.map((e) => e.message), `${id} scene`).toEqual([]);
			}
		});

		/** Every node a scene names has to still exist in the registry. */
		it("draws guide scenes only from nodes that exist", () => {
			for (const [id, build] of Object.entries(GUIDE_SCENES)) {
				for (const node of build().nodes) {
					expect(registry.get(node.def), `${id} uses a missing node: ${node.def}`).toBeDefined();
				}
			}
		});

		it("never produces an example containing the generated header", () => {
			for (const doc of documentRegistry(registry, builtinIds)) {
				expect(doc.example ?? "").not.toContain("roswaal-graph:");
			}
		});
	});
});

describe("coming from Blueprints", () => {
	/**
	 * The reason this table is data. Prose naming `flow.forRange` would keep
	 * naming it long after a rename, and nobody re-reads a mapping table.
	 */
	it("only names nodes that exist", () => {
		const missing = referencedNodeIds().filter((id) => !registry.has(id));
		expect(missing).toEqual([]);
	});

	it("says something about every entry it cannot map", () => {
		for (const section of BLUEPRINT_MAP) {
			for (const entry of section.entries) {
				if (entry.roswaal === null) {
					// An absence with no explanation is worse than no entry: the
					// reader is left assuming they failed to find it.
					expect(entry.note, `"${entry.unreal}" has no equivalent and no note`).toBeTruthy();
				}
			}
		}
	});

	it("covers the concepts a Blueprint developer reaches for first", () => {
		const covered = BLUEPRINT_MAP.flatMap((s) => s.entries.map((e) => e.unreal.toLowerCase()));
		for (const concept of ["branch", "sequence", "event graph", "tick", "cast to"]) {
			expect(
				covered.some((c) => c.includes(concept)),
				`nothing in the map mentions "${concept}"`,
			).toBe(true);
		}
	});
});

/**
 * How the palette splits its results.
 *
 * "Best match" is a page called what you typed; "Related" is one that merely
 * says it somewhere. The split is a fact about the score, so it is asserted
 * here rather than in the component — the component's job is to draw two lists
 * when it is given two.
 */
describe("ranking a docs search", () => {
	const index = buildSearchIndex(buildSite(createRegistry(), new Set()));
	const hits = (query: string) => rankDocs(index, query, 30);

	it("calls a title match a name match", () => {
		const branch = hits("branch").find((hit) => hit.entry.nodeId === "flow.branch");
		expect(branch?.named).toBe(true);
	});

	/** The node's id is its name as much as its title is. */
	it("calls a node id a name match", () => {
		const byId = hits("flow.forrange").find((hit) => hit.entry.nodeId === "flow.forRange");
		expect(byId?.named).toBe(true);
	});

	it("calls a page that only mentions the word related", () => {
		const related = hits("branch").filter((hit) => !hit.named);
		expect(related.length).toBeGreaterThan(0);
		for (const hit of related) {
			expect(hit.entry.title.toLowerCase(), hit.entry.slug).not.toContain("branch");
		}
	});

	it("puts every name match above every related one", () => {
		const order = hits("cast").map((hit) => hit.named);
		expect(order.slice(0, order.lastIndexOf(true) + 1).every(Boolean)).toBe(true);
	});

	it("finds nothing for an empty query", () => {
		expect(rankDocs(index, "   ")).toEqual([]);
	});
});
