/**
 * Modules that require each other as they load.
 *
 * Roblox refuses the second require of a module that is still loading -- it
 * stops with "Requested module was required recursively" -- so a ring of
 * load-time requires is a script that fails the first time it runs. Found
 * here as rings, each named in the order its requires run, so the line in
 * Script analysis is a path somebody can follow rather than a set.
 */

/**
 * One ring per tangle: for each group of files that reach each other
 * (Tarjan's strongly connected components), the shortest way round from its
 * first file in sort order. A file that requires itself is a ring of one.
 * Each ring ends where it starts: `["A", "B", "A"]`.
 */
export function requireCycles(edges: ReadonlyMap<string, readonly string[]>): string[][] {
	const nodes = [...new Set([...edges.keys(), ...[...edges.values()].flat()])].sort();
	const next = (n: string) => [...new Set(edges.get(n) ?? [])].sort();

	let counter = 0;
	const index = new Map<string, number>();
	const low = new Map<string, number>();
	const stack: string[] = [];
	const onStack = new Set<string>();
	const groups: string[][] = [];

	// Iterative, so a long chain of modules cannot overflow the call stack.
	for (const root of nodes) {
		if (index.has(root)) continue;
		const work: { node: string; children: string[]; at: number }[] = [];
		const open = (node: string) => {
			index.set(node, counter);
			low.set(node, counter);
			counter++;
			stack.push(node);
			onStack.add(node);
			work.push({ node, children: next(node), at: 0 });
		};
		open(root);
		while (work.length > 0) {
			const top = work[work.length - 1];
			if (top.at < top.children.length) {
				const child = top.children[top.at++];
				if (!index.has(child)) open(child);
				else if (onStack.has(child))
					low.set(top.node, Math.min(low.get(top.node)!, index.get(child)!));
				continue;
			}
			work.pop();
			const parent = work[work.length - 1];
			if (parent) low.set(parent.node, Math.min(low.get(parent.node)!, low.get(top.node)!));
			if (low.get(top.node) !== index.get(top.node)) continue;
			const group: string[] = [];
			let n: string;
			do {
				n = stack.pop()!;
				onStack.delete(n);
				group.push(n);
			} while (n !== top.node);
			groups.push(group);
		}
	}

	const rings: string[][] = [];
	for (const group of groups) {
		const members = new Set(group);
		const start = [...group].sort()[0];
		if (group.length === 1) {
			if (next(start).includes(start)) rings.push([start, start]);
			continue;
		}
		// Breadth first from the start, inside the group, back to the start.
		const from = new Map<string, string>();
		const queue = [start];
		let closing: string | undefined;
		while (queue.length > 0 && closing === undefined) {
			const n = queue.shift()!;
			for (const child of next(n)) {
				if (!members.has(child)) continue;
				if (child === start) {
					closing = n;
					break;
				}
				if (from.has(child)) continue;
				from.set(child, n);
				queue.push(child);
			}
		}
		if (closing === undefined) continue;
		const ring = [start];
		for (let n = closing; n !== start; n = from.get(n)!) ring.splice(1, 0, n);
		ring.push(start);
		rings.push(ring);
	}
	return rings.sort((a, b) => a[0].localeCompare(b[0]));
}
