# Milestone 3 Specification — Full Integration, Playable Loop, HUD & Tuning (`BERZERK³`)

## Goal
Integrate all verified Milestone 1 & 2 subsystems (already merged on `main` with 56/56 Vitest tests passing) into a complete, playable 60 FPS twin-stick arcade game in `src/game/gameState.ts`, `src/game/hud.ts`, and `src/main.ts`.

Follow all Software Factory rules in [`AGENTS.md`](../../AGENTS.md) and contracts in [`docs/SHARED_CONTRACTS.md`](../SHARED_CONTRACTS.md).

---

## Subtasks (for Hermes Kanban Swarm Decomposition)

### 1. Core Game State & Simulation Loop (`src/game/gameState.ts`)
- Orchestrate fixed-timestep updates (60 Hz simulation step, clamped `dt`) combining:
  - `worldSim.ts` (`createSectorIsland`, `updateWorld`, `resolveEntityAgainstWorld`, `damageCrate`)
  - `player.ts`, `weapons.ts`, `orbitals.ts` (`createPlayer`, `updatePlayer`, `applyPowerUp`, `updateOrbitals`, `applyDodgeShove`)
  - `spatialGrid.ts` (`SpatialGrid` rebuilt each tick for 200+ melee Enforcers + 50–100 shooters/grenadiers)
  - `enforcer.ts`, `shooter.ts`, `spawner.ts` (`updateEnforcers`, `updateRangedEnemies`, `spawnHordeWave`)
  - `maximilian.ts`, `recogniser.ts`, `evilOtto.ts` (`updateMaximilian`, `updateRecogniser`, `damageBossPart`, `updateEvilOtto`)
- Wire projectile collisions:
  - Player projectiles vs enemies, crates (spawning `PowerUpPickup`s), and boss parts (`damageBossPart` for Recogniser legs -> head gating).
  - Enemy/boss projectiles vs player (respecting dodge-roll i-frames, shield-first damage, ablative shields).
  - Power-up pickup collection (`applyPowerUp`).
- Sector progression & boss triggers:
  - Clear wave / bridge horde -> spawn sector boss (Sector 1: Maximilian, Sector 2: Recogniser, Sector 3+: escalating bosses + open-edge islands).
  - Lingering past `difficulty.ottoWarningSec` triggers Evil Otto reconstruction with Sinistar-style voice taunt (`voice_taunt` event) and progressive Mega Man-style variants on later sectors.
- Export pure headless simulation step (`stepGameState(state, input, dt)`) so Vitest can test full gameplay integration without DOM globals.

### 2. Full Approach B Canvas 2D Renderer (`src/game/renderer.ts` + `src/main.ts`)
- Initialize `buildAllModels()` and `bakeSwarmCaches(cache, models, scale, spacing)` at startup.
- Render layers bottom-to-top:
  1. `CircuitBackground.render(ctx, camera, w, h)`
  2. Floating platform island (black fill, neon blue/red outline, grid, synchronized sliding doors, temporary bridges, overtly animated electrified walls, destructible crates)
  3. Depth-sorted `renderQueue` by screen Y:
     - 200+ Enforcers & 50–100 Shooters/Grenadiers via `SpriteStackCache.drawCached` using `enemyCacheKey(kind, frame)`
     - Hero via Z-interleaved Approach B `drawStack` (legs -> torso + weapon with `rifleScreenRelY` depth check + orbitals)
     - Bosses (`maximilian` with whirling blades, `recogniser` with growing ground slam shadow + destructible legs, `evil_otto` with reconstruction/variant visuals)
     - Projectiles (bolts, beams, flames, lightning arcs, Z-arcing grenades with ground warning rings, sky-bombs, mines) & glowing power-up pickups
  4. `VfxSystem.render(ctx, (x, y) => worldToScreen(x, y, camera, w, h), camera)` + optional `vfx.renderCrt(ctx, w, h)`
- Route all `GameEvent`s to `VfxSystem.handleEvent`, `SoundEngine.handleEvent`, `VoiceTauntEngine.handleEvent`, and `triggerCameraShake`.
- Initialize `SoundEngine.init()` and `VoiceTauntEngine.init()` on the first user click/keydown gesture.

### 3. HUD & Designer Tuning Panel (`src/game/hud.ts`)
- Neon cyber-arcade HUD mounted in `#hud-root`:
  - Player HP bar, regenerating Energy Shield bar, Lives counter, Dodge-roll cooldown indicator.
  - Active weapon name, level, combined modifiers, and orbital count.
  - Sector number, Score, Enemy count, and Boss HP / multi-part status bar (showing Recogniser leg status).
  - Collapsible **Designer Tuning Panel** (toggleable via `Tab` or button): live sliders for `maxMeleeEnforcers` (up to 300+), `maxShootersAndGrenadiers` (up to 120), CRT toggle, audio/bass mute, and quick boss-spawn buttons (Maximilian / Recogniser / Evil Otto) for playtesting.

### 4. Integration Tests & Zero-Regression Gate (`src/game/gameState.test.ts`)
- Add Vitest integration tests verifying:
  - Full tick loop with 220+ Enforcers + 75 Shooters/Grenadiers without errors.
  - Projectile hitting crate -> drops power-up -> hero collects -> weapon levels/combines.
  - Recogniser leg destruction unlocks head damage inside the full loop.
  - Evil Otto triggers after `ottoWarningSec` and emits `voice_taunt` event.
- **Mandatory Gate**: Run inside Nix devShell (`nix develop --impure --command sh -c "pnpm run build && pnpm test"`). All prior 56 tests + new Milestone 3 tests MUST pass with zero TypeScript errors.
