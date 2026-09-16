/**
 * Choosing a type.
 *
 * It began as a `<select>` of twelve names, which meant a parameter could be a
 * `number` or an `Instance` and could not be a `Model` — or a `Config`, a type
 * the same graph declares a few nodes away. Then it became a list with
 * **Other…** at the bottom of it opening a text field, which could say anything
 * and made browsing a matter of already knowing the name.
 *
 * Now it is the **picker** — the one the Class Name pins and the casts open,
 * from 0.38.0: search at the top, everything under it, grouped and in columns,
 * and whatever you type committed whether or not it is on the list. Three
 * controls for one question was two too many, and the one that reads six
 * hundred classes is the one that answers it.
 *
 * The groups are ordered by how close they are to hand: this graph's own types,
 * then the primitives, then the datatypes, then the instance classes — which
 * group themselves the way the engine does.
 */

import { useMemo, useState } from "react";

import { INSTANCE_CLASSES, typeGroup } from "../core/roblox.js";
import { CLASSES, DATATYPES as ENGINE_DATATYPES } from "../core/robloxData.js";
import type { NodeScript } from "../core/schema.js";
import { requiredTypes, useProjectTypes } from "./projectTypes.js";
import { classDetail, ValuePicker } from "./ValuePicker.jsx";
import { Icon } from "./icons.jsx";
import { useEditor } from "./store.js";
import {
	LUAU_PRIMITIVES, LUNE_ROBLOX_TYPES, LUNE_TYPES, requiresLuneRoblox,
} from "../core/luneTypes.js";

/**
 * What Luau has, before either runtime adds anything.
 *
 * From `luneTypes.ts` rather than listed here, because listing it here is how
 * it came to be missing `buffer`, `thread` and `nil` — all three are Luau's,
 * and `fs.readFile` can hand you a `buffer` that this picker could not name.
 */
const BASIC_TYPES = LUAU_PRIMITIVES;

/**
 * Roblox's own values — not instances, and not primitives either.
 *
 * Hand-picked and ordered, like the classes below: the engine has forty-eight
 * datatypes and a graph reaches for a dozen. The rest are behind **Other…**,
 * where every one of them is a suggestion.
 */
const DATATYPES = [
	"Instance", "Vector3", "Vector2", "CFrame", "Color3", "UDim", "UDim2",
	"BrickColor", "EnumItem", "TweenInfo", "Ray", "Region3",
	"RBXScriptSignal", "RBXScriptConnection",
];

/**
 * Instance classes worth a click rather than a search.
 *
 * A handful out of the fifty-odd in `INSTANCE_CLASSES`, chosen because they are
 * what a graph usually holds a reference to. The rest are one **Other…** away,
 * and the point of the split is that a list nobody can scan is not a shortcut.
 */
