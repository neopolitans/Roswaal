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

import {
	createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties,
} from "react";

import { BUILTIN_NODES, type Registry } from "../core/nodes/index.js";
import {
	buildSearchIndex, buildSite, findPage, isPageLink, neighbours, parseInline, searchDocs,
	TAG_LABELS,
	type Block, type DocPage, type DocSection, type DocSite, type Inline,
} from "../core/docs/site.js";
import type { PinDoc } from "../core/docs/nodeReference.js";
import { REVIEW_DETAILS, REVIEW_LABELS, reviewLine, type Review } from "../core/docs/reviews.js";
import type { NodeScript } from "../core/schema.js";
import {
	graphSvg, previewSvg, type NodePreview, type PreviewOptions,
} from "../core/docs/preview.js";
import { noteHeadHtml } from "../core/docs/notes.js";
import { DocsSearch } from "./DocsSearch.jsx";
import { highlightLuau } from "./highlight.js";
import { Icon, ICONS, VIEW_BOX } from "./icons.jsx";
import { logoMarkup } from "./logo.jsx";
import { NODE, ZOOM } from "./layers.js";
import { nodeColor, pinColor } from "./palette.js";
import { wirePath } from "./geometry.js";
import { attachGraphView } from "./graphView.js";
import { readPreferences, wheelAction, writePreferences, type Preferences } from "./preferences.js";
import { applyDocsToggle } from "./docsToggle.js";
import { chosenDevice, pickTab, readerDevice, rememberPick } from "./docsDevice.js";
import { IS_STATIC_HOST } from "./pages.js";
import { growthState } from "../core/nodes/growth.js";
import { PageEditor } from "./PageEditor.jsx";
import { controlKey, legendOf, TOOLBAR_HINT, toolbarHtml } from "../core/docs/toolbars.js";
import { layoutHtml, listedRegions, type LayoutSpec } from "../core/docs/layouts.js";
import { RUNTIME_LABEL, RUNTIME_SUMMARY } from "../core/nodes/runtimes.js";
import { attachToolbarLink } from "./toolbarLink.js";
import { attachWalkthrough } from "./docsWalk.js";
import { attachMapPanel } from "./mapPanel.js";
import { mapFigure, mapFigureHtml } from "../core/docs/mapFigure.js";
import type { NodeMap } from "../core/nodemap.js";
import type { ToolbarSpec } from "../core/docs/toolbars.js";
import { VERSION } from "../cli/version.js";
import { graphViews } from "../core/docs/graphViews.js";
import { nodeCodeHtml } from "../core/docs/nodeCode.js";

const BUILTIN_IDS = new Set(BUILTIN_NODES.map((d) => d.id));

/**
 * The live registry, for the one block that needs it.
 *
 * A graph stores node *ids*; the definitions behind them are what say how
 * each one is drawn, and a project's own packs have to draw too. Context
 * rather than a prop threaded through every block renderer, because exactly
 * one of eleven block kinds wants it.
 */
const RegistryContext = createContext<Registry | null>(null);

/**
 * The canvas's own geometry and palette, handed to the preview generator.
 *
 * `src/core` cannot import either, so this is the one place they meet — and
 * because they are the same objects the canvas uses, a node in the docs and the
 * same node on the canvas are drawn from one set of numbers.
 */
const DEFAULT_PREVIEW: PreviewOptions = { geometry: NODE, nodeColor, pinColor, wirePath };

/**
 * The same, bent to the reader's own settings, so a picture in the docs looks
 * like their canvas. Square corners are a radius of nothing, and a wire takes
 * the style the canvas draws with; capsules and knots keep their shapes either
 * way, as they do there.
 */
/**
 * How a node is drawn in a picture: the reader's own geometry and colours.
 *
 * Exported because the node picker draws with it too — a picture that is not
 * the node you are about to place is worse than no picture.
 */
