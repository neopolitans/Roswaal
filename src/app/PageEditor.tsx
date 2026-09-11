/**
 * Editing a documentation page in place, and handing back the TypeScript.
 *
 * The first version of Suggest an edit was one textarea at the foot of the page
 * holding the whole article as flattened prose. It worked, and it was a
 * second-rate text editor stapled to a well-made page: the structure was gone,
 * a heading and a note came out as the same grey text, and the two things a
 * contributor most wants to add — a node picture and a graph picture — could
 * not be expressed at all. Which meant, in practice, that the only person who
 * could add one was somebody editing `site.ts` directly.
 *
 * So this edits the page **as the page**. Every block stays rendered where it
 * is; clicking one turns that block, and only that block, into its editor.
 * Blocks can be added, moved and removed, and two of the kinds you can add are
 * the pictures.
 *
 * ## Why it emits TypeScript
 *
 * The pages are a typed block model in this repository, not files on a reader's
 * machine — so there is nothing for "save" to write to, and a proposal made of
 * prose leaves somebody else to turn it back into blocks. What a maintainer can
 * act on immediately is the block array itself, so that is what Propose hands
 * over: paste-ready source, with the pictures written the way the rest of
 * `site.ts` writes them.
 */

import { useEffect, useMemo, useState } from "react";

import type { Block, DocPage } from "../core/docs/site.js";
import { previewOf, previewSvg, type PreviewOptions } from "../core/docs/preview.js";
import type { NodeScript } from "../core/schema.js";
import type { Registry } from "../core/nodes/index.js";
import { api } from "./api.js";
import { Icon } from "./icons.jsx";
import { VERSION } from "../cli/version.js";

/** Written as a code unit so no escape has to survive a build step. */
const NEWLINE = String.fromCharCode(10);

const REPOSITORY = "https://github.com/neopolitans/Roswaal";

/** How much of a proposal a URL carries. GitHub stops reading before this. */
const PROPOSAL_LIMIT = 6000;

/**
 * One block, plus what the *source* form of it needs that the rendered form
 * does not.
 *
 * A preview block holds fat `NodePreview` objects; `site.ts` writes it as
 * `...previews(registry, ["math.add"])`, so the ids are what a draft carries. A
 * graph block holds a whole script, and where it came from is worth saying in
 * the source even though the block does not need it.
 */
interface Draft {
	block: Block;
	ids?: string[];
	path?: string;
}

/** The kinds this editor can make. The rest round-trip untouched. */
const ADDABLE = [
	{ kind: "p", label: "Paragraph" },
	{ kind: "h", label: "Heading" },
	{ kind: "ul", label: "List" },
	{ kind: "code", label: "Code" },
	{ kind: "note", label: "Note" },
	{ kind: "preview", label: "Node picture" },
	{ kind: "graph", label: "Graph picture" },
] as const;

function blank(kind: (typeof ADDABLE)[number]["kind"]): Draft {
	switch (kind) {
		case "p": return { block: { t: "p", text: "" } };
		case "h": return { block: { t: "h", level: 2, text: "" } };
		case "ul": return { block: { t: "ul", items: [""] } };
		case "code": return { block: { t: "code", lang: "luau", text: "" } };
		case "note": return { block: { t: "note", kind: "info", text: "" } };
		case "preview": return { block: { t: "preview", nodes: [] }, ids: [] };
		case "graph": return { block: { t: "p", text: "" }, path: "" };
	}
}

/** A page's blocks as drafts, keeping what the source form will need. */
function draftsOf(page: DocPage): Draft[] {
	return page.blocks.map((block) =>
		block.t === "preview" ? { block, ids: block.nodes.map((n) => n.id) } : { block },
	);
}

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

/** A string as TypeScript. `JSON.stringify` is exactly the escaping wanted. */
const str = (text: string): string => JSON.stringify(text);

/**
 * One block as the source `site.ts` would hold.
 *
 * Previews are written as the `previews()` call the rest of the file uses, so a
 * pasted block reads like the ones around it rather than like generated output.
 */
