# Milestone 4.14 tweaks: final delivery report

This document records what Milestone 4.14 actually delivered for BERZERK³, how each of the five spec sections was implemented, and the evidence behind it. It replaces the plan-only spec, but the numbering below still follows the plan so the document doubles as a coverage checklist.

The implementation comes from the verified worker handoff (`t_a8755235`), the verifier pass (`t_b28f867e`, gate `pass`), my own read of the diff, and a fresh gate run. The worker posted its handoff as comment 30 on the swarm blackboard `t_779b2fe8` and the verifier posted its verdict as comment 31. Work follows the rules in [AGENTS.md](../../AGENTS.md) and the contracts in [SHARED_CONTRACTS.md](../SHARED_CONTRACTS.md).

Status: delivered, gate passed. The build reports 0 TypeScript errors across 1000 modules and finishes the Vite bundle in 2.38s. All 122 tests pass in 16 files: 111 prior tests plus 11 new ones in `src/game/milestone414.test.ts`. The verifier reproduced the gate independently and got the same numbers, then ran a static scan for hardcoded secrets, shell injection, eval/exec, unsafe deserialization, and stray debug calls. I reran the command before writing this and got the same result.

## Delivered implementation

| File | What it contains |
| --- | --- |
| `src/engine/types.ts` | Adds the `'sawblade'` projectile kind, ICBM fields (`icbm`, `turnRate`, `blastRadius`, `spinAngle`), the `AblativeShieldPlate` and `SkullLaserBeam` interfaces, status fields on enemies and bosses (`burnTimer`, `burnTickTimer`, `chillSlow`, `lightningFlashTimer`), and four new events (`vfx_shockwave`, `vfx_lightning_arc`, `vfx_flame_smoke`, `vfx_sizzle`). |
| `src/world/worldSim.ts` | Exports `raycastSolidWalls` and `RaycastHit`, a slab-method ray/AABB intersection run against solid walls and doors still below the passable threshold. |
| `src/enemies/enemyUtils.ts` | Exports `FREEZE_HIT_SLOW` (0.02), `FREEZE_MAX_SLOW` (0.85), `FREEZE_RECOVERY_PER_SEC` (0.01), `applyFreezeHit`, `recoverChillSlow`, and `getChillSpeedMultiplier`, with the old `freezeTimer` slow kept as a fallback. |
| `src/enemies/enforcer.ts`, `src/enemies/shooter.ts` | Scale movement by `(1 - chillSlow)`, recover chill each tick, decay `lightningFlashTimer`. Shooters also scale their fire rate while chilled. |
| `src/bosses/bossUtils.ts` | `stepBossCommonTimers` now recovers chill and decays lightning flash, and folds the chill multiplier into `speedMult`. |
| `src/bosses/maximilian.ts` | Exports `createMaximilianAblativePlates` and `interceptProjectileWithAblativeShields`. Adds sector-scaled concentric shield rings and periodic thrown sawblades; `updateMaximilian` returns spawned projectiles. |
| `src/bosses/abb.ts` | Exports `ABB_ICBM_SPEED` (290), `ABB_ICBM_TURN_RATE` (2.0), `ABB_ICBM_BLAST_RADIUS` (112), and `steerGuidedIcbm`. The eight-missile ring now carries the ICBM flags. |
| `src/bosses/skullhead.ts` | Exports `computeSkullheadEyeLasers`. Both eye beams raycast against walls and closed doors before testing the hero, and `updateSkullhead` takes the island so it can emit impact events. |
| `src/game/gameState.ts` | Exports `GRENADE_BLAST_RADIUS` (96), `LIGHTNING_CHAIN_RADIUS` (130), `LIGHTNING_FLASH_SEC` (0.16), `BURN_DURATION_SEC` (3.0), and `triggerLightningChain`. Wires grenade detonation, sawblade and ICBM impacts, shield interception, wall-blocked lasers, burn DOT, freeze slow, and lightning chains. |
| `src/render/vfx.ts` | Adds `ring`, `flame`, `smoke`, and `sizzle` particles with new emitters and event handlers, plus a white core on lightning arcs. |
| `src/game/renderer.ts` | Draws ablative plates, clipped Skullhead beams with sizzle flares, flickering fireballs, spinning sawblades, ICBM rockets, chill and burn overlays, and white/blue lightning flashes. Projectile drawing now receives camera angle and elapsed time. |
| `src/game/milestone414.test.ts` | Eleven headless Vitest tests covering all five sections plus a VFX event smoke test. New file. |
| `docs/AGENT_LOG.md` | Milestone 4.14 entry with the file list and regression proof. |

