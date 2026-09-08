# The M103, hand-written

The tank controller in ordinary Luau, written the way a Roblox developer would
write it. **This is the baseline, not the demo.** It exists so that the Roswaal
graph version has something to be compared against — without it, "the graph
works" means only "the graph does something", and the conversion test measures
nothing.

Started 8 September 2026; reworked the same day around getting in and driving.
First run the same day, which found one bug immediately — see
[the conversion log](../../../docs/demo/CONVERSION-LOG.md).

## What it does

Walk up to the tank, press **E**, and you are driving it. **W/A/S/D** move the
hull, the mouse swings a third-person camera around the tank, and the turret and
gun follow where you look. **E** again gets out.

That shape is the point. It is the tank demo everybody has already played, and
being recognisable comes before being interesting — a developer evaluating
Roswaal should not have to be told how to drive.

Underneath, approach C as settled in [`../NOTES.md`](../NOTES.md):

- **The hull is anchored and CFrame-driven.** Each frame it yaws, moves along
  its own heading, then a downward raycast puts it on the ground and aligns it
  to the slope.
- **The throttle is a throttle, not a speed.** Five seconds to full pace and two
  and a half to lose it, so letting go of W coasts rather than stops, and
  reverse tops out at under half of forward. That ramp is most of what makes
  sixty tons feel like sixty tons.
- **The turret traverses** by turning the `Main` joint, toward the bearing of
  the camera's look direction in the hull's own space.
- **The gun elevates** by turning the `Mantlet` joint, clamped to +10°/−7°. The
  barrel rides the mantlet, which is why the mantlet is in the joint chain.
- Both are turned by writing **`C0`**, not `Transform`. `Transform` is the
  property that exists for this and is what the animation system uses — and it
  does not replicate, so a turret turned that way on the server may not move for
  anyone watching.
- Both are **rate-limited rather than snapped**, and that limit is most of what
  makes a turret feel like it weighs sixty tons: the camera arrives instantly,
  the gun takes a moment, and the lag between them is the tank.
- **The tracks scroll** their tread textures by the distance each side actually
  covered, so a tank pivoting on the spot runs one track forward and one back.

`MovementSpeed` comes from the model's own `HullSettings` `Configuration`,
because a number hard-coded in one version and read from a `NumberValue` in the
other would make the two programs different in a way that has nothing to do with
graphs.

## Running it

```
rojo serve examples/m103/native/default.project.json
```

into the place, which already has the tank.

## Layout

```
src/ReplicatedStorage/Tank/
  Config.luau     reads HullSettings; holds the tunables the model has no home for
  Rig.luau        finds the parts and joints once, and fails loudly when one is missing
  Occupancy.luau  the Occupant value, and hiding the driver's character
  Remotes.luau    the input and exit events, and the check on what arrives
src/ServerScriptService/
  TankServer.server.luau    the prompt, who is driving, and everything the tank does
src/StarterPlayer/StarterPlayerScripts/
  TankClient.client.luau    the orbit camera and the controls
```

The server owns the tank. Its hull is anchored and both turret joints replicate
on their own, so there is no physics, no network ownership and no prediction —
worth knowing before the same tank is attempted in Unreal, where the equivalent
is a replicated movement component and is not free.

Three decisions in there are worth naming, because each has an obvious-looking
alternative that is wrong:

- **Getting in is a `ProximityPrompt`, not a remote.** The prompt is already a
  server-side event with the player attached. An enter remote would be a second
  way to do something the engine does properly, and one that trusts the client.
- **Who is driving is an `ObjectValue`, not an event.** One replicated property
  instead of an enter event, an exit event, and a late-joiner catch-up — and you
  can see who is in the tank in the explorer while it runs.
- **The client sends a look *direction*, not an aim point.** A camera pointed at
  the sky is not looking at anything, and a point would send the gun to the
  horizon every time the view cleared the scenery.

## What is deliberately missing

- **Firing, damage and armour penetration.** Cut on the author's call. The demo
  is about getting in and driving; a gun would be a second system to convert
  that repeats what the turret already proves.
- **Client-side prediction.** A shipping game would drive the hull locally and
  reconcile. That is a networking exercise, it roughly doubles the code, and
  none of it says anything about whether a node graph can express a tank.
- **A second tank, and a second seat.** One model, one driver.
- **Shell drop, ricochet, and the rest of `TurretSettings`.** Nothing reads
  them, so nothing pretends to.

## For the conversion — what a graph will have to answer

Kept here as it is written, rather than reconstructed afterwards. Each is a
place the hand-written version does something a node graph may or may not be
able to express, and the answers belong in the conversion log.

1. **Per-frame accumulated state.** `turretYaw`, `gunPitch` and the two track
   offsets are all "last frame's value, adjusted". Script variables should cover
   it — this is the first real test of them.
2. **A state machine with two sides.** Entering binds actions, takes the camera,
   locks the mouse; leaving undoes each one. Every acquire needs its release, and
   a graph that makes the pair easy to separate will leak one of them.
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
9. **Two flags that look like one.** Hiding the driver needs `CanCollide` *and*
   `CanQuery` off; the first alone let the tank's own ground probe land on its
   driver's head and fly the tank into the sky. A graph that offers one obvious
   "hide this" node had better turn off both.
10. **Remembering a value to put it back.** `Occupancy` records every
   transparency and collision flag it changes so exiting can restore them. A
   graph needs somewhere to keep a table keyed by instance, which is a different
   thing from a script variable holding a number.
11. **Instances created at runtime**, not authored in the model: the
    `ProximityPrompt`, the `WeldConstraint`, the `RemoteEvent`s. Each is
    `Instance.new`, some properties, and a parent — the parenting last, and a
    graph that lets you parent first has changed what the code does.
