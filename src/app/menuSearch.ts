/**
 * What the node palette lists, and in what order.
 *
 * The data half of `NodeMenu.tsx`: every kind of entry the palette offers --
 * library nodes, the graph's own presets, service methods, Lune calls, names
 * of services and classes, members of a dragged value -- how a query scores
 * them, and how the matches are grouped under headings. No React, so all of it
 * can be tested without a page.
 *
 * Not what the menu draws or how it is driven: the keyboard, the filter chips
 * and the rows are the component's.
 */

import { aliasScore } from "../core/aliases.js";
import { categoryLabel } from "../core/categories.js";
import { bindsParameters } from "../core/functionBody.js";
import {
	type GraphId,
	hoistedFunctions,
	paramsVisibleFrom,
	visibleFrom,
} from "../core/functionGraph.js";
import { keywordNodes } from "../core/keywords.js";
import { luneMenuItems, lunePins } from "../core/luneCalls.js";
import { type MemberLookup, membersOfType } from "../core/members.js";
import { FUNCTION_NODES } from "../core/nodes/flow.js";
import { categories, type Registry, subcategories } from "../core/nodes/index.js";
import { classify, classifyFor, runtimeLabelFor } from "../core/nodes/runtimes.js";
import type { GraphNode, Literal, NodeConfig, NodeDef, PinDef, PinRef } from "../core/schema.js";
import { nameItems, serviceMenuItems, servicePins } from "../core/serviceCalls.js";
import { landingPins, localRefFor } from "./edits.js";
import { configText, functionNameOf, paramsOf } from "./nodeConfig.js";
import { nodeColor, pinColor } from "./palette.js";
import { MENU_FILTERS, type MenuFilter } from "./preferences.js";

/** The pin a menu was dragged off. See `MenuAnchor.from`. */
export interface WireFrom {
	ref: PinRef;
	side: "in" | "out";
	pin: PinDef;
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
}

/** Where the menu opens, and what it opens for. */
export interface MenuAnchor {
	/**
	 * Viewport position. The menu is `position: fixed`, so it must not be
	 * canvas-relative — that opens it a sidebar's width off.
	 */
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
	from?: WireFrom;
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
	/**
	 * This entry reads a member off the value the preset gives: `input.throttle`.
	 *
	 * Picking it places both nodes, wired — the getter and a Get Member on its
	 * output. Two nodes rather than one, because that is what the graph holds
	 * either way and the entry only saves the placing of them.
	 */
	member?: { name: string; type?: string };
	/**
	 * Offered while searching, not while browsing.
	 *
	 * A `BasePart` local has two hundred properties, and a menu opened to look
	 * around should not be two hundred entries of one local's members deep.
	 * They are what you find when you type, which is when you have something in
	 * mind to find.
	 */
	deep?: boolean;
}

/** One row of the palette. */
export interface MenuItem {
	key: string;
	title: string;
	category: string;
	/** Set only for the datatypes, which group one level deeper. */
	subcategory?: string;
	summary?: string;
	color: string;
	pure: boolean;
	/**
	 * What narrowing this item answers to: the runtime it needs, or `graph`
	 * when the item is not a library node at all but something this document
	 * declares — a variable, a local, a function, a parameter.
	 */
	runtime: MenuFilter;
	/**
	 * What the tag reads, when it is not simply the filter's own name.
	 *
	 * `Lune: @lune/roblox` for a Roblox datatype in a Lune graph: it answers to
	 * the Lune filter, and saying only "Lune" would suggest the runtime has it
	 * on its own. The module is the whole reason it is here.
	 */
	runtimeLabel?: string;
	def: NodeDef;
	config?: NodeConfig;
	/** See `Preset.member`: this entry places a getter and a Get Member on it. */
	member?: { name: string; type?: string };
	/** See `Preset.deep`: offered while searching rather than while browsing. */
	deep?: boolean;
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

/** A category's matches: a flat list, or the datatypes' groups. */
export interface MenuGroup {
	category: string;
	loose: MenuItem[];
	groups: { sub: string; items: MenuItem[] }[];
}

/**
 * The library's nodes this target can compile, after the graph's presets.
 *
 * Presets first within a category: a named thing beats the generic node it is
 * an instance of.
 */
export function libraryItems(
	registry: Registry,
	target: "roblox" | "lune",
	presets: Preset[],
): MenuItem[] {
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
			// The runtime the *graph* is in, so a borrowed datatype is tagged
			// as what it is here rather than averaged to Luau.
			runtime: classifyFor(def, target),
			runtimeLabel: runtimeLabelFor(def, target),
			def,
		}));

	const fromPresets = presets.flatMap((preset): MenuItem[] => {
		const def = registry.get(preset.defId);
		if (!def) return [];
		return [
			{
				key: preset.key,
				title: preset.title,
				category: preset.category,
				summary: preset.summary,
				color: preset.color,
				pure: def.pure === true,
				// A preset is a thing this graph declares -- a variable you named,
				// a local, a function, one of its parameters. Which runtime the
				// node behind it needs is not the interesting question about it:
				// it is as portable as the graph is.
				runtime: "graph",
				def,
				config: preset.config,
				member: preset.member,
				deep: preset.deep,
			},
		];
	});

	return [...fromPresets, ...fromDefs];
}

