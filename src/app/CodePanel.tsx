/**
 * The Code panel: the Luau a graph holds -- a Code Block, a Luau Expression,
 * a type written out -- in a panel of the workspace, a tab per field.
 *
 * Until 0.155.0 this was a dialog over everything, one field at a time, and
 * while it was open nothing else could be reached: not the tree, not
 * Variables, not the Inspector. As a panel it sits along the foot of the
 * graph by default and moves like any other card, the rest of the editor
 * stays to hand, and a variable or a service drags straight into the code.
 *
 * ## What is typed is applied as it is typed
 *
 * There is no Done. A pause in typing applies the text to the node, as one
 * step of the graph's undo, and so does leaving the editor -- clicking the
 * graph, another tab, anything. Ctrl+Z inside the code is the code's own undo,
 * a keystroke at a time.
 *
 * The text in the editor is the truth while it has changes the graph has not
 * seen. A graph that is compiling refuses edits, so a change made then is
 * applied once it stops, rather than lost; and the graph's own value is only
 * written back over the editor when it changes for another reason -- an undo
 * in the graph -- never because it is still catching up with the typing.
 */

import type { Completion } from "@codemirror/autocomplete";
import { Annotation, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { checkLuau, type LuauFragment } from "../core/luau/check.js";
import type { ModuleInfo } from "../core/luau/hover.js";
import type { TableMember } from "../core/luau/infer.js";
import {
	type InstanceNode,
	indexFromOutline,
	instanceLocalsAt,
	instanceProblems,
} from "../core/luau/instances.js";
import { nodeTitle, type Registry, resolveNodePins } from "../core/nodes/index.js";
import type { GraphNode, NodeScript } from "../core/schema.js";
import { api } from "./api.js";
import { PanelHead } from "./Cards.jsx";
import { cx } from "./cx.js";
import { Icon } from "./icons.jsx";
import { instanceDrop } from "./instanceDrop.js";
import {
	graphInstanceLocals,
	graphLocalTypes,
	graphTableMembers,
	luauCompletionSource,
	precedingLocals,
	scopeCompletions,
} from "./luauCompletions.js";
import { luauExtensions } from "./luauExtensions.js";
import { nameDrop } from "./nameDrop.js";
import { configText, functionNameOf } from "./nodeConfig.js";

/**
 * One field open in the panel: a pin's code, or -- with `field` -- a Declare
 * Type's definition written out in Luau.
 */
export interface CodeTab {
	/** `node/pin` or `node:field`: one tab per field, however often it is opened. */
	key: string;
	nodeId: string;
	/** The pin whose literal is the code. */
	pin?: string;
	/** A config field to write to, rather than a pin's literal. */
	field?: "definition";
	/** What the text must parse as. Worked out from the node when absent. */
	kind?: LuauFragment;
}

/** The key a field's tab is found by. */
export function codeTabKey(nodeId: string, pin?: string, field?: string): string {
	return field ? `${nodeId}:${field}` : `${nodeId}/${pin ?? ""}`;
}

/**
 * The text a tab edits, as the graph holds it now, or undefined when the node
 * or its pin has gone -- deleted, or undone away -- and the tab with it.
 */
export function codeValue(
	script: NodeScript | null,
	registry: Registry,
	tab: CodeTab,
): string | undefined {
	const node = script?.nodes.find((n) => n.id === tab.nodeId);
	if (!node) return undefined;
	if (tab.field) return configText(node, tab.field) ?? "";
	const literal = node.literals?.[tab.pin ?? ""];
	if (literal && (literal.t === "raw" || literal.t === "string")) return literal.v;
	const def = registry.get(node.def);
	if (!def) return undefined;
	const pin = resolveNodePins(def, node.config, node.literals).inputs.find((p) => p.id === tab.pin);
	if (!pin) return undefined;
	return pin.default && (pin.default.t === "raw" || pin.default.t === "string")
		? pin.default.v
		: "";
}

/** What a tab edits, which its mark says: statements, one value, or a type. */
export type CodeKind = LuauFragment;

/**
 * The mark before a tab's name, so the kind of code reads before the words
 * do: braces for a Code Block's statements, ƒx -- a value worked out, as a
 * formula bar has it -- for a Luau Expression, and <T>, a type parameter as
 * Luau writes one, for a type written out.
 */
export const CODE_MARKS: Record<string, { mark: string; name: string }> = {
	block: { mark: "{ }", name: "Code Block" },
	expression: { mark: "ƒx", name: "Luau Expression" },
	type: { mark: "<T>", name: "Type" },
};

/** A tab's mark. The type's brackets are drawn quieter than its T. */
function CodeMark({ kind }: { kind: CodeKind }) {
	return (
		<span className={cx("code-mark", `code-mark-${kind}`)} aria-hidden="true">
			{kind === "type" ? (
				<>
					<span className="code-mark-angle">{"<"}</span>T
					<span className="code-mark-angle">{">"}</span>
				</>
			) : (
				CODE_MARKS[kind]?.mark
			)}
		</span>
	);
}

/**
 * What a tab is called: its kind, the node's own label if it has one, and
 * the graph it is in.
 */
export function codeTabLabel(
	script: NodeScript | null,
	registry: Registry,
	tab: CodeTab,
): { kind: CodeKind; title: string; label?: string; where: string } {
	const node = script?.nodes.find((n) => n.id === tab.nodeId);
	const kind = tab.field ? "type" : kindOf(node, tab);
	if (!script || !node) return { kind, title: "Gone", where: "" };
	const title = tab.field
		? `type ${configText(node, "name")?.trim() || "Name"}`
		: nodeTitle(registry.get(node.def), node);
	// A label somebody gave the node, or a type's name: words the mark cannot
	// say. Not "type" again in front of a type's -- the mark says that.
	const label = tab.field
		? configText(node, "name")?.trim() || "Name"
		: node.label?.trim() || undefined;
	const owner = node.graph ? script.nodes.find((n) => n.id === node.graph) : undefined;
	return {
		kind,
		title,
		...(label ? { label } : {}),
		where: owner ? functionNameOf(owner) : script.name,
	};
}

/** What a tab shows: its mark, then its name, then what tells it apart. */
export interface CodeTabName {
	kind: CodeKind;
	/** The node's label, or the graph's name when the node has none. */
	name: string;
	/** The graph's name beside a label, or a first line between two that match. */
	detail?: string;
	/** Everything, for the tooltip and a screen reader. */
	full: string;
}

/**
 * Every tab's name. A node nobody has labelled is its mark and its graph:
 * `{ } Main`, the mark saying what "Code Block" would. Two tabs that would
 * still read the same -- two such nodes in one graph -- are told apart by
 * their first line of code.
 */
export function codeTabLabels(
	script: NodeScript | null,
	registry: Registry,
	tabs: CodeTab[],
): Map<string, CodeTabName> {
	const named = tabs.map((tab) => {
		const label = codeTabLabel(script, registry, tab);
		const name: CodeTabName = {
			kind: label.kind,
			name: label.label ?? label.where,
			...(label.label ? { detail: label.where } : {}),
			full: `${label.kind === "type" ? label.title : (label.label ?? CODE_MARKS[label.kind]?.name ?? label.title)} · ${label.where}`,
		};
		return [tab, name] as const;
	});
	const reads = (name: CodeTabName) => `${name.kind}\u0000${name.name}\u0000${name.detail ?? ""}`;
	const seen = new Map<string, number>();
	for (const [, name] of named) seen.set(reads(name), (seen.get(reads(name)) ?? 0) + 1);
	return new Map(
		named.map(([tab, name]) => {
			if ((seen.get(reads(name)) ?? 0) < 2) return [tab.key, name];
			const first = (codeValue(script, registry, tab) ?? "")
				.split("\n")
				.map((line) => line.trim())
				.find((line) => line !== "");
			const detail = first ? (first.length > 28 ? `${first.slice(0, 27)}…` : first) : "empty";
			return [tab.key, { ...name, detail, full: `${name.full} · ${detail}` }];
		}),
	);
}

/** What a tab's text must parse as: statements for Code Block, one value otherwise. */
function kindOf(node: GraphNode | undefined, tab: CodeTab): LuauFragment {
	return tab.kind ?? (node?.def === "code.custom" ? "block" : "expression");
}

export interface CodePanelProps {
	script: NodeScript | null;
	registry: Registry;
	/** The open graph's file: the tabs are its, and its requires resolve from here. */
	graphPath: string | null;
	/** The graph is compiling and refuses edits; changes wait until it stops. */
	locked: boolean;
	tabs: CodeTab[];
	active: string | null;
	onSelect: (key: string) => void;
	onClose: (key: string) => void;
	/** Writes a tab's text into the graph, if `graphPath` is still the graph open. */
	onApply: (graphPath: string, tab: CodeTab, text: string) => void;
	onGoTo: (nodeId: string) => void;
	full: boolean;
	onToggleFull: () => void;
}

export function CodePanel(props: CodePanelProps) {
	const { script, registry, tabs, active, full, graphPath } = props;
	const current = tabs.find((t) => t.key === active) ?? tabs[0];
	const labels = useMemo(() => codeTabLabels(script, registry, tabs), [script, registry, tabs]);

	return (
		<div
			className="code-panel"
			onKeyDown={(e) => {
				// Out of full view with Escape, unless the editor used it -- to
				// close completion, say.
				if (e.key === "Escape" && full && !e.defaultPrevented) {
					e.preventDefault();
					props.onToggleFull();
				}
			}}
		>
			<PanelHead
				lead={
					<div className="code-tabs" role="tablist" aria-label="Open code">
						{tabs.map((tab) => {
							const label = labels.get(tab.key);
							const title = label?.full ?? "";
							const on = tab.key === current?.key;
							return (
								<div key={tab.key} className={cx("code-tab", on && "on")}>
									<button
										role="tab"
										aria-selected={on}
										aria-label={title}
										className="code-tab-pick"
										title={title}
										onClick={() => props.onSelect(tab.key)}
										onAuxClick={(e) => {
											// The middle button closes a tab, as in a browser.
											if (e.button === 1) props.onClose(tab.key);
										}}
									>
										<span className="code-tab-label">
											<CodeMark kind={label?.kind ?? "block"} />
											<span className="code-tab-title">{label?.name}</span>
											{label?.detail && <span className="code-tab-where">{label.detail}</span>}
										</span>
									</button>
									<button
										className="code-tab-close"
										aria-label={`Close ${title}`}
										title="Close"
										onClick={() => props.onClose(tab.key)}
									>
										×
									</button>
								</div>
							);
						})}
					</div>
				}
			>
				{current && (
					<button
						className="tb"
						title="Select this node on the graph, and bring it into view"
						onClick={() => props.onGoTo(current.nodeId)}
					>
						Go to node
					</button>
				)}
				<button
					className={cx("tb code-full", full && "on")}
					aria-pressed={full}
					title={
						full
							? "Back to the foot (Ctrl+Shift+Enter, or Esc)"
							: "Full view: the code over the graph, the side panels kept (Ctrl+Shift+Enter)"
					}
					onClick={props.onToggleFull}
				>
					<Icon name={full ? "collapseContent" : "expandContent"} size={14} />
					{full ? "Back to the foot" : "Full view"}
				</button>
			</PanelHead>

			{graphPath &&
				tabs.map((tab) => (
					<CodeField
						key={`${graphPath}|${tab.key}`}
						shown={tab.key === current?.key}
						tab={tab}
						script={script}
						registry={registry}
						graphPath={graphPath}
						locked={props.locked}
						onApply={props.onApply}
					/>
				))}
		</div>
	);
}

/** Marks a change the graph made to the editor, which is not typing. */
const fromGraph = Annotation.define<boolean>();

/** How long typing pauses before it is applied. */
const APPLY_AFTER = 350;
/** How soon to try again when the graph is compiling and refused it. */
const RETRY_AFTER = 250;

interface CodeFieldProps {
	shown: boolean;
	tab: CodeTab;
	script: NodeScript | null;
	registry: Registry;
	graphPath: string;
	locked: boolean;
	onApply: (graphPath: string, tab: CodeTab, text: string) => void;
}

/**
 * One tab's editor. Kept while its tab is open and only hidden behind
 * another, so switching tabs keeps each one's place and its own undo.
 */
function CodeField({ shown, tab, script, registry, graphPath, locked, onApply }: CodeFieldProps) {
	const host = useRef<HTMLDivElement>(null);
	const view = useRef<EditorView | null>(null);
	const node = script?.nodes.find((n) => n.id === tab.nodeId);
	const nodeId = tab.nodeId;
	const value = codeValue(script, registry, tab) ?? "";
	const kind = kindOf(node, tab);
	const [text, setText] = useState(value);
	const problems = useMemo(() => checkLuau(text, kind), [text, kind]);

	// Typing the graph has not seen yet, and what it holds now. See the top
	// of the file for why the two are kept apart.
	const unseen = useRef<string | null>(null);
	const graphValue = useRef(value);
	graphValue.current = value;
	const lockedRef = useRef(locked);
	lockedRef.current = locked;
	const timer = useRef<number | undefined>(undefined);

	const flush = useCallback(() => {
		window.clearTimeout(timer.current);
		timer.current = undefined;
		const pending = unseen.current;
		if (pending === null) return;
		if (pending === graphValue.current) {
			unseen.current = null;
			return;
		}
		if (lockedRef.current) {
			timer.current = window.setTimeout(flush, RETRY_AFTER);
			return;
		}
		onApply(graphPath, tab, pending);
	}, [graphPath, tab, onApply]);
	const flushRef = useRef(flush);
	flushRef.current = flush;

	// The graph's value moved: caught up with the typing, or changed for
	// another reason -- an undo, a paste of the node -- and written in.
	useEffect(() => {
		const instance = view.current;
		if (unseen.current !== null) {
			if (value === unseen.current) unseen.current = null;
			else if (timer.current === undefined) timer.current = window.setTimeout(flush, RETRY_AFTER);
			return;
		}
		if (!instance || instance.state.doc.toString() === value) return;
		instance.dispatch({
			changes: { from: 0, to: instance.state.doc.length, insert: value },
			annotations: [fromGraph.of(true)],
		});
	}, [value, flush]);

	// Completion, hover and drops need the graph around this node, read
	// through refs so the editor is built once rather than on every keystroke.
	const scope = useMemo(
		() => [...precedingLocals(script, registry, nodeId), ...scopeCompletions(script)],
		[script, registry, nodeId],
	);
	const scopeRef = useRef<Completion[]>(scope);
	scopeRef.current = scope;
	const types = useMemo(
		() => graphLocalTypes(script, registry, nodeId),
		[script, registry, nodeId],
	);
	const typesRef = useRef(types);
	typesRef.current = types;
	const instanceNames = useMemo(
		() => graphInstanceLocals(script, registry, nodeId),
		[script, registry, nodeId],
	);
	const instanceNamesRef = useRef(instanceNames);
	instanceNamesRef.current = instanceNames;
	const targetRef = useRef(script?.target ?? "roblox");
	targetRef.current = script?.target ?? "roblox";
	const members = useMemo(() => graphTableMembers(script), [script]);
	const membersRef = useRef(members);
	membersRef.current = members;
	const scriptRef = useRef(script);
	scriptRef.current = script;

	// The DataModel the project knows, for `ReplicatedStorage.Shared.` and
	// for paths that are not there.
	const instancesRef = useRef<{ root: InstanceNode; self?: string[] } | null>(null);
	const selfRef = useRef<string[] | undefined>(undefined);
	useEffect(() => {
		let live = true;
		api.instances().then(
			({ outline }) => {
				if (live)
					instancesRef.current = {
						root: indexFromOutline(outline),
						...(selfRef.current ? { self: selfRef.current } : {}),
					};
			},
			() => {
				// No outline means no instance completion or warnings, and the
				// editor works without them; there is nothing to tell anyone.
			},
		);
		return () => {
			live = false;
		};
	}, []);
	// What the code's requires hold, asked a moment after typing stops.
	const requiredRef = useRef<ReadonlyMap<string, TableMember[]>>(new Map());
	const modulesRef = useRef<ReadonlyMap<string, ModuleInfo>>(new Map());
	useEffect(() => {
		let live = true;
		const id = window.setTimeout(() => {
			api.luauModules(graphPath, text).then(
				({ modules, self }) => {
					if (!live) return;
					requiredRef.current = new Map(modules.map((m) => [m.name, m.members]));
					modulesRef.current = new Map(modules.map((m) => [m.name, m]));
					selfRef.current = self ?? undefined;
					if (instancesRef.current)
						instancesRef.current = { ...instancesRef.current, ...(self ? { self } : {}) };
				},
				() => {
					// The requires stay as last answered; the next pause asks again.
				},
			);
		}, 400);
		return () => {
			live = false;
			window.clearTimeout(id);
		};
	}, [graphPath, text]);
	const allMembers = () => new Map([...membersRef.current, ...requiredRef.current]);

	useEffect(() => {
		if (!host.current) return;
		const instance = new EditorView({
			parent: host.current,
			state: EditorState.create({
				doc: value,
				extensions: [
					luauExtensions({
						completion: luauCompletionSource(
							() => scopeRef.current,
							() => targetRef.current,
							allMembers,
							() => instancesRef.current,
							() => typesRef.current,
						),
						lint: (code) => checkLuau(code, kind),
						hover: {
							target: () => targetRef.current,
							members: allMembers,
							modules: () => modulesRef.current,
							instances: () => instancesRef.current,
						},
						signature: true,
						warnings: (code) =>
							instancesRef.current && targetRef.current !== "lune"
								? instanceProblems(code, instancesRef.current.root, instancesRef.current.self)
								: [],
						extra: [
							EditorView.updateListener.of((update) => {
								if (!update.docChanged) return;
								const next = update.state.doc.toString();
								setText(next);
								if (update.transactions.some((t) => t.annotation(fromGraph))) return;
								// Typed: applied once typing pauses.
								unseen.current = next;
								window.clearTimeout(timer.current);
								timer.current = window.setTimeout(() => flushRef.current(), APPLY_AFTER);
							}),
							// Leaving the editor applies what is waiting, so a click on
							// the graph never finds the node a pause behind.
							EditorView.domEventHandlers({
								blur: () => {
									flushRef.current();
									return false;
								},
							}),
						],
					}),
					// From the DataModel or Properties: a path, from the nearest name
					// that already holds part of it.
					instanceDrop(
						() => kind,
						(src, at) => [
							...instanceLocalsAt(src, at, instancesRef.current?.self),
							...instanceNamesRef.current,
						],
					),
					// From the Variables panel: the name.
					nameDrop(() => scriptRef.current, registry),
				],
			}),
		});
		view.current = instance;
		return () => {
			// Whatever is waiting is applied before the editor goes.
			flushRef.current();
			window.clearTimeout(timer.current);
			instance.destroy();
			view.current = null;
		};
		// Built once per tab; `value` is only the first document.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// A tab brought forward takes the keyboard.
	useEffect(() => {
		if (shown) view.current?.focus();
	}, [shown]);

	const line = useCaretLine(view.current, text);

	return (
		<div className="code-field" hidden={!shown}>
			<div className="code-body" ref={host} />
			{/* What matters at the right: on the foot the status pill can lie
			    over this line's start. */}
			<div className={cx("code-status", problems.length > 0 && "bad")}>
				<span className="code-note">Applied as you type · Ctrl+Z undoes it</span>
				<span style={{ flex: 1 }} />
				{problems.length === 0 ? (
					<span className="code-verdict">
						<span className="code-ok" aria-hidden="true" /> No problems
					</span>
				) : (
					<span className="code-verdict">
						{problems[0].message} <span className="where">line {problems[0].line}</span>
						{problems.length > 1 && ` (+${problems.length - 1} more)`}
					</span>
				)}
				{line && <span className="keys">{line}</span>}
				<span className="keys">
					{kind === "block" ? "Statements" : kind === "type" ? "A type" : "An expression"}
				</span>
			</div>
		</div>
	);
}

/** "Ln 4, Col 14" for the caret, kept as it moves. */
function useCaretLine(view: EditorView | null, text: string): string | null {
	const [, rerender] = useState(0);
	useEffect(() => {
		if (!view) return;
		const dom = view.dom;
		const update = () => rerender((n) => n + 1);
		dom.addEventListener("keyup", update);
		dom.addEventListener("pointerup", update);
		return () => {
			dom.removeEventListener("keyup", update);
			dom.removeEventListener("pointerup", update);
		};
	}, [view]);
	if (!view) return null;
	void text;
	const head = view.state.selection.main.head;
	const line = view.state.doc.lineAt(head);
	return `Ln ${line.number}, Col ${head - line.from + 1}`;
}
