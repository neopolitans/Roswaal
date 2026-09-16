/**
 * The node palette, used both as a right-click context menu and as the
 * toolbar's Add menu. It is a search box first because a categorised list of
 * seventy nodes stops being browsable long before it stops growing.
 *
 * Alongside the node types it lists *presets*: one entry per variable and per
 * function in the open graph, so "Get health" and "Set health" are things you
 * search for by name rather than dropping a generic node and then pointing it
 * at something, because the name is what you have in mind, not the node type.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { GraphNode, Literal, NodeConfig, NodeDef, PinDef, PinRef } from "../core/schema.js";
import type { Registry } from "../core/nodes/index.js";
import { categories, subcategories } from "../core/nodes/index.js";
import { FUNCTION_NODES } from "../core/nodes/flow.js";
import {
	hoistedFunctions, paramsVisibleFrom, visibleFrom, type GraphId,
} from "../core/functionGraph.js";
import { landingPins, localRefFor } from "./edits.js";
import { keywordNodes } from "../core/keywords.js";
import { nameItems, serviceMenuItems, servicePins } from "../core/serviceCalls.js";
import { LAYER } from "./layers.js";
import { COMMENT_DEFAULT_COLOR, nodeColor, pinColor } from "./palette.js";
import {
	classify, RUNTIME_LABEL, RUNTIME_SUMMARY, RUNTIMES, type Runtime,
} from "../core/nodes/runtimes.js";
import { readPreferences, writePreferences } from "./preferences.js";

export interface MenuAnchor {
	/** Viewport position. The menu is `position: fixed`, so it must not be
	 *  canvas-relative — that opens it a sidebar's width off. */
	screen: { x: number; y: number };
	/** Where a spawned node should land, in world coordinates. */
	world: { x: number; y: number };
	/**
	 * The pin this menu was dragged off, if it was.
	 *
	 * Set when a wire is released over empty canvas. It does two things: the
	 * list is narrowed to nodes that could actually take the wire, and the node
	 * you pick is wired up on arrival — which is the whole point, and what
	 * anyone who already knows node graphs will expect.
	 */
	from?: {
		ref: PinRef; side: "in" | "out"; pin: PinDef;
		/**
		 * The service the wire carries, when it carries one.
		 *
		 * Set by the canvas, which can see the node the wire left — a pin typed
		 * as a service class, or a Get Service, whose service is a literal and so
		 * cannot be read off the pin's type. The menu opens on that service's
		 * methods, which is the whole gesture: drag a service out, ask it what it
		 * can do.
		 */
		service?: string;
	};
}

/** A named instance of a node type: "Get health", "Set health", "Get greet". */
export interface Preset {
	key: string;
	title: string;
	category: string;
	summary?: string;
	defId: string;
	config: NodeConfig;
	/** Swatch colour; presets use their value's type rather than a category. */
	color: string;
}

interface MenuItem {
	key: string;
	title: string;
	category: string;
	/** Set only for the datatypes, which group one level deeper. */
	subcategory?: string;
	summary?: string;
	color: string;
	pure: boolean;
	/** Which runtime it needs. Shown on the row, and what the filter narrows on. */
	runtime: Runtime;
	def: NodeDef;
	config?: NodeConfig;
	/**
	 * The pins this item would arrive with, where its config decides them.
	 *
	 * Only the service calls set it. A wire in flight filters the menu by what
	 * a node can receive, and "Service Function" declares no pins of its own —
	 * so without this, dragging a boolean into the menu would hide the very
	 * entry that gives a boolean back.
	 */
	pins?: { inputs: PinDef[]; outputs: PinDef[] };
	/**
	 * Values typed into the node's own pins on arrival.
	 *
	 * A config decides what a node *is*; a literal is what somebody would have
	 * typed into it. Get Service's service and New Instance's class name are
	 * literals — they are pins with a value — so an entry that offers "the
	 * ReplicatedStorage one" has to be able to fill one in.
	 */
	literals?: Record<string, Literal>;
}

export interface NodeMenuProps {
	anchor: MenuAnchor;
	registry: Registry;
	target: "roblox" | "lune";
	presets: Preset[];
	onPick: (def: NodeDef, config?: NodeConfig, literals?: Record<string, Literal>) => void;
	onAddComment: () => void;
	onClose: () => void;
}

