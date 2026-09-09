/**
 * Roblox-specific vocabulary: the services a script can reach, and how an
 * instance path is written into Luau.
 *
 * The service list is hardcoded on purpose. Roblox adds services rarely, and a
 * fixed list is what lets Get Service be a dropdown rather than a text field
 * you can typo. It is a starting set, not a closed one — every place that uses
 * it also accepts a name typed by hand, so a service added next year needs no
 * release here.
 */

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
 * Instance classes a pin may be typed as.
 *
 * Partial on purpose: Roblox has hundreds and a graph needs the handful you
 * actually hold a reference to. It exists so `Model` can be told apart from
 * `Config` -- one fits an `Instance` pin and the other does not -- which is a
 * question no amount of looking at the name can answer. Add to it freely; a
 * class missing from here still *works* as a type, it just is not offered in
 * the type list and will not satisfy an `Instance` pin without a Cast.
 */
export const INSTANCE_CLASSES: string[] = [
	"Accessory", "Animation", "AnimationTrack", "Animator", "Attachment",
	"BasePart", "BillboardGui", "BindableEvent", "BindableFunction", "BoolValue",
	"Camera", "CFrameValue", "ClickDetector", "Configuration", "Decal",
	"Folder", "Frame", "GuiButton", "GuiObject", "Highlight", "Humanoid",
	"HumanoidDescription", "ImageLabel", "IntValue", "Model", "Motor6D",
	"MeshPart", "NumberValue", "ObjectValue", "Part", "ParticleEmitter",
	"Player", "PlayerGui", "PointLight", "ProximityPrompt", "RemoteEvent",
	"RemoteFunction", "ScreenGui", "ScriptSignal", "Seat", "Sound", "Sparkles",
	"StringValue", "SurfaceGui", "TextBox", "TextButton", "TextLabel", "Tool",
	"Trail", "UICorner", "UIListLayout", "UIPadding", "Vector3Value",
	"VehicleSeat", "WeldConstraint",
];

const CLASSES = new Set(INSTANCE_CLASSES);

/** Whether a type name is an Instance class, and so fits an `Instance` pin. */
export function isInstanceClass(type: string | undefined): boolean {
	return type !== undefined && CLASSES.has(type);
}
