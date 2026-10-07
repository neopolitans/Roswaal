/**
 * The front page's tour: the editor's newer parts, one slide each, to try.
 *
 * The cards under "Inside the editor" say what is there; this shows it. Each
 * slide is a piece of the editor a reader can put their hands on -- type into
 * the node search, walk the picker, hover a name, open a menu from the
 * keyboard -- with what it is beside it and the release it arrived in.
 *
 * **Every demonstration is made by the code it demonstrates.** The pickers
 * list real nodes in `nodeColor()`'s colours and the visual one draws them
 * with the docs' renderer; the hovers are `hoverAt` asked about each name in
 * the snippet at build time; the menu is `menuHtml` over the Wally menu the
 * docs already draw; the preview is the compiler's output with its lines
 * picked out by the editor's own `analyse`. So a slide cannot show a hover the editor would not give,
 * or a node that has gone, and the build fails rather than drift.
 *
 * Whole as markup, like the rest of the page: the slides switch with radio
 * buttons and CSS, and each demonstration is drawn in a state worth looking at
 * -- a search typed, a hover open, a menu open. `TOUR_SCRIPT` makes them
 * answer: it filters, walks, hovers and opens. Without it they stay as drawn.
 */

import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { wirePath } from "../../src/app/geometry.ts";
import { highlightLuau } from "../../src/app/highlight.ts";
import { EVEN_ODD, ICONS, STROKED } from "../../src/app/icons.tsx";
import { droppedText } from "../../src/app/instanceDrop.ts";
import { NODE } from "../../src/app/layers.ts";
import { logoMarkup } from "../../src/app/logo.tsx";
import { luauCompletionSource } from "../../src/app/luauCompletions.ts";
import { nodeColor, pinColor } from "../../src/app/palette.ts";
import { analyse, fold } from "../../src/app/SelectionPreview.tsx";
import { NODE_ALIASES } from "../../src/core/aliases.ts";
import { categoryLabel } from "../../src/core/categories.ts";
import { compile } from "../../src/core/compiler/index.ts";
import { escapeHtml } from "../../src/core/docs/html.ts";
import {
	EDITOR_LAYOUT_PHONE,
	EDITOR_LAYOUT_TOUCH,
	inBrowser,
	layoutHtml,
	WALK_EDITOR_WEB,
} from "../../src/core/docs/layouts.ts";
import { graphSvg, placeGraph, straighten } from "../../src/core/docs/preview.ts";
import { RELEASES } from "../../src/core/docs/releases.ts";
import { releasePageSlug } from "../../src/core/docs/site.ts";
import {
	DATAMODEL_BROWSER,
	menuHtml,
	PROJECT_TREE_WALLY,
	PROJECT_TREE_WALLY_ADDED,
	toolbarHtml,
	WALLY_MENU,
} from "../../src/core/docs/toolbars.ts";
import { importLuau } from "../../src/core/import/fromLuau.ts";
import { hoverAt } from "../../src/core/luau/hover.ts";
import { growthState } from "../../src/core/nodes/growth.ts";
import { BUILTIN_NODES, createRegistry, nodeTitle } from "../../src/core/nodes/index.ts";
import { emptyScript } from "../../src/core/schema.ts";

/**
 * Where a release's notes are: its minor version's page, the release lit on
 * it. Throws for a version with no notes, so a badge cannot link to nothing.
 */
export function releaseHref(version) {
	if (!RELEASES.some((release) => release.version === version)) {
		throw new Error(`The front page dates something to a release with no notes: ${version}`);
	}
	return `docs/${releasePageSlug(version)}.html#v${version}`;
}

/**
 * A version badge that opens the notes it was first in. Shared by the cards
 * and the slides, so both say it the same way.
 */
export function sinceBadge(version, className) {
	return `<a class="${className}" href="${escapeHtml(releaseHref(version))}" title="First in ${escapeHtml(version)}: read its release notes">${escapeHtml(version)}</a>`;
}

/** The art `toolbars.ts` draws with, as the docs build passes it. */
const ART = {
	viewBox: "0 -960 960 960",
	paths: ICONS,
	mark: logoMarkup(15),
	version: "",
	pinColor,
	strokes: STROKED,
	evenOdd: EVEN_ODD,
};

function icon(name, size = 16) {
	const path = ICONS[name];
	if (!path) throw new Error(`The tour asks for an icon that is gone: ${name}`);
	const stroke = STROKED[name]
		? ` fill="none" stroke="currentColor" stroke-width="${STROKED[name]}" stroke-linecap="round"`
		: ` fill="currentColor"${EVEN_ODD.has(name) ? ' fill-rule="evenodd"' : ""}`;
	return `<svg viewBox="0 -960 960 960" width="${size}" height="${size}" aria-hidden="true"><path d="${path}"${stroke}/></svg>`;
}

/** Luau as tokens to HTML, in the editor's token classes. */
function tokensHtml(source) {
	return highlightLuau(source)
		.map((line) =>
			line
				.map((t) =>
					t.cls === "" ? escapeHtml(t.text) : `<span class="${t.cls}">${escapeHtml(t.text)}</span>`,
				)
				.join(""),
		)
		.join("\n");
}

// --------------------------------------------------------------- the nodes

/**
 * The nodes both pickers list: a handful a Roblox script reaches for first,
 * in the order the editor groups them. `task.wait` is here for its other
 * name -- type "sleep" and it is found -- which is the search's best trick.
 */
const PICKER_NODES = [
	"event.connect",
	"roblox.getService",
	"roblox.getEvent",
	"roblox.instanceNew",
	"flow.branch",
	"flow.forEach",
	"flow.while",
	"task.wait",
	"math.add",
	"math.random",
	"string.concat",
	"string.format",
	"table.insert",
	"logic.not",
	"debug.print",
	"code.custom",
	"value.expression",
];

function pickerNodes() {
	const registry = createRegistry();
	return PICKER_NODES.map((id) => {
		const def = BUILTIN_NODES.find((node) => node.id === id);
		if (!def) throw new Error(`The tour's pickers list a node that is gone: ${id}`);
		const script = {
			...emptyScript(def.title, `tour-${id}`),
			nodes: [{ id: "n", def: id, x: 0, y: 0 }],
			links: [],
		};
		const svg = graphSvg(script, registry, {
			geometry: NODE,
			nodeColor,
			pinColor,
			wirePath,
			growth: (pin) => growthState(registry.get(pin.id), pin.config),
		});
		return {
			id,
			def,
			colour: nodeColor(def),
			group: categoryLabel(def.category),
			also: NODE_ALIASES[id] ?? [],
			svg,
		};
	});
}

/** The nodes in their groups, in the order they were listed. */
function grouped(nodes) {
	const groups = new Map();
	for (const node of nodes) {
		if (!groups.has(node.group)) groups.set(node.group, []);
		groups.get(node.group).push(node);
	}
	return [...groups];
}

/** What a row is searched by: its name, its other names and its group. */
function searchedBy(node) {
	return escapeHtml([node.def.title, ...node.also, node.group].join(" ").toLowerCase());
}

/** The node menu: right-click, type, pick. `.menu`'s own rows. */
function listDemo(nodes) {
	const rows = grouped(nodes)
		.map(
			([group, members]) =>
				`<div class="group">${escapeHtml(group)}</div>` +
				members
					.map(
						(node, i) =>
							`<div class="item${group === "Events" && i === 0 ? " active" : ""}" role="option" data-find="${searchedBy(node)}" data-name="${escapeHtml(node.def.title)}">` +
							`<span class="swatch" style="background: ${node.colour}"></span>${escapeHtml(node.def.title)}` +
							`${node.def.pure ? '<span class="hint">pure</span>' : ""}</div>`,
					)
					.join(""),
		)
		.join("");
	return `<div class="tour-pane tour-canvas grid-surface tour-list-demo">
          <span class="tour-cursor" aria-hidden="true"></span>
          <div class="menu tour-menu-list" data-tour="list">
            <input class="search" type="search" placeholder="Search nodes…" aria-label="Search nodes" autocomplete="off" spellcheck="false" />
            <div class="items" role="listbox" aria-label="Nodes">${rows}<div class="empty" hidden>Nothing matches.</div></div>
          </div>
        </div>`;
}

/** The node picker: the same nodes, each drawn as you reach it. */
function visualDemo(nodes) {
	const first = nodes.findIndex((node) => node.id === "roblox.getEvent");
	const list = grouped(nodes)
		.map(
			([group, members]) =>
				`<div class="node-picker-group"><div class="head">${escapeHtml(group)}</div>` +
				members
					.map((node) => {
						const i = nodes.indexOf(node);
						return (
							`<button type="button" class="node-picker-hit${i === first ? " on" : ""}" data-shot="${i}" data-find="${searchedBy(node)}">` +
							`<span class="title">${escapeHtml(node.def.title)}</span>` +
							`${node.def.pure ? '<span class="hint">pure</span>' : ""}</button>`
						);
					})
					.join("") +
				`</div>`,
		)
		.join("");
	const shots = nodes
		.map(
			(node, i) =>
				`<div class="tour-shot" data-shot="${i}"${i === first ? "" : " hidden"}>` +
				`<div class="shot">${node.svg}</div>` +
				`<div class="about"><div class="name">${escapeHtml(node.def.title)}</div>` +
				`<div class="where">${escapeHtml(node.group)}</div>` +
				`${node.def.summary ? `<p class="summary">${escapeHtml(node.def.summary)}</p>` : ""}</div></div>`,
		)
		.join("");
	return `<div class="tour-pane tour-canvas grid-surface tour-visual-demo">
          <div class="node-picker" data-tour="visual">
            <div class="node-picker-field">
              ${icon("search", 18)}
              <input type="search" placeholder="Find a node" aria-label="Find a node" autocomplete="off" spellcheck="false" />
              <span class="count">${nodes.length}</span>
            </div>
            <div class="node-picker-body">
              <div class="node-picker-list">${list}<div class="empty" hidden>Nothing matches.</div></div>
              <div class="node-picker-preview">${shots}</div>
            </div>
            <div class="node-picker-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> walk</span><span><kbd>Enter</kbd> place</span><span><kbd>Esc</kbd> close</span></div>
          </div>
        </div>`;
}

// -------------------------------------------------------------- the preview

/**
 * The graph `P` is pressed on: a player joins, waits a second, and is welcomed
 * by name. Two of its nodes are pure and write no line of their own, so the
 * preview has both of its answers to give -- the lines a node wrote, and the
 * line a pure node's value ended up in.
 */
