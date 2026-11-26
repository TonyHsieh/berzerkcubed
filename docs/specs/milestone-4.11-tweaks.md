# Milestone 4.11 tweaks: final delivery report

This document records what Milestone 4.11 actually delivered for BERZERK³, how each of the six spec sections was implemented, and the evidence behind it. It replaces the original plan-only spec, and the numbering below still follows that plan so the document doubles as a coverage checklist. The implementation comes from the verified worker handoff (`t_0282f063`), the verifier pass (`t_21f473d0`, gate `pass`), and my own spot checks against the source. All three posted structured notes to the swarm blackboard on `t_d5e1694b`; comments 18 and 19 carry the handoff and the gate decision. Work follows the rules in [AGENTS.md](../../AGENTS.md) and the contracts in [SHARED_CONTRACTS.md](../SHARED_CONTRACTS.md).

Status: **delivered, gate passed**. The build has 0 TypeScript errors across 1000 modules. All 102 tests pass in 14 files: 88 prior tests plus 14 new ones. The verifier reproduced the gate independently and got the same numbers, then ran a clean static scan for hardcoded secrets, shell injection, eval/exec, unsafe deserialization, string-built SQL, stray console/debugger calls, and debug artifacts.

## Delivered implementation

| File | What it contains |
| --- | --- |
| `src/engine/types.ts` | `v_bot_melee` and `v_bot_laser` added to `EnemyKind`; `fireAnimTimer`, `rezTimer`, and `rezDuration` on `EnemyState` and `BossState`; `electric_wave` added to `Projectile['kind']`; `abb`, `skullhead`, `bug_hive`, and `brainbot` added to `BossKind`; new `OrbitingBugBot` interface; higher-sector fields `shieldLayers`, `maxShieldLayers`, `shieldLayerHp`, `shieldRegenDelay`, `rampageTimer`, and `rampageCooldown` on `BossState`. |
| `src/audio/soundEngine.ts` | New `rez_in` synth SFX for materialization. |
| `src/world/levelData.ts` | `createSectorIsland(sectorIndex, seed?)` now generates randomized orthogonal Berzerk-style mazes: 2–4 wide cardinal doorways, L-walls, T-junctions, and pillar partitions. New `isMazeFullyConnected()` (BFS over the grid) and `getDoorwayAnchors()`. |
| `src/enemies/enforcer.ts` | `createVBotMelee` and `isMeleeEnemyKind`; rez-in pause; faster Red V-Bot rush. |
| `src/enemies/shooter.ts` | `createVBotLaser` and `isRangedEnemyKind`; `ENEMY_FIRE_ANIM_SEC = 0.22` with `fireAnimTimer` set on firing and decayed each tick; rez-in pause. |
| `src/enemies/spawner.ts` | `DEFAULT_REZ_DURATION = 1.0` so nothing pops in; `includeVBots` mixes V-bots into waves and the opening vanguard without breaking the legacy cap behavior. |
| `src/bosses/bossUtils.ts` | `BOSS_REZ_DURATION`, `BOSS_FIRE_ANIM_SEC`, `RAMPAGE_DURATION_SEC = 3.0`, `RAMPAGE_COOLDOWN_SEC = 11.0`, plus `applyHigherSectorBossScaling()` and `stepBossCommonTimers()`. |
| `src/bosses/abb.ts` | New. `createAbb` / `updateAbb`. Dodge-dash flanking with an afterimage trail, then a halt and a 360° ring of homing missiles (`homing_drone` projectiles). 221 lines. |
| `src/bosses/skullhead.ts` | New. `createSkullhead` / `updateSkullhead`. Hovering skull-drone that telegraphs with twin targeting lines, then fires sweeping eye-laser beams. 214 lines. |
| `src/bosses/bugHive.ts` | New. `createBugHive` / `updateBugHive` / `interceptProjectileWithOrbitingBugs`. Orbiting beetle shield that intercepts player shots, peels off to swoop, and replenishes. 301 lines. |
| `src/bosses/brainbot.ts` | New. `createBrainbot` / `updateBrainbot`. Rapid rolling pursuit that fires ground-hugging `electric_wave` fans. 192 lines. |
| `src/bosses/recogniser.ts` | Two distinct destructible parts, `left_leg` and `right_leg`, with `head_core` locked until both are destroyed; scaled hitbox, common timers, rez-in and rampage invulnerability, multi-layer shields. |
| `src/bosses/maximilian.ts`, `src/bosses/evilOtto.ts` | Scaled hitboxes, `stepBossCommonTimers` wiring, `fireAnimTimer`, and updated `damageBossPart` for rez-in invulnerability, rampage invulnerability, and regenerating shields. |
| `src/render/models.ts` | Black and near-black chassis fills replaced with `#64748b`, `#94a3b8`, and `#cbd5e1` greys plus bright accents; redesigned `enforcer_melee`, `laser_shooter`, `grenadier`, and a two-legged `recogniser`; new V-bot, ABB, Skullhead, Bug Hive, and Brainbot builders; 12 model groups × 24 angles in `getBakeTasks`. |
| `src/game/gameState.ts` | V-bots, rez-in invulnerability and non-collision that block damage and attacks, all four new bosses, Bug Hive shot interception, higher-sector scaling, and a six-boss sector rotation (`SECTOR_BOSS_ROTATION`). |
| `src/game/renderer.ts` | TRON rez-in vertical scan beam with a bottom-to-top clip reveal and sparks; muzzle flash and barrel recoil on fire; boss render scale from 4.5× upward with radius; two-legged Recogniser with sparking sockets; multi-layer shield rings; rampage aura and banner; render paths for all four new bosses; crackling `electric_wave` floor arcs. |
| `src/game/hud.ts` | Segmented multi-layer shield bars, the `RAMPAGE — INVULNERABLE!` banner, and quick-spawn buttons for all seven bosses. |
| `src/game/gallery.ts` | Redesigned enemies, both V-bots, the two-legged Recogniser, all four new bosses, and the Flying Bug Bot added to the turntables. |
| `src/main.ts` | HUD quick-spawn passes `{ rezDuration: 1.0 }`. |
| Tests | 14 new tests across `levelData.test.ts` (+2), `enemies.test.ts` (+4), `bosses.test.ts` (+6), and `gameState.test.ts` (+2); expanded assertions in `spriteStack.test.ts`; `loading.test.ts` updated for 12×24 bake tasks. |
| Docs | `docs/AGENT_LOG.md` updated with the implementation and regression proof. |

