/**
 * Every graph the documentation draws is one the editor could make.
 *
 * A function's body is a graph of its own in the editor. The docs drew it
 * beside the main flow for a long time after that stopped being possible,
 * because a script with no graph membership at all reads as one canvas — as
 * every graph did before 0.33.0 — and nothing checked a picture against that.
 * So this asks each wire directly: are its two ends in the same graph?
 */

import { describe, expect, it } from "vitest";

import { buildSite, allPages, type Block } from "../src/core/docs/site.js";
import { graphViews } from "../src/core/docs/graphViews.js";
import { sideGraph } from "../src/core/functionGraph.js";
import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { compile } from "../src/core/compiler/index.js";
import { graphSvg } from "../src/core/docs/preview.js";
import { nodeCodeHtml } from "../src/core/docs/nodeCode.js";
import { ROBLOX_DEMO_GRAPHS } from "../src/core/docs/robloxDemos.js";
import { NODE } from "../src/app/layers.js";
import { nodeColor, pinColor } from "../src/app/palette.js";
import { wirePath } from "../src/app/geometry.js";

const site = buildSite(createRegistry(), new Set(BUILTIN_NODES.map((d) => d.id)));

/** Every script a page draws, with where it was found. */
function drawn(): { where: string; script: NodeScript }[] {
	const out: { where: string; script: NodeScript }[] = [];
	const walk = (slug: string, blocks: readonly Block[]) => {
		for (const block of blocks) {
			if (block.t === "graph") out.push({ where: slug, script: block.script });
			if (block.t === "graphs") for (const one of block.graphs) out.push({ where: `${slug} (${one.title})`, script: one.script });
			if (block.t === "tabs") for (const tab of block.tabs) walk(`${slug} › ${tab.title}`, tab.blocks);
		}
	};
	for (const page of allPages(site)) {
		walk(page.slug, page.blocks);
	}
	return out;
}

describe("the documentation's graphs", () => {
	const scripts = drawn();

	it("are found", () => {
		expect(scripts.length).toBeGreaterThan(40);
	});

	it("wire nothing between two graphs", () => {
		const crossing: string[] = [];
		for (const { where, script } of scripts) {
			const byId = new Map(script.nodes.map((n) => [n.id, n]));
			for (const link of script.links) {
				const from = byId.get(link.from.node);
				const to = byId.get(link.to.node);
				if (!from || !to) continue;
				if (sideGraph(from, link.from.pin, "out") !== sideGraph(to, link.to.pin, "in")) {
					crossing.push(`${where}: ${from.def}.${link.from.pin} → ${to.def}.${link.to.pin}`);
				}
			}
		}
		expect(crossing).toEqual([]);
	});

	/**
	 * A graph with Luau under it compiles to that Luau. Members and fields
	 * printed `readInput()` under a scene that had no such function in it.
	 */
	it("compile to the Luau printed under them", () => {
		const registry = createRegistry();
		const withoutHeader = (code: string) => {
			const lines = code.split("\n");
			while (lines.length > 0 && (lines[0].startsWith("--") || lines[0].trim() === "")) lines.shift();
			return lines.join("\n").trim();
		};
		const differ: string[] = [];
		let checked = 0;
		const walk = (slug: string, blocks: readonly Block[]) => {
			blocks.forEach((block, i) => {
				if (block.t === "tabs") for (const tab of block.tabs) walk(`${slug} › ${tab.title}`, tab.blocks);
				const next = blocks[i + 1];
				if (block.t !== "graph" || next?.t !== "code" || next.lang !== "luau") return;
				checked++;
				if (withoutHeader(compile(block.script, registry).code) !== next.text.trim()) differ.push(slug);
			});
		};
		for (const page of allPages(site)) walk(page.slug, page.blocks);
		expect(checked).toBeGreaterThan(30);
		expect(differ).toEqual([]);
	});

	/**
	 * Members and fields reads members off values its scenes build: a
	 * `readInput()` standing in for the value named a function no scene has.
	 */
	it("build the values Members and fields reads, rather than standing in for them", () => {
		const stands = scripts
			.filter(({ where }) => where.startsWith("members-and-fields"))
			.flatMap(({ where, script }) => script.nodes
				.filter((n) => n.def === "value.expression")
				.map((n) => `${where}: ${(n.literals?.code as { v?: string } | undefined)?.v}`));
		expect(stands).toEqual([]);
	});

	it("draw a function in a tab of its own", () => {
		const scene = scripts.find(({ where }) => where === "node/function.get")!.script;
		expect(graphViews(scene).map((v) => v.title)).toEqual(["Example", "ƒ onHit"]);
	});
});

describe("a Custom Code node in a drawn graph", () => {
	const registry = createRegistry();
	const main = (ROBLOX_DEMO_GRAPHS as Record<string, NodeScript>).main;
	const custom = main.nodes.find((n) => n.def === "code.custom")!;
	const options = { geometry: NODE, nodeColor, pinColor, wirePath };

	it("is marked so the graph's script can open it", () => {
		expect(graphSvg(main, registry, options)).toContain(`data-code-node="${custom.id}"`);
	});

	it("has its Luau beside the graph, numbered", () => {
		const html = nodeCodeHtml(main, (code) => code);
		expect(html).toContain(`data-code-for="${custom.id}"`);
		expect(html).toContain("newPart.Material = Enum.Material.Neon");
		expect(html).toMatch(/class="code-view-gutter"[^>]*>1\n2\n3/);
	});
});

describe("a real project's graph", () => {
	const registry = createRegistry();
	const main = (ROBLOX_DEMO_GRAPHS as Record<string, NodeScript>).main;
	const options = { geometry: NODE, nodeColor, pinColor, wirePath };

	it("is drawn where its nodes are, not levelled", () => {
		expect(graphSvg(main, registry, options, true)).not.toBe(graphSvg(main, registry, options));
		const page = allPages(site).find((p) => p.slug === "roblox-demos")!;
		const graphs = page.blocks.filter((b) => b.t === "graph");
		expect(graphs.length).toBe(2);
		expect(graphs.every((b) => b.t === "graph" && b.asAuthored)).toBe(true);
	});
});
