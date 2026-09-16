/**
 * The map editor, drawn in the documentation and wired up enough to use.
 *
 * ## Why it is the panel rather than a picture of it
 *
 * The map pages could say what every field does — they did, in a table — and
 * still leave somebody unable to answer the question they arrived with: *what
 * does this row of my tree turn into?* A map is a correspondence, and a table
 * of field names describes one side of it.
 *
 * So the page draws the editor itself: the tree on the left, the Inspector on
 * the right, and the project file underneath it, exactly where the editor puts
 * them. Select a row and the Inspector fills with that node's values and the
 * lines it writes light up in the file. That is the same bargain the toolbar
 * figures make — draw the real chrome, not a diagram of it — and it is made
 * the same way: the markup here uses the editor's own class names, so the
 * picture is styled by the editor's stylesheet and cannot drift from it by
 * being restyled separately.
 *
 * ## Exact, not enclosing
 *
 * A row lights the lines it contributes *itself*, not everything nested inside
 * it. Selecting `ReplicatedStorage` lights its own key, its `$path` and its
 * closing brace — the children below stay dark, because they are their own
 * rows and light on their own.
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
 *
 * ## It is a demonstrator, not a sandbox
 *
 * The fields are filled but not editable. Selecting is the interaction that
 * teaches the model — this row, those lines — and a field somebody can type
 * into is a promise that what they type will do something. Marked `readonly`
 * rather than merely ignored, so it says so before they try.
 */

import { isFilesystemMap, type MapNode, type NodeMap } from "../nodemap.js";
import { escapeXml } from "./preview.js";

/** One row of the tree, and everything the Inspector shows when it is picked. */
export interface MapFigureRow {
	/** The node. Shared with every output line this row produces. */
	key: string;
	depth: number;
	name: string;
	/** What it is, in a word: `Service`, `Folder`, `File`, `Directory`. */
	kind: string;
	/** The folder or file on disk that fills it, where it has one. */
	path?: string;
	/** Whether it has children, so the disclosure arrow is drawn or hidden. */
	parent: boolean;
	/** The heading over the Inspector while this row is picked. */
	heading: string;
	className?: string;
	file?: boolean;
	ignoreUnknown?: boolean;
	ignorePaths: string[];
	root: boolean;
}

/** One line of the output, on the right. */
export interface MapFigureLine {
	/** The node that produced it. Absent on the file's own punctuation. */
	key?: string;
	/** Leading depth, kept as a number so markup cannot disturb the spaces. */
	indent: number;
	text: string;
	/** On a filesystem map: the require that reaches this file. */
	note?: string;
}

