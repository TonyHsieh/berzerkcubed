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
