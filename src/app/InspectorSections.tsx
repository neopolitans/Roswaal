/**
 * What the Inspector shows for each kind of node, below its label.
 *
 * `INSPECTOR_SECTIONS` is the table: each row says which nodes it is for and
 * what it draws, in the order the panel draws them. A node gets every row that
 * applies to it, so a cast shows both its label and its mode, and a node no
 * row names shows only its label and its pins. Adding a section for a node is
 * a row here, not another conditional in the panel.
 *
 * Not the panel itself (`Inspector.tsx`), which picks the node and draws the
 * heading, the summary and the label above these.
 */

import { type ComponentType, type ReactNode, useMemo, useState } from "react";
import { bindsParameters } from "../core/functionBody.js";
import { checkLuau } from "../core/luau/check.js";
import { LUNE_ROBLOX_DATATYPES } from "../core/luneApi.js";
import {
	LUNE_CALL,
	LUNE_CALL_OPTIONS,
	LUNE_VALUE,
	luneCallDetail,
	callLabel as luneCallLabel,
	luneFunction,
	requiredSpecifier,
	splitLuneCall,
} from "../core/luneCalls.js";
import { membersFor } from "../core/members.js";
import {
	FUNCTION_NODES,
	HANDLER_NODES,
	loopTypes,
	signatureOf,
	typeShapeOf,
} from "../core/nodes/flow.js";
import { CAST_MODES, CAST_NODES, castModeOf } from "../core/nodes/library.js";
import { isConstLocal, localNameOf, pinTypeText } from "../core/nodes/variables.js";
import {
	eventOf,
	eventsOf,
	type InstanceEvent,
	instanceClassInto,
	signalEventOf,
} from "../core/robloxEvents.js";
import {
	ENGINE_TYPES,
	type GraphNode,
	type Literal,
	type NodeDef,
	type NodeScript,
} from "../core/schema.js";
import {
	SCRIPT_CALLS,
	scriptCallLabel,
	scriptCallOf,
	WIRED_CALLS,
	wiredSignatureOf,
} from "../core/scriptCalls.js";
import {
	CALL_OPTIONS,
	callDetail,
	callLabel,
	SERVICE_CALL,
	SERVICE_VALUE,
	serviceMethod,
	splitCall,
} from "../core/serviceCalls.js";
import { requestCodeEdit } from "./codeEditRequests.js";
import { cx } from "./cx.js";
import { useEditBurst } from "./editBurst.js";
import {
	addModule,
	addVariable,
	bindNodeToFunction,
	bindNodeToLocal,
	bindNodeToVariable,
	disconnectInput,
	setConfig,
	setLiteral,
	setPinType,
	syncFunctionRefs,
	syncFunctionReturns,
	syncParamRefs,
	updateModule,
} from "./edits.js";
import { resolvePins } from "./geometry.js";
import { highlightLuau } from "./highlight.js";
import { Icon } from "./icons.jsx";
import { configEntries, configFlag, configText, type NamedEntry, paramsOf } from "./nodeConfig.js";
import { AddButton, SectionHead, useFold } from "./PanelParts.jsx";
import { pinColor } from "./palette.js";
import { requiredTypes, useProjectTypes } from "./projectTypes.js";
import { store, useEditor } from "./store.js";
import { TypePicker } from "./TypePicker.jsx";
import { ValuePicker } from "./ValuePicker.jsx";

/** What every section is handed. Most read only the node. */
export interface SectionProps {
	node: GraphNode;
	def: NodeDef;
	/** The whole script, for the pickers that list what it declares. */
	script: NodeScript;
}

/** One row of the table: which nodes, and what to draw for them. */
interface SectionRule {
	applies: (def: NodeDef) => boolean;
	Section: ComponentType<SectionProps>;
}

/** A rule for the nodes with these ids. */
function ids(...list: string[]): (def: NodeDef) => boolean {
	const set = new Set(list);
	return (def) => set.has(def.id);
}

/**
 * Every section, in the order the panel draws them.
 *
 * A cast is a pill and brackets its own expression already, so the brackets
 * row leaves casts out — offering the toggle would offer a second pair.
 */
