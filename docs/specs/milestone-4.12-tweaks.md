# Milestone 4.12 tweaks: final delivery report

This document records what Milestone 4.12 actually delivered for BERZERK³, how each of the four spec sections was implemented, and the evidence behind it. It replaces the original plan-only spec, and the numbering below still follows that plan so the document doubles as a coverage checklist.

The implementation comes from the verified worker handoff (`t_4c4379f8`), the verifier pass (`t_d4004933`, gate `pass`), and my own read of the diff plus a fresh gate run. All three of us posted structured notes to the swarm blackboard on `t_ec736fa2`; comment 22 carries the handoff, comment 23 the gate decision. Work follows the rules in [AGENTS.md](../../AGENTS.md) and the contracts in [SHARED_CONTRACTS.md](../SHARED_CONTRACTS.md).

Status: delivered, gate passed. The build reports 0 TypeScript errors across 1000 modules. All 108 tests pass in 15 files: 102 prior tests plus 6 new ones. The verifier reproduced the gate independently and got the same numbers, then ran a clean static scan for hardcoded secrets, shell injection, eval/exec, unsafe deserialization, string-built SQL, and stray console or debugger calls. I reran the command once more before writing this and got the same result.

## Delivered implementation

| File | What it contains |
| --- | --- |
| `src/engine/types.ts` | `deathTimer`, `rezTimer`, `rezDuration`, `rezHaloTimer`, `deathX`, and `deathY` added to `PlayerState`; `rezHaloTimer` added to `EnemyState` and `BossState` for the shared post-rez halo. |
| `src/entities/player.ts` | Exported `HERO_DEATH_DURATION` (0.85), `HERO_REZ_DURATION` (1.0), `HERO_POST_REZ_INVULN` (0.5), `HERO_TELEFRAG_RADIUS` (64), and `HERO_DEATH_PARTICLE_COUNT` (54), plus `clampToSafeIslandFloor`, `resetPlayerLoadout`, and `triggerHeroDeath`. `isPlayerInvulnerable` now covers the death and rez timers, `damagePlayer` starts the death sequence instead of instantly refilling HP, and `updatePlayer` freezes input while dying or rezzing. The old `RESURRECT_INVULN_SEC = 2.0` resurrection path is gone. |
| `src/bosses/bossUtils.ts` | `applyBossDamageToPlayer` treats `deathTimer > 0` and `rezTimer > 0` as invulnerable, so bosses cannot chip the hero mid-death or mid-rez. |
| `src/game/gameState.ts` | Exported `TelefragResult`, `telefragTargets`, and `stepHeroDeath`. Wires the death explosion, full loadout reset at the clamped death spot, invulnerable Rez-In, and 64px telefrag into `stepGameState`; tracks the 0.15s post-rez halo for the hero, enemies, and the boss; and blocks slot switching, dodge shove, orbitals, and pickup interaction while the hero is not active. |
| `src/game/renderer.ts` | Exported `DEFAULT_WALL_CHUNK_SIZE` (56), `WallChunk`, `chunkWallForDepthSort`, `chunkSlidingDoorForDepthSort`, `REZ_POST_HALO_SEC` (0.15), `RezFlashPhase`, and `rezFlashPhase`. Walls and sliding doors are subdivided into ~56px depth-sorted chunks; `drawDoor3D` renders retracting 3D energy-gate panels; `drawRezInBeam` gained the two-stage beam and opaque flash; `drawPostRezHalo` handles the 0.15s fade; the hero is hidden during `deathTimer` and rezzed in on respawn; the Skullhead propeller was moved to the top of the dome. |
| `src/render/models.ts` | `buildSkullhead()` rebuilt as a 14-layer ivory skull with dark sockets, glowing orange/red laser eyes, a nasal cavity, and a metallic teeth grille on the front (-Y), under a 3-layer 8px propeller hat. |
| `src/game/gameState.test.ts` | Two integration tests: the full death, loadout reset, invulnerability, and telefrag flow, and the final-life explosion before Game Over. |
| `src/game/renderer.test.ts` | New file with four unit tests: wall chunking at 0/90/180/270 degrees, retracting and fully open sliding doors, the `rezFlashPhase` stage transitions, and Skullhead layer geometry. |
| `docs/AGENT_LOG.md` | Milestone 4.12 entry with the file list and the regression proof. |

The tracked diff is 8 files, +1,243/−195, plus the untracked new `src/game/renderer.test.ts`. The worker left the spec file and the `sample/` art alone; this report is the only edit to the spec, made after the gate passed.