export function welcomeScript() {
	/** @type {import("../../src/core/schema.ts").NodeScript} */
	const script = {
		...emptyScript("Welcome", "tour-preview"),
		nodes: [
			{ id: "start", def: "script.begin", x: -260, y: 0 },
			{
				id: "players",
				def: "roblox.getService",
				x: -260,
				y: 120,
				literals: { service: { t: "string", v: "Players" } },
			},
			{
				id: "event",
				def: "roblox.getEvent",
				x: 0,
				y: 120,
				literals: { event: { t: "string", v: "PlayerAdded" } },
			},
			{
				id: "connect",
				def: "event.connect",
				x: 260,
				y: 0,
				config: { params: [{ name: "player", type: "Player" }] },
			},
			{ id: "wait", def: "task.wait", x: 540, y: 0 },
			{
				id: "name",
				def: "roblox.getProperty",
				x: 300,
				y: 200,
				literals: { property: { t: "string", v: "Name" } },
			},
			{
				id: "join",
				def: "string.concat",
				x: 540,
				y: 140,
				literals: { a0: { t: "string", v: "Welcome, " } },
			},
			{ id: "print", def: "debug.print", x: 800, y: 0 },
		],
		links: [
			{ id: "l0", from: { node: "start", pin: "then" }, to: { node: "connect", pin: "in" } },
			{
				id: "l1",
				from: { node: "players", pin: "service" },
				to: { node: "event", pin: "instance" },
			},
			{ id: "l2", from: { node: "event", pin: "result" }, to: { node: "connect", pin: "signal" } },
			{ id: "l3", from: { node: "connect", pin: "body" }, to: { node: "wait", pin: "in" } },
			{ id: "l4", from: { node: "wait", pin: "then" }, to: { node: "print", pin: "in" } },
			{ id: "l5", from: { node: "connect", pin: "p0" }, to: { node: "name", pin: "instance" } },
			{ id: "l6", from: { node: "name", pin: "result" }, to: { node: "join", pin: "a1" } },
			{ id: "l7", from: { node: "join", pin: "result" }, to: { node: "print", pin: "value" } },
		],
	};
	return script;
}

/** What the preview starts on, drawn before any script runs. */
const PREVIEW_OPEN = "connect";

/** The preview's lines, as `SelectionPreview` draws them; `null` is a fold. */
function previewRowsHtml(rows) {
	return rows
		.map((row) =>
			row === null
				? '<span class="fold">⋯</span>'
				: `<span class="ln${row.mine ? " mine" : ""}${row.downstream ? " downstream" : ""}" data-line="${row.line}">` +
					`<span class="num">${row.line}</span><span class="text">${
						row.tokens.length === 0
							? " "
							: row.tokens
									.map((t) =>
										t.cls === ""
											? escapeHtml(t.text)
											: `<span class="${t.cls}">${escapeHtml(t.text)}</span>`,
									)
									.join("")
					}</span></span>`,
		)
		.join("");
}

/**
 * The graph with each node a button over it, and the Selection preview under
 * it. Every node's answer is worked out here by `analyse`, the function the
 * editor's preview runs, and carried on its button: the lines it wrote, and the
 * lines a pure one's value surfaced in. The script only adds them up for
 * however many are selected, which is what `analyse` does with a selection.
 */
function previewDemo() {
	const registry = createRegistry();
	const script = welcomeScript();
	const compiled = compile(script, registry);
	if (!compiled.ok) {
		throw new Error(
			`The tour's preview graph no longer compiles: ${compiled.diagnostics.map((d) => d.message).join(" ")}`,
		);
	}
	const options = {
		geometry: NODE,
		nodeColor,
		pinColor,
		wirePath,
		growth: (pin) => growthState(registry.get(pin.id), pin.config),
	};
	const svg = graphSvg(script, registry, options);
	// Where graphSvg drew each node: levelled the same way, measured the same way.
	const placed = placeGraph(straighten(script, registry, options), registry, options);
	const box = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
	if (!box) throw new Error("The preview graph was drawn without a viewBox.");
	const [vx, vy, vw, vh] = box.slice(1).map(Number);

	const question = (selection) => ({
		script,
		registry,
		selection,
		code: compiled.code,
		sourceMap: compiled.sourceMap,
		// Nothing to close: analyse never calls it.
		onClose: () => undefined,
	});
	const buttons = placed
		.map(({ node, x, y, width, height }) => {
			const { rows, inlined, entries } = analyse(question(new Set([node.id])));
			const lines = (pick) =>
				rows
					.filter(pick)
					.map((row) => row.line)
					.join(",");
			const title = nodeTitle(registry.get(node.def), node);
			const pct = (v) => `${(v * 100).toFixed(3)}%`;
			return (
				`<button type="button" class="tour-node${node.id === PREVIEW_OPEN ? " on" : ""}" data-node="${escapeHtml(node.id)}"` +
				` data-mine="${lines((r) => r.mine)}" data-down="${lines((r) => r.downstream)}"` +
				`${inlined.length ? ` data-pure="${escapeHtml(title)}"` : ""}` +
				`${entries.length ? ` data-entry="${escapeHtml(title)}"` : ""}` +
				` aria-pressed="${node.id === PREVIEW_OPEN}" title="${escapeHtml(title)}"` +
				` style="left: ${pct((x - vx) / vw)}; top: ${pct((y - vy) / vh)}; width: ${pct(width / vw)}; height: ${pct(height / vh)}"></button>`
			);
		})
		.join("");

	const opened = analyse(question(new Set([PREVIEW_OPEN])));
	const lit = opened.rows.filter((row) => row.mine).length;
	return `<div class="tour-pane tour-preview-demo" data-tour="preview">
          <div class="tour-preview-graph tour-canvas grid-surface">
            <div class="tour-preview-frame">${svg}${buttons}</div>
          </div>
          <div class="docs preview-luau tour-preview-panel">
            <div class="docs-head">${icon("terminal", 16)}<strong class="tour-preview-title">Selection preview</strong>
              <span class="sub tour-preview-sub">1 node · ${lit} line${lit === 1 ? "" : "s"}</span><span class="spacer"></span>
              <label class="preview-toggle"><input type="checkbox" class="tour-preview-whole" />Whole file</label></div>
            <div class="preview-body">
              <div class="tour-preview-notes"></div>
              <pre class="preview-code">${previewRowsHtml(fold(opened.rows))}</pre>
              <template class="tour-preview-rows">${previewRowsHtml(opened.rows.map((row) => ({ ...row, mine: false, downstream: false })))}</template>
            </div>
          </div>
        </div>`;
}

// --------------------------------------------------------------- the hovers

/** Code that hover reads the way it reads any Luau file: a server script. */
const HOVER_SOURCE = `local Players = game:GetService("Players")
local coins = 0

local function award(player: Player, amount: number)
	coins += amount
	local stats = player:FindFirstChild("leaderstats")
	if stats and stats:IsA("Folder") then
		print(player.Name, coins)
	end
end

Players.PlayerAdded:Connect(function(player)
	award(player, 10)
end)`;

/** A module documented the way Moonwave reads it. */
const MOONWAVE_SOURCE = `--[=[
	@class Inventory
	What a player is carrying, by item name.
]=]
local Inventory = {}

--[=[
	@prop capacity number
	@within Inventory
	How many items fit.
]=]
Inventory.capacity = 20

--[=[
	Adds an item, unless the inventory is full.

	\`\`\`lua
	Inventory.add(bag, "Sword")
	\`\`\`

	@param bag { string } -- the items held now
	@param item string -- what to add
	@return boolean -- whether it fitted
]=]
function Inventory.add(bag: { string }, item: string): boolean
	if #bag >= Inventory.capacity then
		return false
	end
	table.insert(bag, item)
	return true
end

return Inventory`;

/** Doc prose: `code`, **bold** and links, as the hover sets them. */
function inline(text) {
	const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
	let out = "";
	let last = 0;
	for (const match of text.matchAll(pattern)) {
		out += escapeHtml(text.slice(last, match.index));
		last = match.index + match[0].length;
		if (match[1] !== undefined) out += `<code>${escapeHtml(match[1])}</code>`;
		else if (match[2] !== undefined) out += `<strong>${escapeHtml(match[2])}</strong>`;
		else out += escapeHtml(match[3]);
	}
	return out + escapeHtml(text.slice(last));
}

/** A tagged row: `name: type — what it is`. */
function tagRows(title, items) {
	if (!items.length) return "";
	return (
		`<dl class="luau-hover-tags"><dt>${escapeHtml(title)}</dt>` +
		items
			.map(
				(item) =>
					`<dd><code>${tokensHtml(item.name ? `${item.name}${item.type ? `: ${item.type}` : ""}` : (item.type ?? ""))}</code>` +
					`${item.description ? ` — ${inline(item.description)}` : ""}</dd>`,
			)
			.join("") +
		`</dl>`
	);
}

/**
 * A hover as the code editor draws it -- `luauHover.ts`, written as a string
 * because this page is built rather than run. The same classes in the same
 * nesting, so the editor's stylesheet sets it. What it leaves out the snippets
 * here never ask for: notes, deprecations, related interfaces.
 */
export function hoverHtml(hover) {
	const [signature, returned] = hover.code.split(" → ");
	let out =
		`<div class="luau-hover-head"><code>${tokensHtml(signature)}` +
		`${returned !== undefined ? ` → <span class="tok-type">${escapeHtml(returned)}</span>` : ""}</code>` +
		`${hover.role ? `<span class="luau-hover-role">${escapeHtml(hover.role)}</span>` : ""}</div>`;
	if (hover.summary) out += `<p>${escapeHtml(hover.summary.replace(/`/g, ""))}</p>`;
	if (hover.doc) {
		const doc = hover.doc;
		let box = "";
		const lines = doc.text.split("\n");
		for (let i = 0; i < lines.length; ) {
			const fence = /^\s*```\s*(\w*)/.exec(lines[i]);
			if (fence) {
				const body = [];
				for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i]);
				i++;
				box += `<pre><code>${tokensHtml(body.join("\n").replace(/\t/g, "  "))}</code></pre>`;
				continue;
			}
			const para = [];
			for (; i < lines.length && lines[i].trim() !== "" && !/^\s*```/.test(lines[i]); i++)
				para.push(lines[i].trim());
			if (para.length) box += `<p>${inline(para.join(" "))}</p>`;
			while (i < lines.length && lines[i].trim() === "") i++;
		}
		box += tagRows("Parameters", doc.params);
		box += tagRows("Returns", doc.returns);
		box += tagRows("Errors", doc.errors);
		if (doc.fields?.length) {
			box += tagRows(
				"Fields",
				doc.fields.map((f) => ({ name: `.${f.name}`, type: f.type, description: f.description })),
			);
		}
		out += `<div class="luau-hover-doc">${box}</div>`;
	}
	for (const to of [hover.link, hover.also]) {
		if (to)
			out += `<a href="${escapeHtml(to.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(to.label)}</a>`;
	}
	return out;
}

/** Tokens hover never answers for: there is no name in them. */
const UNNAMED = new Set([
	"tok-keyword",
	"tok-comment",
	"tok-string",
	"tok-number",
	"tok-meta",
	"tok-operator",
]);

/**
 * The snippet with every name hover answers for made hoverable.
 *
 * Each name is asked of `hoverAt` at its own offset, exactly as the editor
 * asks when the pointer rests on it. A name it says nothing about stays plain
 * text, so the demonstration can only offer what the editor would.
 *
 * Returns the code's markup, the distinct hovers in order, and which hover the
 * name `open` gets, to draw that one open.
 */
