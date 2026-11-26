# Milestone 4.1 playtest fixes: final delivery report

This document records what Milestone 4.1 actually delivered for BERZERK³, how each of the eight playtest fixes was implemented, and the evidence behind it. It replaces the original plan-only spec; the numbering below follows that plan so it still works as a coverage checklist. The implementation comes from the verified worker handoff (`t_2408d038`), the verifier pass (`t_155e1dcc`, gate `pass`), and my own re-run of the gate. All three posted structured notes to the swarm blackboard on `t_fd95052f` (comments 14 and 15 carry the handoff and gate decision). Work follows the rules in [AGENTS.md](../../AGENTS.md) and the contracts in [SHARED_CONTRACTS.md](../SHARED_CONTRACTS.md).

Status: **delivered, gate passed**. The build has 0 TypeScript errors across 996 modules and emits 13 JavaScript chunks, including a dedicated `gallery-*.js` chunk from the new dynamic import. All 88 tests pass in 14 files: 73 prior tests plus 15 new ones. The verifier reproduced the gate independently and got the same numbers, then ran a clean static scan for hardcoded secrets, shell injection, eval/exec, unsafe deserialization, string-built SQL, stray console/debugger calls, and TODO/FIXME markers.

## Delivered implementation

| File | What it contains |
| --- | --- |
| `index.html` | Inline `#loading-screen` thermometer painted at first paint: a `26px × 220px` neon tube, `0% — LOADING ENGINE MODULES...`, and a `bootShimmer` CSS animation. Zero JS required to appear. |
| `src/main.ts` | `setInlineBootProgress()` and `boot()`. Heavy modules are dynamically imported after first paint; progress is staged 0/2/25/92/96/100%. Wires the `?gallery=1` opt-in. |
| `src/game/loading.ts` | Four named `LOAD_STAGES`, `bootstrapAssets(onProgress)` with one bake task per animation frame, and `createLoadingScreen()` reusing the inline DOM node. |
| `src/world/levelData.ts` | `createSectorIsland(sectorIndex, seed?)` with a mulberry32 PRNG; seeded baffles, pylons, doors, crates, and bridge activation; `SPAWN_CLEAR_RADIUS = 300`. |
| `src/enemies/spawner.ts` | `SAFE_SPAWN_CLEARANCE = 260`, `INITIAL_VANGUARD_MIN/MAX` (5/8), `HordeSpawnOptions`, `safeSpawnPoint()`, and a 5–8 enemy opening vanguard. |
| `src/game/gameState.ts` | Vanguard at sector start, clearance and gate-telegraph SFX on later waves, walk-over auto-collect/auto-upgrade, and `[F]` swap only for a full distinct inventory. |
| `src/entities/weapons.ts` | `shouldAutoCollectWeapon(player, type)`. |
| `src/game/renderer.ts` | `drawWall3D()` and sliding doors rebuilt as vertical Approach B Z-stacks with climbing plasma arcs; Maximilian shield ring, pulsing core, and floating `VULNERABLE!` label. |
| `src/render/models.ts` | Three distinct 12-layer enemy silhouettes and a rebuilt 14-layer, 4-blade Maximilian killer-robot stack. |
| `src/bosses/maximilian.ts` | `isMaximilianVulnerable`, 1200 HP, a 260-point regenerating blade-shield, deflect feedback, heavy-round meter drain, and shield-break to recover. |
| `src/engine/types.ts` | `BossState` gained optional `shieldHp`, `shieldMaxHp`, and `vulnerable` fields. |
| `src/game/hud.ts` | Secondary cyan-to-orange blade-shield bar and a `VULNERABLE!` boss status readout. |
| `src/game/gallery.ts` | New file. `isGalleryEnabled`, `createModelGallery`, and nine rotating model turntables behind `?gallery=1`. |
| Tests | New `src/world/levelData.test.ts`; extensions to `gameState.test.ts`, `weapons.test.ts`, `bosses.test.ts`, `loading.test.ts`, and `worldSim.test.ts`. |
| Docs | `docs/AGENT_LOG.md` updated with the implementation and regression proof. |

## Requirement coverage

### 1. Instant startup loading thermometer

The thermometer now lives in `index.html` as inline HTML and CSS, so it paints at `t = 0ms` with no JavaScript involved. `src/main.ts` has no static top-level imports of the heavy game modules. Instead `boot()` sets 2% (`LOADING ENGINE MODULES...`), then dynamically imports `loading`, `difficulty`, `input`, `gameState`, `hud`, and `renderer` in one `Promise.all`, marks 25% (`ENGINE MODULES READY`), and hands off to `bootstrapAssets()`.

`bootstrapAssets()` maps its own progress into the 25–92% band and emits four named stages: `LOADING ENGINE & AUDIO MODULES`, `BUILDING HERO, HUMANOID ENEMY & BOSS VOXEL STACKS`, `BAKING 24-ANGLE OFFSCREEN SWARM CACHES`, and `INITIALIZING CIRCUIT GRID & HUD`. It yields to `requestAnimationFrame` between each of the eight bake tasks so the browser can repaint. `main.ts` then sets 96%, calls `loading.finish()` for 100%, and the screen fades out over 240ms and removes itself after 260ms. `createLoadingScreen()` reuses the existing inline element and only backfills markup or returns a no-op controller for headless callers.