## Requirement coverage

### 1. Rotation-safe walls and doors

The reversed-sort bug came from submitting a 400 to 600px wall as one render queue item sorted by its unrotated `wall.h`. `chunkWallForDepthSort` now splits each wall into a grid of cells at most `DEFAULT_WALL_CHUNK_SIZE` (56px) on a side, projects every cell center through the same `project()` function the camera uses, and stores the projected Y as `sortY`. Each cell is pushed into the render queue with its own sort key and drawn as a normal extruded 3D block. At 90 and 270 degrees a horizontal wall runs vertically on screen, so its chunk Y values come out strictly monotonic instead of collapsing onto one value.

Doors went through the same treatment. `chunkSlidingDoorForDepthSort` builds two panels that shrink toward opposite ends of the frame as `openFraction` rises, splits each panel into chunks, and tags them `isDoor` with the current open fraction. A fully open door (less than 2% closed) emits nothing. `drawDoor3D` draws each chunk as an eight-layer vertical stack with a glowing top cap, amber while closed and cyan while open, so it lines up with the walls at any camera angle. The flat panel drawing that used to live in `renderIslandWorld` is reduced to a floor track outline.

The unit test checks chunk count, chunk size, projected sort Y, and monotonicity across 0, 90, 180, and 270 degrees. It also places an entity north and south of the wall and confirms the front/behind relationship flips between 0 and 180 degrees.

### 2. Two-stage Rez-In with an opaque climax

`rezFlashPhase` is a pure calculator the renderer uses for heroes, enemies, and bosses. From 0 to 0.80 the entity is ghosted at low alpha inside an upright screen-space beam with wireframe lines, converging rings, and digital sparks. From 0.80 to 1.00 the entity alpha drops to zero and a neon shell plus a solid white core grows over its footprint. At progress 1.00 the solid robot snaps back at full alpha while `drawPostRezHalo` fades an expanding white ring for 0.15 seconds. The beam is anchored to the entity's projected base and stays upright regardless of camera angle, which fixes the tilted-beam complaint.

The boss and enemy draw paths apply the same phase to their bottom-to-top reveal clip: `entityAlpha <= 0` hides them completely during the flash, then the halo timer fires once their `rezTimer` crosses zero. `stepGameState` watches for that transition and stamps `POST_REZ_HALO_SEC` onto each unit. The unit test walks the phase through beam, flash start, flash peak, halo at full and half strength, and done.

### 3. Skullhead face and propeller hat

`buildSkullhead` now spends its 14 body layers on a readable skull instead of a plain sphere. Layers 7 and 8 cut two dark sockets into the front (-Y) face and drop orange/red glow with a white-hot core inside them. Layers 5 and 6 add a recessed nasal notch and cheekbones, layers 3 and 4 add a metal jaw with alternating bright teeth, and the top layers taper into an ivory dome. The old wide teal and gold rotor wings are replaced by a three-layer hat: a small cap hub, a short spindle, and an 8px propeller cross. In `drawBoss` the hat scales down from 1.25 to 0.85 and sits at the top of the body stack rather than 8px above it, with alpha raised to 0.95. The test asserts 14 body layers and 3 hat layers. Visual readability in the `?gallery=1` turntable was not asserted by a pixel test, so that check is still manual.

### 4. Hero death and full-reset telefrag respawn

Five exported constants drive the flow: 0.85s of death, 1.0s of Rez-In, 0.5s of post-rez grace, a 64px telefrag radius, and 54 red death particles. `triggerHeroDeath` zeroes HP and shield, stops movement, records the death coordinates, and pushes a crimson `vfx_explosion` with 54 particles, an explosion SFX, and a 14-strength camera shake. `updatePlayer` returns no projectiles and accepts no movement input while either timer is above zero.

`stepHeroDeath` is a pure reducer called at the top of `stepGameState`. While the death timer runs it holds the hero still. When the timer ends it checks lives: at one life left or fewer it sets `gameOver` and returns, which is why the final death still gets its explosion before the Game Over screen. Otherwise it spends a life, clamps the recorded death point onto safe island floor with `clampToSafeIslandFloor`, calls `resetPlayerLoadout`, and starts the rez timer with invulnerability set to Rez-In plus the 0.5s grace. `resetPlayerLoadout` restores full HP and shield from the difficulty config, equips a fresh starter pulse rifle at level 1 in slot 1, empties slots 2 and 3, and clears orbitals, velocity, dodge, recoil, and muzzle flash. A fresh starter weapon means zero modifiers as well.

