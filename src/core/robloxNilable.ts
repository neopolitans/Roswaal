/**
 * The Roblox properties that can hold `nil`: `Player.Character` is a `Model?`.
 *
 * Roblox's Creator Documentation types these as the class alone, so the engine
 * catalogue cannot say it. Kept by hand: each is a reference to another object
 * that is empty until something sets it — a character before it spawns, a
 * Parent after `Destroy`, a weld's Part0 before it is given one.
 *
 * `Workspace.CurrentCamera` is left out, as Roblox's own type for it is: a
 * running game always has one.
 *
 * By the class that declares the property. `nilableProperty` walks up from a
 * derived class, so `Part.Parent` is found on Instance.
 */

import { CLASS_PARENTS } from "./robloxData.js";

export const NILABLE_PROPERTIES: Readonly<Record<string, readonly string[]>> = {
	Beam: ["Attachment0", "Attachment1"],
	BillboardGui: ["Adornee"],
	Camera: ["CameraSubject"],
	Constraint: ["Attachment0", "Attachment1"],
	ControllerManager: ["RootPart"],
	Highlight: ["Adornee"],
	Humanoid: ["RootPart", "SeatPart", "WalkToPart"],
	IKControl: ["Target"],
	Instance: ["Parent"],
	InstanceAdornment: ["Adornee"],
	JointInstance: ["Part0", "Part1"],
	Model: ["PrimaryPart"],
	Mouse: ["Target"],
	NoCollisionConstraint: ["Part0", "Part1"],
	ObjectValue: ["Value"],
	PartAdornment: ["Adornee"],
	PathfindingLink: ["Attachment0", "Attachment1"],
	Player: ["Character", "RespawnLocation"],
	PVAdornment: ["Adornee"],
	RocketPropulsion: ["Target"],
	Seat: ["Occupant"],
	Sound: ["SoundGroup"],
	SurfaceGuiBase: ["Adornee"],
	TextChannelWindow: ["Target"],
	Trail: ["Attachment0", "Attachment1"],
	VehicleSeat: ["Occupant"],
	ViewportFrame: ["CurrentCamera"],
	WeldConstraint: ["Part0", "Part1"],
};

/** Whether a property read off this class can be `nil`. */
export function nilableProperty(className: string, property: string): boolean {
	const walked = new Set<string>();
	let current: string | undefined = className;
	while (current !== undefined && !walked.has(current)) {
		walked.add(current);
		if (NILABLE_PROPERTIES[current]?.includes(property)) return true;
		current = CLASS_PARENTS[current];
	}
	return false;
}