/**
 * The runtimes worth offering as filters, which is the ones actually present.
 *
 * A Lune graph has no Roblox nodes left to filter to, so offering the chip
 * would be offering an empty list — and a filter that can only disappoint is
 * worse than no filter.
 */
export function presentRuntimes(items: readonly MenuItem[]): MenuFilter[] {
	const seen = new Set(items.map((item) => item.runtime));
	return MENU_FILTERS.filter((r) => seen.has(r));
}

/**
 * The definitions that could receive a dragged wire, or null with no wire.
 *
 * Filtering rather than merely sorting, because a wire in flight is a question
 * with a much smaller set of answers than "which node" — offering Branch when
 * you dragged off a Vector3 output is offering something that cannot be
 * picked. A node qualifies if it declares *any* pin on the opposite side that
 * the wire would fit, using the same compatibility rule the canvas uses when
 * you drop on a pin directly, so the menu cannot offer a node the connection
 * would then refuse.
 *
 * Pins are read from the definition rather than resolved per instance, since
 * the node does not exist yet. For a node whose pins depend on its config that
 * is the shape it will arrive with, which is the right answer.
 */
export function reachableDefs(registry: Registry, from: WireFrom | undefined): Set<string> | null {
	if (!from) return null;
	const side = from.side === "out" ? "in" : "out";
	const ok = new Set<string>();
	for (const def of registry.values()) {
		const pins = side === "in" ? def.inputs : def.outputs;
		if (landingPins(def, pins, from.pin, side).length > 0) ok.add(def.id);
	}
	return ok;
}

/** The items a wire can reach, narrowed to one runtime when one is chosen. */
export function narrowItems(
	items: readonly MenuItem[],
	reachable: ReadonlySet<string> | null,
	runtime: MenuFilter | null,
): MenuItem[] {
	const byWire =
		reachable === null ? [...items] : items.filter((item) => reachable.has(item.def.id));
	return runtime === null ? byWire : byWire.filter((item) => item.runtime === runtime);
}

/**
 * Every method of every service, as an entry that configures one of the two
 * Service Function nodes.
 *
 * **Searched, never browsed.** Three hundred calls under a heading is a list
 * nobody scrolls, and it would bury the rest of the Engine category — so they
 * appear once you have typed something, and browsing shows the two nodes
 * themselves, which is where the picker lives.
 *
 * Off the service a wire was dragged from (`dragged`), that service's methods
 * are named by the method alone and grouped under the service.
 */
export function serviceItems(
	registry: Registry,
	target: "roblox" | "lune",
	dragged: string | undefined,
): MenuItem[] {
	// Roblox-only twice over: this guard, and the node each entry configures.
	if (target !== "roblox") return [];
	return serviceMenuItems().flatMap((entry): MenuItem[] => {
		const def = registry.get(entry.defId);
		if (!def) return [];
		const pure = def.pure === true;
		const own = entry.service === dragged;
		return [
			{
				runtime: classify(def),
				// Off a service's own pin the service is not news — it is what you
				// dragged — so the entries are the method names under a heading of
				// the service, which is how the Creator Hub lists them. Searched
				// from nowhere in particular, the service is half the name.
				key: `service:${entry.service}:${entry.method.name}`,
				title: own ? entry.method.name : `${entry.service}:${entry.method.name}`,
				category: own ? entry.service : "Engine",
				summary: entry.method.summary,
				color: nodeColor(def),
				pure,
				def,
				config: entry.config,
				pins: servicePins(entry.config, pure),
			},
		];
	});
}

/**
 * Lune's standard library, one row per function.
 *
 * The point of there being two nodes rather than sixty-one: the palette still
 * knows every name, so `readFile` finds `fs.readFile` and what the menu hands
 * over is a node already set to that call. Lune-only twice over, the way the
 * service entries are Roblox-only.
 */
