/**
 * A pop-out Luau editor for the nodes that hold raw code.
 *
 * A one-line text input is fine for a service name and hopeless for a block of
 * Luau, which is what Custom Code exists to hold. This gives it syntax
 * highlighting, real line breaks, and the structural check that runs on every
 * compile — shown here as you type, so a stray `end` is caught in the box you
 * typed it in rather than in the generated file.
 */

import type { Completion } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { checkLuau, type LuauFragment } from "../core/luau/check.js";
import type { ModuleInfo } from "../core/luau/hover.js";
import type { TableMember } from "../core/luau/infer.js";
import { type InstanceNode, indexFromOutline, instanceProblems } from "../core/luau/instances.js";
import type { Registry } from "../core/nodes/index.js";
import type { NodeScript } from "../core/schema.js";
import { api } from "./api.js";
import { cx } from "./cx.js";
import { instanceDrop } from "./instanceDrop.js";
import { LAYER } from "./layers.js";
import {
	graphLocalTypes,
	graphTableMembers,
	luauCompletionSource,
	precedingLocals,
	scopeCompletions,
} from "./luauCompletions.js";
import { luauExtensions } from "./luauExtensions.js";

export interface CodeEditorProps {
	title: string;
	value: string;
	/** One line of context, e.g. what the code is spliced into. */
	hint?: string;
	/** What the text must parse as; worked out from the node when absent. */
	kind?: LuauFragment;
	/** The open graph, so completion can offer the names it puts in scope. */
	script: NodeScript | null;
	registry: Registry;
	/** The node being edited, so locals from earlier blocks can be found. */
	nodeId: string | null;
	/** The graph's file, so a require in the code -- and `script` -- resolve from where it compiles to. */
	graphPath?: string | null;
	onCommit: (value: string) => void;
	onClose: () => void;
}

/** A card holding one of these is lifted above the backdrop, to drag from. */
const LIFTED = ".project-view:not([hidden]) .place-browser, .panel-properties";
/** How wide the window must be for the editor to move aside for those cards. */
const MODAL_ROOM = 640;

