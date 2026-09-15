/**
 * Roblox-specific vocabulary: the services a script can reach, how an instance
 * path is written into Luau, and which names are classes.
 *
 * The engine's full lists are generated into `robloxData.ts`. What is here is
 * the *editorial* half — which services are offered, which classes are near to
 * hand — which is a judgement and so is written by hand.
 *
 * The service list is hardcoded on purpose. Roblox adds services rarely, and a
 * fixed list is what lets Get Service be a dropdown rather than a text field
 * you can typo. It is a starting set, not a closed one — every place that uses
 * it also accepts a name typed by hand, so a service added next year needs no
 * release here.
 */

import { CLASSES, CLASS_PARENTS, DATATYPES } from "./robloxData.js";

/** Services offered in the Get Service dropdown, in rough order of use. */
export const ROBLOX_SERVICES = [
	"Players",
	"ReplicatedStorage",
	"ServerScriptService",
	"ServerStorage",
	"Workspace",
	"Lighting",
	"RunService",
	"UserInputService",
	"TweenService",
	"HttpService",
	"TeleportService",
	"DataStoreService",
	"MarketplaceService",
	"BadgeService",
	"CollectionService",
	"ContextActionService",
	"SoundService",
	"StarterGui",
	"StarterPack",
	"StarterPlayer",
	"ReplicatedFirst",
	"PhysicsService",
	"PathfindingService",
	"Debris",
	"Chat",
	"TextService",
	"TextChatService",
	"Teams",
	"GuiService",
	"HapticService",
	"LocalizationService",
	"MessagingService",
	"MemoryStoreService",
	"PolicyService",
	"ProximityPromptService",
	"AnalyticsService",
	"AssetService",
	"AvatarEditorService",
	"ContentProvider",
	"GroupService",
	"InsertService",
	"TestService",
	"VRService",
] as const;

/**
 * Globals a path can start from, alongside any service. `script` is the
 * running script itself, which is how a module reaches its siblings.
 */
export const PATH_GLOBALS = ["game", "script", "workspace", "shared"] as const;

/** Everything Get Service and the path nodes offer as a starting point. */
export const PATH_ROOTS: string[] = [...PATH_GLOBALS, ...ROBLOX_SERVICES];

