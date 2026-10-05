/**
 * What the graph's keys and buttons do: placing nodes and comments, pasting,
 * aligning, deleting, promoting a pin to a variable, splitting a pin, and the
 * keyboard map that reaches them.
 */

import type React from "react";
import { useCallback, useEffect, useMemo } from "react";

import { ENTRY_HOME, mergeLayout, viewOf, withFunctionGraphs } from "../core/functionGraph.js";
import { type Registry, resolveNodePins } from "../core/nodes/index.js";
import { canShowName } from "../core/operatorLayout.js";
import type { Literal, NodeDef } from "../core/schema.js";
import { SERVICE_CALL, SERVICE_VALUE } from "../core/serviceCalls.js";
import type { ProjectInfo } from "./api.js";
import type { MapDocument } from "./centreDocument.js";
import {
	addComment,
	addNode,
	alignToAnchor,
	type Clipping,
	connect,
	copySelection,
	deleteSelection,
	insertIntoChain,
	landingPins,
	pasteClipping,
	promoteToVariable,
	recombinePin,
	selectionAnchor,
	setLiteral,
	setConfig as setNodeConfig,
	splitCost,
	splitPin,
	splitValueWarning,
	withCommentContents,
} from "./edits.js";
import { screenToWorld } from "./geometry.js";
import { isEditableTarget } from "./keys.js";
import { NODE } from "./layers.js";
import { autoLayout } from "./layout.js";
import { memberPresets } from "./memberPresets.js";
import { callPresets, type WireFrom } from "./menuSearch.js";
import { buildPresets, type MenuAnchor } from "./NodeMenu.jsx";
import { configEntries, configText } from "./nodeConfig.js";
import type { PinMenuTarget } from "./PinMenu.jsx";
import type { Preferences } from "./preferences.js";
import { requiredModules, useProjectFunctions, useProjectTypes } from "./projectTypes.js";
import type { SourceDoc } from "./SourceView.jsx";
import { boundsOf } from "./selectionBounds.js";
import { type EditorState, store } from "./store.js";
import type { Dialogs } from "./useDialogs.js";
import type { LayoutPrefs } from "./useLayoutPrefs.js";

/** The two nodes whose first data pin is the service the call is made on. */
const SERVICE_NODES = new Set([SERVICE_CALL, SERVICE_VALUE]);

/** What the commands need from the editor around them. */
export interface GraphCommandsContext {
	editor: EditorState;
	project: ProjectInfo | null;
	registry: Registry;
	prefs: Preferences;
	updatePrefs: LayoutPrefs["updatePrefs"];
	ask: Dialogs["ask"];
	dialogOpen: Dialogs["dialogOpen"];
	/** A graph fragment, in memory rather than the system clipboard: a fragment is not text. */
	clipboard: React.MutableRefObject<Clipping | null>;
	setHasClip: React.Dispatch<React.SetStateAction<boolean>>;
	/** Where the pointer last was over the canvas, in world coordinates. */
	pointerAt: React.MutableRefObject<{ x: number; y: number } | null>;
	menu: MenuAnchor | null;
	setMenu: React.Dispatch<React.SetStateAction<MenuAnchor | null>>;
	setPreviewOpen: React.Dispatch<React.SetStateAction<boolean>>;
	setDocsJump: React.Dispatch<React.SetStateAction<boolean>>;
	compiling: boolean;
	runCompile: (path: string | undefined, write: boolean, force?: boolean) => Promise<void>;
	runCompileMap: (path: string | undefined, force?: boolean) => Promise<void>;
	source: SourceDoc | null;
	mapDoc: MapDocument | null;
}