export function CodeEditor({
	title,
	value,
	hint,
	kind: given,
	script,
	registry,
	nodeId,
	graphPath,
	onCommit,
	onClose,
}: CodeEditorProps) {
	const host = useRef<HTMLDivElement>(null);
	const view = useRef<EditorView | null>(null);
	const [text, setText] = useState(value);

	// Custom Code is statements; a Luau Expression, or code typed into any
	// other pin, is one value. The compiler parses each the same way.
	const kind: LuauFragment =
		given ??
		(script?.nodes.find((n) => n.id === nodeId)?.def === "code.custom" ? "block" : "expression");
	const problems = useMemo(() => checkLuau(text, kind), [text, kind]);
	// Recomputed only when the graph changes, and read through a ref so the
	// editor is built once rather than torn down on every keystroke.
	const scope = useMemo(
		() => [...precedingLocals(script, registry, nodeId), ...scopeCompletions(script)],
		[script, registry, nodeId],
	);
	const scopeRef = useRef<Completion[]>(scope);
	scopeRef.current = scope;
	// What those names hold, for `hull.` to offer a BasePart's members.
	const types = useMemo(
		() => graphLocalTypes(script, registry, nodeId),
		[script, registry, nodeId],
	);
	const typesRef = useRef(types);
	typesRef.current = types;
	// Roblox classes and datatypes are offered only in a graph that compiles
	// for Roblox. Read through a ref for the same reason as the scope.
	const targetRef = useRef(script?.target ?? "roblox");
	targetRef.current = script?.target ?? "roblox";
	// The functions the graph declares on its tables, for `Occupancy.`.
	const members = useMemo(() => graphTableMembers(script), [script]);
	const membersRef = useRef(members);
	membersRef.current = members;
	// The DataModel the project knows -- the place, and what the node maps
	// add -- for `ReplicatedStorage.Shared.` to offer what is in Shared.
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
	// What the code's requires hold, and where the graph's code runs from, as
	// the host answers for the text being typed -- asked a moment after typing
	// stops, not on every key.
	const requiredRef = useRef<ReadonlyMap<string, TableMember[]>>(new Map());
	const modulesRef = useRef<ReadonlyMap<string, ModuleInfo>>(new Map());
	useEffect(() => {
		if (!graphPath) return;
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
					// The requires stay as last answered: completion and hover offer
					// less, and the next pause in typing asks again.
				},
			);
		}, 400);
		return () => {
			live = false;
			window.clearTimeout(id);
		};
	}, [graphPath, text]);
	// The graph's own table members, with what the code's requires hold.
	const allMembers = () => new Map([...membersRef.current, ...requiredRef.current]);

	useEffect(() => {
		if (!host.current) return;

		const state = EditorState.create({
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
					// The same structural check that runs on every compile, shown here
					// as you type so a stray `end` is caught in the box you typed it in.
					lint: (code) => checkLuau(code, kind),
					hover: {
						target: () => targetRef.current,
						members: allMembers,
						modules: () => modulesRef.current,
						instances: () => instancesRef.current,
					},
					signature: true,
					// Instance paths the place and the project do not have, from where
					// the graph's code runs.
					warnings: (code) =>
						instancesRef.current && targetRef.current !== "lune"
							? instanceProblems(code, instancesRef.current.root, instancesRef.current.self)
							: [],
					onChange: setText,
				}),
				// An instance dragged in from the DataModel or Properties.
				instanceDrop(() => kind),
			],
		});

		const instance = new EditorView({ state, parent: host.current });
		view.current = instance;
		instance.focus();
		return () => {
			instance.destroy();
			view.current = null;
		};
		// Mounted once per open; `value` is the initial document by design.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
			// Ctrl+Enter commits, because Enter has to stay a newline in here.
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				onCommit(text);
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [text, onCommit, onClose]);

	// The cards showing the DataModel and Properties stay above the backdrop
	// (see theme.css), so an instance can be dragged from them into the code.
	// The editor moves over to clear them while it still has room.
	const [clear, setClear] = useState<{ left?: number; right?: number }>({});
	useLayoutEffect(() => {
		let left = 0;
		let right = 0;
		for (const card of document.querySelectorAll(".dock, .float-panel")) {
			if (!card.querySelector(LIFTED)) continue;
			const box = card.getBoundingClientRect();
			if (box.width === 0) continue;
			if (box.left + box.width / 2 < window.innerWidth / 2) left = Math.max(left, box.right);
			else right = Math.max(right, window.innerWidth - box.left);
		}
		if (window.innerWidth - left - right >= MODAL_ROOM)
			setClear({ left: left ? left + 24 : undefined, right: right ? right + 24 : undefined });
	}, []);

	return (
		<div
			className="code-backdrop"
			style={{ zIndex: LAYER.menu, paddingLeft: clear.left, paddingRight: clear.right }}
			onPointerDown={onClose}
		>
			<div className="code-modal" onPointerDown={(e) => e.stopPropagation()}>
				<div className="code-head">
					<span className="title">{title}</span>
					{hint && <span className="hint">{hint}</span>}
					<span style={{ flex: 1 }} />
					<button className="tb" onClick={onClose}>
						Cancel
					</button>
					<button className="tb primary" onClick={() => onCommit(text)}>
						Done
					</button>
				</div>

				<div className="code-body" ref={host} />

				<div className={cx("code-status", problems.length && "bad")}>
					{problems.length === 0 ? (
						<span>Reads as Luau. Inserted into the generated file exactly as written.</span>
					) : (
						<span>
							{problems[0].message} <span className="where">line {problems[0].line}</span>
							{problems.length > 1 && ` (+${problems.length - 1} more)`}
						</span>
					)}
					<span style={{ flex: 1 }} />
					<span className="keys">Ctrl+Enter to apply · Esc to cancel</span>
				</div>
			</div>
		</div>
	);
}
