/**
 * Node inspector.
 *
 * Most nodes need nothing here — their inputs are edited on the node itself.
 * It exists for the handful whose *shape* is data: function signatures, module
 * exports, connect handler parameters. Those cannot be expressed as pins
 * because the pins are what they define.
 */

import { useMemo, useState } from "react";

import type { Comment, GraphNode, Literal, NodeDef, NodeScript } from "../core/schema.js";
import { nodeTitle, type Registry } from "../core/nodes/index.js";
import type { Signature } from "../core/nodes/index.js";
import { resolvePins } from "./geometry.js";
import {
	COMMENT_COLORS, COMMENT_DEFAULT_COLOR, commentColor, nodeColor, readHexColor,
} from "./palette.js";
import {
	addVariable, bindNodeToFunction, bindNodeToLocal, bindNodeToVariable, disconnectInput, renameNode,
	addModule, setConfig, setLiteral, syncFunctionRefs, syncFunctionReturns, syncParamRefs,
	updateComment, updateModule,
} from "./edits.js";
import { FUNCTION_NODES, loopTypes, typeShapeOf } from "../core/nodes/flow.js";
import { CAST_MODES, CAST_NODES, castModeOf } from "../core/nodes/library.js";
import { isConstLocal, localNameOf } from "../core/nodes/variables.js";
import { store, useEditor } from "./store.js";
import { membersFor } from "../core/members.js";
import { requiredTypes, useProjectTypes } from "./projectTypes.js";
import { TypePicker } from "./TypePicker.jsx";
import { ValuePicker } from "./ValuePicker.jsx";
import { Icon } from "./icons.jsx";
import {
	CALL_OPTIONS, SERVICE_CALL, SERVICE_VALUE, callDetail, callLabel, serviceMethod, splitCall,
} from "../core/serviceCalls.js";
import {
	callLabel as luneCallLabel, luneCallDetail, luneFunction, requiredSpecifier, splitLuneCall,
	LUNE_CALL, LUNE_CALL_OPTIONS, LUNE_VALUE,
} from "../core/luneCalls.js";
import { LUNE_ROBLOX_DATATYPES } from "../core/luneApi.js";
import { ENGINE_TYPES } from "../core/schema.js";

/**
 * Abbreviations whose full stop is not the end of a sentence.
 *
 * One `e.g.` in the whole library today, which is exactly the sort of thing
 * that is fine until the day somebody writes another and the panel starts
 * truncating a node's description to four words.
 */
const NOT_A_FULL_STOP = /(?:\be\.g|\bi\.e|\betc|\bvs|\bcf|\bapprox)\.$/i;

/**
 * The opening of a node's summary, short enough for a side panel.
 *
 * Summaries are written for the reference page, where a paragraph is right —
 * what the node does, when to reach for it, what it refuses. Beside the graph
 * that paragraph is a wall, and the rest of it is one click away.
 *
 * **Sentences until it has said something, rather than one sentence.** Plenty
 * of summaries open with a label instead of a description — "Escape hatch.",
 * "if / else.", "By name." — and stopping at the first full stop would put
 * those in the panel alone, which is worse than the wall. So it keeps taking
 * sentences until what it has is long enough to be a description.
 *
 * Splitting prose into sentences is famously not solvable in general. This has
 * to be right only about what occurs here: abbreviations, and full stops inside
 * code spans — `Vector3.new` must not end a sentence, and a stop between
 * backticks is never a boundary.
 */
const ENOUGH_SAID = 45;

