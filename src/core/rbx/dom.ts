/**
 * A place or model as a tree of instances, whichever format it came from.
 *
 * Both readers -- `binary.ts` for `.rbxl`/`.rbxm`, `xml.ts` for
 * `.rbxlx`/`.rbxmx` -- produce this, so everything downstream (the import, the
 * DataModel browser, instance-aware completions) is written once.
 *
 * Properties are kept with their type. Text properties are kept as bytes: a
 * `String` property is as often a binary blob (attributes, tags, mesh data) as
 * it is text, and a writer that decoded and re-encoded one would corrupt it.
 * `text()` decodes the ones that are text.
 */

export type PropType =
	| "String"
	| "ProtectedString"
	| "Bool"
	| "Int32"
	| "Int64"
	| "Float32"
	| "Float64"
	| "Enum"
	| "BrickColor"
	| "Ref"
	| "UniqueId"
	| "SharedString"
	| "Vector2"
	| "Vector3"
	| "Color3"
	| "Color3uint8"
	| "CFrame"
	| "OptionalCFrame"
	| "UDim"
	| "UDim2"
	| "NumberRange"
	| "Rect";

export interface CFrameValue {
	position: [number, number, number];
	/** Row-major 3x3. */
	rotation: number[];
}

export interface Prop {
	type: PropType;
	/**
	 * By type: bytes for the string kinds, a boolean, a number (a bigint for
	 * Int64), an array of numbers for the vector kinds, a `CFrameValue`, an
	 * instance or null for a `Ref`, and a hex string for a `UniqueId`.
	 */
	value: unknown;
}

export interface RbxInstance {
	className: string;
	name: string;
	parent: RbxInstance | null;
	children: RbxInstance[];
	props: Map<string, Prop>;
	/** Marked as a service by the file (binary) or known to be one by class. */
	service: boolean;
}

export interface RbxDocument {
	format: "binary" | "xml";
	/** The top of the tree: a place's services, or a model's root instances. */
	roots: RbxInstance[];
	/** Every instance, in the order the file listed them. */
	instances: RbxInstance[];
	/**
	 * Property types this reader does not decode, with how many properties of
	 * each it met. Those properties are absent from `props`; nothing else is.
	 */
	undecoded: Map<string, number>;
}

export class RbxError extends Error {}

const utf8 = new TextDecoder();

/** A text property's value as a string; binary content decodes lossily. */
export function text(value: unknown): string {
	if (value instanceof Uint8Array) return utf8.decode(value);
	return typeof value === "string" ? value : "";
}

/** A string property as text, or undefined when the instance has none. */
export function stringProp(inst: RbxInstance, name: string): string | undefined {
	const prop = inst.props.get(name);
	if (!prop) return undefined;
	return text(prop.value);
}

/** The names from the top of the tree down to `inst`, inclusive. */
export function pathOf(inst: RbxInstance): string[] {
	const names: string[] = [];
	for (let cur: RbxInstance | null = inst; cur; cur = cur.parent) names.unshift(cur.name);
	return names;
}

export const SCRIPT_CLASSES = new Set(["Script", "LocalScript", "ModuleScript"]);

export function isScript(inst: RbxInstance): boolean {
	return SCRIPT_CLASSES.has(inst.className);
}

/** Every instance under `roots`, depth first, parents before children. */
export function* walk(roots: readonly RbxInstance[]): Generator<RbxInstance> {
	const stack = [...roots].reverse();
	while (stack.length) {
		const inst = stack.pop()!;
		yield inst;
		for (let i = inst.children.length - 1; i >= 0; i--) stack.push(inst.children[i]);
	}
}
