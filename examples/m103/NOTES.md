# The M103 model — what is actually in it

**Surveyed 6 September 2026**, by reading `M103_Model.rbxm` and `place.rbxl`
directly rather than opening Studio. Written down because the rig is not the
shape a vehicle controller usually assumes, and finding that out in week 3
would be finding it out late.

## Licensing

The author's own work, built entirely on Roblox's renderer — SmoothPlastic and
`BrickColor`, no imported meshes, textures, decals or sounds. No third-party
asset travels with it, so it ships **0BSD** with the rest of the repository.

## The files

| File | Instances | Contents |
| --- | --- | --- |
| `M103_Model.rbxm` | 75 | The tank alone |
| `place.rbxl` | 158 | Baseplate, SpawnLocation, the same tank, stock services |

## The hierarchy

```
M103                     Model, no PrimaryPart
├─ Hull                  Model, PrimaryPart = Hull
│  ├─ Hull               MeshPart, ANCHORED — 10 cosmetic Motor6Ds hang off it
│  │  └─ TurretPosition  Attachment
│  ├─ LeftTrack          MeshPart — 4 Textures, VFXPosition, PathfindingModifier
│  └─ RightTrack         MeshPart — 4 Textures, VFXPosition, PathfindingModifier
├─ Turret                Model, PrimaryPart = Main
│  ├─ Main               Part, ANCHORED — 12 cosmetic Motor6Ds hang off it
│  └─ Gun                MeshPart
│     └─ FiringPoint     Attachment
├─ HullSettings          Configuration
│  ├─ MovementSpeed      NumberValue
│  └─ HP                 NumberValue
├─ TurretSettings        Configuration
│  ├─ ProjectileType     StringValue
│  ├─ ProjectileSpeed    NumberValue
│  ├─ ProjectileDamage   NumberValue
│  ├─ ProjectileRicochetCount  NumberValue
│  └─ ReloadSpeed        NumberValue
├─ TankTier              NumberValue
├─ PurchaseInfo          BoolValue
└─ Humanoid
```

## Three things that decide the controller's design

**1. Every one of the 22 Motor6Ds is cosmetic.** Ten have `Part0 = Hull` and
join a piece of hull decoration; twelve have `Part0 = Main` and join a piece of
turret decoration. Not one of them joins a moving part to another moving part.
Mechanically this is **two rigid bodies wearing a lot of trim**, not an
articulated rig.

**2. Nothing joins the Hull to the Turret.** There is no Motor6D, weld or
constraint between `Hull` and `Turret.Main`. The turret is a separate cluster
sitting in the right place because it was modelled there, held by nothing. The
`TurretPosition` attachment on the Hull marks where the joint *would* go.

**So turret traverse has to be built, not driven.** It does not exist yet.

**3. Both root parts are anchored,** and there is no `VehicleSeat`. As it
stands the model cannot move under physics at all.

The `Humanoid` and the two `PathfindingModifier`s on the tracks are residue
from the cancelled project, where this was an NPC rather than something a
player drove. Neither is wanted here.

## Design intent, from the author — 6 September

Recorded verbatim in substance, because it changes the reading of the survey
above and it arrived before the work started rather than during it.

- **The M103 was built for a mobile game, seen top-down.** The hull and turret
  are deliberately simple because that is all the perspective ever shows.
- **The tracks animate by scrolling their textures along U/V**, not by moving
  geometry. That is what the four `Texture` objects on each track are for —
  `OffsetStudsU` / `OffsetStudsV`, one per face. No track links, no wheels
  turning, and nothing physical to simulate.
- **The only rigidbody change wanted is the gun's pivot.** It needs re-addressing
  so the gun rotates about its own trunnion.
- **Projectiles get reworked to real armour penetration**, replacing the original
  project's "projectiles bounce off walls" behaviour. `ProjectileRicochetCount`
  in `TurretSettings` is a leftover of that older model and should be treated as
  suspect rather than as a requirement.

### What that changes