The tracked diff is 13 files, +1420/−135. The new test file is untracked, as is the pre-existing `sample/` reference art. The worker left the spec file alone; this report is the only edit to it, made after the gate passed.

## Requirement coverage

### 1. Explosive grenades

Grenades used to have one quiet exit: land, maybe bounce once, or run out of life and call a small blast. A grenade that struck a wall while airborne could sail over the obstacle and then vanish. Now `advanceProjectiles` checks wall contact alongside `z <= 0` and `life <= 0` and detonates on whichever comes first, using the previous position so the blast lands against the wall rather than inside it. Player projectile collisions also detonate grenades and mines on enemy, crate, and boss contact instead of letting them pass through.

`detonateAreaDamage` took the bulk of the change. It still emits `vfx_explosion` and `sfx: explosion`, and now adds an expanding `vfx_shockwave` ring and a configurable `camera_shake`. Damage uses a direct distance check over enemies, crates, and the boss so the blast reaches everything inside `GRENADE_BLAST_RADIUS` (96) plus the target's radius. Hostile grenades damage the player through i-frames and shields via the existing `damagePlayer` path, so grenadiers hurt without bypassing defense.

The two new tests cover a player grenade landing next to one enemy and far from another, asserting the near enemy loses HP, the far one does not, and explosion, shockwave, camera shake, and explosion SFX events all fire. A second test drives a grenade into a wall and an enemy grenade into fuse expiry while the player stands in range, checking that both produce a blast and that the second one strips shield.

### 2. Maximilian sawblades and layered shields

`createMaximilianAblativePlates` builds concentric rings around the chassis. Layer 0 has four plates at orbit radius 80, layer 1 has six at 102, and layer 2 adds six more at 124 from sector 2 upward. Plate HP scales with the sector index, so later fights take more shots to peel. `updateMaximilian` rotates them in place, alternating direction by layer, and refreshes each plate's position every tick.

`interceptProjectileWithAblativeShields` runs before core damage. A hit subtracts the shot's damage from that plate, stamps a flash on both plate and boss, and emits a cyan spark burst. The shot stops unless it has pierce and a bounce left. When plate HP hits zero the plate is removed and a `shield_break` sound fires with cyan and crimson shard bursts. That opens a firing lane into the core, which is the point of the mechanic.

Sawblades are thrown during `stalk`, `charge`, and `whirlwind` on a cooldown of 1.45s, dropping to 0.95s in whirlwind. They travel at 360 px/s, spin at 900 deg/s in both simulation and renderer, shred a destructible crate in one hit, and erupt in white and amber sparks on wall or door impact before bouncing once. `updateMaximilian` returns the spawned blades so `gameState.ts` can push them into `bossProjectiles`.

The tests check plate counts and layer growth across sectors, then fire a shot at a plate and verify the plate loses exactly its HP value, flashes, the projectile dies, and the boss core is untouched. A killing shot removes the plate and emits `shield_break`. A separate test runs Maximilian through 60 ticks, confirms a sawblade spawns, and watches for the white or amber spark burst plus the clang SFX.

### 3. ABB guided ICBMs

ABB's eight-missile ring now flies at 290 px/s instead of 155, with damage raised from 20 to 28 and lifetime from 4.8s to 5.2s. Each missile carries `icbm: true`, a 112px blast radius, and a 2.0 rad/s turn rate. `steerGuidedIcbm` computes the shortest angle to the hero and clamps the step to `turnRate * dt`, then rebuilds the velocity vector at the same speed. The missile keeps moving forward fast while turning slowly, which produces long dodgeable arcs rather than an instant snap toward the player. The old homing behavior remains for non-ICBM drones.