## Requirement coverage

### 1. Global palette and enemy firing animations

The dark enemy bodies are gone. `src/render/models.ts` now builds chassis from light-to-medium metallic greys (`#64748b`, `#94a3b8`, `#cbd5e1`) with bright red, yellow, orange, gold, and cyan accents, so silhouettes stay readable against the dark circuit floor. Every silhouette in the gallery was rebuilt to match.

Firing now has a visible origin. `ENEMY_FIRE_ANIM_SEC = 0.22` in `shooter.ts` and `BOSS_FIRE_ANIM_SEC = 0.22` in `bossUtils.ts` drive a `fireAnimTimer` that is set when a ranged unit shoots and decays each tick. The renderer uses it for barrel recoil and a glowing muzzle flash drawn at the emitter, so shots visibly come from the robot instead of appearing out of nowhere.

### 2. Redesigned enemies and V-shaped attack robots

All swarm enemies still bake into `SpriteStackCache` at 24 angles, so the 60 FPS budget holds with 200+ units on screen. The Enforcer is now a classic Berzerk red robot: crimson armor over grey joints, a domed cyclops head, wide shoulders, hanging arms, and separated striding legs. The Laser Shooter is a wide yellow-and-grey industrial torso with a red triangular chest core, twin legs, and dual underslung laser rifles. The Grenadier is a tall yellow-and-grey walker with fanning shoulder mortars.

Two new V-bots join them. `v_bot_melee` is a red inverted-trapezoid body on a single central wheel with a glowing eye and side claws, tuned as a fast melee rusher. `v_bot_laser` is the yellow-and-white striped variant that fires bolts from its central emitter with the same flash and recoil treatment. `isMeleeEnemyKind` and `isRangedEnemyKind` route them through the correct AI, and `includeVBots` mixes them into waves and the opening vanguard. Two tests confirm the melee bot outruns the Enforcer and that both ranged types set and decay `fireAnimTimer`.

### 3. Randomized Berzerk-style maze rooms

`createSectorIsland(sectorIndex, seed?)` now carves an orthogonal maze of L-walls, T-junctions, and pillars inside the perimeter, with 2–4 cardinal doorways. North and east are always open; south and west are seed-driven. Doorway throats are kept clear and wide enough for the scaled-up bosses.

Connectivity is verified at generation time. `isMazeFullyConnected()` runs a BFS that must reach every doorway anchor and every open corridor cell from the hero spawn, and `getDoorwayAnchors()` exposes the interior entry points for spawning. Two new tests exercise this across multiple seeds and sectors, and another confirms internal partitions are generated on every room.

### 4. Zero pop-in spawning

No robot appears instantly. `DEFAULT_REZ_DURATION = 1.0` and `BOSS_REZ_DURATION = 1.0` assign every spawn a `rezTimer` counting down to zero. While `rezTimer > 0` a unit is non-colliding, invulnerable, stationary, and cannot fire; `gameState.ts` skips it in the damage and targeting loops, and a new test proves player bolts pass through until the timer expires.

The visual is a TRON materialization: the renderer draws a neon grid pillar with a rising scan ring and digital sparks, and clips the voxel stack so it reveals from the bottom to the top as `rezTimer` falls. A `rez_in` SFX plays on entry. In practice every spawn is a REZ-In; the door-walk alternative from the plan was not wired separately, and the two new tests cover the timer behavior and V-bot wave mixing.