const INSPECTOR_SECTIONS: readonly SectionRule[] = [
	{ applies: namesResult, Section: ResultName },
	{ applies: (def) => FUNCTION_NODES.has(def.id), Section: FunctionEditor },
	{ applies: ids("function.return"), Section: ReturnList },
	{ applies: ids("module.exports"), Section: ExportList },
	{ applies: ids("value.member"), Section: MemberEditor },
	{ applies: ids("event.on"), Section: EventPicker },
	{ applies: (def) => HANDLER_NODES.has(def.id), Section: HandlerParams },
	{ applies: ids("string.concat"), Section: ConcatStyle },
	{
		applies: (def) => def.display === "operator" && !CAST_NODES.has(def.id),
		Section: OperatorBrackets,
	},
	{ applies: (def) => CAST_NODES.has(def.id), Section: CastLabel },
	{ applies: (def) => CAST_NODES.has(def.id), Section: CastMode },
	{ applies: ids("flow.forEach", "flow.forIndex"), Section: LoopNames },
	{ applies: ids("table.dictionary", "table.getKey", "table.setKey"), Section: KeyStyle },
	{ applies: ids("table.pair"), Section: PairEditor },
	{ applies: ids("table.dictionary"), Section: TableLayout },
	{ applies: ids("flow.sequence"), Section: SequenceCount },
	{ applies: ids("call.function", "call.value", "call.method"), Section: ArgumentCount },
	{ applies: (def) => SCRIPT_CALLS.has(def.id), Section: ScriptCallSource },
	{ applies: ids(SERVICE_CALL, SERVICE_VALUE), Section: CallPicker },
	{ applies: ids(LUNE_CALL, LUNE_VALUE), Section: LuneCallPicker },
	// Every node: it decides for itself, from the graph's target.
	{ applies: () => true, Section: DatatypeFromLune },
	{ applies: ids("type.declareTop", "type.declareHere"), Section: TypeEditor },
	{ applies: ids("variable.get", "variable.set", "variable.init"), Section: VariablePicker },
	{ applies: ids("function.get"), Section: FunctionPicker },
	{ applies: ids("function.getParam"), Section: ParamPicker },
	{ applies: ids("local.get"), Section: LocalPicker },
	{ applies: ids("local.declare"), Section: LocalBinding },
	{ applies: ids("local.declare"), Section: LocalType },
	{ applies: () => true, Section: PinSummary },
];

/** The sections for one node, drawn in table order. */
export function InspectorSections(props: SectionProps): ReactNode {
	return INSPECTOR_SECTIONS.filter((rule) => rule.applies(props.def)).map(({ Section }, i) => (
		<Section key={i} {...props} />
	));
}

/**
 * Whether this node's label also names something in the generated Luau.
 *
 * A `call` node binds its result to a local and takes the name from the label,
 * so labelling a Find First Child "value" emits `local value = ...` instead of
 * `local Child = ...` followed by a second local to rename it.
 */
function namesResult(def: NodeDef): boolean {
	if (def.compilesTo.kind === "call") return true;
	// A Script Function binds its result as a call node does, step or value.
	if (SCRIPT_CALLS.has(def.id)) return true;
	// A pure node binds a local too, as soon as anything reads its value
	// twice -- Find First Child is one. A pure *builtin* stays out: it
	// resolves to a bare identifier and is never bound, so a name there would
	// do nothing.
	return def.compilesTo.kind === "expr" && (def.outputs ?? []).some((pin) => pin.kind === "data");
}

/** A Return's values, kept in step with the function it returns from. */
function ReturnList({ node }: SectionProps) {
	return (
		<ListEditor
			node={node}
			field="returns"
			title="Returns"
			hint="Kept in step with the Function node this returns from."
		/>
	);
}

/** What a module returns, one pin per key. */
function ExportList({ node }: SectionProps) {
	return (
		<ListEditor
			node={node}
			field="exports"
			title="Exports"
			hint="One pin per key on the returned table. A single pin named “value” returns that value directly instead of wrapping it."
		/>
	);
}

