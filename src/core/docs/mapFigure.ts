/**
 * A node map drawn beside what it produces, with the two halves linked.
 *
 * ## What the reader is actually stuck on
 *
 * The map pages could say what every field does — they did, in a table — and
 * still leave somebody unable to answer the only question they came with:
 * *what does this row of my tree turn into?* A map is a correspondence, and a
 * table of field names describes one side of it. The reader is holding a tree
 * in one hand and a `default.project.json` in the other and trying to line
 * them up by eye.
 *
 * So the figure draws both and links them: hover a row and the lines it
 * produces light; hover a line and the row that produced it lights. The same
 * device as the toolbar legend, and for the same reason — the answer is a
 * correspondence, and a correspondence is something you point at rather than
 * something you describe.
 *
 * ## Exact, not enclosing
 *
 * A row lights the lines it contributes *itself*, not everything nested
 * inside it. Hovering `ReplicatedStorage` lights its own key, its `$path` and
 * its closing brace — the children below stay dark, because they are their
 * own rows and light on their own.
 *
 * Enclosing would have been prettier and would have taught the wrong thing.
 * The question the figure answers is "what did this row do", and a row that
 * appears to produce its children's output is a row the reader will expect to
 * be able to delete without losing them.
 *
 * ## Why the output is re-printed here
 *
 * `compileNodeMap` returns the project file as one string, which cannot be
 * keyed to anything. So this prints it again, line by line, carrying the node
 * each line came from.
 *
 * Two printers for one format is exactly the arrangement that goes stale, and
 * the guard is `tests/mapfigure.test.ts`: it joins these lines back into a
 * string and requires it to equal `compileNodeMap(map).json` exactly, for
 * every map on the docs site. The figure cannot show a project file Roswaal
 * would not write, because the moment it does, the test says so.
 */

import {
	compileNodeMap, isFilesystemMap, type MapNode, type NodeMap,
} from "../nodemap.js";

/** One row of the tree, on the left. */
export interface MapFigureRow {
	/** The node. Shared with every output line this row produces. */
	key: string;
	depth: number;
	name: string;
	/** What it is, in a word: `Service`, `Folder`, `File`, `Directory`. */
	kind: string;
	/** The folder or file on disk that fills it, where it has one. */
	path?: string;
}

/** One line of the output, on the right. */
export interface MapFigureLine {
	/** The node that produced it. Absent on the file's own punctuation. */
	key?: string;
	/** Leading depth, kept as a number so markup cannot disturb the spaces. */
	indent: number;
	text: string;
	/** A second column, on a filesystem map: what reaches this file. */
	note?: string;
}

export interface MapFigure {
	target: "roblox" | "lune";
	/** The heading over the left column. */
	treeTitle: string;
	/** The heading over the right column. */
	outputTitle: string;
	/** The heading over the second output column, where there is one. */
	noteTitle?: string;
	rows: MapFigureRow[];
	lines: MapFigureLine[];
}

// ---------------------------------------------------------------------------
// The tree, which is the same on both targets
// ---------------------------------------------------------------------------

function rowsOf(map: NodeMap): MapFigureRow[] {
	const filesystem = isFilesystemMap(map);
	const out: MapFigureRow[] = [];

	const visit = (node: MapNode, depth: number) => {
		out.push({
			key: node.id,
			depth,
			name: node.name,
			kind: kindOf(node, depth, filesystem),
			...(node.path ? { path: node.path } : {}),
		});
		for (const child of node.children) visit(child, depth + 1);
	};
	visit(map.root, 0);

	return out;
}

function kindOf(node: MapNode, depth: number, filesystem: boolean): string {
	if (filesystem) {
		if (depth === 0) return "Project root";
		return node.file ? "File" : "Directory";
	}
	if (depth === 0) return "DataModel";
	// Depth, not just a missing class. Rojo infers the class from the key, and
	// it can only do that for a service -- which is a child of the DataModel
	// and nothing deeper. A nested row with no class is filled by whatever its
	// path holds, so the path is the honest answer and the row already shows
	// it in its own column.
	if (node.className) return node.className;
	if (depth === 1) return "Service";
	return node.path ? "From disk" : "Folder";
}

// ---------------------------------------------------------------------------
// A DataModel map: the Rojo project file
// ---------------------------------------------------------------------------

/**
 * `JSON.stringify` for a value nobody needs keyed — `$properties`, and the
 * project-level ignore list. Re-indented to sit where it was placed.
 *
 * Borrowing the real serialiser rather than reimplementing it: these are
 * arbitrary JSON, and the only thing a hand-rolled printer could add here is
 * a way to disagree with `JSON.stringify` about escaping.
 */
function valueLines(value: unknown, indent: number, key: string | undefined): MapFigureLine[] {
	return JSON.stringify(value, null, 2)
		.split("\n")
		.map((line, i) => {
			const spaces = line.length - line.trimStart().length;
			return {
				// The first line sits where the caller put it; the rest carry
				// their own relative depth on top of that.
				indent: i === 0 ? indent : indent + spaces / 2,
				text: line.trimStart(),
				...(key ? { key } : {}),
			};
		});
}

