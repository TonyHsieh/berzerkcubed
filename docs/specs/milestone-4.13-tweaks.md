# Milestone 4.13 tweaks: final delivery report

This document records what Milestone 4.13 actually delivered for BERZERK³, how each of the three spec sections was implemented, and the evidence behind it. It replaces the plan-only spec, but the numbering below still follows the plan so the document doubles as a coverage checklist.

The implementation comes from the verified worker handoff (`t_7b4db067`), the verifier pass (`t_ed882adf`, gate `pass`), and my own read of the diff plus a fresh gate run. The worker posted its handoff as comment 26 on the swarm blackboard `t_b5b69b2a` and the verifier posted its verdict as comment 27. Work follows the rules in [AGENTS.md](../../AGENTS.md) and the contracts in [SHARED_CONTRACTS.md](../SHARED_CONTRACTS.md).

Status: delivered, gate passed. The build reports 0 TypeScript errors across 1000 modules. All 111 tests pass in 15 files: 108 prior tests plus 3 new ones. The verifier reproduced the gate independently and got the same numbers, then ran a clean static scan for hardcoded secrets, shell injection, eval/exec, unsafe deserialization, string-built SQL, and stray console or debugger calls. I reran the command before writing this and got the same result.

## Delivered implementation

| File | What it contains |
| --- | --- |
| `src/engine/types.ts` | `CardinalDirection` (`north`/`south`/`east`/`west`), `SlidingDoor.cardinal`, `RoomTransitionState`, and `BossState.hitFlashKind` (`'core' \| 'shield'`) added. |
| `src/bosses/recogniser.ts`, `src/bosses/maximilian.ts`, `src/bosses/bugHive.ts` | Every core, part, shield, and bug-intercept damage path sets `boss.hitFlash = 0.12` plus `hitFlashKind`, with hit sparks. |
| `src/entities/orbitals.ts` | `updateOrbitals` now takes the boss, so orbiting shooter drones target it. |
| `src/world/levelData.ts` | All four cardinal doorways guaranteed on every sector and tagged with `cardinal`; exports `getDoorwayEntryPosition(island, enterDir, inset?)`. |
| `src/world/worldSim.ts` | Exports `unlockCardinalExitDoors(island)`; `updateWorld` takes `exitsUnlocked` to hold exit doors open (`openFraction = 1`) and bridges active. |
| `src/game/gameState.ts` | `GameState.roomTransition`; exports `ROOM_TRANSITION_DURATION` (0.62), `getRoomTransitionMapping`, `detectOpenExitDoorWalk`, and `startRoomTransition`. Wires boss-defeat door unlocking, door-walk push-slide transitions, invulnerable auto-walk-in, orbital targeting of the boss, and lightsaber hits that flash the boss. |
| `src/game/hud.ts` | Manual `NEXT SECTOR` button removed; hidden `hud-exit-hint` element shows `EXIT DOORS OPEN — WALK THROUGH ANY DOOR` after the boss falls. |
| `src/game/renderer.ts` | Boss hit-flash overlays (brightness/contrast filter plus white/red or cyan/amber rim, silhouette pulse, and radial sparks), glowing open doors with outward `>>>` chevrons, cubic-eased push-slide and cross-fade transitions, and 3/4 spacing (`BASE_LAYER_SPACING = 2.8`, `PITCH_Z_MULTIPLIER = 1.4`). |
| `src/render/spriteStack.ts` | Exports `DEFAULT_SLICE_PITCH_Y = 0.64`; `drawStack` and `SpriteStackCache.bake` apply `ctx.scale(1, slicePitchY)` before `ctx.rotate(rad)` while keeping the 24-angle cache and headless behavior. |
| `src/render/models.ts` | Expressive front-face Z bands for Skullhead, Hero, Enforcer, V-Bots, Laser Shooter, Grenadier, Maximilian, Recogniser, Evil Otto, ABB, and Brainbot. |
| `src/game/loading.ts`, `src/game/gallery.ts` | Both use spacing 2.8 and `DEFAULT_SLICE_PITCH_Y` so the `?gallery=1` gallery renders at the same pitch as the game. |
| `src/game/gameState.test.ts`, `src/render/spriteStack.test.ts` | Three new Vitest tests with real assertions: boss flash trigger/decay and shield versus core, boss-defeat door unlock plus all four door-walk transitions, and 3/4 pitch before rotate with the angle cache intact. |
| `docs/AGENT_LOG.md` | Milestone 4.13 entry with the file list and regression proof. |