export function useGraphCommands(context: GraphCommandsContext) {
	const {
		editor,
		project,
		registry,
		prefs,
		updatePrefs,
		ask,
		dialogOpen,
		clipboard,
		setHasClip,
		pointerAt,
		menu,
		setMenu,
		setPreviewOpen,
		setDocsJump,
		compiling,
		runCompile,
		runCompileMap,
		source,
		mapDoc,
	} = context;
	const alignExec = prefs.alignExec;
	// Laying out has to use the width the canvas is drawing, or columns spaced
	// by the fixed width overlap the wider nodes sitting in them.
	const wideNodes = prefs.wideNodes;

	// One palette entry per variable, local, function and parameter the graph on
	// screen can reach, so "Get health" is searchable by name rather than by node
	// type — and so nothing is offered that would not compile where it lands.
	const projectTypes = useProjectTypes();
	const projectFunctions = useProjectFunctions();
	const presets = useMemo(() => {
		if (!editor.script) return [];
		const base = buildPresets(editor.script, editor.graph);
		return [
			...base,
			...callPresets(editor.script, requiredModules(editor.script, projectFunctions)),
			...memberPresets(base, editor.script, registry, projectTypes),
		];
	}, [editor.script, editor.graph, registry, projectTypes, projectFunctions]);

	/**
	 * Pastes a clipping where the pointer is.
	 *
	 * Both Ctrl+V and Ctrl+D come here, because they are the same act with a
	 * different source, and a duplicate landing beside its original has the same
	 * problem a paste did: a copied **comment** is drawn over the nodes it was
	 * copied from, and membership is geometric, so dragging it afterwards takes
	 * the originals along with the copies.
	 *
	 * The pointer is only a landing point while it is over the canvas. A
	 * keystroke pressed with the mouse in a panel, or off the window entirely,
	 * falls back to the old offset — which is still a sensible answer, and is
	 * what a graph pasted from the keyboard alone has always done.
	 */
	const paste = useCallback((clip: Clipping) => {
		const at = pointerAt.current ?? undefined;
		store.edit((s) => {
			const { script, ids } = pasteClipping(s, clip, { at });
			queueMicrotask(() => store.select(ids));
			return script;
		});
	}, []);

	/**
	 * Places a node, and — when the menu was opened by dragging a wire off a pin
	 * — joins it up.
	 *
	 * The pin chosen is the **first** compatible one in declaration order, which
	 * is not a heuristic so much as the node author's own answer: pins are
	 * declared in the order they matter, so the first that fits is the one the
	 * node is mostly about. It is also what someone who knows node graphs will
	 * expect, and picking differently would mean a wire that lands somewhere
	 * surprising and has to be redone.
	 *
	 * A node with nothing compatible still gets placed. The menu narrows itself
	 * to nodes that can take the wire, so this is only reachable for a pack node
	 * whose derived pins disagree with its declared ones — and placing it
	 * unconnected is better than refusing a pick with no explanation.
	 */
	const spawn = useCallback(
		(
			def: NodeDef,
			world: { x: number; y: number },
			config?: Record<string, unknown>,
			literals?: Record<string, Literal>,
			/**
			 * An entry like `input.throttle`: this node, and a Get Member on its
			 * output, wired. Both are placed because both are what the graph
			 * holds — the entry saves the placing, not the nodes.
			 */
			member?: { name: string; type?: string },
			/** The wire to land, when it is not the menu's: the visual picker's. */
			wire?: WireFrom,
		) => {
			const from = wire ?? menu?.from;
			// A hoisted Function is in no flow, so it goes straight into a graph of
			// its own, and that graph opens.
			const hoisted = def.id === "function.entry";
			const { path, graph: graphNow } = store.getSnapshot();
			store.edit((s) => {
				const at = hoisted ? ENTRY_HOME : world;
				const added = addNode(s, def, at.x, at.y);
				queueMicrotask(() => {
					if (hoisted && path) store.openFunction(path, added.id);
					store.select([added.id]);
				});
				/**
				 * An operator pill starts bracketed when Settings says so.
				 *
				 * Written onto the node rather than read from preferences at
				 * compile time, because the brackets are part of the file every
				 * developer on the project reads. A preference that silently
				 * reshaped everyone else's generated Luau would be the wrong kind
				 * of personal setting.
				 */
				/**
				 * A new pill starts as Settings says, and then the node carries it.
				 *
				 * Both of these are written onto the node rather than read at draw
				 * time, because both are part of what everybody else sees: the
				 * brackets reach the generated file, and the cast's label sets the
				 * pill's width.
				 */
				const starting: Record<string, unknown> = {};
				if (def.display === "operator" && prefs.logicParens && !canShowName(def.id)) {
					starting.parens = true;
				}
				if (canShowName(def.id) && prefs.castNames) starting.castLabel = "name";
				if (def.id === "string.concat" && prefs.concatInterpolate) starting.interpolate = true;
				/**
				 * A Return arrives with the pins its function returns.
				 *
				 * Editing a signature already reaches every Return inside it —
				 * see `syncFunctionReturns` — but a Return placed *after* the
				 * signature was written arrived bare, with nothing to wire the
				 * values into, and the way to fix it was to retype the returns
				 * on the function so the sync ran. The graph on screen is the
				 * function it belongs to, so it can simply be asked.
				 */
				if (def.id === "function.return" && graphNow !== null) {
					const owner = s.nodes.find((n) => n.id === graphNow);
					const returns = configEntries(owner, "returns");
					if (returns.length > 0) starting.returns = returns;
				}
				const withDefaults = Object.keys(starting).length > 0 ? { ...starting, ...config } : config;
				let next = withDefaults
					? setNodeConfig(added.script, added.id, withDefaults)
					: added.script;
				// A menu entry that named a service or a class fills the pin in,
				// which is the whole of what picking it saves you.
				for (const [pin, value] of Object.entries(literals ?? {})) {
					next = setLiteral(next, added.id, pin, value);
				}
				/**
				 * The Get Member half of a `name.member` entry.
				 *
				 * To the right of the getter by one node's width, wired to its
				 * first data output — which is the only output any of these
				 * getters has. The member is selected rather than the getter:
				 * it is the node the entry was about, and the one whose
				 * Inspector says which member it reads.
				 */
				if (member) {
					const reader = registry.get("value.member");
					const source = next.nodes.find((n) => n.id === added.id);
					const out =
						reader && source
							? resolveNodePins(def, source.config, source.literals).outputs.find(
									(p) => p.kind === "data",
								)
							: undefined;
					if (reader && out) {
						const placedMember = addNode(next, reader, at.x + NODE.width + 40, at.y);
						next = setNodeConfig(placedMember.script, placedMember.id, {
							member: member.name,
							type: member.type,
						});
						next = connect(
							next,
							registry,
							{ node: added.id, pin: out.id },
							{ node: placedMember.id, pin: "object" },
						);
						queueMicrotask(() => store.select([placedMember.id]));
					}
				}

				if (!from || hoisted) return next;

				const placed = next.nodes.find((n) => n.id === added.id);
				const pins = placed
					? resolveNodePins(def, placed.config, placed.literals)
					: { inputs: [], outputs: [] };
				const side = from.side === "out" ? "in" : "out";
				let candidates = side === "in" ? pins.inputs : pins.outputs;
				/**
				 * A Service Function's receiver pin takes the wire only when the
				 * wire *is* that service.
				 *
				 * It is typed `Instance`, because that is what Get Service gives
				 * back, and it is declared first — so without this, dragging a
				 * Part out and picking Debris:AddItem would wire the part in as
				 * the service and leave Item empty. The pin exists for one
				 * gesture; every other drag should land where it always did.
				 */
				const wanted = configText({ config }, "service");
				if (SERVICE_NODES.has(def.id) && from.service !== wanted) {
					candidates = candidates.filter((pin) => pin.id !== "service");
				}
				const landing = landingPins(def, candidates, from.pin, side)[0];
				if (!landing) return next;

				const target = { node: added.id, pin: landing.id };
				// Off an execution output that already led somewhere, the new node
				// goes in between rather than taking the wire and dropping the rest
				// of the chain. See `insertIntoChain`.
				if (from.side === "out" && from.pin.kind === "exec" && landing.kind === "exec") {
					return insertIntoChain(next, registry, from.ref, target);
				}
				next =
					from.side === "out"
						? connect(next, registry, from.ref, target)
						: connect(next, registry, target, from.ref);
				return next;
			});
			setMenu(null);
		},
		[menu, registry, prefs.logicParens, prefs.castNames, prefs.concatInterpolate],
	);

	const spawnComment = useCallback(
		(world: { x: number; y: number }) => {
			const { selection: selected, graph } = store.getSnapshot();
			store.edit((s) => {
				// Wrapping a selection is the common case, so a comment created with
				// nodes selected sizes itself to enclose them. With nothing selected
				// it is a plain box at the point given: a comment is a note on the
				// canvas, and one about nothing in particular — a heading, a reminder,
				// a space left for work not done yet — is a fair thing to write.
				//
				// Measured in the graph on screen. A Declare Function is drawn in two
				// graphs at two positions, and the whole script only holds the outer
				// one — so a comment around it inside its own graph went to where it
				// sits in the other.
				const box = boundsOf(viewOf(s, graph), selected, registry);
				const rect = box
					? { x: box.x - 24, y: box.y - 52, w: box.w + 48, h: box.h + 76 }
					: { x: world.x, y: world.y, w: 320, h: 200 };
				const { script, id } = addComment(s, rect);
				queueMicrotask(() => store.select([id]));
				return script;
			});
			setMenu(null);
		},
		[registry],
	);

	/**
	 * Tidies the graph into ranked columns. Acts on the selection when there is
	 * more than one node in it, so a corner can be straightened without moving
	 * everything else.
	 */
	const realign = useCallback(() => {
		const state = store.getSnapshot();
		if (!state.script) return;
		// The graph on screen, and only that: laying out the whole file would
		// arrange every function's nodes around each other.
		const graph = state.graph;
		const view = viewOf(state.script, graph);
		const selected = new Set(
			[...state.selection].filter((id) => view.nodes.some((n) => n.id === id)),
		);
		const only = selected.size > 1 ? selected : undefined;
		store.edit((s) =>
			mergeLayout(s, graph, autoLayout(viewOf(s, graph), registry, { only, alignExec, wideNodes })),
		);
	}, [registry, alignExec, wideNodes]);

	/**
	 * Deletes a selection, asking first when a function in it takes its graph
	 * along — nodes that are not on screen. A delete that only ever removes what
	 * you can see needs no question.
	 */
	const removeSelection = useCallback(
		async (ids: ReadonlySet<string>) => {
			const script = store.getSnapshot().script;
			if (!script || ids.size === 0) return;
			const inside = [...withFunctionGraphs(script, ids)].filter(
				(id) => !ids.has(id) && script.nodes.some((n) => n.id === id),
			).length;
			if (inside > 0) {
				const ok = await ask({
					kind: "confirm",
					title: "Delete the function's graph too?",
					message: `${inside} node${inside === 1 ? " is" : "s are"} inside it, and go${inside === 1 ? "es" : ""} with it.`,
					confirmLabel: "Delete",
					danger: true,
				});
				if (ok !== true) return;
			}
			store.edit((s) => deleteSelection(s, ids, registry));
		},
		[ask, registry],
	);

	/**
	 * Turns a pin's typed-in value into a script variable, then selects the
	 * getter it made — the next thing you do is almost always to that getter,
	 * and leaving the selection on the node behind it means going to find it.
	 */
	const promotePin = useCallback(
		(pin: PinMenuTarget) => {
			const state = store.getSnapshot();
			if (!state.script) return;
			const result = promoteToVariable(state.script, registry, pin.nodeId, pin.pin);
			if (!result) return;
			store.edit(() => result.script);
			store.select([result.node]);
		},
		[registry],
	);

	/**
	 * Breaks a struct pin into components, or puts one back.
	 *
	 * Either direction can strand wires — there is nowhere for them to land on
	 * the other side of the change. The simple thing is to drop them without
	 * asking; here more than one gets a confirmation, because a graph you cannot
	 * see all at once should not lose wiring silently.
	 */
	const splitOrRecombine = useCallback(
		async (target: PinMenuTarget, parent: string | undefined, mode: string | undefined) => {
			const state = store.getSnapshot();
			if (!state.script) return;

			const pinId = parent ?? target.pin.id;
			const stranded = splitCost(state.script, registry, target.nodeId, target.side, pinId);
			if (stranded > 1) {
				const ok = await ask({
					kind: "confirm",
					title: mode ? "Split this pin?" : "Recombine this pin?",
					message:
						`${stranded} wires are attached and cannot follow the change. ` +
						"They will be disconnected; the values typed into the pins are kept.",
					confirmLabel: mode ? "Split" : "Recombine",
				});
				if (ok !== true) return;
			}

			// Splitting is meant to change how a value is shown, never what it
			// is. When the value cannot be taken apart, that promise breaks —
			// so say so first rather than letting the graph quietly compile to
			// something else.
			const lost =
				mode !== undefined
					? splitValueWarning(state.script, registry, target.nodeId, target.side, pinId, mode)
					: null;
			if (lost !== null) {
				const ok = await ask({
					kind: "confirm",
					title: "This value cannot be split",
					message:
						`"${target.pin.name || pinId}" holds ${lost}, which Roswaal cannot take apart. ` +
						"The components would start at their defaults, so the script would compile " +
						"differently. Wire a node in instead, or split anyway and set the components " +
						"by hand.",
					confirmLabel: "Split anyway",
					danger: true,
				});
				if (ok !== true) return;
			}

			store.edit((s) =>
				mode !== undefined
					? splitPin(s, registry, target.nodeId, target.side, pinId, mode)
					: recombinePin(s, registry, target.nodeId, target.side, pinId),
			);
		},
		[registry, ask],
	);

	const toggleAlignExec = useCallback(() => {
		updatePrefs({ alignExec: !alignExec });
	}, [alignExec, updatePrefs]);

	/**
	 * The graph is read-only because it is being compiled.
	 *
	 * Only outside Dynamic. On Dynamic a compile follows every autosave, so
	 * locking on one would lock the canvas roughly whenever you stopped typing —
	 * the mode exists precisely so that compiling is not a thing you think about.
	 * Outside it a compile is something you asked for and then wait for, and an
	 * edit made during the walk lands in the written file or does not, depending
	 * on where the walk had got to. That file then disagrees with the graph and
	 * nothing says so.
	 */
	const locked = compiling && project?.config.compileMode !== "hot";

	// The policy is decided here, because the compile mode is; the refusal
	// happens in the store, because that is the one place every edit goes
	// through. Disabling the controls below is the courtesy on top of it.
	useEffect(() => {
		store.setLocked(locked);
	}, [locked]);

	// -- keyboard ----------------------------------------------------------

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			// A dialog is a question about the graph; nothing changes it meanwhile.
			if (isEditableTarget(e.target) || dialogOpen.current) return;
			const mod = e.ctrlKey || e.metaKey;

			// Selecting and copying are reading. Everything else below changes
			// the graph, and while it is locked none of it may.
			// Selecting, copying and previewing are reading. Everything else below
			// changes the graph, and while it is locked none of it may.
			const reading =
				(mod && (e.key.toLowerCase() === "a" || e.key.toLowerCase() === "c")) ||
				e.key.toLowerCase() === "p";
			if (locked && !reading) return;

			if (mod && e.key.toLowerCase() === "z") {
				e.preventDefault();
				if (e.shiftKey) store.redo();
				else store.undo();
				return;
			}
			if (mod && e.key.toLowerCase() === "y") {
				e.preventDefault();
				store.redo();
				return;
			}
			// Compiles what is on screen. A node map open over a graph tab used to
			// compile the graph behind it, which is not what its button says.
			if (mod && e.key.toLowerCase() === "s") {
				e.preventDefault();
				if (mapDoc) void runCompileMap(mapDoc.path);
				else if (!source && editor.path) void runCompile(editor.path, true);
				return;
			}
			// The documentation, from wherever you are in the editor. It opens the
			// docs window on the page you pick, which is the same window the
			// toolbar's button opens and the same search it has.
			if (mod && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setDocsJump(true);
				return;
			}
			if (mod && e.shiftKey && e.key.toLowerCase() === "l") {
				e.preventDefault();
				realign();
				return;
			}
			if (mod && e.key.toLowerCase() === "a") {
				e.preventDefault();
				const state = store.getSnapshot();
				// Everything in the graph on screen. Selecting nodes you cannot see
				// is how the next Delete removes them.
				if (state.script) {
					const s = viewOf(state.script, state.graph);
					store.select([...s.nodes.map((n) => n.id), ...s.comments.map((c) => c.id)]);
				}
				return;
			}
			if (mod && (e.key.toLowerCase() === "c" || e.key.toLowerCase() === "x")) {
				const state = store.getSnapshot();
				if (!state.script || state.selection.size === 0) return;
				e.preventDefault();
				clipboard.current = copySelection(state.script, state.selection, registry);
				setHasClip(true);
				/**
				 * Cut takes away exactly what it took a copy of.
				 *
				 * A comment carries what it encloses, so cutting one and cutting
				 * only its box would leave the nodes behind and the paste would
				 * be a second set of them. Delete is deliberately not changed:
				 * removing a comment has always meant removing the note, and a
				 * key that quietly took eleven nodes with it is not a key anybody
				 * should have to find out about.
				 */
				if (e.key.toLowerCase() === "x") {
					void removeSelection(withCommentContents(state.script, state.selection, registry));
				}
				return;
			}
			if (mod && e.key.toLowerCase() === "v") {
				const clip = clipboard.current;
				if (!clip) return;
				e.preventDefault();
				paste(clip);
				return;
			}
			if (mod && e.key.toLowerCase() === "d") {
				const state = store.getSnapshot();
				if (!state.script || state.selection.size === 0) return;
				e.preventDefault();
				paste(copySelection(state.script, state.selection, registry));
				return;
			}
			if (e.key === "Delete" || e.key === "Backspace") {
				e.preventDefault();
				void removeSelection(store.getSnapshot().selection);
				return;
			}
			// Two or more, because one node is already aligned with itself.
			if (e.key.toLowerCase() === "a" && !mod && store.getSnapshot().selection.size > 1) {
				const state = store.getSnapshot();
				const script = state.script;
				if (!script) return;
				const anchor = selectionAnchor(script, state.selection);
				if (!anchor) return;
				e.preventDefault();
				const ids = state.selection;
				const graph = state.graph;
				store.edit((s) =>
					mergeLayout(s, graph, alignToAnchor(viewOf(s, graph), registry, ids, anchor)),
				);
				return;
			}
			if (e.key.toLowerCase() === "c" && !mod) {
				e.preventDefault();
				/**
				 * Where the canvas is looking, rather than world origin.
				 *
				 * With a selection the point is ignored — the comment sizes
				 * itself around what is selected. Without one it is the whole
				 * answer, and `(0, 0)` would drop the comment at the world's
				 * origin, which is usually nowhere near the screen. The view's
				 * offset and zoom say where its top-left corner is without
				 * anyone needing to know how big the canvas is.
				 */
				const inset = 64;
				spawnComment(screenToWorld(store.getView(), inset, inset));
			}
			// Unmodified. With a selection it picks out what those nodes produced;
			// with nothing picked it is the whole script.
			if (e.key.toLowerCase() === "p" && !mod && store.getSnapshot().script) {
				e.preventDefault();
				setPreviewOpen(true);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [
		editor.path,
		mapDoc,
		source,
		runCompile,
		runCompileMap,
		spawnComment,
		realign,
		removeSelection,
		locked,
		registry,
		paste,
	]);

	return {
		locked,
		presets,
		promotePin,
		realign,
		spawn,
		spawnComment,
		splitOrRecombine,
		toggleAlignExec,
	};
}