export function luneItems(registry: Registry, target: "roblox" | "lune"): MenuItem[] {
	if (target !== "lune") return [];
	return luneMenuItems().flatMap((entry): MenuItem[] => {
		const def = registry.get(entry.def);
		if (!def) return [];
		const pure = def.pure === true;
		const config = { module: entry.module, call: entry.call };
		return [
			{
				runtime: classify(def),
				key: `lune:${entry.label}`,
				title: entry.label,
				category: "Lune",
				summary: entry.summary,
				color: nodeColor(def),
				pure,
				def,
				config,
				pins: lunePins(config, pure),
			},
		];
	});
}

/**
 * A service or a class by its own name.
 *
 * `ReplicatedStorage` is a thing somebody has in mind, and the node for it is
 * Get Service with that name filled in — so the name is what the entry is
 * called, and the node it makes is in the summary beside it. Searched rather
 * than browsed, like the service methods: six hundred classes under a heading
 * is not a list anybody reads.
 */
export function namedItems(registry: Registry, target: "roblox" | "lune"): MenuItem[] {
	if (target !== "roblox") return [];
	return nameItems().flatMap((entry): MenuItem[] => {
		const def = registry.get(entry.defId);
		if (!def) return [];
		return [
			{
				runtime: classify(def),
				key: `name:${entry.defId}:${entry.name}`,
				title: entry.name,
				category: entry.category,
				summary: entry.summary,
				color: nodeColor(def),
				pure: def.pure === true,
				def,
				literals: entry.literals,
			},
		];
	});
}

/**
 * The methods of the service a wire was dragged off, listed before anything
 * else and without a search.
 *
 * This is the one place a list of methods is browsable rather than searched:
 * narrowed to one service it is a dozen or two, it is what the gesture asked
 * for, and the alternative — dragging RunService out and being shown every
 * node in the library that takes an Instance — answers a question nobody put.
 */
export function draggedServiceItems(
	services: readonly MenuItem[],
	from: WireFrom | undefined,
): MenuItem[] {
	const service = from?.service;
	if (!service || from?.side !== "out") return [];
	return services.filter((item) => item.category === service);
}

/**
 * The members of what is being dragged, when the wire knows its type.
 *
 * Drag out of a `Part` and its properties are in the menu; drag out of a value
 * typed `Input` and its fields are. Each places a **Get Member** already wired
 * to the pin you dragged, which is the whole gesture — the alternative is
 * picking Get Member, then opening the Inspector, then picking the member
 * there, for something you had in mind before you started dragging.
 *
 * Listed while browsing as well as while searching, unlike the member entries
 * in the rest of the menu: a drag has already narrowed the question to one
 * value, so these are what that value holds.
 */
export function memberItems(lookup: MemberLookup | null, from: WireFrom | undefined): MenuItem[] {
	const def = lookup?.registry.get("value.member");
	if (!lookup || !from || from.side !== "out" || !def) return [];
	const type = from.pin.type;
	return membersOfType(lookup, type).map((field) => ({
		key: `member:${type}.${field.name}`,
		title: field.name,
		category: `${type} members`,
		summary: `Reads ${type}.${field.name}, which is a ${field.type}.`,
		color: pinColor(field.type, "data"),
		pure: true,
		runtime: "graph" as const,
		def,
		config: { member: field.name, type: field.type },
	}));
}

/** Everything a query is matched against. */
export interface MenuSources {
	/** Library nodes and presets, already narrowed by wire and runtime. */
	items: readonly MenuItem[];
	services: readonly MenuItem[];
	lune: readonly MenuItem[];
	names: readonly MenuItem[];
	draggedService: readonly MenuItem[];
	draggedMembers: readonly MenuItem[];
}

/**
 * The entries a query matches, best first; or, with no query, what browsing
 * shows: everything but the members, which are found by name rather than
 * scrolled past (see `Preset.deep`).
 */
export function searchMenu(
	query: string,
	sources: MenuSources,
	from: WireFrom | undefined,
): MenuItem[] {
	const { items, services, lune, names, draggedService, draggedMembers } = sources;
	const q = query.trim().toLowerCase();
	if (!q) return [...draggedMembers, ...draggedService, ...items.filter((item) => !item.deep)];

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
		...draggedMembers,
		...draggedService,
		...items,
		...services.filter((item) => !dragged.has(item.key) && reach(item)),
		...lune.filter(reach),
		...names.filter(reach),
	];

	return searchable
		.map((item) => ({ item, score: score(item, q) }))
		.filter((x) => x.score > 0)
		.sort((a, b) => b.score - a.score)
		.map((x) => x.item);
}

/**
 * Matches under their categories, each a flat list or a list of datatype
 * groups.
 *
 * Nested rather than flattened into "Engine Types · Vector3" headings, because
 * the point of the grouping is that Vector3 and Color3 are *inside* one thing
 * rather than beside eleven others.
 *
 * Browsing keeps the library's own order; searching puts the best match first.
 * `matches` is sorted by score, so a category's first appearance in it is that
 * category's best hit — which makes this a stable sort by best hit and keeps
 * each category's own items in score order underneath. Without it, a Flow node
 * matched on a word in its summary was drawn above the Logic pill the query
 * named outright.
 *
 * The service a wire was dragged off goes first: it is the answer to the
 * gesture, and everything under it is what else the graph could do with that
 * wire.
 */
