# The M103, hand-written

The tank controller in ordinary Luau, written the way a Roblox developer would
write it. **This is the baseline, not the demo.** It exists so that the Roswaal
graph version has something to be compared against — without it, "the graph
works" means only "the graph does something", and the conversion test measures
nothing.

Started 8 September 2026. Nothing in it has been run yet; see
[the conversion log](../../../docs/demo/CONVERSION-LOG.md).

## What it does

Approach C, settled in [`../NOTES.md`](../NOTES.md):

- **The hull is anchored and CFrame-driven.** Each frame it yaws, moves along
  its own heading, then a downward raycast puts it on the ground and aligns it
  to the slope.
- **The turret traverses** by writing the `Main` joint's `Transform`.
- **The gun elevates** by writing the `Mantlet` joint's `Transform`, clamped to
  the real M103's −8° to +15°. The barrel rides the mantlet, which is why the
  mantlet is in the joint chain at all.
- **The tracks scroll** their tread textures by the distance each side actually
  covered, so a tank pivoting on the spot runs one track forward and one back.
- **The gun fires** a stepped projectile at `ProjectileSpeed`, and whatever it
  hits first takes `ProjectileDamage`.

Tunables come from the model's own `HullSettings` and `TurretSettings`
`Configuration` folders, because a number hard-coded in one version and read
from a `NumberValue` in the other would make the two programs different in a way
that has nothing to do with graphs.

## Running it

```
rojo serve examples/m103/native/default.project.json
```

into the place, which already has the tank. Then W/A/S/D to drive, the mouse to
aim, left mouse to fire. The camera looks straight down and stays world-aligned;
the tank turns under it rather than it turning with the tank.

## Layout

```
src/ReplicatedStorage/Tank/
  Config.luau     reads the Configuration folders; holds the tunables the model has no home for
  Rig.luau        finds the parts and joints once, and fails loudly when one is missing
  Remotes.luau    the single input RemoteEvent, and the check on what arrives through it
src/ServerScriptService/
  TankServer.server.luau    everything the tank does
src/StarterPlayer/StarterPlayerScripts/
  TankClient.client.luau    input, aim, and the top-down camera
```

The server owns the tank. Its hull is anchored and both turret joints replicate
on their own, so there is no physics, no network ownership and no prediction —
worth knowing before the same tank is attempted in Unreal, where the equivalent
is a replicated movement component and is not free.

## What is deliberately missing

- **Armour penetration.** The plan holds it back until driving and firing work.
  The slice registers a hit and applies flat damage; penetration is the first
  thing added after.
- **Ricochet.** `ProjectileRicochetCount` is a leftover of the cancelled project
  and [the survey](../NOTES.md) marks it suspect, so nothing reads it.
- **Shell drop.** Shells fly straight.
- **A seat, and more than one tank.** One model, and the first player to join
  drives it.

## For the conversion — what a graph will have to answer

Kept here as it is written, rather than reconstructed afterwards. Each of these
is a place the hand-written version does something a node graph may or may not
be able to express, and the answers belong in the conversion log.

1. **Per-frame accumulated state.** `turretYaw`, `gunPitch`, the two track
   offsets and the reload timer are all "last frame's value, adjusted". Script
   variables should cover it — this is the first real test of them.
2. **A list that is added to and removed from mid-iteration.** Shells in flight
   are stepped backwards so a removal does not skip the next one. Roswaal has
   loops; whether it has a comfortable reverse loop with removal is unknown.
3. **The framerate-independent ease**, `1 - 0.5^(dt/halfLife)`. Needs a power
   operator with a fractional exponent in the middle of an expression.
4. **Shortest-path angle wrapping**, `(target - current + π) % 2π - π`. Four
   operators and a constant; readable as one line, possibly not as five nodes.
5. **`CFrame.fromMatrix` with a negated axis.** The third argument is the back
   vector, so `forward` has to be negated on the way in. A split pin should make
   this legible; if it does not, it is exactly the kind of sign error a graph
   makes easy to hide.
6. **Two guards on the remote handler.** Sender identity and packet shape. A
   graph that makes either easy to leave out is a graph that ships an exploit.
7. **Early returns.** Several functions bail in the middle. Roswaal's exec flow
   has to express that without becoming a staircase.
8. **Reading a `Texture` out of a part's children by class.** A typed loop over
   `GetChildren` with an `IsA` test, twice per frame per track.
