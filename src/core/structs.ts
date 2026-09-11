/**
 * Splittable value types.
 *
 * Node editors call this splitting a struct pin: one Vector pin becomes three
 * float pins, and recombining puts them back. The same idea fits Luau's value
 * types exactly — a `Vector3` input is a `Vector3.new(x, y, z)` waiting to
 * happen, and a `CFrame` output is a position and a rotation you usually want
 * separately.
 *
 * This is **data**, in the same spirit as `compilesTo`: a node pack can declare
 * its own splittable type without patching Roswaal, and loading one still
 * executes nothing.
 *
 * ## Two invariants the emitter holds, which these templates rely on
 *
 * **`$v` in a `get` template is always a bound local, never an expression.** A
 * split output is bound to a local before any part is read, so `$v.X` cannot
 * accidentally re-evaluate a constructor once per component, and no part
 * template needs defensive parentheses.
 *
 * **A `make` template receives every part.** A part left unwired contributes
 * its literal, so recombining is total — there is no "half a Vector3".
 */

import type { DataType, Literal } from "./schema.js";

export interface StructPart {
	/** Unique within the mode. Becomes the second half of `parent.part`. */
	id: string;
	name: string;
	type: DataType;
	/** Expression for this part. `$v` is the whole value, always an identifier. */
	get: string;
	/** Value used when this part is left unconnected on a split input. */
	default: Literal;
}

export interface StructMode {
	/** Shown in the menu: "Split Struct Pin" with this as the submenu label. */
	name: string;
	parts: StructPart[];
	/** Rebuilds the whole from `$<partId>` placeholders. */
	make: string;
}

export interface StructType {
	type: DataType;
	/** Keyed by mode id. The first entry is what a plain split offers. */
	modes: Record<string, StructMode>;
}

const num = (id: string, name: string, get: string, v = 0): StructPart => ({
	id, name, type: "number", get, default: { t: "number", v },
});

/**
 * A rotation matrix component. Roblox exposes these only through
 * `GetComponents()`, which returns all twelve as a tuple, so a single component
 * has to `select` one out. Verbose, but it is what the API offers and hiding
 * that behind something prettier would be a lie about the cost.
 */
const component = (id: string, name: string, index: number, v = 0): StructPart => ({
	id, name, type: "number", get: `select(${index}, $v:GetComponents())`,
	default: { t: "number", v },
});

export const BUILTIN_STRUCTS: StructType[] = [
	{
		type: "Vector2",
		modes: {
			xy: {
				name: "X, Y",
				parts: [num("x", "X", "$v.X"), num("y", "Y", "$v.Y")],
				make: "Vector2.new($x, $y)",
			},
		},
	},
	{
		type: "Vector3",
		modes: {
			xyz: {
				name: "X, Y, Z",
				parts: [num("x", "X", "$v.X"), num("y", "Y", "$v.Y"), num("z", "Z", "$v.Z")],
				make: "Vector3.new($x, $y, $z)",
			},
		},
	},
	{
		type: "CFrame",
		modes: {
			// First, so a plain split gives the decomposition people actually mean.
			transform: {
				name: "Position, Rotation",
				parts: [
					{
						id: "position", name: "Position", type: "Vector3", get: "$v.Position",
						default: { t: "raw", v: "Vector3.zero" },
					},
					{
						id: "rotation", name: "Rotation", type: "CFrame", get: "$v.Rotation",
						default: { t: "raw", v: "CFrame.identity" },
					},
				],
				// CFrame + Vector3 translates, so this is the rotation moved into
				// place rather than two multiplications in the wrong order.
				make: "($rotation + $position)",
			},
			axes: {
				name: "Position and axes",
				parts: [
					{
						id: "position", name: "Position", type: "Vector3", get: "$v.Position",
						default: { t: "raw", v: "Vector3.zero" },
					},
					{
						id: "right", name: "Right", type: "Vector3", get: "$v.RightVector",
						default: { t: "raw", v: "Vector3.xAxis" },
					},
					{
						id: "up", name: "Up", type: "Vector3", get: "$v.UpVector",
						default: { t: "raw", v: "Vector3.yAxis" },
					},
				],
				// fromMatrix derives the third axis, so Look is read-only here:
				// offering it as an input would let you specify a matrix that is
				// not a rotation.
				make: "CFrame.fromMatrix($position, $right, $up)",
			},
			components: {
				name: "12 components",
				parts: [
					num("x", "X", "$v.X"), num("y", "Y", "$v.Y"), num("z", "Z", "$v.Z"),
					component("r00", "R00", 4, 1), component("r01", "R01", 5),
					component("r02", "R02", 6), component("r10", "R10", 7),
					component("r11", "R11", 8, 1), component("r12", "R12", 9),
					component("r20", "R20", 10), component("r21", "R21", 11),
					component("r22", "R22", 12, 1),
				],
				make:
					"CFrame.new($x, $y, $z, $r00, $r01, $r02, $r10, $r11, $r12, $r20, $r21, $r22)",
			},
		},
	},
	{
		type: "Color3",
		modes: {
			rgb: {
				name: "R, G, B",
				parts: [num("r", "R", "$v.R"), num("g", "G", "$v.G"), num("b", "B", "$v.B")],
				make: "Color3.new($r, $g, $b)",
			},
		},
	},
	{
		type: "UDim2",
		modes: {
			scaleOffset: {
				name: "Scale and Offset",
				parts: [
					num("xScale", "X Scale", "$v.X.Scale"),
					num("xOffset", "X Offset", "$v.X.Offset"),
					num("yScale", "Y Scale", "$v.Y.Scale"),
					num("yOffset", "Y Offset", "$v.Y.Offset"),
				],
				make: "UDim2.new($xScale, $xOffset, $yScale, $yOffset)",
			},
		},
	},
	{
		type: "UDim",
		modes: {
			scaleOffset: {
				name: "Scale, Offset",
				parts: [num("scale", "Scale", "$v.Scale"), num("offset", "Offset", "$v.Offset")],
				make: "UDim.new($scale, $offset)",
			},
		},
	},
];

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export type StructRegistry = Map<DataType, StructType>;