export function hoverableCode(source, open) {
	const hovers = [];
	const seen = new Map();
	let opened = -1;
	let offset = 0;
	const html = highlightLuau(source)
		.map((line, row) => {
			const lineText = line.map((t) => t.text).join("");
			if (lineText !== source.split("\n")[row]) {
				throw new Error("The highlighter no longer hands back each line whole.");
			}
			const out = line
				.map((token) => {
					const parts = token.text.split(/([A-Za-z_][A-Za-z0-9_]*)/);
					const drawn = parts
						.map((part, k) => {
							const at = offset;
							offset += part.length;
							const wrap = (text) =>
								token.cls === ""
									? escapeHtml(text)
									: `<span class="${token.cls}">${escapeHtml(text)}</span>`;
							if (k % 2 === 0 || part === "" || UNNAMED.has(token.cls)) return wrap(part);
							const hover = hoverAt(source, at + Math.min(1, part.length - 1), true);
							if (!hover || hover.from > at || hover.to < at + part.length) return wrap(part);
							const key = JSON.stringify({ ...hover, from: 0, to: 0 });
							if (!seen.has(key)) {
								seen.set(key, hovers.length);
								hovers.push(hover);
							}
							const index = seen.get(key);
							if (part === open && opened === -1) opened = index;
							return `<span class="tour-sym${index === opened && part === open ? " on" : ""}" tabindex="0" data-hover="${index}">${wrap(part)}</span>`;
						})
						.join("");
					return drawn;
				})
				.join("");
			offset += 1; // the line's end
			return out;
		})
		.join("\n");
	if (open !== undefined && opened === -1) {
		throw new Error(`The tour opens a hover on ${open}, and hover says nothing about it.`);
	}
	return { html, hovers, opened };
}

function hoverDemo(source, open, label) {
	const { html, hovers, opened } = hoverableCode(source, open);
	return `<div class="tour-pane tour-code-demo" data-tour="hover">
          <div class="card-head"><h3 class="card-title">${escapeHtml(label)}</h3><span class="card-slot"><span class="runtime-chip runtime-chip-roblox">Roblox</span></span></div>
          <div class="tour-code-wrap">
            <pre class="landing-code tour-code"><code>${html}</code></pre>
            <div class="luau-hover tour-hover" role="tooltip">${hoverHtml(hovers[opened])}</div>
          </div>
          ${hovers.map((hover, i) => `<template data-hover="${i}">${hoverHtml(hover)}</template>`).join("")}
        </div>`;
}

// ------------------------------------------------------------ the windows

/**
 * The editor on each kind of screen, as the documentation draws it: the same
 * `layoutHtml` and the same layouts as [The interface](the-interface), which a
 * test holds against the editor's own chrome. So the slide shows the floating
 * groups, the cards and the sheets where each form factor really puts them,
 * rather than a sketch of them that could only agree by luck.
 */
/** @type {[string, string, import("../../src/core/docs/layouts.ts").LayoutSpec][]} */
const DEVICE_LAYOUTS = [
	["computer", "Computer", WALK_EDITOR_WEB],
	// With its card open: the walkthroughs' tablet has them closed, which is
	// right for "press the mark" and shows nothing of how a tablet lays out.
	["tablet", "Tablet", inBrowser(EDITOR_LAYOUT_TOUCH, "tour-tablet")],
	["phone", "Phone", inBrowser(EDITOR_LAYOUT_PHONE, "tour-phone")],
];

function windowsDemo() {
	const registry = createRegistry();
	const preview = {
		geometry: NODE,
		nodeColor,
		pinColor,
		wirePath,
		growth: (pin) => growthState(registry.get(pin.id), pin.config),
	};
	return `<div class="tour-pane tour-windows-demo">
          ${DEVICE_LAYOUTS.map(([id], i) => `<input class="tour-pick" type="radio" name="tour-device" id="tour-device-${id}"${i === 0 ? " checked" : ""} />`).join("")}
          <div class="tour-device-switch segmented" role="group" aria-label="Show it on">${DEVICE_LAYOUTS.map(([id, name]) => `<label for="tour-device-${id}">${name}</label>`).join("")}</div>
          ${DEVICE_LAYOUTS.map(
						([id, , spec]) =>
							`<div class="tour-device tour-device-${id}">${layoutHtml(spec, { ...ART, version: "" }, { preview, numbered: false })}</div>`,
					).join("\n          ")}
        </div>`;
}

/** The Wally menu, open on its package, as the editor's one menu draws it. */
function menuDemo() {
	const sections = WALLY_MENU.groups.map((group) => group.items);
	const body = menuHtml(sections, { ...ART }).replace(
		/<button type="button" tabindex="-1"/g,
		'<button type="button" tabindex="-1" role="menuitem"',
	);
	return `<div class="tour-pane tour-canvas grid-surface tour-menu-demo" data-tour="menu">
          <div class="tour-tree-card">
            <div class="tour-card-head">Project</div>
            <ul class="tour-tree">
              <li class="tour-tree-file">${icon("document", 13)}default.project.json</li>
              <li class="tour-tree-file tour-menu-anchor on" tabindex="0" aria-haspopup="menu" aria-expanded="true">${icon("instance", 13)}wally.toml</li>
              <li class="tour-tree-folder">${icon("folderOpen", 13)}Packages</li>
            </ul>
          </div>
          <div class="menu menu--list tour-menu" role="menu" aria-label="wally.toml">${body}</div>
          <p class="tour-readout" aria-live="polite">Right-click <code>wally.toml</code>, or press <kbd>Enter</kbd> on it.</p>
        </div>`;
}

// ------------------------------------------------------------- completion

/**
 * Where completion is asked: a line typed up to the cursor, what is typed of
 * the name so far, and what follows the cursor. The options are the editor's
 * own -- `luauCompletionSource` asked at the cursor, as CodeMirror asks it.
 */
const COMPLETIONS = [
	{ tab: 'Instance.new("', before: 'local part = Instance.new("', typed: "Pa", after: '")' },
	{ tab: 'GetService("', before: 'local storage = game:GetService("', typed: "Rep", after: '")' },
	{ tab: ':IsA("', before: 'if hit:IsA("', typed: "Bas", after: '") then' },
	{ tab: "Vector3.", before: "local up = Vector3.", typed: "", after: "" },
];

/** How many options the list shows at once, as a popup would. */
const COMPLETION_SHOWN = 8;

/** What the editor offers at the end of `text`, in the order it offers it. */
function completionsAt(text) {
	const source = luauCompletionSource(
		() => [],
		() => "roblox",
	);
	const result = source(
		new CompletionContext(EditorState.create({ doc: text }), text.length, false),
	);
	if (!result || result.options.length === 0) {
		throw new Error(`The tour asks for completion after ${text}, and the editor offers nothing.`);
	}
	return result.options.map((option) => ({ label: option.label, detail: option.detail ?? "" }));
}

/**
 * Narrowed to what is typed. CodeMirror ranks fuzzily as well; a prefix is
 * the part of that a reader can predict, and every option is the editor's.
 */
function narrowed(options, typed) {
	const prefix = typed.toLowerCase();
	return options.filter((option) => option.label.toLowerCase().startsWith(prefix));
}

function completionItems(options) {
	return options
		.slice(0, COMPLETION_SHOWN)
		.map(
			(option, i) =>
				`<li role="option"${i === 0 ? ' aria-selected="true"' : ""}><span class="cm-completionLabel">${escapeHtml(option.label)}</span>` +
				`${option.detail ? `<span class="cm-completionDetail">${escapeHtml(option.detail)}</span>` : ""}</li>`,
		)
		.join("");
}

function completeDemo() {
	const lists = [];
	const keys = new Map();
	const asked = COMPLETIONS.map((one) => {
		const options = completionsAt(one.before + one.typed);
		const key = JSON.stringify(options);
		if (!keys.has(key)) {
			keys.set(key, lists.length);
			lists.push(options);
		}
		return { ...one, list: keys.get(key), options };
	});
	const first = asked[0];
	return `<div class="tour-pane tour-canvas grid-surface tour-complete-demo" data-tour="complete">
          <div class="segmented tour-complete-tabs" role="group" aria-label="Where completion is asked">${asked
						.map(
							(one, i) =>
								`<button type="button" data-ask="${i}"${i === 0 ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"'}><code>${escapeHtml(one.tab)}</code></button>`,
						)
						.join("")}</div>
          <div class="code-body tour-complete-box">
            ${asked
							.map(
								(one, i) =>
									`<pre class="landing-code tour-complete-line" data-ask="${i}" data-list="${one.list}" data-count="${one.options.length}"${i === 0 ? "" : " hidden"}><code>${tokensHtml(one.before)}<input class="tour-complete-input" value="${escapeHtml(one.typed)}" size="${Math.max(4, one.typed.length + 2)}" aria-label="Keep typing" autocomplete="off" spellcheck="false" />${tokensHtml(one.after)}</code></pre>`,
							)
							.join("\n            ")}
            <div class="cm-tooltip cm-tooltip-autocomplete"><ul role="listbox" aria-label="What the editor offers">${completionItems(narrowed(first.options, first.typed))}</ul></div>
          </div>
          <p class="tour-readout tour-complete-readout" aria-live="polite">The editor offers ${first.options.length} here, narrowed as you type.</p>
          <template class="tour-complete-lists">${escapeHtml(JSON.stringify(lists))}</template>
        </div>`;
}

// ----------------------------------------------------- the DataModel, dragged

/**
 * Each drawn row's place in the DataModel, read off the drawing's own rows:
 * a row's depth says which of the rows above it is its parent.
 */
function dataModelPaths() {
	const rows = DATAMODEL_BROWSER.groups
		.flatMap((group) => group.items)
		.filter((item) => item.t === "treeRow");
	const stack = [];
	return rows.map((row) => {
		stack.length = row.depth;
		stack.push(row.label);
		return [...stack];
	});
}

/**
 * The DataModel browser as the docs draw it, each row draggable into a piece
 * of Custom Code. What a drop writes is `droppedText`'s: a whole local on a
 * blank line, the path alone anywhere else -- worked out here for every row
 * and both places, so the page only has to show it.
 */
function dragDemo() {
	const paths = dataModelPaths();
	let row = 0;
	const tree = toolbarHtml(DATAMODEL_BROWSER, { ...ART, version: "" })
		.replace(' aria-hidden="true"', "")
		.replace(/<div class="tree-row place-row[^"]*"/g, (open) => {
			const path = paths[row++];
			if (!path) return open;
			const whole = droppedText({ path }, "block", { from: 0, to: 1, text: "\t" }, 1).insert;
			const inline = droppedText({ path }, "block", { from: 0, to: 7, text: "print()" }, 6).insert;
			return `${open} tabindex="0" role="button" aria-label="Drag ${escapeHtml(path.join("."))}" data-whole="${escapeHtml(whole)}" data-inline="${escapeHtml(inline)}"`;
		});
	if (row !== paths.length)
		throw new Error("The DataModel drawing's rows no longer match its spec.");
	const config = paths.find((path) => path.at(-1) === "Config");
	const door = paths.find((path) => path.at(-1) === "Door");
	if (!config || !door) throw new Error("The DataModel drawing no longer has Config and Door.");
	const firstWhole = droppedText(
		{ path: config },
		"block",
		{ from: 0, to: 1, text: "\t" },
		1,
	).insert;
	const firstInline = droppedText(
		{ path: door },
		"block",
		{ from: 0, to: 7, text: "print()" },
		6,
	).insert;
	return `<div class="tour-pane tour-canvas grid-surface tour-drag-demo" data-tour="drag">
          <div class="tour-drag-tree">${tree}</div>
          <div class="tour-drag-code code-body">
            <div class="tour-card-head">Custom Code</div>
            <pre class="landing-code"><code>${tokensHtml("local function openDoor()")}
	<span class="tour-drop" data-drop="whole" tabindex="0" aria-label="A blank line">${tokensHtml(firstWhole)}</span>
	${tokensHtml("print(")}<span class="tour-drop" data-drop="inline" tabindex="0" aria-label="Inside print()">${tokensHtml(firstInline)}</span>${tokensHtml(")")}
