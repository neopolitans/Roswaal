--!strict
--[[
	Who is driving, and what happens to the body they left outside.

	## Why an ObjectValue rather than a remote

	`Occupant` is an `ObjectValue` inside the tank holding the driving `Player`,
	or nothing. The server sets it; every client watches it. That is one
	replicated property instead of an enter event, an exit event, a late-joiner
	catch-up, and the bug where a client that joined mid-drive never learns the
	tank is occupied.

	It is also **visible in the explorer while the game runs**, which is worth
	more than it sounds for a demo somebody is evaluating: you can see who is in
	the tank without reading a line of code.

	## Hiding rather than replacing

	The character is hidden and welded to the hull, not deleted and not swapped
	for a rig. Deleting it means respawning on exit, with everything that hangs
	off `CharacterAdded` running again; a driver rig means building one. Hiding
	is reversible by construction — every value this changes, it wrote down
	first — and it keeps the player's own character as the thing that gets back
	out.
]]

local Occupancy = {}

Occupancy.VALUE_NAME = "Occupant"

--- What was changed on the way in, so getting out can put it back.
type Restore = {
	transparency: { [Instance]: number },
	collide: { [BasePart]: boolean },
	walkSpeed: number,
	jumpHeight: number,
	nameDisplay: Enum.HumanoidDisplayDistanceType,
	weld: WeldConstraint?,
}

local restores: { [Model]: Restore } = {}

--- The value the server writes and the clients watch. Created on demand.
function Occupancy.value(tank: Model): ObjectValue
	local existing = tank:FindFirstChild(Occupancy.VALUE_NAME)
	if existing and existing:IsA("ObjectValue") then
		return existing
	end
	local value = Instance.new("ObjectValue")
	value.Name = Occupancy.VALUE_NAME
	value.Parent = tank
	return value
end

--[[
	Puts the character inside the tank: invisible, non-colliding, along for the
	ride.

	The weld is what carries it, and it matters that the hull is anchored — a
	`WeldConstraint` to an anchored part makes the character kinematic, so it
	travels exactly with the tank and contributes no physics of its own.
]]
function Occupancy.hide(character: Model, hull: BasePart): boolean
	if restores[character] then
		return false
	end
	local humanoid = character:FindFirstChildWhichIsA("Humanoid")
	local root = character:FindFirstChild("HumanoidRootPart")
	if not humanoid or not root or not root:IsA("BasePart") then
		return false
	end

	local restore: Restore = {
		transparency = {},
		collide = {},
		walkSpeed = humanoid.WalkSpeed,
		jumpHeight = humanoid.JumpHeight,
		nameDisplay = humanoid.DisplayDistanceType,
		weld = nil,
	}

	for _, part in character:GetDescendants() do
		if part:IsA("BasePart") then
			restore.transparency[part] = part.Transparency
			restore.collide[part] = part.CanCollide
			part.Transparency = 1
			part.CanCollide = false
		elseif part:IsA("Decal") or part:IsA("Texture") then
			restore.transparency[part] = part.Transparency
			part.Transparency = 1
		end
	end

	humanoid.WalkSpeed = 0
	humanoid.JumpHeight = 0
	-- The name tag would otherwise float over an empty tank.
	humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None

	root.CFrame = hull.CFrame
	local weld = Instance.new("WeldConstraint")
	weld.Name = "TankOccupant"
	weld.Part0 = root
	weld.Part1 = hull
	weld.Parent = root
	restore.weld = weld

	restores[character] = restore
	return true
end

--[[
	Puts them back, beside the tank rather than inside it.

	Every restored value was read on the way in rather than assumed, because a
	game that had already changed a character's `WalkSpeed` would otherwise find
	Roswaal's demo had reset it to 16 on the way out.
]]
function Occupancy.show(character: Model, exitAt: CFrame)
	local restore = restores[character]
	if not restore then
		return
	end
	restores[character] = nil

	if restore.weld then
		restore.weld:Destroy()
	end
	for instance, value in restore.transparency do
		if instance.Parent then
			(instance :: any).Transparency = value
		end
	end
	for part, value in restore.collide do
		if part.Parent then
			part.CanCollide = value
		end
	end

	local humanoid = character:FindFirstChildWhichIsA("Humanoid")
	if humanoid then
		humanoid.WalkSpeed = restore.walkSpeed
		humanoid.JumpHeight = restore.jumpHeight
		humanoid.DisplayDistanceType = restore.nameDisplay
	end

	local root = character:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		root.CFrame = exitAt
	end
end

--- Whether this character is currently riding inside something.
function Occupancy.isHidden(character: Model): boolean
	return restores[character] ~= nil
end

return Occupancy
