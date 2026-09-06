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
	type Block, type DocPage, type DocSection, type Inline,
} from "../core/docs/site.js";
import type { PinDoc } from "../core/docs/nodeReference.js";
import { highlightLuau } from "./highlight.js";
import { Icon } from "./icons.jsx";
import { pinColor } from "./palette.js";

const BUILTIN_IDS = new Set(BUILTIN_NODES.map((d) => d.id));
const HOME = "getting-started";
/** Written as a code unit so the escape survives the JSX attribute. */
const NEWLINE = String.fromCharCode(10);

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

	/**
	 * Follow the prop when it changes, not only at mount.
	 *
	 * The standalone window drives this from the address bar, so a link to
	 * `#node/flow.forRange` and the browser's own back button both arrive as a
	 * new `initialSlug`. Reading it once meant the hash moved and the page did
	 * not — and then the page wrote its own slug back over the hash.
	 *
	 * There is no loop: the write below uses `replaceState`, which does not fire
	 * `hashchange`.
	 */
	useEffect(() => {
		if (initialSlug !== undefined) setSlug(initialSlug);
	}, [initialSlug]);

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
			{/* The nav, the page, and its outline. */}
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
							groupsOf(site.sections).map(([group, sections]) => (
								<div key={group} className="docs-group">
									<div className="docs-group-head">{group}</div>
									{sections.map((section) => {
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
															</button>
														))}
													</div>
												)}
											</div>
										);
									})}
								</div>
							))
						)}
					</nav>

					<article className="docs-content" ref={body}>
						{/* The measure lives on an inner wrapper so the article itself
						    can centre in whatever room the window gives it. */}
						<div className="docs-article">
							<Page page={page} />
						</div>
					</article>

					{/* "On this page", as Creator Hub and Epic both have. Long node
					    pages and the Blueprint mapping are the ones that need it. */}
					<aside className="docs-toc">
						<PageOutline page={page} />
					</aside>
				</div>
	);
}

/** Sections in nav order, bucketed by their group heading. */
function groupsOf(sections: DocSection[]): [string, DocSection[]][] {
	const out = new Map<string, DocSection[]>();
	for (const section of sections) {
		const list = out.get(section.group) ?? [];
		list.push(section);
		out.set(section.group, list);
	}
	return [...out];
}

/** A heading's anchor id, shared by the outline and the heading itself. */
function headingId(text: string): string {
	return `h-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function PageOutline({ page }: { page: DocPage }) {
	const headings = page.blocks.filter((b) => b.t === "h" && b.level === 2);
	if (headings.length < 2) return null;

	return (
		<>
			<div className="docs-toc-head">On this page</div>
			{headings.map((h, i) =>
				h.t === "h" ? (
					<a
						key={i}
						href={`#${headingId(h.text)}`}
						className="docs-toc-link"
						onClick={(e) => {
							// The hash is the *page*, so letting this link write to it
							// navigated to a slug that does not exist and fell back to
							// Getting Started. Scroll directly and leave the hash alone.
							e.preventDefault();
							document
								.getElementById(headingId(h.text))
								?.scrollIntoView({ behavior: "smooth", block: "start" });
						}}
					>
						{h.text}
					</a>
				) : null,
			)}
		</>
	);
}

function Page({ page }: { page: DocPage }) {
	return (
		<>
			{/* Title and standfirst are one block, so the rule under them spans the
			    article rather than stopping at the prose measure the summary sits
			    in — which read as a broken header. */}
			<header className="docs-title">
				<h1>
					{page.title}
					{page.custom && <span className="badge">from a node pack</span>}
				</h1>
				<p className="summary">{page.summary}</p>
			</header>
			{page.blocks.map((block, i) => (
				<BlockView key={i} block={block} />
			))}
		</>
	);
}

/**
 * A code block you can read and copy but not edit.
 *
 * The generated Luau is the thing a reader most often wants out of a docs page
 * and most often mistypes, so it gets a copy button rather than a careful
 * three-line drag. Editable would be worse than useless: nothing here is wired
 * to anything, so a change would look like it did something and would not.
 */