${tokensHtml("end")}</code></pre>
          </div>
          <p class="tour-readout tour-drag-readout" aria-live="polite">Drag a row onto the blank line or into <code>print()</code>.</p>
        </div>`;
}

// ------------------------------------------------------------------ Wally

/**
 * wally.toml in the project tree, before and after Add from Wally…: the
 * docs' own two drawings, so each package and its version is shown as the
 * tree shows it. Switched by radio buttons, as the slides are.
 */
function wallyDemo() {
	/** @type {[string, string, import("../../src/core/docs/toolbars.ts").ToolbarSpec][]} */
	const states = [
		["before", "Before", PROJECT_TREE_WALLY],
		["after", "After Add from Wally… Flux", PROJECT_TREE_WALLY_ADDED],
	];
	return `<div class="tour-pane tour-canvas grid-surface tour-wally-demo">
          ${states.map(([id], i) => `<input class="tour-pick" type="radio" name="tour-wally" id="tour-wally-${id}"${i === 0 ? " checked" : ""} />`).join("")}
          <div class="tour-device-switch segmented" role="group" aria-label="Show">${states.map(([id, name]) => `<label for="tour-wally-${id}">${escapeHtml(name)}</label>`).join("")}</div>
          ${states.map(([id, , spec]) => `<div class="tour-wally tour-wally-${id}">${toolbarHtml(spec, { ...ART, version: "" })}</div>`).join("\n          ")}
        </div>`;
}

// ----------------------------------------------------------------- import

/** A file to import: a loop, a branch and calls, and one line that stays Luau. */
const IMPORT_SOURCE = `local coins = 0
local bonus = true

for i = 1, 5 do
	coins += i
end

local label = bonus and "Bonus round" or "Round"
if coins > 10 then
	print(label, coins)
else
	warn("Not enough coins")
end
`;

/**
 * The modes import offers, as its settings name them.
 * @type {[import("../../src/core/import/modes.ts").ImportMode, string][]}
 */
const IMPORT_MODES = [
	["verbatim", "Verbatim"],
	["tidy", "Tidy"],
	["modern", "Modern"],
];

/** The report the editor shows when an import finishes, in its words. */
function importReport(report) {
	const kept = report.asCode.map((c) => `${c.construct} ×${c.count}`).join(", ");
	return [
		`${report.asNodes} of ${report.statements} statements are nodes.${kept ? ` Kept as code: ${kept}.` : ""}`,
		...(report.rewrites > 0 ? [`Written in newer syntax: ${report.rewrites}.`] : []),
		...report.findings.map((f) => `Line ${f.line}: ${f.message}`),
	].join(" ");
}

/**
 * The same file imported in each mode by `importLuau`, drawn, and compiled
 * back to Luau: so the reader sees what became nodes, what stayed as Luau
 * text, and what Modern rewrote.
 */
function importDemo() {
	const registry = createRegistry();
	const options = {
		geometry: NODE,
		nodeColor,
		pinColor,
		wirePath,
		growth: (pin) => growthState(registry.get(pin.id), pin.config),
	};
	const modes = IMPORT_MODES.map(([mode, name]) => {
		const result = importLuau(IMPORT_SOURCE, {
			name: "Coins",
			scriptClass: "Script",
			target: "roblox",
			idPrefix: "tour",
			mode,
		});
		if (!result.ok) throw new Error(`The tour's import no longer imports: ${result.error}`);
		const compiled = compile(result.script, registry);
		if (!compiled.ok) throw new Error("The tour's imported graph no longer compiles.");
		// The generated header says where the file came from; the body is the point.
		const body = compiled.code
			.split("\n")
			.filter((line) => !line.startsWith("--"))
			.join("\n")
			.trim();
		const main = { ...result.script, nodes: result.script.nodes.filter((node) => !node.graph) };
		return {
			mode,
			name,
			svg: graphSvg(main, registry, options),
			body,
			report: importReport(result.report),
		};
	});
	return `<div class="tour-pane tour-import-demo">
          ${modes.map(({ mode }, i) => `<input class="tour-pick" type="radio" name="tour-import" id="tour-import-${mode}"${i === 0 ? " checked" : ""} />`).join("")}
          <div class="tour-device-switch segmented" role="group" aria-label="Import mode">${modes.map(({ mode, name }) => `<label for="tour-import-${mode}">${name}</label>`).join("")}</div>
          ${modes
						.map(
							({ mode, svg, body, report }) => `<div class="tour-import tour-import-${mode}">
            <figure class="tour-import-graph tour-canvas grid-surface">${svg}</figure>
            <div class="tour-import-code">
              <div><div class="tour-card-head">Coins.server.luau</div><pre class="landing-code"><code>${tokensHtml(IMPORT_SOURCE.trim())}</code></pre></div>
              <div><div class="tour-card-head">What the graph writes</div><pre class="landing-code"><code>${tokensHtml(body)}</code></pre></div>
            </div>
            <p class="tour-readout">${escapeHtml(report)}</p>
          </div>`,
						)
						.join("\n          ")}
        </div>`;
}

// ------------------------------------------------------------- the slides

/**
 * The slides, in the order a reader meets the parts. `since` is the release
 * each part first shipped in; its badge opens that release's notes. `steps`
 * are the later releases that added what the demonstration also shows, so no
 * badge claims a part arrived whole when it arrived in pieces.
 */
export const SLIDES = [
	{
		key: "preview",
		tab: "Preview",
		title: "Which lines are whose",
		since: "0.17.0",
		steps: [["0.33.0", "the whole script with nothing selected"]],
		doc: "docs/controls.html",
		body: "Select nodes and press <kbd>P</kbd> to see the lines they wrote, picked out of the real generated file. A pure node has no line of its own, so the preview lights the line its value ends up in.",
		keys: "<kbd>P</kbd>, with or without a selection",
		tryThis:
			"Click a node in the graph. <kbd>Shift</kbd>-click to add another, or click the canvas to preview the whole script.",
	},
	{
		key: "list",
		tab: "Search",
		title: "Find a node by name",
		since: "0.1.0",
		steps: [
			["0.45.0", "the Luau it writes"],
			["0.74.0", "other names"],
		],
		doc: "docs/controls.html",
		body: "Right-click the canvas and type. Nodes are found by their names, by what other tools call them (<em>sleep</em> finds Wait), and by the Luau they write (<em>if</em> finds Branch).",
		keys: "<kbd>Right-click</kbd> the canvas",
		tryThis:
			"Type <em>sleep</em> into the search, then walk the list with <kbd>↑</kbd> <kbd>↓</kbd>.",
	},
	{
		key: "visual",
		tab: "Picker",
		title: "Or by how it looks",
		since: "0.50.0",
		steps: [["0.74.0", "two fingers on a touch screen"]],
		doc: "docs/controls.html",
		body: "The node picker lists the same nodes and draws each one as you reach it, in your wire style, for when you remember a node's shape better than its name. Press and hold with two fingers to open it on a tablet.",
		keys: "<kbd>Ctrl</kbd> + <kbd>Right-click</kbd>",
		tryThis: "Point at a node in the list, or walk it with the arrow keys.",
	},
	{
		key: "hover",
		tab: "Hover",
		title: "Code that knows its names",
		since: "0.90.0",
		steps: [
			["0.93.0", "in .luau files"],
			["0.94.0", "types and methods"],
		],
		doc: "docs/reading-luau.html",
		body: "Rest on a name in Custom Code or a Luau file and the editor says what it is: a local and its type, a parameter, a method with its signature and a link to where Roblox documents it.",
		keys: "Hover, or move the caret onto a name",
		tryThis:
			"Hover <code>stats</code>, <code>IsA</code> or <code>award</code>. Tab steps through the names.",
	},
	{
		key: "complete",
		tab: "Complete",
		title: "Completion that knows Roblox",
		since: "0.89.0",
		doc: "docs/hand-written-luau.html",
		body: "As you type Luau, the editor offers what fits where the cursor is: Roblox's classes in <code>Instance.new</code> and <code>:IsA</code>, its services in <code>:GetService</code>, and a datatype's constructors and constants after its dot.",
		keys: "Type, then <kbd>↑</kbd> <kbd>↓</kbd> and <kbd>Enter</kbd> or <kbd>Tab</kbd>",
		tryThis:
			"Pick where to ask, then keep typing in the box. <kbd>Enter</kbd> takes the option that is lit.",
	},
	{
		key: "moonwave",
		tab: "Moonwave",
		title: "Your own docs, as you write them",
		since: "0.104.0",
		steps: [["0.110.0", "@class, @prop and @interface"]],
		doc: "docs/reading-luau.html",
		body: "Doc comments above a function show in its hover: prose, examples, parameters and returns. Moonwave's <code>@class</code>, <code>@prop</code> and <code>@interface</code> are read too, and the tags are coloured where you write them.",
		keys: "<code>--[=[ ]=]</code> or <code>---</code> above a declaration",
		tryThis: "Hover <code>Inventory</code>, <code>capacity</code> and <code>add</code>.",
	},
	{
		key: "drag",
		tab: "Drag in",
		title: "From the DataModel into your code",
		since: "0.103.0",
		steps: [["0.128.0", "dragged into Custom Code"]],
		doc: "docs/project-panel.html",
		body: "The Project panel's DataModel tab lists your place as Studio's Explorer does. Drag an instance into Custom Code: on a blank line it becomes a whole local, anywhere else the path alone, so a path is never typed by hand.",
		keys: "Drag a row, or <kbd>Enter</kbd> on it and then on where it goes",
		tryThis: "Drag Door onto the blank line, or Config into <code>print()</code>.",
	},
	{
		key: "wally",
		tab: "Wally",
		title: "Wally packages, in the tree",
		since: "0.107.0",
		steps: [
			["0.112.0", "Add from Wally"],
			["0.113.0", "Remove a package"],
		],
		doc: "docs/wally-packages.html",
		body: "<code>wally.toml</code> sits in Graph content with each package it lists and the version installed, and Packages shows under Compile content. <strong>Add from Wally…</strong> on its menu installs a package with what it depends on.",
		keys: "<kbd>Right-click</kbd> <code>wally.toml</code>",
		tryThis: "Switch to after Add from Wally… and Flux arrives with its version.",
	},
	{
		key: "import",
		tab: "Import",
		title: "Luau in, graph out",
		status: "In progress",
		since: "0.140.0",
		steps: [["0.143.0", "Verbatim, Tidy and Modern"]],
		doc: "docs/project-panel.html",
		body: "<strong>Import as graph</strong> turns a <code>.luau</code> file's statements into nodes; what has no node yet stays as Luau text. Still in progress: Tidy reads as Verbatim for now, comments and formatting are not kept, and a graph can behave differently from its source, so test it.",
		keys: "<kbd>Right-click</kbd> a <code>.luau</code> file",
		tryThis:
			"Switch between Verbatim, Tidy and Modern. Modern writes the <code>and … or</code> line as an if-expression.",
	},
	{
		key: "windows",
		tab: "Windows",
		title: "The work fills the window",
		since: "0.121.0",
		steps: [
			["0.122.0", "tabs and folding"],
			["0.130.0", "the panels redrawn"],
		],
		doc: "docs/the-interface.html",
		body: "Controls float over the graph in groups. On a computer the panels are cards that dock, fold and take tabs; on a tablet they open from the groups along the top; on a phone they are sheets from a bar along the bottom.",
		keys: "The same editor on any screen",
		tryThis:
			"Switch between Computer, Tablet and Phone. Each is drawn as <a href='docs/the-interface.html'>The interface</a> draws it.",
	},
	{
		key: "menu",
		tab: "Menus",
		title: "One menu, from the keyboard",
		since: "0.144.0",
		doc: "docs/controls.html",
		body: "Every context menu and dropdown is the same menu: it opens over everything, stays on screen, and is divided where its entries are different kinds of thing.",
		keys: "<kbd>↑</kbd> <kbd>↓</kbd> <kbd>Home</kbd> <kbd>End</kbd> <kbd>Enter</kbd> <kbd>Esc</kbd>",
		tryThis:
			"Move through the menu with the arrow keys and choose with <kbd>Enter</kbd>. <kbd>Esc</kbd> closes it.",
	},
];