`detonateIcbm` reuses `detonateAreaDamage` with heavier settings: shake magnitude 16 for 0.36s, three shockwave rings, 28 fire particles, 14 smoke particles, and crate damage on hostile blasts. ICBMs detonate on wall, crate, and hero contact. The renderer draws them along the velocity heading with a pale fuselage, red nosecone, swept red fins, a flickering orange thruster, and trailing smoke puffs.

One test runs 60 updates of ABB and checks that at least eight ICBMs spawn across all four quadrants. It then points a test missile east at a target due west and steps it, verifying the heading changes by no more than `turnRate * dt` and that speed stays at 290. The second test flies an ICBM into a wall near the hero and asserts shield loss, a camera shake between 14 and 18 with a duration of at least 0.3s, a shockwave, and the explosion SFX.

### 4. Skullhead wall-blocked eye lasers

`raycastSolidWalls` in `worldSim.ts` walks every wall and every door below `DOOR_PASSABLE_THRESHOLD` with a ray/AABB slab test, returning the nearest hit as an `x`, `y`, `dist`, and `hit` flag. `computeSkullheadEyeLasers` uses that result for each of the twin beams. It first finds the wall distance, then intersects a ray/circle against the hero and only accepts a hero hit when it falls closer than the wall. The beam endpoint is either the hero contact or the wall contact, never a fixed 680px ray through geometry.

`updateSkullhead` now receives the island, recomputes the beams each active tick, and stores them on `boss.skullLaserHits` for the renderer. Wall hits emit `vfx_sizzle`, an orange spark burst, and the electric zap SFX, throttled so a stationary beam does not emit a burst every frame. Hero hits deal 18 damage through `applyBossDamageToPlayer` and emit the same impact effects at the contact point. The renderer draws both the telegraph and the active beam out to those stored endpoints, with a pulsing molten flare wherever a beam terminates on a surface or the player.

The test places a wall between Skullhead and the hero, checks the direct raycast returns a hit at x = 500, then verifies both computed beams report `hitWall`, no player hit, and endpoints at or before the wall. Running `updateSkullhead` leaves the hero's shield unchanged and emits sizzle plus electric zap events.

### 5. Hero elemental weapons

The flamethrower now ignites victims. A flame hit sets `burnTimer` to 3.0s and a `vfx_flame_smoke` event. Each 0.35s tick while burning deals 6 damage and emits more flame and smoke particles, with extra smoke between ticks so the effect reads continuously. Bosses take the same burn DOT, gated on not rezzing or reconstructing. The renderer draws flames as animated fireballs with a white-hot core, yellow inner flame, orange mid-flame, jagged crimson corona, and three trailing embers, and draws a flickering red and yellow overlay on burning enemies.

Freeze adds the exact math the plan asked for. `applyFreezeHit` adds 0.02 to `chillSlow` per hit and clamps at 0.85; `recoverChillSlow` removes 0.01 per second; `getChillSpeedMultiplier` returns `1 - chillSlow`. Enforcers, shooters, and bosses route their movement through that multiplier, and shooters also slow their fire rate. The helper keeps the legacy `freezeTimer` behavior as a fallback, setting it to at least 2.5s on a freeze hit and returning 0.35 when `chillSlow` is unset. The renderer replaces the old cyan outline with an icy-blue ellipse whose glow scales with `chillSlow`.

Lightning gained a real chain. `triggerLightningChain` flashes the first victim for 0.16s, then greedily hops to the nearest unvisited enemy within 130px up to `2 * weapon.level` times, dealing 65% of base damage on each hop. Every hop emits a `vfx_lightning_arc` and an electric zap SFX, and every chained victim gets the white and blue flash. The VFX system draws those arcs with a jagged cyan path and a bright white core. Lightning hits on bosses set their flash timer directly.