The tracked diff is 17 files, +920/−69. The worker left the spec file and the `sample/` art alone; this report is the only edit to the spec, made after the gate passed.

## Requirement coverage

### 1. Boss hit-flash on every damage path

The plan asked for a visible flash whenever anything the player fires damages a boss or a boss part. The shared timer was already there: `stepBossCommonTimers` in `src/bosses/bossUtils.ts` decays `hitFlash` every tick, and that file was not touched. What was missing was consistent stamping of the timer on every damage route and a renderer pass that made the flash hard to miss.

Now the Recogniser leg and head paths, Maximilian core and shield paths, Bug Hive bug intercepts, and the generic core paths in `gameState.ts` all set `boss.hitFlash = 0.12` and tag `hitFlashKind` as `core` or `shield`. Projectiles, beam segments, the orbital lightsaber, and drones reach those paths. The change to `updateOrbitals` matters here because shooter drones previously had no boss to aim at.

In the renderer, a boss with a live flash timer that is not rezzing gets a filter while its sprite stack draws: `brightness(3.5) contrast(1.4)` for a core hit, `brightness(2.8) contrast(1.3) saturate(2.0)` for a shield hit. Once the stack is drawn, an ellipse pulse, a stroked rim with a glow, and radial sparks sit on top, scaled by `hitFlash / 0.12`. Core hits run white with a red accent; shield hits run cyan with amber. Rezzing bosses skip the flash so the two effects do not fight over the same pixels.

The test checks more than a truthy flash. It steps a Skullhead through a projectile and a beam, asserts `hitFlash` is 0.12 with kind `core`, ticks 12 frames (0.2 seconds) and asserts it returns to 0, checks a Brainbot beam hit and a shielded ABB reporting kind `shield`, then confirms an orbital lightsaber hit both flashes and removes HP.

### 2. Door-walk push-slide room transitions

The `NEXT SECTOR` button is gone from `hud.ts`. A hidden `hud-exit-hint` element takes its place and reads `EXIT DOORS OPEN — WALK THROUGH ANY DOOR` once the boss is cleared.

`levelData.ts` guarantees all four cardinal doorways on every sector and tags each door. `worldSim.ts` exports `unlockCardinalExitDoors`, and `updateWorld` accepts `exitsUnlocked` to keep those doors at `openFraction = 1` and the bridges active. Evil Otto's linger timer still runs after the boss dies, so stalling in a cleared room remains risky.

The transition logic sits behind four exports in `gameState.ts`. `detectOpenExitDoorWalk` checks whether the hero crossed the threshold of a door at least 75% open. `getRoomTransitionMapping` returns the opposite entrance and push-slide vector: east enters west and slides (-1, 0), west enters east and slides (1, 0), north enters south and slides (0, 1), south enters north and slides (0, -1). `startRoomTransition` builds the next sector index, drops the hero 24px inside the entrance doorway, points the walk angle into the room, grants invulnerability for at least `ROOM_TRANSITION_DURATION + 0.6`, and records the outgoing island and camera for the renderer. `ROOM_TRANSITION_DURATION` is 0.62 seconds, inside the plan's 0.55 to 0.7 window.

Each tick of `stepGameState` advances progress and eases it with `1 - (1 - p)^3`. The hero walks from the doorway to a point 108px inside, invulnerability stays topped up at 0.5 seconds, and the camera follows the entry point. On completion the hero snaps to the entry spot, the safe spot updates, and the transition clears. The renderer draws the outgoing room translated by `slideX * width * ease` and `slideY * height * ease` with alpha falling to zero, while the incoming room slides in from the opposite side with alpha rising from 0.2 to 1. The camera angle carries across.

The integration test covers boss defeat, door unlock, and all four door-walk directions. It confirms four cardinal doors exist at `openFraction = 1`, then for each direction checks the mapping, sector advance, an active transition, positive invulnerability, and the hero landing inside the expected doorway band once the transition ends.

### 3. 3/4 face-forward sprite perspective

