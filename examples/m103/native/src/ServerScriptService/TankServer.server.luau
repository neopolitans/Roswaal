--!strict
--[[
	The M103, driven server-side. Approach C, as settled in
	`examples/m103/NOTES.md`: the hull stays anchored and has its `CFrame`
	written each frame onto whatever a downward raycast finds, and the turret and
	gun are joints whose rotation is written.

	**This is the baseline.** It exists to be rebuilt as a Roswaal graph and
	compared — so it is written the way a competent Roblox developer would write
	it, not the way a graph would force. Where an idiom has no obvious equivalent
	in nodes, there is a `-- graph:` note beside it; those notes are the raw
	material for `docs/demo/CONVERSION-LOG.md` and are the actual point of the
	exercise.

	## The shape a developer expects

	Walk up, a prompt appears, press E, and you are behind the tank with the gun
	pointed where you look. That is the tank demo everybody has already played,
	and matching it is deliberate: the demo has to be recognisable before
	anything it demonstrates is worth reading.

	## Why the server

	The hull is anchored, so the server writing its `CFrame` replicates for free,
	and so do the two joints. No physics, no ownership handoff.

	**There is no client-side prediction, on purpose.** A shipping game would
	drive the hull locally and reconcile; that is a networking exercise, it
	roughly doubles the code, and none of it says anything about whether a node
	graph can express a tank. In Studio, where this runs, the round trip is not
	visible.

	## What is deliberately not here

	- **Firing, damage and armour penetration.** Cut on the author's call: the
	  demo is about getting in and driving, and a gun would be a second system to
	  convert that repeats what the turret already proves.
	- **More than one tank, and more than one seat.** One model, one driver.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

-- Waited for, then indexed directly. `require(x:WaitForChild(...))` returns
-- `any`, and the types these modules export -- `Remotes.Input`, `Rig.Tank` --
-- would then not exist as far as the typechecker is concerned, quietly turning
-- every annotation below into a comment.
local Tank = ReplicatedStorage:WaitForChild("Tank")
Tank:WaitForChild("Config")
Tank:WaitForChild("Occupancy")
Tank:WaitForChild("Remotes")
Tank:WaitForChild("Rig")

local Config = require(ReplicatedStorage.Tank.Config)
local Occupancy = require(ReplicatedStorage.Tank.Occupancy)
local Remotes = require(ReplicatedStorage.Tank.Remotes)
local Rig = require(ReplicatedStorage.Tank.Rig)

local TANK_NAME = "M103"

--- How far above the tank the ground probe starts, and how far below it looks.
local PROBE_UP = 20
local PROBE_DOWN = 200

--- Seconds for the hull to take up most of a change in ground slope.
local SLOPE_SMOOTHING = 0.12

local model = workspace:WaitForChild(TANK_NAME) :: Model
local rig = Rig.resolve(model)
local config = Config.read(model)
local tuning = Config.tuning

local inputRemote = Remotes.input()
local exitRemote = Remotes.exit()
local occupantValue = Occupancy.value(model)

-- ---------------------------------------------------------------------------
-- State
-- ---------------------------------------------------------------------------

--- Turret angle relative to the hull, and gun angle relative to the turret.
local turretYaw = 0
local gunPitch = 0

--- Where each track's texture has scrolled to, in studs.
local leftScroll = 0
local rightScroll = 0

--- The surface normal the hull is currently sitting on, eased toward the real one.
local groundNormal = Vector3.yAxis

--- Studs per second along the hull's forward. Signed; negative is reverse.
local speed = 0

--- What an unoccupied tank is asking for: nothing. The aim is never read while
--- there is no driver — the turret holds where it was left — but the field has
--- to hold a direction rather than a zero vector.
local idle: Remotes.Input = {
	throttle = 0,
	steer = 0,
	aim = rig.hull.CFrame.LookVector,
}
local latest = idle

local raycast = RaycastParams.new()
raycast.FilterType = Enum.RaycastFilterType.Exclude
raycast.IgnoreWater = true

--[[
	The tank, and whoever is riding in it.

	The driver is welded at the hull's centre, which is directly under the ground
	probe — so as far as this raycast is concerned they *are* part of the tank.
	`Occupancy` also turns their `CanQuery` off, and either measure alone is
	enough; both are here because the first thing anyone will want back is a
	driver you can shoot, and turning `CanQuery` on again should not silently
	make the tank fly.

	Reassigned rather than mutated: `FilterDescendantsInstances` hands back a
	copy, so appending to what it returns changes nothing at all.
]]
local function filterOut(rider: Model?)
	local list = Rig.ownParts(rig)
	if rider then
		table.insert(list, rider)
	end
	raycast.FilterDescendantsInstances = list
end

filterOut(nil)

-- ---------------------------------------------------------------------------
-- Getting in and out
-- ---------------------------------------------------------------------------

local prompt = Instance.new("ProximityPrompt")
prompt.Name = "EnterTank"
prompt.ActionText = "Drive"
prompt.ObjectText = "M103"
prompt.KeyboardKeyCode = Enum.KeyCode.E
prompt.HoldDuration = 0
prompt.MaxActivationDistance = tuning.promptDistance
-- The hull is a mesh wearing a turret and a lot of trim, so half the places you
-- would stand have something between you and the prompt's anchor. Requiring
-- line of sight makes it flicker as you walk around the tank.
prompt.RequiresLineOfSight = false
prompt.Parent = rig.hull

--- The `Player` driving, or nil. `occupantValue` is the copy clients can see.
local driver: Player? = nil

local function characterOf(player: Player): Model?
	local character = player.Character
	return if character and character:FindFirstChildWhichIsA("Humanoid") then character else nil
end

--- Beside the left track, facing away, on the ground the tank is standing on.
local function exitCFrame(): CFrame
	local beside = rig.hull.CFrame * CFrame.new(-(rig.halfTrackWidth + 4), 0, 0)
	return CFrame.lookAt(beside.Position, beside.Position - rig.hull.CFrame.RightVector * 10)
end

local function leave()
	local player = driver
	driver = nil
	latest = idle
	occupantValue.Value = nil
	prompt.Enabled = true
	filterOut(nil)
	if not player then
		return
	end
	local character = characterOf(player)
	if character then
		Occupancy.show(character, exitCFrame())
	end
end

prompt.Triggered:Connect(function(player: Player)
	if driver ~= nil then
		return
	end
	local character = characterOf(player)
	if not character then
		return
	end
	if not Occupancy.hide(character, rig.hull) then
		return
	end
	driver = player
	latest = idle
	occupantValue.Value = player
	prompt.Enabled = false
	filterOut(character)
end)

exitRemote.OnServerEvent:Connect(function(player: Player)
	if player == driver then
		leave()
	end
end)

-- Every way a driver stops being one without pressing anything. Missing any of
-- these leaves a tank nobody can get into and a prompt that never comes back.
Players.PlayerRemoving:Connect(function(player)
	if player == driver then
		leave()
	end
end)

local function watch(player: Player)
	player.CharacterRemoving:Connect(function()
		if player == driver then
			leave()
		end
	end)
end

for _, player in Players:GetPlayers() do
	watch(player)
end
Players.PlayerAdded:Connect(watch)

inputRemote.OnServerEvent:Connect(function(player, packet)
	-- graph: two guards, and a graph that omits either is exploitable rather
	-- than merely wrong. Worth watching whether the node version makes them easy
	-- to forget.
	if player ~= driver then
		return
	end
	if not Remotes.valid(packet) then
		return
	end
	local input = packet :: Remotes.Input
	latest = {
		throttle = math.clamp(input.throttle, -1, 1),
		steer = math.clamp(input.steer, -1, 1),
		aim = input.aim.Unit,
	}
end)

-- ---------------------------------------------------------------------------
-- Maths
-- ---------------------------------------------------------------------------

--[[
	Moves `current` toward `target` by at most `maxStep`, the short way round.

	The wrap is the part that matters. Without it a turret crossing the rear arc
	takes the long way and sweeps 350 degrees to reach something two degrees off
	its left shoulder.
]]
local function stepAngle(current: number, target: number, maxStep: number): number
	local delta = (target - current + math.pi) % (2 * math.pi) - math.pi
	return current + math.clamp(delta, -maxStep, maxStep)
end

-- ---------------------------------------------------------------------------
-- The frame
-- ---------------------------------------------------------------------------

--[[
	Winds `speed` toward what the throttle is asking for.

	A tank does not have a speed, it has a *throttle*, and the difference is the
	whole feel of driving one: sixty tons takes five seconds to reach full pace
	and rather less to lose it, so letting go of W coasts rather than stops.

	Two rates rather than one, because accelerating and braking are different
	systems on a real vehicle and behave differently — and because a tank that
	slowed as reluctantly as it sped up would be miserable to park.
]]
local function accelerate(dt: number): number
	local top = config.movementSpeed
		* (if latest.throttle < 0 then tuning.reverseFraction else 1)
	local target = latest.throttle * top

	-- Braking is anything that reduces the gap to zero: letting off, and also
	-- pushing the other way, which on a tank is the same set of brakes before it
	-- is a gear change.
	local closing = math.abs(target) < math.abs(speed) or target * speed < 0
	local seconds = if closing then tuning.brakingTime else tuning.accelerationTime
	local rate = config.movementSpeed / math.max(seconds, 1e-3)

	local step = rate * dt
	if math.abs(target - speed) <= step then
		return target
	end
	return speed + (if target > speed then step else -step)
end

local function drive(dt: number): number
	local hullCF = rig.hull.CFrame

	-- Positive steer turns right, which is a *negative* rotation about Y.
	local yawRate = -math.rad(tuning.turnRate) * latest.steer
	local heading = (hullCF * CFrame.Angles(0, yawRate * dt, 0)).LookVector
	local flat = Vector3.new(heading.X, 0, heading.Z)
	-- Only reachable if the tank is somehow nose-down; keeping the old heading
	-- is better than normalising a zero vector into NaN and losing the model.
	flat = if flat.Magnitude > 1e-4 then flat.Unit else hullCF.LookVector

	speed = accelerate(dt)
	local nextPos = hullCF.Position + flat * (speed * dt)

	local hit = workspace:Raycast(
		nextPos + Vector3.yAxis * PROBE_UP,
		Vector3.yAxis * -(PROBE_UP + PROBE_DOWN),
		raycast
	)

	-- No ground found means the tank has driven off the edge of the world. It
	-- keeps its height rather than falling, because a demo tank that disappears
	-- has to be restarted and one that hovers can be driven back.
	local groundY = if hit then hit.Position.Y else hullCF.Position.Y - rig.rideHeight
	local targetNormal = if hit then hit.Normal else Vector3.yAxis

	-- graph: an exponential ease. `1 - 0.5^(dt/halfLife)` is the framerate-
	-- independent form; the naive `lerp(a, b, 0.1)` every frame eases at a speed
	-- that depends on how fast the machine is.
	local alpha = 1 - 0.5 ^ (dt / SLOPE_SMOOTHING)
	groundNormal = groundNormal:Lerp(targetNormal, alpha).Unit

	local right = flat:Cross(groundNormal)
	right = if right.Magnitude > 1e-4 then right.Unit else hullCF.RightVector
	local forward = groundNormal:Cross(right).Unit

	local position = Vector3.new(
		nextPos.X,
		groundY + rig.rideHeight + tuning.groundClearance,
		nextPos.Z
	)
	-- The third axis is the CFrame's *back* vector, so it is the negated
	-- forward. Passing `forward` here drives the tank in reverse, convincingly
	-- enough that the input handling gets blamed first.
	rig.hull.CFrame = CFrame.fromMatrix(position, right, groundNormal, -forward)

	return yawRate
end

--[[
	Turns the turret and raises the gun toward where the camera is looking.

	Both are rate-limited rather than snapped, and that limit is most of what
	makes a turret feel like it has mass: the camera arrives instantly, the gun
	takes a moment to catch up, and the lag between them *is* the tank.
]]
local function aimTurret(dt: number)
	local hullCF = rig.hull.CFrame

	-- Traverse: the aim direction's bearing in the hull's own space.
	local localAim = hullCF:VectorToObjectSpace(latest.aim)
	local desiredYaw = math.atan2(-localAim.X, -localAim.Z)
	turretYaw = stepAngle(turretYaw, desiredYaw, math.rad(tuning.traverseRate) * dt)
	rig.traverse.C0 = rig.traverseRest * CFrame.Angles(0, turretYaw, 0)

	-- Elevation: the same direction, measured in the *turret's* space, so the
	-- traverse the gun has already been given is not counted twice.
	local turretCF = hullCF * CFrame.Angles(0, turretYaw, 0)
	local localGun = turretCF:VectorToObjectSpace(latest.aim)
	local flatRange = math.sqrt(localGun.X * localGun.X + localGun.Z * localGun.Z)
	local desiredPitch = math.clamp(
		math.atan2(localGun.Y, flatRange),
		math.rad(tuning.minElevation),
		math.rad(tuning.maxElevation)
	)
	gunPitch = stepAngle(gunPitch, desiredPitch, math.rad(tuning.elevationRate) * dt)
	rig.elevate.C0 = rig.elevateRest * CFrame.Angles(gunPitch, 0, 0)
end

--[[
	Advances one track's textures by `distance` and returns where it got to.

	Every `Texture` on the part, because the tread wraps four faces of it and
	they have to stay in step; the tile size is read from the first one, since
	they were laid out together and disagreeing would be a modelling fault rather
	than something to accommodate.
]]
local function scroll(track: BasePart, distance: number, accumulated: number): number
	local tile = 0
	for _, child in track:GetChildren() do
		if child:IsA("Texture") then
			tile = child.StudsPerTileV
			break
		end
	end
	if tile <= 0 then
		return accumulated
	end
	-- Wrapped every frame rather than left to grow. A float that has been
	-- accumulating studs for an hour loses the precision the tread pitch needs,
	-- and the animation starts to stutter rather than to break.
	local wrapped = (accumulated + distance) % tile
	for _, child in track:GetChildren() do
		if child:IsA("Texture") then
			child.OffsetStudsV = wrapped
		end
	end
	return wrapped
end

--[[
	Scrolls the tread textures by the distance each track actually covered.

	The tracks are a shader trick — there is no track geometry and nothing
	physical to simulate — so "how far did this side travel" is the whole model.
	Turning is what makes it worth doing: a tank pivoting on the spot has one
	track running forward and the other back, and that reads instantly as a tank.
]]
local function scrollTracks(dt: number, yawRate: number)
	-- The speed the tank is actually doing, not the one the throttle is asking
	-- for. Scrolling by the request would run the treads at full pelt while the
	-- tank was still pulling away, which reads as the tracks slipping.
	local forward = speed
	-- A track offset +X from the hull's centre gains speed from a positive yaw
	-- rate, and `leftSign` says which of the two named tracks that is.
	local swing = yawRate * rig.halfTrackWidth * rig.leftSign
	leftScroll = scroll(rig.leftTrack, (forward - swing) * dt, leftScroll)
	rightScroll = scroll(rig.rightTrack, (forward + swing) * dt, rightScroll)
end

-- ---------------------------------------------------------------------------

-- Runs whether or not anyone is driving: an empty tank still settles onto the
-- ground under it, so getting out on a slope does not leave it standing at the
-- angle of the last slope it was on.
RunService.Heartbeat:Connect(function(dt)
	local yawRate = drive(dt)
	-- Only while somebody is looking. An empty tank holds the turret where its
	-- last driver left it, rather than creeping back toward a heading nothing is
	-- asking for.
	if driver then
		aimTurret(dt)
	end
	scrollTracks(dt, yawRate)
end)

print(`M103 ready — walk up and press {prompt.KeyboardKeyCode.Name} to drive`)