/** An event's parameters as a signature: `(otherPart: BasePart)`. */
function eventSignature(event: InstanceEvent): string {
	return `(${event.params.map((p) => `${p.name}: ${p.type}`).join(", ")})`;
}

/**
 * The event an On Event connects to, from the events the wired instance's
 * class fires, its ancestors' included. Picking one brings its parameters.
 */
function EventPicker({ node }: { node: GraphNode }) {
	const editor = useEditor();
	const [picking, setPicking] = useState(false);
	const current = configText(node, "event") ?? "";

	const className = useMemo(() => {
		const registry = store.getRegistry();
		if (!editor.script || !registry) return undefined;
		return instanceClassInto({ script: editor.script, registry }, node.id, "instance");
	}, [editor.script, node.id]);
	const events = useMemo(() => eventsOf(className ?? "Instance"), [className]);

	const pick = (name: string) => {
		const event = events.find((e) => e.name === name);
		const params = (event?.params ?? []).map((p) => ({ ...p }));
		store.edit((s) => setConfig(s, node.id, { event: name, params }));
		setPicking(false);
	};

	return (
		<>
			<Field
				label="Event"
				hint={
					className
						? `What a ${className} fires.`
						: "What every instance fires. Wire in an instance of a known class for its own events."
				}
			>
				<button className="tb type-picker" onClick={() => setPicking(true)}>
					<span className="preview">{current || "choose"}</span>
					<Icon name="chevron" size={12} />
				</button>
			</Field>
			{picking && (
				<ValuePicker
					what="event"
					options={events.map((e) => e.name)}
					value={current}
					detailOf={(name) => {
						const event = events.find((e) => e.name === name);
						return event ? eventSignature(event) : "";
					}}
					onPick={pick}
					onClose={() => setPicking(false)}
				/>
			)}
		</>
	);
}

/**
 * What a handler is handed. When the engine knows the event, a button puts its
 * parameters back: after an edit, or for a Connect wired before its class was.
 */
function HandlerParams({ node }: SectionProps) {
	const editor = useEditor();
	const known = useMemo(() => {
		const registry = store.getRegistry();
		if (!editor.script || !registry) return undefined;
		const lookup = { script: editor.script, registry };
		return node.def === "event.on"
			? eventOf(
					instanceClassInto(lookup, node.id, "instance") ?? "Instance",
					configText(node, "event") ?? "",
				)
			: signalEventOf(lookup, node.id);
	}, [editor.script, node]);
	const params = signatureOf(node.config).params ?? [];
	const matches =
		known !== undefined &&
		known.params.length === params.length &&
		known.params.every((p, i) => p.name === params[i].name && p.type === params[i].type);

	return (
		<>
			<ListEditor
				node={node}
				field="params"
				title="Handler parameters"
				hint="Whatever the signal passes to its listener."
			/>
			{known && !matches && (
				<button
					className="tb"
					onClick={() =>
						store.edit((s) =>
							setConfig(s, node.id, { params: known.params.map((p) => ({ ...p })) }),
						)
					}
				>
					Use {known.name}'s parameters {eventSignature(known)}
				</button>
			)}
		</>
	);
}

/** How many outputs a Sequence has. */
function SequenceCount({ node }: SectionProps) {
	return <CountEditor node={node} field="count" label="Outputs" min={2} max={12} fallback={2} />;
}