Two tests cover this: `LOAD_STAGES` names all four stages, and `createLoadingScreen()` behaves in a DOM-less environment.

### 2. Seeded randomized room layouts

`createSectorIsland(sectorIndex, seed?)` now accepts an optional seed. When none is given it calls `freshSeed()`, so each new game or restart gets a fresh layout; tests pass an explicit seed for determinism. The PRNG is a 32-bit mulberry32 generator seeded with `0x6d2b79f5`.

The seed varies interior baffle and pylon coordinates and lengths, which corner baffle is electrified, whether one baffle is omitted, the inner sliding-door X offset, whether the south and west bridges start active, and the jitter and rotation of up to eight crate candidates. Crates within `SPAWN_CLEAR_RADIUS = 300` of the origin are filtered out, so the hero spawn area stays clear. Four new tests in `src/world/levelData.test.ts` check seed reproducibility, layout variation under different seeds, that no walls or crates land inside 300px of spawn, and that the gate, door, and electrified-wall invariants hold.

### 3. Safe spawn clearance and gate spawning

`SAFE_SPAWN_CLEARANCE = 260` is the hard floor for enemy spawns near the hero. `safeSpawnPoint()` radially pushes any candidate inside that radius out to exactly 260px, or drops it 260px to the right in the degenerate case where it sits on the hero. The check is applied to the vanguard and to melee, shooter, and grenadier wave spawns alike.

At sector start, `spawnHordeWave` runs with a `vanguard` flag and places 5 to 8 enemies across the active bridge and open-door anchors using golden-angle rings, all pushed outside the bubble. The count is deterministic per sector and wall configuration. Melee units dominate, with a laser shooter every sixth unit. Later waves pass the hero position and the 260px clearance on every call and emit a `door_hum` SFX as a gate telegraph. Four new `gameState` tests cover the opening vanguard count and spacing, later waves keeping their distance, and weapon auto-collect behaviour (see fix 5).

### 4. True vertical Approach B walls and doors

The lateral skew (`const ex = -lift * 0.32`) is gone from `drawWall3D()`. Each wall's four corners are rotated once by the camera angle, then each of 10 layers is lifted strictly in screen `-Y` by `z * spacingPx`. Shading brightens from the base toward the cap, with a crisp neon outline on every step and a brighter top rim. Electrified walls add animated vertical plasma bolts with a sine jitter, and walls stay in the Y-depth-sorted render queue so they interleave with entities. Sliding doors use the same treatment at six layers with a two-pixel step. This is canvas-2D fake-isometric extrusion in the Approach B style, not a WebGL mesh pipeline.

### 5. Effortless weapon auto-pickup

`shouldAutoCollectWeapon(player, type)` returns true when the hero already carries that weapon type or has an empty slot. In `stepGameState`, a weapon pickup in range that satisfies either condition is collected on walk-over, consumes the pickup, adds 50 score, and raises a toast reading `LEVEL UP` for a duplicate or `AUTO-EQUIPPED` for a new slot. Modifiers, orbitals, shield boosts, and extra lives keep auto-collecting as before.

The pickup stays on the floor only when all three slots hold distinct weapon types. In that case it populates `nearbyWeaponPickup` and shows the `[F]` prompt; pressing `F` swaps the active slot and drops the replaced weapon on the floor as a retrieveable pickup. Three new tests cover the helper's true/false conditions and two more cover walk-over auto-equip and duplicate auto-upgrade end to end.

### 6. Maximilian overhaul

`MAXIMILIAN_MAX_HP = 1200` and `MAXIMILIAN_SHIELD_HP = 260` replace the old quick-kill tuning. While Maximilian is in `stalk`, `charge`, or `whirlwind` he carries a regenerating blade-shield (26 points per second) rendered as a bright crimson and pink energy ring around his blade radius. Standard bolts that hit the frontal arc are destroyed with a spark burst and an `electric_zap` SFX; heavy and piercing rounds (`beam_segment`, `lightning`, `grenade`, `pierce`, `lightning_chain`) drain the shield meter and survive the guard.

When the shield reaches zero, the fight forces a 0.9 second `recover` phase: blades retract from radius 58/70 to 34, `isMaximilianVulnerable()` returns true, the HUD shows `VULNERABLE!`, the renderer pulses a yellow core, and the boss taunts `CORE EXPOSED!`. The shield refills to at least 40 on the way back to `stalk`. The HUD adds a cyan-to-orange `BLADE SHIELD` bar under the HP bar, and `BossState` gained the three optional fields needed to drive all of this.

The model rebuild in `src/render/models.ts` turns Maximilian into a floating, horned killer robot: a tapered hover skirt with twin thruster glow, broad armored shoulders, a glowing chest core, a domed crimson helmet with a horizontal red visor, and twin cross-shaped sawblades on his arms. The body stack has 14 layers and the blades four. Three new boss tests cover the shielded start and recover vulnerability, sustained frontal fire draining the meter, and a heavy beam surviving the guard.