export function briefSummary(text: string): string {
	const boundaries = /[.!?](?=\s)/g;
	let match: RegExpExecArray | null;
	while ((match = boundaries.exec(text)) !== null) {
		const upto = text.slice(0, match.index + 1);
		if (NOT_A_FULL_STOP.test(upto)) continue;
		// An odd number of backticks means the stop is inside a code span.
		if ((upto.match(/`/g) ?? []).length % 2 === 1) continue;
		if (upto.length >= ENOUGH_SAID) return upto;
	}
	return text;
}

/**
 * Whether this node's label also names something in the generated Luau.
 *
 * A `call` node binds its result to a local and takes the name from the label,
 * so labelling a Find First Child "value" emits `local value = ...` instead of
 * `local Child = ...` followed by a second local to rename it. That worked
 * already and was findable only by guessing that a field called Label was
 * load-bearing — the same trap Declare Local's name was in.
 */
function namesResult(def: NodeDef): boolean {
	if (def.compilesTo.kind === "call") return true;
	// A pure node binds a local too, as soon as anything reads its value twice
	// -- and since Find First Child became one, the field was hidden on exactly
	// the node that prompted it. A pure *builtin* stays out: it resolves to a
	// bare identifier and is never bound, so a name there would do nothing.
	return def.compilesTo.kind === "expr"
		&& (def.outputs ?? []).some((pin) => pin.kind === "data");
}

/** Where a node's page lives in the docs window. */
function docsHref(nodeId: string): string {
	return `/docs#${encodeURIComponent(`node/${nodeId}`)}`;
}

export interface InspectorProps {
	/**
	 * The graph is being compiled and refuses edits. The store is what actually
	 * refuses them -- see `EditorState.locked` -- so this exists so the panel
	 * does not sit there looking like it accepted one.
	 */
	locked?: boolean;
	script: NodeScript;
	registry: Registry;
	selection: ReadonlySet<string>;
}

export function Inspector({ script, registry, selection, locked }: InspectorProps) {
	if (selection.size !== 1) return null;
	const id = [...selection][0];
	const comment = script.comments.find((c) => c.id === id);
	if (comment) return <CommentInspector comment={comment} locked={locked} />;
	const node = script.nodes.find((n) => n.id === id);
	if (!node) return null;
	const def = registry.get(node.def);
	if (!def) return null;

	return (
		<div className={`inspector${locked ? " editing-locked" : ""}`}>
			<h2>Node</h2>
			<div className="inspector-body">
				<div className="node-heading" style={{ background: nodeColor(def) }}>
					{def.title}
				</div>
				{def.summary && (
					<p className="summary">
						{briefSummary(def.summary)}{" "}
						{/* Named window, so it reuses the docs the toolbar opens rather
						    than stacking up a tab per node. */}
						<a className="docs-link" href={docsHref(def.id)} target="roswaal-docs">
							See docs page
						</a>
					</p>
				)}

				{/* The placeholder is what the node is called *now*, which for a
				    named node is its function or variable name rather than the
				    definition's title — so an empty field reads as "this is
				    already fine" instead of as a suggestion to type the name a
				    second time. */}
				<Field label="Label">
					<input
						className="tb"
						placeholder={nodeTitle(def, node)}
						value={node.label ?? ""}
						onChange={(e) => store.edit((s) => renameNode(s, id, e.target.value))}
					/>
				</Field>

				{namesResult(def) && <ResultName node={node} />}
				{FUNCTION_NODES.has(def.id) && <FunctionEditor node={node} />}
				{def.id === "function.return" && (
					<ListEditor
						node={node}
						field="returns"
						title="Returns"
						hint="Kept in step with the Function node this returns from."
					/>
				)}
				{def.id === "module.exports" && (
					<ListEditor
						node={node}
						field="exports"
						title="Exports"
						hint="One pin per key on the returned table. A single pin named “value” returns that value directly instead of wrapping it."
					/>
				)}
				{def.id === "value.member" && <MemberEditor node={node} />}
				{def.id === "event.connect" && (
					<ListEditor
						node={node}
						field="params"
						title="Handler parameters"
						hint="Whatever the signal passes to its listener."
					/>
				)}
				{/* A cast is a pill and brackets its own expression already — see the
				    template. Offering the toggle would offer a second pair. */}
				{def.id === "string.concat" && <ConcatStyle node={node} />}
				{def.display === "operator" && !CAST_NODES.has(def.id) && (
					<OperatorBrackets node={node} />
				)}
				{CAST_NODES.has(def.id) && <CastLabel node={node} />}
				{CAST_NODES.has(def.id) && <CastMode node={node} />}
				{(def.id === "flow.forEach" || def.id === "flow.forIndex") && (
					<LoopNames node={node} array={def.id === "flow.forIndex"} />
				)}
				{(def.id === "table.dictionary"
					|| def.id === "table.getKey"
					|| def.id === "table.setKey") && <KeyStyle node={node} />}
				{def.id === "table.pair" && <PairEditor node={node} def={def} />}
				{def.id === "table.dictionary" && <TableLayout node={node} />}
				{def.id === "flow.sequence" && (
					<CountEditor node={node} field="count" label="Outputs" min={2} max={12} fallback={2} />
				)}
				{(def.id === "call.function" || def.id === "call.method") && (
					<CountEditor node={node} field="args" label="Arguments" min={0} max={8} fallback={1} />
				)}
				{(def.id === SERVICE_CALL || def.id === SERVICE_VALUE) && <CallPicker node={node} />}
				{(def.id === LUNE_CALL || def.id === LUNE_VALUE) && <LuneCallPicker node={node} />}
				<DatatypeFromLune def={def} />
				{(def.id === "type.declareTop" || def.id === "type.declareHere") && (
					<TypeEditor node={node} />
				)}
				{(def.id === "variable.get"
					|| def.id === "variable.set"
					|| def.id === "variable.init") && (
					<VariablePicker script={script} node={node} />
				)}
				{def.id === "function.get" && <FunctionPicker script={script} node={node} />}
				{def.id === "function.getParam" && <ParamPicker script={script} node={node} />}
				{def.id === "local.get" && <LocalPicker script={script} node={node} />}
				{def.id === "local.declare" && <LocalBinding node={node} />}
				{def.id === "local.declare" && <LocalType node={node} />}

				<PinSummary def={def} node={node} />
			</div>
		</div>
	);
}

/**
 * A selected comment.
 *
 * The panel had nothing for one, which was fine while a comment was a box with
 * text in it — the text is edited on the canvas, where it is read. A colour is
 * different: it is a property of the comment with nowhere on the comment to put
 * it, which is exactly what this panel is for.
 *
 * The heading is the comment's own colour rather than a category's, because a
 * comment has no category and the swatch is the thing being edited.
 */
function CommentInspector({ comment, locked }: { comment: Comment; locked?: boolean }) {
	const current = comment.color ?? COMMENT_DEFAULT_COLOR;
	const set = (color: string | undefined) =>
		store.edit((s) => updateComment(s, comment.id, { color }));

	return (
		<div className={`inspector${locked ? " editing-locked" : ""}`}>
			<h2>Node</h2>
			<div className="inspector-body">
				<div className="node-heading" style={{ background: commentColor(comment.color) }}>
					Comment
				</div>
				<p className="summary">
					A note on the canvas. Double-click its header to write in it; drag it to take
					what it encloses with it.
				</p>

				<Field
					label="Colour"
					hint="Two comments the same colour are saying they are about the same thing, which is why this is a short list rather than a picker."
				>
					<div className="swatches">
						{COMMENT_COLORS.map((choice) => (
							<button
								key={choice.hex}
								className={`swatch${choice.hex === current ? " on" : ""}`}
								style={{ background: `#${choice.hex}` }}
								title={choice.name}
								aria-label={choice.name}
								aria-pressed={choice.hex === current}
								onClick={() =>
									set(choice.hex === COMMENT_DEFAULT_COLOR ? undefined : choice.hex)
								}
							/>
						))}
					</div>
				</Field>

				<Field label="Or a hex" hint="Six digits, or three. The hash is optional.">
					<input
						className="tb"
						defaultValue={current}
						placeholder={COMMENT_DEFAULT_COLOR}
						key={current}
						onBlur={(e) => {
							const hex = readHexColor(e.target.value);
							// A value that is not a colour leaves the comment as it was,
							// and the field goes back to saying what the colour is. A
							// half-typed hex is not an error worth a message.
							if (hex) set(hex === COMMENT_DEFAULT_COLOR ? undefined : hex);
							else e.target.value = current;
						}}
					/>
				</Field>
			</div>
		</div>
	);
}


/**
 * The member a Get Member reads.
 *
 * Here rather than on the node, because the node is one line — `.throttle`,
 * one input, one output — and a picker on its face would be the widest thing
 * on it. The same reason a function's parameters are edited here: the panel is
 * where a node's *shape* is decided, and which member this reads decides both
 * the face it shows and the type of what comes out of it.
 *
 * Picking also stores the member's type, which is what the result pin is drawn
 * from. Get Local stores the type of its local for the same reason: pin
 * derivation sees the node and never the wire.
 */
function MemberEditor({ node }: { node: GraphNode }) {
	const editor = useEditor();
	const projectTypes = useProjectTypes();
	const [picking, setPicking] = useState(false);
	const current = ((node.config ?? {}) as { member?: string }).member ?? "";

	const members = useMemo(() => {
		const registry = store.getRegistry();
		if (!editor.script || !registry) return [];
		const external = new Map(
			requiredTypes(editor.script, projectTypes)
				.filter((entry) => entry.fields && entry.fields.length > 0)
				.map((entry) => [entry.type, entry.fields!] as const),
		);
		// The whole file, not the graph on screen: a type is declared once and
		// is the file's, while the node reading it is usually inside a
		// function. Scoping this to the open graph meant a Get Member in a
		// function's body could not see the type declared beside it.
		return membersFor({ script: editor.script, registry, external }, node.id);
	}, [editor.script, editor.graph, projectTypes, node.id]);

	const pick = (name: string) => {
		const member = members.find((m) => m.name === name);
		// Name and type in one edit, or the pin would keep the type of the
		// member picked before it.
		store.edit((s) => setConfig(s, node.id, { member: name, type: member?.type }));
		setPicking(false);
	};

	return (
		<>
			<Field
				label="Member"
				hint={
					members.length > 0
						? undefined
						: "Nothing is wired in, or its type declares no fixed members. Get Field reads any key off any value."
				}
			>
				{members.length > 0 ? (
					<button className="tb type-picker" onClick={() => setPicking(true)}>
						<span className="preview">{current || "choose"}</span>
						<Icon name="chevron" size={12} />
					</button>
				) : (
					<input
						className="tb"
						value={current}
						placeholder="member"
						onChange={(e) =>
							store.edit((s) => setConfig(s, node.id, { member: e.target.value }))
						}
					/>
				)}
			</Field>
			{picking && (
				<ValuePicker
					what="member"
					options={members.map((m) => m.name)}
					value={current}
					detailOf={(name) => members.find((m) => m.name === name)?.type ?? ""}
					onPick={pick}
					onClose={() => setPicking(false)}
				/>
			)}
		</>
	);
}

/**
 * What the local holding this node's result is called.
 *
 * Its own field rather than the node's label, which used to do both jobs and
 * so could only do one at a time: labelling a Find First Child `value` made
 * the node stop saying Find First Child. It shows under the header, the way
 * Declare Type shows the type it declares.
 */
function ResultName({ node }: { node: GraphNode }) {
	const current = (node.config as { resultName?: string } | undefined)?.resultName ?? "";
	return (
		<Field label="Result name" hint="The local this node's result lands in.">
			<input
				className="tb"
				value={current}
				placeholder="chosen for you"
				onChange={(e) => store.edit((s) => setConfig(s, node.id, { resultName: e.target.value }))}
			/>
		</Field>
	);
}

function FunctionEditor({ node }: { node: GraphNode }) {
	const sig = (node.config ?? {}) as Signature;
	return (
		<>
			<Field label="Function name">
				<input
					className="tb"
					value={sig.name ?? ""}
					placeholder="doSomething"
					onChange={(e) =>
						store.edit((s) => syncFunctionRefs(setConfig(s, node.id, { name: e.target.value })))
					}
				/>
			</Field>
			<ListEditor node={node} field="params" title="Parameters" />
			<ListEditor
				node={node}
				field="returns"
				title="Returns"
				hint="Return nodes inside this function follow along automatically."
			/>
		</>
	);
}

/**
 * The Luau type a Declare Type node writes out.
 *
 * The definition is a textarea rather than a set of pins, and that is the
 * honest shape: a type is not built out of values, so there is nothing for a
 * node to be. `{ speed: number }` describes something no wire can carry.
 */
/**
 * The fields of a table type, as rows rather than as typed-out Luau.
 *
 * `{ movementSpeed: number, hp: number }` is a list of pairs written in one
 * line, and a list of pairs is what an editor is good at: it lines the names up,
 * it cannot lose a brace, and adding a field is a button rather than finding
 * the right comma. The written-out box stays for everything this shape cannot
 * say — a union, a function type, a generic — which is most of Luau's type
 * language and not worth building a second grammar for.
 *
 * The type of each field is the **type picker**, the same control a variable,
 * a parameter and a cast use: this graph's own declared types first, then a
 * required module's, then Luau's and Roblox's. It was a text field with a
 * dozen suggestions behind it, which offered `Vector3` and could not offer
 * `Config` — a type declared four nodes away — and it had to be spelt.
 *
 * Whatever you type is still taken, listed or not, so `{ Player }` and
 * `Model?` are typed in as they always were.
 */
function TypeFields({ node }: { node: GraphNode }) {
	const fields = ((node.config ?? {}).fields as { name: string; type: string }[]) ?? [];
	const write = (next: { name: string; type: string }[]) =>
		store.edit((s) => setConfig(s, node.id, { fields: next }));

	return (
		<div className="list-editor">
			<div className="list-title">
				<span>Fields</span>
				<button
					className="tb"
					onClick={() => write([...fields, { name: `field${fields.length + 1}`, type: "number" }])}
				>
					Add
				</button>
			</div>
			{fields.map((entry, i) => (
				<div className="list-row" key={i}>
					<input
						className="tb"
						value={entry.name}
						placeholder="name"
						onChange={(e) => {
							const next = [...fields];
							next[i] = { ...entry, name: e.target.value };
							write(next);
						}}
					/>
					<TypePicker
						value={entry.type}
						onChange={(type) => {
							const next = [...fields];
							next[i] = { ...entry, type };
							write(next);
						}}
					/>
					<button className="tb" title="Remove" onClick={() => write(fields.filter((_, j) => j !== i))}>
						×
					</button>
				</div>
			))}
			{fields.length === 0 && <p className="summary">No fields yet.</p>}
		</div>
	);
}

function TypeEditor({ node }: { node: GraphNode }) {
	const config = (node.config ?? {}) as {
		name?: string; definition?: string; export?: boolean; shape?: string;
	};
	// The in-flow node can also be the type of a wired value; the hoisted one is
	// written above every value there is, so it cannot.
	const inFlow = node.def === "type.declareHere";
	/**
	 * Which shape to show, when the node has not said. The same rule the
	 * compiler uses, so the dropdown cannot claim a shape the file is not using.
	 */
	const shape = typeShapeOf(node.def, node.config ?? {});
	const setShape = (next: string) =>
		store.edit((s) => {
			const shaped = setConfig(s, node.id, { shape: next });
			// The Value pin goes with the typeof shape, and a wire left on it
			// would point at a pin that is no longer there.
			return next === "typeof" ? shaped : disconnectInput(shaped, { node: node.id, pin: "value" });
		});

	return (
		<>
			<Field label="Type name">
				<input
					className="tb"
					value={config.name ?? ""}
					placeholder="Config"
					onChange={(e) => store.edit((s) => setConfig(s, node.id, { name: e.target.value }))}
				/>
			</Field>

			<Field label="Shape">
				<select className="tb" value={shape} onChange={(e) => setShape(e.target.value)}>
					{inFlow && <option value="typeof">Type of a Value</option>}
					<option value="fields">Table of Fields</option>
					<option value="written">Custom Luau</option>
				</select>
			</Field>

			{shape === "fields" && <TypeFields node={node} />}
			{shape === "fields" && <TableLayout node={node} />}

			{shape === "written" && (
				<Field label="Definition">
					<textarea
						className="tb type-definition"
						rows={3}
						spellCheck={false}
						value={config.definition ?? ""}
						placeholder={'"idle" | "driving"'}
						onChange={(e) =>
							store.edit((s) => setConfig(s, node.id, { definition: e.target.value }))
						}
					/>
				</Field>
			)}

			{shape === "typeof" && (
				<p className="summary">
					The definition is whatever you wire into <strong>Value</strong>:{" "}
					<code>type {config.name || "Name"} = typeof(that value)</code>. Put the node after
					the thing it describes.
				</p>
			)}

			{/* One line: the box and what it is called. A checkbox does not need a
			    heading above it as well — the heading and the label were two ways
			    of saying the same thing, and reading them as a pair suggested they
			    were two different settings. What it *means* is a tooltip, which is
			    where an explanation belongs once the name is clear enough. */}
			<label className="check-row" title="Can other scripts see or use this type definition?">
				<input
					type="checkbox"
					checked={config.export !== false}
					onChange={(e) => store.edit((s) => setConfig(s, node.id, { export: e.target.checked }))}
				/>
				<span>Is Export Type</span>
			</label>
		</>
	);
}

/**
 * Whether a string key is written plainly or in brackets.
 *
 * `t.tuning` and `t["tuning"]` are the same access and Luau takes both, so this
 * is a setting rather than a rule — the generated file is meant to be read
 * beside hand-written Luau, and which one reads better depends on the table. A
 * settings table wants `tuning.turnRate`. A table keyed by names that only
 * happen to be identifiers today wants the brackets it will need tomorrow.
 *
 * Only a key that is a literal string and a valid Luau name can be written
 * plainly at all; a computed key, a number, or anything with a space in it
 * stays bracketed whatever this says.
 */
/**
 * Whether a table is written on one line or one key to a line.
 *
 * Make Dictionary's, and a Table of Fields type's: the same choice about the
 * same braces, so the same control and the same `layout` config key.
 *
 * Inline is right for two or three keys and unreadable for ten, which is the
 * length a settings table actually is. stylua would break a long one for you,
 * but only if it is installed -- and what the generated file looks like should
 * not depend on whether an optional tool happens to be on PATH.
 */
function TableLayout({ node }: { node: GraphNode }) {
	const current = (node.config as { layout?: string } | undefined)?.layout === "lines"
		? "lines"
		: "inline";
	return (
		<Field label="Layout">
			<select
				className="tb"
				value={current}
				onChange={(e) => store.edit((s) => setConfig(s, node.id, { layout: e.target.value }))}
			>
				<option value="inline">Inline</option>
				<option value="lines">One per line</option>
			</select>
		</Field>
	);
}

/**
 * Which of the two strings a Concatenate writes.
 *
 * `a .. " has no " .. name` and the interpolated form are the same string, and
 * which reads better is a judgement about the line rather than about the
 * graph: two values joined are plainer as a join, and a sentence with three
 * values in it is a sentence with holes in it.
 *
 * Stored on the node, as the brackets are, because it is part of the file
 * everybody on the project reads. **New concatenate nodes** in Settings
 * decides what one you drop today starts as.
 */
function ConcatStyle({ node }: { node: GraphNode }) {
	const on = (node.config as { interpolate?: unknown } | undefined)?.interpolate === true;
	return (
		<Field
			label="Writes"
			hint="The same string either way. Interpolation needs Luau, which both targets are."
		>
			<select
				className="tb"
				value={on ? "interpolate" : "join"}
				onChange={(e) =>
					store.edit((s) =>
						setConfig(s, node.id, {
							interpolate: e.target.value === "interpolate" || undefined,
						}),
					)
				}
			>
				<option value="join">A join — a .. b</option>
				<option value="interpolate">An interpolated string</option>
			</select>
		</Field>
	);
}

/**
 * Whether an operator pill brackets what it works out.
 *
 * Off by default, because the emitter now brackets exactly what Luau's
 * precedence requires and `(not humanoid) or (not root)` was never one of them.
 * On is for the house style that wants every operand grouped out loud; it is
 * never *needed*, which is why it is a preference and not a correctness switch.
 *
 * What a new pill starts as comes from Settings — see `logicParens`.
 */
function OperatorBrackets({ node }: { node: GraphNode }) {
	const on = (node.config as { parens?: unknown } | undefined)?.parens === true;
	return (
		<Field
			label="Brackets"
			hint="Wraps this node's expression in ( ). Precedence is handled either way; this is about how the line reads."
		>
			<select
				className="tb"
				value={on ? "on" : "off"}
				onChange={(e) =>
					store.edit((s) => setConfig(s, node.id, { parens: e.target.value === "on" || undefined }))
				}
			>
				<option value="off">Only where Luau needs them</option>
				<option value="on">Always — (a and b)</option>
			</select>
		</Field>
	);
}

/**
 * How a Cast reaches its value: as a line of its own, or spliced where it is
 * used. See `CAST_MODES`, which is where the three are described.
 */
function CastMode({ node }: { node: GraphNode }) {
	const current = castModeOf(node.config);
	const chosen = CAST_MODES.find((m) => m.mode === current);
	return (
		<Field label="Cast" hint={chosen?.what}>
			<select
				className="tb"
				value={current}
				onChange={(e) =>
					store.edit((s) => setConfig(s, node.id, {
						cast: e.target.value === "auto" ? undefined : e.target.value,
					}))
				}
			>
				{CAST_MODES.map((m) => (
					<option key={m.mode} value={m.mode}>
						{m.label}
					</option>
				))}
			</select>
		</Field>
	);
}

/**
 * `local` or `const`.
 *
 * Luau's `const` is the same binding with one guarantee: the name cannot be
 * reassigned after it is initialised. The value can still change from the
 * inside — `const t = {}` and then `t.count = 1` is fine — so this is a promise
 * about the *name*, which is what makes it worth saying out loud on the node
 * that makes it.
 *
 * Roswaal refuses a Set Local wired to one rather than letting the runtime do
 * it, because the graph knows which node made the promise.
 */
function LocalBinding({ node }: { node: GraphNode }) {
	const constant = isConstLocal(node.config);
	return (
		<Field
			label="Binding"
			hint="const cannot be reassigned. Luau added it in 2026, so a graph using it needs a runtime that has it."
		>
			<div className="segmented">
				<button
					className={!constant ? "on" : ""}
					onClick={() => store.edit((s) => setConfig(s, node.id, { const: undefined }))}
				>
					local
				</button>
				<button
					className={constant ? "on" : ""}
					onClick={() => store.edit((s) => setConfig(s, node.id, { const: true }))}
				>
					const
				</button>
			</div>
		</Field>
	);
}

/**
 * What a cast's pill writes in its middle.
 *
 * `::` is Luau's, and is the one symbol on any pill that somebody arriving from
 * another visual language has no reason to recognise. The name is the way out,
 * and the pill stays a pill either way — the shape is what says *this is a claim
 * without a check*, and that is the half worth keeping.
 *
 * On the node rather than in preferences, like the brackets: the symbol decides
 * the pill's width, and a node that is a different size on two machines is a
 * node two people's comments hold differently.
 */
function CastLabel({ node }: { node: GraphNode }) {
	const named = (node.config as { castLabel?: unknown } | undefined)?.castLabel === "name";
	return (
		<Field label="Shows" hint="What the pill writes between its pins and its result.">
			<div className="segmented">
				<button
					className={!named ? "on" : ""}
					onClick={() => store.edit((s) => setConfig(s, node.id, { castLabel: undefined }))}
				>
					Symbol
				</button>
				<button
					className={named ? "on" : ""}
					onClick={() => store.edit((s) => setConfig(s, node.id, { castLabel: "name" }))}
				>
					Name
				</button>
			</div>
		</Field>
	);
}

/**
 * Which call a Service Function node makes.
 *
 * One field for both halves, because `RunService:IsServer` is one name as far
 * as anybody thinking about it is concerned — and because the alternative is a
 * Service dropdown whose choice silently empties the Method dropdown beside it.
 *
 * Whatever is typed is committed, listed or not: the catalogue is a build of
 * Roblox's documentation and the engine moves between builds, so a method newer
 * than this one has to be reachable. A call the catalogue does not know takes
 * its argument count from the field below instead of from a signature.
 */
function CallPicker({ node }: { node: GraphNode }) {
	const [picking, setPicking] = useState(false);
	const label = callLabel(node.config);
	const split = label ? splitCall(label) : undefined;
	const known = split ? serviceMethod(split.service, split.method) : undefined;

	const pick = (value: string) => {
		const chosen = splitCall(value);
		if (!chosen) return;
		store.edit((s) => setConfig(s, node.id, { service: chosen.service, method: chosen.method }));
	};

	return (
		<>
			<Field
				label="Call"
				hint={known?.summary ?? "A method on a service. Type one the list has not caught up with."}
			>
				<button className="tb literal picker" onClick={() => setPicking(true)}>
					<span className="preview">{label ?? "Choose a call…"}</span>
					<Icon name="chevron" size={12} />
				</button>
			</Field>
			{known?.yields && (
				<p className="summary">Yields: the thread stops here until the engine comes back.</p>
			)}
			{label && !known && (
				<CountEditor node={node} field="args" label="Arguments" min={0} max={8} fallback={0} />
			)}
			{picking && (
				<ValuePicker
					what="call"
					options={CALL_OPTIONS}
					value={label ?? ""}
					groupOf={(value) => splitCall(value)?.service ?? "Other"}
					detailOf={callDetail}
					onPick={pick}
					onClose={() => setPicking(false)}
				/>
			)}
		</>
	);
}

/**
 * A Roblox datatype in a Lune graph, and the module that provides it.
 *
 * `Vector3.new(0, 10, 0)` is what the node writes, and in Lune `Vector3` is not
 * a global — it is a member of `@lune/roblox`, bound by a declaration that
 * names it. Two things have to be true, so the button does both: the module
 * declared, and the datatype pulled off it.
 *
 * Said and offered rather than done, the same as the standard library's. The
 * node appears in the menu because it *can* work here, and what makes it work
 * is a require somebody asked for.
 */
function DatatypeFromLune({ def }: { def: NodeDef }) {
	const script = useEditor().script;
	const datatype = def.subcategory;

	if (script?.target !== "lune" || def.category !== ENGINE_TYPES) return null;
	if (datatype === undefined || !LUNE_ROBLOX_DATATYPES.includes(datatype)) return null;

	const existing = (script.modules ?? []).find(
		(one) => one.specifier.trim().toLowerCase() === "@lune/roblox",
	);
	if (existing && (existing.members ?? []).includes(datatype)) return null;

	const give = () => {
		store.edit((s) => {
			const found = (s.modules ?? []).find(
				(one) => one.specifier.trim().toLowerCase() === "@lune/roblox",
			);
			if (!found) {
				const added = addModule(s, "roblox", "@lune/roblox");
				return updateModule(added.script, added.id, { members: [datatype] });
			}
			return updateModule(s, found.id, {
				members: [...new Set([...(found.members ?? []), datatype])],
			});
		});
	};

	return (
		<div className="inspector-warn">
			<p>
				Lune has <code>{datatype}</code> only through <code>@lune/roblox</code>
				{existing ? ", and this script does not pull it off the module." : ", which this script does not require."}
			</p>
			<button className="tb" onClick={give}>
				{existing ? `Add ${datatype} to ${existing.name}` : `Require @lune/roblox for ${datatype}`}
			</button>
		</div>
	);
}

/**
 * Picking a call from Lune's standard library, and declaring what it needs.
 *
 * The picker half is the service call's, with the module standing in for the
 * service. The second half is the part that matters: a Lune Function node
 * cannot compile until its module is declared, and this is where that is said
 * and where it can be done.
 *
 * **Said, and offered — not done.** The button declares `@lune/fs` because you
 * pressed it. Declaring it for you when you picked the call would be the
 * editor expanding what the project depends on without being asked, which is
 * the rule the whole module design rests on. The distance between "we did it"
 * and "here is the button" is the whole of that rule.
 */
function LuneCallPicker({ node }: { node: GraphNode }) {
	const [picking, setPicking] = useState(false);
	const script = useEditor().script;
	const label = luneCallLabel(node.config);
	const split = label ? splitLuneCall(label) : undefined;
	const known = split ? luneFunction(split.module, split.call) : undefined;

	const specifier = requiredSpecifier(node.config);
	const declared = (script?.modules ?? []).some(
		(one) => one.specifier.trim().toLowerCase() === specifier.toLowerCase(),
	);

	const pick = (value: string) => {
		const chosen = splitLuneCall(value);
		if (!chosen) return;
		store.edit((s) => setConfig(s, node.id, { module: chosen.module, call: chosen.call }));
	};

	return (
		<>
			<Field
				label="Call"
				hint={known?.summary ?? "A function from Lune's standard library."}
			>
				<button className="tb literal picker" onClick={() => setPicking(true)}>
					<span className="preview">{label ?? "Choose a call…"}</span>
					<Icon name="chevron" size={12} />
				</button>
			</Field>

			{label && !declared && (
				<div className="inspector-warn">
					<p>
						This needs <code>{specifier}</code>, and nothing in this script requires it.
						Roswaal will not add a require you did not ask for.
					</p>
					<button
						className="tb"
						onClick={() => store.edit((s) => addModule(s, split?.module ?? "module", specifier).script)}
					>
						Declare {specifier}
					</button>
				</div>
			)}

			{picking && (
				<ValuePicker
					what="call"
					options={LUNE_CALL_OPTIONS}
					value={label ?? ""}
					groupOf={(value) => splitLuneCall(value)?.module ?? "Other"}
					detailOf={luneCallDetail}
					onPick={pick}
					onClose={() => setPicking(false)}
				/>
			)}
		</>
	);
}

/**
 * What a loop calls the two values it hands the body.
 *
 * `key` and `value` are a placeholder rather than a name, and every line under
 * the loop then talks about `value` — the one word in the block that says
 * nothing about what is in it. Naming them is the first thing a hand-written
 * loop does.
 *
 * Free text, coerced to an identifier by the emitter rather than validated
 * here: a name is typed one letter at a time, and a field that goes red on the
 * way to a good name is a field that is wrong more often than it is right.
 */
function LoopNames({ node, array }: { node: GraphNode; array: boolean }) {
	const config = (node.config ?? {}) as { keyName?: string; valueName?: string };
	const types = loopTypes(node.config ?? {});
	/** Blank clears the annotation rather than writing `any`. */
	const setType = (field: "keyType" | "valueType") => (type: string) =>
		store.edit((s) => setConfig(s, node.id, { [field]: type === "any" ? undefined : type }));

	return (
		<>
			<Field label={array ? "Index name" : "Key name"}>
				<input
					className="tb"
					value={config.keyName ?? ""}
					placeholder={array ? "i" : "key"}
					onChange={(e) => store.edit((s) => setConfig(s, node.id, { keyName: e.target.value }))}
				/>
			</Field>
			{/* An array's index is a number and has nothing to choose, so the
			    picker is only offered for a table's key. */}
			{!array && (
				<Field
					label="Key type"
					hint="Written after the name when the graph is Nonstrict or Strict, and types the Key pin either way."
				>
					<TypePicker value={types.key ?? "any"} onChange={setType("keyType")} />
				</Field>
			)}
			<Field label="Value name">
				<input
					className="tb"
					value={config.valueName ?? ""}
					placeholder="value"
					onChange={(e) => store.edit((s) => setConfig(s, node.id, { valueName: e.target.value }))}
				/>
			</Field>
			<Field
				label="Value type"
				hint="Written after the name when the graph is Nonstrict or Strict, and types the Value pin either way."
			>
				<TypePicker value={types.value ?? "any"} onChange={setType("valueType")} />
			</Field>
		</>
	);
}

function KeyStyle({ node }: { node: GraphNode }) {
	const current = (node.config as { keys?: string } | undefined)?.keys === "brackets"
		? "brackets"
		: "plain";
	return (
		<Field label="String keys">
			<select
				className="tb"
				value={current}
				onChange={(e) => store.edit((s) => setConfig(s, node.id, { keys: e.target.value }))}
			>
				<option value="plain">Property-like — t.name</option>
				<option value="brackets">Bracketed — t["name"]</option>
			</select>
		</Field>
	);
}

/** An empty value of each kind the Value field offers. */
const BLANK: Record<string, Literal> = {
	string: { t: "string", v: "" },
	number: { t: "number", v: 0 },
	boolean: { t: "boolean", v: false },
	raw: { t: "raw", v: "nil" },
	nil: { t: "nil" },
};

/**
 * A Key Value Pair's key and value, in the panel as well as on the node.
 *
 * The same two literals the node's rows edit, so neither place can disagree
 * with the other. The rows are quicker for a short key; the panel has room to
 * say what kind of value it is, which a row's one field cannot.
 */
function PairEditor({ node, def }: { node: GraphNode; def: NodeDef }) {
	const fallback = (pin: string) => def.inputs.find((p) => p.id === pin)?.default;
	const key = node.literals?.key ?? fallback("key");
	const value = node.literals?.value ?? fallback("value") ?? BLANK.nil;
	const set = (pin: string, literal: Literal) => store.edit((s) => setLiteral(s, node.id, pin, literal));

	return (
		<>
			<Field label="Key">
				<input
					className="tb"
					value={key?.t === "string" ? key.v : ""}
					placeholder="name"
					onChange={(e) => set("key", { t: "string", v: e.target.value })}
				/>
			</Field>
			<Field label="Value" hint="Ignored while a wire is plugged into Value.">
				<div className="field-row">
					<select
						className="tb"
						value={value.t}
						onChange={(e) => set("value", BLANK[e.target.value] ?? BLANK.nil)}
					>
						<option value="string">String</option>
						<option value="number">Number</option>
						<option value="boolean">Boolean</option>
						<option value="raw">Luau</option>
						<option value="nil">nil</option>
					</select>
					{value.t === "string" && (
						<input className="tb" value={value.v} onChange={(e) => set("value", { t: "string", v: e.target.value })} />
					)}
					{value.t === "number" && (
						<input
							className="tb"
							type="number"
							value={value.v}
							onChange={(e) => set("value", { t: "number", v: Number(e.target.value) || 0 })}
						/>
					)}
					{value.t === "boolean" && (
						<input
							type="checkbox"
							checked={value.v}
							onChange={(e) => set("value", { t: "boolean", v: e.target.checked })}
						/>
					)}
					{value.t === "raw" && (
						<input
							className="tb"
							spellCheck={false}
							value={value.v}
							placeholder="Vector3.zero"
							onChange={(e) => set("value", { t: "raw", v: e.target.value })}
						/>
					)}
				</div>
			</Field>
		</>
	);
}

function VariablePicker({ script, node }: { script: NodeScript; node: GraphNode }) {
	const current = (node.config as { variable?: string } | undefined)?.variable ?? "";

	/**
	 * Making the variable from here, rather than sending you to the panel.
	 *
	 * Initialize Variable is the node that showed this up: it exists to give a
	 * variable its first value, and it could not be used at all until you had
	 * been somewhere else and made one. The name is asked for rather than typed
	 * into a pin because a pin's literal is inert data — a literal that created
	 * a variable as a side effect would put the name in two places and leave
	 * them to drift.
	 */
	const create = () => {
		const name = window.prompt("Name the new variable", "newVariable");
		if (name === null || name.trim() === "") return;
		store.edit((s) => {
			const added = addVariable(s, name.trim(), "any");
			return bindNodeToVariable(added.script, node.id, added.id);
		});
	};

	return (
		<Field label="Variable">
			<div className="field-row">
				<select
					className="tb"
					style={{ flex: 1 }}
					value={current}
					onChange={(e) => store.edit((s) => bindNodeToVariable(s, node.id, e.target.value))}
				>
					{current === "" && (
						<option value="">
							{script.variables.length === 0 ? "No variables yet…" : "Choose a variable…"}
						</option>
					)}
					{script.variables.map((v) => (
						<option key={v.id} value={v.id}>
							{v.name} : {v.type}
						</option>
					))}
				</select>
				<button className="tb" title="Make a variable and point this node at it" onClick={create}>
					New…
				</button>
			</div>
		</Field>
	);
}

function FunctionPicker({ script, node }: { script: NodeScript; node: GraphNode }) {
	const current = (node.config as { function?: string } | undefined)?.function ?? "";
	const functions = script.nodes.filter((n) => FUNCTION_NODES.has(n.def));
	if (functions.length === 0) {
		return <p className="summary">This graph declares no functions yet.</p>;
	}
	return (
		<Field label="Function">
			<select
				className="tb"
				value={current}
				onChange={(e) => store.edit((s) => bindNodeToFunction(s, node.id, e.target.value))}
			>
				{current === "" && <option value="">Choose a function…</option>}
				{functions.map((fn) => (
					<option key={fn.id} value={fn.id}>
						{(fn.config as { name?: string } | undefined)?.name ?? "function"}
					</option>
				))}
			</select>
		</Field>
	);
}

/**
 * The type a Declare Local is annotated with.
 *
 * Any Luau type, the way a parameter's is: the list for the everyday ones and
 * Other… for `{ [Model]: Restore }`.
 */
function LocalType({ node }: { node: GraphNode }) {
	const current = (node.config as { type?: string } | undefined)?.type;
	return (
		<Field label="Type" hint="Written after the name when the graph is Nonstrict or Strict.">
			<TypePicker
				value={current ?? "any"}
				onChange={(type) =>
					store.edit((s) => setConfig(s, node.id, { type: type === "any" ? undefined : type }))
				}
			/>
		</Field>
	);
}

/**
 * Which parameter a Get Parameter reads: whose, and then which.
 *
 * Two steps rather than one flat list, because parameter names repeat across
 * functions — a list of bare names would offer three called `character` with
 * nothing to tell them apart.
 *
 * The owners are a **wider** set than `FunctionPicker`'s. Connect and Once bind
 * their handler's parameters exactly as the two declarations do, so a handler
 * is a legitimate thing to read a parameter from, and offering only functions
 * here would make a working graph unbuildable from the Inspector.
 */
function ParamPicker({ script, node }: { script: NodeScript; node: GraphNode }) {
	const ref = (node.config ?? {}) as { function?: string; param?: string };
	// The function whose graph this node is in comes first: it is nearly always
	// the one meant.
	const owners = script.nodes
		.filter((n) => FUNCTION_NODES.has(n.def) || n.def === "event.connect" || n.def === "event.once")
		.sort((a, b) => Number(b.id === node.graph) - Number(a.id === node.graph));
	if (owners.length === 0) {
		return <p className="summary">This graph has no functions or handlers with parameters yet.</p>;
	}

	const owner = owners.find((n) => n.id === ref.function);
	const params =
		((owner?.config as { params?: { name: string; type?: string }[] } | undefined)?.params) ?? [];

	/** Picking an owner clears a parameter that owner does not have. */
	const chooseOwner = (id: string) => {
		const next = owners.find((n) => n.id === id);
		const list =
			((next?.config as { params?: { name: string }[] } | undefined)?.params) ?? [];
		const keep = list.some((p) => p.name === ref.param) ? ref.param : list[0]?.name;
		store.edit((s) => setConfig(s, node.id, { function: id, param: keep, type: undefined }));
	};

	const chooseParam = (name: string) => {
		const found = params.find((p) => p.name === name);
		store.edit((s) => setConfig(s, node.id, { param: name, type: found?.type }));
	};

	return (
		<>
			<Field label="From">
				<select
					className="tb"
					value={ref.function ?? ""}
					onChange={(e) => chooseOwner(e.target.value)}
				>
					{ref.function === undefined && <option value="">Choose a function…</option>}
					{owners.map((fn) => (
						<option key={fn.id} value={fn.id}>
							{/* A handler has no name of its own — it is identified by the
						    signal it listens to, which is a wire rather than a
						    label — so it is named by what it is. */}
						{(fn.config as { name?: string } | undefined)?.name
								|| (FUNCTION_NODES.has(fn.def) ? "function" : "handler")}
						</option>
					))}
				</select>
			</Field>

			<Field label="Parameter" hint="Reads it wherever this node sits inside that body.">
				{params.length === 0 ? (
					<p className="summary">That one has no parameters yet.</p>
				) : (
					<select
						className="tb"
						value={ref.param ?? ""}
						onChange={(e) => chooseParam(e.target.value)}
					>
						{ref.param === undefined && <option value="">Choose a parameter…</option>}
						{params.map((p) => (
							<option key={p.name} value={p.name}>
								{p.name}
							</option>
						))}
					</select>
				)}
			</Field>
		</>
	);
}

function LocalPicker({ script, node }: { script: NodeScript; node: GraphNode }) {
	const current = (node.config as { local?: string } | undefined)?.local ?? "";
	const locals = script.nodes.filter((n) => n.def === "local.declare");
	if (locals.length === 0) {
		return <p className="summary">This graph declares no locals yet.</p>;
	}
	return (
		<Field label="Local">
			<select
				className="tb"
				value={current}
				onChange={(e) => store.edit((s) => bindNodeToLocal(s, node.id, e.target.value))}
			>
				{current === "" && <option value="">Choose a local…</option>}
				{locals.map((local) => (
					<option key={local.id} value={local.id}>
						{localNameOf(local)}
					</option>
				))}
			</select>
		</Field>
	);
}

interface CountEditorProps {
	node: GraphNode;
	field: string;
	label: string;
	min: number;
	max: number;
	fallback: number;
}

/** A numeric config field that changes how many pins a node has. */
function CountEditor({ node, field, label, min, max, fallback }: CountEditorProps) {
	const value = Number((node.config ?? {})[field] ?? fallback);
	return (
		<Field label={label}>
			<input
				className="tb"
				type="number"
				min={min}
				max={max}
				value={value}
				onChange={(e) => {
					const next = Math.max(min, Math.min(max, Number(e.target.value)));
					store.edit((s) =>
						setConfig(s, node.id, { [field]: Number.isFinite(next) ? next : fallback }),
					);
				}}
			/>
		</Field>
	);
}

interface ListEditorProps {
	node: GraphNode;
	field: "params" | "returns" | "exports";
	title: string;
	hint?: string;
}

function ListEditor({ node, field, title, hint }: ListEditorProps) {
	const list = ((node.config ?? {})[field] as { name: string; type?: string }[]) ?? [];

	const write = (next: { name: string; type?: string }[]) => {
		store.edit((s) => {
			const updated = setConfig(s, node.id, { [field]: next });
			// Changing a function's returns has to reach its Return nodes, or the
			// graph and the signature drift apart silently.
			if (field === "returns" && FUNCTION_NODES.has(node.def)) {
				return syncFunctionReturns(updated, node.id);
			}
			// And renaming a parameter has to reach every Get Parameter reading
			// it. The whole array is rewritten on each keystroke, so the sync is
			// handed both versions and works out what actually happened.
			if (field === "params") return syncParamRefs(updated, node.id, list, next);
			return updated;
		});
	};

	return (
		<div className="list-editor">
			<div className="list-title">
				<span>{title}</span>
				<button
					className="tb"
					onClick={() => write([...list, { name: `${field === "returns" ? "value" : "arg"}${list.length + 1}`, type: "any" }])}
				>
					Add
				</button>
			</div>
			{hint && <p className="summary">{hint}</p>}
			{list.map((entry, i) => (
				<div className="list-row" key={i}>
					<input
						className="tb"
						value={entry.name}
						onChange={(e) => {
							const next = [...list];
							next[i] = { ...entry, name: e.target.value };
							write(next);
						}}
					/>
					<TypePicker
						value={entry.type}
						onChange={(type) => {
							const next = [...list];
							next[i] = { ...entry, type };
							write(next);
						}}
					/>
					<button
						className="tb"
						title="Remove"
						onClick={() => write(list.filter((_, j) => j !== i))}
					>
						×
					</button>
				</div>
			))}
			{list.length === 0 && <p className="summary">None.</p>}
		</div>
	);
}

function PinSummary({ def, node }: { def: NodeDef; node: GraphNode }) {
	const { inputs, outputs } = resolvePins(def, node.config, node.literals);
	const data = [...inputs, ...outputs].filter((p) => p.kind === "data");
	if (data.length === 0) return null;
	return (
		<div className="list-editor">
			<div className="list-title">
				<span>Data pins</span>
			</div>
			{data.map((pin) => (
				<div className="pin-summary" key={`${pin.kind}${pin.id}`}>
					<span>{pin.name || pin.id}</span>
					<span className="type">{pin.type}</span>
				</div>
			))}
		</div>
	);
}

function Field(
	{ label, hint, children }:
		{ label: string; hint?: string; children: React.ReactNode },
) {
	return (
		<label className="field" title={hint}>
			<span>{label}</span>
			{children}
		</label>
	);
}