function CodeBlock({ lang, text }: { lang: string; text: string }) {
	const [state, setState] = useState<"idle" | "copied" | "select">("idle");
	const code = useRef<HTMLPreElement>(null);

	useEffect(() => {
		if (state === "idle") return;
		const id = window.setTimeout(() => setState("idle"), 1800);
		return () => window.clearTimeout(id);
	}, [state]);

	/**
	 * The clipboard can refuse — an unfocused window, a browser that wants a
	 * permission first. A button that then does nothing at all is worse than no
	 * button, so the fallback selects the code and says to press Ctrl+C, which
	 * is what the reader was going to do anyway.
	 */
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(text);
			setState("copied");
		} catch {
			const node = code.current;
			if (node) {
				const range = document.createRange();
				range.selectNodeContents(node);
				const selection = window.getSelection();
				selection?.removeAllRanges();
				selection?.addRange(range);
			}
			setState("select");
		}
	};

	const label = state === "copied" ? "Copied" : state === "select" ? "Press Ctrl+C" : "Copy";

	return (
		<div className="docs-code">
			<div className="docs-code-head">
				<span className="lang">{lang}</span>
				<button className="copy" onClick={() => void copy()}>
					{label}
				</button>
			</div>
			<pre ref={code}>
				{lang === "luau" ? <Highlighted source={text} /> : text}
			</pre>
		</div>
	);
}

/**
 * Luau, coloured by the same tokeniser the Custom Code editor uses.
 *
 * Rendered line by line rather than as one blob so the newlines survive as
 * text: a reader selecting the block and copying it should get the code, not
 * the code run together.
 */
function Highlighted({ source }: { source: string }) {
	const lines = highlightLuau(source);
	return (
		<>
			{lines.map((tokens, i) => (
				<span key={i}>
					{tokens.map((token, j) =>
						token.cls === "" ? (
							<span key={j}>{token.text}</span>
						) : (
							<span key={j} className={token.cls}>{token.text}</span>
						),
					)}
					{i < lines.length - 1 ? NEWLINE : null}
				</span>
			))}
		</>
	);
}

function BlockView({ block }: { block: Block }) {
	switch (block.t) {
		case "h":
			return block.level === 2 ? (
				<h2 id={headingId(block.text)}><Rich text={block.text} /></h2>
			) : (
				<h3><Rich text={block.text} /></h3>
			);
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
			return <CodeBlock lang={block.lang} text={block.text} />;
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
/**
 * A node's pins, as a bordered list rather than a table.
 *
 * The shape Roblox's own reference uses for properties and methods, and it
 * suits this better than columns did: the signature — `Name : type` — is the
 * thing being scanned, the rest is detail that belongs underneath it rather
 * than in a column that is empty on most rows.
 *
 * The swatch carries the colour the pin is drawn in on the canvas, because
 * somebody reading this page is looking at a node, and matching a row to a pin
 * by colour is faster than matching it by name.
 */
function PinTable({ title, pins }: { title: string; pins: PinDoc[] }) {
	return (
		<>
			<h3>{title}</h3>
			<ul className="docs-pins">
				{pins.map((pin) => (
					<li key={pin.id}>
						<div className="sig">
							<span
								className={`docs-swatch ${pin.kind}`}
								style={{ background: pinColor(pin.type, pin.kind) }}
							/>
							<span className="name">{pin.name || pin.id}</span>
							<span className="sep">:</span>
							<span className="type">
								{pin.kind === "exec" ? "execution" : pin.type ?? "any"}
							</span>
							{pin.default !== undefined && (
								<span className="def">
									= <code>{pin.default}</code>
								</span>
							)}
							{pin.required && <span className="badge warn">must be wired</span>}
							{pin.literalOnly && <span className="badge warn">typed in, no wire</span>}
							{pin.splitModes.length > 0 && <span className="badge">splittable</span>}
						</div>
						{(pin.description || pin.splitModes.length > 0) && (
							<div className="detail">
								{pin.description}
								{pin.splitModes.length > 0 && (
									<> Splits into {pin.splitModes.join(", or ")}.</>
								)}
							</div>
						)}
					</li>
				))}
			</ul>
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