export function NodeMenu(props: NodeMenuProps) {
	const { anchor, registry, target, presets, onPick, onAddComment, onClose } = props;
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const root = useRef<HTMLDivElement>(null);

	const allItems = useMemo((): MenuItem[] => {
		const fromDefs = [...registry.values()]
			.filter((def) => !def.targets || def.targets.includes(target))
			.map((def) => ({
				key: def.id,
				title: def.title,
				category: def.category,
				subcategory: def.subcategory,
				summary: def.summary,
				color: nodeColor(def),
				pure: def.pure === true,
				runtime: classify(def),
				def,
			}));

		const fromPresets = presets.flatMap((preset) => {
			const def = registry.get(preset.defId);
			if (!def) return [];
			return [{
				key: preset.key,
				title: preset.title,
				category: preset.category,
				summary: preset.summary,
				color: preset.color,
				pure: def.pure === true,
				// A preset is an instance of a node, so it runs where that node
				// runs. Reading it off the preset would be a second answer.
				runtime: classify(def),
				def,
				config: preset.config,
			}];
		});

		// Presets first within a category: a named thing beats the generic node
		// it is an instance of.
		return [...fromPresets, ...fromDefs];
	}, [registry, target, presets]);

	/**
	 * Which runtime the list is narrowed to, remembered between openings.
	 *
	 * On top of the target's own filter rather than instead of it — `allItems`
	 * has already dropped anything this graph cannot compile. What is left to
	 * narrow is mostly "show me only what is portable", which is the question
	 * somebody asks when they are thinking about moving a graph.
	 */
	const [runtime, setRuntime] = useState<Runtime | null>(() => readPreferences().nodeRuntime);

	const chooseRuntime = (next: Runtime | null) => {
		setRuntime(next);
		writePreferences({ ...readPreferences(), nodeRuntime: next });
	};

	/**
	 * The runtimes worth offering, which is the ones actually present.
	 *
	 * A Lune graph has no Roblox nodes left to filter to, so offering the chip
	 * would be offering an empty list — and a filter that can only disappoint
	 * is worse than no filter. With one runtime present there is nothing to
	 * choose between, so the row goes entirely.
	 */
	const present = useMemo(() => {
		const seen = new Set(allItems.map((item) => item.runtime));
		return RUNTIMES.filter((r) => seen.has(r));
	}, [allItems]);

	// A remembered runtime that this graph has none of would hide everything.
	const narrowed = runtime !== null && present.includes(runtime) ? runtime : null;

	/**
	 * The pin a wire was dragged off, and what could receive it.
	 *
	 * Filtering rather than merely sorting, because a wire in flight is a
	 * question with a much smaller set of answers than "which node" — offering
	 * Branch when you dragged off a Vector3 output is offering something that
	 * cannot be picked. A node qualifies if it declares *any* pin on the
	 * opposite side that the wire would fit, using the same compatibility rule
	 * the canvas uses when you drop on a pin directly, so the menu cannot offer
	 * a node the connection would then refuse.
	 *
	 * Pins are read from the definition rather than resolved per instance,
	 * since the node does not exist yet. For a node whose pins depend on its
	 * config that is the shape it will arrive with, which is the right answer.
	 */
	const reachable = useMemo(() => {
		const from = anchor.from;
		if (!from) return null;
		const side = from.side === "out" ? "in" : "out";
		const ok = new Set<string>();
		for (const def of registry.values()) {
			const pins = side === "in" ? def.inputs : def.outputs;
			if (landingPins(def, pins, from.pin, side).length > 0) ok.add(def.id);
		}
		return ok;
	}, [anchor.from, registry]);

	const items = useMemo(() => {
		const byWire = reachable === null
			? allItems
			: allItems.filter((item) => reachable.has(item.def.id));
		return narrowed === null ? byWire : byWire.filter((item) => item.runtime === narrowed);
	}, [allItems, reachable, narrowed]);

	/**
	 * Every method of every service, as an entry that configures one of the two
	 * Service Function nodes.
	 *
	 * **Searched, never browsed.** Three hundred calls under a heading is a list
	 * nobody scrolls, and it would bury the rest of the Engine category — so
	 * they appear once you have typed something, and browsing shows the two
	 * nodes themselves, which is where the picker lives.
	 */
	// Roblox-only twice over: the guard below, and the node each entry
	// configures. Stated rather than assumed, so the badge and the filter read
	// it the same way everything else does.
	const serviceItems = useMemo((): MenuItem[] => {
		if (target !== "roblox") return [];
		return serviceMenuItems().flatMap((entry) => {
			const def = registry.get(entry.defId);
			if (!def) return [];
			const pure = def.pure === true;
			const runtime = classify(def);
			const dragged = entry.service === anchor.from?.service;
			return [{
				runtime,
				// Off a service's own pin the service is not news — it is what you
				// dragged — so the entries are the method names under a heading of
				// the service, which is how the Creator Hub lists them. Searched
				// from nowhere in particular, the service is half the name.
				key: `service:${entry.service}:${entry.method.name}`,
				title: dragged ? entry.method.name : `${entry.service}:${entry.method.name}`,
				category: dragged ? entry.service : "Engine",
				summary: entry.method.summary,
				color: nodeColor(def),
				pure,
				def,
				config: entry.config,
				pins: servicePins(entry.config, pure),
			}];
		});
	}, [registry, target, anchor.from?.service]);

	/**
	 * The methods of the service a wire was dragged off, listed before anything
	 * else and without a search.
	 *
	 * This is the one place a list of methods is browsable rather than searched:
	 * narrowed to one service it is a dozen or two, it is what the gesture asked
	 * for, and the alternative — dragging RunService out and being shown every
	 * node in the library that takes an Instance — answers a question nobody put.
	 */
	/**
	 * A service or a class by its own name.
	 *
	 * `ReplicatedStorage` is a thing somebody has in mind, and the node for it is
	 * Get Service with that name filled in — so the name is what the entry is
	 * called, and the node it makes is in the summary beside it. Searched rather
	 * than browsed, like the service methods: six hundred classes under a heading
	 * is not a list anybody reads.
	 */
	const nameEntries = useMemo((): MenuItem[] => {
		if (target !== "roblox") return [];
		return nameItems().flatMap((entry) => {
			const def = registry.get(entry.defId);
			if (!def) return [];
			return [{
				runtime: classify(def),
				key: `name:${entry.defId}:${entry.name}`,
				title: entry.name,
				category: entry.category,
				summary: entry.summary,
				color: nodeColor(def),
				pure: def.pure === true,
				def,
				literals: entry.literals,
			}];
		});
	}, [registry, target]);

	const draggedService = useMemo(() => {
		const service = anchor.from?.service;
		if (!service || anchor.from?.side !== "out") return [];
		return serviceItems.filter((item) => item.category === service);
	}, [serviceItems, anchor.from?.service, anchor.from?.side]);

	const matches = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return [...draggedService, ...items];

		const from = anchor.from;
		const side = from ? (from.side === "out" ? "in" : "out") : null;
		const reach = (item: MenuItem) => {
			if (!from || !side) return true;
			// A configured entry knows the pins it would arrive with; one that only
			// fills a literal in arrives with its definition's own.
			const pins = item.pins ?? { inputs: item.def.inputs, outputs: item.def.outputs };
			const list = side === "in" ? pins.inputs : pins.outputs;
			return landingPins(item.def, list, from.pin, side).length > 0;
		};
		// A method of the dragged service is listed once, under its own heading,
		// so the same call does not appear twice with two different names.
		const dragged = new Set(draggedService.map((item) => item.key));
		const searchable = [
			...draggedService,
			...items,
			...serviceItems.filter((item) => !dragged.has(item.key) && reach(item)),
			...nameEntries.filter(reach),
		];

		return searchable
			.map((item) => ({ item, score: score(item, q) }))
			.filter((x) => x.score > 0)
			.sort((a, b) => b.score - a.score)
			.map((x) => x.item);
	}, [query, items, serviceItems, nameEntries, draggedService, anchor.from]);

	/**
	 * Categories, each holding either a flat list or a list of datatype groups.
	 *
	 * Nested rather than flattened into "Engine Types · Vector3" headings,
	 * because the point of the grouping is that Vector3 and Color3 are *inside*
	 * one thing rather than beside eleven others — and a heading that repeats
	 * the same eleven characters nine times says the opposite.
	 *
	 * A subcategorised item still sorts under its category, so searching is
	 * unaffected: `groups` is empty for every category but the datatypes, and
	 * the renderer falls back to the flat list it always drew.
	 */
	const grouped = useMemo(() => {
		const byCategory = new Map<string, MenuItem[]>();
		for (const item of matches) {
			const list = byCategory.get(item.category);
			if (list) list.push(item);
			else byCategory.set(item.category, [item]);
		}
		/**
		 * Browsing keeps the library's own order; searching puts the best match
		 * first.
		 *
		 * The scores were already right and nothing was reading them: the list is
		 * drawn category by category in registry order, so a Flow node matched on
		 * a word in its summary was drawn above the Logic pill the query named
		 * outright. Typing `not` offered Branch.
		 *
		 * `matches` is sorted by score, so a category's first appearance in it is
		 * that category's best hit — which makes this a stable sort by best hit
		 * and keeps each category's own items in score order underneath.
		 */
		const searching = query.trim() !== "";
		const seen = [...new Set(matches.map((item) => item.category))];
		const order = searching
			? seen
			: categories(registry).filter((c) => byCategory.has(c));
		const extra = [...byCategory.keys()].filter((c) => !order.includes(c)).sort();
		// The service you dragged off goes first. It is the answer to the gesture;
		// everything under it is what else the graph could do with that wire.
		const service = anchor.from?.service;
		const lead = service && byCategory.has(service) ? [service] : [];
		const rest = [...order, ...extra].filter((c) => !lead.includes(c));

		return [...lead, ...rest].map((category) => {
			const all = byCategory.get(category)!;
			const subs = subcategories(registry, category);
			if (subs.length === 0) return { category, loose: all, groups: [] };

			// An item in a subcategorised category that names no subcategory is
			// not an error — nothing built-in does it, but a pack might — so it
			// is drawn straight under the category heading rather than dropped.
			const loose = all.filter((item) => !item.subcategory);
			const groups = subs
				.map((sub) => ({ sub, items: all.filter((item) => item.subcategory === sub) }))
				.filter((g) => g.items.length > 0);
			return { category, loose, groups };
		});
	}, [matches, query, registry, anchor.from?.service]);

	/** Flat order, so arrow keys move through the list the eye reads. */
	const flat = useMemo(
		() => grouped.flatMap((g) => [...g.loose, ...g.groups.flatMap((sub) => sub.items)]),
		[grouped],
	);

	useEffect(() => setActive(0), [query]);

	useEffect(() => {
		const onDown = (e: MouseEvent) => {
			if (!root.current?.contains(e.target as Node)) onClose();
		};
		// Deferred so the click that opened the menu does not immediately close it.
		const id = window.setTimeout(() => window.addEventListener("mousedown", onDown), 0);
		return () => {
			window.clearTimeout(id);
			window.removeEventListener("mousedown", onDown);
		};
	}, [onClose]);

	// Keep the menu on screen when it is opened near an edge.
	const style = {
		zIndex: LAYER.menu,
		left: Math.min(anchor.screen.x, window.innerWidth - 300),
		top: Math.min(anchor.screen.y, window.innerHeight - 360),
	};

	return (
		<div className="menu" ref={root} style={style}>
			{anchor.from && (
				/* The list is narrowed to what the wire can reach, and that is a
				   surprising thing for a search box to do without saying so. It
				   also answers "which pin am I still holding" after a drag
				   across the graph. */
				<div className="menu-from">
					<span className="dot" style={{ background: pinColor(anchor.from.pin.type, anchor.from.pin.kind) }} />
					<span>
						{anchor.from.side === "out" ? "Wire from" : "Wire into"}{" "}
						<strong>{anchor.from.pin.name || anchor.from.pin.id}</strong>
					</span>
				</div>
			)}
			{present.length === 1 && (
				/* Nothing to choose between, but something to say. A Lune graph is
				   all base Luau until the Lune library lands, and an empty space
				   where the filter goes reads as the filter being broken rather
				   than as there being one answer. */
				<div className="menu-runtimes" role="group" aria-label="Runtime">
					<span className="only" title={RUNTIME_SUMMARY[present[0]]}>
						Every node here is <strong>{RUNTIME_LABEL[present[0]]}</strong>
					</span>
				</div>
			)}
			{present.length > 1 && (
				/* Which runtime, on top of what this graph can compile. */
				<div className="menu-runtimes" role="group" aria-label="Filter by runtime">
					<button
						type="button"
						className={narrowed === null ? "on" : ""}
						onClick={() => chooseRuntime(null)}
						title="Every node this graph can compile"
					>
						All
					</button>
					{present.map((r) => (
						<button
							key={r}
							type="button"
							className={narrowed === r ? "on" : ""}
							onClick={() => chooseRuntime(narrowed === r ? null : r)}
							title={RUNTIME_SUMMARY[r]}
						>
							{RUNTIME_LABEL[r]}
						</button>
					))}
				</div>
			)}
			<input
				className="search"
				autoFocus
				placeholder={anchor.from ? "Search what can take this wire" : "Search nodes and variables"}
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Escape") onClose();
					if (e.key === "ArrowDown") {
						e.preventDefault();
						setActive((i) => Math.min(i + 1, flat.length - 1));
					}
					if (e.key === "ArrowUp") {
						e.preventDefault();
						setActive((i) => Math.max(i - 1, 0));
					}
					if (e.key === "Enter" && flat[active]) {
						onPick(flat[active].def, flat[active].config, flat[active].literals);
					}
				}}
			/>
			<div className="items">
				{query.trim() === "" && (
					<div className="item" onClick={onAddComment}>
						<span className="swatch" style={{ background: `#${COMMENT_DEFAULT_COLOR}` }} />
						<span>Comment</span>
						<span className="hint">C</span>
					</div>
				)}
				{grouped.map((group) => {
					const row = (item: MenuItem) => (
						<div
							key={item.key}
							className={`item${flat[active]?.key === item.key ? " active" : ""}`}
							title={item.summary}
							onMouseEnter={() => setActive(flat.indexOf(item))}
							onClick={() => onPick(item.def, item.config, item.literals)}
						>
							<span className="swatch" style={{ background: item.color }} />
							<span>{item.title}</span>
							{item.pure && <span className="hint">pure</span>}
							{/* What it needs, where that is worth saying. Base Luau
							    is the unmarked case -- badging four rows in five
							    would be noise -- and a narrowed list already says
							    it on the chip above. */}
							{item.runtime !== "luau" && narrowed === null && (
								<span className={`hint runtime ${item.runtime}`} title={RUNTIME_SUMMARY[item.runtime]}>
									{RUNTIME_LABEL[item.runtime]}
								</span>
							)}
						</div>
					);
					return (
						<div key={group.category}>
							<div className="group">{group.category}</div>
							{group.loose.map(row)}
							{group.groups.map((sub) => (
								<div key={sub.sub}>
									<div className="subgroup">{sub.sub}</div>
									{sub.items.map(row)}
								</div>
							))}
						</div>
					);
				})}
				{flat.length === 0 && <div className="empty">Nothing matches “{query}”.</div>}
			</div>
		</div>
	);
}

