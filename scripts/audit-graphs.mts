/**
 * Which drawn graphs have wires that do not run straight. `npm run audit:graphs`.
 *
 * A wire between two pins on the same row reads as a connection. One that has
 * to climb reads as a diagram somebody did not finish. The renderer places pins
 * exactly where the canvas does — measured, both at a 5px exec gap and a 42px
 * first-row centre — so a bent wire is the *graph's* node positions, not the
 * drawing of them.
 *
 * This reports every link whose two ends sit at different heights, per page.
 * `graphSvg` straightens what it can before drawing, so what this reports is
 * what is left: a node fed by two wires, or one feeding two, where levelling
 * one necessarily bends the other. Set STRAIGHTEN=1 to measure after the pass
 * rather than before it, which is how the pass was judged -- 55 bent links
 * down to 32, and none of the remainder fixable by moving one node.
 */

import { buildSite } from "../src/core/docs/site.ts";
import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.ts";
import { growthState } from "../src/core/nodes/growth.ts";
import { placeGraph, placedPinAnchor, previewOfPlaced, straighten } from "../src/core/docs/preview.ts";
import { nodeColor, pinColor } from "../src/app/palette.ts";
import { wirePath } from "../src/app/geometry.ts";
import { NODE } from "../src/app/layers.ts";

const registry = createRegistry();
const site = buildSite(registry, new Set(BUILTIN_NODES.map((d) => d.id)));

const options = {
	geometry: NODE,
	nodeColor,
	pinColor,
	wirePath,
	growth: (pin: { id: string; config?: unknown }) =>
		growthState(registry.get(pin.id), pin.config as never),
};

let graphs = 0;
let links = 0;
const offenders: { page: string; bent: number; total: number; worst: number; crossings: number }[] = [];

for (const section of site.sections) {
	for (const page of section.pages) {
		for (const block of page.blocks) {
			if (block.t !== "graph") continue;
			graphs++;

			const source = process.env.STRAIGHTEN
				? straighten(block.script, registry, options)
				: block.script;
			const placed = placeGraph(source, registry, options);
			const byId = new Map(placed.map((p) => [p.node.id, p]));

			let bent = 0;
			let worst = 0;
			let total = 0;

			for (const link of source.links ?? []) {
				const from = byId.get(link.from.node);
				const to = byId.get(link.to.node);
				if (!from || !to) continue;

				const a = placedPinAnchor(from, link.from.pin, "out", NODE);
				const b = placedPinAnchor(to, link.to.pin, "in", NODE);
				if (!a || !b) continue;

				total++;
				links++;
				const drop = Math.abs(a.y - b.y);
				if (drop > 0.5) {
					bent++;
					worst = Math.max(worst, drop);
				}
			}

			/**
			 * A wire that runs through a node it has nothing to do with.
			 *
			 * Levelling the flow can pull a value node onto the lane a long
			 * execution wire already occupies, and the wire then passes behind
			 * it — which reads as a wire going into the node.
			 */
			const anchors = (link: { from: { node: string; pin: string }; to: { node: string; pin: string } }) => {
				const from = byId.get(link.from.node);
				const to = byId.get(link.to.node);
				if (!from || !to) return null;
				const a = placedPinAnchor(from, link.from.pin, "out", NODE);
				const b = placedPinAnchor(to, link.to.pin, "in", NODE);
				return a && b ? { a, b } : null;
			};

			let crossings = 0;
			for (const link of source.links ?? []) {
				const ends = anchors(link);
				if (!ends) continue;
				const { a, b } = ends;
				for (const node of placed) {
					if (node.node.id === link.from.node || node.node.id === link.to.node) continue;
					const spansX = Math.min(a.x, b.x) < node.x + node.width && Math.max(a.x, b.x) > node.x;
					const withinY = Math.min(a.y, b.y) < node.y + node.height && Math.max(a.y, b.y) > node.y;
					if (spansX && withinY) crossings++;
				}
			}

			offenders.push({ page: page.slug, bent, total, worst: Math.round(worst), crossings });
		}
	}
}

offenders.sort((a, b) => b.worst - a.worst);

const bentGraphs = offenders.filter((x) => x.bent > 0);
const bentLinks = offenders.reduce((n, x) => n + x.bent, 0);
const crossed = offenders.reduce((n, x) => n + x.crossings, 0);
console.log(`graphs: ${graphs}   links: ${links}   graphs with a bent wire: ${bentGraphs.length}   bent links: ${bentLinks}   wires crossing a node: ${crossed}`);
console.log("");
console.log("CLEAN (every wire runs straight):");
for (const o of offenders.filter((x) => x.bent === 0)) {
	console.log(`  ${o.page.padEnd(34)} ${o.total} links`);
}
console.log("");
for (const o of offenders.filter((x) => x.bent > 0).slice(0, 4)) {
	console.log(`  ${o.page.padEnd(34)} ${o.bent}/${o.total} bent, worst ${o.worst}px, ${o.crossings} crossing(s)`);
}
if (offenders.length > 25) console.log(`  ... and ${offenders.length - 25} more`);

void previewOfPlaced;