export function previewFor(prefs: Preferences, registry: Registry): PreviewOptions {
	return {
		geometry: {
			...NODE,
			...(prefs.roundedNodes ? {} : { radius: 0 }),
			wideNodes: prefs.wideNodes,
		},
		nodeColor,
		pinColor,
		wirePath: (from, to) => wirePath(from, to, prefs.wireStyle),
		growth: (preview) => growthState(registry.get(preview.id), preview.config),
		scale: prefs.docsPreviewScale,
	};
}

/** `.graph-viewport`'s height in `theme.css`, before the reader's preview size. */
const GRAPH_FRAME_HEIGHT = 260;

/**
 * A figure at more than 100% may grow past the article column, into the room
 * the page has — `.docs-preview.breakout` in `theme.css` does the arithmetic.
 * At 100% or less it keeps the column's width, and its pictures shrink inside.
 */
function breakout(scale: number | undefined): { className: string; style?: CSSProperties } {
	if (!scale || scale <= 1) return { className: "" };
	return { className: " breakout", style: { ["--preview-scale" as string]: String(scale) } };
}

/** The preview options in force for this window. */
const PreviewContext = createContext<PreviewOptions>(DEFAULT_PREVIEW);

/**
 * Opens another docs page. A link written as a bare slug is a page of these
 * docs, not an address, so following it means this rather than a new tab.
 */
const NavigateContext = createContext<(slug: string) => void>(() => {});
const HOME = "getting-started";
/** Written as a code unit so the escape survives the JSX attribute. */
const NEWLINE = String.fromCharCode(10);

export interface DocsViewProps {
	registry: Registry;
	/** The reader's preferences, for pictures that look like their canvas. */
	prefs: Preferences;
	/** Opens on this page, so "what is this node" can jump straight there. */
	initialSlug?: string;
	/** Reflects the current page outwards, for the address bar or a title. */
	onNavigate?: (slug: string) => void;
	/**
	 * Opens the search palette each time it changes. For a header's search
	 * button, on a screen with no keyboard to press Ctrl+K on; zero opens
	 * nothing, so the first render does not.
	 */
	searchRequest?: number;
}