/** The entries of one node's object, each already carrying its trailing comma. */
function nodeEntries(node: MapNode, indent: number, isRoot: boolean): MapFigureLine[][] {
	const entries: MapFigureLine[][] = [];
	const key = node.id;

	// Mirrors `buildTree`, in its order. A path pointing at a directory
	// already implies a Folder, so Roswaal leaves the class off.
	const impliedByPath = node.path !== undefined && node.className === "Folder";
	if (node.className && !impliedByPath && (isRoot || !isService(node))) {
		entries.push([{ key, indent, text: `"$className": ${JSON.stringify(node.className)}` }]);
	}
	if (node.path) {
		entries.push([{ key, indent, text: `"$path": ${JSON.stringify(node.path)}` }]);
	}
	if (node.properties && Object.keys(node.properties).length > 0) {
		const printed = valueLines(node.properties, indent, key);
		printed[0] = { ...printed[0], text: `"$properties": ${printed[0].text}` };
		entries.push(printed);
	}
	if (node.ignoreUnknown) {
		entries.push([{ key, indent, text: `"$ignoreUnknownInstances": true` }]);
	}

	for (const child of node.children) {
		entries.push(childLines(child, indent));
	}
	return entries;
}

const isService = (node: MapNode) =>
	node.className === undefined || node.className === "";

/** One child, as `"Name": { … }`, opened and closed at `indent`. */
function childLines(node: MapNode, indent: number): MapFigureLine[] {
	return objectLines(node, indent, JSON.stringify(node.name), false);
}

/**
 * A node as a keyed object.
 *
 * The opening and closing braces both carry the node, so a row lights the
 * shape of its own stanza even when everything inside it belongs to a child.
 */
function objectLines(
	node: MapNode, indent: number, label: string, isRoot: boolean,
): MapFigureLine[] {
	const key = node.id;
	const entries = nodeEntries(node, indent + 1, isRoot);
	if (entries.length === 0) return [{ key, indent, text: `${label}: {}` }];

	const out: MapFigureLine[] = [{ key, indent, text: `${label}: {` }];
	entries.forEach((entry, i) => {
		const last = i === entries.length - 1;
		entry.forEach((line, j) => {
			const end = j === entry.length - 1;
			out.push(end && !last ? { ...line, text: `${line.text},` } : line);
		});
	});
	out.push({ key, indent, text: "}" });
	return out;
}

function projectLines(map: NodeMap): MapFigureLine[] {
	const globs = collectGlobs(map);
	const out: MapFigureLine[] = [{ indent: 0, text: "{" }];

	out.push({ indent: 1, text: `"name": ${JSON.stringify(map.name)},` });

	const tree = objectLines(map.root, 1, '"tree"', true);
	if (globs.length > 0) {
		tree[tree.length - 1] = {
			...tree[tree.length - 1],
			text: `${tree[tree.length - 1].text},`,
		};
	}
	out.push(...tree);

	if (globs.length > 0) {
		const printed = valueLines(globs, 1, undefined);
		printed[0] = { ...printed[0], text: `"globIgnorePaths": ${printed[0].text}` };
		out.push(...printed);
	}

	out.push({ indent: 0, text: "}" });
	return out;
}

/**
 * Every ignore glob, anchored as `collectGlobs` in `nodemap.ts` anchors them.
 *
 * Duplicated for the reason the printer is: the figure needs the list to
 * print, and the test holds the two together.
 */
function collectGlobs(map: NodeMap): string[] {
	const out: string[] = [...(map.globIgnorePaths ?? [])];
	const visit = (node: MapNode) => {
		for (const glob of node.ignorePaths ?? []) {
			const trimmed = glob.trim();
			if (trimmed === "") continue;
			out.push(
				trimmed.startsWith("/")
					? trimmed.slice(1)
					: node.path
						? `${node.path.replace(/\/+$/, "")}/${trimmed}`
						: trimmed,
			);
		}
		node.children.forEach(visit);
	};
	visit(map.root);
	return [...new Set(out)];
}

// ---------------------------------------------------------------------------
// A filesystem map: the disk, and what reaches it
// ---------------------------------------------------------------------------

/**
 * What a Lune map produces is the layout itself, so the right-hand column is
 * the disk — with the extension the map decided, which is the part a row does
 * not show. `main` in the tree is `main.luau` on disk, and seeing the two
 * beside each other is the whole of why a name carries no extension.
 */
function diskLines(map: NodeMap): MapFigureLine[] {
	const out: MapFigureLine[] = [];

	const visit = (node: MapNode, prefix: string, depth: number, isRoot: boolean) => {
		if (!isRoot) {
			const name = node.file ? `${node.name}.luau` : `${node.name}/`;
			const full = prefix + name;
			out.push({
				key: node.id,
				indent: depth - 1,
				text: full,
				...(node.file ? { note: `require("./${prefix}${node.name}")` } : {}),
			});
			for (const child of node.children) visit(child, `${prefix}${node.name}/`, depth + 1, false);
			return;
		}
		for (const child of node.children) visit(child, prefix, depth + 1, false);
	};
	visit(map.root, "", 0, true);

	return out;
}

// ---------------------------------------------------------------------------

/** The figure for a map, on whichever target it describes. */
export function mapFigure(map: NodeMap): MapFigure {
	if (isFilesystemMap(map)) {
		return {
			target: "lune",
			treeTitle: "The map",
			outputTitle: "On disk",
			noteTitle: "Reached by",
			rows: rowsOf(map),
			lines: diskLines(map),
		};
	}
	return {
		target: "roblox",
		treeTitle: "The map",
		outputTitle: compileNodeMap(map).outputPath || "default.project.json",
		rows: rowsOf(map),
		lines: projectLines(map),
	};
}

/** The printed lines as the file would be written. What the test compares. */
export function figureText(figure: MapFigure): string {
	return figure.lines.map((l) => "  ".repeat(l.indent) + l.text).join("\n") + "\n";
}
