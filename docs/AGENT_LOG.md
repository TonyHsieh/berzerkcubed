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