/** How many arguments a Call Function or Call Method passes. */
function ArgumentCount({ node, def }: SectionProps) {
	// Wired from a declared function, the arguments are that function's.
	const wired = WIRED_CALLS.has(def.id) ? wiredSignatureOf(node.config) : undefined;
	if (wired) {
		return (
			<p className="summary">
				Arguments follow <code>{wired.name}</code>'s parameters while it is wired in.
			</p>
		);
	}
	return <CountEditor node={node} field="args" label="Arguments" min={0} max={8} fallback={1} />;
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
	const typing = useEditBurst();
	const current = configText(node, "member") ?? "";

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
		// function. Scoped to the open graph, a Get Member in a function's
		// body could not see the type declared beside it.
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
						onChange={(e) => typing.edit((s) => setConfig(s, node.id, { member: e.target.value }))}
						{...typing.field}
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
 * Its own field rather than the node's label, so naming the result does not
 * stop a Find First Child saying Find First Child. It shows under the header,
 * the way Declare Type shows the type it declares.
 */
function ResultName({ node }: { node: GraphNode }) {
	const typing = useEditBurst();
	const current = configText(node, "resultName") ?? "";
	return (
		<Field label="Result name" hint="The local this node's result lands in.">
			<input
				className="tb"
				value={current}
				placeholder="chosen for you"
				onChange={(e) => typing.edit((s) => setConfig(s, node.id, { resultName: e.target.value }))}
				{...typing.field}
			/>
		</Field>
	);
}

function FunctionEditor({ node }: { node: GraphNode }) {
	const typing = useEditBurst();
	const name = configText(node, "name") ?? "";
	return (
		<>
			<Field label="Function name">
				<input
					className="tb"
					value={name}
					placeholder="doSomething"
					onChange={(e) =>
						typing.edit((s) => syncFunctionRefs(setConfig(s, node.id, { name: e.target.value })))
					}
					{...typing.field}
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
 * required module's, then Luau's and Roblox's -- so `Config`, declared four
 * nodes away, is offered beside `Vector3`.
 *
 * Whatever you type is still taken, listed or not, so `{ Player }` and
 * `Model?` can be typed in.
 */
function TypeFields({ node }: { node: GraphNode }) {
	const typing = useEditBurst();
	const fields = configEntries(node, "fields");
	const write = (next: NamedEntry[]) => store.edit((s) => setConfig(s, node.id, { fields: next }));
	const [open, toggle] = useFold();

	return (
		<div className="list-editor">
			<SectionHead title="Fields" count={fields.length} open={open} onToggle={toggle}>
				<AddButton
					onClick={() => write([...fields, { name: `field${fields.length + 1}`, type: "number" }])}
				/>
			</SectionHead>
			{open &&
				fields.map((entry, i) => (
					<div className="list-row" key={i}>
						<span
							className="pin-dot"
							style={{ "--pin": pinColor(entry.type, "data") } as React.CSSProperties}
						/>
						<input
							className="tb"
							value={entry.name}
							placeholder="name"
							onChange={(e) => {
								const next = [...fields];
								next[i] = { ...entry, name: e.target.value };
								typing.edit((s) => setConfig(s, node.id, { fields: next }));
							}}
							{...typing.field}
						/>
						<TypePicker
							value={entry.type}
							onChange={(type) => {
								const next = [...fields];
								next[i] = { ...entry, type };
								write(next);
							}}
						/>
						<button
							className="tb list-remove"
							title="Remove"
							aria-label={`Remove ${entry.name}`}
							onClick={() => write(fields.filter((_, j) => j !== i))}
						>
							<Icon name="close" size={13} />
						</button>
					</div>
				))}
			{open && fields.length === 0 && <p className="summary">No fields yet.</p>}
		</div>
	);
}

/**
 * A Declare Type written out in Luau: shown here, edited in the code editor.
 *
 * Not a plain text box, which would take a table type missing a comma and
 * let it break the file in Studio. The code editor parses it as a type while
 * you write, with the same parser the build runs, and this preview carries
 * the first mistake so it is seen without opening it.
 */
function WrittenType({
	node,
	name,
	definition,
}: {
	node: GraphNode;
	name?: string;
	definition?: string;
}) {
	const text = definition ?? "";
	const problem = text.trim() === "" ? undefined : checkLuau(text, "type")[0];
	const open = () =>
		requestCodeEdit({
			nodeId: node.id,
			field: "definition",
			value: text,
			kind: "type",
			title: `type ${name || "Name"}`,
			hint: "Written into the generated file as this type's definition",
		});
	return (
		<Field label="Definition">
			<button
				type="button"
				className={cx("type-definition", problem && "bad")}
				onClick={open}
				title="Edit in the code editor"
			>
				{text.trim() === "" ? (
					<span className="placeholder">{'"idle" | "driving"'}</span>
				) : (
					highlightLuau(text).map((line, i) => (
						<span className="line" key={i}>
							{line.map((token, j) =>
								token.cls === "" ? (
									token.text
								) : (
									<span key={j} className={token.cls}>
										{token.text}
									</span>
								),
							)}
						</span>
					))
				)}
			</button>
			{problem && (
				<p className="type-definition-problem">
					{problem.message} <span className="where">line {problem.line}</span>
				</p>
			)}
		</Field>
	);
}

/**
 * The Luau type a Declare Type node writes out.
 *
 * Edited here rather than as a set of pins, and that is the honest shape: a
 * type is not built out of values, so there is nothing for a node to be.
 * `{ speed: number }` describes something no wire can carry.
 */
function TypeEditor({ node }: { node: GraphNode }) {
	const typing = useEditBurst();
	const name = configText(node, "name");
	const definition = configText(node, "definition");
	// The in-flow node can also be the type of a wired value; the hoisted one is
	// written above every value there is, so it cannot.
	const inFlow = node.def === "type.declareHere";
	// Which shape to show, when the node has not said. The same rule the
	// compiler uses, so the dropdown cannot claim a shape the file is not using.
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
					value={name ?? ""}
					placeholder="Config"
					onChange={(e) => typing.edit((s) => setConfig(s, node.id, { name: e.target.value }))}
					{...typing.field}
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

			{shape === "written" && <WrittenType node={node} name={name} definition={definition} />}

			{shape === "typeof" && (
				<p className="summary">
					The definition is whatever you wire into <strong>Value</strong>:{" "}
					<code>type {name || "Name"} = typeof(that value)</code>. Put the node after the thing it
					describes.
				</p>
			)}

			{/* One line: the box and what it is called. A heading above it as well
			    would say the same thing twice, and read as two settings. What it
			    *means* is a tooltip, which is where an explanation belongs once
			    the name is clear enough. */}
			<label className="check-row" title="Can other scripts see or use this type definition?">
				<input
					type="checkbox"
					checked={node.config?.export !== false}
					onChange={(e) => store.edit((s) => setConfig(s, node.id, { export: e.target.checked }))}
				/>
				<span>Is Export Type</span>
			</label>
		</>
	);
}

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
	const current = configText(node, "layout") === "lines" ? "lines" : "inline";
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
	const on = configFlag(node, "interpolate");
	return (
		<Field
			label="Concatenation Type"
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
				<option value="join">String Joining: a..b</option>
				<option value="interpolate">Interpolation: {"{a} {b}"}</option>
			</select>
		</Field>
	);
}

/**
 * Whether an operator pill brackets what it works out.
 *
 * Off by default, because the emitter brackets exactly what Luau's
 * precedence requires and `(not humanoid) or (not root)` was never one of them.
 * On is for the house style that wants every operand grouped out loud; it is
 * never *needed*, which is why it is a preference and not a correctness switch.
 *
 * What a new pill starts as comes from Settings — see `logicParens`.
 */
function OperatorBrackets({ node }: { node: GraphNode }) {
	const on = configFlag(node, "parens");
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
					store.edit((s) =>
						setConfig(s, node.id, {
							cast: e.target.value === "auto" ? undefined : e.target.value,
						}),
					)
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
	const named = configText(node, "castLabel") === "name";
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
				{existing
					? ", and this script does not pull it off the module."
					: ", which this script does not require."}
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
			<Field label="Call" hint={known?.summary ?? "A function from Lune's standard library."}>
				<button className="tb literal picker" onClick={() => setPicking(true)}>
					<span className="preview">{label ?? "Choose a call…"}</span>
					<Icon name="chevron" size={12} />
				</button>
			</Field>

			{label && !declared && (
				<div className="inspector-warn">
					<p>
						This needs <code>{specifier}</code>, and nothing in this script requires it. Roswaal
						will not add a require you did not ask for.
					</p>
					<button
						className="tb"
						onClick={() =>
							store.edit((s) => addModule(s, split?.module ?? "module", specifier).script)
						}
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
function LoopNames({ node, def }: SectionProps) {
	const typing = useEditBurst();
	const array = def.id === "flow.forIndex";
	const keyName = configText(node, "keyName") ?? "";
	const valueName = configText(node, "valueName") ?? "";
	const types = loopTypes(node.config ?? {});
	// `any` clears the annotation rather than writing `any`.
	const setType = (field: "keyType" | "valueType") => (type: string) =>
		store.edit((s) => setConfig(s, node.id, { [field]: type === "any" ? undefined : type }));

	return (
		<>
			<Field label={array ? "Index name" : "Key name"}>
				<input
					className="tb"
					value={keyName}
					placeholder={array ? "i" : "key"}
					onChange={(e) => typing.edit((s) => setConfig(s, node.id, { keyName: e.target.value }))}
					{...typing.field}
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
					value={valueName}
					placeholder="value"
					onChange={(e) => typing.edit((s) => setConfig(s, node.id, { valueName: e.target.value }))}
					{...typing.field}
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
function KeyStyle({ node }: { node: GraphNode }) {
	const current = configText(node, "keys") === "brackets" ? "brackets" : "plain";
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
	const typing = useEditBurst();
	const set = (pin: string, literal: Literal) =>
		store.edit((s) => setLiteral(s, node.id, pin, literal));
	const type = (pin: string, literal: Literal) =>
		typing.edit((s) => setLiteral(s, node.id, pin, literal));

	return (
		<>
			<Field label="Key">
				<input
					className="tb"
					value={key?.t === "string" ? key.v : ""}
					placeholder="name"
					onChange={(e) => type("key", { t: "string", v: e.target.value })}
					{...typing.field}
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
						<input
							className="tb"
							value={value.v}
							onChange={(e) => type("value", { t: "string", v: e.target.value })}
							{...typing.field}
						/>
					)}
					{value.t === "number" && (
						<input
							className="tb"
							type="number"
							value={value.v}
							onChange={(e) => type("value", { t: "number", v: Number(e.target.value) || 0 })}
							{...typing.field}
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
							onChange={(e) => type("value", { t: "raw", v: e.target.value })}
							{...typing.field}
						/>
					)}
				</div>
			</Field>
		</>
	);
}

function VariablePicker({ script, node }: { script: NodeScript; node: GraphNode }) {
	const current = configText(node, "variable") ?? "";

	// Making the variable from here, rather than sending you to the panel:
	// Initialize Variable exists to give a variable its first value, and is
	// no use until there is one. The name is asked for rather than typed into
	// a pin because a pin's literal is inert data — a literal that created a
	// variable as a side effect would put the name in two places to drift.
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
	const current = configText(node, "function") ?? "";
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
						{configText(fn, "name") ?? "function"}
					</option>
				))}
			</select>
		</Field>
	);
}