export function isService(name: string): boolean {
	return (ROBLOX_SERVICES as readonly string[]).includes(name);
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Renders a dotted instance path as Luau indexing.
 *
 * Instance names are not identifiers — "Main Menu" and "3D Icons" are both
 * legal — so a segment that cannot be written after a dot is bracketed
 * instead. Segments are split on "." and trimmed; empty ones are dropped, so a
 * trailing dot while typing does not produce broken code.
 */
export function renderPath(base: string, path: string): string {
	const segments = path.split(".").map((s) => s.trim()).filter((s) => s !== "");
	return segments.reduce((acc, segment) => {
		return IDENTIFIER.test(segment)
			? `${acc}.${segment}`
			: `${acc}[${JSON.stringify(segment)}]`;
	}, base);
}

/** The last segment of a path, which is the natural name for its local. */
export function lastSegment(path: string): string {
	const segments = path.split(".").map((s) => s.trim()).filter((s) => s !== "");
	return segments[segments.length - 1] ?? "";
}

/**
 * Instance classes worth offering before the other six hundred.
 *
 * Hand-picked, and the order is the point: these are what a graph actually
 * holds a reference to, so they go at the top of a class list and the complete
 * one follows. Add to it freely — it changes what is *near to hand*, never what
 * is possible.
 *
 * It used to be the whole list, which meant `isInstanceClass` said no to
 * `Decal`, and a Decal needed a Cast to reach an `Instance` pin. That is what
 * `CLASSES` is for now.
 */
export const INSTANCE_CLASSES: string[] = [
	"Accessory", "Animation", "AnimationTrack", "Animator", "Attachment",
	"BasePart", "BillboardGui", "BindableEvent", "BindableFunction", "BoolValue",
	"Camera", "CFrameValue", "ClickDetector", "Configuration", "Decal",
	"Folder", "Frame", "GuiButton", "GuiObject", "Highlight", "Humanoid",
	"HumanoidDescription", "ImageLabel", "IntValue", "Model", "Motor6D",
	"MeshPart", "NumberValue", "ObjectValue", "Part", "ParticleEmitter",
	"Player", "PlayerGui", "PointLight", "ProximityPrompt", "RemoteEvent",
	"RemoteFunction", "ScreenGui", "Seat", "Sound", "Sparkles",
	"StringValue", "SurfaceGui", "TextBox", "TextButton", "TextLabel", "Tool",
	"Trail", "UICorner", "UIListLayout", "UIPadding", "Vector3Value",
	"VehicleSeat", "WeldConstraint",
];

/**
 * Every class, with the common ones first.
 *
 * What a Class Name pin offers. The order matters more than it looks: a list of
 * six hundred and twenty-five is a list nobody scrolls, so the fifty that are
 * reached for daily sit at the top and the rest follow alphabetically. Nothing
 * appears twice.
 *
 * Suggestions, not a gate — every pin that offers this also takes a name typed
 * by hand, so a class Roblox ships next month needs no release here.
 */
export const CLASS_OPTIONS: string[] = [
	...INSTANCE_CLASSES,
	...CLASSES.filter((name) => !INSTANCE_CLASSES.includes(name)),
];

/** What Luau has before Roblox adds anything, in the order a graph reaches. */
const LUAU_TYPES = ["any", "boolean", "number", "string", "table", "function", "thread", "nil"];

/**
 * Roblox's own values that are not instances, common ones first.
 *
 * The same shortlist the type picker offers, because the two answer the same
 * question — "what could this be" — and two lists would drift.
 */
const COMMON_DATATYPES = [
	"Instance", "Vector3", "Vector2", "CFrame", "Color3", "UDim", "UDim2", "BrickColor",
	"EnumItem", "TweenInfo", "Ray", "Region3", "RBXScriptSignal", "RBXScriptConnection",
];

/**
 * Every type a cast might assert: Luau's, Roblox's datatypes, then the classes.
 *
 * Wider than `CLASS_OPTIONS` because a cast is not a Class Name pin — `value ::
 * string` and `value :: Vector3` are ordinary things to write, and a list that
 * offered only Instance classes would be a list that is wrong more often than a
 * Class Name pin's is.
 *
 * Still suggestions rather than a gate. The Type pin takes any Luau type
 * expression at all, and `Model & { Humanoid: Humanoid }` is typed in — see the
 * picker, which commits whatever you give it.
 */
export const TYPE_OPTIONS: string[] = [
	...LUAU_TYPES,
	...COMMON_DATATYPES.filter((name) => !LUAU_TYPES.includes(name)),
	...DATATYPES.filter((name) => !LUAU_TYPES.includes(name) && !COMMON_DATATYPES.includes(name)),
	...CLASS_OPTIONS.filter(
		(name) => !LUAU_TYPES.includes(name) && !COMMON_DATATYPES.includes(name),
	),
];

const LUAU_SET = new Set(LUAU_TYPES);
const DATATYPE_SET = new Set<string>([...COMMON_DATATYPES, ...DATATYPES]);

/**
 * Which heading a type sits under in the picker.
 *
 * Three kinds, and the classes then group themselves the way they do everywhere
 * else — by the ancestor directly below `Instance`, which is the engine's own
 * arrangement rather than one invented here.
 */
export function typeGroup(name: string): string {
	if (LUAU_SET.has(name)) return "Luau";
	if (isInstanceClass(name)) return classGroup(name);
	if (DATATYPE_SET.has(name)) return "Roblox types";
	return "Other";
}

const EVERY_CLASS = new Set<string>([...CLASSES, ...INSTANCE_CLASSES]);

/**
 * Whether a type name is an Instance class, and so fits an `Instance` pin.
 *
 * The engine's whole list, not the shortlist above. While it was the shortlist,
 * `Decal` was not an Instance as far as the editor was concerned and wiring one
 * into an `Instance` pin wanted a Cast that asserted something already true.
 */
export function isInstanceClass(type: string | undefined): boolean {
	return type !== undefined && EVERY_CLASS.has(type);
}

/**
 * A class and everything it derives from, nearest first: `Part`, `BasePart`,
 * `PVInstance`, `Instance`, `Object`.
 *
 * Bounded rather than trusting the data: the chain comes from a generated file,
 * and a cycle in it would otherwise hang the editor rather than produce a wrong
 * answer. Thirty-two is several times the deepest the engine has ever been.
 */
export function classChain(name: string | undefined): string[] {
	if (!name || !EVERY_CLASS.has(name)) return name ? [name] : [];
	const chain = [name];
	const seen = new Set(chain);
	for (let step = 0; step < 32; step++) {
		const parent = CLASS_PARENTS[chain[chain.length - 1]];
		if (!parent || seen.has(parent)) break;
		chain.push(parent);
		seen.add(parent);
	}
	return chain;
}

/**
 * Whether `a` is `b`, or derives from it. Luau's `IsA`, answered statically.
 *
 * This is what lets a `Part` reach a `BasePart` pin without a Cast. Roswaal
 * knew only "every class fits `Instance`" before the hierarchy was available,
 * so every other narrowing — a `MeshPart` into a `BasePart`, a `TextButton`
 * into a `GuiObject` — wanted a cast asserting something already true.
 */
export function isSubclassOf(a: string | undefined, b: string | undefined): boolean {
	if (!a || !b) return false;
	if (a === b) return true;
	return classChain(a).includes(b);
}

/**
 * Which heading a class sits under when they are shown as a list.
 *
 * The engine's own taxonomy rather than a set of categories invented here: the
 * ancestor directly below `Instance`, which puts every constraint under
 * `Constraint` and every UI element under `GuiBase`. Studio's Insert Object
 * uses hand-made groups instead — prettier, and with no machine-readable source
 * to keep them true.
 *
 * `Instance` itself, and anything the export did not place, come back as
 * `Instance`: the honest answer for "derives from nothing more specific".
 */
export function classGroup(name: string): string {
	const chain = classChain(name);
	const at = chain.indexOf("Instance");
	if (at <= 0) return "Instance";
	return chain[at - 1];
}