const COMMON_CLASSES = [
	"Model", "Part", "BasePart", "MeshPart", "Folder", "Configuration",
	"Humanoid", "Player", "Attachment", "Motor6D", "ProximityPrompt",
	"NumberValue", "StringValue", "BoolValue", "ObjectValue",
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

export interface TypeGroup {
	label: string;
	types: string[];
}

/**
 * The groups the list offers, in the order they are offered.
 *
 * `required` is the types this graph can reach through a require —
 * `Config.Tuning` — which are as close to hand as its own.
 */
export function listGroups(script: NodeScript | undefined, required: string[] = []): TypeGroup[] {
	const declared = declaredTypes(script);
	const lune = script?.target === "lune";

	/**
	 * Roblox's types, in a Lune graph, only once the graph has asked for them.
	 *
	 * `@lune/roblox` genuinely gives a Lune program `Instance`, `DataModel` and
	 * the datatypes — so they are not wrong there, they are *conditional*. The
	 * condition is a require the developer wrote, which is the rule everything
	 * else about modules is built on: offering `CFrame` to a graph that has not
	 * required it would be the picker assuming a dependency.
	 */
	const robloxInLune = lune && requiresLuneRoblox(script);

	return [
		...(declared.length > 0 ? [{ label: "This graph", types: declared }] : []),
		...(required.length > 0 ? [{ label: "Required modules", types: required }] : []),
		{ label: "Basic", types: BASIC_TYPES },
		...(lune
			? [{
				label: "Lune",
				// The `@lune/roblox` ones are offered under their own heading
				// below, or not at all, so they are not in here twice.
				types: LUNE_TYPES.filter((type) => !LUNE_ROBLOX_TYPES.includes(type)),
			}]
			: [
				{ label: "Roblox values", types: DATATYPES },
				{ label: "Instances", types: COMMON_CLASSES },
			]),
		// The module's own list, not Roswaal's. `TweenInfo` is a Roblox datatype
		// `@lune/roblox` does not implement, and offering it here would offer a
		// constructor the runtime has not got.
		...(robloxInLune ? [{ label: "From @lune/roblox", types: LUNE_ROBLOX_TYPES }] : []),
	];
}

/** Everything the list holds, flat — what decides whether a value fits in it. */
export function listedTypes(script: NodeScript | undefined, required: string[] = []): string[] {
	return listGroups(script, required).flatMap((g) => g.types);
}

/**
 * Suggestions behind **Other…**: the list, then every class and datatype it
 * left out.
 *
 * All of them, not the shortlist. **Other…** is a search box, and a search box
 * that only knows fifty of the six hundred classes is one you have to already
 * know the answer isn't in.
 */
export function searchTypes(script: NodeScript | undefined, required: string[] = []): string[] {
	const listed = listedTypes(script, required);
	// The engine's six hundred classes belong behind Other… in a Roblox graph,
	// and in a Lune graph only once `@lune/roblox` is required — a program that
	// opens a place file does deal in `Part` and `Model`, and one that does not
	// has no use for either.
	const engine = script?.target !== "lune" || requiresLuneRoblox(script);
	return [...new Set([
		...listed,
		...(engine ? [...INSTANCE_CLASSES, ...CLASSES, ...ENGINE_DATATYPES] : []),
		...(script?.target === "lune" ? LUNE_TYPES : []),
	])];
}

export interface TypePickerProps {
	value: string | undefined;
	onChange: (type: string) => void;
	title?: string;
	disabled?: boolean;
}

export function TypePicker(props: TypePickerProps) {
	// The open graph, so the types it declares are offered without every panel
	// having to pass them down. What is on screen is what they are.
	const script = useEditor().script ?? undefined;
	const projectTypes = useProjectTypes();
	const required = useMemo(
		() => (script ? requiredTypes(script, projectTypes).map((t) => t.type) : []),
		[script, projectTypes],
	);

	/** The groups that are about this project rather than about the engine. */
	const local = useMemo(
		() => listGroups(script, required).filter(
			(g) => g.label === "This graph" || g.label === "Required modules",
		),
		[script, required],
	);
	const options = useMemo(() => searchTypes(script, required), [script, required]);
	const [picking, setPicking] = useState(false);

	const value = props.value ?? "any";

	/**
	 * Which heading a type sits under.
	 *
	 * The graph's own types and the project's come first and are named for where
	 * they come from; everything else defers to `typeGroup`, which is what the
	 * pins already use — so a `Part` is under `PVInstance` here exactly as it is
	 * when you pick a class on a node.
	 */
	/**
	 * The headings worth reading first: this graph's own types, then the ones a
	 * required module brings, then Luau's and Roblox's own values. Everything
	 * after them is classes, ordered by how big each family is.
	 */
	const leadingGroups = useMemo(
		() => [...local.map((g) => g.label), "Luau", "Roblox types"],
		[local],
	);

	/**
	 * Which heading a type sits under.
	 *
	 * Where a type comes from wins — this graph's own, or a required module's —
	 * and everything else defers to `typeGroup`, which is what the pins already
	 * use. So a `Part` is under `PVInstance` here exactly as it is when you pick
	 * a class on a node, rather than under a second heading that means the same
	 * thing and holds a different fifteen of them.
	 */
	const groupOf = (type: string): string => {
		for (const group of local) {
			if (group.types.includes(type)) return group.label;
		}
		return typeGroup(type);
	};

	return (
		<>
			<button
				className="tb type-picker"
				disabled={props.disabled}
				title={props.title ?? "Any Luau type. The list is a shortcut, not a limit."}
				onClick={() => setPicking(true)}
			>
				<span className="preview">{value}</span>
				<Icon name="chevron" size={12} />
			</button>
			{picking && (
				<ValuePicker
					what="type"
					options={options}
					value={value}
					groupOf={groupOf}
					groupsFirst={leadingGroups}
					detailOf={classDetail}
					onPick={(type) => props.onChange(type.trim() || "any")}
					onClose={() => setPicking(false)}
				/>
			)}
		</>
	);
}