export function createStructRegistry(extra: StructType[] = []): StructRegistry {
	const map: StructRegistry = new Map();
	for (const s of BUILTIN_STRUCTS) map.set(s.type, s);
	// Packs load last, so a project can deliberately shadow a built-in — the
	// same rule the node registry follows.
	for (const s of extra) map.set(s.type, s);
	return map;
}

export const STRUCTS: StructRegistry = createStructRegistry();

/** The mode a plain "Split Struct Pin" uses: the first one declared. */
export function defaultMode(struct: StructType): string {
	return Object.keys(struct.modes)[0];
}

export function modeOf(
	structs: StructRegistry, type: DataType | undefined, mode: string | undefined,
): StructMode | undefined {
	if (!type) return undefined;
	const struct = structs.get(type);
	if (!struct) return undefined;
	return struct.modes[mode ?? defaultMode(struct)];
}

export function isSplittable(structs: StructRegistry, type: DataType | undefined): boolean {
	return type !== undefined && structs.has(type);
}

// ---------------------------------------------------------------------------
// Split configuration
//
// A split lives in the node's own config, so two Break Vector nodes in one
// graph can be split differently. The key carries the side because a node may
// have an input and an output with the same pin id -- Get Service takes a
// `service` and gives one back -- and keying on the pin alone would split both.
// ---------------------------------------------------------------------------

/** `config.split`, keyed by `"in:pin"` / `"out:pin"` and valued by mode id. */
export type SplitMap = Record<string, string>;

export function splitKey(side: "in" | "out", pinId: string): string {
	return `${side}:${pinId}`;
}

/**
 * Reads a literal back into components — the inverse of `make`.
 *
 * Splitting a pin must not change what the graph compiles to. Without this it
 * does: a pin holding `Vector3.new(0, 12, -4)` splits into three components at
 * their defaults and starts emitting `Vector3.new(0, 0, 0)`, silently.
 *
 * Deliberately narrow. The regex is built from the mode's own `make` template,
 * so it can only ever read back a string that template could have written, and
 * it is attempted **only for modes whose parts are all numbers** — where an
 * argument cannot itself contain a comma or a bracket. `Vector3.new(0, 12, -4)`
 * and nothing cleverer.
 *
 * Anything else returns null, and the caller says so rather than guessing.
 * Guessing wrong here would change behaviour without telling anyone, which is
 * worse than refusing.
 */
export function decompose(mode: StructMode, text: string): Record<string, number> | null {
	if (!mode.parts.every((p) => p.type === "number")) return null;

	const order: string[] = [];
	const pattern = mode.make
		.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === "$" ? "$" : `\\${c}`))
		.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_m, id: string) => {
			order.push(id);
			return "\\s*([^,()]+?)\\s*";
		});

	const match = new RegExp(`^\\s*${pattern}\\s*$`).exec(text);
	if (!match || order.length !== mode.parts.length) return null;

	const out: Record<string, number> = {};
	for (let i = 0; i < order.length; i++) {
		// Every captured argument must be a plain number. A wired-looking
		// expression means this is not a literal we wrote, so take none of it.
		const value = Number(match[i + 1]);
		if (!Number.isFinite(value)) return null;
		out[order[i]] = value;
	}
	return out;
}

export function parseSplitKey(key: string): { side: "in" | "out"; pin: string } | null {
	const colon = key.indexOf(":");
	if (colon <= 0) return null;
	const side = key.slice(0, colon);
	if (side !== "in" && side !== "out") return null;
	return { side, pin: key.slice(colon + 1) };
}

export function splitsOf(config: Record<string, unknown> | undefined): SplitMap {
	const raw = config?.split;
	return raw && typeof raw === "object" ? (raw as SplitMap) : {};
}

/** The pin id a part is exposed under. */
export function partPinId(parentId: string, partId: string): string {
	return `${parentId}.${partId}`;
}

/** Splits `parent.part` back into its halves, or null for an ordinary pin. */
export function splitPinId(pinId: string): { parent: string; part: string } | null {
	const dot = pinId.indexOf(".");
	if (dot <= 0 || dot === pinId.length - 1) return null;
	return { parent: pinId.slice(0, dot), part: pinId.slice(dot + 1) };
}