function blockSource(draft: Draft, indent = "\t\t"): string {
	const block = draft.block;

	if (block.t === "preview") {
		const ids = (draft.ids ?? block.nodes.map((n) => n.id)).map(str).join(", ");
		const caption = block.caption ? `, ${str(block.caption)}` : "";
		return `${indent}...previews(registry, [${ids}]${caption}),`;
	}

	if (block.t === "graph") {
		const from = draft.path ? `${indent}// Built from ${draft.path}.${NEWLINE}` : "";
		return (
			`${from}${indent}// A scene worth a name belongs in GUIDE_SCENES; this is it inline.${NEWLINE}` +
			`${indent}{ t: "graph", script: ${JSON.stringify(block.script)}` +
			`${block.caption ? `, caption: ${str(block.caption)}` : ""} },`
		);
	}

	if (block.t === "h") {
		return `${indent}{ t: "h", level: ${block.level}, text: ${str(block.text)} },`;
	}
	if (block.t === "p") return `${indent}{ t: "p", text: ${str(block.text)} },`;
	if (block.t === "ul" || block.t === "ol") {
		const items = block.items.map((item) => `${indent}\t${str(item)},`).join(NEWLINE);
		return `${indent}{${NEWLINE}${indent}\tt: ${str(block.t)},${NEWLINE}${indent}\titems: [${NEWLINE}${items}${NEWLINE}${indent}\t],${NEWLINE}${indent}},`;
	}
	if (block.t === "code") {
		return `${indent}{ t: "code", lang: ${str(block.lang)}, text: ${str(block.text)} },`;
	}
	if (block.t === "note") {
		const items = block.items ? `, items: [${block.items.map(str).join(", ")}]` : "";
		return `${indent}{ t: "note", kind: ${str(block.kind)}, text: ${str(block.text)}${items} },`;
	}

	// Everything else round-trips as JSON: a table, a pin list, a fold. They are
	// not editable here, so they are handed back exactly as they arrived.
	return `${indent}${JSON.stringify(block)},`;
}

export function pageSource(page: DocPage, drafts: Draft[]): string {
	return [
		`// ${page.title} — ${page.slug}, proposed against Roswaal ${VERSION}.`,
		"blocks: [",
		...drafts.map((draft) => blockSource(draft)),
		"],",
	].join(NEWLINE);
}

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

export interface PageEditorProps {
	page: DocPage;
	registry: Registry;
	preview: PreviewOptions;
	/** Renders one block exactly as the page does, so editing is in place. */
	render: (block: Block, key: number) => React.ReactNode;
	onClose: () => void;
}

export function PageEditor({ page, registry, preview, render, onClose }: PageEditorProps) {
	const [drafts, setDrafts] = useState<Draft[]>(() => draftsOf(page));
	const [editing, setEditing] = useState<number | null>(null);
	const [adding, setAdding] = useState<number | null>(null);
	const [said, setSaid] = useState<string | null>(null);

	// A different page under the same editor is a different document.
	useEffect(() => {
		setDrafts(draftsOf(page));
		setEditing(null);
	}, [page]);

	const source = useMemo(() => pageSource(page, drafts), [page, drafts]);

	const patch = (at: number, next: Draft) =>
		setDrafts((current) => current.map((draft, i) => (i === at ? next : draft)));

	const move = (at: number, by: number) =>
		setDrafts((current) => {
			const to = at + by;
			if (to < 0 || to >= current.length) return current;
			const next = [...current];
			const [taken] = next.splice(at, 1);
			next.splice(to, 0, taken);
			return next;
		});

	const insert = (at: number, kind: (typeof ADDABLE)[number]["kind"]) => {
		setDrafts((current) => [...current.slice(0, at), blank(kind), ...current.slice(at)]);
		setEditing(at);
		setAdding(null);
	};

	const body = [
		`Page: ${page.title} (\`${page.slug}\`)`,
		`Roswaal ${VERSION}`,
		"",
		"Proposed blocks:",
		"```ts",
		source,
		"```",
	].join(NEWLINE).slice(0, PROPOSAL_LIMIT);

	const href =
		`${REPOSITORY}/issues/new?title=${encodeURIComponent(`Docs: ${page.title}`)}` +
		`&body=${encodeURIComponent(body)}`;

	const copy = () => {
		void navigator.clipboard.writeText(source).then(
			() => setSaid("The TypeScript is on your clipboard."),
			() => setSaid("The clipboard refused — the source is at the foot of the page."),
		);
	};

	return (
		<div className="page-editor">
			<div className="page-editor-bar">
				<Icon name="rename" size={15} />
				<strong>Editing this page</strong>
				<span className="hint">
					Click a block to change it. Nothing is saved here — Propose sends the blocks as an
					issue.
				</span>
				<span style={{ flex: 1 }} />
				<button className="tb" onClick={copy}>Copy TypeScript</button>
				<a className="tb primary" href={href} target="_blank" rel="noreferrer noopener">
					Propose the change
				</a>
				<button className="tb" onClick={onClose}>Done</button>
			</div>

			{said && <p className="page-editor-said">{said}</p>}

			{drafts.map((draft, i) => (
				<div className="page-block" key={i}>
					<div className="page-block-tools">
						<button className="tb" title="Edit this block" onClick={() => setEditing(editing === i ? null : i)}>
							<Icon name="rename" size={13} />
						</button>
						<button className="tb" title="Move up" onClick={() => move(i, -1)}>↑</button>
						<button className="tb" title="Move down" onClick={() => move(i, 1)}>↓</button>
						<button
							className="tb"
							title="Remove"
							onClick={() => setDrafts((current) => current.filter((_, at) => at !== i))}
						>
							×
						</button>
						<button className="tb" title="Add a block here" onClick={() => setAdding(adding === i ? null : i)}>
							+
						</button>
					</div>

					{adding === i && (
						<div className="page-block-add">
							{ADDABLE.map((entry) => (
								<button key={entry.kind} className="tb" onClick={() => insert(i, entry.kind)}>
									{entry.label}
								</button>
							))}
						</div>
					)}

					{editing === i ? (
						<BlockEditor
							draft={draft}
							registry={registry}
							preview={preview}
							onChange={(next) => patch(i, next)}
						/>
					) : (
						<div className="page-block-shown" onDoubleClick={() => setEditing(i)}>
							{render(draft.block, i)}
						</div>
					)}
				</div>
			))}

			<div className="page-block-add end">
				{ADDABLE.map((entry) => (
					<button key={entry.kind} className="tb" onClick={() => insert(drafts.length, entry.kind)}>
						{entry.label}
					</button>
				))}
			</div>

			<h3>The blocks, as source</h3>
			<p className="hint">
				Paste this into the page's entry in <code>src/core/docs/site.ts</code>. Propose sends it
				as an issue; for a long page, copy it instead — a URL will not carry it all.
			</p>
			<pre className="page-editor-source">{source}</pre>
		</div>
	);
}

