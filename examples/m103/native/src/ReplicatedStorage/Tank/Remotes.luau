--!strict
--[[
	What the driver sends, and the check on it.

	Getting *in* is not here: that is a `ProximityPrompt`, which is already a
	server-side event with the player attached, so an enter remote would be a
	second way to do a thing the engine does properly.

	## Why the aim is a direction

	The turret follows where the camera is looking, and a camera pointed at the
	sky is not looking *at* anything. Sending the point the view happens to hit
	would make the gun swing to the horizon whenever the camera cleared the
	scenery, which reads as the turret losing its mind. A unit direction is what
	the turret is actually matching.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Remotes = {}

export type Input = {
	--- −1..1, along the hull's own forward.
	throttle: number,
	--- −1..1, positive turns right.
	steer: number,
	--- Unit vector, in world space: where the camera is looking.
	aim: Vector3,
}

local INPUT = "TankInput"
local EXIT = "TankExit"

local function event(name: string): RemoteEvent
	if RunService:IsServer() then
		local existing = ReplicatedStorage:FindFirstChild(name)
		if existing and existing:IsA("RemoteEvent") then
			return existing
		end
		local remote = Instance.new("RemoteEvent")
		remote.Name = name
		remote.Parent = ReplicatedStorage
		return remote
	end
	return ReplicatedStorage:WaitForChild(name) :: RemoteEvent
end

function Remotes.input(): RemoteEvent
	return event(INPUT)
end

--- Getting out. Carries nothing; who sent it is the whole message.
function Remotes.exit(): RemoteEvent
	return event(EXIT)
end

--[[
	Whether a packet is the shape this build expects.

	A client can send anything at all, so every field is checked before it
	reaches the controller. `aim` in particular ends up in the turret joint's
	`C0`, and a NaN there leaves the model drawn at no position anybody can
	find — `v ~= v` is the only test for one.
]]
function Remotes.valid(packet: unknown): boolean
	if typeof(packet) ~= "table" then
		return false
	end
	local input = packet :: Input
	if typeof(input.throttle) ~= "number" or input.throttle ~= input.throttle then
		return false
	end
	if typeof(input.steer) ~= "number" or input.steer ~= input.steer then
		return false
	end
	if typeof(input.aim) ~= "Vector3" or input.aim ~= input.aim then
		return false
	end
	-- A zero vector has no direction to follow and would normalise to NaN.
	return input.aim.Magnitude > 1e-4
end

return Remotes
