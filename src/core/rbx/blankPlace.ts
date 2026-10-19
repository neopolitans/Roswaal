/**
 * A place to start from: what Studio gives a new experience, from the
 * baseplate and the spawn on it to the sky, the light and the chat.
 *
 * **Written here rather than copied from Studio.** Studio's own Baseplate
 * template is Roblox's file, and putting it in a 0BSD repository would be
 * handing on something that is not ours to license. This describes the same
 * place from nothing: class and property names are Roblox's API, and each
 * value is one a new Studio place starts with, set here where it differs from
 * the class's own default. Everything left unsaid -- a part's material, the
 * services this does not list, the Camera and the Terrain -- Studio makes or
 * fills in when the file is opened.
 *
 * Binary by default, as Studio saves; `blankPlaceXml` gives the same place as
 * `.rbxlx`. Export writes scripts into either: `writeSources` replaces a
 * `Source`, and `addInstances` adds the scripts and folders a project has
 * that the place does not.
 */

import type { CFrameValue, Prop, RbxDocument, RbxInstance } from "./dom.js";
import { writeBinaryPlace, writeXmlPlace } from "./serialize.js";

const utf8 = new TextEncoder();

const bool = (value: boolean): Prop => ({ type: "Bool", value });
const int = (value: number): Prop => ({ type: "Int32", value });
const float = (value: number): Prop => ({ type: "Float32", value });
const token = (value: number): Prop => ({ type: "Enum", value });
const text = (value: string): Prop => ({ type: "String", value: utf8.encode(value) });
/** A Color3 from 0 to 255 a channel, as Studio's Properties shows it. */
const rgb = (r: number, g: number, b: number): Prop => ({
	type: "Color3",
	value: [r / 255, g / 255, b / 255],
});
/** A part's colour, which the file keeps a byte a channel. */
const partColor = (r: number, g: number, b: number): Prop => ({
	type: "Color3uint8",
	value: [r, g, b],
});
const vector3 = (x: number, y: number, z: number): Prop => ({ type: "Vector3", value: [x, y, z] });
const udim = (scale: number, offset: number): Prop => ({ type: "UDim", value: [scale, offset] });
const udim2 = (xs: number, xo: number, ys: number, yo: number): Prop => ({
	type: "UDim2",
	value: [xs, xo, ys, yo],
});
/** Standing at a point, turned no way. */
const at = (x: number, y: number, z: number): Prop => ({
	type: "CFrame",
	value: { position: [x, y, z], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] } satisfies CFrameValue,
});

/** An instance as it is described below. */
interface Spec {
	className: string;
	/** The class name unless said. */
	name?: string;
	service?: boolean;
	props?: Record<string, Prop>;
	children?: Spec[];
}

const service = (className: string, props?: Spec["props"], children?: Spec[]): Spec => ({
	className,
	service: true,
	...(props ? { props } : {}),
	...(children ? { children } : {}),
});

/** A part's faces smooth top and bottom, as Studio's own are, rather than studded. */
const SMOOTH = { TopSurface: token(0), BottomSurface: token(0) };

/** The ground: 2048 studs square and 16 deep, its top face at height 0. */
export const BASEPLATE = {
	name: "Baseplate",
	position: [0, -8, 0],
	size: [2048, 16, 2048],
} as const;

/**
 * Where players appear: a 12 by 12 pad at the centre, standing on the
 * baseplate -- half its height above the top face, so its bottom is on it.
 */
export const SPAWN = { name: "SpawnLocation", position: [0, 0.5, 0], size: [12, 1, 12] } as const;