export function groupMenu(
	matches: readonly MenuItem[],
	{ registry, searching, service }: { registry: Registry; searching: boolean; service?: string },
): MenuGroup[] {
	const byCategory = new Map<string, MenuItem[]>();
	for (const item of matches) {
		const list = byCategory.get(item.category);
		if (list) list.push(item);
		else byCategory.set(item.category, [item]);
	}
	const seen = [...new Set(matches.map((item) => item.category))];
	const order = searching ? seen : categories(registry).filter((c) => byCategory.has(c));
	const extra = [...byCategory.keys()].filter((c) => !order.includes(c)).sort();
	const lead = service && byCategory.has(service) ? [service] : [];
	const rest = [...order, ...extra].filter((c) => !lead.includes(c));

	return [...lead, ...rest].map((category) => {
		// Every category in the order came from `byCategory`, so it has a list.
		const all = byCategory.get(category) ?? [];
		const subs = subcategories(registry, category);
		if (subs.length === 0) return { category, loose: all, groups: [] };

		// An item in a subcategorised category that names no subcategory is not
		// an error — nothing built-in does it, but a pack might — so it is drawn
		// straight under the category heading rather than dropped.
		const loose = all.filter((item) => !item.subcategory);
		const groups = subs
			.map((sub) => ({ sub, items: all.filter((item) => item.subcategory === sub) }))
			.filter((g) => g.items.length > 0);
		return { category, loose, groups };
	});
}

/** The rows in the order the eye reads them, for the arrow keys. */
export function flattenGroups(groups: readonly MenuGroup[]): MenuItem[] {
	return groups.flatMap((g) => [...g.loose, ...g.groups.flatMap((sub) => sub.items)]);
}

/**
 * How well an entry answers a query: prefix matches on the title beat
 * substring matches, which beat the id — with two things ahead of all of it.
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
	// The library node only: a preset's title is a name somebody chose.
	const alias = item.title === item.def.title ? aliasScore(item.def.id, query) : 0;
	if (alias === 450) return alias;
	// The symbol a pill wears is a name for it: typing `~=` finds Not Equal.
	if (item.def.operator?.toLowerCase() === query) return 400;
	if (title.startsWith(query)) return 100;
	if (alias > 0) return alias;
	if (title.includes(query)) return 60;
	// The label as well as the key: the heading says "Roblox" and typing what
	// you can see should find what is under it.
	if (categoryLabel(item.category).toLowerCase().includes(query)) return 30;
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
 * Listing every local in the **file** would offer, in `show`'s graph, `Get
 * restore` for a local that `hide` declares — a Get Local the compiler then
 * refuses, offered by the search that said it was available.
 *
 * Scoped with the same rule the Variables panel uses, from `functionGraph.ts`,
 * because two lists answering the same question in two places is two chances to
 * answer it differently.
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
		const name = configText(node, "name") ?? "function";
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

	out.push(...parameterPresets(script.nodes, graph));
	return out;
}

/**
 * A parameter by its name, the same way a variable and a local are.
 *
 * Get Parameter on its own is a blank node you then point at a function and a
 * parameter in the Inspector -- two steps and a panel, for something whose
 * whole content is a name you already have in mind.
 *
 * Handlers are here as well as functions, because Connect binds its listener's
 * parameters exactly as a declaration does and Get Parameter reads either.
 *
 * Named for the owner as well when two of them share a parameter name, which
 * they usually do: `character` belongs to three functions in a module of any
 * size, and three identical entries is a list you cannot pick from.
 */
function parameterPresets(
	nodes: Pick<GraphNode, "id" | "def" | "config" | "graph">[],
	graph: GraphId,
): Preset[] {
	const owners = nodes.filter(
		(node) =>
			bindsParameters(node.def) &&
			// A parameter exists only where its body runs, so a function's are
			// offered in its own graph and a handler's where its Connect is drawn.
			paramsVisibleFrom(node, graph),
	);
	const counts = new Map<string, number>();
	for (const owner of owners) {
		for (const param of paramsOf(owner)) {
			counts.set(param.name, (counts.get(param.name) ?? 0) + 1);
		}
	}
	const out: Preset[] = [];
	for (const owner of owners) {
		const ownerName = FUNCTION_NODES.has(owner.def)
			? functionNameOf(owner)
			: configText(owner, "name")?.trim() || "handler";
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
