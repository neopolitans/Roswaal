--!strict
--[[
	Finding the parts and joints the controller drives, once, and saying so
	loudly when one is missing.

	The rig is surveyed in `examples/m103/NOTES.md`; this is that survey turned
	into code. Three joints matter and everything else on the tank is decoration
	hanging off one of two roots:

		Hull.Hull --[Main]--> Turret.Main --[Mantlet]--> Weapon.Mantlet
		                                                     |
		                                                  [Gun] --> Weapon.Gun

	Traverse writes `Main.Transform`, elevation writes `Mantlet.Transform`, and
	the `Gun` joint is never written — the barrel rides the mantlet, which is the
	whole reason the mantlet is in the chain.

	## Why this is a separate module

	Because the failure it guards against is silence. A `FindFirstChild` chain
	written inline returns `nil` and the controller then does nothing at all,
	with no error and no clue: a tank that sits still looks exactly like a tank
	whose input is not arriving. Resolving the whole rig up front turns that into
	one message naming the part that is missing.
]]

local Rig = {}

export type Tank = {
	model: Model,
	--- Anchored, and what approach C writes a CFrame to every frame.
	hull: BasePart,
	--- The invisible pivot the turret's decoration hangs from.
	turret: BasePart,
	mantlet: BasePart,
	gun: BasePart,
	--- Muzzle. Its LookVector is where a shell goes.
	firingPoint: Attachment,
	--- Rotated about Y to traverse.
	traverse: Motor6D,
	--- Rotated about X to elevate. The gun follows it.
	elevate: Motor6D,
	leftTrack: BasePart,
	rightTrack: BasePart,
	--- Query-only volume around the hull. Shells test against this.
	hitbox: BasePart,
	--[[
		How far the hull's centre sits above the bottom of its tracks.

		Measured from the model rather than written down, because the tank has
		already been rescaled once — every offset in it doubled between two
		saves — and a hard-coded ride height would have survived that silently
		and left the tank buried to its sponsons.
	]]
	rideHeight: number,
	--- Half the distance between the two tracks, for the turning arithmetic.
	halfTrackWidth: number,
	--- +1 if LeftTrack really is on the model's left. Read, not assumed.
	leftSign: number,
}

local function need(parent: Instance, name: string, class: string): Instance
	local child = parent:FindFirstChild(name)
	if not child then
		error(`{parent:GetFullName()} has no "{name}"`, 0)
	end
	if not child:IsA(class) then
		error(`{child:GetFullName()} is a {child.ClassName}, expected a {class}`, 0)
	end
	return child
end

function Rig.resolve(model: Model): Tank
	local hullModel = need(model, "Hull", "Model")
	local turretModel = need(model, "Turret", "Model")
	local weapon = need(turretModel, "Weapon", "Model")

	local hull = need(hullModel, "Hull", "BasePart") :: BasePart
	local turret = need(turretModel, "Main", "BasePart") :: BasePart
	local mantlet = need(weapon, "Mantlet", "BasePart") :: BasePart
	local gun = need(weapon, "Gun", "BasePart") :: BasePart
	local leftTrack = need(hullModel, "LeftTrack", "BasePart") :: BasePart
	local rightTrack = need(hullModel, "RightTrack", "BasePart") :: BasePart

	local rig: Tank = {
		model = model,
		hull = hull,
		turret = turret,
		mantlet = mantlet,
		gun = gun,
		firingPoint = need(gun, "FiringPoint", "Attachment") :: Attachment,
		traverse = need(hull, "Main", "Motor6D") :: Motor6D,
		elevate = need(turret, "Mantlet", "Motor6D") :: Motor6D,
		leftTrack = leftTrack,
		rightTrack = rightTrack,
		hitbox = need(hullModel, "CollisionBox", "BasePart") :: BasePart,
		rideHeight = (hull.Position.Y - leftTrack.Position.Y) + leftTrack.Size.Y / 2,
		halfTrackWidth = (rightTrack.Position - leftTrack.Position).Magnitude / 2,
		-- Which side each track is on comes from the hull's own axes rather than
		-- from the name. The model has been rebuilt twice already, and a tank
		-- whose tracks scroll the wrong way when it turns is a bug nobody thinks
		-- to look for in a variable called `leftTrack`.
		leftSign = if hull.CFrame:PointToObjectSpace(leftTrack.Position).X < 0 then 1 else -1,
	}

	-- The joints were built in Studio and could be pointed anywhere. Checking
	-- costs nothing on the one frame it runs and catches a rig edit that looks
	-- right in the explorer and moves the wrong part.
	local function drives(joint: Motor6D): string
		return if joint.Part1 then joint.Part1.Name else "nothing"
	end
	if rig.traverse.Part1 ~= turret then
		error(`the Main joint drives {drives(rig.traverse)}, not Turret.Main`, 0)
	end
	if rig.elevate.Part1 ~= mantlet then
		error(`the Mantlet joint drives {drives(rig.elevate)}, not Weapon.Mantlet`, 0)
	end
	if not hull.Anchored then
		error(`{hull:GetFullName()} must stay anchored — approach C writes its CFrame directly`, 0)
	end

	return rig
end

--[[
	What the tank's own raycasts should pass through: all of it.

	The whole model rather than a list of parts, because the tank carries a
	query-only `CollisionBox` around the hull and a shell leaving the muzzle
	starts inside it. Filtering the parts by name would miss that one, and the
	symptom is a gun that hits something at zero range every time it fires.
]]
function Rig.ownParts(rig: Tank): { Instance }
	return { rig.model }
end

return Rig