### 5. Boss overhaul

Bosses are much larger. `src/render/models.ts` and the renderer scale them from 4.5× upward with radius, and hitboxes grew to match.

The Recogniser's one-leg bug is fixed. It now has two distinct parts, `left_leg` and `right_leg`, each with its own geometry and a flared foot, under a wide arch crossbar and a sloped cockpit head. `head_core` stays invulnerable until both legs are destroyed; a boss test asserts the geometry and the lock, and a `gameState` test runs the leg-destruction-to-head-damage sequence through the full simulation loop.

Higher sectors (`sectorIndex >= 2`) get tougher through `applyHigherSectorBossScaling()`: more HP, multiple regenerating shield layers shown as segmented HUD bars, and periodic rampage. `stepBossCommonTimers()` fires a 3.0-second invulnerable rampage every 11.0 seconds, with a golden/crimson aura and the `RAMPAGE — INVULNERABLE!` banner. One test covers the HP scaling, shield layers, and rampage window together.

### 6. Four new bosses

All four are registered in `BossKind`, given their own files in `src/bosses/`, built in `src/render/models.ts`, and wired into `gameState.ts`, the HUD (with quick-spawn buttons), and the gallery. `SECTOR_BOSS_ROTATION` cycles bosses across sectors, with the four new ones included. Each has a dedicated test that asserts real behavior rather than just construction:

- **ABB** dodge-dashes to a flank with an afterimage trail, halts, then launches a 360° ring of homing missiles.
- **Skullhead** telegraphs with twin targeting lines before firing sweeping eye-laser beams.
- **Bug Hive** maintains an orbiting beetle shield that intercepts incoming shots, peels off for swooping attacks, and replenishes once thinned.
- **Brainbot** rolls quickly through corridors and fires crackling ground-hugging electricity waves.

The four new files are 192–301 lines each and contain distinct update logic.

## Verification gate

The plan specifies the Nix devShell wrapper, and that is the command the worker and verifier both ran:

```
nix develop --impure --command sh -c "pnpm run build && pnpm test"
```

Result: exit 0, 0 TypeScript errors, 1000 modules transformed in about 2.2 seconds, 14 test files, 102 of 102 tests passing. The 14 new tests break down as two maze tests in `levelData.test.ts`, four in `enemies.test.ts` (V-bot speed, fire animation, rez pause, wave mixing), six in `bosses.test.ts` (two-legged Recogniser, higher-sector scaling/rampage, and one per new boss), and two in `gameState.test.ts` (rez-in blocking, stepping all four new bosses). `spriteStack.test.ts` gained assertions and `loading.test.ts` was updated for the 12×24 bake tasks without adding new cases. The verifier reproduced the numbers independently and confirmed the diff stats (23 tracked files, +2353/−392, four new boss files) match the handoff. Its static scan came back clean.

## Known caveats

These did not block the gate. They are recorded so the next worker does not have to rediscover them.

- All Milestone 4.11 changes remain uncommitted on `main`, as did the Milestone 3, 4, and 4.1 changes. The `sample/` reference art is still untracked, as it was found.
- No real-browser verification. The checks are headless Vitest plus the build; no rendered pixel, layout, or browser-console assertion was made.
- Rampage is a fixed 3.0-second burst on an 11.0-second cooldown, not the randomized 2.5–3.5-second window described in the plan.
- Boss render scale tops out around 5.0× (`4.5 + (radius − 26) * 0.06`), short of the plan's 6× ceiling.
- REZ-In is a bottom-to-top canvas clip reveal with a scan ring and sparks, not a true per-voxel wireframe-to-solid build.
- Maze connectivity is proven over the generation grid with BFS. Bosses still use the existing collision physics rather than new pathfinding, so large hitboxes can snag in tight corners.
- The gallery additions have no automated test beyond the existing `?gallery=1` opt-in check.
- The door-walk and bridge-entry spawn variant from the plan was not added separately; all spawns use REZ-In.
- Boss shield hits reuse the existing electric zap rather than a dedicated metallic clang.

## References

- [AGENTS.md](../../AGENTS.md): software factory rules, module boundaries, verification rules.
- [plan.md](../../plan.md): full roadmap and milestone context.
- [milestone-4.1-fixes.md](milestone-4.1-fixes.md): the previous as-built report.
- [milestone-4-polish.md](milestone-4-polish.md): the earlier as-built report.
- [milestone-3-integration.md](milestone-3-integration.md): the first as-built report.
- [SHARED_CONTRACTS.md](../SHARED_CONTRACTS.md): cross-module API contracts.
- [QUESTIONS.md](../QUESTIONS.md): resolved decisions and recorded defaults.
- [AGENT_LOG.md](../AGENT_LOG.md): per-agent work entries and regression proof.