/**
 * Which function a Script Function calls.
 *
 * One this script declares can be pointed at another, and the pins follow; one
 * a module exports is named by the module, and is changed by placing the call
 * again from the node search.
 */
function ScriptCallSource({ script, node }: SectionProps) {
	const ref = scriptCallOf(node.config);
	if (ref.module) {
		return (
			<p className="summary">
				Calls <code>{scriptCallLabel(node.config)}</code>, exported by the module required as{" "}
				<code>{ref.moduleName ?? "module"}</code>.
			</p>
		);
	}
	return <FunctionPicker script={script} node={node} />;
}

/**
 * The type a Declare Local is annotated with.
 *
 * Any Luau type, the way a parameter's is: the list for the everyday ones and
 * Other… for `{ [Model]: Restore }`.
 */
function LocalType({ node }: { node: GraphNode }) {
	const current = configText(node, "type");
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
	const ref = { function: configText(node, "function"), param: configText(node, "param") };
	// The function whose graph this node is in comes first: it is nearly always
	// the one meant.
	const owners = script.nodes
		.filter((n) => bindsParameters(n.def))
		.sort((a, b) => Number(b.id === node.graph) - Number(a.id === node.graph));
	if (owners.length === 0) {
		return <p className="summary">This graph has no functions or handlers with parameters yet.</p>;
	}

	const owner = owners.find((n) => n.id === ref.function);
	const params = paramsOf(owner);

	// Picking an owner clears a parameter that owner does not have.
	const chooseOwner = (id: string) => {
		const list = paramsOf(owners.find((n) => n.id === id));
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
							{configText(fn, "name") || (FUNCTION_NODES.has(fn.def) ? "function" : "handler")}
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
	const current = configText(node, "local") ?? "";
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
	const typing = useEditBurst();
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
					typing.edit((s) =>
						setConfig(s, node.id, { [field]: Number.isFinite(next) ? next : fallback }),
					);
				}}
				{...typing.field}
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
	const typing = useEditBurst();
	const list = configEntries(node, field);

	const change = (next: NamedEntry[]) => (s: NodeScript) => {
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
	};
	const write = (next: NamedEntry[]) => store.edit(change(next));
	const [open, toggle] = useFold();

	return (
		<div className="list-editor">
			<SectionHead title={title} count={list.length} open={open} onToggle={toggle}>
				<AddButton
					onClick={() =>
						write([
							...list,
							{ name: `${field === "returns" ? "value" : "arg"}${list.length + 1}`, type: "any" },
						])
					}
				/>
			</SectionHead>
			{open && hint && <p className="summary">{hint}</p>}
			{open &&
				list.map((entry, i) => (
					<div className="list-row" key={i}>
						<span
							className="pin-dot"
							style={{ "--pin": pinColor(entry.type, "data") } as React.CSSProperties}
						/>
						<input
							className="tb"
							value={entry.name}
							onChange={(e) => {
								const next = [...list];
								next[i] = { ...entry, name: e.target.value };
								typing.edit(change(next));
							}}
							{...typing.field}
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
							className="tb list-remove"
							title="Remove"
							aria-label={`Remove ${entry.name}`}
							onClick={() => write(list.filter((_, j) => j !== i))}
						>
							<Icon name="close" size={13} />
						</button>
					</div>
				))}
			{open && list.length === 0 && <p className="summary">None.</p>}
		</div>
	);
}

