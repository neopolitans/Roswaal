# The M103 model — what is actually in it

**Surveyed 6 September 2026**, by reading `M103_Model.rbxm` and `place.rbxl`
directly rather than opening Studio. Written down because the rig is not the
shape a vehicle controller usually assumes, and finding that out in week 3
would be finding it out late.

**Re-read 8 September**, after the author's Studio pass — see
[The rig as it stands](#the-rig-as-it-stands--8-september). Two claims in the
survey below stopped being true that day and are marked where they appear.

## Licensing

The author's own work, built entirely on Roblox's renderer — SmoothPlastic and
`BrickColor`, no imported meshes, textures, decals or sounds. No third-party
asset travels with it, so it ships **0BSD** with the rest of the repository.

## The files

| File | Instances | Contents |
| --- | --- | --- |
| `M103_Model.rbxm` | 76 | The tank alone |
| `place.rbxl` | 159 | Baseplate, SpawnLocation, the same tank, stock services |

Each was one lighter before the 8 September pass added the turret joint.

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

**2. Nothing joins the Hull to the Turret.** ~~There is no Motor6D, weld or
constraint between `Hull` and `Turret.Main`.~~ **Built on 8 September** — the
turret joint now exists. The `TurretPosition` attachment on the Hull marked
where it would go, and that is where it went.

**3. Both root parts are anchored,** and there is no `VehicleSeat`. As it
stands the model cannot move under physics at all. **`Turret.Main` was
unanchored on 8 September**, as the new joint requires; the Hull stays anchored,
which is what approach C wants.

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

## The rig as it stands — 8 September

The author's Studio pass, read back out of both files. **The turret joint is
done; the gun's pivot is not.**

### Done

**The turret joint exists.** A `Motor6D` named `Main` under `Hull.Hull`, with
`Part0 = Hull.Hull`, `Part1 = Turret.Main`, `C1` identity and

```
C0 = (0, 2.056, -2.025), rotation identity
```

which is the `TurretPosition` attachment to within a thousandth — the
attachment reads `(0, 2.056, -2.024)`. Traverse is now `Motor6D.Transform`,
exactly as approach C wants.

**`Turret.Main` is unanchored.** Necessary rather than incidental: an anchored
`Part1` ignores its joint, so the Motor6D above would have done nothing while
the turret sat where it was modelled. `Hull.Hull` stays anchored, which is
correct — approach C writes the hull's `CFrame` directly.

**The two files agree for the first time.** `M103_Model.rbxm` was a *half-scale*
export: every part size and every `C0` in it was exactly half the same value in
`place.rbxl`. The re-export fixed that, and the model file's world CFrames now
match the place's part for part. Worth knowing that the discrepancy existed,
because the 6 September survey read the model file and the sizes it recorded
were the wrong ones.

**In the place, the model was renamed `M` → `M103`.**

### Not done — the gun's pivot

The `Gun` Motor6D still reads

```
Part0 = Turret.Main, Part1 = Turret.Gun
C0 = (0, 1.705, -14.344), C1 = identity
```

and `-14.344` is the **gun's own centre**, not the trunnion. The barrel is
18.501 studs long, so the joint sits half a barrel — 9.25 studs — ahead of
where it should be. `FiringPoint` corroborates it: the muzzle attachment is at
`z = -9.33` in the gun's own space, a hair past the front face at `-9.25`, so
the gun's origin is indeed its middle. Writing elevation to that joint's `Transform` swings the
gun about its middle: the breech rises as the muzzle drops, and the whole gun
pulls out of the mantlet on the way.

The trunnion is where the `Mantlet` joint already points, `z = -5.371` relative
to `Main`. Moving the pivot there without moving the gun means setting both
halves of the joint:

```lua
Gun.C0 = CFrame.new(0, 1.705, -5.371)
Gun.C1 = CFrame.new(0, 0, 8.973)
```

`C1` is the 8.973-stud difference between the old pivot and the new one, in the
gun's own space, and it is what keeps the gun exactly where it is now while the
pivot moves behind it. Keeping the gun's `y` of `1.705` rather than the
mantlet's `1.915` puts the axis on the barrel's centre line instead of a fifth
of a stud above it.

Nothing else in the model is waiting on Studio.

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

So week 3 is no longer blocked on a decision. What it needed from the model was
one new `Motor6D` — `Part0 = Hull`, `Part1 = Main`, `C0` at the
`TurretPosition` attachment — plus the existing `Gun` Motor6D's `C0` moved to
the trunnion. **The first is done and the second is not**; see
[The rig as it stands](#the-rig-as-it-stands--8-september) for the two lines
that finish it. Traverse and elevation are then both writing a joint's
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

**`scripts/read-rbxm.mjs`.**

```
node scripts/read-rbxm.mjs examples/m103/M103_Model.rbxm --tree --joints
node scripts/read-rbxm.mjs examples/m103/place.rbxl --props Turret.Gun
```

It was thrown away after the 6 September survey on the grounds that it was
cheap to write again. Checking the Studio pass on the 8th needed it again, at
which point writing it a third time stopped being the cheaper option — and week
3 wants it after every change to the rig. It reads; it never writes. Nothing
else in the repository imports it.
