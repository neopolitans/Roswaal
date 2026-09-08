--!strict
--[[
	The tank's tunables, read out of the model rather than typed in here.

	`HullSettings` is a `Configuration` folder the model already carries, and the
	point of reading it is that this demo and the Roswaal graph version have to
	agree on where a number comes from. A constant hard-coded in one and read
	from a `NumberValue` in the other is not the same program, and the comparison
	would be measuring the wrong thing.

	Only what the demo uses. `HP`, and the whole of `TurretSettings`, come back
	when damage and firing do — reading values nothing consumes would make the
	module look like it does more than it does.
]]

local TankConfig = {}

export type Config = {
	--- Studs per second at full throttle.
	movementSpeed: number,
}

--[[
	Numbers the model has no home for.

	Each is a candidate for a new `NumberValue` in `HullSettings`, and the reason
	none has been added is that adding one is Studio work and these want tuning
	against a running tank first. When they settle they should move, and this
	table should shrink.
]]
local TUNING = {
	--- Degrees per second the hull yaws at full steer.
	turnRate = 45,
	--- Seconds from a standstill to full speed. Sixty tons does not leap.
	accelerationTime = 5,
	--- Seconds from full speed back to a standstill. Much shorter than
	--- accelerating: a tank has brakes and does not have much power. Was 2.5,
	--- which coasted about two and a half tank lengths after letting go and felt
	--- like ice rather than like weight.
	brakingTime = 1.2,
	--- Reverse tops out at this fraction of forward speed.
	reverseFraction = 0.45,
	--- Degrees per second the turret traverses. Slow on purpose: a turret that
	--- snaps to the camera is a turret nobody believes weighs sixty tons.
	traverseRate = 30,
	--- Degrees per second the gun elevates.
	elevationRate = 16,
	--- The gun's own limits, in degrees. Set by the author for the demo rather
	--- than taken from the real vehicle.
	minElevation = -7,
	maxElevation = 10,
	--- How far above the ground the tracks sit, to stop them clipping into it.
	groundClearance = 0.05,
	--- How close you have to be for the prompt to appear. The tank is 22 studs
	--- long, so this is "standing beside it" rather than "across the field".
	promptDistance = 18,
}

export type Tuning = typeof(TUNING)

TankConfig.tuning = TUNING

--[[
	Reads a `NumberValue` out of a `Configuration`.

	Deliberately loud. A missing setting is a model that does not match the code,
	and the failure it causes if allowed through — a tank that will not move
	because its speed defaulted to zero — is far harder to trace back here than
	an error naming the value on the first frame.
]]
local function readNumber(container: Instance, name: string): number
	local value = container:FindFirstChild(name)
	if not value then
		error(`{container:GetFullName()} has no "{name}"`, 0)
	end
	if not value:IsA("NumberValue") then
		error(`{value:GetFullName()} is a {value.ClassName}, expected a NumberValue`, 0)
	end
	return value.Value
end

function TankConfig.read(tank: Model): Config
	local hullSettings = tank:FindFirstChild("HullSettings")
	if not hullSettings then
		error(`{tank:GetFullName()} is missing HullSettings`, 0)
	end
	return { movementSpeed = readNumber(hullSettings, "MovementSpeed") }
end

return TankConfig