/**
 * The tour as markup, and the CSS rules that switch it. `tryHref` is where
 * the last slide's way on goes: the editor.
 */
export function tourSection({ tryHref }) {
	const nodes = pickerNodes();
	const demos = {
		preview: () => previewDemo(),
		list: () => listDemo(nodes),
		visual: () => visualDemo(nodes),
		hover: () => hoverDemo(HOVER_SOURCE, "stats", "Coins.server.luau"),
		moonwave: () => hoverDemo(MOONWAVE_SOURCE, "add", "Inventory.luau"),
		complete: () => completeDemo(),
		drag: () => dragDemo(),
		wally: () => wallyDemo(),
		import: () => importDemo(),
		windows: () => windowsDemo(),
		menu: () => menuDemo(),
	};
	const last = SLIDES.length - 1;
	const rules = SLIDES.map(
		(_, i) =>
			`#tour-${i}:checked ~ .tour-stage > [data-slide="${i}"] { display: grid; }\n` +
			`#tour-${i}:checked ~ .landing-sec-head label[for="tour-${i}"] { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); }\n` +
			`#tour-${i}:focus-visible ~ .landing-sec-head label[for="tour-${i}"] { outline: 2px solid var(--accent); outline-offset: 1px; }\n` +
			`#tour-${i}:checked ~ .tour-progress > i { width: ${(((i + 1) / SLIDES.length) * 100).toFixed(3)}%; }`,
	).join("\n");

	const markup = `<section class="landing-sec tour" id="tour" aria-roledescription="carousel" aria-label="A tour of the editor">
    ${SLIDES.map((_, i) => `<input class="landing-pick" type="radio" name="tour" id="tour-${i}"${i === 0 ? " checked" : ""} />`).join("\n    ")}
    <div class="landing-sec-head">
      <h2 class="landing-h2">Take the tour</h2>
      <p>Each part working, to try here.</p>
      <span class="spacer"></span>
      <span class="segmented landing-tabs tour-tabs">${SLIDES.map((slide, i) => `<label for="tour-${i}"><span class="tour-tab-n">${i + 1}</span><span class="tour-tab-name">${escapeHtml(slide.tab)}</span></label>`).join("")}</span>
    </div>
    <div class="tour-progress" aria-hidden="true"><i></i></div>
    <div class="tour-stage" tabindex="-1">
${SLIDES.map(
	(
		slide,
		i,
	) => `      <article class="tour-slide" data-slide="${i}" data-key="${slide.key}" aria-roledescription="slide" aria-label="${i + 1} of ${SLIDES.length}: ${escapeHtml(slide.title)}">
        <div class="tour-copy">
          <p class="tour-kicker"><span>${i + 1} / ${SLIDES.length}</span>${sinceBadge(slide.since, "tour-since")}${slide.status ? `<span class="tour-status">${escapeHtml(slide.status)}</span>` : ""}</p>
          <h3 class="tour-title">${escapeHtml(slide.title)}</h3>
          <p class="tour-body">${slide.body}</p>
          ${slide.steps?.length ? `<p class="tour-steps">Then ${slide.steps.map(([version, what]) => `${sinceBadge(version, "tour-since small")} ${escapeHtml(what)}`).join(", ")}.</p>` : ""}
          <p class="tour-keys">${slide.keys}</p>
          <p class="tour-try"><strong>Try it:</strong> ${slide.tryThis}</p>
          <div class="tour-nav">
            ${i > 0 ? `<label class="tour-step" for="tour-${i - 1}">← ${escapeHtml(SLIDES[i - 1].tab)}</label>` : ""}
            ${i < last ? `<label class="tour-step next" for="tour-${i + 1}">${escapeHtml(SLIDES[i + 1].tab)} →</label>` : `<a class="tour-step next" href="${tryHref}">Try the editor →</a>`}
            <a class="tour-doc" href="${slide.doc}">On its docs page</a>
          </div>
        </div>
        <div class="tour-demo">
        ${demos[slide.key]()}
        </div>
      </article>`,
).join("\n")}
    </div>
  </section>`;
	return { markup, rules };
}