/**
 * The node's data pins: each with its wire colour, filled going in and hollow
 * coming out, and its type as a chip.
 */
function PinSummary({ def, node }: { def: NodeDef; node: GraphNode }) {
	const { inputs, outputs } = resolvePins(def, node.config, node.literals);
	const [open, toggle] = useFold();
	const data = [
		...inputs.filter((p) => p.kind === "data").map((pin) => ({ pin, out: false })),
		...outputs.filter((p) => p.kind === "data").map((pin) => ({ pin, out: true })),
	];
	if (data.length === 0) return null;
	return (
		<div className="list-editor">
			<SectionHead title="Pins" count={data.length} open={open} onToggle={toggle} />
			{open &&
				data.map(({ pin, out }) => (
					<div className="pin-summary" key={`${out ? "out" : "in"}${pin.id}`}>
						<span
							className={cx("pin-dot", out && "out")}
							style={{ "--pin": pinColor(pin.type, "data") } as React.CSSProperties}
						/>
						<span className="pin-name">
							{pin.name || pin.id}
							<span className="pin-dir">{out ? "out" : "in"}</span>
						</span>
						{!out && (pin.type === "any" || pin.chosenType !== undefined) ? (
							<TypePicker
								value={pin.chosenType ?? "any"}
								title="This pin takes anything. Choose what it should take."
								onChange={(type) => store.edit((s) => setPinType(s, node.id, pin.id, type))}
							/>
						) : (
							<span className="chip-type">{pinTypeText(pin)}</span>
						)}
					</div>
				))}
		</div>
	);
}

/** A labelled row of the panel, with its hint as the tooltip. */
export function Field({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<label className="field" title={hint}>
			<span className="field-label">{label}</span>
			{children}
		</label>
	);
}
