--!strict
--[[
	The camera, the controls, and knowing when you are driving.

	Everything here is intent. The server decides what the tank does with it —
	see `TankServer.server.luau` — which is why this sends the direction the
	camera is *looking* rather than an angle for the turret: how fast the turret
	can get there is the server's business, and a client sending an angle would
	be claiming it already had.

	## The camera

	A third-person orbit: the mouse swings it around the tank, and the turret and
	gun follow where it points. This is the control scheme of every tank game
	anyone has played, and it is the reason the demo reads as a tank rather than
	as a box that moves.

	Two details do most of the work.

	**The camera orbits the turret, not the hull.** Steering would otherwise drag
	the whole view around with the hull, so turning on the spot would swing the
	world instead of the tank. Orbiting a point that does not yaw with the hull
	keeps the camera where you put it and lets the tank turn underneath it.

	**It pulls in when something is behind it.** Reversing into a wall otherwise
	puts the camera inside the wall and the screen fills with backface.
]]

local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

-- Waited for, then indexed directly, so `Remotes.Input` survives as a type. See
-- the same note in TankServer.
local Tank = ReplicatedStorage:WaitForChild("Tank")
Tank:WaitForChild("Occupancy")
Tank:WaitForChild("Remotes")

local Occupancy = require(ReplicatedStorage.Tank.Occupancy)
local Remotes = require(ReplicatedStorage.Tank.Remotes)

local localPlayer = Players.LocalPlayer :: Player
local camera = workspace.CurrentCamera :: Camera

local model = workspace:WaitForChild("M103") :: Model
local hullModel = model:WaitForChild("Hull") :: Model
local hull = hullModel:WaitForChild("Hull") :: BasePart
local turret = (model:WaitForChild("Turret") :: Model):WaitForChild("Main") :: BasePart
local occupantValue = model:WaitForChild(Occupancy.VALUE_NAME) :: ObjectValue

local inputRemote = Remotes.input()
local exitRemote = Remotes.exit()

--- How far back the camera sits, and how far above the turret it looks.
local DISTANCE = 55
local FOCUS_HEIGHT = 6

--- Radians per pixel of mouse movement.
local SENSITIVITY = 0.005

--- How far the camera can look down and up. Not the gun's limits — the camera
--- may look somewhere the gun cannot reach, and the gun simply stops at its own.
local MIN_PITCH = math.rad(-60)
local MAX_PITCH = math.rad(35)

--- Keep the camera this far off whatever it would otherwise be inside.
local CAMERA_MARGIN = 1.5

--- Don't spend a remote call on a packet that says what the last one said.
local SEND_EPSILON = 0.01

-- ---------------------------------------------------------------------------
-- State
-- ---------------------------------------------------------------------------

local driving = false
local yaw = 0
local pitch = math.rad(-12)

-- Held per key rather than as one axis, so pressing W and S together and
-- releasing one does not leave the tank driving the way you let go of.
local forwardHeld, backHeld, leftHeld, rightHeld = 0, 0, 0, 0
local sent: Remotes.Input? = nil

local cameraCast = RaycastParams.new()
cameraCast.FilterType = Enum.RaycastFilterType.Exclude
cameraCast.FilterDescendantsInstances = { model }
cameraCast.IgnoreWater = true

-- ---------------------------------------------------------------------------
-- Controls
-- ---------------------------------------------------------------------------

--[[
	Bound through `ContextActionService` rather than read from
	`UserInputService.InputBegan`, for two reasons that both matter here: an
	action can be unbound again when you get out, so W does not drive a tank you
	have left; and `createTouchButton` gives mobile the same control for free.
]]
local function bindAxis(name: string, key: Enum.KeyCode, apply: (number) -> ())
	ContextActionService:BindAction(name, function(_, state: Enum.UserInputState)
		if state == Enum.UserInputState.Begin then
			apply(1)
		elseif state == Enum.UserInputState.End or state == Enum.UserInputState.Cancel then
			apply(0)
		end
		return Enum.ContextActionResult.Sink
	end, true, key)
end

local ACTIONS = { "TankForward", "TankBack", "TankLeft", "TankRight", "TankExit" }

