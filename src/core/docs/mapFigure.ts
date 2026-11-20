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

import { ruleExceptions } from "../mapRule.js";
import { isFilesystemMap, type MapNode, type NodeMap } from "../nodemap.js";
import { escapeXml } from "./preview.js";
import { explorerIconHtml, type ToolbarArt, uiIconHtml } from "./toolbars.js";

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
	/** Mappings whose folder the reading rule would not give, the docs reading `src` as the output folder. */
	exceptions: number;
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
				? depth === 0
					? "Directory"
					: node.file
						? "File"
						: "Directory"
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
	if (node.path && node.optional) {
		const printed = valueLines({ optional: node.path }, indent, key);
		printed[0] = { ...printed[0], text: `"$path": ${printed[0].text}` };
		entries.push(printed);
	} else if (node.path) {
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

const isService = (node: MapNode) => node.className === undefined || node.className === "";

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
	node: MapNode,
	indent: number,
	label: string,
	isRoot: boolean,
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
		exceptions: filesystem ? 0 : ruleExceptions(map, "src").length,
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
 * What the editor is made of, named.
 *
 * The same device the toolbar figures use, and for the same reason: chrome is
 * unreadable on the first day, and a reader matching the fourth control in a
 * column to the seventh line of a paragraph is counting rather than reading.
 * Hovering an entry lights the part; hovering the part lights the entry.
 */
export function mapParts(figure: MapFigure): MapPart[] {
	const lune = figure.target === "lune";
	const tree: MapPart = {
		part: "tree",
		name: "The tree",
		what: lune
			? "Every directory and file the project has. Pick one and Instance follows."
			: "Every instance the map describes, with the folder that fills it. Pick one and Instance follows.",
	};
	const name: MapPart = {
		part: "name",
		name: "Name",
		what: lune
			? "What it is called on disk, with no extension: the row adds it."
			: "The instance's name in the DataModel. A folder the rule gave it follows the name.",
	};
	const describes: MapPart = {
		part: "describes",
		name: "Describes",
		what: "A DataModel for Roblox, or a filesystem for Lune. It decides the rest.",
	};
	const layout: MapPart = {
		part: "layout",
		name: "List or Graph",
		what: "The tree as rows, or as a graph from left to right with a + on each node to add inside it.",
	};
	if (lune) {
		return [
			tree,
			layout,
			{
				part: "actions",
				name: "Directory, File, Undo",
				what: "Build the tree. A file takes no children.",
			},
			name,
			{ part: "kind", name: "Kind", what: "A directory, or a file Roswaal writes a .luau for." },
			describes,
			{
				part: "preview",
				name: "Project file",
				what: "The layout: where each file lands, and the require that reaches it. Nothing is written.",
			},
		];
	}
	return [
		tree,
		layout,
		{
			part: "view",
			name: "DataModel or src",
			what: "Read the tree from either end: instances with their folders, or folders with where they land.",
		},
		{
			part: "actions",
			name: "Service, Folder, Undo",
			what: "Add a service, or a folder in the picked row. Its path comes from the reading rule.",
		},
		{
			part: "rule",
			name: "The reading rule",
			what: "Whether every folder is where the rule puts it, and which are not.",
		},
		name,
		{
			part: "class",
			name: "Class",
			what: "A service, or what Rojo makes. Rojo knows a service by its name.",
		},
		{
			part: "sync",
			name: "Sync",
			what: "Whether Rojo fills it from its own folder, or it only holds what is mapped under it.",
		},
		{
			part: "path",
			name: "Path",
			what: "The folder on disk that fills it. Choose… picks one from the project.",
		},
		{
			part: "ignoreUnknown",
			name: "Ignore unknown",
			what: "Rojo leaves alone what it did not put there.",
		},
		{ part: "ignorePaths", name: "Ignore paths", what: "Globs under this path for Rojo to skip." },
		describes,
		{
			part: "output",
			name: "Writes",
			what: "The project file. Rojo serves default.project.json by default.",
		},
		{
			part: "rojo",
			name: "Place IDs, Port",
			what: "Rojo's place settings: where rojo serve may sync, and its port.",
		},
		{ part: "globs", name: "Project-wide ignores", what: "Passed to Rojo as globIgnorePaths." },
		{
			part: "preview",
			name: "Project file",
			what: "What the map writes. Picking a row lights its lines.",
		},
	];
}

// ---------------------------------------------------------------------------
// The panel, as markup
// ---------------------------------------------------------------------------

/**
 * One Settings row, as `Field` in `MapEditor.tsx` writes it. `data-map-nonroot`
 * marks a row the DataModel itself has not, which the script hides for it.
 */
function field(
	label: string,
	control: string,
	part?: string,
	opts: { wide?: boolean; nonroot?: boolean; help?: string } = {},
): string {
	return (
		`<div class="setting${opts.wide ? " wide" : ""}"${part ? ` data-part="${escapeXml(part)}"` : ""}` +
		`${opts.nonroot ? " data-map-nonroot" : ""}>` +
		`<div class="setting-label"><b>${escapeXml(label)}</b>` +
		`${opts.help ? `<span>${escapeXml(opts.help)}</span>` : ""}</div>` +
		`<div class="setting-control">${control}</div></div>`
	);
}

function input(name: string, value: string, placeholder = ""): string {
	return (
		`<input class="tb" readonly data-map-field="${name}" value="${escapeXml(value)}"` +
		`${placeholder ? ` placeholder="${escapeXml(placeholder)}"` : ""}>`
	);
}

/** A segmented control showing one answer. A demonstrator: it does not switch. */
function segmented(options: string[], on: string, name?: string): string {
	return (
		`<div class="segmented"${name ? ` data-map-field="${name}"` : ""}>` +
		options
			.map(
				(one) =>
					`<button type="button" disabled${one === on ? ` class="on"` : ""}>${escapeXml(one)}</button>`,
			)
			.join("") +
		`</div>`
	);
}

function listRows(
	label: string,
	help: string,
	values: string[],
	name: string,
	art: ToolbarArt | undefined,
	nonroot = false,
): string {
	const rows = values
		.map(
			(value) =>
				`<div class="map-list-row"><input class="tb" readonly value="${escapeXml(value)}">` +
				`<button class="tb icon-only" disabled>${uiIconHtml("close", 13, art) || "&times;"}</button></div>`,
		)
		.join("");
	return (
		`<div class="setting map-list" data-map-list="${name}" data-part="${escapeXml(name)}"${nonroot ? " data-map-nonroot" : ""}>` +
		`<div class="setting-label"><b>${escapeXml(label)}</b><span>${escapeXml(help)}</span></div>` +
		`<div class="setting-control map-list-control">${rows}` +
		`<button class="tb with-icon" disabled>${uiIconHtml("plus", 13, art)}Add</button></div></div>`
	);
}

/** A row's icon, as `NodeIcon` draws it, with the map's mark where it syncs a folder. */
function rowIcon(row: MapFigureRow, lune: boolean, art: ToolbarArt | undefined): string {
	if (lune) return uiIconHtml(row.file ? "luauScript" : "folder", 15, art, "kind");
	const service = !row.root && !row.className;
	const icon = explorerIconHtml(row.root ? "DataModel" : (row.className ?? row.name), service, art);
	return row.path
		? `<span class="tree-badged">${icon}<span class="tree-map-badge">${uiIconHtml("map", 10, art)}</span></span>`
		: icon;
}

/** A row's class, as the Class field says it. */
const classLabel = (row: MapFigureRow): string =>
	!row.root && !row.className ? "Service" : (row.className ?? "Folder");

/** A card's head, as the dock draws a panel's: its title, and what it shows. */
function head(title: string, sub: string, grip?: string, subField = false): string {
	return (
		`<header class="map-head"${grip ? ` data-grip="${grip}"` : ""}><b>${escapeXml(title)}</b>` +
		`<span class="map-sub"${subField ? " data-map-heading" : ""}>${escapeXml(sub)}</span></header>`
	);
}

/**
 * The whole figure's insides: the panel, and the legend beside it.
 *
 * One string so the two renderers wrap it identically and cannot end up with
 * different nesting — which they would, because React needs an element to
 * hang `dangerouslySetInnerHTML` on and the template does not.
 */
export function mapFigureHtml(figure: MapFigure, art?: ToolbarArt): string {
	return (
		`<div class="docs-map-frame">${mapPanelHtml(figure, undefined, art)}</div>` +
		mapLegendHtml(figure)
	);
}

/**
 * A walkthrough step's drawing of the panel: the map as it stands at that
 * step, with no legend. Not `.docs-map`, so the static site's script leaves it
 * a picture rather than wiring its rows.
 */
export function walkMapHtml(step: { map: NodeMap; select?: string }, art?: ToolbarArt): string {
	return (
		`<div class="docs-walk-map docs-map-frame">` +
		`${mapPanelHtml(mapFigure(step.map), step.select, art)}</div>`
	);
}

/**
 * The legend, as markup.
 *
 * Beside the panel rather than under it: the panel is tall, and a list of
 * names below a tall picture is a list nobody reads next to the thing it names.
 */
export function mapLegendHtml(figure: MapFigure): string {
	const items = mapParts(figure)
		.map(
			(item) =>
				`<li data-part="${escapeXml(item.part)}">` +
				`<span class="docs-map-part">${escapeXml(item.name)}</span>` +
				`<span class="docs-map-what">${escapeXml(item.what)}</span></li>`,
		)
		.join("");
	return `<ul class="docs-map-legend">${items}</ul>`;
}

/**
 * The editor as markup, ready for `attachMapPanel` to wire up: the tree in its
 * card, Instance and This map beside it as the right dock holds them, and the
 * Project file along the foot.
 *
 * Every class name here is one the editor itself uses, so there is no second
 * set of styles to keep level with it. The only additions are the `data-`
 * hooks the script needs, which the editor does not need because it has React
 * to hand it the same values.
 *
 * `picked` is the row Instance shows, by its key, and lights the lines it
 * writes: a walkthrough step drawn partway through building a map. The first
 * row otherwise.
 */
export function mapPanelHtml(figure: MapFigure, picked?: string, art?: ToolbarArt): string {
	const lune = figure.target === "lune";
	const first = figure.rows.find((row) => row.key === picked) ?? figure.rows[0];
	const chevron = (open: boolean) =>
		uiIconHtml("chevron", 12, art, `map-chev${open ? " open" : ""}`);

	const rows = figure.rows
		.map((row) => {
			const icon = rowIcon(row, lune, art);
			const chip = row.file
				? `<span class="pathchip faint">.luau</span>`
				: row.path && !lune
					? `<span class="pathchip ok">${escapeXml(row.path)}</span>`
					: "";
			// What Instance shows rides on the row. The editor hands React the
			// node itself; a bundled script has no such thing, and re-deriving
			// it from the drawn row would mean parsing the picture back into
			// the model it was drawn from.
			const inspect = JSON.stringify({
				heading: `${row.name} · ${row.kind}`,
				name: row.name,
				class: classLabel(row),
				icon: lune
					? ""
					: explorerIconHtml(row.className ?? row.name, !row.root && !row.className, art),
				kind: row.file ? "File" : "Directory",
				path: row.path ?? "",
				ignoreUnknown: row.ignoreUnknown === true,
				ignorePaths: row.ignorePaths,
				root: row.root,
			});
			return (
				`<div class="map-row${row.key === first.key ? " selected" : ""}"` +
				` data-control="${escapeXml(row.key)}"` +
				` data-map-node="${escapeXml(inspect)}"` +
				` style="padding-left:${8 + row.depth * 16}px">` +
				`<span class="glyph"${row.parent ? "" : ` style="visibility:hidden"`}>${chevron(true)}</span>` +
				`${icon}<span class="name">${escapeXml(row.name)}</span>${chip}</div>`
			);
		})
		.join("");

	const preview = figure.lines
		.map((line) => {
			const keyed = line.key ? ` data-control="${escapeXml(line.key)}"` : "";
			const note = line.note ? `<span class="map-reach">${escapeXml(line.note)}</span>` : "";
			const lit = picked !== undefined && line.key === first.key ? " lit" : "";
			return (
				`<span class="map-preview-line${lit}"${keyed}>` +
				`${escapeXml("  ".repeat(line.indent) + line.text)}${note}</span>`
			);
		})
		.join("");

	const button = (icon: string, text: string) =>
		`<button class="tb with-icon" disabled>${uiIconHtml(icon, 13, art)}${escapeXml(text)}</button>`;
	const actions = lune
		? button("newFolder", "Directory") + button("newFile", "File")
		: button("plus", "Service") + button("newFolder", "Folder");
	const view = lune
		? ""
		: `<span data-part="view">${segmented(["DataModel", "src"], "DataModel")}</span>`;
	const rule = lune
		? ""
		: `<footer class="map-rule" data-part="rule">` +
			(figure.exceptions === 0
				? `<span class="map-rule-ok"><span class="map-check">&#10003;</span>Follows the reading rule</span>`
				: `<span class="map-rule-odd">${figure.exceptions} exception${figure.exceptions === 1 ? "" : "s"} to the reading rule</span>`) +
			`</footer>`;

	const tree =
		`<section class="map-card map-tree" data-part="tree" data-quiet>` +
		`<header class="map-head" data-grip="tree"><span class="map-title"><b>${escapeXml(figure.name)}</b>` +
		`<span class="map-sub">node map</span></span><span class="sp"></span><span data-part="layout">${segmented(["List", "Graph"], "List")}</span>${view}` +
		`<span class="map-docs-actions" data-part="actions">${actions}` +
		`<button class="tb icon-only" disabled>${uiIconHtml("undo", 14, art)}</button></span></header>` +
		`<div class="map-rows">${rows}</div>${rule}</section>`;

	const fields = lune
		? field("Name", input("name", first.name), "name") +
			field(
				"Kind",
				segmented(["Directory", "File"], first.file ? "File" : "Directory", "kind"),
				"kind",
				{
					nonroot: true,
				},
			)
		: field("Name", input("name", first.name), "name") +
			field(
				"Class",
				`<span class="pickbox" data-map-field="class"><span data-map-icon>` +
					`${explorerIconHtml(first.className ?? first.name, !first.root && !first.className, art)}</span>` +
					`<span class="clip">${escapeXml(classLabel(first))}</span>${uiIconHtml("chevron", 12, art, "pickbox-chev")}</span>`,
				"class",
				{ nonroot: true },
			) +
			field(
				"Sync",
				segmented(["Syncs", "Passes through"], first.path ? "Syncs" : "Passes through", "sync"),
				"sync",
				{ nonroot: true },
			) +
			field(
				"Path",
				`<span class="path-pick">${input("path", first.path ?? "", "Not synced")}` +
					`<button class="tb" disabled>Choose…</button></span>`,
				"path",
				{ wide: true, nonroot: true },
			) +
			field(
				"Ignore unknown",
				`<label class="settings-toggle"><input type="checkbox" disabled data-map-field="ignoreUnknown"` +
					`${first.ignoreUnknown ? " checked" : ""}><span data-map-field="ignoreUnknownText">` +
					`${first.ignoreUnknown ? "Left alone" : "Removed"}</span></label>`,
				"ignoreUnknown",
				{ nonroot: true },
			) +
			listRows(
				"Ignore paths",
				"Globs under this path for Rojo to skip, such as shared/**.",
				first.ignorePaths,
				"ignorePaths",
				art,
				true,
			);

	const settings =
		field(
			"Describes",
			segmented(["DataModel", "Filesystem"], lune ? "Filesystem" : "DataModel"),
			"describes",
		) +
		(lune
			? ""
			: field("Project name", input("project", figure.name)) +
				field("Writes", input("output", figure.output), "output") +
				field("Place IDs", input("placeIds", "", "Any place"), "rojo") +
				field("Port", input("port", "", "34872"), "rojo") +
				listRows(
					"Project-wide ignores",
					"Passed to Rojo as globIgnorePaths.",
					figure.globIgnorePaths,
					"globs",
					art,
				));

	const side =
		`<div class="map-docs-side">` +
		`<section class="map-card">${head("Instance", `${first.name} · ${first.kind}`, undefined, true)}` +
		`<div class="map-panel modal-shell"><div class="settings-box">${first.root ? fields.replaceAll(" data-map-nonroot", " data-map-nonroot hidden") : fields}</div></div></section>` +
		`<section class="map-card">${head("This map", figure.name)}` +
		`<div class="map-panel modal-shell"><div class="settings-box">${settings}</div></div></section>` +
		`</div>`;

	const foot =
		`<section class="map-card map-docs-foot" data-part="preview" data-quiet>` +
		`${head("Project file", lune ? "the layout" : figure.output, "preview")}` +
		`<div class="map-panel map-file-panel"><pre class="map-preview${lune ? " layout" : ""}">${preview}</pre></div>` +
		`</section>`;

	return `<div class="map-editor map-docs modal-shell">${tree}${side}${foot}</div>`;
}
