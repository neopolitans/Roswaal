--!strict
--[[
	The tank's tunables, read out of the model rather than typed in here.

	`HullSettings` and `TurretSettings` are `Configuration` folders the model
	already carries, and the point of reading them is that the demo and the
	Roswaal graph version have to agree on where a number comes from. A constant
	hard-coded in one and read from a `NumberValue` in the other is not the same
	program, and the comparison would be measuring the wrong thing.

	Everything the model does *not* carry is in `TUNING` below, clearly separated
	so it is obvious which numbers came from the tank and which were invented for
	the demo.
]]

local TankConfig = {}

export type Hull = {
	movementSpeed: number,
	hp: number,
}

export type Turret = {
	projectileType: string,
	projectileSpeed: number,
	projectileDamage: number,
	reloadSpeed: number,
}

export type Config = {
	hull: Hull,
	turret: Turret,
}

--[[
	Numbers the model has no home for.

	Each of these is a candidate for a new `NumberValue` in one of the two
	`Configuration` folders, and the reason none has been added yet is that
	adding one is Studio work and the values want tuning against a running tank
	first. When they settle they should move, and this table should shrink.
]]
local TUNING = {
	--- Degrees per second the hull yaws at full steer.
	turnRate = 60,
	--- Degrees per second the turret traverses.
	traverseRate = 24,
	--- Degrees per second the gun elevates.
	elevationRate = 12,
	--- The real M103 depressed 8 degrees and elevated 15.
	minElevation = -8,
	maxElevation = 15,
	--- How far a shell travels before it is given up on, in studs.
	maxRange = 2000,
	--- How far above the ground the tracks sit, to stop them clipping into it.
	groundClearance = 0.05,
}

export type Tuning = typeof(TUNING)

TankConfig.tuning = TUNING

--[[
	Reads a `NumberValue`/`StringValue` out of a `Configuration`.

	Deliberately loud. A missing setting is a model that does not match the code,
	and the failure it causes if allowed through — a tank that will not move
	because its speed defaulted to zero — is far harder to trace back here than
	an error naming the value on the first frame.
]]
local function read<T>(container: Instance, name: string, expected: string): T
	local value = container:FindFirstChild(name)
	if not value then
		error(`{container:GetFullName()} has no "{name}"`, 0)
	end
	if not value:IsA(expected) then
		error(`{value:GetFullName()} is a {value.ClassName}, expected a {expected}`, 0)
	end
	return (value :: any).Value
end

function TankConfig.read(tank: Model): Config
	local hullSettings = tank:FindFirstChild("HullSettings")
	local turretSettings = tank:FindFirstChild("TurretSettings")
	if not hullSettings or not turretSettings then
		error(`{tank:GetFullName()} is missing HullSettings or TurretSettings`, 0)
	end

	return {
		hull = {
			movementSpeed = read(hullSettings, "MovementSpeed", "NumberValue"),
			hp = read(hullSettings, "HP", "NumberValue"),
		},
		turret = {
			projectileType = read(turretSettings, "ProjectileType", "StringValue"),
			projectileSpeed = read(turretSettings, "ProjectileSpeed", "NumberValue"),
			projectileDamage = read(turretSettings, "ProjectileDamage", "NumberValue"),
			reloadSpeed = read(turretSettings, "ReloadSpeed", "NumberValue"),
		},
	}
end

return TankConfig