export const TOUR_STYLE = `
/* The tour: one slide at a time, the words on the left and the thing itself
   on the right, the same height whichever is showing so the page under it
   does not jump. Switched by radio buttons, like the examples. */
/* Without the script, a jump to the tour still clears the floating bar. */
.tour { scroll-margin-top: 72px; }
.tour .landing-pick, .tour .tour-pick { position: absolute; opacity: 0; pointer-events: none; }
.tour-tabs label { display: inline-flex; align-items: center; gap: 6px; }
.tour-tab-n { font: 600 11px/1 ui-monospace, "Cascadia Mono", Consolas, monospace; opacity: 0.7; }
@media (max-width: 900px) { .tour-tab-name { display: none; } .tour-tab-n { font-size: 13px; opacity: 1; } }
/* Eleven numbers are wider than a phone: they wrap rather than push the page. */
.tour-tabs { display: inline-flex; flex-wrap: wrap; max-width: 100%; }
.tour-progress { height: 3px; border-radius: 2px; background: var(--border); margin: 0 0 12px; overflow: hidden; }
.tour-progress > i { display: block; height: 100%; width: 0; background: var(--accent); transition: width 0.25s ease; }
.tour-stage {
  border: 1px solid var(--border); border-radius: 10px; background: var(--landing-card);
  box-shadow: var(--shadow-raised); overflow: hidden;
}
/* Focusable, so a click on the words takes the arrow keys there. */
.tour-stage:focus { outline: none; }
.tour-slide {
  display: none; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.6fr); min-height: 460px;
  animation: tour-in 0.22s ease;
}
@keyframes tour-in { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .tour-slide { animation: none; } .tour-progress > i { transition: none; } }
.tour-copy { display: flex; flex-direction: column; gap: 12px; padding: 26px 26px 20px; border-right: 1px solid var(--border); }
.tour-kicker { display: flex; align-items: center; gap: 10px; margin: 0; font: 600 12px/1.4 ui-monospace, "Cascadia Mono", Consolas, monospace; color: var(--fg-faint); }
/* The version a part arrived in, opening the notes it arrived with. */
.tour-since {
  padding: 1px 7px; border-radius: 4px; border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
  color: var(--accent); text-decoration: none; font-variant-numeric: tabular-nums;
}
.tour-since.small { padding: 0 5px; font: 600 11px/1.5 ui-monospace, "Cascadia Mono", Consolas, monospace; }
.tour-steps { margin: 0; font-size: 13px; line-height: 1.9; color: var(--fg-faint); }
.tour-since:hover { background: color-mix(in srgb, var(--accent) 14%, transparent); }
.tour-since:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.tour-title { margin: 0; font-size: 26px; line-height: 1.2; letter-spacing: -0.01em; color: var(--fg); }
.tour-body { margin: 0; color: var(--fg-muted, var(--fg-faint)); font-size: 15px; text-wrap: pretty; }
.tour-keys { margin: 0; font-size: 13px; color: var(--fg-faint); }
.tour-try {
  margin: 0; padding: 9px 12px; border-radius: 6px; font-size: 14px;
  background: color-mix(in srgb, var(--accent) 9%, transparent); border-left: 3px solid var(--accent);
}
.tour :is(.tour-body, .tour-keys, .tour-try, .tour-readout) kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1;
  padding: 2px 5px; border-radius: 4px; border: 1px solid var(--border);
  background: var(--bg-input, var(--bg-app)); color: var(--fg); white-space: nowrap;
}
.tour-nav { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: auto; padding-top: 8px; }
.tour-step {
  padding: 6px 13px; border-radius: 6px; border: 1px solid var(--border-strong, var(--border));
  background: var(--bg-panel); color: var(--fg); font-size: 14px; cursor: pointer; text-decoration: none; user-select: none;
}
.tour-step:hover { border-color: var(--accent); }
.tour-step.next { background: var(--accent); border-color: var(--accent); color: #fff; }
.tour-doc { margin-left: auto; font-size: 13px; color: var(--accent); }
.tour-demo { position: relative; min-width: 0; display: flex; }
.tour-pane { flex: 1; min-width: 0; position: relative; display: flex; flex-direction: column; }
/* The canvas the demonstrations sit on. Its grid is the editor's own, from
   "The grid" in theme.css, by the grid-surface class each one carries. */
.tour-canvas {
  align-items: center; justify-content: center; padding: 24px;
  background-color: var(--bg-canvas);
}
@media (max-width: 1000px) {
  .tour-slide { grid-template-columns: minmax(0, 1fr); min-height: 0; }
  .tour-copy { border-right: 0; border-bottom: 1px solid var(--border); padding: 20px; }
  .tour-demo { min-height: 400px; }
}
@media (max-width: 640px) { .tour-title { font-size: 22px; } .tour-canvas { padding: 14px; } }

/* The preview: the graph to select in, and under it the editor's Selection
   preview, set into the slide rather than floating over a backdrop. */
.tour-preview-demo { flex-direction: column; min-height: 0; }
.tour-preview-graph { flex: none; padding: 16px 20px; cursor: default; }
.tour-preview-frame { position: relative; width: 100%; max-width: 640px; margin: 0 auto; }
.tour-preview-frame svg { display: block; width: 100%; height: auto; }
.tour-node {
  position: absolute; padding: 0; border: 0; border-radius: 6px; background: transparent;
  cursor: pointer; transition: box-shadow 0.12s;
}
.tour-node:hover { box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--accent) 55%, transparent); }
.tour-node.on { box-shadow: 0 0 0 2px var(--accent), 0 0 0 5px color-mix(in srgb, var(--accent) 22%, transparent); }
.tour-node:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.tour .tour-preview-panel {
  width: auto; height: auto; flex: 1; min-height: 0; max-height: 300px;
  border: 0; border-top: 1px solid var(--border); border-radius: 0; box-shadow: none;
}
.tour-preview-panel .docs-head { gap: 8px; }
.tour-preview-panel .docs-head .sub { font-size: 12px; color: var(--fg-faint); }
.tour-preview-panel .preview-toggle[hidden] { display: none; }
.tour-preview-panel .preview-code { font-size: 12.5px; line-height: 1.55; white-space: pre; overflow-x: auto; }
/* A lit line is lit the width of the code, however far it scrolls. */
.tour-preview-panel .preview-code .ln { min-width: max-content; }
@media (prefers-reduced-motion: reduce) { .tour-node { transition: none; } }
/* On a phone the graph keeps a size a finger can pick a node at, and scrolls
   sideways in its own frame rather than shrinking to a strip. */
@media (max-width: 640px) {
  .tour-preview-graph { overflow-x: auto; padding: 12px; }
  .tour-preview-frame { min-width: 560px; }
}

/* 1. The node menu, set down where it was opened rather than fixed to the window. */
.tour .tour-menu-list { position: relative; max-height: 380px; width: min(300px, 100%); }
.tour .tour-menu-list .items { flex: 1; }
.tour-cursor {
  position: absolute; left: calc(50% - 168px); top: 38px; width: 10px; height: 10px; border-radius: 50%;
  border: 2px solid var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent);
}
@media (max-width: 640px) { .tour-cursor { display: none; } }

/* 2. The node picker, in the page rather than over it. */
.tour .node-picker { max-height: none; height: 100%; max-height: 420px; box-shadow: var(--shadow-raised); }
.tour .node-picker-field svg { flex: none; opacity: 0.6; }
.tour .node-picker-body { min-height: 0; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); }
.tour .node-picker-list { max-height: 300px; }
.tour .node-picker-preview .shot svg { max-width: 100%; height: auto; max-height: 170px; }
.tour .tour-shot { display: flex; flex-direction: column; gap: 12px; }
.tour .tour-shot[hidden] { display: none; }
@media (max-width: 640px) { .tour .node-picker-body { grid-template-columns: minmax(0, 1fr); } .tour .node-picker-preview { display: none; } }

/* 3 and 4. A Luau file with its hover. The hover is drawn open under its name;
   with the script it follows whichever name is pointed at. */
.tour-code-demo { background: var(--bg-input); }
.tour-code-demo .card-head { cursor: default; font-size: var(--text-md, 13px); }
.tour-code-demo .card-head h3 { margin: 0; font-size: inherit; font-weight: inherit; }
.tour-code-wrap { position: relative; flex: 1; min-height: 0; }
.tour-code { max-height: 420px; overflow: auto; height: 100%; box-sizing: border-box; }
.tour-sym { border-radius: 3px; cursor: help; outline: none; }
.tour-sym:hover, .tour-sym:focus-visible, .tour-sym.on {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  box-shadow: 0 1px 0 var(--accent);
}
.tour-hover {
  position: absolute; z-index: 2; right: 14px; bottom: 14px; width: min(440px, calc(100% - 28px));
  background: var(--bg-panel); border: 1px solid var(--border-strong, var(--border));
  box-shadow: var(--shadow-popover); white-space: normal;
}
.tour-hover[hidden] { display: none; }
.tour-hover.resting { pointer-events: none; }
.tour-hover a { display: block; margin: 7px 10px 8px; font-size: 13px; color: var(--accent); }
.tour-hover .luau-hover-doc { max-height: 170px; }

/* 5. The editor on each kind of screen, as the documentation draws it. The
   drawings scale themselves to the column (the docs' --z); a phone, being
   tall, is held smaller so it fits the slide's height. One at a time. */
.tour-windows-demo { padding: 16px; gap: 10px; align-items: center; background: color-mix(in srgb, var(--bg-canvas) 60%, var(--landing-card)); }
.tour-device-switch label { padding: 3px 12px; border-radius: var(--radius-xs, 4px); font-size: 13px; cursor: pointer; color: var(--fg-muted, var(--fg-faint)); }
#tour-device-computer:checked ~ .tour-device-switch label[for="tour-device-computer"],
#tour-device-tablet:checked ~ .tour-device-switch label[for="tour-device-tablet"],
#tour-device-phone:checked ~ .tour-device-switch label[for="tour-device-phone"] { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); }
#tour-device-computer:focus-visible ~ .tour-device-switch label[for="tour-device-computer"],
#tour-device-tablet:focus-visible ~ .tour-device-switch label[for="tour-device-tablet"],
#tour-device-phone:focus-visible ~ .tour-device-switch label[for="tour-device-phone"] { outline: 2px solid var(--accent); outline-offset: 1px; }
.tour-device { display: none; width: 100%; min-width: 0; }
#tour-device-computer:checked ~ .tour-device-computer,
#tour-device-tablet:checked ~ .tour-device-tablet,
#tour-device-phone:checked ~ .tour-device-phone { display: block; }
.tour-device .docs-layout-fit { overflow: hidden; margin: 0 auto; }
/* Held to about one height, so switching does not move the page under it. */
.tour-device-computer .docs-layout-fit { max-width: 680px; }
.tour-device-tablet .docs-layout-fit { max-width: 600px; }
.tour-device .docs-layout-frame { margin: 0 auto !important; }
.tour .docs-layout-screen.dev-phone { --z: 0.41; }

/* A part still being finished says so, beside the version it arrived in. */
.tour-status {
  padding: 1px 7px; border-radius: 4px; font: 600 11px/1.4 ui-monospace, "Cascadia Mono", Consolas, monospace;
  color: var(--warning); border: 1px solid color-mix(in srgb, var(--warning) 55%, var(--border));
  background: color-mix(in srgb, var(--warning) 10%, transparent);
}

/* Completion: the line being typed, and the editor's popup under it. */
.tour-complete-demo { flex-direction: column; gap: 14px; justify-content: flex-start; padding-top: 28px; }
.tour-complete-tabs code { font-size: 12px; }
.tour-complete-box { width: min(520px, 100%); overflow: visible; }
.tour-complete-line { margin: 0; border-radius: 8px 8px 0 0; border: 1px solid var(--border); white-space: pre; overflow-x: auto; }
.tour-complete-input {
  font: inherit; color: var(--fg); background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 0; border-bottom: 2px solid var(--accent); padding: 0 2px; outline: none; min-width: 4ch;
}
.tour .cm-tooltip-autocomplete { position: relative; border-top: 0; border-radius: 0 0 8px 8px; }
.tour .cm-tooltip-autocomplete[hidden] { display: none; }
.tour .cm-tooltip-autocomplete ul { list-style: none; margin: 0; padding: 4px 0; max-height: 230px; overflow: auto; }
.tour .cm-tooltip-autocomplete li { cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tour-complete-readout { text-align: left; width: min(520px, 100%); margin: 0; }

/* The DataModel, dragged into code: the browser beside a piece of Custom Code. */
.tour-drag-demo { display: grid; grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr); align-items: start; align-content: center; gap: 14px; }
.tour-drag-tree .docs-tree-shot { max-width: 100%; }
.tour-drag-tree .place-row[data-whole] { cursor: grab; touch-action: none; user-select: none; }
.tour-drag-tree .place-row[data-whole]:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.tour-drag-tree .place-row.picked { background: color-mix(in srgb, var(--accent) 22%, transparent); }
.tour-drag-code { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
/* A dropped path is long: the line wraps rather than running off the card. */
.tour-drag-code pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
.tour-drop {
  display: inline; min-width: 8ch; padding: 0 4px; border-radius: 4px;
  border: 1px dashed color-mix(in srgb, var(--accent) 60%, var(--border)); outline: none;
}
.tour-drop.over, .tour-drop:focus-visible { border-style: solid; border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, transparent); }
.tour-drop.filled { animation: tour-dropped 0.5s ease; }
@keyframes tour-dropped { from { background: color-mix(in srgb, var(--accent) 35%, transparent); } }
@media (prefers-reduced-motion: reduce) { .tour-drop.filled { animation: none; } }
.tour-drag-readout { grid-column: 1 / -1; }
.tour-drag-ghost {
  position: fixed; z-index: 100; pointer-events: none; padding: 3px 9px; border-radius: 6px;
  background: var(--accent); color: #fff; font: 600 12px/1.5 ui-monospace, "Cascadia Mono", Consolas, monospace;
  box-shadow: var(--shadow-popover); transform: translate(10px, 10px);
}
@media (max-width: 640px) { .tour-drag-demo { grid-template-columns: minmax(0, 1fr); } }

/* Wally: the project tree before and after a package is added. */
.tour-wally-demo { flex-direction: column; gap: 12px; }
.tour-wally { display: none; width: min(340px, 100%); }
#tour-wally-before:checked ~ .tour-wally-before,
#tour-wally-after:checked ~ .tour-wally-after { display: block; }
#tour-wally-before:checked ~ .tour-device-switch label[for="tour-wally-before"],
#tour-wally-after:checked ~ .tour-device-switch label[for="tour-wally-after"] { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); }
#tour-wally-before:focus-visible ~ .tour-device-switch label[for="tour-wally-before"],
#tour-wally-after:focus-visible ~ .tour-device-switch label[for="tour-wally-after"] { outline: 2px solid var(--accent); outline-offset: 1px; }

/* Import: the graph a file became, and the file beside what the graph writes. */
.tour-import-demo { padding: 12px 14px; gap: 8px; align-items: center; background: color-mix(in srgb, var(--bg-canvas) 60%, var(--landing-card)); }
.tour-import { display: none; width: 100%; }
#tour-import-verbatim:checked ~ .tour-import-verbatim,
#tour-import-tidy:checked ~ .tour-import-tidy,
#tour-import-modern:checked ~ .tour-import-modern { display: block; }
#tour-import-verbatim:checked ~ .tour-device-switch label[for="tour-import-verbatim"],
#tour-import-tidy:checked ~ .tour-device-switch label[for="tour-import-tidy"],
#tour-import-modern:checked ~ .tour-device-switch label[for="tour-import-modern"] { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); }
/* Drawn whole and fitted to its frame: laying an import out well is part of
   what is still in progress, and the shape of it is what this shows. */
.tour-import-graph { margin: 0 0 8px; border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
.tour-import-graph svg { display: block; width: 100%; height: 108px; }
.tour-import-code { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
.tour-import-code > div { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--bg-input); min-width: 0; }
.tour-import-code pre { margin: 0; padding: 6px 10px; font-size: 11px; line-height: 1.4; white-space: pre; overflow: auto; max-height: 168px; }
.tour-import-code .tour-card-head { padding: 4px 10px; font-size: 11px; }
.tour-import .tour-readout { margin: 6px 0 0; font-size: 12px; }
@media (max-width: 640px) { .tour-import-code { grid-template-columns: minmax(0, 1fr); } }

/* 6. The one menu, open on the package it was asked about. */
.tour-menu-demo { flex-direction: row; flex-wrap: wrap; align-items: flex-start; align-content: center; gap: 14px 6px; }
.tour-tree-card {
  width: 210px; background: var(--bg-panel); border: 1px solid var(--border);
  border-radius: var(--radius-md, 8px); box-shadow: var(--shadow-raised); overflow: hidden; font-size: 13px;
}
.tour-menu-anchor { cursor: context-menu; outline: none; }
.tour-menu-anchor:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
.tour .tour-menu { position: relative; margin-top: 52px; box-shadow: var(--shadow-popover); }
.tour .tour-menu[hidden] { display: none; }
.tour-readout { flex-basis: 100%; margin: 6px 0 0; text-align: center; font-size: 13px; color: var(--fg-muted, var(--fg-faint)); min-height: 1.6em; }
`;