The old top-down stacking did not compress slices, so players mostly saw the tops of heads. `drawStack` and `SpriteStackCache.bake` in `spriteStack.ts` now apply `ctx.scale(1, slicePitchY)` before `ctx.rotate(rad)`, with `DEFAULT_SLICE_PITCH_Y = 0.64` exported as the shared constant. Foreshortening happens in screen space before the local rotation, which flattens each slice into a plate and leans the whole front facade toward the camera.

Vertical spacing is 2.8px (`BASE_LAYER_SPACING`) in the renderer and loading cache, with `PITCH_Z_MULTIPLIER = 1.4` mapping the old camera spacing of 2.0 onto the new value. The `?gallery=1` path imports the same constant and spacing, so the gallery shows what the game renders.

`models.ts` uses the extra vertical room for readable front faces. Skullhead stacks jaw and teeth, nasal cavity and cheekbones, dark sockets with orange/red laser eyes, an ivory brow, and the propeller hat from lower to higher Z. Evil Otto gets a wide grin at z=2 to 3, angry glowing eyes at z=6 to 7, and a brow at z=8. The Hero, Enforcer, V-Bots, Laser Shooter, Grenadier, Maximilian, Recogniser, ABB, and Brainbot each put a visor, eye, chest core, or mouth on its own Z band.

The new `spriteStack.test.ts` test asserts the pitch scale runs before the rotate in both `drawStack` and `SpriteStackCache.bake`, and that the 24-angle cache still works headless.

## Verification gate

The worker, the verifier, and I all ran the command from the plan:

```
nix develop --impure --command sh -c "pnpm run build && pnpm test"
```

My run exited 0. `pnpm run build` reported 0 TypeScript errors and 1000 modules transformed in 2.35s. `pnpm test` reported 15 test files and 111 of 111 tests passing in 1.36s. The 3 new tests are two in `gameState.test.ts` (flash trigger, shield versus core, decay; door unlock plus all four door-walk transitions) and one in `spriteStack.test.ts` (pitch before rotate with the angle cache intact). The verifier confirmed the tracked diff matches the handoff at 17 files and +920/−69, and its static scan came back clean.

## Known caveats

None of these blocked the gate. They are recorded so the next worker does not have to rediscover them.

- All Milestone 4.13 changes remain uncommitted on `main`, as do the earlier milestones. The `sample/` reference art is still untracked, as it was found.
- No real-browser verification. The checks are headless Vitest plus the build. Flash readability, glow, chevrons, and the push-slide were not compared against a screenshot; transitions are proven through mapping vectors, progress values, and hero positions.
- The 0.62s duration sits inside the 0.55 to 0.7s range in the plan. It is a fixed constant, not a config value.
- The flash is a canvas filter plus a rim, ellipse pulse, and radial sparks rather than an offscreen `source-atop` white silhouette. The plan allowed either approach.
- The shared `hitFlash` decay in `bossUtils.ts` predates this milestone and was left alone. The new work is the consistent stamping of the timer on every damage path and the renderer pass that makes it visible.
- Every open cardinal door leads to `sectorIndex + 1`. Picking a different door does not branch to a different sector layout; the plan only required advancing the sector index.
- Face readability in the `?gallery=1` turntable is still a manual check. The tests cover layer geometry and the pitch transform, not how faces look at game scale.
- The first `agy` run hit its 300s print timeout mid-turn and left a partial diff. A 1500s continuation run finished the work and drove the gate green; the verifier then reproduced it from a clean run.

## References

- [AGENTS.md](../../AGENTS.md): software factory rules, module boundaries, verification rules.
- [plan.md](../../plan.md): full roadmap and milestone context.
- [milestone-4.12-tweaks.md](milestone-4.12-tweaks.md): the previous as-built report.
- [milestone-4.11-tweaks.md](milestone-4.11-tweaks.md): an earlier as-built report.
- [milestone-4.1-fixes.md](milestone-4.1-fixes.md): an earlier as-built report.
- [milestone-4-polish.md](milestone-4-polish.md): an earlier as-built report.
- [milestone-3-integration.md](milestone-3-integration.md): the first as-built report.
- [SHARED_CONTRACTS.md](../SHARED_CONTRACTS.md): cross-module API contracts.
- [QUESTIONS.md](../QUESTIONS.md): resolved decisions and recorded defaults.
- [AGENT_LOG.md](../AGENT_LOG.md): per-agent work entries and regression proof.