When the rez timer hits zero, `telefragTargets` destroys every non-boss enemy whose radius overlaps the 64px circle, clears overlapping enemy and boss projectiles, and knocks back and damages an overlapping boss. Boss damage is `TELEFRAG_BOSS_DAMAGE = 120` with `TELEFRAG_BOSS_KNOCKBACK = 320`, applied only when the boss is not itself rezzing or reconstructing and clamped so the boss never drops below 1 HP from this source. The central effect is a cyan burst with a slam SFX and a short camera shake. The hero then gets a 0.15s halo and stays invulnerable through the grace window.

`stepGameState` gates the rest of the simulation on `heroActive`. Slot selection and cycling, dodge shove, orbital updates, pickup collection, and weapon swap all skip while the hero is dying or rezzing. Enemy and boss contact damage routes through the same invulnerability check, so nothing can interrupt the respawn.

The integration test upgrades the hero with three weapon slots, two modifiers, and two orbitals, kills them, and asserts each stage: 54-particle red explosion, frozen input, a life spent, full default loadout at the death position, `damagePlayer` returning false during Rez-In, then materialization with the near enemy and hostile projectile gone, the far enemy still alive, and the boss damaged and pushed outside the telefrag radius. A second test runs the final-life path and checks that Game Over does not appear until the explosion timer finishes.

## Verification gate

The worker and verifier both ran the command from the plan:

```
nix develop --impure --command sh -c "pnpm run build && pnpm test"
```

I ran it again and got exit 0. `pnpm run build` reports 0 TypeScript errors and 1000 modules transformed, finishing in 1.65s. `pnpm test` reports 15 test files and 108 of 108 tests passing in 1.12s. The 6 new tests are four in `renderer.test.ts` (rotation chunking, sliding doors, flash phases, Skullhead geometry) and two in `gameState.test.ts` (the telefrag respawn flow and final-life explosion). The verifier confirmed the diff stats match the handoff and its static scan came back clean.

## Known caveats

These did not block the gate. They are recorded so the next worker does not have to rediscover them.

- All Milestone 4.12 changes remain uncommitted on `main`, as did the Milestone 3, 4, 4.1, and 4.11 changes. The `sample/` reference art is still untracked, as it was found.
- No real-browser verification. The checks are headless Vitest plus the build. No rendered pixel, layout, or browser-console assertion was made, so wall and door sorting at rotation is proven through projected coordinates rather than a screenshot.
- The 56px chunk size sits inside the plan's 48 to 64px range. Chunking is a two-axis grid split, which means a 20px-tall wall still becomes one row while a long wall becomes several columns.
- The opaque climax is a solid white and neon ellipse over the entity footprint, not a per-voxel build from wireframe to model. It reads as a flash, which is what the plan asked for, but it is not literally the robot filled in slice by slice.
- Telefrag never kills a boss outright. It clamps boss HP to a minimum of 1 and skips bosses that are rezzing or reconstructing.
- The post-rez halo is driven by timers stamped on each unit when `rezTimer` crosses zero, so it applies to all rezzing units from Milestone 4.11, not just the hero.
- Death invulnerability now runs 1.5s (1.0s Rez-In plus 0.5s grace) instead of the old flat 2.0s `RESURRECT_INVULN_SEC` used on ordinary resurrection. Edge falls also use the full loadout reset and the same 1.5s window.
- The death burst reuses the existing `vfx_explosion` particle system with a red color and a count of 54. There is no dedicated crimson voxel shader.
- The Skullhead redesign is checked by layer counts and geometry, and by the `?gallery=1` opt-in path. Automated tests do not judge how readable the face looks at game scale.

## References

- [AGENTS.md](../../AGENTS.md): software factory rules, module boundaries, verification rules.
- [plan.md](../../plan.md): full roadmap and milestone context.
- [milestone-4.11-tweaks.md](milestone-4.11-tweaks.md): the previous as-built report.
- [milestone-4.1-fixes.md](milestone-4.1-fixes.md): the earlier as-built report.
- [milestone-4-polish.md](milestone-4-polish.md): the earlier as-built report.
- [milestone-3-integration.md](milestone-3-integration.md): the first as-built report.
- [SHARED_CONTRACTS.md](../SHARED_CONTRACTS.md): cross-module API contracts.
- [QUESTIONS.md](../QUESTIONS.md): resolved decisions and recorded defaults.
- [AGENT_LOG.md](../AGENT_LOG.md): per-agent work entries and regression proof.
