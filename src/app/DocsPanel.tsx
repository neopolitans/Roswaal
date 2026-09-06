/**
 * The Docs panel.
 *
 * Replaces the old Help panel, and is a different thing rather than a bigger
 * one: Help was five hand-written pages, this is the whole documentation —
 * guides *and* a reference page for every node in the registry, including the
 * project's own packs.
 *
 * It renders the same page model the static site does, from `src/core/docs`, so
 * the answer you get in the editor is the answer on the website. And because the
 * model is built from the live registry, a pack you loaded five minutes ago is
 * already documented, with its real compiled output.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { BUILTIN_NODES, type Registry } from "../core/nodes/index.js";
import {
	buildSearchIndex, buildSite, findPage, parseInline, searchDocs,
	type Block, type DocPage, type Inline,
} from "../core/docs/site.js";
import type { PinDoc } from "../core/docs/nodeReference.js";
import { Icon } from "./icons.jsx";
import { pinColor } from "./palette.js";

const BUILTIN_IDS = new Set(BUILTIN_NODES.map((d) => d.id));
const HOME = "getting-started";

export interface DocsViewProps {
	registry: Registry;
	/** Opens on this page, so "what is this node" can jump straight there. */
	initialSlug?: string;
	/** Reflects the current page outwards, for the address bar or a title. */
	onNavigate?: (slug: string) => void;
}

export function DocsView({ registry, initialSlug, onNavigate }: DocsViewProps) {
	const site = useMemo(() => buildSite(registry, BUILTIN_IDS), [registry]);
	const index = useMemo(() => buildSearchIndex(site), [site]);

	const [slug, setSlug] = useState(initialSlug ?? HOME);
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(["start", "guides"]));
	const body = useRef<HTMLDivElement>(null);

	const page = findPage(site, slug) ?? findPage(site, HOME)!;
	const results = useMemo(() => searchDocs(index, query), [index, query]);

	// A new page starts at the top; keeping the old scroll position drops you
	// into the middle of something you have not read.
	useEffect(() => {
		body.current?.scrollTo({ top: 0 });
		onNavigate?.(slug);
	}, [slug, onNavigate]);

	const go = (next: string) => {
		setSlug(next);
		setQuery("");
	};

	return (
		<div className="docs-body">
					<nav className="docs-nav">
						<input
							className="search"
							placeholder="Search the docs"
							value={query}
							autoFocus
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && results[0]) go(results[0].slug);
								if (e.key === "Escape" && query !== "") {
									e.stopPropagation();
									setQuery("");
								}
							}}
						/>

						{query.trim() !== "" ? (
							<div className="docs-results">
								{results.length === 0 && <div className="empty">Nothing matches “{query}”.</div>}
								{results.map((hit) => (
									<button
										key={hit.slug}
										className={`docs-hit${hit.slug === slug ? " on" : ""}`}
										onClick={() => go(hit.slug)}
									>
										<span className="title">{hit.title}</span>
										<span className="where">{hit.section}</span>
									</button>
								))}
							</div>
						) : (
							site.sections.map((section) => {
								const expanded = open.has(section.slug);
								return (
									<div key={section.slug} className="docs-section">
										<button
											className="docs-section-head"
											aria-expanded={expanded}
											onClick={() =>
												setOpen((prev) => {
													const next = new Set(prev);
													if (next.has(section.slug)) next.delete(section.slug);
													else next.add(section.slug);
													return next;
												})
											}
										>
											<Icon name="chevron" size={12} />
											{section.title}
											<span className="count">{section.pages.length}</span>
										</button>
										{expanded && (
											<div className="docs-pages">
												{section.pages.map((p) => (
													<button
														key={p.slug}
														className={`docs-link${p.slug === slug ? " on" : ""}`}
														onClick={() => setSlug(p.slug)}
													>
														{p.title}
														{p.custom && <span className="badge">pack</span>}
													</button>
												))}
											</div>
										)}
									</div>
								);
							})
						)}
					</nav>

					<article className="docs-content" ref={body}>
						<Page page={page} />
			</article>
		</div>
	);
}

function Page({ page }: { page: DocPage }) {
	return (
		<>
			<h1>
				{page.title}
				{page.custom && <span className="badge">from a node pack</span>}
			</h1>
			<p className="summary">{page.summary}</p>
			{page.blocks.map((block, i) => (
				<BlockView key={i} block={block} />
			))}
		</>
	);
}

function BlockView({ block }: { block: Block }) {
	switch (block.t) {
		case "h":
			return block.level === 2 ? <h2><Rich text={block.text} /></h2> : <h3><Rich text={block.text} /></h3>;
		case "p":
			return <p><Rich text={block.text} /></p>;
		case "ul":
			return (
				<ul>{block.items.map((item, i) => <li key={i}><Rich text={item} /></li>)}</ul>
			);
		case "ol":
			return (
				<ol>{block.items.map((item, i) => <li key={i}><Rich text={item} /></li>)}</ol>
			);
		case "code":
			return <pre className={`lang-${block.lang}`}>{block.text}</pre>;
		case "table":
			return (
				<div className="docs-table">
					<table>
						<thead>
							<tr>{block.head.map((h, i) => <th key={i}>{h}</th>)}</tr>
						</thead>
						<tbody>
							{block.rows.map((row, i) => (
								<tr key={i}>
									{row.map((cell, j) => <td key={j}><Rich text={cell} /></td>)}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			);
		case "note":
			return <div className={`docs-note ${block.kind}`}><Rich text={block.text} /></div>;
		case "pins":
			return <PinTable title={block.title} pins={block.pins} />;
	}
}

/**
 * A node's pins, with the colour they are drawn in on the canvas.
 *
 * The swatch is the point: somebody reading this page is looking at a node, and
 * matching a row to a pin by colour is faster than matching it by name.
 */
function PinTable({ title, pins }: { title: string; pins: PinDoc[] }) {
	return (
		<>
			<h3>{title}</h3>
			<div className="docs-table">
				<table className="pins">
					<thead>
						<tr><th /><th>Pin</th><th>Type</th><th>Default</th><th>Notes</th></tr>
					</thead>
					<tbody>
						{pins.map((pin) => (
							<tr key={pin.id}>
								<td className="swatch-cell">
									<span
										className={`docs-swatch ${pin.kind}`}
										style={{ background: pinColor(pin.type, pin.kind) }}
									/>
								</td>
								<td>{pin.name || pin.id}</td>
								<td className="mono">{pin.kind === "exec" ? "execution" : pin.type ?? "any"}</td>
								<td className="mono">{pin.default ?? (pin.required ? "must be wired" : "—")}</td>
								<td>
									{pin.description}
									{/* Splittability is listed once, in its own table below, rather
									    than repeated on every row that has it. */}
									{pin.literalOnly && <em>Typed in directly; takes no wire.</em>}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</>
	);
}

function Rich({ text }: { text: string }) {
	return (
		<>
			{parseInline(text).map((run, i) => (
				<Run key={i} run={run} />
			))}
		</>
	);
}

function Run({ run }: { run: Inline }) {
	switch (run.t) {
		case "text": return <>{run.text}</>;
		case "code": return <code>{run.text}</code>;
		case "strong": return <strong>{run.text}</strong>;
		case "em": return <em>{run.text}</em>;
		case "link":
			return (
				<a href={run.href} target="_blank" rel="noreferrer noopener">
					{run.text}
				</a>
			);
	}
}