**The gun is already jointed.** The survey above is right that nothing joins
Hull to Turret, but the gun is a different case: the Motor6D named `Gun` under
`Main` has `Part0 = Main`, `Part1 = Gun [MeshPart]`. So gun elevation does not
need a new joint — it needs that Motor6D's **`C0` moved to the trunnion**, and
then elevation is writing its `Transform`. Smaller than first assessed.

**Approach C is confirmed as the right one,** and the top-down framing makes it
more so. Nothing about the intended game wants suspension, wheel physics or
vehicle constraints; the tracks are a shader trick. That removes the only real
argument for approach B.

**Track scrolling is a nice small graph.** Speed → `OffsetStudsV` accumulated
per frame, one Texture at a time, sign flipped per side when turning. It reads
well as a graph and it converts to Blueprints as a material-parameter scroll,
which is a comparison worth having in the log.

**Armour penetration replaces ricochet in the slice.** That is a bigger gameplay
change than it sounds — a penetration model needs surface normal against shot
vector, effective thickness, and a threshold — so it stays *out* of the vertical
slice's first cycle and goes in only once driving and firing work. The slice
fires and registers a hit; penetration is the first thing added after.

## What to do about it

Three ways to make it drive, and they are not equally good for what this demo
is *for* — measuring whether a Roswaal graph translates to Blueprints.

**A · Anchored, CFrame-driven.** Keep both parts anchored, write `Hull.CFrame`
from input each frame, and set `Main.CFrame` relative to it for traverse.
Deterministic, no physics tuning, and it maps almost word for word onto
`SetActorLocationAndRotation`. No terrain, no collisions.

**B · Unanchor and use constraints.** Add a `VehicleSeat`, `HingeConstraint`s
for traverse and elevation, drive with velocities. The most "real" vehicle —
and a week of Roblox physics tuning that teaches us nothing about Roswaal,
because it is the least transferable part of the whole exercise.

**C · CFrame hull on a ground raycast, jointed turret.** ← *recommended.*
Raycast down from the hull each frame, sit on what it finds and align to the
slope; add the one missing `Motor6D` (`Part0 = Hull`, `Part1 = Main`, `C0` at
`TurretPosition`) and traverse by writing its `Transform`.

C is the recommendation for three reasons. It exercises exactly the CFrame node
pack built in week 1 — `lookAt`, `Angles`, `ToWorldSpace`,
`PointToWorldSpace`, the `Position`/`Rotation` split — so the demo doubles as
that pack's field test. It keeps terrain interaction without opening the
physics-tuning rabbit hole. And driving a joint's `Transform` is precisely how
Blueprints rotates a bone on a skeletal mesh, which makes the most conceptually
awkward part of the tank the part that translates *best*.

**Settled, 8 September 2026: C.** The author's call, and it agrees with the
recommendation above and with the design intent recorded further up — nothing
about a top-down mobile game wants suspension or wheel physics, and the tracks
are a shader trick, which removes the only real argument for B.

So week 3 is no longer blocked on a decision. What it needs from the model is
one new `Motor6D` — `Part0 = Hull`, `Part1 = Main`, `C0` at the
`TurretPosition` attachment — plus the existing `Gun` Motor6D's `C0` moved to
the trunnion. Traverse and elevation are then both writing a joint's
`Transform`, which is the part that translates best to Blueprints.

## Free gifts

- **The `Configuration` folders are already the tunables the slice needs.**
  `MovementSpeed`, `ReloadSpeed`, `ProjectileSpeed`, `ProjectileDamage`. The
  graphs should read these rather than hard-code numbers — and reading a
  `NumberValue` out of a `Configuration` is a small, legible graph that shows
  instance paths off well.
- **`FiringPoint`** on the Gun is the muzzle, ready for the shot raycast.
- **`VFXPosition`** on each track is where dust would go, if the slice ever
  grows that far. It will not this month.

## Reading these files without Studio

`scripts/` has no tool for this and does not need one — the survey above was a
throwaway reader for the binary format (`<roblox!` header, LZ4 chunks in the
model, zstd in the place, `INST`/`PROP`/`PRNT`). If it is ever wanted again it
is about 150 lines. Worth knowing it is cheap, rather than assuming a binary
model is opaque.