// ---------------------------------------------------------------------------
// One block
// ---------------------------------------------------------------------------

function BlockEditor({
	draft, registry, preview, onChange,
}: {
	draft: Draft;
	registry: Registry;
	preview: PreviewOptions;
	onChange: (draft: Draft) => void;
}) {
	const block = draft.block;
	const set = (next: Block) => onChange({ ...draft, block: next });

	// First, because a graph block that has not been pointed at a graph yet is
	// still a placeholder paragraph — and the paragraph editor would claim it.
	if (block.t === "graph" || draft.path !== undefined) {
		return <GraphPicker draft={draft} onChange={onChange} />;
	}

	if (block.t === "p") {
		return (
			<textarea
				className="tb block-field"
				autoFocus
				rows={4}
				value={block.text}
				onChange={(e) => set({ ...block, text: e.target.value })}
			/>
		);
	}

	if (block.t === "h") {
		return (
			<div className="block-row">
				<select
					className="tb"
					value={block.level}
					onChange={(e) => set({ ...block, level: Number(e.target.value) as 2 | 3 | 4 })}
				>
					<option value={2}>Heading</option>
					<option value={3}>Subheading</option>
					<option value={4}>Minor heading</option>
				</select>
				<input
					className="tb"
					autoFocus
					value={block.text}
					onChange={(e) => set({ ...block, text: e.target.value })}
				/>
			</div>
		);
	}

	if (block.t === "ul" || block.t === "ol") {
		return (
			<textarea
				className="tb block-field"
				autoFocus
				rows={Math.max(3, block.items.length + 1)}
				value={block.items.join(NEWLINE)}
				title="One item to a line"
				onChange={(e) => set({ ...block, items: e.target.value.split(NEWLINE) })}
			/>
		);
	}

	if (block.t === "code") {
		return (
			<div className="block-stack">
				<select
					className="tb"
					value={block.lang}
					onChange={(e) => set({ ...block, lang: e.target.value as typeof block.lang })}
				>
					<option value="luau">Luau</option>
					<option value="ts">TypeScript</option>
					<option value="json">JSON</option>
					<option value="sh">Shell</option>
				</select>
				<textarea
					className="tb block-field mono"
					autoFocus
					rows={6}
					value={block.text}
					onChange={(e) => set({ ...block, text: e.target.value })}
				/>
			</div>
		);
	}

	if (block.t === "note") {
		return (
			<div className="block-stack">
				<select
					className="tb"
					value={block.kind}
					onChange={(e) => set({ ...block, kind: e.target.value as typeof block.kind })}
				>
					<option value="info">Worth knowing</option>
					<option value="good">Good to know</option>
					<option value="warn">Warning</option>
				</select>
				<textarea
					className="tb block-field"
					autoFocus
					rows={3}
					value={block.text}
					onChange={(e) => set({ ...block, text: e.target.value })}
				/>
			</div>
		);
	}

	if (block.t === "preview") {
		return <NodePicker draft={draft} registry={registry} preview={preview} onChange={onChange} />;
	}

	// A table, a pin list, a fold: kept exactly as they are rather than edited
	// through a worse control than the one that made them.
	return (
		<p className="hint">
			A {block.t} block is handed back unchanged. Edit it in <code>site.ts</code>, or remove it
			here and describe what it should say.
		</p>
	);
}