export interface MapFigure {
	target: "roblox" | "lune";
	/** The map's name, which the editor shows in the bar over the tree. */
	name: string;
	/** Where the project file is written. Empty on a filesystem map. */
	output: string;
	rows: MapFigureRow[];
	lines: MapFigureLine[];
	globIgnorePaths: string[];
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
			parent: node.children.length > 0,
			heading: filesystem
				? depth === 0 ? "Directory" : node.file ? "File" : "Directory"
				: "Instance",
			ignorePaths: node.ignorePaths ?? [],
			root: depth === 0,
			...(node.path ? { path: node.path } : {}),
			...(node.className ? { className: node.className } : {}),
			...(node.file ? { file: true } : {}),
			...(node.ignoreUnknown ? { ignoreUnknown: true } : {}),
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
 * What a Lune map produces is the layout itself, so what sits where the
 * project file would be is the disk — with the extension the map decided,
 * which is the part a row does not show.
 */
function diskLines(map: NodeMap): MapFigureLine[] {
	const out: MapFigureLine[] = [];

	const visit = (node: MapNode, prefix: string, depth: number, isRoot: boolean) => {
		if (!isRoot) {
			const name = node.file ? `${node.name}.luau` : `${node.name}/`;
			out.push({
				key: node.id,
				indent: depth - 1,
				text: prefix + name,
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
	const filesystem = isFilesystemMap(map);
	return {
		target: filesystem ? "lune" : "roblox",
		name: map.name,
		output: filesystem ? "" : map.output,
		rows: rowsOf(map),
		lines: filesystem ? diskLines(map) : projectLines(map),
		globIgnorePaths: map.globIgnorePaths ?? [],
	};
}

/** The printed lines as the file would be written. What the test compares. */
export function figureText(figure: MapFigure): string {
	return figure.lines.map((l) => "  ".repeat(l.indent) + l.text).join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// The panel, as markup
// ---------------------------------------------------------------------------

/** One entry of the legend beside the panel. */
export interface MapPart {
	/** Pairs the entry with the piece of panel it names. */
	part: string;
	name: string;
	what: string;
}

/**
 * What the panel is made of, named.
 *
 * The same device the toolbar figures use, and for the same reason: chrome is
 * unreadable on the first day, and a reader matching the fourth control in a
 * column to the seventh line of a paragraph is counting rather than reading.
 * Hovering an entry lights the part; hovering the part lights the entry.
 *
 * The prose underneath still explains each field properly. This is the map of
 * where they are, which is the thing prose is worst at.
 */
export function mapParts(figure: MapFigure): MapPart[] {
	const tree: MapPart = {
		part: "tree",
		name: "The tree",
		what: figure.target === "lune"
			? "Every directory and file the project has. Pick one and the Inspector follows."
			: "Every instance the map describes. Pick one and the Inspector follows.",
	};
	const describes: MapPart = {
		part: "describes",
		name: "Describes",
		what: "Whether this is a DataModel for Roblox or a filesystem for Lune. It decides "
			+ "what the rest of the panel is.",
	};
	const name: MapPart = {
		part: "name",
		name: "Name",
		what: figure.target === "lune"
			? "What it is called on disk — with no extension, which the row on the right adds."
			: "The instance's name in the DataModel.",
	};

	if (figure.target === "lune") {
		return [
			tree,
			describes,
			name,
			{
				part: "kind",
				name: "Kind",
				what: "A directory, or a file Roswaal writes a .luau for. Absent on the project "
					+ "root, which is neither.",
			},
			{
				part: "actions",
				name: "Add directory, Add file, Delete",
				what: "Build the tree. A file takes no children.",
			},
			{
				part: "preview",
				name: "The layout",
				what: "The directories and files as they land, and the require that reaches each "
					+ "one. Nothing is written — compiling a filesystem map checks it.",
			},
		];
	}

	return [
		tree,
		describes,
		name,
		{
			part: "class",
			name: "Class",
			what: "Blank on a service, because Rojo infers it from the key and rejects it being "
				+ "said twice.",
		},
		{
			part: "path",
			name: "Path",
			what: "The folder or file on disk whose contents fill this instance.",
		},
		{
			part: "ignoreUnknown",
			name: "Ignore unknown",
			what: "Rojo leaves alone anything in Studio that it did not put there.",
		},
		{
			part: "ignorePaths",
			name: "Ignore paths",
			what: "Globs under this instance's path that Rojo should skip.",
		},
		{
			part: "actions",
			name: "Add folder, Add service, Delete",
			what: "Build the tree. Services can only be added to the root.",
		},
		{
			part: "output",
			name: "Output",
			what: "Where the project file is written, relative to the project root.",
		},
		{
			part: "globs",
			name: "Project-wide ignores",
			what: "Passed to Rojo as globIgnorePaths, unanchored.",
		},
		{
			part: "preview",
			name: "The project file",
			what: "What the map compiles to. Selecting a row lights the lines that row writes.",
		},
	];
}

/**
 * One `<label class="field">`, as the editor writes it.
 *
 * `data-map-field` is what the script fills on selection. The editor has no
 * such attribute because the editor has React; this is the same information
 * arriving by the only route a bundled script has.
 */
function field(label: string, control: string, part: string): string {
	return `<label class="field" data-part="${escapeXml(part)}">` +
		`<span>${escapeXml(label)}</span>${control}</label>`;
}

function input(name: string, value: string, placeholder = ""): string {
	return `<input class="tb" readonly data-map-field="${name}" value="${escapeXml(value)}"` +
		`${placeholder ? ` placeholder="${escapeXml(placeholder)}"` : ""}>`;
}

/** A select showing one fixed answer. It is a demonstrator, so it does not open. */
function select(name: string, value: string): string {
	return `<select class="tb" disabled data-map-field="${name}">` +
		`<option>${escapeXml(value)}</option></select>`;
}

function listField(label: string, hint: string, values: string[], name: string): string {
	const rows = values
		.map((value) =>
			`<div class="map-list-row"><input class="tb" readonly value="${escapeXml(value)}">` +
			`<button class="tb" disabled>&times;</button></div>`,
		)
		.join("");
	return `<div class="map-list" data-map-list="${name}" data-part="${escapeXml(name)}">` +
		`<div class="map-list-head"><span>${escapeXml(label)}</span>` +
		`<button class="tb" disabled>Add</button></div>` +
		`<p class="summary">${escapeXml(hint)}</p>${rows}</div>`;
}

const IGNORE_HINT =
	"Globs under this instance's path that Rojo should skip, e.g. shared/** — " +
	"how you stop a nested mapping syncing twice.";

/**
 * The whole figure's insides: the panel, and the legend beside it.
 *
 * One string so the two renderers wrap it identically and cannot end up with
 * different nesting — which they would, because React needs an element to
 * hang `dangerouslySetInnerHTML` on and the template does not.
 */
export function mapFigureHtml(figure: MapFigure): string {
	return `<div class="docs-map-frame">${mapPanelHtml(figure)}</div>` +
		mapLegendHtml(figure);
}

/**
 * The legend, as markup.
 *
 * Beside the panel rather than under it: the panel is tall, and a list of
 * eleven names below a tall picture is a list nobody reads next to the thing
 * it names.
 */
export function mapLegendHtml(figure: MapFigure): string {
	const items = mapParts(figure)
		.map((item) =>
			`<li data-part="${escapeXml(item.part)}">` +
			`<span class="docs-map-part">${escapeXml(item.name)}</span>` +
			`<span class="docs-map-what">${escapeXml(item.what)}</span></li>`,
		)
		.join("");
	return `<ul class="docs-map-legend">${items}</ul>`;
}

/**
 * The editor as markup, ready for `attachMapPanel` to wire up.
 *
 * Every class name here is one the editor itself uses, so there is no second
 * set of styles to keep level with it. The only additions are the `data-`
 * hooks the script needs, which the editor does not need because it has React
 * to hand it the same values.
 */
export function mapPanelHtml(figure: MapFigure): string {
	const first = figure.rows[0];

	const rows = figure.rows
		.map((row) => {
			const bits = [`<span class="name">${escapeXml(row.name)}</span>`];
			if (row.file) bits.push(`<span class="class">.luau</span>`);
			if (row.className) bits.push(`<span class="class">${escapeXml(row.className)}</span>`);
			if (row.path) bits.push(`<span class="path">${escapeXml(row.path)}</span>`);
			// The Inspector's values ride on the row. The editor hands React the
			// node itself; a bundled script has no such thing, and re-deriving
			// them from the drawn row would mean parsing the picture back into
			// the model it was drawn from.
			const inspect = JSON.stringify({
				heading: row.heading,
				name: row.name,
				class: row.className ?? "(service — Rojo infers it)",
				kind: row.file ? "File" : "Directory",
				path: row.path ?? "",
				ignoreUnknown: row.ignoreUnknown === true,
				ignorePaths: row.ignorePaths,
				root: row.root,
			});
			return `<div class="map-row${row.key === first.key ? " selected" : ""}"` +
				` data-control="${escapeXml(row.key)}"` +
				` data-map-node="${escapeXml(inspect)}"` +
				` style="padding-left:${8 + row.depth * 14}px">` +
				`<span class="glyph"${row.parent ? "" : ` style="visibility:hidden"`}>&#9656;</span>` +
				bits.join("") +
				`</div>`;
		})
		.join("");

	const preview = figure.lines
		.map((line) => {
			const keyed = line.key ? ` data-control="${escapeXml(line.key)}"` : "";
			const note = line.note
				? `<span class="map-reach">${escapeXml(line.note)}</span>`
				: "";
			return `<span class="map-preview-line"${keyed}>` +
				`${escapeXml("  ".repeat(line.indent) + line.text)}${note}</span>`;
		})
		.join("");

	const lune = figure.target === "lune";

	const inspector = lune
		? field("Name", input("name", first.name), "name") +
			(first.root
				? ""
				: field("Kind", select("kind", first.file ? "File" : "Directory"), "kind"))
		: field("Name", input("name", first.name), "name") +
			field(
				"Class",
				select("class", first.className ?? "(service — Rojo infers it)"),
				"class",
			) +
			field("Path", input("path", first.path ?? "", "src/systems"), "path") +
			field(
				"Ignore unknown",
				`<input type="checkbox" disabled data-map-field="ignoreUnknown"` +
					`${first.ignoreUnknown ? " checked" : ""}>`,
				"ignoreUnknown",
			);

	const tail = lune
		? `<h2 data-part="preview">The layout</h2>` +
			`<p class="summary">Directories and files, as they sit on disk. Nothing is written ` +
			`when this is compiled — a Lune program has no project file, so what compiling does ` +
			`is check the layout holds together.</p>` +
			`<pre class="map-preview layout" data-part="preview" data-quiet>${preview}</pre>`
		: `<h2 data-part="preview">Project file</h2>` +
			`<p class="summary">Written to <code>${escapeXml(figure.output)}</code> when this ` +
			`map is compiled.</p>` +
			field("Output", input("output", figure.output), "output") +
			listField(
				"Project-wide ignores",
				"Passed to Rojo as globIgnorePaths, unanchored.",
				figure.globIgnorePaths,
				"globs",
			) +
			`<pre class="map-preview" data-part="preview" data-quiet>${preview}</pre>`;

	const ignorePaths = lune
		? ""
		: listField("Ignore paths", IGNORE_HINT, first.ignorePaths, "ignorePaths");

	const actions = lune
		? `<button class="tb" disabled>Add directory</button>` +
			`<button class="tb" disabled>Add file</button>` +
			`<button class="tb" disabled>Delete</button>`
		: `<button class="tb" disabled>Add folder</button>` +
			`<select class="tb" disabled><option>Add service&hellip;</option></select>` +
			`<button class="tb" disabled>Delete</button>`;

	return `<div class="map-editor">` +
		`<div class="map-tree" data-part="tree" data-quiet>` +
		`<div class="map-bar" data-grip="tree"><span>${escapeXml(figure.name)}</span>` +
		`<span style="flex:1"></span><button class="tb" disabled>Undo</button></div>` +
		rows +
		`</div>` +
		`<div class="map-side">` +
		`<h2>This map</h2>` +
		field(
			"Describes",
			select("describes", lune ? "A filesystem — Lune" : "A DataModel — Roblox"),
			"describes",
		) +
		`<h2 data-map-heading>${escapeXml(first.heading)}</h2>` +
		`<div class="map-fields">${inspector}</div>` +
		ignorePaths +
		`<div class="map-actions" data-part="actions">${actions}</div>` +
		tail +
		`</div></div>`;
}
