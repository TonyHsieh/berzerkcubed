# Agent Work Log (`docs/AGENT_LOG.md`)

Every agent appends a short entry here when completing a milestone, feature, or fix.

---

## Milestone 0 — Judge / Orchestrator (`main`)
- **Files created**:
  - `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `index.html`, `src/main.ts`
  - `src/engine/types.ts` (core shared types)
  - `src/config/difficulty.ts`, `src/config/difficulty.test.ts`
  - `plan.md`, `AGENTS.md`, `CLAUDE.md`
  - `docs/SHARED_CONTRACTS.md`, `docs/AGENT_LOG.md`, `docs/QUESTIONS.md`
- **Status**: Scaffold ready for parallel `herdr` worktrees (`feat/engine-render`, `feat/world-player`, `feat/enemies-bosses`).

---

## Worktree 1 (`feat/engine-render`) — Render + Audio modules
- **Setup**: merged `main` (scaffold commit 46631d9) into this branch to obtain `docs/SHARED_CONTRACTS.md` and `src/engine/types.ts`.
- **Files created**:
  - `src/render/spriteStack.ts`, `src/render/models.ts`, `src/render/circuitBg.ts`, `src/render/vfx.ts`
  - `src/render/testCanvas.ts` (headless fake canvas helper for tests only)
  - `src/audio/soundEngine.ts`, `src/audio/voiceTaunts.ts`
  - Tests: `src/render/spriteStack.test.ts`, `src/render/vfx.test.ts`, `src/render/circuitBg.test.ts`, `src/audio/audio.test.ts`
- **Exports**:
  - `spriteStack`: `makeSlice`, `drawStack`, `SpriteStackCache` (`bake`, `drawCached`, `has`, `getTile`, `angleSteps`, `stats`, `clear`), `setCanvasFactory`/`createCanvas` (injectable, headless), `quantizeAngleIndex`, `normalizeDeg`
  - `models`: `buildHeroModel`, `buildEnforcerFrames` (3 frames), `buildLaserShooterFrames`, `buildGrenadierFrames`, `buildMaximilian`, `buildRecogniser`, `buildEvilOtto` (classic/volt/cryo/vortex), `buildCrate`, `buildOrbitalStacks`, `buildAllModels`, `bakeSwarmCaches`, `enemyCacheKey`
  - `circuitBg`: `CircuitBackground` (`update`, `render`)
  - `vfx`: `VfxSystem` (fixed-capacity free-list pool; `explode`, `muzzleFlash`, `shellCasing`, `lightningArc`, `freezeShatter`, `afterimage`, `handleEvent`, `update`, `render`, `renderCrt`, `crtEnabled`), type `WorldToScreenFn`
  - `soundEngine`: `SoundEngine` (`init`, `play`, `handleEvent`, `toggleBass`/`setBassEnabled`, `muted`), `isSoundName`
  - `voiceTaunts`: `VoiceTauntEngine` (`init`, `speak`, `handleEvent`), `VOICE_PRESETS`, `resolveTauntParams`, `normalizeSpeaker`
- **Notes**: Tone.js is lazy-imported inside `init()` so modules load in Node; `init()` must be called from a user gesture. Swarm enemies use cache keys `"<kind>#<frame>"` (`enemyCacheKey`); crates use `"crate"`. Audio/Tone behaviour itself is not unit-tested (needs a real AudioContext) — only guard/no-op paths, event routing and voice parameter logic are.
- **Regression proof**: `pnpm run build` passes (tsc + vite build). `pnpm test` (full suite): 5 files, **26 tests passed** (2 prior config tests + 24 new: spriteStack 8, vfx 7, circuitBg 2, audio 7).

---

## Worktree 2 — `feat/world-player` (`src/engine/**`, `src/world/**`, `src/entities/**`)
- **Files created**:
  - `src/engine/input.ts` — `createInputController`, `createDefaultInputState`
  - `src/engine/camera.ts` — `createCameraState`, `updateCamera`, `worldToScreen`, `screenToWorld`, `triggerCameraShake`, `setCameraTargetAngle`
  - `src/engine/spatialGrid.ts` — `SpatialGrid`
  - `src/world/levelData.ts` — `createSectorIsland`
  - `src/world/worldSim.ts` — `updateWorld`, `resolveEntityAgainstWorld`, `isPointOnWalkableSurface`, `setBridgeActive`, `pointHitsSolidWall`
  - `src/world/crate.ts` — `createCrate`, `damageCrate`
  - `src/entities/weapons.ts` — `MAX_WEAPON_LEVEL`, `getWeaponSpec`, `createStarterWeapon`, `applyWeaponPickup`, `applyModifierPickup`, `fireWeapon`
  - `src/entities/orbitals.ts` — `addOrbital`, `getOrbitalWorldPos`, `updateOrbitals`
  - `src/entities/player.ts` — `createPlayer`, `isPlayerInvulnerable`, `damagePlayer`, `applyDodgeShove`, `applyPowerUp`, `updatePlayer`
  - `src/engine/spatialGrid.test.ts` (4 tests)
  - `src/world/worldSim.test.ts` (5 tests)
  - `src/entities/weapons.test.ts` (5 tests)
- **Regression Proof**:
  - `pnpm run build` (`tsc --noEmit && vite build`): **PASSED** (0 errors)
  - `pnpm test` (`vitest run`): **PASSED** — **4 test files passed (4), 16 tests passed (16)** (2 baseline `difficulty.test.ts` + 14 new tests across `spatialGrid.test.ts`, `worldSim.test.ts`, `weapons.test.ts`).

---

## Worktree 3 — `feat/enemies-bosses` (`src/enemies/**` & `src/bosses/**`)
- **Files created**:
  - `src/enemies/enemyUtils.ts` — shared Approach B degree conversion, deterministic FNV-1a hashing, and circle-vs-island (walls, closed doors, crates, perimeter) collision resolution.
  - `src/enemies/enforcer.ts` — `SpatialQueryGrid<T>`, `createEnforcer`, `updateEnforcers` (200+ melee Tron Enforcers with player-chasing flank steering, spatial separation via `SpatialGrid`, freeze slow, and world collision).
  - `src/enemies/shooter.ts` — `createLaserShooter`, `createGrenadier`, `updateRangedEnemies` (50–100 mid-range Laser Shooters with red laser sight telegraph + plasma bolts; Grenadiers lobbing high-arcing Z-altitude plasma grenades with `targetX`/`targetY` warning targets).
  - `src/enemies/spawner.ts` — `spawnHordeWave`, `resetSpawnerCounter` (bridge/gate horde spawner from active `spawnsHorde` bridges & open sliding doors, strictly enforcing `maxMeleeEnforcers` and `maxShootersAndGrenadiers` caps).
  - `src/bosses/bossUtils.ts` — shared boss projectile ID sequence and player contact/shockwave damage helper (shield-first absorption, dodge-roll i-frame & `invulnTimer` handling, knockback).
  - `src/bosses/maximilian.ts` — `createMaximilian`, `updateMaximilian` (`stalk` → `charge` → `whirlwind` → `recover` state machine; whirling blades shred player projectiles, destructible tech crates, and player on contact while leaving permanent safe walls intact).
  - `src/bosses/recogniser.ts` — `createRecogniser`, `updateRecogniser`, `damageBossPart` (destructible `left_leg`/`right_leg` unlock `head_core` vulnerability; `hover_barrage` geometric bullet curtains + homing drones, `sky_slam_ascend`/`sky_slam_drop` with growing `slamProgress` ground shadow + shockwave, `sky_bomb_run` carpet bombing, `recover`).
  - `src/bosses/evilOtto.ts` — `createEvilOtto`, `updateEvilOtto` (Sinistar-style reconstruction with omnibus voice taunt while invulnerable, followed by bouncing pursuit and Mega Man-style returning variants `classic`, `volt`, `cryo`, `vortex` with progressive size/HP scaling and unique variant attacks).
  - `src/enemies/enemies.test.ts` — 8 Vitest tests covering 220+ enforcer spatial separation, freeze slow/wall blocking, shooter telegraph/fire, grenadier Z-arc lob, 75+ ranged batch update, and spawner caps/bridge-gate gating.
  - `src/bosses/bosses.test.ts` — 8 Vitest tests covering Maximilian state machine & blade shredding, Recogniser multi-part leg→head damage gating & full sky-slam/sky-bomb/homing-drone state machine, and Evil Otto reconstruction taunt + returning Mega Man variants.
- **Verification & Regression Proof**:
  - `pnpm run build` (`tsc --noEmit && vite build`): **PASSED** (0 errors).
  - `pnpm test` (`vitest run`): **PASSED** — **3 test files, 18/18 tests passed** (`difficulty.test.ts`: 2, `enemies.test.ts`: 8, `bosses.test.ts`: 8).

---

## Milestone 3 — Judge / Orchestrator (`main`) — Full Integration, Renderer, HUD & Tuning
- **Files created/modified**:
  - `src/game/gameState.ts` — `FIXED_DT`, `GameState`, `createGameState`, `createGameStateForSector`, `stepGameState`, `spawnBoss`, `advanceToNextSector` (pure headless 60 Hz simulation orchestrating `worldSim`, `SpatialGrid`, `player`, `orbitals`, `enforcer`, `shooter`, `spawner`, `maximilian`, `recogniser`/`damageBossPart`, `evilOtto`, projectile physics & collisions, pickup collection, wave/sector progression, and Evil Otto lingering trigger).
  - `src/game/renderer.ts` — `createRenderer`, `GameRenderer`, `RendererOptions` (initializes `buildAllModels()` and `bakeSwarmCaches`, renders `CircuitBackground`, camera-rotated floating platform island/doors/bridges/electrified walls/warning rings, Y-depth-sorted renderQueue with cached swarm enemies, Z-interleaved Hero + orbitals, multi-part bosses, projectiles, pickups, `VfxSystem.render` + `renderCrt`, and routes all `GameEvent`s to VFX, `SoundEngine`, `VoiceTauntEngine`, and `triggerCameraShake`).
  - `src/game/hud.ts` — `createHud`, `HudController`, `HudCallbacks` (headless-safe neon cyber-arcade HUD mounted in `#hud-root` with HP/Shield/Lives/Dodge indicators, weapon/level/modifiers/orbitals, sector/score/hostiles, Boss HP & Recogniser multi-part status, and collapsible `Tab`-toggleable Designer Tuning Panel with live sliders for `maxMeleeEnforcers` & `maxShootersAndGrenadiers`, CRT/audio/bass toggles, and quick boss-spawn buttons).
  - `src/main.ts` — wired `createInputController`, fixed-timestep 60 Hz accumulator loop (`requestAnimationFrame`), user-gesture audio initialization (`initAudio()`), viewport resize handling, renderer, and HUD.
  - `src/game/gameState.test.ts` — 5 headless Vitest integration tests (300-unit swarm stress loop with 225 Enforcers + 50 Shooters + 25 Grenadiers, crate -> power-up -> weapon level/combine flow, Recogniser leg destruction unlocking head damage inside `stepGameState`, Evil Otto trigger after `ottoWarningSec` emitting `voice_taunt`, and player dodge-roll i-frames + shield-first damage).
- **Documented Defaults (for human review)**:
  - Sector progression uses 0-based `sectorIndex` (displayed as `SECTOR N+1` in HUD): Sector 1 (`0`) spawns Maximilian on a perimeter-walled island, Sector 2 (`1`) spawns Recogniser on an open-edge island, and Sector 3+ (`2+`) alternates bosses with +25% HP scaling per sector. After defeating the sector boss, a `NEXT SECTOR` HUD button appears so the player can advance or linger to trigger Evil Otto past `ottoWarningSec`.
- **Verification & Regression Proof**:
  - `pnpm run build` (`tsc --noEmit && vite build`): **PASSED** (0 TypeScript errors, 994 modules transformed, built in 1.78s).
  - `pnpm test` (`vitest run`): **PASSED** — **11 test files passed (11), 61 tests passed (61)** (all 56 prior tests + 5 new Milestone 3 integration tests).
- **Verifier follow-up (`t_47f758eb`, per human decision 2026-11-25)**:
  - Recorded the three Milestone 3 design defaults (Otto timer after boss defeat, manual `NEXT SECTOR` button, Sector 3+ alternating bosses +25% HP) as human-approved `[RESOLVED]` entries in `docs/QUESTIONS.md`.
  - Restored `approach_b_demo_modular_sprite_stacked_humanoid.html` to the repo root (it had been moved to `docs/` without a log entry, breaking links in `AGENTS.md` and `plan.md`). Content is byte-identical to `HEAD`.
