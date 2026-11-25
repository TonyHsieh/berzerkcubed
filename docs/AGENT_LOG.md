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