/**
 * Prefix matches on the title beat substring matches, which beat the id — with
 * two things ahead of all of it.
 *
 * **A query that is Luau** is answered by the node that writes it: `not` is Not
 * rather than Not Equal, `==` is Equal rather than nothing at all. The keyword
 * table is the whole of that rule and is in core, since the documentation has
 * the same question to answer.
 *
 * **An exact title** comes next, because "Print" typed in full and matched
 * against Print and Print Table is not an ambiguous question.
 */
export function score(item: MenuItem, query: string): number {
	const keywords = keywordNodes(query);
	const at = keywords.indexOf(item.def.id);
	// Ordered within the keyword's own answer: `for` offers For Range, then For
	// Each, then For Each (Array), which is the order somebody means them in.
	if (at >= 0) return 1000 - at;

	const title = item.title.toLowerCase();
	if (title === query) return 500;
	// The symbol a pill wears is a name for it: typing `~=` finds Not Equal.
	if (item.def.operator?.toLowerCase() === query) return 400;
	if (title.startsWith(query)) return 100;
	if (title.includes(query)) return 60;
	if (item.category.toLowerCase().includes(query)) return 30;
	if (item.def.id.toLowerCase().includes(query)) return 20;
	if (item.summary?.toLowerCase().includes(query)) return 10;
	return 0;
}