Four tests back this section. They check burn ignition, DOT damage, and flame/smoke events; the exact freeze increments, clamp, recovery, and reduced movement speed; a level-2 lightning shot flashing five enemies (the initial target plus four chains) while leaving the sixth and a distant enemy untouched, with four arcs emitted; and the VFX system handling all four new event types without throwing.

## Verification gate

The worker, the verifier, and I all ran the command from the plan:

```
nix develop --impure --command sh -c "pnpm run build && pnpm test"
```

My run exited 0. `pnpm run build` reported 0 TypeScript errors and 1000 modules transformed in 2.38s. `pnpm test` reported 16 test files and 122 of 122 tests passing in 1.56s. The 11 new tests split into two per section for grenades, Maximilian, and ABB, one for Skullhead, and four for the elemental weapons and VFX. The verifier confirmed the tracked diff matches the handoff at 13 files and +1420/−135, checked that all claimed helpers and constants exist with spec-matching values, and its static scan came back clean.

## Known caveats

None of these blocked the gate. They are recorded so the next worker does not have to rediscover them.

- All Milestone 4.14 changes remain uncommitted on `main`, as do the earlier milestones. The new test file and the `sample/` reference art are untracked as found.
- No real-browser verification. The checks are headless Vitest plus the build. Fireball flicker, ICBM fins, chill glow, ablative plate readability, and laser flares were not compared against a screenshot; they are verified as code paths and emitted events rather than pixels.
- The numeric constants were picked inside the ranges the plan allowed: grenade radius 96 against 85 to 110, ICBM speed 290 against 260 to 320, turn rate 2.0 against 1.8 to 2.4, blast radius 112 against roughly 110, and shake 16 for 0.36s against 14 to 18 for 0.35s. They are fixed constants, not config values.
- Grenades no longer bounce before detonating. The plan asked for detonation on landing, impact, or expiry and said they must never silently vanish, so the bounce path was removed. This changes how a grenade feels when it clips a wall.
- Lightning floors the weapon level at 1 when computing chain count, so a level-0 weapon still gets two chain hops. The plan wrote `2 * weapon.level` literally; in normal play the weapon starts at level 1.
- The legacy `freezeTimer` slow is still present and takes over when `chillSlow` is zero. Freeze hits refresh both timers, so old freeze behavior and the new cumulative slow can overlap.
- Sawblades take the "bounce once" branch of the spec, not the shatter branch, and shred a destructible crate outright on contact.
- Sizzle events on a stationary Skullhead beam are throttled by phase slot or a 0.08s interval so they do not fire every frame. Hero impacts emit continuously.
- The ABB missiles keep the `homing_drone` projectile kind and are identified by the new `icbm` flag. Existing homing-drone behavior is untouched for anything without that flag.
- The worker completed this milestone in a single `agy` run with no timeout, unlike Milestone 4.13, which needed a continuation after a 300s print timeout.

## References

- [AGENTS.md](../../AGENTS.md): software factory rules, module boundaries, verification rules.
- [plan.md](../../plan.md): full roadmap and milestone context.
- [milestone-4.13-tweaks.md](milestone-4.13-tweaks.md): the previous as-built report.
- [milestone-4.12-tweaks.md](milestone-4.12-tweaks.md): an earlier as-built report.
- [milestone-4.11-tweaks.md](milestone-4.11-tweaks.md): an earlier as-built report.
- [milestone-4.1-fixes.md](milestone-4.1-fixes.md): an earlier as-built report.
- [milestone-4-polish.md](milestone-4-polish.md): an earlier as-built report.
- [milestone-3-integration.md](milestone-3-integration.md): the first as-built report.
- [SHARED_CONTRACTS.md](../SHARED_CONTRACTS.md): cross-module API contracts.
- [QUESTIONS.md](../QUESTIONS.md): resolved decisions and recorded defaults.
- [AGENT_LOG.md](../AGENT_LOG.md): per-agent work entries and regression proof.