export function DocsView({
	registry, prefs, initialSlug, onNavigate, searchRequest = 0,
}: DocsViewProps) {
	const site = useMemo(() => buildSite(registry, BUILTIN_IDS), [registry]);
	const index = useMemo(() => buildSearchIndex(site), [site]);

	const preview = useMemo(() => previewFor(prefs, registry), [prefs, registry]);

	const [slug, setSlug] = useState(initialSlug ?? HOME);
	const [query, setQuery] = useState("");
	const [palette, setPalette] = useState(false);
	/**
	 * Where the reader has been, newest first.
	 *
	 * Only for the palette's empty state, and only for this session — a docs
	 * window that remembered what you read last week would be keeping a record
	 * of your reading, which is a bigger thing to do than the feature is worth.
	 */
	const [recent, setRecent] = useState<string[]>([]);
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
		setPalette(false);
		setRecent((was) => [next, ...was.filter((slug) => slug !== next)].slice(0, 8));
	};

	/**
	 * Ctrl+K, the shortcut every documentation site has trained people to try.
	 *
	 * On the window rather than on the panel, because the point is that it works
	 * wherever you are on the page — and captured, so the browser's own "search
	 * the page" does not take it first.
	 */
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "k" && e.key !== "K") return;
			if (!e.ctrlKey && !e.metaKey) return;
			e.preventDefault();
			setPalette(true);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	useEffect(() => {
		if (searchRequest > 0) setPalette(true);
	}, [searchRequest]);

	return (
		<RegistryContext.Provider value={registry}>
		<PreviewContext.Provider value={preview}>
		<NavigateContext.Provider value={go}>
		<div className="docs-body">
			{palette && (
				<DocsSearch
					index={index}
					recent={recent}
					onPick={go}
					onClose={() => setPalette(false)}
				/>
			)}
			{/* The nav, the page, and its outline. */}
					<nav className="docs-nav">
						<input
							className="search"
							placeholder="Search the docs (Ctrl+K)"
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
										// A section holding one page is that page. Making somebody
										// open a drawer to reveal the single thing inside it is a
										// click that buys nothing.
										if (section.pages.length === 1) {
											const only = section.pages[0];
											return (
												<button
													key={section.slug}
													className={`docs-section-head solo${
														only.slug === slug ? " on" : ""
													}`}
													onClick={() => setSlug(only.slug)}
												>
													{section.title}
												</button>
											);
										}

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
						<div className={`docs-article${page.narrow ? " narrow" : ""}`}>
							<Page page={page} site={site} go={go} />
							<div className="docs-tail" aria-hidden="true" />
						</div>
					</article>

					{/* "On this page", as reference documentation usually has. Long
					    node pages and the longer guides are the ones that need it. */}
					<aside className="docs-toc">
						<PageOutline page={page} />
					</aside>
				</div>
		</NavigateContext.Provider>
		</PreviewContext.Provider>
		</RegistryContext.Provider>
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

function Page({ page, site, go }: { page: DocPage; site: DocSite; go: (next: string) => void }) {
	const registry = useContext(RegistryContext);
	const preview = useContext(PreviewContext);
	const [editing, setEditing] = useState(false);

	// A different page is a different document; leaving edit mode on would show
	// somebody else's blocks under this page's title.
	useEffect(() => setEditing(false), [page.slug]);

	return (
		<>
			{/* Title and standfirst are one block, so the rule under them spans the
			    article rather than stopping at the prose measure the summary sits
			    in — which read as a broken header. */}
			<header className="docs-title">
				<h1>
					{page.title}
					{/* The same tag the node menu puts on a row, so the two are
					    recognisably one thing. */}
					{page.runtime && (
						<span
							className={`badge runtime ${page.runtime}`}
							title={RUNTIME_SUMMARY[page.runtime]}
						>
							{RUNTIME_LABEL[page.runtime]}
						</span>
					)}
					{/* The second tag, for a datatype that is Roblox's and that Lune
					    borrows. It is the require string rather than the runtime's
					    name: the specifier is what has to be declared, and "Lune" in
					    front of it carries nothing a reader of a Lune graph needs. */}
					{page.runtimeVia && (
						<span
							className="badge runtime lune"
							title={`Lune has this through ${page.runtimeVia}, which the graph must require`}
						>
							{page.runtimeVia}
						</span>
					)}
					{page.custom && <span className="badge">from a node pack</span>}
					{/* The way in, where a page's own controls are looked for. It was a
					    button at the foot, which is where you are once you have
					    finished reading rather than where you notice the mistake. */}
					<button
						className="tb icon-only docs-edit"
						title={editing ? "Stop editing this page" : "Suggest an edit — change this page and propose it"}
						aria-label="Suggest an edit"
						onClick={() => setEditing((on) => !on)}
					>
						<Icon name="rename" size={15} />
					</button>
				</h1>
				<p className="summary">{page.summary}</p>
				{page.review && (
					<p className="docs-status">
						<ReviewBadge review={page.review} />
					</p>
				)}
			</header>
			{editing && registry ? (
				<PageEditor
					page={page}
					registry={registry}
					preview={preview}
					render={(block, key) => <BlockView key={key} block={block} />}
					onClose={() => setEditing(false)}
				/>
			) : (
				page.blocks.map((block, i) => <BlockView key={i} block={block} />)
			)}
			{/* Where to go next, above the line about this page's own review. */}
			{!editing && <Neighbours site={site} slug={page.slug} go={go} />}
			{!editing && page.review && (
				<p className="docs-reviewed"><Rich text={reviewLine(page.review)} /></p>
			)}
			{!editing && page.review?.verify && (
				<p className="docs-verify">
					<strong>To verify:</strong> <Rich text={page.review.verify} />
				</p>
			)}
		</>
	);
}



/**
 * The pages either side of this one, at the foot of it.
 *
 * The same pair the static site draws, and the same order, so the docs read
 * the same whether they are open in the editor or on the website. Clicking one
 * navigates in place, as every other page link here does.
 */
function Neighbours({ site, slug, go }: { site: DocSite; slug: string; go: (next: string) => void }) {
	const { previous, next } = neighbours(site, slug);
	if (!previous && !next) return null;
	const side = (one: { slug: string; title: string } | undefined, which: string, label: string) =>
		one ? (
			<a
				className={`docs-neighbour ${which}`}
				href={`#${one.slug}`}
				onClick={(e) => {
					e.preventDefault();
					go(one.slug);
				}}
			>
				<span className="way">{label}</span>
				<span className="title">{one.title}</span>
			</a>
		) : (
			<span className={`docs-neighbour ${which} none`} />
		);
	return (
		<nav className="docs-neighbours" aria-label="More pages">
			{side(previous, "previous", "Previous")}
			{side(next, "next", "Next")}
		</nav>
	);
}

/** Pending, Reviewed or Verified, with what that means on hover. */
function ReviewBadge({ review }: { review: Review }) {
	return (
		<span className={`badge review ${review.status}`} title={REVIEW_DETAILS[review.status]}>
			{REVIEW_LABELS[review.status]}
		</span>
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
		case "h": {
			const aside = block.aside && <span className="aside">{block.aside}</span>;
			const badge = block.badge && <span className="badge latest">{block.badge}</span>;
			if (block.level === 2) {
				return (
					<h2 id={headingId(block.text)}>
						<Rich text={block.text} />
						{badge}
						{aside}
					</h2>
				);
			}
			const Heading = block.level === 3 ? "h3" : "h4";
			return <Heading><Rich text={block.text} />{badge}{aside}</Heading>;
		}
		case "toggle":
			return <PreferenceToggle pref={block.pref} label={block.label} hint={block.hint} />;
		case "details":
			return (
				<details
					className="docs-details"
					open={block.open}
					{...(block.prerelease ? { "data-prerelease": "" } : {})}
				>
					<summary>
						<Rich text={block.summary} />
						{block.aside && <span className="aside">{block.aside}</span>}
					</summary>
					{block.blocks.map((inner, i) => <BlockView key={i} block={inner} />)}
				</details>
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
				<div className={`docs-table${block.head ? "" : " bare"}`}>
					<table>
						{/* No head at all rather than an empty one: a blank header row
						    still draws a rule and still takes the space. */}
						{block.head && (
							<thead>
								<tr>{block.head.map((h, i) => <th key={i}>{h}</th>)}</tr>
							</thead>
						)}
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
		case "tags":
			return (
				<p className="docs-tags">
					{block.tags.map((tag) => (
						<span className={`docs-tag tag-${tag}`} key={tag}>{TAG_LABELS[tag]}</span>
					))}
				</p>
			);
		case "note":
			return (
				<div className={`docs-note note-${block.kind}`}>
					<div dangerouslySetInnerHTML={{ __html: noteHeadHtml(block.kind) }} style={{ display: "contents" }} />
					<div className="docs-note-body">
						<Rich text={block.text} />
						{block.items && (
							<ul>
								{block.items.map((item, i) => (
									<li key={i}><Rich text={item} /></li>
								))}
							</ul>
						)}
					</div>
				</div>
			);
		case "pins":
			return <PinTable title={block.title} pins={block.pins} />;
		case "preview":
			return <PreviewFigure nodes={block.nodes} caption={block.caption} />;
		case "graph": {
			// A function is drawn in a graph of its own, a tab each, as the
			// editor opens it.
			const views = graphViews(block.script);
			if (views.length > 0) {
				return (
					<GraphTabs
						block={{
							t: "graphs",
							graphs: views.map((view, i) => (i === 0 && block.caption ? { ...view, caption: block.caption } : view)),
							...(block.panel ? { panel: block.panel } : {}),
							...(block.asAuthored ? { asAuthored: true } : {}),
						}}
					/>
				);
			}
			return (
				<GraphFigure script={block.script} caption={block.caption} panel={block.panel} asAuthored={block.asAuthored} />
			);
		}
		case "graphs":
			return <GraphTabs block={block} />;
		case "tabs":
			return <Tabs block={block} />;
		case "nodemap":
			return <MapFigureView map={block.map} caption={block.caption} />;
		case "toolbar":
			return <ToolbarFigure bar={block.bar} caption={block.caption} hint={block.hint} />;
		case "layout":
			return <LayoutFigure layout={block.layout} caption={block.caption} hint={block.hint} />;
		case "walkthrough":
			return <WalkthroughFigure block={block} />;
	}
}


/**
 * Several graphs behind tabs, as the editor shows two open documents.
 *
 * The static site does this with radios and labels; here it is state, because
 * the panel is React either way and a radio would be the odd one out. Both
 * render every graph — switching is showing, not building.
 */
function GraphTabs({ block }: { block: Block & { t: "graphs" } }) {
	const [at, setAt] = useState(0);
	const showing = block.graphs[Math.min(at, block.graphs.length - 1)];
	return (
		<div className={`docs-graph-tabs live${block.panel ? " with-panel" : ""}`}>
			{block.label && <p className="docs-tabs-label">{block.label}</p>}
			{/* Once, as a column of the tabs block: see the static renderer. */}
			{block.panel && (
				<div
					className="graph-declares"
					dangerouslySetInnerHTML={{ __html: toolbarHtml(block.panel, TOOLBAR_ART) }}
				/>
			)}
			<div className="docs-tab-bar">
				{block.graphs.map((one, i) => (
					<button
						key={one.id}
						type="button"
						className={i === at ? "on" : ""}
						onClick={() => setAt(i)}
					>
						{one.title}
					</button>
				))}
			</div>
			<GraphFigure script={showing.script} caption={showing.caption} asAuthored={block.asAuthored} />
		</div>
	);
}

/**
 * Steps shown one at a time over a drawing of the screen.
 *
 * The drawings are core's markup, injected, as a toolbar's are; the stepping
 * is `docsWalk.ts`, the function the published site runs, so the two behave
 * alike. See the `walkthrough` block in `site.ts`.
 */
function WalkthroughFigure({ block }: { block: Block & { t: "walkthrough" } }) {
	const figure = useRef<HTMLElement>(null);
	const frames = useMemo(
		() => block.steps.map((step) => ({ __html: step.picture.map((bar) => toolbarHtml(bar, TOOLBAR_ART)).join("") })),
		[block],
	);
	useEffect(() => {
		if (!figure.current) return;
		return attachWalkthrough(figure.current);
	}, [block]);

	return (
		<figure className="docs-walk" ref={figure}>
			<div className="docs-walk-window">
				{block.steps.map((step, i) => (
					<div
						key={i}
						className="docs-walk-frame"
						data-point={step.point ? controlKey(step.point) : undefined}
						hidden={i > 0}
						dangerouslySetInnerHTML={frames[i]}
					/>
				))}
			</div>
			<div className="docs-walk-nav">
				<button type="button" className="tb" data-walk="back">Back</button>
				<span className="docs-walk-count" />
				<button type="button" className="tb primary" data-walk="next">Next</button>
			</div>
			<ol className="docs-walk-steps">
				{block.steps.map((step, i) => <li key={i}><Rich text={step.text} /></li>)}
			</ol>
		</figure>
	);
}

/**
 * The artwork a drawn toolbar needs, gathered once.
 *
 * `src/core` cannot import either the glyphs or the mark, so this is where
 * they meet — the same arrangement `DEFAULT_PREVIEW` makes for the canvas
 * geometry, and for the same reason: the picture is then drawn from the
 * objects the real bars are drawn from.
 */
const TOOLBAR_ART = {
	viewBox: VIEW_BOX, paths: ICONS, mark: logoMarkup(15), version: VERSION, pinColor,
};

/**
 * A bar of the tool, drawn as it appears, with every control named under it.
 *
 * The bar itself is markup from `src/core/docs/toolbars.ts` and is injected
 * rather than rebuilt as JSX — the same bargain the node pictures make, so a
 * bar cannot look like one thing here and another on the website. Nothing in
 * it comes from a reader.
 *
 * The legend is JSX because its prose carries inline markup, and a link to
 * another docs page has to go through this panel's own navigation rather than
 * become an `<a href>` that leaves the window.
 */
/**
 * A checkbox on the page, wired to one of the reader's preferences.
 *
 * React state here, the shared script on the published site — the same split
 * every interactive figure makes, and for the same reason: this window already
 * holds the preferences and re-renders when they change, and the static site
 * has neither.
 */
function PreferenceToggle(
	{ pref, label, hint }: { pref: "showPreReleaseNotes"; label: string; hint?: string },
) {
	const [on, setOn] = useState(() => readPreferences()[pref]);

	// The stylesheet decides what the answer hides, from an attribute on the
	// document — the same one the published site's script sets, so one rule
	// serves both.
	useEffect(() => {
		applyDocsToggle(document, pref, on);
	}, [pref, on]);

	return (
		<label className="docs-toggle">
			<input
				type="checkbox"
				checked={on}
				onChange={(e) => {
					const next = e.target.checked;
					setOn(next);
					writePreferences({ ...readPreferences(), [pref]: next });
				}}
			/>
			<span className="docs-toggle-label"><Rich text={label} /></span>
			{hint && <span className="docs-toggle-hint"><Rich text={hint} /></span>}
		</label>
	);
}

/**
 * The map editor, drawn in the panel and wired up.
 *
 * The markup comes from core as one string, the way a toolbar's picture does,
 * so the published site and this panel cannot be drawing different chrome.
 * `attachMapPanel` is the same function the static site's script runs.
 */
function MapFigureView({ map, caption }: { map: NodeMap; caption?: string }) {
	const html = useMemo(() => ({ __html: mapFigureHtml(mapFigure(map)) }), [map]);
	const host = useRef<HTMLElement>(null);

	useEffect(() => {
		if (!host.current) return;
		return attachMapPanel(host.current);
	}, [html]);

	return (
		<figure className="docs-map" ref={host}>
			<div className="docs-map-body" dangerouslySetInnerHTML={html} />
			{caption && <figcaption><Rich text={caption} /></figcaption>}
		</figure>
	);
}

function ToolbarFigure(
	{ bar, caption, hint }: { bar: ToolbarSpec; caption?: string; hint?: boolean },
) {
	const html = useMemo(() => ({ __html: toolbarHtml(bar, TOOLBAR_ART) }), [bar]);
	const figure = useRef<HTMLElement>(null);

	// The same function the static site runs, so hovering a button behaves
	// identically in both. After the markup is in place, and undone on the way
	// out: this panel swaps pages without unmounting the document.
	useEffect(() => {
		if (!figure.current) return;
		return attachToolbarLink(figure.current);
	}, [bar]);

	return (
		<figure className="docs-bar" ref={figure}>
			<div className="docs-bar-picture" dangerouslySetInnerHTML={html} />
			<p className="docs-bar-summary"><Rich text={bar.summary} /></p>
			{hint && <p className="docs-bar-hint">{TOOLBAR_HINT}</p>}
			<ul className="docs-bar-legend">
				{legendOf(bar).map((item) => (
					<li key={item.name} data-control={controlKey(item.name)}>
						<span className="docs-bar-name">
							{item.name}
							{item.where && <span className="docs-bar-where">{item.where}</span>}
						</span>
						{item.what && (
							<span className="docs-bar-what"><Rich text={item.what} /></span>
						)}
					</li>
				))}
			</ul>
			{caption && <figcaption><Rich text={caption} /></figcaption>}
		</figure>
	);
}

/**
 * A whole window as a labelled diagram, with its regions listed under it.
 *
 * The toolbar figure's arrangement exactly: the picture from core, injected,
 * so it cannot differ from the website's; the legend as JSX, for its links;
 * and the same linking script, which pairs a region and its row by
 * `data-control` as it pairs a button and its row.
 */
function LayoutFigure(
	{ layout, caption, hint }: { layout: LayoutSpec; caption?: string; hint?: boolean },
) {
	const html = useMemo(() => ({ __html: layoutHtml(layout, TOOLBAR_ART) }), [layout]);
	const figure = useRef<HTMLElement>(null);

	useEffect(() => {
		if (!figure.current) return;
		return attachToolbarLink(figure.current);
	}, [layout]);

	return (
		<figure className="docs-bar docs-layout" ref={figure}>
			<div className="docs-bar-picture" dangerouslySetInnerHTML={html} />
			<p className="docs-bar-summary"><Rich text={layout.summary} /></p>
			{hint && <p className="docs-bar-hint">{TOOLBAR_HINT}</p>}
			<ol className="docs-bar-legend docs-layout-legend">
				{listedRegions(layout).map((region, i) => (
					<li key={region.name} data-control={controlKey(region.name)}>
						<span className="docs-bar-name">
							<span className="docs-layout-num">{i + 1}</span>
							{region.name}
							{region.where && <span className="docs-bar-where">{region.where}</span>}
						</span>
						{region.what && (
							<span className="docs-bar-what"><Rich text={region.what} /></span>
						)}
					</li>
				))}
			</ol>
			{caption && <figcaption><Rich text={caption} /></figcaption>}
		</figure>
	);
}

/**
 * One switch over several routes through the same subject.
 *
 * The static site renders all of them and switches with a radio; here the
 * chosen one is rendered and the rest are not, which is the same page either
 * way. Keyed by the tab's id rather than its position, so a tab added above it
 * does not move the reader.
 */
function Tabs({ block }: { block: Block & { t: "tabs" } }) {
	// Opens on the reader's own screen's tab, or the one they picked this
	// visit, as the published site does. See `docsDevice.ts`.
	const own = readerDevice(window, !IS_STATIC_HOST);
	const mine = pickTab(block.tabs, own);
	const [on, setOn] = useState(() => {
		const i = pickTab(block.tabs, chosenDevice() ?? own);
		return block.tabs[i >= 0 ? i : 0]?.id ?? "";
	});
	const current = block.tabs.find((tab) => tab.id === on) ?? block.tabs[0];
	if (!current) return null;

	return (
		<div className="docs-tabs">
			{block.label && <div className="docs-tabs-label"><Rich text={block.label} /></div>}
			<div className="docs-tab-bar" role="tablist">
				{block.tabs.map((tab) => (
					<button
						key={tab.id}
						role="tab"
						aria-selected={tab.id === current.id}
						className={tab.id === current.id ? "on" : ""}
						onClick={() => {
							setOn(tab.id);
							if (tab.device) rememberPick(tab.device, own);
						}}
					>
						{tab.title}
						{block.tabs[mine] === tab && <span className="docs-tab-here">this device</span>}
					</button>
				))}
			</div>
			<div className="docs-tab-panels">
				<section className="docs-tab-panel on">
					{current.blocks.map((inner, i) => <BlockView key={i} block={inner} />)}
				</section>
			</div>
		</div>
	);
}

/**
 * Nodes drawn as they appear on the canvas.
 *
 * The SVG is generated by `src/core/docs/preview.ts` and injected as markup
 * rather than rebuilt as JSX, which is the whole point: the panel and the
 * static site render the identical string, so a preview cannot look like one
 * thing here and another on the website. Nothing in it comes from the user —
 * every value passes through `escapeXml` on the way in.
 */
function PreviewFigure({ nodes, caption }: { nodes: NodePreview[]; caption?: string }) {
	const preview = useContext(PreviewContext);
	const wide = breakout(preview.scale);
	return (
		<figure className={`docs-preview${wide.className}`} style={wide.style}>
			<div className="row">
				{nodes.map((node) => (
					<div
						key={node.id}
						className="node-preview-frame"
						dangerouslySetInnerHTML={{ __html: previewSvg(node, preview) }}
					/>
				))}
			</div>
			{caption && <figcaption><Rich text={caption} /></figcaption>}
		</figure>
	);
}

/**
 * A whole graph, wires and all.
 *
 * Same arrangement as `PreviewFigure`: the SVG comes from `src/core/docs`, so
 * the panel and the static site render the identical string and cannot disagree
 * about what a graph looks like. The registry comes from context because a
 * graph stores node ids, and a project's own packs have to draw too.
 */
function GraphFigure(
	{ script, caption, panel, asAuthored }:
	{ script: NodeScript; caption?: string; panel?: ToolbarSpec; asAuthored?: boolean },
) {
	const registry = useContext(RegistryContext);
	const preview = useContext(PreviewContext);
	const svg = registry ? graphSvg(script, registry, preview, asAuthored) : "";
	const viewport = useRef<HTMLDivElement>(null);
	// One object per graph, not per render. A new `{ __html }` object is a new
	// prop, and a re-render with one writes the markup again -- a fresh <svg>,
	// with the pan and zoom still holding the one it replaced.
	const html = useMemo(() => ({ __html: svg }), [svg]);
	const codes = useMemo(() => nodeCodeHtml(script, highlightHtml), [script]);

	// The same function the static site runs, so a graph behaves identically in
	// both — and the same ZOOM limits the canvas uses.
	const scale = preview.scale ?? 1;
	useEffect(() => {
		if (!viewport.current || svg === "") return;
		// Read here rather than threaded through: it only matters when a graph
		// attaches, and the docs have no other use for it.
		const wheel = wheelAction(readPreferences().wheel);
		return attachGraphView(viewport.current, { ...ZOOM, scale, wheel });
	}, [svg, scale]);

	if (svg === "") return null;
	const wide = breakout(scale);
	return (
		<figure
			className={`docs-preview graph${panel ? " with-panel" : ""}${wide.className}`}
			style={wide.style}
		>
			{/* What the graph declares, from core, so it is byte-identical to
			    the published site's. */}
			{panel && (
				<div
					className="graph-declares"
					dangerouslySetInnerHTML={{ __html: toolbarHtml(panel, TOOLBAR_ART) }}
				/>
			)}
			<div
				className="graph-viewport"
				ref={viewport}
				style={{ height: GRAPH_FRAME_HEIGHT * scale }}
				dangerouslySetInnerHTML={html}
			/>
			{/* Each Custom Code node's Luau, for the graph's script to open. */}
			{codes !== "" && <div hidden dangerouslySetInnerHTML={{ __html: codes }} />}
			{caption && <figcaption><Rich text={caption} /></figcaption>}
		</figure>
	);
}

/** Luau to HTML, a line per newline: the published site's highlighter. */
function highlightHtml(code: string): string {
	const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	return highlightLuau(code)
		.map((tokens) => tokens
			.map((t) => (t.cls === "" ? escape(t.text) : `<span class="${t.cls}">${escape(t.text)}</span>`))
			.join(""))
		.join(NEWLINE);
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
							{pin.literalOnly && !pin.code && <span className="badge">literal</span>}
							{pin.code && <span className="badge">code editor</span>}
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
	const navigate = useContext(NavigateContext);
	switch (run.t) {
		case "text": return <>{run.text}</>;
		case "code": return <code>{run.text}</code>;
		case "strong": return <strong>{run.text}</strong>;
		case "em": return <em>{run.text}</em>;
		case "link":
			// Another page of these docs opens here. As a plain link it opened a
			// new tab at the slug, which is not an address the daemon serves.
			return isPageLink(run.href) ? (
				<a
					href={`#${run.href}`}
					onClick={(e) => {
						e.preventDefault();
						navigate(run.href);
					}}
				>
					{run.text}
				</a>
			) : (
				<a href={run.href} target="_blank" rel="noreferrer noopener">
					{run.text}
				</a>
			);
	}
}
