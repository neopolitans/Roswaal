/**
 * How much of the node reference carries a worked example, and why the rest
 * does not. Run with `node --experimental-strip-types scripts/docs-coverage.mjs`
 * or through tsx; it is a reporting aid, not part of the build.
 */

import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.ts";
import { documentRegistry } from "../src/core/docs/nodeReference.ts";

const registry = createRegistry();
const docs = documentRegistry(registry, new Set(BUILTIN_NODES.map((d) => d.id)));

const withExample = docs.filter((d) => d.example !== undefined);
const byReason = new Map();
for (const doc of docs) {
	if (doc.example !== undefined) continue;
	const list = byReason.get(doc.exampleOmitted) ?? [];
	list.push(doc.id);
	byReason.set(doc.exampleOmitted, list);
}

console.log(`${withExample.length} of ${docs.length} nodes have a worked example\n`);

const sample = process.argv.includes("--samples");
if (sample) {
	for (const doc of withExample) {
		console.log(`  ${doc.id.padEnd(24)} ${doc.example.split("\n").join(" ⏎ ")}`);
	}
	console.log("");
}
for (const [reason, ids] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
	console.log(`\n  ${ids.length}  ${reason}`);
	console.log(`     ${ids.join(", ")}`);
}