/**
 * The tour's script: what makes the demonstrations answer. `build-pages`
 * writes it into `landing.js` after the page's own. Each part looks for its
 * markup and does nothing when it is not there.
 */
export const TOUR_SCRIPT = `(() => {
  const tour = document.querySelector(".tour");
  if (!tour) return;
  const radios = [...tour.querySelectorAll('input[name="tour"]')];

  // A link to the tour brings the whole of it into view rather than snapping
  // its top edge under the floating bar: centred below the bar when it fits,
  // its top just under the bar when it is taller than the window.
  const stage = tour.querySelector(".tour-stage");
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fit = (smooth) => {
    const bar = document.querySelector(".landing-chrome-row");
    const clear = (bar ? bar.getBoundingClientRect().bottom : 0) + 8;
    const box = tour.getBoundingClientRect();
    const room = window.innerHeight - clear - 8;
    const slack = box.height < room ? (room - box.height) / 2 : 0;
    window.scrollTo({ top: Math.max(0, window.scrollY + box.top - clear - slack), behavior: smooth && !still.matches ? "smooth" : "auto" });
  };
  for (const link of document.querySelectorAll('a[href="#tour"]')) {
    link.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      // A card's link opens the slide that shows its part.
      const slide = link.dataset.tourSlide && tour.querySelector('.tour-slide[data-key="' + link.dataset.tourSlide + '"]');
      const radio = slide && document.getElementById("tour-" + slide.dataset.slide);
      if (radio) radio.checked = true;
      history.replaceState(null, "", "#tour");
      fit(true);
      // Where the arrow keys turn the page, without a second scroll.
      stage.focus({ preventScroll: true });
    });
  }
  if (location.hash === "#tour") requestAnimationFrame(() => fit(false));
  const go = (step) => {
    const at = radios.findIndex((r) => r.checked);
    const next = radios[Math.min(radios.length - 1, Math.max(0, at + step))];
    if (next && next !== radios[at]) { next.checked = true; next.dispatchEvent(new Event("change", { bubbles: true })); }
  };
  // Left and right turn the page, unless the keys are somebody's: a field, a
  // menu, the radio buttons that already move with them.
  tour.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest("input, textarea, [role=menu], .tour-menu-anchor, .node-picker")) return;
    if (event.key === "ArrowRight") { go(1); event.preventDefault(); }
    else if (event.key === "ArrowLeft") { go(-1); event.preventDefault(); }
  });
  // A swipe across the words turns the page too; the demonstrations keep theirs.
  let swipe = null;
  tour.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" || !event.target.closest(".tour-copy")) return;
    swipe = { x: event.clientX, y: event.clientY };
  });
  tour.addEventListener("pointerup", (event) => {
    if (!swipe) return;
    const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  });

  // A list walked with the arrow keys from a search field: the node menu and
  // the node picker both work this way.
  const walk = (field, rows, mark) => {
    const shown = () => rows().filter((row) => !row.hidden);
    field.addEventListener("keydown", (event) => {
      const list = shown();
      if (!list.length) return;
      const at = list.findIndex((row) => row.classList.contains(mark));
      let next = at;
      if (event.key === "ArrowDown") next = Math.min(list.length - 1, at + 1);
      else if (event.key === "ArrowUp") next = Math.max(0, at - 1);
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = list.length - 1;
      else return;
      event.preventDefault();
      pick(list[next]);
    });
    // Brings a row into its list's view by scrolling the list alone. The
    // page's scroll is the reader's: scrollIntoView would move it too, and
    // walking a picker half off screen pulled the page along with it.
    const reveal = (row) => {
      const list = row.closest(".items, .node-picker-list");
      if (!list) return;
      const top = row.offsetTop - list.offsetTop;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (top + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + row.offsetHeight - list.clientHeight;
    };
    const pick = (row) => {
      for (const other of rows()) other.classList.toggle(mark, other === row);
      reveal(row);
      field.dispatchEvent(new CustomEvent("tour-pick", { detail: row }));
    };
    const filter = () => {
      const words = field.value.trim().toLowerCase().split(/\\s+/).filter(Boolean);
      let first = null;
      for (const row of rows()) {
        const find = row.dataset.find || "";
        row.hidden = !words.every((w) => find.includes(w));
        if (!row.hidden && !first) first = row;
      }
      return first;
    };
    field.addEventListener("input", () => { const first = filter(); if (first) pick(first); });
    return { pick, filter };
  };

  // The preview: a node's lines are worked out at build time by the editor's
  // own analyse(), and a selection is the union of its nodes' -- which is what
  // analyse gives a selection. Folded as SelectionPreview folds, two lines of
  // context either side, unless Whole file is ticked or nothing is selected.
  const preview = tour.querySelector('[data-tour="preview"]');
  if (preview) {
    const nodes = [...preview.querySelectorAll(".tour-node")];
    const pre = preview.querySelector(".preview-code");
    const rows = [...document.importNode(preview.querySelector(".tour-preview-rows").content, true).querySelectorAll(".ln")];
    const title = preview.querySelector(".tour-preview-title");
    const sub = preview.querySelector(".tour-preview-sub");
    const notes = preview.querySelector(".tour-preview-notes");
    const whole = preview.querySelector(".tour-preview-whole");
    const toggle = whole.closest("label");
    const selected = new Set(nodes.filter((n) => n.classList.contains("on")).map((n) => n.dataset.node));
    const lines = (text) => (text ? text.split(",").map(Number) : []);
    const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");
    const render = () => {
      const chosen = nodes.filter((n) => selected.has(n.dataset.node));
      const mine = new Set(chosen.flatMap((n) => lines(n.dataset.mine)));
      const down = new Set(chosen.flatMap((n) => lines(n.dataset.down)).filter((l) => !mine.has(l)));
      for (const n of nodes) {
        const on = selected.has(n.dataset.node);
        n.classList.toggle("on", on);
        n.setAttribute("aria-pressed", String(on));
      }
      for (const row of rows) {
        const line = Number(row.dataset.line);
        row.classList.toggle("mine", mine.has(line));
        row.classList.toggle("downstream", down.has(line));
      }
      const all = selected.size === 0;
      const keep = new Set();
      rows.forEach((row, i) => {
        if (!mine.has(i + 1) && !down.has(i + 1)) return;
        for (let j = Math.max(0, i - 2); j <= Math.min(rows.length - 1, i + 2); j++) keep.add(j);
      });
      const shown = [];
      let folding = false;
      rows.forEach((row, i) => {
        if (all || whole.checked || keep.has(i)) { shown.push(row); folding = false; }
        else if (!folding) {
          const fold = document.createElement("span");
          fold.className = "fold";
          fold.textContent = "\u22ef";
          shown.push(fold);
          folding = true;
        }
      });
      pre.replaceChildren(...shown);
      title.textContent = all ? "Script preview" : "Selection preview";
      sub.textContent = all ? plural(rows.length, "line") : plural(selected.size, "node") + (mine.size ? " \u00b7 " + plural(mine.size, "line") : "");
      toggle.hidden = all;
      // The editor's notes, in its words and its order: an entry, nothing
      // produced, then pure nodes and where their values went.
      const pure = chosen.filter((n) => n.dataset.pure).map((n) => n.dataset.pure);
      const entries = chosen.filter((n) => n.dataset.entry).map((n) => n.dataset.entry);
      const said = [];
      const say = (...parts) => {
        const p = document.createElement("p");
        p.className = "preview-note";
        p.append(...parts);
        said.push(p);
      };
      const strong = (text) => Object.assign(document.createElement("strong"), { textContent: text });
      if (!all && entries.length) {
        const one = entries.length === 1;
        say(strong(entries.join(", ")), " " + (one ? "writes" : "write") + " no line of " + (one ? "its" : "their") + " own: " +
          (one ? "it is" : "each is") + " where code starts running, and what is wired to " + (one ? "it" : "them") + " is what runs.");
      }
      if (!all && mine.size === 0 && down.size === 0 && entries.length < selected.size) {
        say("These nodes produced no lines of their own, and nothing they feed into did either. That usually means they are not reachable from Script Start or a function \u2014 a node nothing runs is not compiled.");
      }
      if (!all && pure.length) {
        const one = pure.length === 1;
        say(
          (one ? "This node is pure" : "Some of these nodes are pure") + ", so " + (one ? "its value is" : "their values are") +
            " written straight into the line that uses " + (one ? "it" : "them") + " rather than onto a line of " + (one ? "its" : "their") + " own: ",
          strong(pure.join(", ")),
          ". The lines below are where" + (one ? " it ends" : " they end") + " up.",
        );
      }
      notes.replaceChildren(...said);
    };
    for (const n of nodes) {
      n.addEventListener("click", (event) => {
        event.stopPropagation();
        const id = n.dataset.node;
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          if (selected.has(id)) selected.delete(id); else selected.add(id);
        } else {
          selected.clear();
          selected.add(id);
        }
        render();
      });
    }
    preview.querySelector(".tour-preview-graph").addEventListener("click", () => { selected.clear(); render(); });
    whole.addEventListener("change", render);
    render();
  }

  // Completion: the editor's options for each place it is asked, narrowed as
  // the reader types, walked with the arrows, and taken with Enter or Tab.
  const complete = tour.querySelector('[data-tour="complete"]');
  if (complete) {
    let lists = [];
    try { lists = JSON.parse(complete.querySelector(".tour-complete-lists").content.textContent || "[]"); } catch {}
    const tabs = [...complete.querySelectorAll(".tour-complete-tabs button")];
    const lines = [...complete.querySelectorAll(".tour-complete-line")];
    const popup = complete.querySelector(".cm-tooltip-autocomplete");
    const listbox = popup.querySelector("ul");
    const readout = complete.querySelector(".tour-complete-readout");
    let line = lines[0];
    let lit = 0;
    let shown = [];
    const offered = () => "The editor offers " + line.dataset.count + " here, narrowed as you type.";
    const draw = () => {
      const input = line.querySelector("input");
      const typed = input.value.toLowerCase();
      shown = (lists[Number(line.dataset.list)] || []).filter((o) => o.label.toLowerCase().startsWith(typed)).slice(0, 8);
      lit = Math.max(0, Math.min(lit, shown.length - 1));
      listbox.replaceChildren(...shown.map((option, i) => {
        const item = document.createElement("li");
        item.setAttribute("role", "option");
        if (i === lit) item.setAttribute("aria-selected", "true");
        const label = document.createElement("span");
        label.className = "cm-completionLabel";
        label.textContent = option.label;
        item.append(label);
        if (option.detail) {
          const detail = document.createElement("span");
          detail.className = "cm-completionDetail";
          detail.textContent = option.detail;
          item.append(detail);
        }
        item.addEventListener("pointerdown", (event) => { event.preventDefault(); take(i); });
        return item;
      }));
      popup.hidden = shown.length === 0;
      input.size = Math.max(4, input.value.length + 2);
    };
    const take = (i) => {
      const option = shown[i];
      if (!option) return;
      const input = line.querySelector("input");
      input.value = option.label;
      input.size = Math.max(4, input.value.length + 2);
      popup.hidden = true;
      readout.textContent = "Took " + option.label + ". " + offered();
    };
    tabs.forEach((tab, i) => tab.addEventListener("click", () => {
      for (const other of tabs) { other.classList.toggle("on", other === tab); other.setAttribute("aria-pressed", String(other === tab)); }
      lines.forEach((one, j) => { one.hidden = j !== i; });
      line = lines[i];
      lit = 0;
      draw();
      readout.textContent = offered();
    }));
    for (const one of lines) {
      const input = one.querySelector("input");
      input.addEventListener("input", () => { lit = 0; draw(); readout.textContent = offered(); });
      input.addEventListener("focus", draw);
      input.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") lit = Math.min(shown.length - 1, lit + 1);
        else if (event.key === "ArrowUp") lit = Math.max(0, lit - 1);
        else if ((event.key === "Enter" || event.key === "Tab") && !popup.hidden && shown.length) { event.preventDefault(); take(lit); return; }
        else if (event.key === "Escape") { popup.hidden = true; return; }
        else return;
        event.preventDefault();
        draw();
      });
    }
  }

  // The DataModel into code: a row dragged onto a place in the code, or
  // picked with Enter and put with Enter. What lands is what the editor
  // writes there, worked out when the page was built.
  const drag = tour.querySelector('[data-tour="drag"]');
  if (drag) {
    const rows = [...drag.querySelectorAll(".place-row[data-whole]")];
    const zones = [...drag.querySelectorAll(".tour-drop")];
    const readout = drag.querySelector(".tour-drag-readout");
    let picked = null;
    const nameOf = (row) => (row.querySelector(".label") || row).textContent.trim();
    const pick = (row) => {
      picked = row;
      for (const other of rows) other.classList.toggle("picked", other === row);
      readout.textContent = "Picked " + nameOf(row) + ". Now Enter on the blank line, or inside print().";
    };
    const put = (row, zone) => {
      const whole = zone.dataset.drop === "whole";
      zone.textContent = whole ? row.dataset.whole : row.dataset.inline;
      zone.classList.remove("filled");
      void zone.offsetWidth;
      zone.classList.add("filled");
      readout.textContent = nameOf(row) + (whole ? " on a blank line: a whole local." : " inside a line: the path alone.");
      picked = null;
      for (const other of rows) other.classList.remove("picked");
    };
    const zoneAt = (x, y) => document.elementFromPoint(x, y)?.closest(".tour-drop") || null;
    for (const row of rows) {
      let start = null;
      let ghost = null;
      row.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        start = { x: event.clientX, y: event.clientY };
        row.setPointerCapture(event.pointerId);
      });
      row.addEventListener("pointermove", (event) => {
        if (!start) return;
        if (!ghost && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) {
          ghost = document.createElement("div");
          ghost.className = "tour-drag-ghost";
          ghost.textContent = nameOf(row);
          document.body.append(ghost);
        }
        if (!ghost) return;
        ghost.style.left = event.clientX + "px";
        ghost.style.top = event.clientY + "px";
        const over = zoneAt(event.clientX, event.clientY);
        for (const zone of zones) zone.classList.toggle("over", zone === over);
      });
      const end = (event) => {
        if (!start) return;
        if (ghost) {
          const zone = event.type === "pointerup" ? zoneAt(event.clientX, event.clientY) : null;
          if (zone) put(row, zone);
          ghost.remove();
          ghost = null;
        } else if (event.type === "pointerup") pick(row);
        for (const zone of zones) zone.classList.remove("over");
        start = null;
      };
      row.addEventListener("pointerup", end);
      row.addEventListener("pointercancel", end);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(row); }
      });
    }
    for (const zone of zones) {
      zone.addEventListener("click", () => { if (picked) put(picked, zone); });
      zone.addEventListener("keydown", (event) => {
        if ((event.key === "Enter" || event.key === " ") && picked) { event.preventDefault(); put(picked, zone); }
      });
    }
  }

  const list = tour.querySelector('[data-tour="list"]');
  if (list) {
    const field = list.querySelector("input");
    const rows = () => [...list.querySelectorAll(".item")];
    const { pick, filter } = walk(field, rows, "active");
    const empty = list.querySelector(".empty");
    field.addEventListener("input", () => {
      filter();
      // A group heading goes with the last of its rows.
      for (const head of list.querySelectorAll(".group")) {
        let row = head.nextElementSibling, any = false;
        while (row && row.classList.contains("item")) { if (!row.hidden) any = true; row = row.nextElementSibling; }
        head.hidden = !any;
      }
      empty.hidden = rows().some((row) => !row.hidden);
    });
    for (const row of rows()) row.addEventListener("pointerenter", () => pick(row));
  }

  const visual = tour.querySelector('[data-tour="visual"]');
  if (visual) {
    const field = visual.querySelector("input");
    const rows = () => [...visual.querySelectorAll(".node-picker-hit")];
    const shots = [...visual.querySelectorAll(".tour-shot")];
    const count = visual.querySelector(".count");
    const empty = visual.querySelector(".node-picker-list .empty");
    const { pick } = walk(field, rows, "on");
    field.addEventListener("tour-pick", (event) => {
      for (const shot of shots) shot.hidden = shot.dataset.shot !== event.detail.dataset.shot;
    });
    field.addEventListener("input", () => {
      const left = rows().filter((row) => !row.hidden).length;
      count.textContent = String(left);
      empty.hidden = left > 0;
      for (const group of visual.querySelectorAll(".node-picker-group")) {
        group.hidden = ![...group.querySelectorAll(".node-picker-hit")].some((row) => !row.hidden);
      }
    });
    for (const row of rows()) {
      row.addEventListener("pointerenter", () => pick(row));
      row.addEventListener("focus", () => pick(row));
    }
  }

  // Hovers: the open one moves to whichever name is pointed at or focused,
  // above it where there is room and below it where there is not.
  for (const demo of tour.querySelectorAll('[data-tour="hover"]')) {
    const wrap = demo.querySelector(".tour-code-wrap");
    const card = demo.querySelector(".tour-hover");
    const code = demo.querySelector(".tour-code");
    let leaving = 0;
    let settling = false;
    // The name the hover is on: the one drawn open, until the reader picks one.
    let current = demo.querySelector(".tour-sym.on");
    let touched = false;
    const show = (sym, reveal) => {
      current = sym;
      if (!reveal) touched = true;
      clearTimeout(leaving);
      const template = demo.querySelector('template[data-hover="' + sym.dataset.hover + '"]');
      if (!template) return;
      card.replaceChildren(template.content.cloneNode(true));
      for (const other of demo.querySelectorAll(".tour-sym.on")) other.classList.remove("on");
      sym.classList.add("on");
      card.hidden = false;
      // The hover drawn open before anybody asked lets the pointer through to
      // the names under it; one they asked for can be reached for its link.
      card.classList.toggle("resting", Boolean(reveal));
      // The name drawn open may be further down than the frame shows.
      if (reveal) {
        settling = true;
        code.scrollTop = Math.max(0, sym.offsetTop - code.clientHeight / 3);
        requestAnimationFrame(() => { settling = false; });
      }
      const box = wrap.getBoundingClientRect();
      const at = sym.getBoundingClientRect();
      card.style.right = "auto";
      card.style.bottom = "auto";
      const width = card.offsetWidth;
      const left = Math.max(8, Math.min(at.left - box.left, box.width - width - 8));
      card.style.left = left + "px";
      // Above the name, as the editor puts it; below where there is no room;
      // and never past the frame, which would cut it off.
      const tall = card.offsetHeight;
      const above = at.top - box.top - tall - 6;
      const below = at.bottom - box.top + 6;
      const roomAbove = at.top - box.top, roomBelow = box.bottom - at.bottom;
      const top = above >= 4 ? above : below + tall <= box.height - 4 || roomBelow >= roomAbove ? below : 4;
      card.style.top = top + "px";
    };
    const hide = () => { leaving = setTimeout(() => { card.hidden = true; for (const s of demo.querySelectorAll(".tour-sym.on")) s.classList.remove("on"); }, 260); };
    for (const sym of demo.querySelectorAll(".tour-sym")) {
      sym.addEventListener("pointerenter", () => show(sym));
      sym.addEventListener("focus", () => show(sym));
      sym.addEventListener("pointerleave", hide);
      sym.addEventListener("blur", hide);
    }
    card.addEventListener("pointerenter", () => clearTimeout(leaving));
    card.addEventListener("pointerleave", hide);
    code.addEventListener("scroll", () => { if (!settling) card.hidden = true; });
    demo.addEventListener("keydown", (event) => { if (event.key === "Escape") card.hidden = true; });
    // Drawn open in the markup; placed beside its name once there is a layout.
    // Placed once there is a layout, and again when the layout changes: on the
    // name the reader chose, or the one drawn open if they have chosen none.
    const place = () => {
      if (!current || !demo.offsetParent || (touched && card.hidden)) return;
      show(current, !touched);
    };
    new ResizeObserver(place).observe(demo);
  }

  // The one menu: arrows move, Home and End jump, Enter chooses, Escape and
  // Tab close it and put focus back on what opened it.
  const menuDemo = tour.querySelector('[data-tour="menu"]');
  if (menuDemo) {
    const anchor = menuDemo.querySelector(".tour-menu-anchor");
    const menu = menuDemo.querySelector(".tour-menu");
    const readout = menuDemo.querySelector(".tour-readout");
    const items = [...menu.querySelectorAll(".menu-item")];
    // Built rather than parsed: words, and the few marks they carry.
    const say = (...parts) => {
      readout.replaceChildren(...parts.map((part) => typeof part === "string" ? part : Object.assign(document.createElement(part[0]), { textContent: part[1] })));
    };
    const open = () => {
      menu.hidden = false;
      anchor.setAttribute("aria-expanded", "true");
      items[0].focus();
      say(["kbd", "↑"], " ", ["kbd", "↓"], " to move, ", ["kbd", "Enter"], " to choose, ", ["kbd", "Esc"], " to close.");
    };
    const close = (chosen) => {
      menu.hidden = true;
      anchor.setAttribute("aria-expanded", "false");
      anchor.focus();
      const again = [" Right-click ", ["code", "wally.toml"], ", or press ", ["kbd", "Enter"], ", to open it again."];
      if (chosen) say("Chose ", ["strong", chosen], chosen.endsWith("…") ? "" : ".", ...again);
      else say("Closed.", ...again);
    };
    anchor.addEventListener("contextmenu", (event) => { event.preventDefault(); open(); });
    anchor.addEventListener("click", open);
    anchor.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " " || event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); open(); }
    });
    for (const item of items) {
      item.addEventListener("pointermove", () => { if (document.activeElement !== item) item.focus(); });
      item.addEventListener("click", () => close(item.textContent.trim()));
    }
    menu.addEventListener("keydown", (event) => {
      const at = items.indexOf(document.activeElement);
      let next = -1;
      if (event.key === "ArrowDown") next = (at + 1) % items.length;
      else if (event.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = items.length - 1;
      else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (at >= 0) close(items[at].textContent.trim()); return; }
      else if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); close(); return; }
      else return;
      event.preventDefault();
      items[next].focus();
    });
  }
})();
`;
