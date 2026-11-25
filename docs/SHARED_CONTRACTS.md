# Shared Contracts (`docs/SHARED_CONTRACTS.md`)

All parallel `herdr` worktrees import types from `src/engine/types.ts` and implement the module contracts below so the Judge can integrate them cleanly in Milestone 3.

---

## Worktree 1 (`feat/engine-render`): `src/render/**` & `src/audio/**`

### `src/render/spriteStack.ts`
- `makeSlice(size: number, drawFn: (ctx: CanvasRenderingContext2D, size: number) => void): HTMLCanvasElement`
- `drawStack(ctx, slices, screenX, screenY, worldAngleDeg, cameraAngleDeg, scale, startZPx, spacingPx, localOffsetX?, localOffsetY?): void`
- `class SpriteStackCache`:
  - `bake(key: string, slices: HTMLCanvasElement[], scale: number, spacingPx: number, angleSteps?: number): void` (default `angleSteps = 24`)
  - `drawCached(ctx, key: string, screenX: number, screenY: number, worldAngleDeg: number, cameraAngleDeg: number, zLiftPx?: number): boolean`
  - Must support headless testing via injectable canvas factory so Vitest can test angle quantization without a real DOM.

### `src/render/models.ts`
- Builds Approach B stacks for:
  - Hero (`legsIdle`, `legsRun[4]`, `legsRoll`, `torso`, `weaponStacks[WeaponType]`)
  - Cubic Tron Enforcer (`enforcer_melee`: 2–4 frames, black with red neon highlights/outlines, minimal layers for speed)
  - `laser_shooter`, `grenadier`
  - Bosses: `maximilian` (red glowing eye + whirling sawblades), `recogniser` (destructible legs + top head), `evil_otto` (variants: `classic`, `volt`, `cryo`, `vortex`)
  - `destructibleCrate`, `orbitalStacks`

### `src/render/circuitBg.ts`
- `class CircuitBackground`:
  - `update(dt: number): void` (advances electric blips along PCB traces)
  - `render(ctx: CanvasRenderingContext2D, camera: CameraState, width: number, height: number): void`

### `src/render/vfx.ts`
- `class VfxSystem`:
  - Pooled voxel debris, explosions, lightning arcs, freeze crystals, muzzle flashes, dodge afterimages, optional CRT scanline overlay (`renderCrt`).
  - `handleEvent(event: GameEvent): void`
  - `update(dt: number): void`
  - `render(ctx, worldToScreen: WorldToScreenFn, camera): void` (where `WorldToScreenFn = (wx: number, wy: number) => Vec2`, bound to `worldToScreen(x, y, camera, viewW, viewH)` during integration).

### `src/audio/soundEngine.ts` & `src/audio/voiceTaunts.ts`
- `SoundEngine`: Tone.js procedural arcade SFX (`shoot`, `dodge`, `hit`, `explosion`, `shield_break`, `door_hum`, `blade_whirr`, `slam_impact`, `electric_zap`) + toggleable bassline. Call `await soundEngine.init()` on the first user gesture before playing.
- `VoiceTauntEngine`: Variable-pitch robotic speech taunts (`speak(text, pitch, rate, speaker)`) using Web Speech API / Tone.js fallback with distinct presets for Enforcers, Maximilian, Recogniser, and Evil Otto. Call `await voiceTaunts.init()` on the first user gesture.
- Swarm sprite cache keys use `"<kind>#<frame>"` via `enemyCacheKey(kind, frame)` (Enforcer: 3 frames, shooter/grenadier: 2 frames; crates: `"crate"`).

---

## Worktree 2 (`feat/world-player`): `src/engine/**`, `src/world/**`, `src/entities/**`

### `src/engine/input.ts`
- `createInputController(canvas: HTMLCanvasElement)` -> `{ getState(): InputState, consumeTransient(): void, destroy(): void }`

### `src/engine/camera.ts`
- `createCameraState(): CameraState`
- `updateCamera(camera: CameraState, player: PlayerState, input: InputState, dt: number): void`
- `worldToScreen(wx: number, wy: number, camera: CameraState, viewW: number, viewH: number): Vec2`
- `triggerCameraShake(camera: CameraState, magnitude: number, duration: number): void`

### `src/engine/spatialGrid.ts`
- `class SpatialGrid<T extends { id: string; x: number; y: number; radius: number }>`:
  - `clear(): void`
  - `insert(item: T): void`
  - `queryRadius(x: number, y: number, radius: number): T[]`

### `src/world/levelData.ts`, `src/world/worldSim.ts`, `src/world/crate.ts`
- `createSectorIsland(sectorIndex: number): PlatformIsland`
- `updateWorld(island: PlatformIsland, timeSec: number, dt: number): void` (updates synchronized sliding doors & temp bridges)
- `resolveEntityAgainstWorld(entity: { x: number; y: number; vx: number; vy: number; radius: number }, island: PlatformIsland): { hitElectrifiedWall: boolean; fellOffEdge: boolean }`
- `damageCrate(island: PlatformIsland, crateId: string, damage: number, events: GameEvent[]): PowerUpPickup | null`

### `src/entities/player.ts`, `src/entities/weapons.ts`, `src/entities/orbitals.ts`
- `createPlayer(x: number, y: number, config: DifficultyConfig): PlayerState`
- `updatePlayer(player: PlayerState, input: InputState, camera: CameraState, island: PlatformIsland, config: DifficultyConfig, dt: number, events: GameEvent[]): Projectile[]`
- `applyPowerUp(player: PlayerState, pickup: PowerUpPickup): void` (handles weapon leveling, modifier combining, and orbital stacking)
- `updateOrbitals(player: PlayerState, enemies: EnemyState[], enemyProjectiles: Projectile[], dt: number, events: GameEvent[]): Projectile[]`

---

## Worktree 3 (`feat/enemies-bosses`): `src/enemies/**` & `src/bosses/**`

### `src/enemies/enforcer.ts`, `src/enemies/shooter.ts`, `src/enemies/spawner.ts`
- `updateEnforcers(enemies: EnemyState[], player: PlayerState, grid: SpatialGrid<EnemyState>, island: PlatformIsland, config: DifficultyConfig, dt: number): void`
- `updateRangedEnemies(enemies: EnemyState[], player: PlayerState, island: PlatformIsland, config: DifficultyConfig, dt: number, events: GameEvent[]): Projectile[]`
- `spawnHordeWave(island: PlatformIsland, currentEnemies: EnemyState[], config: DifficultyConfig, sectorIndex: number): EnemyState[]`

### `src/bosses/maximilian.ts`, `src/bosses/recogniser.ts`, `src/bosses/evilOtto.ts`
- `createMaximilian(x: number, y: number): BossState`
- `updateMaximilian(boss: BossState, player: PlayerState, island: PlatformIsland, projectiles: Projectile[], dt: number, events: GameEvent[]): void` (blades shred projectiles, crates, and player)
- `createRecogniser(x: number, y: number): BossState`
- `updateRecogniser(boss: BossState, player: PlayerState, dt: number, events: GameEvent[]): Projectile[]` (destructible legs unlock head vulnerability; sky-slam shadow + sky-bombs + homing drones + bullet patterns)
- `damageBossPart(boss: BossState, hitX: number, hitY: number, damage: number, events: GameEvent[]): boolean`
- `createEvilOtto(x: number, y: number, sectorIndex: number): BossState`
- `updateEvilOtto(boss: BossState, player: PlayerState, dt: number, events: GameEvent[]): Projectile[]` (Sinistar-style taunt during reconstruction + Mega Man-style variant attacks)
