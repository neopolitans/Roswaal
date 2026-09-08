--!strict
--[[
	Input, and the top-down camera the tank was modelled for.

	Everything here is presentation and intent. The server decides what the tank
	actually does with it — see `TankServer.server.luau` — which is why this
	sends an aim *point* rather than an angle: the turret's traverse rate is the
	server's business, and a client sending an angle would be claiming to know
	what the turret could already reach.

	## The camera

	Straight down, following the hull. The hull and turret are deliberately
	simple because that is all a top-down mobile game ever shows, so a demo shot
	from behind would be judging the model on a view it was never built for.
]]

local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

-- Waited for, then indexed directly, so `Remotes.Input` survives as a type. See
-- the same note in TankServer.
ReplicatedStorage:WaitForChild("Tank"):WaitForChild("Remotes")
local Remotes = require(ReplicatedStorage.Tank.Remotes)

local localPlayer = Players.LocalPlayer :: Player
local remote = Remotes.input()
local camera = workspace.CurrentCamera :: Camera
local model = workspace:WaitForChild("M103") :: Model
local hull = (model:WaitForChild("Hull") :: Model):WaitForChild("Hull") :: BasePart

--- Studs above the hull. Far enough to see what the gun is pointed at.
local CAMERA_HEIGHT = 140

--- Which world direction is up the screen. Any axis will do; it must not be Y.
local SCREEN_UP = Vector3.new(0, 0, -1)

--- Don't spend a remote call on a packet that says what the last one said.
local SEND_EPSILON = 0.01

local throttle = 0
local steer = 0
local firing = false

local sent: Remotes.Input? = nil

-- ---------------------------------------------------------------------------
-- Keys
-- ---------------------------------------------------------------------------

--[[
	Bound through `ContextActionService` rather than read from
	`UserInputService.InputBegan`, because it takes a mobile button for free —
	`ContextActionService:BindAction` with a touch button is the same call — and
	the tank is a mobile game's tank.
]]
local function bindAxis(name: string, key: Enum.KeyCode, apply: (number) -> ())
	ContextActionService:BindAction(name, function(_, state: Enum.UserInputState)
		if state == Enum.UserInputState.Begin then
			apply(1)
		elseif state == Enum.UserInputState.End or state == Enum.UserInputState.Cancel then
			apply(0)
		end
		return Enum.ContextActionResult.Pass
	end, false, key)
end

-- Held separately per key, so pressing both does not leave the tank stuck on
-- whichever was released last.
local forwardHeld, backHeld, leftHeld, rightHeld = 0, 0, 0, 0

bindAxis("TankForward", Enum.KeyCode.W, function(v)
	forwardHeld = v
end)
bindAxis("TankBack", Enum.KeyCode.S, function(v)
	backHeld = v
end)
bindAxis("TankLeft", Enum.KeyCode.A, function(v)
	leftHeld = v
end)
bindAxis("TankRight", Enum.KeyCode.D, function(v)
	rightHeld = v
end)

-- `true` here asks for a touch button on mobile, which is the platform the
-- tank was built for; the mouse binding is what makes it testable in Studio.
ContextActionService:BindAction("TankFire", function(_, state: Enum.UserInputState)
	firing = state == Enum.UserInputState.Begin
	return Enum.ContextActionResult.Pass
end, true, Enum.UserInputType.MouseButton1)

-- ---------------------------------------------------------------------------
-- Aim
-- ---------------------------------------------------------------------------

--[[
	Where the cursor is, on the plane the tank is standing on.

	A plane rather than a raycast into the scene. Raycasting would put the aim
	point on whatever the cursor happens to be over, so passing the cursor across
	a wall would throw the gun's elevation at the top of it and back — and the
	gun has eight degrees of depression to play with, so that reads as the turret
	twitching rather than as aiming.
]]
local function aimPoint(): Vector3
	local mouse = UserInputService:GetMouseLocation()
	local ray = camera:ViewportPointToRay(mouse.X, mouse.Y)
	local planeY = hull.Position.Y
	local denominator = ray.Direction.Y
	if math.abs(denominator) < 1e-6 then
		return hull.Position - hull.CFrame.LookVector * 100
	end
	local distance = (planeY - ray.Origin.Y) / denominator
	if distance <= 0 then
		return hull.Position - hull.CFrame.LookVector * 100
	end
	return ray.Origin + ray.Direction * distance
end

-- ---------------------------------------------------------------------------

local function changed(a: Remotes.Input?, b: Remotes.Input): boolean
	if a == nil then
		return true
	end
	return math.abs(a.throttle - b.throttle) > SEND_EPSILON
		or math.abs(a.steer - b.steer) > SEND_EPSILON
		or (a.aim - b.aim).Magnitude > 0.5
		or a.fire ~= b.fire
end

camera.CameraType = Enum.CameraType.Scriptable

RunService.RenderStepped:Connect(function()
	throttle = forwardHeld - backHeld
	steer = rightHeld - leftHeld

	-- World-aligned rather than following the hull's heading. A top-down camera
	-- that yaws with the tank turns every steering input into the whole world
	-- rotating, which is unreadable at this height — the tank turns, the map
	-- does not.
	camera.CFrame = CFrame.lookAt(
		hull.Position + Vector3.yAxis * CAMERA_HEIGHT,
		hull.Position,
		SCREEN_UP
	)

	local packet: Remotes.Input = {
		throttle = throttle,
		steer = steer,
		aim = aimPoint(),
		fire = firing,
	}
	if changed(sent, packet) then
		remote:FireServer(packet)
		sent = packet
	end
end)

localPlayer.CharacterAdded:Connect(function(character)
	-- The driver is not walking around; parking the character out of the way
	-- keeps it from being run over by the tank it is driving.
	local root = character:WaitForChild("HumanoidRootPart") :: BasePart
	root.CFrame = hull.CFrame * CFrame.new(0, 40, 0)
	root.Anchored = true
end)