const WORKSPACE = service(
	"Workspace",
	{
		// Streaming, and the engine behaviours a new experience opts into.
		StreamingEnabled: bool(true),
		StreamingMinRadius: int(64),
		StreamingTargetRadius: int(1024),
		StreamingIntegrityMode: token(3),
		StreamOutBehavior: token(2),
		SignalBehavior2: token(2),
		PlayerCharacterDestroyBehavior: token(2),
		PlayerScriptsUseInputActionSystem: token(2),
		UseNewLuauTypeSolver: token(2),
		AuthorityMode: token(1),
		TerrainWeldsFixed: bool(true),
		ExplicitAutoJoints: bool(true),
	},
	[
		{
			className: "Part",
			name: BASEPLATE.name,
			props: {
				Anchored: bool(true),
				// Locked, as Studio's own ground is, so a click on the floor
				// selects what is on it rather than the floor.
				Locked: bool(true),
				CFrame: at(...BASEPLATE.position),
				// `size` in lower case is the name Part's size is saved under.
				size: vector3(...BASEPLATE.size),
				Color3uint8: partColor(91, 91, 91),
				...SMOOTH,
			},
			children: [
				{
					// The grid drawn on the ground, 8 studs a square.
					className: "Texture",
					props: {
						Face: token(1),
						Color3: rgb(0, 0, 0),
						StudsPerTileU: float(8),
						StudsPerTileV: float(8),
						Texture: text("rbxassetid://6372755229"),
						Transparency: float(0.8),
					},
				},
			],
		},
		{
			className: "SpawnLocation",
			name: SPAWN.name,
			props: {
				Anchored: bool(true),
				CFrame: at(...SPAWN.position),
				size: vector3(...SPAWN.size),
				// Players appear as soon as they land, with no forcefield.
				Duration: int(0),
				...SMOOTH,
			},
			children: [
				{
					className: "Decal",
					props: { Face: token(1), Texture: text("rbxasset://textures/SpawnLocation.png") },
				},
			],
		},
	],
);

const LIGHTING = service(
	"Lighting",
	{
		Technology: token(3),
		Ambient: rgb(70, 70, 70),
		OutdoorAmbient: rgb(70, 70, 70),
		Brightness: float(3),
		EnvironmentDiffuseScale: float(1),
		EnvironmentSpecularScale: float(1),
		FogColor: rgb(192, 192, 192),
		GeographicLatitude: float(0),
		GlobalShadows: bool(true),
		Outlines: bool(false),
		PrioritizeLightingQuality: bool(true),
		ShadowSoftness: float(0.2),
		TimeOfDay: text("14:30:00"),
	},
	[
		{
			className: "Sky",
			props: {
				SkyboxBk: text("rbxassetid://6444884337"),
				SkyboxDn: text("rbxassetid://6444884785"),
				SkyboxFt: text("rbxassetid://6444884337"),
				SkyboxLf: text("rbxassetid://6444884337"),
				SkyboxRt: text("rbxassetid://6444884337"),
				SkyboxUp: text("rbxassetid://6412503613"),
				SunTextureId: text("rbxassetid://6196665106"),
				MoonTextureId: text("rbxassetid://6444320592"),
				SunAngularSize: float(11),
			},
		},
		{
			className: "SunRaysEffect",
			name: "SunRays",
			props: { Intensity: float(0.01), Spread: float(0.1) },
		},
		{
			className: "Atmosphere",
			props: {
				Color: rgb(199, 199, 199),
				Decay: rgb(106, 112, 125),
				Density: float(0.3),
				Offset: float(0.25),
			},
		},
		{
			className: "BloomEffect",
			name: "Bloom",
			props: { Intensity: float(1), Threshold: float(2) },
		},
		{
			className: "DepthOfFieldEffect",
			name: "DepthOfField",
			props: { Enabled: bool(false), FarIntensity: float(0.1), InFocusRadius: float(30) },
		},
	],
);