/**
 * One entry per variable, local, function and parameter the graph on screen can
 * reach. Built here rather than in the menu so the caller keeps control of what
 * a preset means.
 *
 * ## Why it takes the graph
 *
 * It used to list every local in the **file**, so searching `restore` in
 * `show`'s graph offered `Get restore` for a local that `hide` declares. Picking
 * it gives you a Get Local the compiler then refuses — and the search was the
 * thing that said it was available.
 *
 * Scoped with the same rule the Variables panel uses, from `functionGraph.ts`,
 * because two lists answering the same question in two places is two chances to
 * answer it differently and the second one was already wrong.
 *
 * **Variables and functions stay unscoped**, and that is not an oversight. A
 * script variable is readable from anywhere by construction, and the list of a
 * file's functions is how you move between them — a function you cannot call
 * from here is still one you may want a reference to.
 */
export function buildPresets(
	script: {
		variables: { id: string; name: string; type: string }[];
		nodes: Pick<GraphNode, "id" | "def" | "config" | "literals" | "label" | "graph">[];
	},
	graph: GraphId = null,
): Preset[] {
	const out: Preset[] = [];
	const hoisted = hoistedFunctions(script);

	for (const variable of script.variables) {
		const config = { variable: variable.id, name: variable.name, type: variable.type };
		const color = pinColor(variable.type, "data");
		out.push({
			key: `get:${variable.id}`,
			title: `Get ${variable.name}`,
			category: "Variables",
			summary: `Reads the ${variable.type} variable "${variable.name}".`,
			defId: "variable.get",
			config,
			color,
		});
		out.push({
			key: `set:${variable.id}`,
			title: `Set ${variable.name}`,
			category: "Variables",
			summary: `Assigns the ${variable.type} variable "${variable.name}".`,
			defId: "variable.set",
			config,
			color,
		});
	}

	// A local by its name, the same way a variable is — but only the ones this
	// graph can see, because a Get Local for any of the others is an error.
	for (const node of script.nodes) {
		if (node.def !== "local.declare") continue;
		if (!visibleFrom(node, graph, hoisted)) continue;
		const ref = localRefFor(node);
		out.push({
			key: `local:${node.id}`,
			title: `Get ${ref.name}`,
			category: "Variables",
			summary: `Reads the local "${ref.name}" wherever it is in scope.`,
			defId: "local.get",
			config: { ...ref },
			color: pinColor(ref.type, "data"),
		});
	}

	for (const node of script.nodes) {
		if (!FUNCTION_NODES.has(node.def)) continue;
		const name = (node.config as { name?: string } | undefined)?.name ?? "function";
		out.push({
			key: `fn:${node.id}`,
			title: `Get ${name}`,
			category: "Flow",
			summary: `A reference to the function "${name}".`,
			defId: "function.get",
			config: { function: node.id, name },
			color: pinColor("function", "data"),
		});
	}

	/**
	 * A parameter by its name, the same way a variable and a local are.
	 *
	 * Get Parameter was reachable only as a blank node you then pointed at a
	 * function and a parameter in the Inspector -- two steps and a panel, for
	 * something whose whole content is a name you already have in mind. Worse,
	 * a graph full of them looked like a graph missing its parameter wires, and
	 * the node that would have said otherwise was the one nobody found.
	 *
	 * Handlers are here as well as functions, because Connect binds its
	 * listener's parameters exactly as a declaration does and Get Parameter has
	 * always read either.
	 *
	 * Named for the owner as well when two of them share a parameter name,
	 * which they usually do: `character` belongs to three functions in a module
	 * of any size, and three identical entries is a list you cannot pick from.
	 */
	const owners = script.nodes.filter(
		(node) =>
			(FUNCTION_NODES.has(node.def) || node.def === "event.connect" || node.def === "event.once")
			// A parameter exists only where its body runs, so a function's are
			// offered in its own graph and a handler's where its Connect is drawn.
			&& paramsVisibleFrom(node, graph),
	);
	const counts = new Map<string, number>();
	for (const owner of owners) {
		for (const param of paramsOf(owner)) {
			counts.set(param.name, (counts.get(param.name) ?? 0) + 1);
		}
	}
	for (const owner of owners) {
		const ownerName = (owner.config as { name?: string } | undefined)?.name?.trim()
			|| (FUNCTION_NODES.has(owner.def) ? "function" : "handler");
		for (const param of paramsOf(owner)) {
			if (param.name.trim() === "") continue;
			const shared = (counts.get(param.name) ?? 0) > 1;
			out.push({
				key: `param:${owner.id}:${param.name}`,
				title: shared ? `Get ${param.name} (${ownerName})` : `Get ${param.name}`,
				category: "Flow",
				summary: `Reads the ${param.type ?? "any"} parameter "${param.name}" of ${ownerName}.`,
				defId: "function.getParam",
				config: { function: owner.id, param: param.name, type: param.type },
				color: pinColor(param.type ?? "any", "data"),
			});
		}
	}

	return out;
}

function paramsOf(node: Pick<GraphNode, "config">): { name: string; type?: string }[] {
	return (node.config as { params?: { name: string; type?: string }[] } | undefined)?.params ?? [];
}