/**
 * Nodes to draw, picked by name.
 *
 * The picture comes from the same generator the page uses, so what a
 * contributor sees while choosing is what the page will show.
 */
function NodePicker({
	draft, registry, preview, onChange,
}: {
	draft: Draft;
	registry: Registry;
	preview: PreviewOptions;
	onChange: (draft: Draft) => void;
}) {
	const [query, setQuery] = useState("");
	const block = draft.block as Block & { t: "preview" };
	const ids = draft.ids ?? [];

	const matches = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (q === "") return [];
		return [...registry.values()]
			.filter((def) => def.title.toLowerCase().includes(q) || def.id.includes(q))
			.slice(0, 8);
	}, [query, registry]);

	const write = (next: string[]) => {
		const nodes = next
			.map((id) => registry.get(id))
			.filter((def): def is NonNullable<typeof def> => def !== undefined)
			.map(previewOf);
		onChange({ ...draft, ids: next, block: { ...block, nodes } });
	};

	return (
		<div className="block-stack">
			<div className="block-row">
				<input
					className="tb"
					autoFocus
					placeholder="Find a node by name"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
				<input
					className="tb"
					placeholder="Caption, if it needs one"
					value={block.caption ?? ""}
					onChange={(e) => onChange({ ...draft, block: { ...block, caption: e.target.value } })}
				/>
			</div>

			{matches.length > 0 && (
				<div className="block-matches">
					{matches.map((def) => (
						<button
							key={def.id}
							className="tb"
							onClick={() => {
								write([...ids, def.id]);
								setQuery("");
							}}
						>
							{def.title} <span className="hint">{def.id}</span>
						</button>
					))}
				</div>
			)}

			<div className="block-chips">
				{ids.map((id, at) => (
					<button
						key={`${id}-${at}`}
						className="tb"
						title="Remove this one"
						onClick={() => write(ids.filter((_, i) => i !== at))}
					>
						{id} ×
					</button>
				))}
				{ids.length === 0 && <span className="hint">No nodes chosen yet.</span>}
			</div>

			<div className="block-preview-row">
				{block.nodes.map((node) => (
					<div
						key={node.id}
						className="node-preview-frame"
						dangerouslySetInnerHTML={{ __html: previewSvg(node, preview) }}
					/>
				))}
			</div>
		</div>
	);
}

/**
 * A graph picture, taken from a graph in the project.
 *
 * Building the scene on the canvas and pointing at it beats writing node
 * coordinates into a documentation file: the scene is a real graph that
 * compiles, and it can be opened and changed later by whoever maintains it.
 */
function GraphPicker({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
	const [graphs, setGraphs] = useState<string[]>([]);
	const [failed, setFailed] = useState(false);
	const block = draft.block;
	const caption = block.t === "graph" ? block.caption ?? "" : "";

	useEffect(() => {
		void api.tree().then(
			({ tree }) => {
				const found: string[] = [];
				const walk = (entries: typeof tree) => {
					for (const entry of entries) {
						if (entry.kind === "nodescript") found.push(entry.path);
						if (entry.children) walk(entry.children);
					}
				};
				walk(tree);
				setGraphs(found);
			},
			() => setFailed(true),
		);
	}, []);

	const choose = (path: string) => {
		if (path === "") return;
		void api.readScript(path).then(
			({ script }: { script: NodeScript }) =>
				onChange({ ...draft, path, block: { t: "graph", script, caption } }),
			() => setFailed(true),
		);
	};

	if (failed) {
		return (
			<p className="hint">
				No daemon answered, so the project's graphs cannot be listed. A graph picture has to
				come from a graph — open a project in the editor and reload this window.
			</p>
		);
	}

	return (
		<div className="block-stack">
			<div className="block-row">
				<select className="tb" value={draft.path ?? ""} onChange={(e) => choose(e.target.value)}>
					<option value="">Choose a graph…</option>
					{graphs.map((path) => (
						<option key={path} value={path}>{path}</option>
					))}
				</select>
				<input
					className="tb"
					placeholder="Caption, if it needs one"
					value={caption}
					onChange={(e) =>
						block.t === "graph" && onChange({ ...draft, block: { ...block, caption: e.target.value } })
					}
				/>
			</div>
			<p className="hint">
				Build the scene on the canvas, save it, and pick it here. Keep it small — a reader is
				looking up one idea, not reading a program.
			</p>
		</div>
	);
}
