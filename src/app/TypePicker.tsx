/**
 * Choosing a type, including one nothing here has heard of.
 *
 * This was a `<select>` of twelve names in two panels, which meant a parameter
 * could be a `number` or an `Instance` and could not be a `Model` — or a
 * `Config`, a type the same graph declares a few nodes away. Both are ordinary
 * things to want and neither could be said at all.
 *
 * So it is a text field with a list attached: everything the dropdown offered
 * is still one click away, the Instance classes are there under it, and so is
 * whatever this graph has declared for itself. Anything else can simply be
 * typed. A name Luau does not know is an error Luau reports, naming the line,
 * which is a better answer than a type quietly becoming `any`.
 */

import { useId, useMemo } from "react";

import { INSTANCE_CLASSES } from "../core/roblox.js";
import type { NodeScript } from "../core/schema.js";
import { useEditor } from "./store.js";

/** The types that were in the dropdown, in the order they were in it. */
const BASE_TYPES = [
	"any", "boolean", "number", "string", "table", "function",
	"Instance", "Vector3", "Vector2", "CFrame", "Color3", "UDim", "UDim2",
	"BrickColor", "EnumItem", "RBXScriptSignal", "RBXScriptConnection",
];

/**
 * The type names a graph declares for itself.
 *
 * Both Declare Type nodes keep the name in `config.name`, so this reads the
 * graph rather than being told — a type declared and then renamed is offered
 * under its new name without anything else having to notice.
 */
export function declaredTypes(script: NodeScript | undefined): string[] {
	if (!script) return [];
	const names = new Set<string>();
	for (const node of script.nodes) {
		if (node.def !== "type.declareTop" && node.def !== "type.declareHere") continue;
		const name = (node.config as { name?: string } | undefined)?.name?.trim();
		if (name) names.add(name);
	}
	return [...names].sort();
}

export interface TypePickerProps {
	value: string | undefined;
	onChange: (type: string) => void;
	title?: string;
	disabled?: boolean;
}

export function TypePicker(props: TypePickerProps) {
	const listId = useId();
	// The open graph, so the types it declares are offered without every panel
	// having to pass them down. What is on screen is what they are.
	const script = useEditor().script ?? undefined;
	const options = useMemo(() => {
		const declared = declaredTypes(script);
		// Declared types first: they are this graph's own vocabulary, and the
		// list is long enough that anything below the fold is a scroll away.
		return [...new Set([...declared, ...BASE_TYPES, ...INSTANCE_CLASSES])];
	}, [script]);

	return (
		<>
			<input
				className="tb type-picker"
				list={listId}
				value={props.value ?? "any"}
				spellCheck={false}
				autoComplete="off"
				disabled={props.disabled}
				title={props.title ?? "Any Luau type. The list is a shortcut, not a limit."}
				onChange={(e) => props.onChange(e.target.value)}
				// Empty means "unset", and an unset type is `any` — saying so here
				// rather than letting a blank field travel into the generated file.
				onBlur={(e) => {
					if (e.target.value.trim() === "") props.onChange("any");
				}}
			/>
			<datalist id={listId}>
				{options.map((t) => (
					<option key={t} value={t} />
				))}
			</datalist>
		</>
	);
}
