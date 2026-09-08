--!strict
--[[
	The one remote the slice needs, created on demand so neither side has to care
	which ran first.

	Input goes client → server and nothing comes back. The hull is **anchored**,
	so the server moving it replicates on its own, and the turret joints
	replicate the same way — which is the quiet advantage of approach C over a
	physics-driven tank and worth knowing before the same thing is attempted in
	Unreal, where a replicated movement component is not free.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Remotes = {}

--[[
	What the client sends, every frame it changes.

	`throttle` and `steer` are −1..1. `aim` is a world point — the ground under
	the cursor — rather than an angle, because the server has to decide what the
	turret can actually reach and a client sending an angle would be asserting
	that it already knew.
]]
export type Input = {
	throttle: number,
	steer: number,
	aim: Vector3,
	fire: boolean,
}

local NAME = "TankInput"

function Remotes.input(): RemoteEvent
	if RunService:IsServer() then
		local existing = ReplicatedStorage:FindFirstChild(NAME)
		if existing and existing:IsA("RemoteEvent") then
			return existing
		end
		local remote = Instance.new("RemoteEvent")
		remote.Name = NAME
		remote.Parent = ReplicatedStorage
		return remote
	end
	return ReplicatedStorage:WaitForChild(NAME) :: RemoteEvent
end

--[[
	Whether a packet is the shape this build expects.

	A client can send anything at all, so every field is checked before it
	reaches the controller. `aim` in particular ends up in a `CFrame.lookAt`, and
	a NaN there propagates into the turret's `Transform` and leaves the model
	drawn at no position anybody can find.
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
	return typeof(input.fire) == "boolean"
end

return Remotes
