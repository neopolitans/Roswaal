--!strict
--[[
	The M103, driven server-side. Approach C, as settled in
	`examples/m103/NOTES.md`: the hull stays anchored and has its `CFrame`
	written each frame onto whatever a downward raycast finds, and the turret and
	gun are joints whose `Transform` is written.

	**This is the baseline.** It exists to be rebuilt as a Roswaal graph and
	compared — so it is written the way a competent Roblox developer would write
	it, not the way a graph would force. Where an idiom has no obvious equivalent
	in nodes, there is a `-- graph:` note beside it; those notes are the raw
	material for `docs/demo/CONVERSION-LOG.md` and are the actual point of the
	exercise.

	## Why the server

	The hull is anchored, so the server writing its `CFrame` replicates for free,
	and so do the two joints. No physics, no ownership handoff, no prediction.
	That is worth knowing before the same tank is attempted in Unreal, where the
	equivalent is a replicated movement component and distinctly not free.

	## What is deliberately not here

	- **Armour penetration.** The plan holds it back until driving and firing
	  work; the slice registers a hit and applies flat damage.
	- **Ricochet.** `TurretSettings.ProjectileRicochetCount` is a leftover of the
	  cancelled project and the notes mark it suspect, so nothing reads it.
	- **Shell drop.** Shells fly straight. `ProjectileSpeed` of 56 would arc
	  hard under gravity and that is a tuning conversation, not a slice one.
	- **More than one tank.** One model, one driver, named below.
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
Tank:WaitForChild("Remotes")
Tank:WaitForChild("Rig")

local Config = require(ReplicatedStorage.Tank.Config)
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

local remote = Remotes.input()

-- ---------------------------------------------------------------------------
-- State
-- ---------------------------------------------------------------------------

--- Turret angle relative to the hull, and gun angle relative to the turret.
local turretYaw = 0
local gunPitch = 0

--- Where each track's texture has scrolled to, in studs.
local leftScroll = 0
local rightScroll = 0

--- Counts down; the gun fires at zero.
local reload = 0

--- The surface normal the hull is currently sitting on, eased toward the real one.
local groundNormal = Vector3.yAxis

local latest: Remotes.Input = {
	throttle = 0,
	steer = 0,
	aim = rig.hull.Position - rig.hull.CFrame.LookVector * 100,
	fire = false,
}

type Shell = {
	position: Vector3,
	direction: Vector3,
	travelled: number,
}

local shells: { Shell } = {}

-- ---------------------------------------------------------------------------
-- Input
-- ---------------------------------------------------------------------------

--[[
	One driver: whoever joined first and has not left.

	A seat would be the real answer and the model has none — see the survey. For
	a slice measuring whether a graph can express a tank controller, a
	`VehicleSeat` would add a whole occupancy state machine and measure nothing.
]]
local driver: Player? = nil

local function claim(player: Player)
	if driver == nil then
		driver = player
	end
end

for _, player in Players:GetPlayers() do
	claim(player)
end
Players.PlayerAdded:Connect(claim)
Players.PlayerRemoving:Connect(function(player)
	if driver == player then
		driver = nil
		latest = { throttle = 0, steer = 0, aim = latest.aim, fire = false }
	end
end)

remote.OnServerEvent:Connect(function(player, packet)
	-- graph: every remote handler needs this pair of guards, and a graph that
	-- omits either is exploitable rather than merely wrong. Worth watching
	-- whether the node version makes them easy to forget.
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
		aim = input.aim,
		fire = input.fire,
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

local raycast = RaycastParams.new()
raycast.FilterType = Enum.RaycastFilterType.Exclude
raycast.FilterDescendantsInstances = Rig.ownParts(rig)
raycast.IgnoreWater = true

-- ---------------------------------------------------------------------------
-- The frame
-- ---------------------------------------------------------------------------

local function drive(dt: number): number
	local hullCF = rig.hull.CFrame

	-- Positive steer turns right, which is a *negative* rotation about Y.
	local yawRate = -math.rad(tuning.turnRate) * latest.steer
	local heading = (hullCF * CFrame.Angles(0, yawRate * dt, 0)).LookVector
	local flat = Vector3.new(heading.X, 0, heading.Z)
	-- Only reachable if the tank is somehow nose-down; keeping the old heading
	-- is better than normalising a zero vector into NaN and losing the model.
	flat = if flat.Magnitude > 1e-4 then flat.Unit else hullCF.LookVector

	local nextPos = hullCF.Position + flat * (latest.throttle * config.hull.movementSpeed * dt)

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

local function aimTurret(dt: number)
	local hullCF = rig.hull.CFrame

	-- Traverse: the bearing of the aim point in the hull's own space.
	local toAim = latest.aim - rig.turret.Position
	local localAim = hullCF:VectorToObjectSpace(toAim)
	local desiredYaw = math.atan2(-localAim.X, -localAim.Z)
	turretYaw = stepAngle(turretYaw, desiredYaw, math.rad(tuning.traverseRate) * dt)
	rig.traverse.Transform = CFrame.Angles(0, turretYaw, 0)

	-- Elevation: the same point, measured in the *turret's* space, so the
	-- traverse the gun has already been given is not counted twice.
	local turretCF = hullCF * CFrame.Angles(0, turretYaw, 0)
	local localGun = turretCF:VectorToObjectSpace(latest.aim - rig.mantlet.Position)
	local flatRange = math.sqrt(localGun.X * localGun.X + localGun.Z * localGun.Z)
	local desiredPitch = math.clamp(
		math.atan2(localGun.Y, flatRange),
		math.rad(tuning.minElevation),
		math.rad(tuning.maxElevation)
	)
	gunPitch = stepAngle(gunPitch, desiredPitch, math.rad(tuning.elevationRate) * dt)
	rig.elevate.Transform = CFrame.Angles(gunPitch, 0, 0)
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
	local forward = latest.throttle * config.hull.movementSpeed
	-- A track offset +X from the hull's centre gains speed from a positive yaw
	-- rate, and `leftSign` says which of the two named tracks that is.
	local swing = yawRate * rig.halfTrackWidth * rig.leftSign
	local leftSpeed = forward - swing
	local rightSpeed = forward + swing

	leftScroll = scroll(rig.leftTrack, leftSpeed * dt, leftScroll)
	rightScroll = scroll(rig.rightTrack, rightSpeed * dt, rightScroll)
end

-- ---------------------------------------------------------------------------
-- The gun
-- ---------------------------------------------------------------------------

local function fire()
	local muzzle = rig.firingPoint.WorldCFrame
	table.insert(shells, {
		position = muzzle.Position,
		direction = muzzle.LookVector,
		travelled = 0,
	})
	print(`M103 fired {config.turret.projectileType}`)
end

--[[
	Advances every shell in flight and resolves the first thing each one hits.

	Stepped rather than hitscan because `ProjectileSpeed` is a real number in the
	model and a shell that arrives instantly makes it meaningless. Stepping is
	also where penetration goes when it arrives: the step that hits armour is the
	one that has the surface normal and the shot vector in hand.
]]
local function stepShells(dt: number)
	-- Backwards, so removing one does not skip the next.
	for i = #shells, 1, -1 do
		local shell = shells[i]
		local step = config.turret.projectileSpeed * dt
		local hit = workspace:Raycast(shell.position, shell.direction * step, raycast)

		if hit then
			local character = hit.Instance:FindFirstAncestorWhichIsA("Model")
			local humanoid = character and character:FindFirstChildWhichIsA("Humanoid")
			if humanoid then
				humanoid:TakeDamage(config.turret.projectileDamage)
			end
			print(`hit {hit.Instance:GetFullName()} at {math.round(shell.travelled)} studs`)
			table.remove(shells, i)
			continue
		end

		shell.position += shell.direction * step
		shell.travelled += step
		if shell.travelled >= tuning.maxRange then
			table.remove(shells, i)
		end
	end
end

-- ---------------------------------------------------------------------------

RunService.Heartbeat:Connect(function(dt)
	local yawRate = drive(dt)
	aimTurret(dt)
	scrollTracks(dt, yawRate)

	reload = math.max(reload - dt, 0)
	if latest.fire and reload <= 0 then
		fire()
		reload = config.turret.reloadSpeed
	end

	stepShells(dt)
end)

print(`M103 ready — {config.hull.hp} HP, {config.hull.movementSpeed} studs/s`)