local function bindControls()
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

	ContextActionService:BindAction("TankExit", function(_, state: Enum.UserInputState)
		if state == Enum.UserInputState.Begin then
			exitRemote:FireServer()
		end
		return Enum.ContextActionResult.Sink
	end, true, Enum.KeyCode.E)
	ContextActionService:SetTitle("TankExit", "Exit")
end

local function unbindControls()
	for _, name in ACTIONS do
		ContextActionService:UnbindAction(name)
	end
	forwardHeld, backHeld, leftHeld, rightHeld = 0, 0, 0, 0
end

UserInputService.InputChanged:Connect(function(input, processed)
	if not driving or processed then
		return
	end
	if input.UserInputType ~= Enum.UserInputType.MouseMovement then
		return
	end
	yaw -= input.Delta.X * SENSITIVITY
	pitch = math.clamp(pitch - input.Delta.Y * SENSITIVITY, MIN_PITCH, MAX_PITCH)
end)

-- ---------------------------------------------------------------------------
-- Getting in and out
-- ---------------------------------------------------------------------------

--[[
	Everything that changes when you take the tank, and unchanges when you leave.

	Driven by the `Occupant` value rather than by the button press, so a client
	that joined while somebody was already driving ends up in the same state as
	one that watched them get in — and so losing the character to a respawn,
	which the server treats as getting out, gives the camera back here too.
]]
local function setDriving(now: boolean)
	if now == driving then
		return
	end
	driving = now

	if driving then
		-- Start the camera behind the tank rather than wherever it was left, so
		-- getting in always faces the way the tank is pointed.
		local look = hull.CFrame.LookVector
		yaw = math.atan2(-look.X, -look.Z)
		pitch = math.rad(-12)
		camera.CameraType = Enum.CameraType.Scriptable
		UserInputService.MouseBehavior = Enum.MouseBehavior.LockCenter
		UserInputService.MouseIconEnabled = false
		bindControls()
	else
		unbindControls()
		sent = nil
		UserInputService.MouseBehavior = Enum.MouseBehavior.Default
		UserInputService.MouseIconEnabled = true
		camera.CameraType = Enum.CameraType.Custom
		local character = localPlayer.Character
		local humanoid = character and character:FindFirstChildWhichIsA("Humanoid")
		if humanoid then
			camera.CameraSubject = humanoid
		end
	end
end

occupantValue:GetPropertyChangedSignal("Value"):Connect(function()
	setDriving(occupantValue.Value == localPlayer)
end)
setDriving(occupantValue.Value == localPlayer)

-- ---------------------------------------------------------------------------
-- The frame
-- ---------------------------------------------------------------------------

local function changed(a: Remotes.Input?, b: Remotes.Input): boolean
	if a == nil then
		return true
	end
	return math.abs(a.throttle - b.throttle) > SEND_EPSILON
		or math.abs(a.steer - b.steer) > SEND_EPSILON
		-- A direction, so the threshold is an angle rather than a distance:
		-- about half a degree, below which the turret would not visibly move.
		or a.aim:Dot(b.aim) < 0.99996
end

RunService.RenderStepped:Connect(function()
	if not driving then
		return
	end

	local focus = turret.Position + Vector3.yAxis * FOCUS_HEIGHT
	local rotation = CFrame.fromEulerAnglesYXZ(pitch, yaw, 0)
	local wanted = focus + rotation * Vector3.new(0, 0, DISTANCE)

	-- Pulled in to whatever is in the way, so reversing into a wall does not put
	-- the camera inside it.
	local blocked = workspace:Raycast(focus, wanted - focus, cameraCast)
	local eye = if blocked then blocked.Position + blocked.Normal * CAMERA_MARGIN else wanted
	camera.CFrame = CFrame.lookAt(eye, focus)

	local packet: Remotes.Input = {
		throttle = forwardHeld - backHeld,
		steer = rightHeld - leftHeld,
		-- The camera's own direction rather than one rebuilt from yaw and pitch:
		-- if the camera was pulled in, this is still where it is looking, and the
		-- gun should agree with what is on screen.
		aim = camera.CFrame.LookVector,
	}
	if changed(sent, packet) then
		inputRemote:FireServer(packet)
		sent = packet
	end
end)