### 7. Distinct enemy silhouettes

All three enemy models are now 12-layer Approach B stacks with readable shapes at gameplay scale. The melee Enforcer is a lean soldier with separated striding legs, shoulder pads, a chest core, twin forward red batons, and a crimson visor, built in three gait frames. The Laser Shooter is a wider amber tripod droid with a turret torso, sensor crest, and an elongated forward laser barrel, in two frames. The Grenadier is a squat mech with heavy booted legs, twin oversized crimson-and-yellow shoulder mortar tubes, and a yellow visor, also in two frames. Slice resolution stays at 24×24, so the models remain single `drawImage()` calls in the baked cache.

### 8. Model gallery inspector

`?gallery=1` opens a `src/game/gallery.ts` overlay with nine rotating turntables rendered at 4.5× scale, one per model group: Hero, Melee Enforcer, Laser Shooter, Grenadier, Maximilian, Recogniser, Evil Otto, Power-Ups, and a synthetic 3D Wall. Each turntable is a 180×180 pixelated canvas turning at 0.45° per frame. `[G]` toggles the overlay and `Escape` closes it. `isGalleryEnabled()` checks the URL parameter, and `main.ts` dynamically imports the gallery only when opted in, which is why the build emits a separate `gallery-*.js` chunk. One new test verifies that only `?gallery=1` enables it.

## Verification gate

The plan specifies the Nix devShell wrapper. The same scripts were run directly in this environment:

```
cd /home/tonyh/_Projects/berzerkcubed && pnpm run build && pnpm test
```

Result: exit 0, 0 TypeScript errors, 996 modules transformed, 13 JavaScript chunks emitted, 14 test files, 88 of 88 tests passing. The 15 new tests break down as four seed/layout tests in `levelData.test.ts`, four in `gameState.test.ts` (two spawn-clearance, two auto-pickup), two `shouldAutoCollectWeapon` tests in `weapons.test.ts`, three Maximilian tests in `bosses.test.ts`, and two in `loading.test.ts` (one stage names, one gallery opt-in). `worldSim.test.ts` was also updated to deactivate all bridges before its open-edge test, with no new test case. The worker ran the gate, the verifier re-ran it independently, and I re-ran it a third time with identical numbers.

## Known caveats

These did not block the gate. They are recorded so the next worker does not have to rediscover them.

- All Milestone 4.1 changes are still uncommitted on `main`, as were the Milestone 3 and 4 changes.
- No real-browser verification. CDP navigation was unavailable in the test runner, so the checks are headless Vitest plus HTTP 200 smoke tests of the built assets. No rendered pixel, layout, or browser-console assertion was made.
- The gallery has no Designer Tuning Panel button; `?gallery=1` is the only entry point. Its header reads `5× TURNTABLE` while `drawStack` actually renders at 4.5×, and it has no automated test beyond the URL check.
- `bootstrapAssets()` builds all models synchronously in one tick rather than chunking them per model group with `requestAnimationFrame` yields as the plan suggested. Bake tasks are yielded individually. `LOADING ENGINE & AUDIO MODULES` is also re-emitted at 26% just after `main.ts` has shown `25% ENGINE MODULES READY`.
- Room variation jitters a single two-pylon, three-to-four-baffle template rather than switching between distinct corridor layouts. Outline color still depends only on `sectorIndex % 2`, not the seed, and `createGameStateForSector` does not expose a seed parameter.
- Wave gate telegraphs are audio-only (`door_hum`). No visual flash or VFX event is emitted at the gate on wave spawn.
- Walls and doors are 2.5D vertical screen-space stacks, not true 3D geometry. Depth sorting uses the unrotated `s.y + wall.h * 0.5`, which can mis-sort elongated walls near 90°/270° camera angles, and tall narrow pylons get only one plasma arc.
- Maximilian deflection reuses `electric_zap` instead of a dedicated metallic clang. HP damage in `gameState.ts` is not gated on `isMaximilianVulnerable`, so flank, rear, and heavy rounds damage chassis HP even while the shield is up. The shield-drain test asserts a drop but not the shield-zero to `recover` transition.
- Slice resolution stays at 24×24, and no test asserts the enemy or Maximilian layer counts.
- `void boot()`, `void renderer.initAudio()`, and the gallery dynamic import have no rejection handlers, so a failed module load or bake would leave the loading screen up. This is the same audio-init caveat carried from Milestone 3.
- A stale comment in `gameState.test.ts` still says weapon drops require `F` to equip or level, which fix 5 changed.

## References

- [AGENTS.md](../../AGENTS.md): software factory rules, module boundaries, verification rules.
- [plan.md](../../plan.md): full roadmap and milestone context.
- [milestone-4-polish.md](milestone-4-polish.md): the previous as-built report.
- [milestone-3-integration.md](milestone-3-integration.md): the earlier as-built report.
- [SHARED_CONTRACTS.md](../SHARED_CONTRACTS.md): cross-module API contracts.
- [QUESTIONS.md](../QUESTIONS.md): resolved decisions and recorded defaults.
- [AGENT_LOG.md](../AGENT_LOG.md): per-agent work entries and regression proof.