const STARTER_PLAYER = service(
	"StarterPlayer",
	{
		CameraMaxZoomDistance: float(128),
		CharacterUseJumpPower: bool(false),
		CharacterBreakJointsOnDeath: bool(false),
		AvatarJointUpgrade_SerializedRollout: token(2),
		GameSettingsAvatar: token(1),
		CreateDefaultPlayerModule: bool(true),
	},
	// The two script containers, because a Rojo project that syncs a Client
	// folder into StarterPlayerScripts finds it there.
	[{ className: "StarterPlayerScripts" }, { className: "StarterCharacterScripts" }],
);

const TEXT_CHAT = service(
	"TextChatService",
	{ ChatVersion: token(1), IsLegacyChatDisabled: bool(true) },
	[
		{ className: "ChatWindowConfiguration" },
		{ className: "ChatInputBarConfiguration" },
		{
			className: "BubbleChatConfiguration",
			children: [
				{
					className: "ImageLabel",
					props: { BackgroundColor3: rgb(255, 255, 255), Size: udim2(0, 100, 0, 100) },
				},
				{
					className: "UICorner",
					props: Object.fromEntries(
						["TopLeftRadius", "TopRightRadius", "BottomLeftRadius", "BottomRightRadius"].map(
							(n) => [n, udim(0, 12)],
						),
					),
				},
				{ className: "UIGradient", props: { Enabled: bool(false) } },
				{
					className: "UIPadding",
					props: Object.fromEntries(
						["PaddingTop", "PaddingBottom", "PaddingLeft", "PaddingRight"].map((n) => [
							n,
							udim(0, 8),
						]),
					),
				},
			],
		},
		{ className: "ChannelTabsConfiguration" },
	],
);

/** The place's services, in Explorer's order, and those that carry a setting after. */
const PLACE: Spec[] = [
	WORKSPACE,
	service("Players", { RespawnTime: float(3), BanningEnabled: bool(true) }),
	LIGHTING,
	service("MaterialService", { Use2022MaterialsXml: bool(true) }),
	service("ReplicatedFirst"),
	service("ReplicatedStorage"),
	service("ServerScriptService"),
	service("ServerStorage"),
	service("StarterGui", { ScreenOrientation: token(4) }),
	service("StarterPack"),
	STARTER_PLAYER,
	service("Teams"),
	service("SoundService", {
		RespectFilteringEnabled: bool(true),
		VolumetricAudio: token(1),
		DefaultListenerLocation: token(3),
	}),
	TEXT_CHAT,
	service("Chat", { BubbleChatEnabled: bool(true) }),
	service("VoiceChatService", { UseAudioApi: token(2), EnableDefaultVoice: bool(true) }),
];

/** The services the place starts with, in the order it lists them. */
export const BLANK_PLACE_SERVICES = PLACE.map((spec) => spec.className);

function build(spec: Spec, parent: RbxInstance | null, all: RbxInstance[]): RbxInstance {
	const name = spec.name ?? spec.className;
	const inst: RbxInstance = {
		className: spec.className,
		name,
		parent,
		children: [],
		props: new Map(Object.entries({ Name: text(name), ...spec.props })),
		service: spec.service === true,
	};
	all.push(inst);
	inst.children = (spec.children ?? []).map((child) => build(child, inst, all));
	return inst;
}

/** The place as a document, made anew each time so nobody shares one to change. */
export function blankPlace(): RbxDocument {
	const instances: RbxInstance[] = [];
	const roots = PLACE.map((spec) => build(spec, null, instances));
	return { format: "binary", roots, instances, undecoded: new Map() };
}

/**
 * The place as `.rbxl` bytes.
 *
 * Opened in Studio it is a baseplate with a spawn on it, under Studio's sky
 * and light; read by Roswaal it is a place like any imported one, and
 * `roswaal export` writes the project's scripts into it.
 */
export function blankPlaceBytes(): Uint8Array {
	return writeBinaryPlace(blankPlace());
}

/** The same place as `.rbxlx` text, Studio's legacy format. */
export function blankPlaceXml(): string {
	return writeXmlPlace({ ...blankPlace(), format: "xml" });
}
